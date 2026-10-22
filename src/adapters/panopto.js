// Panopto adapter — kept isolated so layout or endpoint changes touch only this file.
//
// Requests run INSIDE the student's own Panopto tab (chrome.scripting.executeScript), so they
// carry the student's existing session and are subject to Panopto's own access control.
// Rewind never sees, asks for or stores passwords.
//
// These Panopto endpoints are not a documented public API. They are used by Panopto's own web
// pages, but HKU's deployment has not been validated without lecturer approval (see README).
//   List a folder:  POST /Panopto/Services/Data.svc/GetSessions
//   Captions:       GET  /Panopto/Pages/Transcription/GenerateSRT.ashx?id=<deliveryId>&language=0
//   Open at time:   /Panopto/Pages/Viewer.aspx?id=<deliveryId>&start=<seconds>

import { parseCaptions } from '../core/captions.js';

export const PANOPTO_HOSTS = ['https://*.panopto.com/*', 'https://*.panopto.eu/*'];
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Recognise a Panopto folder (or a single viewer page) from a tab URL.
export function parsePanoptoUrl(href) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !/\.panopto\.(com|eu)$/i.test(u.hostname)) return null;
  const decoded = decodeURIComponent(u.hash + '&' + u.search);
  const folder = /folderID=?"?([0-9a-f-]{36})/i.exec(decoded);
  if (folder && GUID.test(folder[1])) return { origin: u.origin, folderId: folder[1].toLowerCase(), kind: 'folder' };
  if (/Viewer\.aspx|Embed\.aspx/i.test(u.pathname)) {
    const id = u.searchParams.get('id');
    if (id && GUID.test(id)) return { origin: u.origin, sessionId: id.toLowerCase(), kind: 'viewer' };
  }
  return { origin: u.origin, kind: 'other' };
}

export function originPattern(origin) {
  return `${origin}/*`;
}

// pageFetch(url, {method, headers, body}) -> {status, text}   (runs in the Panopto tab)
export async function listFolderSessions(pageFetch, origin, folderId, { pageSize = 100, maxPages = 20 } = {}) {
  const sessions = [];
  let folderName = null;
  for (let page = 0; page < maxPages; page++) {
    const body = JSON.stringify({
      queryParameters: {
        query: null, sortColumn: 1, sortAscending: true, maxResults: pageSize, page, startDate: null, endDate: null,
        folderID: folderId, bookmarked: false, getFolderData: true, isSharedWithMe: false, isSubscriptionsPage: false,
        includeArchived: true, includeArchivedStateCount: true, sessionListOnlyArchived: false, includePlaylists: true,
      },
    });
    const r = await pageFetch(`${origin}/Panopto/Services/Data.svc/GetSessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body,
    });
    if (r.status === 401 || r.status === 403) throw new PanoptoError('access', 'Panopto says you do not have access to this folder. Sign in through Moodle and reopen the folder.');
    if (r.status === 404) throw new PanoptoError('broken', 'This Panopto folder was not found (broken link or deleted folder).');
    if (r.status !== 200) throw new PanoptoError('error', `Panopto returned HTTP ${r.status} while listing the folder.`);
    let d;
    try {
      d = JSON.parse(r.text).d;
    } catch {
      throw new PanoptoError('layout', 'Panopto returned an unexpected response; its page layout or API may have changed.');
    }
    const results = d?.Results ?? [];
    for (const s of results) {
      folderName ??= s.FolderName ?? null;
      sessions.push({
        id: String(s.DeliveryID ?? s.SessionID).toLowerCase(),
        title: s.SessionName ?? 'Untitled recording',
        duration: Number.isFinite(Number(s.Duration)) ? Math.round(Number(s.Duration)) : null,
        url: `${origin}/Panopto/Pages/Viewer.aspx?id=${String(s.DeliveryID ?? s.SessionID).toLowerCase()}`,
        date: s.StartTime ?? null,
      });
    }
    const total = Number(d?.TotalNumber ?? results.length);
    if (results.length < pageSize || sessions.length >= total) break;
  }
  return { folderName, sessions };
}

export class PanoptoError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Returns {cues, captionStatus, error}. Never throws for a single video: one bad recording must
// not stop the rest of the folder from being indexed.
export async function fetchSessionCaptions(pageFetch, origin, deliveryId) {
  let r;
  try {
    r = await pageFetch(`${origin}/Panopto/Pages/Transcription/GenerateSRT.ashx?id=${encodeURIComponent(deliveryId)}&language=0`, { method: 'GET' });
  } catch (e) {
    return { cues: null, captionStatus: 'error', error: `Network error: ${e.message ?? e}` };
  }
  if (r.status === 401 || r.status === 403) return { cues: null, captionStatus: 'access_revoked', error: 'Access to this recording was refused.' };
  if (r.status === 404) return { cues: null, captionStatus: 'broken_link', error: 'Recording not found (deleted or moved).' };
  if (r.status !== 200) return { cues: null, captionStatus: 'error', error: `HTTP ${r.status}` };
  // A login page served with 200 means the session expired.
  if (/<html[\s>]/i.test(r.text) && /sign ?in|log ?in/i.test(r.text)) return { cues: null, captionStatus: 'access_revoked', error: 'Your Panopto session has expired. Sign in again.' };
  const cues = parseCaptions(r.text);
  if (!cues.length) return { cues: null, captionStatus: 'no_captions', error: null };
  return { cues, captionStatus: 'indexed', error: null };
}

export async function collectFolder(pageFetch, { origin, folderId, onProgress, signal } = {}) {
  const { folderName, sessions } = await listFolderSessions(pageFetch, origin, folderId);
  const videos = [];
  for (const [i, s] of sessions.entries()) {
    if (signal?.aborted) throw new PanoptoError('cancelled', 'Indexing cancelled.');
    const c = await fetchSessionCaptions(pageFetch, origin, s.id);
    videos.push({ ...s, kind: 'panopto', cues: c.cues, captionStatus: c.captionStatus, ...(c.error ? { error: c.error } : {}) });
    onProgress?.({ stage: 'captions', done: i + 1, total: sessions.length, title: s.title, status: c.captionStatus });
  }
  return {
    meta: { courseId: `panopto:${origin}:${folderId}`, title: folderName ?? 'Panopto folder', source: 'panopto', origin, folderId },
    videos,
  };
}

export const STATUS_TEXT = {
  indexed: 'Indexed',
  no_captions: 'No captions available; this video was not indexed',
  access_revoked: 'Access refused; this video was not indexed',
  broken_link: 'Broken link; this video was not indexed',
  error: 'Could not read captions; this video was not indexed',
};
