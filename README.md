# Rewind

**Find the moment a lecture explained an idea.** Rewind is a Chrome/Edge extension for students who revisit recorded lectures. Ask in English, 中文 or a mix ("why is quicksort fast on average", "主定理怎么用", "master theorem 的三种情况"). Rewind shows up to three moments, each with the video title, a timestamp and the caption excerpt. Clicking one opens the original video at that second.

Everything runs on your own computer. The captions, the search index and the embedding model all stay in your browser.

> AILT9019 group project (gp18). This is the caption-based MVP described in the revised proposal. See [What is not in this version](#what-is-not-in-this-version).

---

## Install (no coding needed)

Option A: Install from pre-built release (no coding needed)
1. Download `rewind-v0.1.0.zip` from the GitHub release and unzip it. You get a folder called `rewind-v0.1.0`.
2. Open **chrome://extensions** (Chrome) or **edge://extensions** (Edge).
3. Turn on **Developer mode** (top-right in Chrome, left sidebar in Edge).
4. Click **Load unpacked** and select the `rewind-v0.1.0` folder.
5. Pin Rewind from the puzzle-piece menu, then click its icon. The Rewind side panel opens.

Option B: Build and load from source

If a pre-built release zip is not available or you want to build locally:

1. Clone or download this repository.
2. Open a terminal in the project directory and run:
```bash
npm install
npm run demo:build -- --model minilm-l12
npm run build
```
3. Open chrome://extensions (or edge://extensions) and enable Developer mode.
4. Click Load unpacked and select the generated dist folder inside the repo.
5. Pin Rewind and open its side panel.

_Screenshots: `docs/install-1.png` … `docs/install-4.png` (to be added by the team)._

## First use: the demo (no HKU access, no API key)

Rewind opens with a built-in demo course: ten captioned lectures of **MIT 6.046J Introduction to Algorithms (Fall 2005)**, which MIT OpenCourseWare publishes under CC BY-NC-SA 4.0.

1. **Setup** tab → **Download & check model**. This is a one-time download of about 120 MB. Afterwards the model runs offline on your device.
2. **Search** tab → type a question → **Search** (or press Enter).
3. Each result shows the lecture, a timestamp, the caption excerpt and a match label (*Strong match* / *Possible match*; these are not probabilities). **Open at mm:ss** opens the lecture on YouTube at that second.

If you skip step 1, Rewind still works in **keyword-only mode** and says so in a yellow banner. Exact wording ("master theorem") still finds results, but paraphrased and Chinese questions may be missed.

Example questions to try: `master theorem` · `shortcut for divide-and-conquer recurrences` · `计数排序是怎么工作的` · `quicksort 的 partition 怎么做` · `how to bake bread` (→ Not found) · `solve question 2 of assignment 1` (→ refused).

## Using it with your Panopto course

> **Ask first.** Being able to see a recording is not permission to copy its captions. Ask the lecturer or course team before indexing HKU material. Never share an HKU index.

1. Open your course's **Panopto folder** (the list of recordings) in a normal tab. If you usually sign in through Moodle, do that first.
2. In Rewind, go to **Courses** → **Index this course**. The first time, Chrome asks to let Rewind read Panopto pages. Rewind asks only for `*.panopto.com` / `*.panopto.eu`.
3. Rewind reads the captions you can already see, then builds the index on your device. It shows progress, how many videos were indexed, and which ones were not indexed and why:
   - *No captions available; this video was not indexed*
   - *Access refused* / *Broken link*
4. Searches then cover that course. "Not found" means not found **in the indexed captions**. A folder whose videos have no captions at all shows *Index unavailable* instead, so you aren't misled into thinking the topic was never covered.

Rewind uses your existing Panopto session from inside your own tab. It never sees or stores your password, and it never downloads audio or video.

**Reindex** updates a course after new recordings are added. **Delete** removes that course's captions, vectors and metadata from your device.

> **Validation limitation:** the Panopto adapter has been tested against simulated Panopto responses (`test/unit/panopto.test.js`), **not against HKU's live Panopto**. That needs lecturer approval and a login, which the team has not yet obtained. It uses the same (undocumented) endpoints as Panopto's own web pages, so a Panopto update could break it. If that happens Rewind reports an error, and the demo keeps working.

## Privacy and your data

- Captions, indexes and settings are stored only in this browser (IndexedDB and extension storage).
- No analytics, no accounts, no server. Rewind sends nothing anywhere. The only network requests it makes are the one-time model download from Hugging Face and caption reads from Panopto pages you open yourself.
- **Setup → Delete all Rewind data** removes every indexed course and all settings. **Remove downloaded model** removes the model files.
- **Offline:** cached indexes and the downloaded model work without a network. Opening a video still needs the network and your course login.

## What Rewind does not do

- It does not solve assignment, quiz or exam questions. Requests like "solve question 2 of assignment 1" or "帮我做作业第二题" get a notice, plus at most links to where the topic was explained.
- It does not summarise whole lectures.
- It does not bypass access controls, handle passwords, share captions, or collect usage data.
- Caption text is treated purely as data. Nothing in a caption can change what Rewind does.

---

## How it works

```
Panopto folder ─▶ caption track ─▶ 45 s windows, 15 s stride ─┬─▶ keyword index (BM25; Chinese bigrams)
                                                              ├─▶ local multilingual embeddings
                                                              └─▶ topic boundaries (TextTiling-style)
Question ─▶ assessment check ─▶ keyword ranking + embedding ranking ─▶ reciprocal-rank fusion
         ─▶ similarity threshold ─▶ de-duplicate ─▶ ≤ 3 results  |  "Not found"  |  refusal notice
```

| Part | File |
|---|---|
| Caption parsing (SRT, WebVTT, Panopto JSON) | [src/core/captions.js](src/core/captions.js) |
| Windows, BM25, vectors, fusion, segmentation, snapping | [src/core/](src/core/) |
| Assessment-request check (EN + 中文) | [src/core/guard.js](src/core/guard.js) |
| Search orchestration and statuses | [src/core/search.js](src/core/search.js) |
| Embeddings (Transformers.js + ONNX Runtime WebAssembly, in a worker) | [src/embed/](src/embed/) |
| Panopto adapter (isolated) | [src/adapters/panopto.js](src/adapters/panopto.js) |
| Local storage and deletion | [src/storage/db.js](src/storage/db.js) |
| Side panel UI | [src/sidepanel/](src/sidepanel/) |
| Retrieval settings (tuned on the practice set) | [src/core/config.js](src/core/config.js) |

### Embedding model: a deviation from the proposal

The proposal names `Xenova/multilingual-e5-small`. Rewind supports it (Setup → Model), but **ships with `Xenova/paraphrase-multilingual-MiniLM-L12-v2` as the default**. Both are pinned to exact Hugging Face revisions, about 120 MB quantised, 384-dimensional.

The default was chosen on the **15-question practice set only** (`npm run eval:tune`):

| Practice set (15 q) | Hit@3 answerable | of which Chinese/mixed | Not found |
|---|---|---|---|
| e5-small (tuned) | 5/10 | 0/4 | 3/3 |
| MiniLM-L12 (tuned) | 7/10 | 3/4 | 2/3 |

With e5-small, the scores for correct Chinese matches overlapped with off-topic queries, so no threshold could accept one without the other. Two other local options were tried and dropped. `multilingual-e5-base` was no better and twice as slow. The local zh→en translation model `opus-mt-zh-en` mistranslated technical terms (哈希表冲突 → "Hashie's watch").

The provisional test-set numbers below show the trade-off: MiniLM finds far more Chinese questions, while e5-small says "Not found" more reliably. The team should make the final model decision.

Other design notes:
- Topic-start snapping is implemented, but the practice-set tuning switched it off (`maxSnap: 0`), because it didn't improve hits.
- Query embedding runs in a worker. Browser and Node embeddings are checked to agree (cosine > 0.99) in the end-to-end test.
- ONNX Runtime's WebAssembly files ship inside the extension: Manifest V3 forbids remote code.

---

## Evaluation

Corpus: lectures 1–10 of MIT 6.046J Fall 2005, 12.8 hours of captions, 3,054 windows. Sources, URLs and licences are in [demo/sources.json](demo/sources.json).

| Set | File | Contents |
|---|---|---|
| Test (frozen before reporting) | [eval/questions.test.json](eval/questions.test.json) | 12 exact, 12 paraphrased, 12 Chinese/mixed, 8 not covered, 6 assessment |
| Practice (tuning only) | [eval/questions.practice.json](eval/questions.practice.json) | 15 questions on different topics |

**A hit** means a returned start time falls in [agreed start − 30 s, agreed end].
**The baseline** is keyword-only retrieval over the same captions, with its own thresholds tuned on the same practice set.

### ⚠ The question sets are drafts

Every question and interval was drafted from the raw transcripts and is marked `"status": "unverified"`. The proposal requires two team members to annotate independently and reconcile. Until that happens, every result is **provisional**, and the evaluation tools label it that way.

### Team workflow

```bash
node eval/transcript.mjs grep 2 "master (method|theorem)"   # search the raw transcripts (not Rewind's output)
node eval/transcript.mjs show 2 48:00 52:00                 # read a stretch of a lecture

node eval/annotate.mjs record test T-EX-01 A 2 48:30 57:00  # annotator A (independently)
node eval/annotate.mjs record test T-EX-01 B 2 48:45 56:50  # annotator B (independently)
node eval/annotate.mjs record test T-NF-01 A none           # not-covered / assessment items
node eval/annotate.mjs reconcile test                       # auto-agrees close pairs, lists disputes
node eval/annotate.mjs agree test T-PA-05 7 12:20 20:10     # record a discussed outcome
node eval/annotate.mjs status test
node eval/annotate.mjs freeze test                          # only possible when all are verified

npm run eval:split                    # fails if practice and test questions are near-duplicates
npm run eval:tune -- --write          # tune on the practice set only (add --pick-default to choose the model)
npm run eval -- --set test            # writes eval/results/<date>-test-<model>.{json,md}
```

For browser latency, open `chrome-extension://<id>/bench/bench.html` after downloading the model, or run `npm run test:e2e`.

### Provisional results (draft annotations, 22 Oct 2026)

Machine: AMD Ryzen 7 250, 16 threads, 31 GB RAM, Windows 11, Node 24. Index build in Node: 59 s (MiniLM) / 71 s (e5-small). Model load from cache: 0.7 s.

| Test set (50 q) | MiniLM-L12 (default) | e5-small (proposal) | Keyword baseline | Target |
|---|---|---|---|---|
| Exact Hit@3 | 11/12 | 10/12 | 10/12 | — |
| Paraphrased Hit@3 | 7/12 | 7/12 | 7/12 | ≥ 10/12 and +20 pts |
| Chinese/mixed Hit@3 | **8/12** | 1/12 | 0/12 | ≥ 10/12 and +20 pts |
| Answerable Hit@1 / Hit@3 | 16 / 26 of 36 | 13 / 18 of 36 | 10 / 17 of 36 | — |
| Not found correct | 3/8 | **7/8** | 5/8 | ≥ 7/8 |
| Refusals | 6/6 | 6/6 | — | 6/6 |
| Median local retrieval | 4.5 ms (Node) · **12–21 ms (browser, two runs)** | 5.3 ms (Node) | — | < 2 s |

What these show, honestly:
- **Met:** refusals (6/6, with no false refusals on answerable questions) and latency, by a wide margin.
- **Not met:** paraphrased questions (7/12 for every method, so no gain over keywords) and Chinese/mixed (best 8/12).
- **Not-found:** met only by e5-small. MiniLM's tuned threshold is too permissive, most likely because the practice set has only 3 not-covered questions.
- Full per-question tables are in [eval/results/](eval/results/). These numbers will change once the annotations are verified.
- Ideas for the team, to be tuned on the practice set only, never the test set:
  - add more not-covered questions to the practice set
  - try the should-have LLM query rewriting

---

## For developers

```bash
npm install                                # install dependencies
npx playwright install                     # install Playwright browser binaries (required for E2E testing)
npm run demo:build -- --model minilm-l12   # fetch OCW captions, build the demo index (also --model e5-small)
npm test                                   # 64 unit tests (Vitest)
npm run build                              # → dist/ (load this folder unpacked)
npm run test:e2e                           # Playwright: loads dist/ in Chromium, drives the side panel
npm run package                            # → release/rewind-v0.1.0.zip
```

- **Pinned versions:** `@huggingface/transformers` 3.8.1; model revisions are in [src/embed/embedder.js](src/embed/embedder.js).
- **First e2e run:** downloads the model once into `.cache/e2e-profile`.
- **Fallback test:** a second e2e test blocks Hugging Face, simulating an absent model cache with no network.

## What is not in this version

These should-haves from the proposal are **not implemented**:
- LLM query rewriting and excerpt labels (OpenAI API)
- local Whisper transcription
- the concept timeline
- index export
- the Pi Agent skill
- a Chrome Web Store listing

## Licences and credits

- **Demo content:** MIT OpenCourseWare 6.046J Fall 2005 (Prof. Charles Leiserson, Prof. Erik Demaine), CC BY-NC-SA 4.0. See [demo/LICENSE-DEMO.md](demo/LICENSE-DEMO.md). MIT OCW does not endorse Rewind.
- **Models:** `Xenova/paraphrase-multilingual-MiniLM-L12-v2` and `Xenova/multilingual-e5-small` (Apache-2.0 / MIT, see their model cards).
- **Code licence:** to be chosen by the team.
- **AI assistance:** this implementation was built with the help of an AI coding assistant (Claude Code). This will be disclosed in the final report, as the proposal commits to.
