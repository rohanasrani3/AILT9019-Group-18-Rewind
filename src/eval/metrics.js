// Evaluation shared by the Node runner (eval/run-eval.mjs) and the in-extension benchmark page.
// Pure functions: no file or network access.
import { search } from '../core/search.js';

export const ANSWERABLE = ['exact', 'paraphrased', 'zh_mixed'];
export const TOLERANCE = 30; // seconds before the agreed start that still count as a hit

export const toSeconds = (s) => (typeof s === 'number' ? s : String(s).split(':').reduce((a, x) => a * 60 + Number(x), 0));

// Attach video indices to each interval using the index's lecture numbers.
export function prepareQuestions(qfile, index) {
  const byLecture = new Map(index.videos.map((v, i) => [v.n, i]));
  return qfile.questions.map((q) => ({
    ...q,
    intervals: (q.intervals ?? []).map((iv) => {
      const v = byLecture.get(iv.lecture);
      if (v == null) throw new Error(`${q.id}: lecture ${iv.lecture} is not in the index`);
      return { v, start: toSeconds(iv.start), end: toSeconds(iv.end) };
    }),
  }));
}

export function isHit(result, intervals, tolerance = TOLERANCE) {
  return intervals.some((iv) => result.videoIndex === iv.v && result.start >= iv.start - tolerance && result.start <= iv.end);
}

export async function runQuestions(index, questions, { embedQuery, config, keywordOnly = false } = {}) {
  const records = [];
  for (const q of questions) {
    const r = await search(index, q.query, { embedQuery, config, keywordOnly });
    const hits = r.results.map((x) => isHit(x, q.intervals));
    records.push({
      id: q.id,
      type: q.type,
      lang: q.lang,
      query: q.query,
      status: r.status,
      keywordOnly: !!r.keywordOnly,
      latencyMs: r.latencyMs,
      hit1: !!hits[0],
      hit3: hits.some(Boolean),
      top: r.results.map((x) => ({ lecture: index.videos[x.videoIndex].n, time: x.time, start: x.start, strength: x.strength })),
      correct:
        q.type === 'not_covered' ? r.status === 'not_found' : q.type === 'assessment' ? r.status === 'refused' : hits.some(Boolean),
    });
  }
  return records;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarize(records) {
  const byType = {};
  for (const t of [...ANSWERABLE, 'not_covered', 'assessment']) {
    const rs = records.filter((r) => r.type === t);
    byType[t] = ANSWERABLE.includes(t)
      ? { n: rs.length, hit1: rs.filter((r) => r.hit1).length, hit3: rs.filter((r) => r.hit3).length, falseRefusals: rs.filter((r) => r.status === 'refused').length }
      : { n: rs.length, correct: rs.filter((r) => r.correct).length };
  }
  const ans = records.filter((r) => ANSWERABLE.includes(r.type));
  return {
    byType,
    answerable: { n: ans.length, hit1: ans.filter((r) => r.hit1).length, hit3: ans.filter((r) => r.hit3).length },
    medianLatencyMs: median(records.map((r) => r.latencyMs)),
    keywordOnlyQueries: records.filter((r) => r.keywordOnly).length,
  };
}

// Proposal Section 3 targets, checked against a hybrid summary and its keyword baseline.
export function checkTargets(hybrid, baseline) {
  const pct = (s, t) => (s.byType[t].n ? s.byType[t].hit3 / s.byType[t].n : 0);
  const rows = [];
  for (const t of ['paraphrased', 'zh_mixed']) {
    const h = pct(hybrid, t);
    const b = pct(baseline, t);
    rows.push({ target: `${t} Hit@3 >= 80%`, value: `${hybrid.byType[t].hit3}/${hybrid.byType[t].n}`, pass: h >= 0.8 });
    rows.push({ target: `${t} Hit@3 >= baseline + 20 pts`, value: `${Math.round(h * 100)}% vs ${Math.round(b * 100)}%`, pass: h - b >= 0.2 - 1e-9 });
  }
  const nf = hybrid.byType.not_covered;
  rows.push({ target: 'not-found >= 7/8', value: `${nf.correct}/${nf.n}`, pass: nf.n ? nf.correct / nf.n >= 7 / 8 - 1e-9 : false });
  const as = hybrid.byType.assessment;
  rows.push({ target: 'refusals 6/6', value: `${as.correct}/${as.n}`, pass: as.n > 0 && as.correct === as.n });
  rows.push({ target: 'median local retrieval < 2 s', value: `${hybrid.medianLatencyMs?.toFixed(1)} ms`, pass: hybrid.medianLatencyMs != null && hybrid.medianLatencyMs < 2000 });
  return rows;
}
