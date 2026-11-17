import { describe, it, expect } from 'vitest';
import { exportIndex, importIndex, exportFileName } from '../../src/core/exchange.js';
import { buildTimeline } from '../../src/core/timeline.js';
import { buildCourseIndex } from '../../src/core/indexer.js';
import { search } from '../../src/core/search.js';
import { configFor } from '../../src/core/config.js';
import { fakeEmbedder, fixtureVideos } from '../fixtures/fake.js';

const emb = fakeEmbedder();
const config = { ...configFor('e5-small'), tauV: 0.6, delta: 0.1, kwMinScore: 0.5 };
const build = (meta = {}) => buildCourseIndex({ courseId: 'c1', title: 'Fixture course', source: 'demo', license: 'CC BY-NC-SA 4.0', ...meta }, fixtureVideos(), { embedPassages: emb.embedPassages, dim: emb.dim, config });

describe('index export / import', () => {
  it('round-trips windows, vectors and search behaviour', async () => {
    const ix = await build();
    const file = JSON.parse(JSON.stringify(exportIndex(ix)));
    expect(file.format).toBe('rewind-index');
    const back = importIndex(file);
    expect(Array.from(back.vectors)).toEqual(Array.from(ix.vectors));
    expect(back.windows).toEqual(ix.windows);
    const a = await search(ix, 'master method', { embedQuery: emb.embedQuery, config });
    const b = await search(back, 'master method', { embedQuery: emb.embedQuery, config });
    expect(b.results).toEqual(a.results);
  });

  it('marks restricted-course exports and names files safely', async () => {
    const ix = await build({ source: 'panopto', title: 'COMP2119 / Algorithms: 2026' });
    expect(exportIndex(ix).notice).toMatch(/Do not share/);
    expect(exportFileName(ix)).toBe('COMP2119-Algorithms-2026.rewind.json');
  });

  it('rejects files that are not valid Rewind indexes', async () => {
    const good = JSON.parse(JSON.stringify(exportIndex(await build())));
    expect(() => importIndex({})).toThrow(/Not a Rewind index/);
    expect(() => importIndex({ ...good, version: 99 })).toThrow(/version/);
    const badWindow = structuredClone(good);
    badWindow.index.windows[0].v = 99;
    expect(() => importIndex(badWindow)).toThrow(/malformed caption window/);
    const badLink = structuredClone(good);
    badLink.index.videos[0].url = 'javascript:alert(1)';
    expect(() => importIndex(badLink)).toThrow(/non-https/);
    const badVectors = structuredClone(good);
    badVectors.vectors = btoa('abc');
    expect(() => importIndex(badVectors)).toThrow();
  });
});

describe('concept timeline', () => {
  it('splits each captioned video into ordered segments with links and terms', async () => {
    const ix = await build();
    ix.boundaries = { 0: [0, 60], 1: [0], 2: [0, 40] };
    const tl = buildTimeline(ix, { minSegmentSeconds: 10 });
    expect(tl).toHaveLength(3);
    for (const v of tl) {
      expect(v.segments.length).toBeGreaterThan(0);
      v.segments.forEach((s, i) => {
        expect(s.end).toBeGreaterThan(s.start);
        if (i) expect(s.start).toBeGreaterThanOrEqual(v.segments[i - 1].end);
        expect(s.url).toMatch(/&t=\d+s$/);
      });
    }
    expect(tl[0].segments.map((s) => s.start)).toEqual([0, 60]);
    expect(tl[0].segments[1].terms).toContain('master');
  });

  it('skips uncaptioned videos and works without boundaries', async () => {
    const vids = fixtureVideos();
    vids.push({ id: 'x', title: 'No captions', kind: 'youtube', url: 'https://www.youtube.com/watch?v=x', cues: null, captionStatus: 'no_captions' });
    const ix = await buildCourseIndex({ courseId: 'c' }, vids, { config });
    const tl = buildTimeline(ix);
    expect(tl[3].segments).toEqual([]);
    expect(tl[0].segments).toHaveLength(1);
  });
});
