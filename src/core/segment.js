// TextTiling-style topic boundaries over consecutive window embeddings of one video.
// Gap g sits between window g and g+1. Its similarity compares the mean vector of the `block`
// windows before it with the `block` windows after it. Depth = how far the similarity dips below
// the nearest peaks on each side; deep dips are topic shifts.

function meanRows(matrix, dim, rows, from, to) {
  const v = new Float32Array(dim);
  for (let k = from; k < to; k++) {
    const off = rows[k] * dim;
    for (let i = 0; i < dim; i++) v[i] += matrix[off + i];
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

// windows: [{start, ...}] for ONE video in time order; rows: their row indices in `matrix`.
// Returns boundary times in seconds, always including the first window's start.
export function topicBoundaries(windows, rows, matrix, dim, { block = 4, minGapSeconds = 90 } = {}) {
  if (!windows.length) return [];
  const n = windows.length;
  const out = [windows[0].start];
  if (n < 2 * block + 1) return out;

  const sims = [];
  for (let g = 0; g < n - 1; g++) {
    const a = meanRows(matrix, dim, rows, Math.max(0, g - block + 1), g + 1);
    const b = meanRows(matrix, dim, rows, g + 1, Math.min(n, g + 1 + block));
    let s = 0;
    for (let i = 0; i < dim; i++) s += a[i] * b[i];
    sims.push(s);
  }

  const depth = sims.map((s, g) => {
    let l = s;
    for (let i = g - 1; i >= 0 && sims[i] >= l; i--) l = sims[i];
    let r = s;
    for (let i = g + 1; i < sims.length && sims[i] >= r; i++) r = sims[i];
    return l - s + (r - s);
  });

  const mean = depth.reduce((a, b) => a + b, 0) / depth.length;
  const sd = Math.sqrt(depth.reduce((a, d) => a + (d - mean) ** 2, 0) / depth.length);
  const cutoff = mean + sd / 2;

  // Local depth maxima above the cutoff, strongest first, kept at least minGapSeconds apart.
  const cands = depth
    .map((d, g) => ({ d, g }))
    .filter(({ d, g }) => d > cutoff && d >= (depth[g - 1] ?? -Infinity) && d >= (depth[g + 1] ?? -Infinity))
    .sort((x, y) => y.d - x.d);
  const chosen = [];
  for (const { g } of cands) {
    const t = windows[g + 1].start;
    if (t - out[0] >= minGapSeconds && chosen.every((c) => Math.abs(c - t) >= minGapSeconds)) chosen.push(t);
  }
  return out.concat(chosen.sort((a, b) => a - b));
}
