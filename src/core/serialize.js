// Index <-> storable form. The keyword index is rebuilt on load (fast, and keeps files small);
// vectors travel as a raw little-endian Float32 buffer.
import { buildBM25 } from './bm25.js';

export function toStored(index) {
  const { bm25: _bm25, vectors, ...json } = index;
  return { json, vectors: vectors ? vectors.buffer.slice(vectors.byteOffset, vectors.byteOffset + vectors.byteLength) : null };
}

export function fromStored(json, vectorsBuffer) {
  const vectors = vectorsBuffer ? new Float32Array(vectorsBuffer) : null;
  if (vectors && vectors.length !== json.windows.length * json.dim) {
    throw new Error(`Vector file does not match index (${vectors.length} values for ${json.windows.length} windows)`);
  }
  return { ...json, vectors, bm25: buildBM25(json.windows.map((w) => w.text)) };
}
