# Rewind privacy policy

_Last updated: 17 November 2026 · applies to Rewind v0.2.0_

Rewind is a student project (AILT9019, HKU, group 18). It is a browser extension that searches the
captions of lecture recordings you can already access.

## What Rewind stores, and where

- **Captions and search indexes** of courses you index (and the built-in demo): stored only in your
  browser's extension storage (IndexedDB) on your device.
- **Settings** (chosen model, active course, option toggles): stored in your browser.
- **The embedding model** (~120 MB, downloaded from Hugging Face when you choose to): stored in your
  browser's cache.
- **An optional API key** for AI query help: stored in session storage only, removed when the
  browser closes or when you click "Remove key".

Nothing is stored on any server run by the Rewind team. There is no account and no analytics.

## What leaves your device

By default, nothing except:
- the one-time model download from Hugging Face;
- requests to Panopto pages **you** open, made from your own tab with your existing access, to list a
  folder and read its captions;
- opening a video on Panopto or YouTube when you click a result.

**Only if you turn on optional AI query help** (off by default) with your own key:
- your **question text** is sent to the provider you selected (OpenRouter or OpenAI) to get search
  terms; and
- if you also turn on labels, up to **three short result excerpts** (≤ 320 characters each) are sent.
  Excerpts that look personal are never sent, and for Panopto courses labels stay off unless you
  mark the course as permitted for external processing.

Questions that ask for assessment answers are never sent. The provider's own privacy policy applies
to anything you choose to send.

## Deleting your data

- **Courses → Delete** removes one course's captions, vectors and metadata.
- **Setup → Delete all Rewind data** removes every course, all settings and any saved API key.
- **Setup → Remove downloaded model** removes the model files.
- Uninstalling the extension removes everything.

## Contact

Open an issue on the project's GitHub repository.
