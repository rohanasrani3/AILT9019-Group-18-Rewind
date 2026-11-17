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

// `queries` is the student's question first, then any optional rewrites. With a single query
// this is exactly the original v0.1 ranking (RRF over one list keeps its order).
async function rank(index, queries, { embedQuery, config, keywordOnly }) {
  const c = config;
  const kws = queries.map((q) => searchBM25(index.bm25, q, c.topK));
  let qvs = null;
  let degraded = false;
  if (!keywordOnly && index.vectors && embedQuery) {
    try {
      qvs = [];
      for (const q of queries) qvs.push(await embedQuery(q));
    } catch (err) {
      qvs = null;
      degraded = true;
    }
  }
  const useVectors = qvs != null;
  const maxOver = (f) => Math.max(...queries.map(f));

  let ordered;
  if (useVectors) {
    const lists = [];
    queries.forEach((_, i) => lists.push(kws[i], searchVectors(index.vectors, index.dim, qvs[i], c.topK)));
    ordered = rrf(lists, c.rrfK).map(({ doc, score }) => {
      const cos = maxOver((_, i) => cosineAt(index.vectors, index.dim, qvs[i], doc));
      const cov = maxOver((q) => termCoverage(index.bm25, q, doc));
      return { doc, fused: score, cos, cov };
    });
    ordered = ordered.filter((r) => r.cos >= c.tauV || (r.cov >= c.kwStrongCoverage && r.cos >= c.tauV - c.delta));
  } else {
    const bm25 = new Map();
    for (const list of kws) for (const { doc, score } of list) bm25.set(doc, Math.max(bm25.get(doc) ?? -Infinity, score));
    ordered = rrf(kws, c.rrfK)
      .map(({ doc, score }) => ({ doc, fused: score, bm25: bm25.get(doc), cos: null, cov: maxOver((q) => termCoverage(index.bm25, q, doc)) }))
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

// Clean up optional rewrites: short, distinct, not a copy of the question.
export function cleanRewrites(list, original) {
  const seen = new Set([original.toLowerCase()]);
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const t = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= 2) break;
  }
  return out;
}

// `rewrite(q)` (optional) returns extra search phrasings from an external LLM. It is only called
// after the assessment check passes, the original question is always searched too, and any
// failure leaves the local result unchanged.
export async function search(index, query, { embedQuery, config = configFor(index?.model?.key ?? DEFAULT_MODEL), keywordOnly = false, rewrite = null } = {}) {
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
      const r = await rank(index, [guard.topic], { embedQuery, config, keywordOnly });
      related = r.results;
      keywordOnlyFlag = r.keywordOnly;
    }
    return done({ status: 'refused', notice: guard.notice, reason: guard.reason, results: [], related, keywordOnly: keywordOnlyFlag });
  }

  let rewrites = [];
  let llm = null;
  if (rewrite) {
    const t1 = now();
    try {
      rewrites = cleanRewrites(await rewrite(q), q);
      llm = { used: rewrites.length > 0, ms: now() - t1, error: null };
    } catch (err) {
      llm = { used: false, ms: now() - t1, error: String(err?.message ?? err) };
    }
  }
  const r = await rank(index, [q, ...rewrites], { embedQuery, config, keywordOnly });
  return done({ status: r.results.length ? 'results' : 'not_found', ...r, rewrites, llm });
}
