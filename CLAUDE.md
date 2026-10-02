# Rate Book: project handover

A shared shop price list and quick-bill app for the family business. Runs on the family's phones as an installed web app (Android and iPhone), with prices stored in Mayank's Google Sheet. No Claude at runtime.

Last updated: 2 October 2026.

## Where everything lives

| What | Where | Owner / access |
|---|---|---|
| App files (`index.html`, `sw.js`, `manifest.webmanifest`, icons) | GitHub repository `ratebook` (public), served by GitHub Pages at `https://<github-username>.github.io/ratebook/` | Mayank's GitHub account |
| Backend script (`Code.gs`) | Apps Script project at script.google.com, created as a standalone project (not from inside a sheet) | Mayank's Google account |
| Backend web app URL | `https://script.google.com/macros/s/AKfycbxbvn-XbelK8mOeearCSHcnewrDevNfInjFggxH-60fzOiHpdEjkb9-BrJdfTOSVx_J/exec` (also hard-coded as `API_URL` in `index.html`) | Deployed: Execute as Me, access Anyone |
| Price data | Google Sheet **"Rate Book prices"** in Mayank's Google Drive, created automatically by the script. Tabs: `Items`, `Config`, `Images`, `Bills` | Mayank only; the app reaches it through the script |
| Shop PIN, sheet ID, change counter | Apps Script → Project settings → Script properties: `PIN`, `SHEET_ID`, `rev` | Default PIN `1234` until changed in the app |
| Per-phone state | Each phone's browser storage (see "On each phone" below) | That phone only |
| Old prototype | A "Rate Book" artifact on claude.ai (first version, built on Claude storage) | Retired. It holds one test item, "PP BAG 200 GUAGE". Safe to delete |

Files in this repository should match the latest copies sent in the Claude conversation. A Claude cloud workspace (`/home/claude/ratebook-standalone`) also had copies, but those are temporary and gone once that session ends. **Treat GitHub and the Apps Script editor as the sources of truth.**

## Deployment status (as of handover)

- **Live:** app installed on Mayank's phone; backend deployed with the URL above.
- **Sent but not confirmed deployed (billing update):**
  1. `Code.gs`: adds the shared bill number, the no-PIN `takeBill` action and the `Bills` tab. Needs pasting into Apps Script, then **Deploy → Manage deployments → Edit → Version: New version → Deploy**.
  2. `index.html`: includes the bill number, customer mobile, Done button, WhatsApp to the number, plus the earlier wand-mic fix. Needs uploading to GitHub.
- If only `index.html` is updated, the app still works, but bill numbers won't be shared across phones and the "Next bill number" setting won't save.

## How to update

- **App change:** edit `index.html` (or other static files) and commit to `main`. GitHub Pages republishes in about a minute. Phones load the new `index.html` on next open (the service worker fetches pages network-first). If `sw.js`, the icons or the manifest change, bump `VERSION` in `sw.js` (currently `rb-shell-3`).
- **Backend change:** paste the new `Code.gs`, then **Manage deployments → Edit → New version**. Never use "New deployment": it changes the URL and breaks every installed app until `API_URL` is updated.
- **Prices and settings:** changed inside the app (needs PIN) or directly in the sheet's `Items` tab. Phones notice within about 30 seconds.

## Architecture

- **Frontend:** a single `index.html` (vanilla JS/CSS, no build step), installable as a home-screen web app. Fonts: Baloo 2 and Mukta from Google Fonts.
- **Backend:** Google Apps Script web app over a Google Sheet.
  - `GET ?action=` `list` (items + config + rev), `rev` (change counter), `thumbs&ids=`, `image&id=`.
  - `POST` JSON `{pin, by, action, ...}`. Actions: `verify`, `upsert` (items, max 300, `tmp` ids for new rows), `delete`, `setImage`, `setConfig`, `setPin`, plus `takeBill`, which needs no PIN (records a bill and advances `nextBill`).
  - Writes use a script lock. After 8 wrong PINs in 15 minutes, every write is locked for 15 minutes. Cells starting with `= + @` are prefixed with `'` to block formula injection.
