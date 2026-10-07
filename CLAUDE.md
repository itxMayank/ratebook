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

## Monthly totals, collapsible groups, several photos (added 3 Oct 2026)

- **Past bills** are grouped month → day → bill. Month headers show the month's bill count and total (`months` in the `listBills` reply, exact like `days`). Tap a month or day header to open or close it. Older months start closed; everything starts open while searching or filtering. Open/closed state is `BL.col` (resets on each new search or filter). Headers stay pinned at the top while scrolling (month at `--blh`, day 44px below it).
- **Photos:** up to 5 per item (`MAX_PHOTOS` in both files). In Edit item there's a photo strip: ✕ on each photo removes it, tapping a photo makes it the cover (first), and the dashed tile or Gallery adds more (gallery allows picking several at once). "Delete" was renamed **Delete item** to make clear it removes the item, not a photo.
  - Storage: every photo is its own row in the `Images` tab (the cover keyed `id`, the rest `id#2` … `id#5`). Each is at most 48,000 characters, under Google's 50,000-character cell limit, so more photos never push a cell over the limit. The `Items` row keeps only the cover's small thumbnail plus `imgV` and the new `imgs` column (photo count).
  - Backend: `setImages` (POST, PIN, `{id, thumb, photos:[{data}|{k}]}`, where `k` keeps an existing photo by key) and `GET ?action=images&id=` (all photos in order). `setImage` (one photo) is kept for older app copies; it replaces all photos with that one. Deleting an item also deletes its extra photo rows.
  - Phone cache: each photo is kept in IndexedDB `images` under its key, tagged with the item's `imgV`. The item screen shows a swipeable gallery with a "2/4" counter.

## Loaders, HSN on bill, amount in words (added 3 Oct 2026)

- **Loader kit** (CSS `.ld` ring, `.ld-block`, `.skel` shimmer, `#topbar`; JS `LD()`, `ldBlock()`, `skelCards()`, `btnBusy()`, `netTrack()`):
  - A thin animated bar at the top shows whenever the app talks to the sheet. All `apiPost` calls count, plus `apiGet` calls except `rev` and `thumbs`. The raw calls are `apiPost0` and `apiGet0`.
  - Skeleton cards show on first load (no cache yet) and while Past bills load.
  - "Opening bill…" shows while a past bill loads.
  - A ring spinner appears in the "Show more bills" and Unlock buttons, while photos are processed, on photo tiles still loading, and in "Saving…" toasts.
- **Customer lookup:** while the number is checked, the hint shows a spinner and "Looking up this number…". If nothing is found, it shows "New customer, no past bills." This only runs on unlocked phones without a local match.
- **HSN on the bill:** on a GST bill each line's HSN is a small editable box. The change applies to that bill only (`line.hsn`), never the item. Clearing it falls back to the item's HSN.
- **Amount in words:** `inWords()` uses Indian numbering (Lakh/Crore, paise). It's added under the total in the GST WhatsApp text ("Amount in words: Rupees … Only"), in rebuilt old GST bills, and in the on-screen GST breakdown.

## Credit / udhaar bills (added 3 Oct 2026)

- **Bill screen:** a three-way switch under the customer fields: **Paid** (default), **Credit**, **Part paid**. Part paid shows "Received ₹" and works out the amount due.
  - Credit and part-paid bills need a name and a 10-digit mobile (`payCheck()`): the fields get a red outline, plus a message.
  - The total bar shows a "Due ₹X" chip.
  - The WhatsApp text adds "Payment: Credit (to be paid later)" or "Paid: ₹X", then "Balance due: ₹Y".
  - State: `S.pay` and `S.recv` (`rb_pay`, `rb_recv`). Both reset to Paid after each bill. They're also part of drafts, so editing a saved bill restores them via `billPayMode()`.
- **Credit (Udhaar) screen** (Tools → Credit, needs the PIN), `listDues`:
  - Total pending and one card per customer (grouped by mobile): amount due, number of bills, and the age of the oldest bill (red after 30 days). Searchable.
  - A customer's view has **Record payment**, **Remind** (a WhatsApp message listing each open bill) and **Call**, plus their open bills.
- **Recording money** (`recordPayment`, PIN):
  - From a customer, the amount is applied to the oldest bills first, with a preview ("clear Bill 1, leave ₹48 due on Bill 2"). From a bill's screen, it goes to that bill only.
  - Optional note chips: Cash, UPI, Bank, Cheque. Paying more than is owed records only what was due.
  - A bill whose balance reaches 0 becomes **Cleared**, with `clearedAt`. **Undo last payment** (`undoPayment`) removes the latest payment made after billing.
- **Past bills:** a red "Due ₹X" pill, or a green "Paid later" pill. A bill's screen shows a payment box (total, paid, due, payment history) at the top. Resending it adds a "Payment update" line, or "Fully paid on …".
- **Customer lookup** on the bill screen also shows "₹X pending" for customers with dues (the `due` column in the Customers tab, kept current by `refreshDue_`).
- **Sheet columns** added to `Bills`: `payment` ('Paid' | 'Credit' | 'Part paid' | 'Cleared'; blank = Paid on old bills), `paid`, `due`, `payments` (JSON `[{d, a, by, at?, note?}]`, where `at:1` means received at billing), `clearedAt`. Paid bills leave `paid`/`due`/`payments` empty. Editing a bill keeps payments recorded later and recomputes the due amount from the new total.

## Test mode and real mode (added 3 Oct 2026)

