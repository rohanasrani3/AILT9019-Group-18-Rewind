// Retrieval settings. Defaults are starting points; `npm run eval:tune` writes TUNED below using
// the 15-question practice set only (never the frozen test set).

// The model the extension ships with by default (chosen on the practice set; see README).
export const DEFAULT_MODEL = 'minilm-l12';

export const DEFAULTS = {
  windowSize: 45, // seconds
  windowStride: 15,
  topK: 50, // candidates taken from each ranker before fusion
  rrfK: 60,
  kwStrongCoverage: 0.75, // share of query terms that must appear for a "strong keyword match"
  kwMinCoverage: 0.6, // keyword-only mode: minimum term coverage
  kwMinScore: 4, // keyword-only mode: minimum BM25 score
  dedupeSeconds: 60, // results in the same video closer than this collapse into one
  maxSnap: 20, // seconds; must stay below the 30 s evaluation tolerance
  maxResults: 3,
};

// Cosine scales differ a lot between models, so similarity thresholds are per model.
//   tauV: minimum query–window cosine for an embedding-backed result
//   delta: a strong keyword match may pass with cosine >= tauV - delta
//   tauStrong: cosine at or above which a result is labelled "Strong match"
export const MODEL_DEFAULTS = {
  'e5-small': { tauV: 0.82, delta: 0.03, tauStrong: 0.86 },
  'minilm-l12': { tauV: 0.5, delta: 0.1, tauStrong: 0.62 },
};

// --- TUNED (written by eval/tune.mjs) ---
// Tuned on eval/questions.practice.json, 2026-10-22.
export const TUNED = {
  "e5-small": {
    "tauV": 0.865,
    "delta": 0,
    "rrfK": 20,
    "maxSnap": 0,
    "tauStrong": 0.905,
    "kwMinCoverage": 0.4,
    "kwMinScore": 0
  },
  "minilm-l12": {
    "tauV": 0.4,
    "delta": 0,
    "rrfK": 20,
    "maxSnap": 0,
    "tauStrong": 0.52,
    "kwMinCoverage": 0.4,
    "kwMinScore": 0
  }
};
// --- END TUNED ---

export function configFor(model) {
  return { ...DEFAULTS, ...(MODEL_DEFAULTS[model] ?? {}), ...(TUNED[model] ?? {}), model };
}

export const CONFIG = configFor(DEFAULT_MODEL);
