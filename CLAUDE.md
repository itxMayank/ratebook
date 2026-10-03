# Rate Book: project handover

A shared shop price list and quick-bill app for the family business. Runs on the family's phones as an installed web app (Android and iPhone), with prices stored in Mayank's Google Sheet. No Claude at runtime.

Last updated: 2 October 2026 (GST billing added).

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

## GST billing (added 2 Oct 2026)

- Each item has an **HSN code** (default from Settings, `3923`) and a **GST %** (default from Settings, 18). Blank values in the sheet fall back to these defaults.
- Bill page: a **GST bill** switch. GST is **added on top** of the rates. Tax is grouped by rate and split CGST + SGST (half each), or IGST when **Out of state** is on. The total is rounded to the nearest rupee, with a round-off line. An optional customer GSTIN is checked for the 15-character format.
- The GST switch turns itself off after each bill is shared or marked Done.
- The WhatsApp text becomes a TAX INVOICE showing shop name, address and GSTIN (from Settings), customer GSTIN, the HSN and GST % for each line, taxable value, tax lines, round-off and grand total.
- Bill number can be typed over on the bill page for one bill. Afterwards the automatic number continues from whichever is higher, so typing an older number never moves it backwards.
- The bill-page search is separate from the prices-page search.
- The price-list cards show a compact − qty + control once an item is in the bill.
- Sheet changes: `Items` gains `hsn` and `gst` columns. `Bills` gains `gstBill`, `taxable`, `tax`, `customerGstin` and `igst`. `Config` gains `shopGstin`, `shopAddress`, `defaultGst` and `defaultHsn`. Header rows update themselves on the first request after the script is redeployed.

## Past bills and pack sizes (added 2 Oct 2026)

