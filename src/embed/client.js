// Side-panel client for the embedding worker: promise API, load state, and timeouts so a stuck
// model never blocks keyword search.

export function createEmbedClient(workerUrl, { onState } = {}) {
  let worker = null;
  let seq = 0;
  const pending = new Map();
  let state = { status: 'idle', model: null, error: null, progress: null };
  let loadWaiters = [];

  const set = (patch) => {
    state = { ...state, ...patch };
    onState?.(state);
  };

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(workerUrl, { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        if (data.status === 'progress' && data.file?.endsWith('.onnx')) set({ progress: Math.round(data.progress ?? 0) });
      } else if (data.type === 'ready') {
        set({ status: data.selfTest?.ok ? 'ready' : 'failed', model: data.model, error: data.selfTest?.ok ? null : 'Model self-test failed', progress: null });
        loadWaiters.forEach((w) => w.resolve(state));
        loadWaiters = [];
      } else if (data.type === 'error' && data.request === 'load') {
        set({ status: 'failed', error: data.message, progress: null });
        loadWaiters.forEach((w) => w.resolve(state));
        loadWaiters = [];
      } else if (data.id != null && pending.has(data.id)) {
        const p = pending.get(data.id);
        pending.delete(data.id);
        clearTimeout(p.timer);
        data.type === 'error' ? p.reject(new Error(data.message)) : p.resolve(data.vector ?? data.vectors);
      }
    };
    worker.onerror = (e) => {
      set({ status: 'failed', error: e.message || 'Embedding worker crashed' });
      loadWaiters.forEach((w) => w.resolve(state));
      loadWaiters = [];
      for (const p of pending.values()) p.reject(new Error('Embedding worker crashed'));
      pending.clear();
      worker = null;
    };
    return worker;
  }

  function call(msg, timeoutMs) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Embedding timed out'));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      ensureWorker().postMessage({ ...msg, id });
    });
  }

  return {
    get state() {
      return state;
    },
    load(model, { allowDownload = false } = {}) {
      if (state.status === 'ready' && state.model === model) return Promise.resolve(state);
      set({ status: allowDownload ? 'downloading' : 'loading', model, error: null, progress: null });
      return new Promise((resolve) => {
        loadWaiters.push({ resolve });
        ensureWorker().postMessage({ type: 'load', model, allowDownload });
      });
    },
    embedQuery(text) {
      if (state.status !== 'ready') return Promise.reject(new Error('Embedding model is not loaded'));
      return call({ type: 'embedQuery', text }, 10000);
    },
    embedPassages(texts) {
      if (state.status !== 'ready') return Promise.reject(new Error('Embedding model is not loaded'));
      return call({ type: 'embedPassages', texts }, 120000);
    },
    reset() {
      worker?.terminate();
      worker = null;
      for (const p of pending.values()) p.reject(new Error('Embedding worker reset'));
      pending.clear();
      set({ status: 'idle', model: null, error: null, progress: null });
    },
  };
}
