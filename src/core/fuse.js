// Reciprocal-rank fusion: score(d) = sum over rankings of 1 / (k + rank), rank starting at 1.

export function rrf(rankings, k = 60) {
  const scores = new Map();
  for (const list of rankings) {
    list.forEach(({ doc }, i) => scores.set(doc, (scores.get(doc) ?? 0) + 1 / (k + i + 1)));
  }
  return [...scores]
    .map(([doc, score]) => ({ doc, score }))
    .sort((a, b) => b.score - a.score || a.doc - b.doc);
}