- **Sync:** the app polls `rev` every 25 seconds and on focus or coming back online, and reloads the full list when it changes. Edits show on screen at once, then are confirmed by the server; on failure the app reloads from the server.
- **Offline:** the last list and settings are cached in `localStorage` (`rb_cache`) and thumbnails in IndexedDB (`ratebook`). Saving needs internet. Bills made offline queue in `rb_billq` and are sent when back online.
- **Images:** compressed on the phone. Thumbnail 112px (about 9 KB) goes in the `Items.thumb` cell; the full image, 640px under about 45 KB, goes in the `Images` tab.

## Data model

- `Items`: `id | name | nameHi | unit | buy | sell | thumb | imgV | updatedAt | updatedBy`
- `Config` (key/value): `shopName`, `units` (JSON list of `{code, hi}`), `defaultUnit`, `roundTo` (1, 0.5 or 0), `billFooter`, `nextBill`
- `Bills`: `billNo | date | customer | mobile | total | items | by`
- `Images`: `id | data` (base64 JPEG)

## Features

- Live as-you-type search, fuzzy and phonetic, in Hindi or English ("चावल" finds "Chawal"), with "Did you mean" suggestions.
- Voice search through the mic button (Web Speech API; falls back to the keyboard mic).
- English/Hindi interface.
- Item fields: name, Hindi name, unit, buy rate, sell rate, photo.
- Bulk add (grid, or paste from Excel or WhatsApp) and bulk edit (grid, or change by %).
- **Wand: plain-language changes,** typed or spoken, e.g. "add 51 micron bag 1kg rates 110 and 120", "चीनी 5% बढ़ा दो". Parsed on the phone with rules (no AI), always shown as a preview before saving. Long dictation restarts the speech session automatically until "Stop listening" is tapped or after 15 seconds of silence.
- Bill page: shared bill number, customer name and mobile, editable quantity and rate, total. Share on WhatsApp (goes straight to the customer's number when given), Done, Copy, Clear. The number goes up after Share or Done, and each bill is logged to the `Bills` tab.
- Settings (shared): shop name, units, default unit, % rounding, bill footer, next bill number, change PIN. Per phone: hide buy rate and margin.
- Editing needs your name and the shop PIN once per phone (Tools → Unlock editing). Everyone else can view and make bills.

## On each phone (browser storage keys)

`rb_api` (backend link entered by hand, only used if `API_URL` is empty), `rb_auth` (name + PIN when unlocked), `rb_cache`, `rb_bill`, `rb_cust`, `rb_mob`, `rb_lastbill`, `rb_billq`, `rb_lang`, `rb_hidebuy`, `rb_name`, `rb_inst_x` (install banner dismissed), `rb_sr_bad` (speech blocked on this phone). Clearing the browser's site data for the app resets these. Prices are safe in the sheet.

## Known limitations and open items

- Not yet tested on real phones: install prompt, voice input, WhatsApp hand-off and keyboard behaviour. Tested only against a simulated backend and a simulated mic.
- Bill-number collisions are possible if two phones finish bills within seconds of each other, or while offline.
- The on-phone command reader is rule-based. It handles common English, Hindi and Hinglish patterns but can misread unusual phrasing, which is why there's a preview step. Hindi-only product names match English items only through rough sound-alike matching.
- `Code.gs` updates are always manual (paste and New version).
- Automatic GitHub uploads aren't set up. Planned route: run Claude Code on this repository through the Claude GitHub app, so changes can be committed and pushed directly.
- Apps Script limits: each phone checks for changes every 25 seconds while the app is open (about 150 requests an hour per phone). That's well within normal use for a few phones, but Google limits how many requests a script handles at the same moment. If the app ever says it can't reach the price list, check Apps Script → Executions for errors first.
