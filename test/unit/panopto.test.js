import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { parsePanoptoUrl, listFolderSessions, fetchSessionCaptions, collectFolder } from '../../src/adapters/panopto.js';
import { buildCourseIndex } from '../../src/core/indexer.js';
import { search } from '../../src/core/search.js';
import { configFor } from '../../src/core/config.js';
import { createStore } from '../../src/storage/db.js';
import { fakeEmbedder } from '../fixtures/fake.js';

const ORIGIN = 'https://hku.hosted.panopto.com';
const FOLDER = '0b7e0f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const srt = (lines) => lines.map((t, i) => `${i + 1}\n00:00:${String(i * 10).padStart(2, '0')},000 --> 00:00:${String(i * 10 + 9).padStart(2, '0')},000\n${t}\n`).join('\n');

// A fake Panopto server, as seen from inside the student's tab.
function fakePanopto({ sessions, captions, listStatus = 200 }) {
  const calls = [];
  const pageFetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET' });
    if (url.endsWith('/Panopto/Services/Data.svc/GetSessions')) {
      if (listStatus !== 200) return { status: listStatus, text: '' };
      const { page, maxResults } = JSON.parse(init.body).queryParameters;
      const slice = sessions.slice(page * maxResults, (page + 1) * maxResults);
      return { status: 200, text: JSON.stringify({ d: { Results: slice, TotalNumber: sessions.length } }) };
    }
    const m = /GenerateSRT\.ashx\?id=([^&]+)/.exec(url);
    if (m) {
      const c = captions[decodeURIComponent(m[1])];
      if (c == null) return { status: 404, text: 'not found' };
      if (typeof c === 'number') return { status: c, text: '' };
      return { status: 200, text: c };
    }
    return { status: 404, text: '' };
  };
  return { pageFetch, calls };
}

const session = (n, name, folder = 'Algorithms 2026') => ({ DeliveryID: id(n), SessionName: name, Duration: 600 + n, FolderName: folder, StartTime: '/Date(1760000000000)/' });

describe('Panopto URL detection', () => {
  it('recognises folder URLs in hash and query forms', () => {
    expect(parsePanoptoUrl(`${ORIGIN}/Panopto/Pages/Sessions/List.aspx#folderID=%22${FOLDER}%22`)).toEqual({ origin: ORIGIN, folderId: FOLDER, kind: 'folder' });
    expect(parsePanoptoUrl(`${ORIGIN}/Panopto/Pages/Sessions/List.aspx?folderID=${FOLDER.toUpperCase()}`)).toEqual({ origin: ORIGIN, folderId: FOLDER, kind: 'folder' });
  });
  it('recognises viewer pages and rejects non-Panopto sites', () => {
    expect(parsePanoptoUrl(`${ORIGIN}/Panopto/Pages/Viewer.aspx?id=${id(1)}`)).toMatchObject({ kind: 'viewer', sessionId: id(1) });
    expect(parsePanoptoUrl('https://moodle.hku.hk/course/view.php?id=1')).toBeNull();
    expect(parsePanoptoUrl('https://evil.example.com/panopto.com/List.aspx#folderID=x')).toBeNull();
    expect(parsePanoptoUrl('http://hku.hosted.panopto.com/x')).toBeNull();
    expect(parsePanoptoUrl('not a url')).toBeNull();
  });
});

describe('Panopto folder listing', () => {
  it('pages through large folders', async () => {
    const sessions = Array.from({ length: 230 }, (_, i) => session(i + 1, `Recording ${i + 1}`));
    const { pageFetch, calls } = fakePanopto({ sessions, captions: {} });
    const r = await listFolderSessions(pageFetch, ORIGIN, FOLDER);
    expect(r.sessions).toHaveLength(230);
    expect(r.folderName).toBe('Algorithms 2026');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(3);
    expect(r.sessions[0].url).toBe(`${ORIGIN}/Panopto/Pages/Viewer.aspx?id=${id(1)}`);
  });

  it('maps access and missing-folder errors', async () => {
    await expect(listFolderSessions(fakePanopto({ sessions: [], captions: {}, listStatus: 403 }).pageFetch, ORIGIN, FOLDER)).rejects.toMatchObject({ code: 'access' });
    await expect(listFolderSessions(fakePanopto({ sessions: [], captions: {}, listStatus: 404 }).pageFetch, ORIGIN, FOLDER)).rejects.toMatchObject({ code: 'broken' });
    const garbage = async () => ({ status: 200, text: '<html>changed layout</html>' });
    await expect(listFolderSessions(garbage, ORIGIN, FOLDER)).rejects.toMatchObject({ code: 'layout' });
  });
});

