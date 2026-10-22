// Search orchestration: assessment check -> keyword + embedding rankings -> RRF -> threshold ->
// de-duplicate -> snap to topic start -> up to three labelled results.
//
// `index` is a course index (see buildCourseIndex in indexer.js):
//   { videos: [{id, title, kind, url, captionStatus, ...}], windows: [{v, start, end, text}],
//     bm25, vectors: Float32Array|null, dim, boundaries: {[videoIdx]: number[]} }
// `embedQuery(text)` returns a normalised Float32Array, or throws when the model is unavailable.

import { searchBM25, termCoverage } from './bm25.js';
import { searchVectors, cosineAt } from './vector.js';
import { rrf } from './fuse.js';
import { snapStart } from './snap.js';
import { checkAssessment } from './guard.js';
import { linkAt, formatTime } from './links.js';
import { tokenize } from './tokenize.js';
import { configFor, DEFAULT_MODEL } from './config.js';

const now = () => (globalThis.performance ?? Date).now();

export function coverage(index) {
  const videos = index?.videos ?? [];
  const indexed = videos.filter((v) => v.captionStatus === 'indexed').length;
  const excluded = videos
    .filter((v) => v.captionStatus !== 'indexed')
    .map((v) => ({ title: v.title, reason: v.captionStatus, detail: v.error ?? null }));
  return { indexed, total: videos.length, excluded };
}

function excerpt(text, max = 320) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : max) + ' …';
}

async function rank(index, query, { embedQuery, config, keywordOnly }) {
  const c = config;
  const kw = searchBM25(index.bm25, query, c.topK);
  let qv = null;
  let degraded = false;
  if (!keywordOnly && index.vectors && embedQuery) {
    try {
      qv = await embedQuery(query);
    } catch (err) {
      degraded = true;
    }
  }
  const useVectors = qv != null;

  let ordered;
  if (useVectors) {
    const vec = searchVectors(index.vectors, index.dim, qv, c.topK);
    ordered = rrf([kw, vec], c.rrfK).map(({ doc, score }) => {
      const cos = cosineAt(index.vectors, index.dim, qv, doc);
      const cov = termCoverage(index.bm25, query, doc);
      return { doc, fused: score, cos, cov };
    });
    ordered = ordered.filter((r) => r.cos >= c.tauV || (r.cov >= c.kwStrongCoverage && r.cos >= c.tauV - c.delta));
  } else {
    ordered = kw
      .map(({ doc, score }) => ({ doc, fused: score, bm25: score, cos: null, cov: termCoverage(index.bm25, query, doc) }))
      .filter((r) => r.cov >= c.kwMinCoverage && r.bm25 >= c.kwMinScore);
  }

  const picked = [];
  for (const r of ordered) {
    const w = index.windows[r.doc];
    if (picked.some((p) => p.w.v === w.v && Math.abs(p.w.start - w.start) < c.dedupeSeconds)) continue;
    picked.push({ ...r, w });
    if (picked.length >= c.maxResults) break;
  }

  const results = picked.map(({ w, cos, cov }) => {
    const video = index.videos[w.v];
    const start = snapStart(w.start, index.boundaries?.[w.v], c.maxSnap);
    const strong = useVectors ? cos >= c.tauStrong || (cos >= c.tauV && cov >= c.kwStrongCoverage) : cov >= 0.9;
    return {
      videoIndex: w.v,
      videoId: video.id,
      title: video.title,
      start,
      windowStart: w.start,
      end: w.end,
      time: formatTime(start),
      url: linkAt(video, start),
      excerpt: excerpt(w.text),
      strength: strong ? 'Strong match' : 'Possible match',
      machineTranscribed: !!video.machineTranscribed,
    };
  });
  return { results, keywordOnly: !useVectors, degraded };
}

export async function search(index, query, { embedQuery, config = configFor(index?.model?.key ?? DEFAULT_MODEL), keywordOnly = false } = {}) {
  const t0 = now();
  const q = String(query ?? '').trim();
  const cov = coverage(index);
  const done = (r) => ({ ...r, query: q, coverage: cov, latencyMs: now() - t0 });

  if (!q) return done({ status: 'empty', results: [] });
  if (!index || cov.indexed === 0 || !index.windows?.length) return done({ status: 'no_index', results: [] });

  const guard = checkAssessment(q);
  if (guard.refuse) {
    // Decline, and at most link related explanations for the topic words left over.
    let related = [];
    let keywordOnlyFlag = keywordOnly || !index.vectors;
    if (tokenize(guard.topic).length >= 2) {
      const r = await rank(index, guard.topic, { embedQuery, config, keywordOnly });
      related = r.results;
      keywordOnlyFlag = r.keywordOnly;
    }
    return done({ status: 'refused', notice: guard.notice, reason: guard.reason, results: [], related, keywordOnly: keywordOnlyFlag });
  }

  const r = await rank(index, q, { embedQuery, config, keywordOnly });
  return done({ status: r.results.length ? 'results' : 'not_found', ...r });
}
