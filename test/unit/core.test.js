import { describe, it, expect } from 'vitest';
import { parseCaptions, parseSRT, parseVTT, parsePanoptoJSON, parseTimestamp, dedupeCues } from '../../src/core/captions.js';
import { buildWindows } from '../../src/core/windows.js';
import { tokenize, stem } from '../../src/core/tokenize.js';
import { buildBM25, searchBM25, termCoverage } from '../../src/core/bm25.js';
import { rrf } from '../../src/core/fuse.js';
import { snapStart } from '../../src/core/snap.js';
import { topicBoundaries } from '../../src/core/segment.js';
import { searchVectors, packVectors } from '../../src/core/vector.js';
import { linkAt, formatTime } from '../../src/core/links.js';
import { toStored, fromStored } from '../../src/core/serialize.js';

describe('captions', () => {
  it('parses timestamps in both SRT and VTT forms', () => {
    expect(parseTimestamp('00:01:02,500')).toBe(62.5);
    expect(parseTimestamp('01:10:43.552')).toBeCloseTo(4243.552);
    expect(parseTimestamp('02:03.4')).toBeCloseTo(123.4);
  });

  it('parses SRT and strips markup', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\n<i>Hello</i> &amp; welcome\n\n2\n00:00:03,000 --> 00:00:05,000\n>> second line\n';
    expect(parseSRT(srt)).toEqual([
      { start: 1, end: 3, text: 'Hello & welcome' },
      { start: 3, end: 5, text: 'second line' },
    ]);
  });

  it('parses VTT with header, NOTE block and cue settings', () => {
    const vtt = 'WEBVTT\n\nNOTE generated\n\n00:00:10.000 --> 00:00:13.000 align:start\nMy name is Erik.\nCall me Erik.\n\n00:00:13.000 --> 00:00:16.000\n<v Erik>Lecture 2.</v>\n';
    expect(parseVTT(vtt)).toEqual([
      { start: 10, end: 13, text: 'My name is Erik. Call me Erik.' },
      { start: 13, end: 16, text: 'Lecture 2.' },
    ]);
  });

  it('parses Panopto caption JSON and auto-detects formats', () => {
    const items = [{ Caption: 'first', Time: 5, CaptionDuration: 2 }, { Caption: '', Time: 7 }, { Caption: 'third', Time: 9.5 }];
    expect(parsePanoptoJSON(items)).toEqual([
      { start: 5, end: 7, text: 'first' },
      { start: 9.5, end: 9.5, text: 'third' },
    ]);
    expect(parseCaptions(JSON.stringify(items))).toHaveLength(2);
    expect(parseCaptions('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nx')).toHaveLength(1);
  });

  it('returns no cues for empty or garbage input', () => {
    expect(parseCaptions('')).toEqual([]);
    expect(parseCaptions('   \n ')).toEqual([]);
    expect(parseCaptions(null)).toEqual([]);
    expect(parseCaptions('not captions at all')).toEqual([]);
    expect(parseCaptions('{broken json')).toEqual([]);
  });

  it('collapses repeated rolling captions', () => {
    expect(dedupeCues([{ start: 0, end: 2, text: 'a' }, { start: 2, end: 4, text: 'a' }, { start: 4, end: 5, text: 'b' }])).toEqual([
      { start: 0, end: 4, text: 'a' },
      { start: 4, end: 5, text: 'b' },
    ]);
  });
});

describe('windows', () => {
  const cues = Array.from({ length: 40 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: `c${i}` }));

  it('builds overlapping 45 s windows every 15 s', () => {
    const w = buildWindows(cues, { videoId: 'v' });
    expect(w[0]).toMatchObject({ videoId: 'v', start: 0, end: 45 });
    expect(w[1].start).toBe(15);
    expect(w[0].text.split(' ')).toHaveLength(9);
    // Each cue appears in about three windows.
    const count = w.filter((x) => x.text.split(' ').includes('c10')).length;
    expect(count).toBe(3);
    expect(w[w.length - 1].end).toBe(200);
  });

  it('skips empty stretches and handles no cues', () => {
    expect(buildWindows([], { videoId: 'v' })).toEqual([]);
    const gap = [{ start: 0, end: 5, text: 'a' }, { start: 300, end: 305, text: 'b' }];
    const w = buildWindows(gap, { videoId: 'v' });
    expect(w.every((x) => x.text.length > 0)).toBe(true);
    // The last window that reaches the end of the captions stops the scan.
    expect(w.map((x) => x.text)).toEqual(['a', 'b']);
  });
});

