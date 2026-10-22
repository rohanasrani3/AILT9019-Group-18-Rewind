// Fails (exit 1) if any practice question is a near-duplicate of a test question.
// Near-duplicate: embedding cosine above a model-specific cutoff, or token Jaccard > 0.6.
import { tokenize } from '../src/core/tokenize.js';
import { DEFAULT_MODEL } from '../src/core/config.js';
import { modelArg } from '../scripts/node-embedder.mjs';
import { loadQuestionFile, cachedEmbedder } from './common.mjs';

const modelKey = modelArg() ?? DEFAULT_MODEL;
const COSINE = { 'e5-small': 0.93, 'minilm-l12': 0.9 }[modelKey] ?? 0.9;
const JACCARD = 0.6;

const test = (await loadQuestionFile('test')).questions;
const practice = (await loadQuestionFile('practice')).questions;
const emb = await cachedEmbedder(modelKey);

const jaccard = (a, b) => {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  const inter = [...A].filter((x) => B.has(x)).length;
  return A.size + B.size ? inter / (A.size + B.size - inter) : 0;
};
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

let problems = 0;
let maxCos = { v: -1 };
for (const p of practice) {
  const pv = await emb.embedQuery(p.query);
  for (const t of test) {
    const c = cos(pv, await emb.embedQuery(t.query));
    const j = jaccard(p.query, t.query);
    if (c > maxCos.v) maxCos = { v: c, p: p.id, t: t.id };
    if (c > COSINE || j > JACCARD) {
      problems++;
      console.log(`NEAR-DUPLICATE ${p.id} ~ ${t.id}  cos=${c.toFixed(3)} jaccard=${j.toFixed(2)}\n   "${p.query}"\n   "${t.query}"`);
    }
  }
}
// Shared lectures are fine; shared explanation intervals are flagged for the annotators to review.
for (const p of practice)
  for (const iv of p.intervals ?? [])
    for (const t of test)
      for (const tv of t.intervals ?? [])
        if (iv.lecture === tv.lecture && iv.start === tv.start) console.log(`note: ${p.id} and ${t.id} share an interval start (L${iv.lecture} ${iv.start})`);

console.log(`Closest pair: ${maxCos.p} ~ ${maxCos.t} (cos ${maxCos.v.toFixed(3)}; cutoff ${COSINE})`);
console.log(problems ? `${problems} near-duplicate pair(s) — fix before freezing.` : 'OK: no near-duplicates across practice and test sets.');
process.exit(problems ? 1 : 0);