- **Shared setting** `mode` in Config: `test` (the default) or `live`. It's the first card in Settings, a switch with a confirm step. It changes every phone (they pick it up on the next sync, and `switchEnv()` starts a clean bill).
- **Separate data per mode:**
  - Real: `Bills`, `BillHistory`, `Customers`. Test: `Test Bills`, `Test BillHistory`, `Test Customers`.
  - Bill numbers: real uses `nextBill`/`nextGstBill`, test uses `testNextBill`/`testNextGstBill`.
  - Shared by both: items, photos and other settings.
  - In the code: `tab_()` and `ENV_` in Code.gs; `S.cfg.mode`, `S.cfg.raw` (both sets of numbers, so the phone's saved copy stays right), `envKey()` for this phone's customer and dues caches.
- **Every POST carries `env`.** Queued bills carry their own `env`, so a test bill sent late still lands in the test tabs. Requests without `env` (an older app copy) use the Config mode.
- **One-time move** (`ensureEnv_`, runs on the first request after this update, flagged with `ENV_OK` in script properties):
  - Existing `Bills`, `BillHistory` and `Customers` tabs are renamed to the Test tabs. The test bill numbers carry on from where they were.
  - Real mode starts at No. 1, with an empty `Bills` tab.
  - The real `Customers` tab gets each customer's mobile, name and GSTIN, with counts set to 0.
- **While in test mode:** a gold TEST badge next to the shop name, a note on the bill screen, and the first line of WhatsApp bills reads "TEST BILL (practice, not a real invoice)".

## Reminder details, duplicate guard (added 3 Oct 2026)

- **No duplicate bills:** `takeBill` skips a bill whose `billId` is already among the last 500 rows of that mode's Bills tab, and replies `dup: true`. Before this, a phone that lost the server's reply re-sent the bill from its queue and it was saved twice.
- **One-time cleanup** (`dedupeOnce_`, flagged `DEDUP_OK`; counts in script property `DEDUP_RESULT`): deletes later rows that repeat an earlier `billId` in both `Bills` and `Test Bills`. Two different bills sharing a number are kept. Afterwards it recounts that mode's Customers stats with `recountCustomers_()` (names and GSTINs kept). Likely cause of the old duplicates: Share opens WhatsApp at once, Android pauses the app before the save reply arrives, and the queue re-sends the bill.
- **Reminder:** the WhatsApp text now lists each open bill with "GST" in front of GST bills, the date, every item line with its amount, then total, paid and due, and finally the total due. `listDues` returns `items` and `gst` for each bill; `itemLinesText()` turns the items summary into readable lines.

## Laptop / desktop layout (added 3 Oct 2026)

- **Phones are not affected:** every desktop rule sits inside `@media (min-width:1024px)` (plus 1280 and 1600 steps). The desktop JavaScript is gated on `DESK()` (`matchMedia("(min-width:1024px)")`). Screenshots at 390px wide were checked pixel by pixel against the previous version.
- **Layout (POS style):**
  - Left side menu instead of the bottom tabs: an icon rail at 1024–1279px, a full menu with labels and keyboard hints from 1280px. The Bill tab is hidden.
  - The price list is a card grid.
  - The **bill is always open in a fixed right panel**, with the total bar pinned to the panel's bottom.
  - Sheets become centred windows.
  - Tools is a two-column grid.
  - Hover states, focus rings, slim scrollbars.
  - In the code: `applyDesk()` (run from `renderAll`) un-hides `#view-bill`. `setTab("bill")` maps to Prices on desktop.
- **Keyboard:** `/` or Ctrl/⌘+K focuses search. Enter in search adds the top result to the bill and clears the box (unless the text looks like a plain-language command, which still opens the wand). Esc clears search or closes a window.
- Adding an item on desktop highlights the new line in the bill panel instead of showing a toast. The phone's "typing" keyboard helpers (`focusin` scroll and padding) are skipped on desktop.
- Resizing the window across 1024px switches layouts live.

## Backups (added 3 Oct 2026)

- **One-time setup:** in the Apps Script editor run `setupBackups` (choose it in the toolbar → Run → allow). This needs new permissions: Drive, triggers, external request, send mail. It creates a time trigger for `autoBackup` every 4 hours and makes the first copy.
- **`autoBackup`:** if the spreadsheet's Drive "last updated" time is newer than the last backup, it copies the whole spreadsheet to the Drive folder "Rate Book backups" as "Rate Book backup yyyy-MM-dd HH:mm" (Asia/Kolkata). Then `pruneBackups_()` keeps every copy from the last 2 days, the newest per day up to 30 days, and the newest per month up to 12 months. The rest go to the Drive Trash.
- **Weekly Excel email:** `weeklyMail_()` emails an .xlsx export once a week to `BK_EMAIL`, if one is set.
- **App** (Settings → Backups, PIN), using actions `backupInfo`, `backupNow`, `setBackupEmail` and `restoreBackup`:
  - Status line, **Back up now**, the list of backups (Open in Sheets / Restore), and the weekly email address. The address is kept in script properties, not Config, so it isn't public.
- **Restore** never deletes anything:
  - It takes a "(before restore)" backup of the current sheet, makes a fresh copy of the chosen backup, and points `SHEET_ID` (property and cache) at it, then bumps rev so every phone reloads.
  - Undo = restore the "(before restore)" copy.
  - The old main sheet stays in Drive.
- **Script properties used:** `BK_FOLDER`, `BK_LAST`, `BK_SRC_TIME`, `BK_EMAIL`, `BK_MAIL_LAST`, `BK_MAIL_ERR`, `BK_RESTORED_AT`, `BK_RESTORED_FROM`.
- **Google Sheets' own File → Version history** is still there for fine-grained rollback inside one file.

## Design refresh (added 3 Oct 2026)

- **Visual layer only.** No IDs, functions or behaviour changed. The "Design refresh" CSS block sits before the desktop block.
  - Font: Plus Jakarta Sans, with Mukta for Hindi.
  - Tokens: `--ink`/`--ink-fg` (near-black in light mode, near-white in dark) for main buttons, selected chips and segments, and the tab bar. `--accent` (maroon) kept for highlights, the in-bill state and badges.
  - Shapes: soft off-white background, borderless white cards with large radii and soft shadows, pill buttons and inputs.
- **Phones:** a floating ink pill tab bar (inside `@media (max-width:1023px)`, so the desktop sidebar is unaffected) with a light capsule on the active tab. Body, FAB, total bar and toast offsets were moved up to clear it.
- **Header:** greeting "Namaste, {name}" (`#hello`, from the unlocked name) above the shop name, which is cut off with … if too long.
- **Filter chips** under the search (`#fchips`, `S.filter`): All / In bill / Changed this week / With photo, with counts. A chip only shows when it has items.
- **Item screen with a photo:** `.hero-mode` on `#sheet` (set in `openDetail`, cleared in `openSheet`). The photo goes full-bleed with a round close button over it, and a `.d-card` with the name overlaps the photo.
- **Desktop:** active sidebar item in ink, bill panel on `--bg` with white cards.

## Size tweaks and text size (added 3 Oct 2026)

- **Smaller floating controls:** the phone tab bar (narrower, 11px labels, 21px icons), the Add button (48px) and the "+ Bill" pills.
- **Bill items:**
  - Numbered with a CSS counter (an ink circle before the name) and an outline border, so they stand out from the background.
  - The controls row is a 3-column grid (stepper | unit + rate in `.uwrap` | ×), so the × never wraps under the stepper.
- **"Prices up to date" bar:** hidden on the Bill screen unless the phone is offline (`renderNet`).
- **Text size (per phone):** Settings → first card, Normal / Large / Larger / Largest = 1, 1.12, 1.25, 1.38, stored in `rb_fz`.
  - `setFz()` sets `--fz` (CSS `zoom` on the header, views, sheets and toast) and `--fz2` (half as much, for the tab bar and Add button).
  - The `html.fz-big` class (sizes from 1.25 up) hides the greeting and the header wand, shows Share as an icon only, and tightens the total bar.
  - Sticky total offset and desktop bill-panel width are divided by `--fz` so they stay right.
  - Locked phones can change it too.

## Themes and appearance (added 3 Oct 2026)

- **Per phone, in Settings:**
  - Theme: Ink (default, black and white), Maroon, Forest, Indigo, Saffron. Stored in `rb_palette`, applied as `data-palette` on `<html>`; Ink has no attribute.
  - Appearance: Auto / Light / Dark. Stored in `rb_appear`, applied as `data-theme` on `<html>`; Auto has no attribute and follows the phone.
  - `applyTheme()` runs at startup and when the phone's dark setting changes. It also sets the `theme-color` meta (status bar).
- **Each palette sets these tokens:** `--ink`/`--ink-fg` (primary), `--ink-soft`, `--accent`, `--bg`/`--surface-2` tint, with a lighter set for dark mode.
  - Coloured themes use soft "+ Bill" pills (`--addbg`/`--addfg`) and a solid in-bill state (`--inbg`/`--infg`). Ink keeps a black "+ Bill" and a maroon in-bill state.
  - In dark mode, coloured themes switch the phone tab bar and toasts to neutral grey (`--nav-*`, `--toast-*`), with only the active tab in the theme colour.
- **Contrast checked (WCAG):** buttons ≥ 5:1 and soft buttons ≥ 5.2:1 in every theme and mode. Saffron uses #A14B07 in light mode for this reason.
- **Adding a theme:** add an entry to `PALETTES` in JS, a `:root[data-palette=…]` block plus its two dark blocks in CSS, and a `th…` string.

## Tile contrast, add feedback, Back button (added 3 Oct 2026)

- **Tiles inside sheets** (bill cards, customer cards, backup items, payment box, skeletons) get a 1.5px `--line` outline and no shadow, so they don't blend into the white sheet. In-sheet search boxes and chips use `--surface-2`. Dark-mode sheets use #141518.
- **Add to bill on phones** (Prices tab): no toast. `flyToBill()` animates a dot from the tapped button to the Bill tab, then pops the badge and nudges the icon, with a 12 ms vibration. It respects reduced motion. The source button is captured on `pointerdown` (`window.__addSrc`), and its position is measured *before* `renderList()` redraws the card (after the redraw the old button is detached and would report 0,0, which made the dot start at the top-left). If that fails it falls back to the item's new `[data-add]`/`[data-decid]` button, or just pops the badge.
- **Search clearing**: switching tabs (`setTab` to a different tab) empties the search, including the Past bills and Credit screen searches (`BL.q`, `duesQ`). Adding an item from the Bill tab search, or from the desktop list while searching, clears the box and results; on phones it also closes the keyboard and flashes the new line. On the Prices tab the search stays after "+ Bill", so several results can be added.
- **Main search x (`#q-clear`)** is a small grey circle (`.search .iconbtn.clear`). It used to inherit the white icon colour of the mic button and was invisible on the white search box.
- **Clear (x) on every search box**: `addSearchX()` wraps any `input[type=search]` (except `#q`, which has `#q-clear`) and adds an x. A MutationObserver applies it to boxes drawn later in sheets. The x fires an `input` event, so the box's own handler runs.
- **Profit figures**:
  - Lines with no buy price (missing or 0) are now left out of profit completely, both their sale and their cost. Before, `profitOf()` counted their whole sale as profit, which inflated the amount.
  - The report's Profit stat is built from bill lines (`T.pSale`, `T.pCost`, `T.noBuyAmt`, `T.lineSale` from `report_()`), not from the stored per-bill profit, so old bills saved with an inflated profit no longer distort it.
  - The % shown is profit over cost, the same as "Margin" on item cards. Tapping the stat opens the breakdown: sales with a buy price − buy cost = profit, % over cost, % of those sales, plus notes about items left out and GST/round-off.
  - Bill lines saved without a buy price use the item's **current** buy price in reports (`curBuyMap_()`, matched by id, then by name; for alt-unit lines it's buy ÷ altQty). Once a buy price is set in the price list, reports recalculate on their own; the bills themselves aren't changed. These amounts are counted in `T.estAmt` and per item in `estQty`, and the breakdown and item detail say so. Lines whose item still has no buy price stay out of profit (`T.noBuyAmt`).
  - `SCRIPT_VERSION` 11 / `NEED_SV` 11.
