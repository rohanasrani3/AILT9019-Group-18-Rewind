// Local multilingual embeddings (Transformers.js + ONNX Runtime). Runs in a browser worker and
// in Node (demo build, evaluation). Same model, revision and dtype everywhere.
//
// Two pinned model profiles are supported. The proposal specifies multilingual-e5-small; the
// shipped default is chosen on the practice set only (see eval/tune.mjs and README).

import { DEFAULT_MODEL } from '../core/config.js';

export const MODELS = {
  'e5-small': {
    key: 'e5-small',
    id: 'Xenova/multilingual-e5-small',
    revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
    dtype: 'q8', // onnx/model_quantized.onnx (~118 MB)
    dim: 384,
    // E5 expects these prefixes: questions are "query: ...", indexed text is "passage: ...".
    queryPrefix: 'query: ',
    passagePrefix: 'passage: ',
  },
  'minilm-l12': {
    key: 'minilm-l12',
    id: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    revision: '2c4055b12046f11709e9df2c122e59ffbdc2f900',
    dtype: 'q8', // onnx/model_quantized.onnx (~118 MB)
    dim: 384,
    queryPrefix: '',
    passagePrefix: '',
  },
};

export { DEFAULT_MODEL };
export const DIM = 384;

// Files Transformers.js fetches for a feature-extraction pipeline with this profile, as the
// remote URLs it uses for cache keys.
export function modelFileUrls(profile, host = 'https://huggingface.co') {
  const onnx = `onnx/model${profile.dtype === 'q8' ? '_quantized' : profile.dtype === 'fp32' ? '' : '_' + profile.dtype}.onnx`;
  return ['config.json', 'tokenizer.json', 'tokenizer_config.json', onnx].map((f) => `${host}/${profile.id}/resolve/${profile.revision}/${f}`);
}

export function createEmbedder(transformers, { model = DEFAULT_MODEL, onProgress, configureEnv } = {}) {
  const profile = MODELS[model];
  if (!profile) throw new Error(`Unknown model profile: ${model}`);
  const { pipeline, env } = transformers;
  configureEnv?.(env);
  let extractor = null;
  let loading = null;

  async function load() {
    if (extractor) return extractor;
    loading ??= pipeline('feature-extraction', profile.id, {
      revision: profile.revision,
      dtype: profile.dtype,
      progress_callback: onProgress,
    }).then(
      (p) => (extractor = p),
      (err) => {
        loading = null;
        throw err;
      }
    );
    return loading;
  }

  async function embed(texts) {
    const ex = await load();
    const out = await ex(texts, { pooling: 'mean', normalize: true });
    const [n, dim] = out.dims;
    const vecs = [];
    for (let i = 0; i < n; i++) vecs.push(Float32Array.from(out.data.subarray(i * dim, (i + 1) * dim)));
    return vecs;
  }

  return {
    profile,
    load,
    get ready() {
      return !!extractor;
    },
    embedQuery: async (q) => (await embed([profile.queryPrefix + q]))[0],
    embedPassages: (texts) => embed(texts.map((t) => profile.passagePrefix + t)),
    // Setup check: model loads and produces a normalised vector of the expected size.
    async selfTest() {
      const [v] = await embed([profile.queryPrefix + 'master theorem 主定理']);
      let norm = 0;
      for (const x of v) norm += x * x;
      return { ok: v.length === profile.dim && Math.abs(Math.sqrt(norm) - 1) < 1e-3, dim: v.length };
    },
  };
}