describe('tokenize', () => {
  it('stems English and drops stopwords', () => {
    expect(tokenize('The sorting algorithms are running')).toEqual(['sort', 'algorithm', 'run']);
    expect(stem('hashing')).toBe('hash');
    expect(stem('properties')).toBe('property');
    expect(stem('analysis')).toBe('analysis');
  });

  it('produces CJK unigrams and bigrams, also in mixed text', () => {
    expect(tokenize('主定理')).toEqual(['主', '主定', '定', '定理', '理']);
    const mixed = tokenize('master theorem 怎么用');
    expect(mixed).toContain('master');
    expect(mixed).toContain('theorem');
    expect(mixed).toContain('怎么');
  });
});

describe('bm25', () => {
  const docs = ['the master method solves recurrences', 'quicksort partitions around a pivot', 'hash tables resolve collisions by chaining', 'master of none'];
  const idx = buildBM25(docs);

  it('ranks the matching document first', () => {
    expect(searchBM25(idx, 'master method')[0].doc).toBe(0);
    expect(searchBM25(idx, 'pivot partition')[0].doc).toBe(1);
    expect(searchBM25(idx, 'photosynthesis')).toEqual([]);
  });

  it('survives a JSON round trip', () => {
    const copy = JSON.parse(JSON.stringify(idx));
    expect(searchBM25(copy, 'chaining collisions')).toEqual(searchBM25(idx, 'chaining collisions'));
  });

  it('reports term coverage', () => {
    expect(termCoverage(idx, 'master method', 0)).toBe(1);
    expect(termCoverage(idx, 'master method', 3)).toBe(0.5);
  });
});

describe('fusion, snapping, vectors', () => {
  it('reciprocal-rank fusion rewards agreement', () => {
    const fused = rrf([[{ doc: 1 }, { doc: 2 }, { doc: 3 }], [{ doc: 2 }, { doc: 3 }, { doc: 1 }]], 60);
    expect(fused[0].doc).toBe(2);
    expect(fused.map((x) => x.doc).sort()).toEqual([1, 2, 3]);
  });

  it('snaps to the nearest preceding boundary only within maxSnap', () => {
    expect(snapStart(100, [0, 85, 95], 20)).toBe(95);
    expect(snapStart(100, [0, 70], 20)).toBe(100);
    expect(snapStart(100, [0, 105], 20)).toBe(100);
    expect(snapStart(100, undefined, 20)).toBe(100);
  });

  it('cosine top-k over packed vectors', () => {
    const m = packVectors([new Float32Array([1, 0]), new Float32Array([0, 1]), new Float32Array([Math.SQRT1_2, Math.SQRT1_2])], 2);
    const r = searchVectors(m, 2, new Float32Array([1, 0]), 2);
    expect(r.map((x) => x.doc)).toEqual([0, 2]);
  });
});

describe('topic boundaries', () => {
  it('finds the shift between two clearly different topics', () => {
    const dim = 4;
    const n = 24;
    const vecs = Array.from({ length: n }, (_, i) => (i < 12 ? new Float32Array([1, 0.05 * (i % 3), 0, 0]) : new Float32Array([0, 0, 1, 0.05 * (i % 3)])).map((x, _, a) => x / Math.hypot(...a)));
    const m = packVectors(vecs, dim);
    const windows = Array.from({ length: n }, (_, i) => ({ start: i * 15 }));
    const b = topicBoundaries(windows, windows.map((_, i) => i), m, dim, { block: 3, minGapSeconds: 60 });
    expect(b[0]).toBe(0);
    expect(b).toContain(12 * 15);
  });

  it('returns only the start for very short videos', () => {
    const m = packVectors([new Float32Array([1, 0])], 2);
    expect(topicBoundaries([{ start: 7 }], [0], m, 2)).toEqual([7]);
  });
});

describe('links and serialisation', () => {
  it('builds deep links at a second', () => {
    expect(linkAt({ kind: 'youtube', id: 'abc' }, 75.9)).toBe('https://www.youtube.com/watch?v=abc&t=75s');
    expect(linkAt({ kind: 'panopto', url: 'https://hku.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=123' }, 61)).toBe(
      'https://hku.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=123&start=61'
    );
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(65)).toBe('1:05');
  });

  it('round-trips an index through storage form', () => {
    const index = { dim: 2, windows: [{ v: 0, start: 0, end: 45, text: 'master method' }], videos: [], vectors: new Float32Array([1, 0]), bm25: {} };
    const { json, vectors } = toStored(index);
    expect(json.vectors).toBeUndefined();
    const back = fromStored(JSON.parse(JSON.stringify(json)), vectors);
    expect(Array.from(back.vectors)).toEqual([1, 0]);
    expect(searchBM25(back.bm25, 'master')[0].doc).toBe(0);
    expect(() => fromStored(json, new Float32Array([1, 0, 0]).buffer)).toThrow(/does not match/);
  });
});
