// End-to-end: loads the built extension (dist/) in Playwright's Chromium and drives the side
// panel page against the bundled demo.
// - The main test uses a persistent profile in .cache/e2e-profile, so the model is downloaded
//   from Hugging Face once and then comes from the browser cache (as for a real student).
// - The fallback test uses a fresh profile with Hugging Face blocked (absent model cache, offline).
import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nodeEmbedder } from '../../scripts/node-embedder.mjs';
import { DEFAULT_MODEL } from '../../src/core/config.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const dist = path.join(root, 'dist');

async function launch({ blockModel = false } = {}) {
  const userDataDir = blockModel ? await fs.mkdtemp(path.join(os.tmpdir(), 'rewind-e2e-')) : path.join(root, '.cache', 'e2e-profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  if (blockModel) await context.route(/huggingface\.co|hf\.co/, (route) => route.abort('internetdisconnected'));
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await expect(page.locator('#course-label')).toContainText('MIT 6.046J', { timeout: 30000 });
  return { context, page, id };
}

async function ask(page, q) {
  await page.fill('#q', q);
  await page.click('#search-btn');
  await expect(page.locator('#search-btn')).toBeEnabled({ timeout: 30000 });
  return page.locator('#search-status').innerText();
}

test('demo search: model setup, bilingual results, not-found, refusal, keyboard, latency, deletion', async () => {
  const { context, page, id } = await launch();

  // 2) Setup downloads (first run only) and checks the model.
  await page.click('#tab-setup');
  await page.click('#download-model');
  await expect(page.locator('#model-status')).toContainText('Ready', { timeout: 220000 });
  await page.click('#tab-search');
  let status;

  // 3) English paraphrase: up to three results with timestamps and YouTube deep links.
  status = await ask(page, 'why is quicksort fast on average');
  expect(status).toMatch(/moments? found/);
  await expect(page.locator('#banner')).toBeHidden();
  const items = page.locator('#results li.result');
  const n = await items.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(3);
  for (let i = 0; i < n; i++) {
    await expect(items.nth(i).locator('.time')).toHaveText(/^\d+:\d\d(:\d\d)?$/);
    await expect(items.nth(i).locator('a.open')).toHaveAttribute('href', /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]+&t=\d+s$/);
  }

  // Browser (WASM) and Node (onnxruntime-node) embeddings must agree, so the evaluation measured
  // in Node describes what students get in the browser.
  const probes = ['master theorem', '红黑树是什么', 'big O notation 的定义'];
  const browserVecs = await page.evaluate(async (qs) => {
    const out = [];
    for (const q of qs) out.push(Array.from(await globalThis.__rewind.embed.embedQuery(q)));
    return out;
  }, probes);
  const node = nodeEmbedder(DEFAULT_MODEL);
  for (const [i, q] of probes.entries()) {
    const nv = await node.embedQuery(q);
    const cos = nv.reduce((s, x, j) => s + x * browserVecs[i][j], 0);
    expect(cos, `embedding parity for "${q}"`).toBeGreaterThan(0.99);
  }

  // 4) Chinese and mixed queries return timestamped results.
  status = await ask(page, '红黑树是什么');
  expect(status).toMatch(/moments? found/);
  await expect(page.locator('#results li.result .time').first()).toHaveText(/^\d+:\d\d/);
  status = await ask(page, 'big O notation 的定义');
  expect(status).toMatch(/moments? found/);

  // 5) Keyboard: arrow keys move from the search box through result links.
  await page.focus('#q');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#results a.open').first()).toBeFocused();
  if ((await page.locator('#results a.open').count()) > 1) {
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#results a.open').nth(1)).toBeFocused();
  }

  // 6) Not covered: "Not found" without timestamps.
  status = await ask(page, 'how to bake sourdough bread');
  expect(status).toMatch(/Not found/);
  await expect(page.locator('#results li')).toHaveCount(0);

  // 7) Assessment request: refusal notice, no solution, at most related links.
  status = await ask(page, 'solve question 2 of assignment 1');
  expect(status).toMatch(/does not solve assessment questions/);
  await expect(page.locator('#results li')).toHaveCount(0);
  expect(await page.locator('#related-list li').count()).toBeLessThanOrEqual(3);

  // 8) In-browser latency benchmark on the test questions (same code as the Node evaluation).
  const bench = await context.newPage();
  await bench.goto(`chrome-extension://${id}/bench/bench.html`);
  await bench.click('#run');
  await expect(bench.locator('#status')).toHaveText('Done.', { timeout: 180000 });
  const report = await bench.evaluate(() => ({ ...globalThis.__benchReport, records: undefined }));
  await fs.mkdir(path.join(root, 'eval', 'results'), { recursive: true });
  await fs.writeFile(path.join(root, 'eval', 'results', `browser-bench-${report.set}-${report.model}.json`), JSON.stringify(report, null, 2));
  console.log(`Browser median retrieval latency: ${report.hybrid.medianLatencyMs.toFixed(1)} ms; model load from cache ${report.modelLoadMs} ms`);
  expect(report.hybrid.medianLatencyMs).toBeLessThan(2000);
  await bench.close();

  // 9) Delete all data.
  await page.click('#tab-setup');
  await page.click('#delete-all');
  await page.click('#delete-all');
  await expect(page.locator('#delete-status')).toContainText('remaining records: 0');

  await context.close();
});

test('absent model cache and no network: keyword-only search with visible notices', async () => {
  const { context, page } = await launch({ blockModel: true });

  // 1) Before any model setup: search works, with a visible keyword-only notice.
  let status = await ask(page, 'master theorem');
  expect(status).toMatch(/moments? found/);
  await expect(page.locator('#banner')).toContainText(/Keyword-only mode/);

  // A download attempt that fails is reported, and search still works.
  await page.click('#tab-setup');
  await page.click('#download-model');
  await expect(page.locator('#model-status')).toContainText('Model unavailable', { timeout: 60000 });
  await page.click('#tab-search');
  status = await ask(page, 'universal hashing');
  expect(status).toMatch(/moments? found/);
  await expect(page.locator('#banner')).toContainText(/could not run|not set up/);
  await expect(page.locator('#results li.result').first()).toBeVisible();
  await context.close();
});
