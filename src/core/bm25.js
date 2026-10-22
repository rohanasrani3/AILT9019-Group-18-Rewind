// BM25 keyword index. Plain JSON-serialisable so it can live in IndexedDB or a bundled file.
import { tokenize } from './tokenize.js';

export function buildBM25(texts, { k1 = 1.2, b = 0.75 } = {}) {
  const postings = Object.create(null); // term -> flat [docIdx, tf, docIdx, tf, ...]
  const lengths = new Array(texts.length);
  let total = 0;
  texts.forEach((text, d) => {
    const toks = tokenize(text);
    lengths[d] = toks.length;
    total += toks.length;
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, n] of tf) (postings[t] ??= []).push(d, n);
  });
  return { k1, b, n: texts.length, avgdl: texts.length ? total / texts.length : 0, lengths, postings };
}

export function searchBM25(index, query, k = 50) {
  const { k1, b, n, avgdl, lengths, postings } = index;
  const scores = new Map();
  const terms = [...new Set(tokenize(query))];
  for (const t of terms) {
    const p = postings[t];
    if (!p) continue;
    const df = p.length / 2;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    for (let i = 0; i < p.length; i += 2) {
      const d = p[i];
      const tf = p[i + 1];
      const norm = tf + k1 * (1 - b + (b * lengths[d]) / (avgdl || 1));
      scores.set(d, (scores.get(d) ?? 0) + (idf * (tf * (k1 + 1))) / norm);
    }
  }
  return [...scores]
    .map(([doc, score]) => ({ doc, score }))
    .sort((x, y) => y.score - x.score || x.doc - y.doc)
    .slice(0, k);
}

// Fraction of distinct query terms present in the document; used as a "strong keyword match" signal.
export function termCoverage(index, query, doc) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return 0;
  let hit = 0;
  for (const t of terms) {
    const p = index.postings[t];
    if (!p) continue;
    for (let i = 0; i < p.length; i += 2) if (p[i] === doc) { hit++; break; }
  }
  return hit / terms.length;
}