- **Editing a bill opened from the Credit screen**: the credit list (`listDues_`) used to leave out `edits`, `fy`, `igst`, `custGstin` and `pos`. The app then assumed 0 edits, so any bill that had been saved once (for example after Share) failed with "someone else changed it". GSTIN and IGST could also be lost on edit. Now:
  - `listDues_` and `getBill_` return those fields, and `showBill` merges them from `getBill`.
  - `startEdit` stores `edits:null` when the count is unknown, and `saveEdit` then skips the `baseEdits` check rather than blocking the save.
  - `SCRIPT_VERSION` 9 / `NEED_SV` 9.
- **Reports**: always open on **Today** (`openReports` resets `RP.k`). Tapping a top item expands `rpItemDetail()`, which shows:
  - number of bills, quantity and sales
  - average selling price (sales ÷ qty, with the sum written out)
  - the prices charged, with qty and bills at each price
  - average buy price and profit, with the calculation (when `showProfit` is on and buy prices are visible)
  - a note when some lines had no buy price saved, and a note that GST-bill prices are before GST

  `report_()` in Code.gs now returns per item: `bills, cost, costQty, costAmt, gstQty, min, max, rates[], profit`. Profit uses only lines that saved a buy price. `SCRIPT_VERSION` 8 / `NEED_SV` 8. The Item sales CSV gained Bills, Avg selling price, and (with profit on) Avg buy price and Profit.
