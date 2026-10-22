// Builds a course index from per-video cues. Shared by the extension (Panopto indexing) and
// the Node demo builder, so both produce identical structures.

import { buildWindows } from './windows.js';
import { buildBM25 } from './bm25.js';
import { topicBoundaries } from './segment.js';
import { dedupeCues } from './captions.js';
import { CONFIG } from './config.js';

// videos: [{id, title, kind, url, duration, cues: [{start,end,text}] | null, captionStatus?, error?}]
// embedPassages(texts) -> Float32Array[] (normalised). Optional: without it the index is keyword-only.
export async function buildCourseIndex(meta, videos, { embedPassages, dim = 384, onProgress, config = CONFIG, batch = 16 } = {}) {
  const outVideos = [];
  const windows = [];
  videos.forEach((v) => {
    const cues = v.cues ? dedupeCues(v.cues) : [];
    const status = v.captionStatus && v.captionStatus !== 'indexed' ? v.captionStatus : cues.length ? 'indexed' : 'no_captions';
    const { cues: _drop, ...rest } = v;
    const vi = outVideos.length;
    outVideos.push({ ...rest, captionStatus: status });
    if (status !== 'indexed') return;
    for (const w of buildWindows(cues, { videoId: v.id, size: config.windowSize, stride: config.windowStride })) {
      windows.push({ v: vi, start: w.start, end: w.end, text: w.text });
    }
  });

  const bm25 = buildBM25(windows.map((w) => w.text));

  let vectors = null;
  if (embedPassages && windows.length) {
    vectors = new Float32Array(windows.length * dim);
    for (let i = 0; i < windows.length; i += batch) {
      const chunk = windows.slice(i, i + batch).map((w) => w.text);
      const embs = await embedPassages(chunk);
      embs.forEach((e, j) => vectors.set(e, (i + j) * dim));
      onProgress?.({ stage: 'embedding', done: Math.min(i + batch, windows.length), total: windows.length });
    }
  }

  const boundaries = {};
  if (vectors) {
    const byVideo = new Map();
    windows.forEach((w, i) => {
      if (!byVideo.has(w.v)) byVideo.set(w.v, []);
      byVideo.get(w.v).push(i);
    });
    for (const [vi, rows] of byVideo) {
      boundaries[vi] = topicBoundaries(rows.map((r) => windows[r]), rows, vectors, dim);
    }
  }

  return { ...meta, builtAt: new Date().toISOString(), videos: outVideos, windows, bm25, vectors, dim, boundaries };
}
