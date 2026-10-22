// Brute-force cosine search over L2-normalised vectors packed into one Float32Array (n * dim).

export function dot(a, aOff, b, bOff, dim) {
  let s = 0;
  for (let i = 0; i < dim; i++) s += a[aOff + i] * b[bOff + i];
  return s;
}

export function searchVectors(matrix, dim, query, k = 50) {
  const n = matrix.length / dim;
  const scores = new Float32Array(n);
  for (let d = 0; d < n; d++) scores[d] = dot(matrix, d * dim, query, 0, dim);
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((x, y) => scores[y] - scores[x]);
  return idx.slice(0, k).map((doc) => ({ doc, score: scores[doc] }));
}

export function cosineAt(matrix, dim, query, doc) {
  return dot(matrix, doc * dim, query, 0, dim);
}

export function packVectors(list, dim) {
  const m = new Float32Array(list.length * dim);
  list.forEach((v, i) => m.set(v, i * dim));
  return m;
}
