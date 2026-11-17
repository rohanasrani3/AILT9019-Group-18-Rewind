// Portable index files (".rewind.json") for export/import and for the Pi Agent skill.
// Works in browsers and Node (uses btoa/atob only). Imported files are untrusted: they are
// validated strictly and their text is only ever treated as data.
import { toStored, fromStored } from './serialize.js';

export const FORMAT = 'rewind-index';
export const VERSION = 1;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function exportIndex(index) {
  const { json, vectors } = toStored(index);
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    notice: json.source === 'panopto' ? 'Contains caption text from a restricted course. Do not share or redistribute.' : json.license ? `Caption text licensed ${json.license}.` : null,
    index: json,
    vectors: vectors ? toBase64(vectors) : null,
  };
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

export function importIndex(obj) {
  if (!obj || obj.format !== FORMAT) throw new Error('Not a Rewind index file.');
  if (obj.version !== VERSION) throw new Error(`Unsupported Rewind index version ${obj.version}.`);
  const j = obj.index;
  if (!j || typeof j.courseId !== 'string' || !j.courseId) throw new Error('Index file has no course id.');
  if (!Array.isArray(j.videos) || !Array.isArray(j.windows)) throw new Error('Index file is missing videos or windows.');
  for (const v of j.videos) if (typeof v.title !== 'string' || typeof v.captionStatus !== 'string') throw new Error('Index file has a malformed video entry.');
  for (const w of j.windows) {
    if (!Number.isInteger(w.v) || w.v < 0 || w.v >= j.videos.length || !isNum(w.start) || !isNum(w.end) || typeof w.text !== 'string') {
      throw new Error('Index file has a malformed caption window.');
    }
  }
  // Links must stay ordinary web links.
  for (const v of j.videos) if (v.url && !/^https:\/\//.test(v.url)) throw new Error('Index file contains a non-https video link.');
  if (obj.vectors != null && !Number.isInteger(j.dim)) throw new Error('Index file has vectors but no dimension.');
  return fromStored(j, obj.vectors ? fromBase64(obj.vectors) : null);
}

export function exportFileName(index) {
  const slug = String(index.title ?? 'course').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'course';
  return `${slug}.rewind.json`;
}
