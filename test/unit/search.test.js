import { describe, it, expect } from 'vitest';
import { buildCourseIndex } from '../../src/core/indexer.js';
import { search, coverage } from '../../src/core/search.js';
import { configFor } from '../../src/core/config.js';
import { fakeEmbedder, fixtureVideos } from '../fixtures/fake.js';

// Tiny fixture corpus: BM25 scores are small, so the keyword-only floor is lowered accordingly.
const config = { ...configFor('e5-small'), tauV: 0.6, delta: 0.1, tauStrong: 0.9, kwMinScore: 0.5 };
const emb = fakeEmbedder();

async function index(videos = fixtureVideos()) {
  return buildCourseIndex({ courseId: 'c', title: 'Fixture', model: { key: 'fake' } }, videos, { embedPassages: emb.embedPassages, dim: emb.dim, config });
}

describe('search', () => {
  it('finds an exact-wording explanation with timestamp and link', async () => {
    const ix = await index();
    const r = await search(ix, 'master method', { embedQuery: emb.embedQuery, config });
    expect(r.status).toBe('results');
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.length).toBeLessThanOrEqual(3);
    const top = r.results[0];
    expect(top.title).toBe('Recurrences');
    expect(top.url).toMatch(/youtube\.com\/watch\?v=rec&t=\d+s/);
    expect(top.time).toMatch(/^\d+:\d\d$/);
    expect(['Strong match', 'Possible match']).toContain(top.strength);
  });

  it('finds paraphrased and Chinese queries through embeddings', async () => {
    const ix = await index();
    const zh = await search(ix, '主定理怎么用', { embedQuery: emb.embedQuery, config });
    expect(zh.status).toBe('results');
    expect(zh.results[0].title).toBe('Recurrences');
    const para = await search(ix, 'shortcut for solving recurrences', { embedQuery: emb.embedQuery, config });
    expect(para.results[0].title).toBe('Recurrences');
  });

  it('returns not_found without timestamps for an uncovered topic', async () => {
    const ix = await index();
    const r = await search(ix, 'photosynthesis in plants', { embedQuery: emb.embedQuery, config });
    expect(r.status).toBe('not_found');
    expect(r.results).toEqual([]);
  });

  it('refuses assessment requests and at most links related explanations', async () => {
    const ix = await index();
    const r = await search(ix, 'solve question 2 of assignment 1 using the master method', { embedQuery: emb.embedQuery, config });
    expect(r.status).toBe('refused');
    expect(r.results).toEqual([]);
    expect(r.notice).toMatch(/does not solve/);
    expect(r.related.length).toBeLessThanOrEqual(3);
    expect(r.related[0]?.title).toBe('Recurrences');
  });

  it('falls back to keyword-only search when the model fails, with a visible flag', async () => {
    const ix = await index();
    const broken = async () => {
      throw new Error('model unavailable');
    };
    const r = await search(ix, 'master method', { embedQuery: broken, config });
    expect(r.status).toBe('results');
    expect(r.keywordOnly).toBe(true);
    expect(r.degraded).toBe(true);
    expect(r.results[0].title).toBe('Recurrences');
  });

  it('works with an index built without vectors (model never loaded)', async () => {
    const ix = await buildCourseIndex({ courseId: 'c' }, fixtureVideos(), { config });
    expect(ix.vectors).toBeNull();
    const r = await search(ix, 'hash collisions chaining', { config });
    expect(r.keywordOnly).toBe(true);
    expect(r.results[0].title).toBe('Hashing');
  });

  it('distinguishes a folder with no captioned videos from "not found"', async () => {
    const ix = await index([
      { id: 'a', title: 'A', kind: 'youtube', url: 'https://www.youtube.com/watch?v=a', cues: [] },
      { id: 'b', title: 'B', kind: 'youtube', url: 'https://www.youtube.com/watch?v=b', cues: null, captionStatus: 'no_captions' },
    ]);
    const r = await search(ix, 'master method', { embedQuery: emb.embedQuery, config });
    expect(r.status).toBe('no_index');
    expect(r.coverage).toMatchObject({ indexed: 0, total: 2 });
  });

  it('reports coverage and excluded videos', async () => {
    const vids = fixtureVideos();
    vids.push({ id: 'x', title: 'Uncaptioned guest talk', kind: 'youtube', url: 'https://www.youtube.com/watch?v=x', cues: null, captionStatus: 'no_captions' });
    const ix = await index(vids);
    const c = coverage(ix);
    expect(c).toMatchObject({ indexed: 3, total: 4 });
    expect(c.excluded).toEqual([{ title: 'Uncaptioned guest talk', reason: 'no_captions', detail: null }]);
  });

  it('keeps results from multiple short videos distinct with correct titles', async () => {
    const shorts = ['hash', 'sort', 'rec'].map((k, i) => ({
      id: `s${i}`,
      title: `Short ${k}`,
      kind: 'youtube',
      url: `https://www.youtube.com/watch?v=s${i}`,
      cues: fixtureVideos()[[2, 1, 0][i]].cues.slice(0, 6),
    }));
    const ix = await index(shorts);
    const r = await search(ix, 'quicksort pivot partition', { embedQuery: emb.embedQuery, config });
    expect(r.results[0].title).toBe('Short sort');
    expect(r.results[0].url).toContain('v=s1');
  });

  it('handles empty queries', async () => {
    const r = await search(await index(), '   ', { embedQuery: emb.embedQuery, config });
    expect(r.status).toBe('empty');
  });
});