- **Notifications (toast) top-right**: `#toast` slides in from the right edge at the top (springy ease), stays about 2.8 s, then slides back out to the right. It briefly covers the wand and EN/हि buttons, but taps pass through (`pointer-events:none`). On desktop it sits at the right edge of the middle column, left of the bill panel. The CSS override is at the end of the `<style>`.
- **No financial-year prefix on GST bill numbers** (the shop doesn't use one):
  - `dispNo()` always returns the plain number, everywhere: bill screen, WhatsApp text, PDF, Past bills and the invoice-register CSV.
  - `stripFyPrefixOnce_()` (run once from `list`, flag `FYPFX_OFF`) removes the prefix from saved GST bill texts in both modes. It only touches GST rows, and only an `NN-NN/number` pattern where the second year is the first + 1. BillHistory is left as it was.
  - The "Start GST invoice numbers from 1 every April" setting (`fyReset`) still controls the yearly restart, and bills still store `fy`.
  - `SCRIPT_VERSION` 16 / `NEED_SV` 16.
- **Customer suggestions on the bill (name, mobile, GSTIN)**:
  - A typeahead under the name/mobile row (`#sug-cust`) and under GSTIN (`#sug-gstin`). Nothing opens on tap; it opens only when typing matches: name 1+ letters (start of name, then start of a word, then anywhere), mobile 3+ digits, GSTIN 2+ characters. Up to 5 rows show name, mobile, GSTIN, bills and due.
  - Tap (or ↑/↓ + Enter on a laptop) fills name, mobile and GSTIN, shows the returning-customer hint at once, then `findCustomer` refreshes it.
  - Data: `listCustomers` (Customers tab, compact arrays) cached in IndexedDB (`images` store, key `cust:<mode>`). It's refreshed when a customer box gets focus (at most every 15 s), using the same bills version (`brev`) as Past bills: "same" means nothing is downloaded. Customers remembered on this phone (`rb_customers`, not yet on the sheet) are merged in. Locked phones use only the phone's own remembered customers, as before.
  - Browser autofill is discouraged with made-up `autocomplete`/`name` values, and the mobile box is `type=text inputmode=tel`; Chrome ignores `autocomplete="off"` on name/phone fields.
  - `SCRIPT_VERSION` 15 / `NEED_SV` 15 (`listCustomers` is in the read-only list, so it doesn't bump the price-list rev).
- **Past bills search runs on the phone**:
  - `listBills` with `full:true` returns up to 3000 recent bills. The app keeps that copy in IndexedDB (`images` store, key `bills:<mode>`, in memory as `BLC`).
  - Search and the year/date filters run on the copy (`blcQuery`, same matching as the server), at about 0.1–0.2 s.
  - **Sync between phones**: every bill change bumps a bills version (`brev_<mode>` script property, `bumpB_`) and logs the changed bill id in `blog_<mode>` (last 150 entries).
  - Every time Past bills opens, the phone shows its copy at once and asks the server with its `brev`. The reply is one of:
    - `same`: about 80 bytes, nothing changed;
    - `delta`: only the changed bills, which replace or prepend by id;
    - full copy: after hand edits in the sheet (`onEdit`/`watchSheet`), a restore, deleted rows, a payment spread over several bills, or a copy too old for the log.
  - Opening a bill always re-reads it with `getBill` (if not read in the last 30 s), which now returns payments, due, cancel and edit state. So a bill changed on another phone shows its latest state, and the edit-count check still blocks overwriting.
  - Bills made on this phone but not yet sent (`S.billQ`) are merged into the list, so they don't disappear when the copy refreshes.
  - **Kept fresh in the background** (`SCRIPT_VERSION` 17):
    - Every bill made on this phone goes into a small local list (`rb_bloc_<mode>`, via `blcAdd`) at once, whether or not Past bills was opened since the app started. `blcQuery` merges it until the copy contains that bill (or after 30 min). Before, `blcAdd` did nothing when the copy wasn't loaded in memory, so bills sent quickly in a row could be missing until a second open, and a refresh that finished just after a bill was sent could hide it.
    - After the queue is sent, and after any bill change through `apiPost`, `blcSoon()` runs one batched delta refresh (1.2 s debounce, waits while bills are still sending).
    - The 25-second `rev` check now also returns `bl`/`bt` (bills version per mode, from CacheService, so no Properties quota). If it differs from the copy's `brev`, the phone pulls the delta quietly, so bills from other phones are already there when Past bills opens. Only for unlocked phones that already keep a copy.
    - If Past bills is open, it redraws in place (`blcShow`, scroll kept) and briefly highlights bills that just arrived (`.bl-new`). A small "Updating" spinner (`#bl-sync`) shows while a refresh is running.
  - Size: about 0.5 KB per bill raw, so the 3000 cap is about 1.5 MB of phone storage at most (less after browser compression). Network is tiny except for a full copy.
  - "Search older bills on the sheet" button beyond 3000 bills; falls back to server search with an older script.
  - `SCRIPT_VERSION` 14 / `NEED_SV` 14.
- **Files (PDF/CSV)**: `shareFile()` downloads straight away on a laptop, or on a phone that can't share files. On phones it opens a small bottom sheet (`#fileact`) with **Download** (saves to Downloads) and **Share**. The share call happens on that tap, which also fixes shares failing after slow PDF builds. Back closes the sheet.
- **Always open the sheet with `ss_()`**, never `SpreadsheetApp.getActiveSpreadsheet()`: the script may be standalone (made at script.google.com), where that returns null. `pop_()` used it, so most-sold order silently came back empty on the real setup (fixed in `SCRIPT_VERSION` 12). The test mock now returns null for `getActiveSpreadsheet()` once `SHEET_ID` is set, to catch this.
- **Most-sold order (default)**: `pop_()` in Code.gs counts, per item id, the number of *real* bills (`Bills` tab, never Test) the item appears on. Quantity doesn't matter, the same item twice on one bill counts once, and cancelled bills don't count. Cached 30 min under `pop:<row count>` (a new bill changes the key), and cleared by `popReset_()` on cancel/restore and bill edits. Returned as `pop` in `list`; `SCRIPT_VERSION` 7 / `NEED_SV` 7.
  - App: `S.pop` (saved in `rb_cache`), `sortItems()` sorts by count, then A–Z. Search keeps relevance first, then count. The order changes only when the list reloads (app open, or a price change from any phone), so cards don't jump mid-bill.
  - The sort control is a two-button switch, **Most sold | A–Z**, at the right of the "N items" line (`#meta-r`, `.sortseg`), saved per phone in `rb_sort`. It was a single toggle chip whose label showed the current mode, which was easy to tap by mistake and leave on A–Z. This update resets every phone to Most sold once (`rb_sort_v2`). Cards show "On N bills" next to Buy/Margin (only where buy prices are visible).
- **Open (held) bills, phone-only**: several bills can be open at once. The bill on screen is the normal state (`S.bill`, `S.cust` …); the others live in localStorage `rb_held` (per mode via `envKey`), each a snapshot `{hid, at, held, d:{...draftState(), posSel, cash}, editing, stash}`.
  - Entry points: "New bill" chip beside the "Bill items" heading (only when there's no held bill and the screen bill isn't empty), and the "+ New" chip at the end of the row.
  - `#heldrow` (above the bill head) appears only when at least one bill is held; otherwise it takes no space. Chips are sorted by when each bill was started (`rb_draftat`), so they don't jump around when you switch. Tap = `resumeHeld` (the screen bill is held in its place if not empty); long-press 600 ms = remove (asks). Desktop: Alt+1…9.
  - Chip label: customer name, else "#n · editing" for a past-bill edit, else mobile, else first item "+N". Total uses `heldTotal`, which briefly swaps the bill fields to reuse `billTotal()` (GST and round-off match).
  - Numbers are taken only at Done/Share (unchanged), so whichever bill finishes first gets the next number in its own series (normal or GST); a removed held bill uses no number.
  - Editing a past bill still uses `rb_stash`; holding an editing bill carries its `editing` object and stash with it, so cancelling the edit later still restores the draft.
  - Prices tab shows "Adding to: X · +N open" (`#addto`, phones only) while any bill is held. It has `overflow:hidden; min-width:0`, because without them its no-wrap text widened the grid and the whole page scrolled sideways.
  - Max 8 open bills (`HELD_MAX`). A held bill from an earlier day gets an "old" tag.
- **Past bills quick filters**: chips after Year/Date in the same scrolling row (`.bl-chips`): GST · Normal · Credit / due · Cancelled · Edited (`BL.f`, `blF()`). Tap again to turn off; ✕ clears all filters. Applied in `blcQuery` (so day/month totals and the summary follow it) and to server-search results. With Credit / due on, the summary also shows the total due.
- **Bill-tab search results with quantity**: each result (`.mini`, now a div) shows a small `+` or, when the item is already in the bill, `− qty +` (`searchStep()`, kg/L quarter steps, "250g" display). These change the quantity without closing the search or the keyboard, so searching the same item again shows what's in the bill. Tapping the row itself still adds and closes the search. In-bill rows get an accent border.
- **Groups, other names and photo grid** (`SCRIPT_VERSION` 18 / `NEED_SV` 18):
  - `Items` gains `aliases` (comma-separated names customers use, up to 300 chars) and `cat` (group, up to 40). `list`, `pub_` and `upsert` carry both.
  - **Search:** `buildIndex()` adds aliases and group to each item's tokens, so "thaili", "थैली" or "glass" find the item (same fuzzy/Hindi matching as names). When the hit came from another name, the card shows "Also: thaili" (`akaHTML`).
  - **Group chips:** in the existing filter row (`renderFilters`): All · groups (most items first, with counts) · then In bill / Changed this week / With photo. Same single scrolling row, so no extra height. `S.filter` is `c:<group>` for a group.
  - **Edit item:** "Other names" and "Group" fields; group chips under it (existing groups plus a suggestion from the name, `guessCat`). `normCat()` reuses an existing group's spelling.
  - **Tools → Groups & other names** (`openGroups`, manager+): every item as a row with Group and Other names boxes. Empty groups are pre-filled from `CAT_RULES` (packaging words: bags, cups, plates, containers, foil, film, tape, spoons/straws, tissue, bottles, rubber bands), shown grey italic. Saves only changed rows, in batches of 100. "Only items without a group" filter.
  - **Photo grid** (per phone, `rb_layout`): a button next to Most sold | A–Z switches the list to 3-column tiles (`#list.gridv`, CSS only, same card markup).
  - **Auto group + business types** (`SCRIPT_VERSION` 19 / `NEED_SV` 19):
    - `BIZ` holds per business type (plastics, kirana, stationery, hardware, other) a suggested group list and word rules (English + Hinglish). Config `bizType` (owner sets it in Tools → Groups & other names; Settings → Item groups links there). When unset, `bizType()` works it out from groups already in use, then from the shop name.
    - `guessCatInfo(name)`: (1) an item already in a group with mostly the same words (Jaccard ≥ 0.5 on `catWords`, size/unit words skipped) → its group; (2) words that in this shop almost always mean one group (≥ 75%); (3) the business type's rules. Model `CAT_M` is rebuilt with the search index.
    - Edit item: Group is a chip picker of `allGroups()` + "+ New group". New items (and items without a group) get the guess automatically while the name is typed, tagged "auto", until a chip is tapped (tap the selected chip again to clear). Bulk add and plain-language add apply `withCat()` to new items.
    - Group list: Config `groups` (JSON) via the new `setGroups` action (manager+). `allGroups()` = that list + groups used on items, so a new group shows in the edit picker, the Groups tool and (once an item has it) the filter chips on every phone.
    - Groups tool top section: type of business, group chips with counts (tap → rename / remove; `renameGroup()` re-saves the items, then the list), "+ New group", and "Add N suggested groups" for the business type.
  - Visual (camera) search was discussed and parked: few items have photos and most products are plain/loose, so image matching and text reading wouldn't be reliable yet.
- **Printing** (`index.html` only; per phone/laptop setting `rb_print` = `{paper, via, auto}`):
  - **Where:** Print in the bill's ⌄ menu (Copy · PDF · Print · Clear, one row), a printer icon in the "Last bill" row after Done (uses `rb_lastinv`, saved by `finishBill`; its number follows a server renumber), and Print next to PDF on a past bill. Settings → **Printer (this phone / laptop)**: paper A4 / A5 / 80 mm / 58 mm, connection for roll paper, "Print automatically after Done" (off by default; only the Done path of a new bill, not Share), and "Print a test bill".
  - **One model:** everything prints from the same `inv` object as the PDF (`invFromCurrent()` / `invFromBill()`); sums come from `prCalc()` (`gstCalcFor`, so totals match the screen).
  - **A4/A5 (`prHtmlInvoice`)**: full invoice; GST bills add HSN/tax columns, tax summary, HSN table, amount in words. **58/80 mm (`prHtmlReceipt`)**: narrow monospace receipt; GST receipts keep GSTIN, place of supply, HSN/GST per line and the CGST/SGST/IGST split.
  - **How it reaches the printer (`via`, roll paper only):**
    - `system`: `prSystem()` fills `#printroot` and calls `window.print()`. `body.printing` is never removed on `afterprint`: Android Chrome fires it at once and renders the printout afterwards, which printed the whole app (fixed). The page title is set to "Bill 10 - Customer" during printing, so a saved PDF gets that name; it's restored on the next tap. Print CSS (`body.printing`) hides everything else. `@page` size is set per print (`A4`/`A5` with 12 mm margin; roll = width × measured content height, margin 0). Used for office printers and USB/Wi-Fi receipt printers that have a driver.
    - `rawbt`: Android + Bluetooth receipt printer via the free RawBT app. `escpos()` builds ESC/POS bytes from `receiptLines()` (32 columns for 58 mm, 48 for 80 mm, ASCII, double-size shop name and total) and opens `intent:base64,…#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;` (Play Store page if RawBT isn't installed).
    - `image`: `receiptPng()` draws the same lines on a canvas 384 px (58 mm) / 576 px (80 mm) wide and shares it with `shareFile()`, for iPhone Bluetooth printers that print through the maker's app.
  - Not yet tested on real printers: RawBT intent format and roll page sizing are from documentation and Chrome's print preview.
- **Loose quantities (250 g of a kg item)**, `index.html` only:
  - Applies to lines whose unit is kg or litre (`fracSub()` via `UNIT_ALIASES`: kg → g, L → ml). Pc/packet/roll lines are unchanged.
  - Phones: the qty box on those lines is `readonly` (no keyboard). Tapping it opens the quick strip `#qpick` (fixed, floats under the box, follows scroll, closes on pick/outside tap/Back): 250g · 500g · 750g | 1 · 1.5 · 2 · 5 | keyboard icon. `QP_PARTS`/`QP_WHOLE` hold the presets. The keyboard icon makes the box editable for odd amounts; leaving it redraws the line.
  - − / + (`stepQty`) move in quarters below 1 kg (1 → 750g → 500g → 250g → removed) and by 1 above. Same on the Prices card stepper.
  - Display: under 1 the box shows "250g" (`qtyShort`), the unit label moves after the rate ("× ₹220 /kg", hidden at the larger text sizes). WhatsApp, PDF, reminders and rebuilt old bills say "250 g × ₹220/kg = ₹55" (`qtyText`, `rateText`). Still stored as 0.25 kg, so the items summary, reports, profit and most-sold are unchanged.
  - Typing: `parseQty` accepts "250g"/"500 ml" (laptop). A whole number 50–999 typed on a kg/L line shows a one-tap "250 g?" chip (`qpHint`); it's never converted automatically.
  - Laptop: clicking the box opens the same strip and selects the value; typing closes the strip and works as normal ("250g" accepted). Esc closes it, Enter closes and leaves the box.
- **Cash given / change**: a row under the total (`#cashrow`). Shows next-note chips (`cashNotes`: rounded up to 50/100/500/2000) or a typed amount, then "Return ₹X" (green), "Short ₹X" (red) or "Exact". It compares against the total for Paid, or the received amount for Part paid; hidden for Credit. Kept in memory only (`S.cash`), never saved or sent; reset when a bill is finished, cleared or an edit ends.
- **Fly animation while searching**: when the search box is focused and has text, the tab bar is hidden (`body.typing`), so the Bill tab measured 0,0 and the first dot flew to the top-left. `flyToBill` now closes the keyboard and shows the bar first, then aims (clamped to the visible screen while the keyboard is closing).
- **Tab bar while the search is focused (phones)**: `syncQe()` sets `body.qe` when `#q` is focused and empty; CSS keeps the tab bar and Add button visible, lifted above the keyboard with `--kb`. Once something is typed they hide as before. Other inputs still hide the bar.
- **Number boxes are centred**: one CSS rule (`input[inputmode="decimal"], input.num, .bill-line .rate input, .billno input, #bill-no, #pay-recv, #rp-amt, .gridwrap input, .t.num`) sets `text-align:center`. Add new price/qty inputs to it or give them `inputmode="decimal"`. The Bill tab and desktop keep their own feedback.
- **Messages** are a small centred pill: just above the Add button on Prices, just above the total bar on Bill (worked out from its position in `toast()`), and just above the tab bar elsewhere (`body[data-tab]`).
- **Back button:** one guard entry in history (`pushGuard`). On `popstate`:
  1. close the unit picker;
  2. else in a sheet, click its visible `*-back` button (bill → list, customer → Credit list, backups → Settings), otherwise close the sheet;
  3. else switch to Prices;
  4. else show "Press back again to exit", and a second press within 2 s leaves the app.

## Vendor khata (added 7 Oct 2026, `SCRIPT_VERSION` 20 / `NEED_SV` 20)

What the shop owes its suppliers. Tools → **Vendors** (owner + manager; server `NEEDS` = manager). Test mode keeps its own data.

- **Sheet tabs** (via `tab_()`, so `Test …` in test mode):
  - `Vendors`: `id | name | mobile | gstin | address | creditDays | opening | openingDate | token | linkOn | note | createdAt | updatedAt | by | removed`
  - `VendorLedger`: `id | vendorId | type (bill/pay/adj) | date | amount | gst | billNo | mode | ref | noteV | noteP | photos (JSON [{f,m}]) | alloc (JSON {billId: amount}) | by | at | editedAt | editedBy | removed | history (JSON)`
  - `VendorDocs`: `fileId | vendorId | preview (small JPEG data URL) | mime | at`
  - Dates, bill numbers, refs, mobile, GSTIN and token are written as text (`VTXT_`, leading `'`), so Sheets doesn't turn them into dates or numbers.
- **Bill photos / PDFs:** full quality (up to 1600 px, JPEG ~0.85, under ~650 KB) saved as files in the Drive folder "Rate Book vendor bills" (test: "… (test)"; ids in script properties `VD_FOLDER_live` / `VD_FOLDER_test`). Needs Drive permission: run **`setupVendorDocs`** once in the Apps Script editor. Without it uploads fail with `drive_auth` and the app says how to fix it. The phone caches previews (`vprev:<fileId>`) and full files (`vfull:<fileId>`) in IndexedDB.
  - Before saving: rotate per photo, and "Make text clearer" (a contrast stretch to near black-and-white, for faded thermal bills). PDFs up to 10 MB are kept as they are.
- **Money logic (`vCalc_`):** balance = opening + bills − payments − returns. The opening balance counts as a bill (`open:<vendorId>`).
  - Payments/returns store which bills they cover (`alloc`); paid amounts per bill are capped at each bill's amount, so editing or removing a bill turns its paid part back into advance. Advance = payments not allocated.
  - Bill status: open / part / paid. Due date = date + vendor credit days; overdue when past it.
- **Payment form (`vForm` + `vAlloc`):**
  - Tick bills (optional). Ticking with an empty amount fills in their total. With an amount typed, it fills ticked bills in tick order.
  - Nothing ticked = oldest first. An amount over the ticked bills asks: keep as advance, or put on the oldest other bills (required choice).
  - A live line shows exactly what each bill gets. A bill's screen has **Pay this bill** (pre-ticked).
  - "Use ₹X advance" on a new bill (checkbox) or on an open bill (`vUseAdvance`).
- **Entries:** two notes, `noteV` (vendor sees it in the PDF and on the link) and `noteP` (private, marked 🔒). Edit keeps a `history`; Remove is a soft delete (`removed`). Both show a 5-second **Undo** bar (`vSnack`) instead of a confirm dialog.
- **Viewer (`vViewer`):** full screen, pinch-zoom, double-tap zoom, swipe between pages, rotate, save/share. The preview shows first, then the full file. The phone's Back closes it (`#vview` checked first in `popstate`).
- **Offline:** a new entry made with no signal (photos too) is stored in `rb_vq_<mode>` plus IndexedDB `vqf:<key>`, and sent by `vqFlush()` when online or when Vendors opens. Edits and removals need a connection.
- **Statement PDF (`vStatementPdf`):** period All / This FY / Dates. It has the opening for the period, every entry with a running balance, totals, the open bills with due dates, and optional pages with each bill photo (PDF attachments are listed). Plus a WhatsApp line with the balance.
- **Vendor's link:** `vendor.html?t=<token>` (a separate page next to `index.html`; keep its `API_URL` the same).
  - The token is `t`/`l` + 22 hex characters (it carries the mode). `GET ?action=vpub|vpubprev|vpubfile&t=` needs no PIN and returns only that vendor's non-removed entries, without private notes or history. `vpubfile` only serves files attached to that vendor.
  - The link can be turned off (`linkOn`) or replaced (`vLink` with `regen`). The page has Ledger/Bills tabs, photos, and Download/print statement.
- **sw.js** (`rb-shell-4`): only `/` and `index.html` are saved as the offline app. Before, any page (e.g. `vendor.html`) overwrote the saved `index.html`.
- **Speed: local copy + outbox** (`SCRIPT_VERSION` 21 / `NEED_SV` 21). Everything shows from the phone, nothing waits on the sheet:
  - `VDB.srv` = the sheet's vendors and entries as last synced (IndexedDB `v:<mode>:all`). `vSync` (POST, manager) sends the phone's `vrev`. The script keeps `vrev_<mode>` (property + cache, bumped by every vendor write) and replies `{same:true}` without reading any tab when nothing changed, else the full set. Phones sync when Vendors or a vendor opens (at most every 8 s) and once ~5 s after the app starts, so the first open is instant too.
  - Every change goes into the outbox `rb_vq_<mode>` (`vqAdd`): new or edited vendor, entry save, remove/restore, use advance. It's shown at once: `vRebuild` applies the outbox on top of `srv` and works out balances on the phone (`vCalcJS`, same sums as `vCalc_`). `vqFlush` sends one change at a time in the background: photo uploads first (kept in IndexedDB `vqf:<key>`, shown from there meanwhile as `local:<key>`), then the save. Each reply carries that vendor's fresh data (`vMerge`); then one `vSync`.
  - Rows still being sent show "sending…", and a line on top shows "Saving N changes…". With no signal, they wait and go when online (retry every 20 s). Server refusals drop that change with a message; `drive_auth` keeps it and shows the setup hint.
  - Undo drops the change if it hasn't gone yet, else sends the opposite change.
  - Script side: each request reads the two tabs once (`vAll_`, passed around). New entries carry `isNew`, so a resent one isn't saved twice.
  - New vendors get their id on the phone (`vId("v")`), so bills can be added straight after; the link toggle waits until the vendor is saved.
- Not done yet: purchase bills updating stock or item buy prices; vendor "✓ balance confirmed" button.

## Gap fixes: security, correctness, GST, roles, reports (added 4 Oct 2026)

**Security**
- **Wrong PINs** are counted per phone (`dev`, a random id kept in `rb_dev` and sent with every request): `MAX_FAILS` (8) per 15 minutes locks that phone only. `GLOBAL_MAX_FAILS` (60) per hour locks everyone.
- **Shop code** (script property `VIEW_CODE`, owner sets it in Settings → Shop code):
  - Without it, `GET list` returns `buy:null` with `limited:true`, and `takeBill` returns `need_code`.
  - The phone sends `k` (`rb_view`) on list requests and bills. Unlocked phones get the code from `verify` automatically.
  - Locked phones see a "Enter the shop code" card (`#code-note`).

**People and roles**
- **Personal PINs:** script property `USERS` = `[{id, name, h, role, active}]`, where `h` is a salted SHA-256 (salt in property `SALT`). The shop PIN still works and means owner (name typed).
- **Roles:**
  - owner: everything
  - manager: prices, bills, credit, undo payment, cancel, reports
  - staff: bills, past bills, credit and collecting payments
- `NEEDS` maps each action to the minimum role; `not_allowed` otherwise.
- `verify` returns `{me:{name, role, personal}, view}`. `refreshMe()` re-checks once per app start (role changes, removed PINs lock the phone).
- The app gates price editing with `can("manager")` and settings with `can("owner")`.

**Correctness**
- **Hand edits:** `ensureTriggers_()` (from `GET list`) installs a 5-minute `watchSheet` trigger. It bumps rev when Drive's last-updated time is newer than rev + 15 s. This needs the permission from running `setupBackups` once.
- **Duplicate bill numbers:** `takeBill` checks the series (normal or GST; GST within the financial year). If the number is taken, it uses the next free one, rewrites the number in the stored text (the phone sends `noLine`/`noToken`) and returns `renumbered:{from,to}`. The phone shows "Bill number changed". A number typed below the next auto number shows a warning.
- **Share saves the bill straight away and keeps it open:**
  - `finishBill({keep:true})` records it (queued as usual) and turns the screen into a "fresh" saved bill: `S.editing.fresh`, with `sig` holding the content at save time. A green bar says "Bill 7 is saved. Changes here update it.", with a "New bill" button.
  - Changes after that update the same bill. If it's still queued, `saveEdit` replaces it in the queue; otherwise it sends `updateBill` with `fresh:true`, which doesn't set the Edited marker.
  - On return from WhatsApp, `askSent()` asks "Did it go?": Yes saves any changes and clears the screen; No keeps it.
  - Done / New bill with no changes just clears.
  - If the server renumbers the bill, the open bill's number updates too.
  - Waiting bills are retried when the connection returns and on each 25-second check.
- **Script version:** `SCRIPT_VERSION` in Code.gs is returned as `sv` by list. If it's below `NEED_SV` in the app, managers and owners see an "Update the sheet script" note, and `bad_action` errors say how to deploy a New version (they used to say "check your connection").
- **Conflicts:** item edits send `base` (`updatedAt` when opened). The server skips stale rows and returns `conflicts:[{id, by}]`, and the phone reloads. Bill edits send `baseEdits`; the server throws `bill_changed` if someone else saved since.
- **Queue bar** (`#queuebar`): "N bills waiting to send · Send now", or red when the shop code is needed.
- **Cancel bill** (manager+): `cancelBill`/`restoreBill` set `status='Cancelled'`, `cancelledAt`, `cancelledBy` and `cancelReason`, plus a BillHistory row. Cancelled bills are left out of totals, dues, customer stats and reports, can't be edited, show struck through, and their text and PDF are marked CANCELLED.

**GST**
- **Financial year:**
  - Bills store `fy` ('2026-27'). Config `fyReset` (default on) restarts the GST series each April (`gstFy`/`testGstFy` track the year; the first run only records it).
  - GST numbers are shown as plain numbers (`dispNo()`, no year prefix), and the WhatsApp text says "Invoice No: …".
  - Normal bills keep counting.
- **Place of supply** (`posCode()`/`posLabel()`):
  - Taken from the customer's GSTIN state, else the state picked for IGST (`#pos-sel`), else the shop state (Settings → Shop's state, or the first 2 digits of the shop GSTIN).
  - Entering an out-of-state GSTIN switches IGST on.
  - Stored in the `pos` column and shown on the text and PDF.
- **PDF invoice** (Bill screen ⌄ → PDF; Past bill → PDF):
  - Built with jsPDF + AutoTable, bundled as `pdf.js` next to `index.html` and loaded on first use (then cached by the service worker).
  - Contents: shop and customer details, item table with HSN, tax lines, round off, amount in words, HSN summary, paid/balance for credit, and a TEST banner in test mode.
  - Shared through the phone's share sheet (`navigator.share` with files), or downloaded.
  - ASCII only (₹ becomes "Rs.").

**Reports** (Tools → Reports, manager+), `report` action:
- Periods: today, yesterday, this week, this month, last month, this FY, last FY, or custom.
- Shows: sales, bills, average, GST, profit, credit received / given / pending, daily trend chart, top items, and a GST summary (B2B/B2C, by rate, by HSN).
- CSV exports: invoice register, HSN summary, item-wise sales (Excel-friendly, with a BOM).

**Sheet changes**
- New `Bills` columns: `fy`, `status`, `cancelledAt`, `cancelledBy`, `cancelReason`, `pos`.
- New script properties: `USERS`, `SALT`, `VIEW_CODE`.

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

- `Items`: `id | name | nameHi | unit | buy | sell | thumb | imgV | updatedAt | updatedBy | hsn | gst | altUnit | altQty | altSell | imgs`
- `Config` (key/value): `shopName`, `units` (JSON list of `{code, hi}`), `defaultUnit`, `roundTo` (1, 0.5 or 0), `billFooter`, `nextBill`
- Bills tabs (`Bills` for real, `Test Bills` for test; same for `BillHistory` and `Customers`): `billNo | date | customer | mobile | total | items | by | gstBill | taxable | tax | customerGstin | igst | text | lines | billId | editedAt | editedBy | edits | cost | profit | payment | paid | due | payments | clearedAt`
- `Customers`: `mobile | name | gstin | bills | total | lastDate | lastBillNo | due` (lookup index, rebuilt from `Bills` if deleted)
- `BillHistory`: `billId | billNo | changedAt | by | oldText` (previous version of each edited bill)
- `Images`: `id | data` (base64 JPEG; one row per photo, keyed `itemId`, `itemId#2` … `itemId#5`)

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
