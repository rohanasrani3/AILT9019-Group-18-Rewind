// Captures real screenshots of the built extension (dist/) for the project page, README and the
// Chrome Web Store pack. Uses the e2e profile in .cache/e2e-profile (model already cached there
// after `npm run test:e2e`).
//   node scripts/screenshots.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const img = path.join(root, 'docs', 'img');
const storeDir = path.join(root, 'store', 'screenshots');
await fs.mkdir(img, { recursive: true });
await fs.mkdir(storeDir, { recursive: true });

async function open(userDataDir, { blockModel = false, colorScheme = 'light' } = {}) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    colorScheme,
    viewport: { width: 400, height: 760 },
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  if (blockModel) await context.route(/huggingface\.co|hf\.co/, (r) => r.abort('internetdisconnected'));
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.waitForFunction(() => /MIT 6\.046J/.test(document.getElementById('course-label').textContent), null, { timeout: 30000 });
  return { context, page, id };
}

async function ask(page, q) {
  await page.fill('#q', q);
  await page.click('#search-btn');
  await page.waitForFunction(() => !document.getElementById('search-btn').disabled && !/Searching/.test(document.getElementById('search-status').textContent));
  await page.evaluate(() => document.activeElement?.blur());
}

const shot = (page, name) => page.screenshot({ path: path.join(img, `${name}.png`) });

// --- side panel states (model cached) ---
{
  const { context, page, id } = await open(path.join(root, '.cache', 'e2e-profile'));
  await page.click('#tab-setup');
  await page.click('#download-model');
  await page.waitForFunction(() => /Ready/.test(document.getElementById('model-status').textContent), null, { timeout: 220000 });
  await page.click('#tab-search');

  await ask(page, 'why is quicksort fast on average');
  await shot(page, 'search-english');
  await ask(page, '红黑树的旋转');
  await shot(page, 'search-chinese');
  await ask(page, 'master theorem 的三种情况');
  await shot(page, 'search-mixed');
  await ask(page, 'how to bake sourdough bread');
  await shot(page, 'not-found');
  await ask(page, 'solve question 2 of assignment 1');
  await shot(page, 'refusal');

  await ask(page, 'why is quicksort fast on average');
  await page.click('#timeline summary');
  await page.selectOption('#timeline-video', { index: 1 });
  await page.locator('#timeline').scrollIntoViewIfNeeded();
  await shot(page, 'timeline');
  await page.click('#timeline summary');

  await page.click('#tab-courses');
  await shot(page, 'courses');
  await page.click('#tab-setup');
  await page.locator('.consent').scrollIntoViewIfNeeded();
  await shot(page, 'consent-preview');
  await page.click('#tab-setup');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'setup');

  // Install walkthrough: the extensions page with Rewind loaded unpacked.
  const ext = await context.newPage();
  await ext.setViewportSize({ width: 1100, height: 700 });
  try {
    await ext.goto('chrome://extensions/');
    await ext.waitForTimeout(800);
    // Show Developer mode switched on, as in the install steps.
    await ext.locator('#devMode').click().catch(() => {});
    await ext.waitForTimeout(600);
    await ext.screenshot({ path: path.join(img, 'install-extensions-page.png') });
  } catch (e) {
    console.warn(`chrome://extensions could not be captured: ${e.message}`);
  }
  try {
    await ext.goto(`chrome://extensions/?id=${id}`);
    await ext.waitForTimeout(800);
    await ext.screenshot({ path: path.join(img, 'install-details.png') });
  } catch {}
  await context.close();
}

// --- keyword-only fallback (fresh profile, model blocked) ---
{
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rewind-shots-'));
  const { context, page } = await open(tmp, { blockModel: true, colorScheme: 'dark' });
  await ask(page, 'universal hashing');
  await shot(page, 'keyword-only-dark');
  await context.close();
}

// --- store composites (1280x800) and promo tile (440x280) ---
// Images are inlined as data URIs: a setContent page cannot load file:// URLs.
const dataUri = async (file) => `data:image/png;base64,${(await fs.readFile(file)).toString('base64')}`;
const icon = await dataUri(path.join(root, 'assets', 'icons', 'icon128.png'));
const STORE = [
  ['search-english', 'Find the moment a lecture explained it', 'Ask in your own words. Rewind shows up to three timestamped moments and opens the video right there.'],
  ['search-chinese', 'English, 中文 or mixed', 'Multilingual search runs on your own computer. Chinese questions find English lectures.'],
  ['refusal', 'Helps you revise, never does your homework', 'Assessment requests are declined. At most, Rewind links to where the topic was taught.'],
  ['timeline', 'A concept timeline for every lecture', 'Topic sections found automatically in the captions, each one a click away.'],
  ['consent-preview', 'Private by default', 'Captions and indexes stay in your browser. Optional AI help shows exactly what would be sent first.'],
];
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const [i, [file, title, body]] of STORE.entries()) {
  const src = await dataUri(path.join(img, `${file}.png`));
  await p.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:800px;display:flex;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box;background:linear-gradient(135deg,#eef3fb,#dfe8f6);font-family:'Segoe UI',system-ui,'Microsoft YaHei',sans-serif;color:#1d2330">
    <div style="flex:1"><div style="display:flex;align-items:center;gap:12px;margin-bottom:28px"><img src="${icon}" width="48" height="48"><span style="font-size:26px;font-weight:700;color:#1f4e8c">Rewind</span></div>
    <h1 style="font-size:46px;line-height:1.12;margin:0 0 18px">${title}</h1><p style="font-size:22px;line-height:1.45;color:#46506a;margin:0">${body}</p></div>
    <img src="${src}" style="height:700px;border-radius:14px;box-shadow:0 18px 48px rgba(20,40,80,.25);border:1px solid #c9d3e3"></body></html>`);
  await p.waitForLoadState('load');
  await p.screenshot({ path: path.join(storeDir, `${i + 1}-${file}-1280x800.png`) });
}
await p.setViewportSize({ width: 440, height: 280 });
await p.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;display:flex;flex-direction:column;justify-content:center;padding:0 36px;box-sizing:border-box;background:#1f4e8c;color:#fff;font-family:'Segoe UI',system-ui,sans-serif">
  <div style="display:flex;align-items:center;gap:12px"><img src="${icon}" width="56" height="56" style="filter:drop-shadow(0 0 1px #fff)"><span style="font-size:38px;font-weight:700">Rewind</span></div>
  <p style="font-size:19px;line-height:1.35;margin:16px 0 0;opacity:.95">Find the moment a lecture explained it.<br>English · 中文 · local and private.</p></body></html>`);
await p.waitForLoadState('load');
await p.screenshot({ path: path.join(root, 'store', 'promo-440x280.png') });
await browser.close();
console.log('Screenshots written to docs/img/ and store/');