- Each bill shared or marked Done is saved in the `Bills` tab, including the exact message text (`text`) and the bill lines as JSON (`lines`). Bills made before this update only have the summary `items` column; the app rebuilds a simple text for those.
- **Tools → Past bills** (needs the shop PIN, because bills hold customer names and numbers) lists the newest 60 bills. You can search by bill number, customer name, GSTIN or mobile. Opening a bill shows its text, a WhatsApp button (to the saved mobile, or any number typed in), Copy, and **Repeat as new bill**, which loads the lines, customer and GST settings into a fresh bill with the next number. Backend action: `listBills` (POST with PIN, read-only, doesn't bump `rev`).
- **Pack sizes:** an item can also be sold in a smaller pack, e.g. Max: 1 kg = 5 packets of 200 g. The fields are `altUnit` (e.g. packet), `altQty` (packs in 1 main unit) and `altSell` (price per pack; blank means sell ÷ altQty). Cards show the pack price. On the bill page, the unit chip (e.g. "kg ⇄") switches a line between the main unit and the pack, and switches the rate with it. Bulk add/edit don't cover pack fields yet; set them in the item's edit screen.

## Editing saved bills (added 2 Oct 2026)

- Past bills → open a bill → **Edit bill** loads it onto the bill page in edit mode. A yellow bar reads "Editing Bill No. X", the bill number is locked, and the buttons become **Save changes** and **Save & share on WhatsApp**. **Cancel editing** changes nothing.
- An unfinished bill that was open is set aside and comes back once editing is saved or cancelled (`rb_stash`, `rb_editing` in browser storage).
- Saving calls `updateBill` (POST, needs the PIN). It keeps the original date and number, and sets `editedAt`, `editedBy` and `edits` (a count). The previous text is copied to the **BillHistory** tab (`billId | billNo | changedAt | by | oldText`). Edited bills show an **Edited** tag in the list and an "Edited: date, time" line in the WhatsApp text.
- Bills get a `billId` when saved. Bills from before IDs existed are matched by row number plus bill number. Bills from before line details were kept are rebuilt from their item summary so they can still be edited.
- Past-bills search covers customer name, mobile (any 4+ digits), GSTIN, bill number, item names and date (dd/mm/yyyy or dd-mm-yyyy). Searching shows the count and total of matching bills.

## Hindi item names (added 2 Oct 2026)

- Item names are written in Hindi letters (transliteration, not translation: Sugar → शुगर, PP Bag → पीपी बैग) by `toHindi()` in `index.html`. It uses a word list for common shop and packaging words (`HI_WORDS`), letter-by-letter spelling for short acronyms (PP, HDPE, LD), and sound rules for everything else. Numbers, sizes like 12x18, and "27 x 30" stay as they are. Units become किलो/ग्राम/एमएल and similar.
- The Hindi name (`nameHi`) fills itself while you type the English name in the add/edit screen, unless you type your own. On save, an empty Hindi name is filled automatically. Bulk add and plain-language "add" do the same.
- **Tools → Convert names to Hindi** shows a reviewable, editable list for every item, with the current Hindi name next to each, and saves them in batches.
- Display: the English name is the main name everywhere (cards, item detail, bill lines), with the Hindi name in small text underneath. The WhatsApp bill uses the English name only. Search works in English or Hindi.
- To fix a word that always comes out wrong, add it to `HI_WORDS` (lowercase English → Hindi).

## Separate GST and normal bill numbers (added 2 Oct 2026)

- `Config` holds two counters: `nextBill` (normal bills) and `nextGstBill` (GST bills). Settings shows both. The bill page shows the next number of whichever kind is selected; switching the GST chip switches the number and clears a hand-typed one.
- `takeBill` advances the counter that matches `bill.gst`. The `Bills` tab's `gstBill` column tells the two series apart, so the same number can appear once in each.

## Bill profit (added 3 Oct 2026)

- Each bill line stores the buy rate at the time it was added (`buy` in `lines`; pack lines use buy ÷ packs). Each saved bill stores `cost` and `profit` columns in `Bills` (sale before GST minus cost). Editing a bill recalculates both.
- Profit % is profit ÷ cost, the same way the price cards show margin.
- **Settings → Profit on past bills** (`showProfit` in `Config`, off by default, shared) controls whether profit is shown. When on, the bill screen and Past bills shows "Profit ₹82 · 20.4%" on each bill, the total profit in search summaries, and a breakdown in bill detail (sale before GST, cost, profit for each item). It also shows on the bill screen while a bill is being made, hidden until tapped: under the total there's a small "Profit" with an eye icon. Tapping it shows "+₹82 · 20.4%" and the breakdown in the expanded total panel. Tapping again hides it, and it hides itself after each bill and when the app goes to the background. Profit never appears in WhatsApp text.
- Bills saved before cost was recorded show an estimate from today's buy rates, marked with `*`.

## Returning customers (added 3 Oct 2026)

- Typing a 10-digit mobile on the bill page looks up past bills for that number. It fills the customer name (if the name field is empty or was filled automatically) and the GSTIN (if empty), and shows a line such as "Sunil Traders · 4 bills before · last 02 Oct · total ₹3,250". A name you've typed yourself is never overwritten.
- Sources: a per-phone cache of customers from bills made on that phone (`rb_customers` in browser storage, up to 2,000), and for unlocked phones the `findCustomer` backend action (POST with PIN, read-only), which looks the number up in the `Customers` tab (see Performance below). Locked phones use only their own cache, so customer details aren't readable without the PIN.

## Performance (added 3 Oct 2026)

Made so the app stays fast as the sheet grows (thousands of bills and items). Nothing changes on screen.
- **Past bills list** (`listBills`) skips the large `text` and `lines` columns and returns each bill's sheet `row`. Opening a bill calls `getBill` (POST, PIN, `{row, id, n}`), which reads that one row and checks the bill id (or the number, for old bills) so a moved row isn't misread. `showBill()` in `index.html` fetches it when `b.text` is undefined.
- **Customers tab** (`mobile | name | gstin | bills | total | lastDate | lastBillNo`): one row per mobile (last 10 digits). `findCustomer` reads only this tab. `takeBill` adds or updates the row; `updateBill` refreshes the name and GSTIN. If the tab is missing, `customersSheet_()` builds it once from the existing `Bills` rows. `takeBill` builds it before appending the new bill, so that bill isn't counted twice. Safe to delete the tab: it rebuilds itself.
- **Price list** (`list`) no longer reads the `thumb` column (photos come through `thumbs`, only for changed ones). `thumbs` reads just the id column plus the thumb and imgV columns.
- **Change counter** (`rev`) and the sheet id are kept in Apps Script's CacheService (6 hours), so the 25-second checks from every phone don't use up the daily Properties quota. `bump_()` writes both the property and the cache.
- Still to do (when needed): yearly archive of `Bills` into a separate tab or file, possibly with the GST bill series restarting each financial year (April 1).

## Past bills by date, with filters (added 3 Oct 2026)

- The Past bills list is grouped by day. Each day has a sticky banner: "Today", "Yesterday", or a date like "Thu, 03 Sept". It shows that day's bill count and total. The totals come from the server (`days` in the `listBills` reply), so they're exact even when only part of the day is loaded.
- Filters sit in one row under the search box: a **Year** chip (years come from `years` in the reply) and a **Date** chip (a native date picker laid invisibly over the chip so it opens on both iPhone and Android), plus ✕ to clear them. The filters live in the app only (`BL` in `index.html`, not saved). They stay set while you open a bill and go back.
- `listBills` takes `tz` (the phone's `getTimezoneOffset`, so a day means the phone's day and not the script's time zone), `from`/`to` (`yyyy-mm-dd`, inclusive) and `before` (sheet row, used by "Show more bills"). It returns `bills`, `days`, `all` ({count, total} of every match, shown in the summary line when searching or filtering by year), `years` and `more`. The page size is 60.
- Delete in Edit item: the confirm box now replaces the Delete button and scrolls into view. Before, it opened below the Save bar, off screen.

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

- `Items`: `id | name | nameHi | unit | buy | sell | thumb | imgV | updatedAt | updatedBy | hsn | gst | altUnit | altQty | altSell`
- `Config` (key/value): `shopName`, `units` (JSON list of `{code, hi}`), `defaultUnit`, `roundTo` (1, 0.5 or 0), `billFooter`, `nextBill`
- `Bills`: `billNo | date | customer | mobile | total | items | by | gstBill | taxable | tax | customerGstin | igst | text | lines | billId | editedAt | editedBy | edits | cost | profit`
- `Customers`: `mobile | name | gstin | bills | total | lastDate | lastBillNo` (lookup index, rebuilt from `Bills` if deleted)
- `BillHistory`: `billId | billNo | changedAt | by | oldText` (previous version of each edited bill)
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
