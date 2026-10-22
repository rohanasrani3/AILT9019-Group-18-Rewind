// Loads the bundled, openly licensed demo index (MIT OCW 6.046J Fall 2005, CC BY-NC-SA 4.0).
import { fromStored } from '../core/serialize.js';

export const DEMO_COURSE_ID = 'demo-mit-6046j-f05';

export async function loadDemo(modelKey, baseUrl) {
  const [jsonRes, vecRes] = await Promise.all([fetch(`${baseUrl}${modelKey}/corpus.json`), fetch(`${baseUrl}${modelKey}/vectors.bin`)]);
  if (!jsonRes.ok) throw new Error(`Demo index missing for model ${modelKey}`);
  const json = await jsonRes.json();
  const buffer = vecRes.ok ? await vecRes.arrayBuffer() : null;
  return fromStored(json, buffer);
}
