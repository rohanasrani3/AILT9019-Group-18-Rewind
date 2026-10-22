// Embedding worker owned by the side panel. Loads the pinned model through Transformers.js with
// the ONNX Runtime WebAssembly files bundled in the extension (no remote code).
//
// Messages in:  {type:'load', model, allowDownload} | {type:'embedQuery', id, text} | {type:'embedPassages', id, texts}
// Messages out: {type:'progress', ...} | {type:'ready', model, selfTest} | {type:'error', id?, message} | {type:'result', id, vector|vectors}
import * as transformers from '@huggingface/transformers';
import { createEmbedder, modelFileUrls, MODELS } from './embedder.js';

const { env } = transformers;
env.allowLocalModels = false;
env.useBrowserCache = true; // model files cached once via the Cache API
env.backends.onnx.wasm.wasmPaths = new URL('ort/', self.location.href).href;
env.backends.onnx.wasm.numThreads = 1; // extension pages are not cross-origin isolated
env.backends.onnx.wasm.proxy = false;

let embedder = null;
let modelKey = null;

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      if (!embedder || modelKey !== data.model) {
        modelKey = data.model;
        embedder = createEmbedder(transformers, {
          model: data.model,
          onProgress: (p) => self.postMessage({ type: 'progress', ...pick(p) }),
        });
      }
      // Without permission to download, only an already-cached model can load. This is what
      // makes "absent model cache" fall back to keyword-only search instead of a silent download.
      if (!data.allowDownload && !(await isCached(MODELS[data.model]))) {
        embedder = null;
        throw new Error('The model has not been downloaded on this device yet');
      }
      await embedder.load();
      const selfTest = await embedder.selfTest();
      self.postMessage({ type: 'ready', model: modelKey, selfTest });
    } else if (data.type === 'embedQuery') {
      const vector = await need().embedQuery(data.text);
      self.postMessage({ type: 'result', id: data.id, vector }, [vector.buffer]);
    } else if (data.type === 'embedPassages') {
      const vectors = await need().embedPassages(data.texts);
      self.postMessage({ type: 'result', id: data.id, vectors }, vectors.map((v) => v.buffer));
    }
  } catch (err) {
    if (data.type === 'load') embedder = null;
    self.postMessage({ type: 'error', id: data.id, request: data.type, message: String(err?.message ?? err) });
  }
};

async function isCached(profile) {
  try {
    const cache = await caches.open('transformers-cache');
    for (const url of modelFileUrls(profile)) if (!(await cache.match(url))) return false;
    return true;
  } catch {
    return false;
  }
}

function need() {
  if (!embedder?.ready) throw new Error('Embedding model is not loaded');
  return embedder;
}

function pick(p) {
  return { status: p.status, file: p.file, progress: p.progress, loaded: p.loaded, total: p.total };
}