describe('Panopto captions', () => {
  const captions = {
    [id(1)]: srt(['the master method gives the answer for a recurrence', 'master theorem has three cases']),
    [id(2)]: '', // captions track exists but is empty
    [id(3)]: 403, // access revoked
    [id(5)]: '<html><body>Please sign in</body></html>',
  };
  const { pageFetch } = fakePanopto({ sessions: [], captions });

  it('reads captions and maps every failure to a per-video status', async () => {
    expect((await fetchSessionCaptions(pageFetch, ORIGIN, id(1))).captionStatus).toBe('indexed');
    expect(await fetchSessionCaptions(pageFetch, ORIGIN, id(2))).toMatchObject({ captionStatus: 'no_captions', cues: null });
    expect(await fetchSessionCaptions(pageFetch, ORIGIN, id(3))).toMatchObject({ captionStatus: 'access_revoked' });
    expect(await fetchSessionCaptions(pageFetch, ORIGIN, id(4))).toMatchObject({ captionStatus: 'broken_link' });
    expect(await fetchSessionCaptions(pageFetch, ORIGIN, id(5))).toMatchObject({ captionStatus: 'access_revoked' });
    const throwing = async () => {
      throw new Error('offline');
    };
    expect(await fetchSessionCaptions(throwing, ORIGIN, id(1))).toMatchObject({ captionStatus: 'error' });
  });
});

describe('Panopto course: index, store, search, delete', () => {
  const emb = fakeEmbedder();
  const config = { ...configFor('e5-small'), tauV: 0.6, delta: 0.1, kwMinScore: 0.5 };

  it('indexes a mixed folder, reports exclusions, links to the right second, and deletes cleanly', async () => {
    const sessions = [session(1, 'Week 2: Recurrences'), session(2, 'Guest talk (no captions)'), session(3, 'Week 4: Quicksort'), session(4, 'Deleted recording')];
    const captions = {
      [id(1)]: srt(['okay welcome back', 'today the master method', 'the master theorem gives a recurrence answer in three cases', 'compare f of n with n to the log b of a']),
      [id(2)]: '',
      [id(3)]: srt(['quicksort picks a pivot', 'partition around the pivot']),
    };
    const { pageFetch } = fakePanopto({ sessions, captions });
    const progress = [];
    const { meta, videos } = await collectFolder(pageFetch, { origin: ORIGIN, folderId: FOLDER, onProgress: (p) => progress.push(p) });
    expect(progress).toHaveLength(4);
    expect(meta.courseId).toBe(`panopto:${ORIGIN}:${FOLDER}`);

    const index = await buildCourseIndex({ ...meta, model: { key: 'fake' } }, videos, { embedPassages: emb.embedPassages, dim: emb.dim, config });
    expect(index.videos.map((v) => v.captionStatus)).toEqual(['indexed', 'no_captions', 'indexed', 'broken_link']);

    const store = createStore(new IDBFactory());
    const saved = await store.save(index);
    expect(saved.coverage).toMatchObject({ indexed: 2, total: 4 });
    expect(saved.coverage.excluded.map((e) => e.title)).toEqual(['Guest talk (no captions)', 'Deleted recording']);

    const loaded = await store.load(meta.courseId);
    const r = await search(loaded, 'master theorem', { embedQuery: emb.embedQuery, config });
    expect(r.status).toBe('results');
    expect(r.results[0].title).toBe('Week 2: Recurrences');
    expect(r.results[0].url).toMatch(new RegExp(`^${ORIGIN}/Panopto/Pages/Viewer\\.aspx\\?id=${id(1)}&start=\\d+$`));

    await store.remove(meta.courseId);
    expect(await store.counts()).toEqual({ meta: 0, courses: 0, vectors: 0 });
    expect(await store.load(meta.courseId)).toBeNull();
  });

  it('a folder with only uncaptioned videos gives "index unavailable", not "not found"', async () => {
    const sessions = [session(1, 'A'), session(2, 'B')];
    const { pageFetch } = fakePanopto({ sessions, captions: { [id(1)]: '', [id(2)]: '' } });
    const { meta, videos } = await collectFolder(pageFetch, { origin: ORIGIN, folderId: FOLDER });
    const index = await buildCourseIndex(meta, videos, { embedPassages: emb.embedPassages, dim: emb.dim, config });
    const r = await search(index, 'master theorem', { embedQuery: emb.embedQuery, config });
    expect(r.status).toBe('no_index');
  });

  it('cancelling stops before the next video', async () => {
    const sessions = [session(1, 'A'), session(2, 'B'), session(3, 'C')];
    const { pageFetch } = fakePanopto({ sessions, captions: { [id(1)]: srt(['x']), [id(2)]: srt(['y']), [id(3)]: srt(['z']) } });
    const ctrl = new AbortController();
    await expect(
      collectFolder(pageFetch, { origin: ORIGIN, folderId: FOLDER, signal: ctrl.signal, onProgress: ({ done }) => done === 1 && ctrl.abort() })
    ).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('clearAll removes every course', async () => {
    const store = createStore(new IDBFactory());
    const { pageFetch } = fakePanopto({ sessions: [session(1, 'A')], captions: { [id(1)]: srt(['hash collisions chaining']) } });
    for (const f of [FOLDER, FOLDER.replace('0b7e', '1b7e')]) {
      const { meta, videos } = await collectFolder(pageFetch, { origin: ORIGIN, folderId: f });
      await store.save(await buildCourseIndex(meta, videos, { config }));
    }
    expect((await store.list()).length).toBe(2);
    await store.clearAll();
    expect(await store.counts()).toEqual({ meta: 0, courses: 0, vectors: 0 });
  });
});
