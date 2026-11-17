# Chrome Web Store listing pack — Rewind v0.2.0

Everything needed to submit Rewind as an **unlisted** item. Submission itself needs a Chrome Web
Store developer account (one-time registration fee) and is done by a team member at
https://chrome.google.com/webstore/devconsole.

Upload: `release/rewind-v0.2.0.zip` → in the console, the zip's top-level folder must contain
`manifest.json`. Re-zip the *contents* of `dist/` if the console rejects the folder wrapper.

## Store listing

**Name:** Rewind — find it in the lecture

**Summary (≤132 characters):**
Find the moment a recorded lecture explained an idea. Ask in English or 中文; search runs locally on your own captions.

**Category:** Education
**Language:** English (also supports Chinese queries)
**Visibility:** Unlisted

**Description:**

Rewind helps students revisit recorded lectures. Ask where something was explained — in your own
words, in English, Chinese or a mix — and Rewind shows up to three moments from your course
recordings, each with the lecture title, a timestamp and the caption excerpt. One click opens the
video at that second.

• Works on the captions of Panopto course folders you already have access to, plus a built-in demo
  of openly licensed MIT OpenCourseWare lectures.
• Search runs on your computer with a small multilingual model; captions and indexes stay in your
  browser and can be deleted with one click.
• Says "Not found" when a topic isn't in the indexed captions, and tells you which videos had no
  captions.
• Helps you revise, never does your homework: requests to solve assignment, quiz or exam questions
  are declined.
• Optional, off by default: with your own OpenAI or OpenRouter key, an AI model can rewrite your
  question into lecture-style search terms and label results. You see exactly what would be sent
  first.

Rewind does not collect analytics, does not bypass access controls, does not handle passwords, and
does not download audio or video. Please ask your lecturer before indexing course recordings.

**Graphics:**
- Icon: `assets/icons/icon128.png`
- Screenshots (1280×800): `store/screenshots/1-…png` to `5-…png`
- Small promo tile (440×280): `store/promo-440x280.png`

## Privacy practices tab

**Single purpose:** Search the captions of lecture recordings the user can already access, and open
the recording at the matching moment.

**Permission justifications:**

| Permission | Why it is needed |
|---|---|
| `sidePanel` | Rewind's interface is a side panel next to the lecture page. |
| `storage` | Saves settings (chosen model, active course) and, in session storage only, an optional API key. |
| `unlimitedStorage` | Course indexes (captions + vectors) and the ~120 MB local model can exceed the default quota. |
| `scripting` | Reads caption files from inside the user's own Panopto tab, so requests use the user's existing access. |
| Optional host `https://*.panopto.com/*`, `https://*.panopto.eu/*` | Requested only when the user clicks "Index this course"; used to list the folder and read its captions. |
| Optional host `https://openrouter.ai/*`, `https://api.openai.com/*` | Requested only if the user turns on optional AI query help with their own key. |

**Remote code:** No. All JavaScript and WebAssembly is packaged in the extension. The embedding model
weights (data, not code) are downloaded once from Hugging Face when the user clicks "Download & check
model".

**Data usage disclosures** (answer as follows):
- Personally identifiable information: **not collected**.
- Health, financial, authentication, personal communications, location, web history, user activity: **not collected**.
- Website content: **handled locally** (caption text of the user's own recordings, stored only on the device). If the user enables optional AI help, the question text and, if separately enabled, up to three short excerpts are sent to the provider the user chose, with the user's own key.
- Certify: not sold to third parties; not used for unrelated purposes; not used for creditworthiness or lending.

**Privacy policy URL:** publish `store/privacy-policy.md` (e.g. via the GitHub Pages site as
`privacy.html`, or link the file on GitHub) and paste its URL.
