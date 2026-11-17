# Changelog

## v0.2.0 — 17 Nov 2026

Adds the proposal's should-have features on top of the caption-based MVP. Local search behaviour is
unchanged: `npm run eval:regress` reproduces the official frozen-test-set records exactly.

**New**
- **Optional AI query help** (off by default, user's own OpenRouter or OpenAI key): query rewriting
  (original question always searched too) and one-line result labels.
  - An exact request preview is shown before anything is sent.
  - Assessment requests are never sent; personal-looking excerpts are withheld; labels are blocked
    for Panopto courses unless external processing is marked as permitted.
  - The key lives in session storage only.
  - On failure or timeout, local results are kept.
- **Concept timeline**: each lecture split at its detected topic boundaries, labelled with
  distinctive terms, each a link to its start. Computed locally.
- **Index export / import** as `.rewind.json`, validated strictly on import; restricted-course exports
  carry a do-not-share notice.
- **Agent skill** `skills/rewind-search` for Pi and other Agent-Skills agents: searches an exported
  index from the command line with the same refusal and "Not found" behaviour.
- **Local Whisper tool** (`tools/whisper/`): licensed or explicitly authorised media only.
  - Temporary media is always deleted.
  - Output is marked "Machine-transcribed; not verified", and unusable output is rejected.
  - Includes a WER script. Measured WER 25.9% on a 10-minute licensed sample.
- **Chrome Web Store pack** (`store/`): listing, permission justifications, data-use answers,
  privacy policy, screenshots and promo tile.
- **Project page** (`docs/`, GitHub Pages-ready) and README screenshots.
- **Evaluation:**
  - official results on the double-annotated, frozen test set
  - `eval:regress` (local search must not drift)
  - `eval:llm` (LLM mode, tuned on the practice set only and reported separately, with API latency separate)

**Changed**
- Ranking accepts several phrasings of one question (used only by the optional rewriting); with a
  single phrasing it is identical to v0.1.
- The "Machine-transcribed; not verified" badge shows on results from such captions.
- Optional host permissions now include `openrouter.ai` and `api.openai.com`, requested only when
  the user enables AI query help.

## v0.1.0 — 22 Oct 2026

Caption-based MVP:
- local hybrid search (BM25 + multilingual embeddings)
- the licensed MIT OCW demo
- the Panopto adapter (simulated tests only)
- not-found, missing-caption and refusal handling
- keyword-only fallback
- evaluation tooling
- README
