// Node-side embedder used by the demo builder and the evaluation scripts.
import * as transformers from '@huggingface/transformers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmbedder } from '../src/embed/embedder.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function nodeEmbedder(model) {
  return createEmbedder(transformers, {
    model,
    configureEnv(env) {
      env.cacheDir = path.join(root, '.cache', 'models');
      env.allowLocalModels = false;
    },
  });
}

// `--model <key>` from argv, else the default profile.
export function modelArg(argv = process.argv) {
  const i = argv.indexOf('--model');
  return i >= 0 ? argv[i + 1] : undefined;
}
