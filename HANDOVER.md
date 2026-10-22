# Rate Book: handover for a new session

Last updated: 22 October 2026 (bill page fixes; Google-side rollout done). Read this first, then [`ARCHITECTURE.md`](ARCHITECTURE.md) (the map) and [`CLAUDE.md`](CLAUDE.md) (the full history of every feature and decision). For anything people see, also read [`designinstructions.md`](designinstructions.md) and run its §12 checklist.

## 1. What Rate Book is

- It's a shop price list, quick-bill and khata app for Mayank's family plastics and packaging shop ("Shree Pushpadant Plastics and Packaging"), and now for other shops too.
- It's an installed web app (PWA) on Android, iPhone and laptops, served by GitHub Pages from this repository (`itxMayank/ratebook`).
- Each shop's data sits in its own Google Sheet, behind its own Google Apps Script web app. Everything runs as Mayank's Google account.
- A **Directory** script plus `admin.html` (the admin dashboard) create, update, pause and delete shops, and show their health, speed and errors.
- Shop owners get a business page at `admin.html?shop=<code>`.
- No AI runs inside the app. The one exception: vendor bill reading uses the shop's own Gemini key, if the owner has set one.

## 2. How to work with Mayank (rules he set; keep following them)

**Merging**
- Work on branch `claude/friendly-ramanujan-vd1vb8`, then commit and push.
- **Merge only when Mayank says "merge"**, using the GitHub tools: `create_pull_request`, then `merge_pull_request` with squash.
- After a merge, reset the branch to `origin/main` with `git fetch origin main && git checkout -B claude/friendly-ramanujan-vd1vb8 origin/main && git push -f -u origin claude/friendly-ramanujan-vd1vb8`.
- Before any merge, run the **whole test suite**: `node tests/run-all.js`, about 1.5 h, 98 files. Run it in the background and watch it. "Merge once tests pass" means wait for it to finish green.

**Before committing**
- **Always run `node tools/stamp.js`** after editing any app file, `money.js`, `server/*.gs`, or a page (`index.html`, `admin.html`, `vendor.html`).
  - It updates the version stamps, the Content-Security-Policy script digests, the `money.js` copy and the `Code.gs` build.
  - Forgetting it after a page edit **blanks the page** (seen 21 Oct: the dashboard didn't load). `tests/assets.test.js` now catches that.
- **Edit `server/*.gs`, never `Code.gs`.** `Code.gs` is built from those files.
- **Update `CLAUDE.md`** with each change: add a dated section and refresh the "Last updated" line. Design decisions go in `designinstructions.md` (§1 or "Overrides").
- No `console.log` in code.

**Commits and PRs**
- No model names in commits, PRs or code.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <this session's link>
  ```
- PR bodies end with the "🤖 Generated with Claude Code" line and the session link.

**Replies**
- Keep them short, in plain language, and say what changed for the shop.
- **Show the pending list (section 6) only when Mayank asks for it** (his rule, 22 Oct 2026; before, it ended every reply).

**In the app**
- Technical messages (script versions, Apps Script steps, error codes) show only to the original shop's owner (`TECH()` in `app.js`). Other shops see plain text through `key_s` strings.
- Design rule: on small screens, **wrap or stack; never hide things behind an extra tap**.

## 3. Current state (22 Oct 2026)

**Code and versions**

| Thing | Value | Where |
|---|---|---|
| `main` | `82f5cb3` "architect-review: study comparable apps first…" | PRs #99–#101 merged 22 Oct |
| Sheet script | `SCRIPT_VERSION` **68** (not yet on the shops) | `server/01-core.gs` |
| Oldest script the app supports | `NEED_SV` **60** in `app.js`, the same as `MIN_SV` in `admin.html` | `tests/assets.test.js` checks that they match |
| Directory | `DIR_VERSION` **11** | `admin/Directory.gs` |
| Offline cache | `rb-shell-9` | `sw.js` |
| Tests | 100 files (`tests/billfix.app.test.js`, `tests/billfix.test.js` added 22 Oct) | `node tests/run-all.js` |

**Shops** (Mayank, 22 Oct 2026)
- **The main shop** (code `main`, "Shree Pushpadant Plastics and Packaging") is on script **v67**, in test mode, with "New phones need my approval" on.
- **Mahavir Provision** (`MAHAVIRPRO-GW2QT3LNAP`) is on script **v67**.
- The Directory is on **v11**.

## 4. How the app works (short; details in ARCHITECTURE.md)

**Pieces**
- Phones talk to their shop's script with `POST {action, tok, env, shop}`.
- One small `rev` check carries every version (prices, bills, vendors, notices, next bill numbers, script version). It runs every 25 s while the phone is in use, every 3 min when it's idle, and never in the background.
- Phones keep copies of the price list, recent bills (up to 3,000, plus their texts), customers, Credit, vendors, notices and photos. A copy refreshes only when its version changes; bills refresh by delta.

**Saving**
- **One outbox** (`obRun` in `app.js`) sends changes in this order: new bills (`rb_billq`), then edits, payments, customers and settings (`rb_wq`), then vendor changes (`rb_vq_<mode>`), then display choices (`rb_upq`).
- Retries start at 4 s and double up to 60 s. Nothing is lost.
- A change the sheet refuses goes to "couldn't be saved" (`rb_wqfail`).

**Server**
- **What it checks on every bill:**
  - it adds up the bill itself (`money.js`, shared with the app);
  - it checks that the bill text shows the number, the line amounts and the total;
  - it fills in buy rates, cost and profit;
  - it renumbers a bill number that clashes.
- **Locking:** writes take one script lock (25 s wait; on timeout the reply is `busy`). Pure reads skip it (`NOLOCK_`).
- **Change log:** every version phones watch goes through `chg_`, the one change log. Versions always go up.
- **Cache:** CacheService is only a copy. The real values live in script properties and the Config tab.

**Modes and storage**
- Test and real mode: every request carries `env`, and test tabs are prefixed `Test `.
- More shops: each has its own sheet, folder, script, people and sign-ins. Phone storage is prefixed per shop, and the original shop's storage isn't.

**Security**
- Personal PINs, with sign-in tokens.
- The lock screen opens only for the person shown on it.
- Wrong PINs are limited per name.
- New-phone approval.
- Buy rates are enforced by the sheet: "who can see buy rates" defaults to owner and managers.
- The shop PIN switches off once an owner has their own PIN.
- A Content-Security-Policy on every page.

**Yearly archive**
- Once a new financial year starts, bills from two years back move to `Bills YYYY-YY`, with a `BillYears` summary.
- It runs at night and makes a backup first.
- The first archive happens after 1 April 2027 (FY 2025-26).
- Archived bills are read-only.

**Files**
- App: `strings.js`, `shops.js`, `money.js`, `search.js`, `print.js`, `reports.js`, `settings.js`, `bills.js`, `customers.js`, `lock.js`, `vendors.js`, `prices.js`, `billing.js`, `app.js` (loads last), `app.css`, `sw.js`.
- Sheet script: `server/01-core` … `16-pricehistory`, built into `Code.gs`.
- Directory: `admin/Directory.gs` + `admin/appsscript.json`.
- Pages: `admin.html`, `vendor.html`.

**Tests**
- Server tests run the real script in Node (`tests/gas-mock.js`).
- App tests run simulated phones in Chromium (`tests/browser.js`).
- `*.real.app` tests run the real app against the real script (`tests/realshop.js`; `tests/realday.real.app.test.js` covers a whole shop day).
- `tests/billopen.real.app.test.js` can fail on timing when the machine is busy; re-run it alone before treating it as real.

## 5. Rollout of what's merged (Mayank's steps, in order)

Done on 22 Oct 2026: Directory v11, both shops on v67, new-phone approval on in the main shop. The usual steps for a later change:
1. **Directory** (only when `admin/Directory.gs` changed): script.google.com → "Rate Book Directory" → replace the code → **Deploy → Manage deployments → Edit → Version: New version → Deploy**.
2. **Scripts** (only when `server/` changed): dashboard → **your shop first → Update script**, check it, then **Update all shops**. Never use "New deployment": it changes the link.
3. **App-only changes** (like the 22 Oct bill page fixes) need nothing: phones get them on their next open.

## 6. Pending list

**Mayank's steps**
1. Before adding many customer shops, plan a separate Google (Workspace) account for them. Turn on 2-step verification (security keys if possible) on Google and GitHub.
2. Delete the saved shop PIN from the phone's password manager (Google Password Manager / Samsung Pass → the app's site → Delete).

**Decide**
- The bill page layout redesign (mock-up sent 22 Oct 2026): bill items first, customer & payment below them, compact lines (5 of 5 lines on a 390 px phone instead of 2), one-row lines on the laptop. Mock-up script: in that session's scratchpad only; the CSS it used is listed in the 22 Oct conversation.

**Mayank's steps after the next merge**
- Update both shops to script **v68** (dashboard → your shop first → Update script, then Update all shops). Until then bills sent late are still dated when they arrive; everything else works.

**Watch**
- After 1 April 2027, the first yearly archive. Check the `Bills 2025-26` tab, the `BillYears` tab and the error log.
- The dashboard's error log after each update.
- Before raising `NEED_SV` above 60, check every shop's version on the dashboard.

## 7. Suggestions (parked; build only when Mayank asks)

**Security**
- Part 4: ask for the PIN again before risky actions (settings, backup restore, deleting items, people).

**Notifications**
- Web Push for vendor notices (VAPID, no Firebase).

**Money**
- A UPI QR code or pay link on bills.
- Automatic credit reminders.

**Owner tools**
- A daily summary sent automatically (an evening reminder in the app, or a daily email from the script).
- CA exports (GST returns format).
- Alerts.

**Links for customers**
- A customer statement link, like the vendor link.
- A catalogue link.

**Bills**
- The customer's item code per line on POs.
- The PO in the invoice-register CSV.
- "Duplicate / triplicate" copies on the PDF.

**Customers**
- Staff adding customers (manager and up only, today).
- Deleting a customer.

**Testing and scale**
- Test on real phones: Bluetooth / RawBT printers, voice, WhatsApp hand-off, fingerprint, install, iPhone Safari.
- Past about 30–35 shops on a free Gmail account, move customer shops to Google Workspace (CLAUDE.md "How many shops one Google account can run").

**Deliberately not done**
- Stock tracking: loose, 250 g and unbilled sales would make it drift.
- Visual (camera) search: few items have photos.
- Bill numbers from the sheet only while offline: Mayank chose option B, keep it as it is.
- Lazy-loading area files: built, then dropped as no faster.

## 8. Lessons from past sessions

- **Pages:** a page edit without `node tools/stamp.js` leaves a stale CSP digest, and the page shows blank.
- **Tests before merge:** run the whole suite before merging. A single-file check missed the CSP break.
- **GitHub API limits:** the API allows 60 requests an hour per address without a key, and Apps Script shares its addresses. So the Directory falls back to the public commits feed (`commitFeed_`).
- **Directory updates:** the Directory is never updated automatically. Mayank pastes `admin/Directory.gs` by hand, so say so whenever it changes.
- **Script updates:** after any change in `server/`, raise `SCRIPT_VERSION`, document it in CLAUDE.md, and add a rollout line ("update every shop's script to vN, your shop first").
- **Lists with a search box:** never redraw the search box while it has focus; redraw only the results.
- **Mock sheets in tests:** they need what the real sheet gives, such as POST `list`, `base64EncodeWebSafe` and MD5. When a test fails only in a mock, check the mock first.
- **Dates in tests:** keep tests independent of the date. Freeze `Date` (see `tests/reports.test.js`).

## 9. Prompt to paste into a new session

> I'm Mayank. We're continuing work on Rate Book (repo itxMayank/ratebook, branch claude/friendly-ramanujan-vd1vb8). First read HANDOVER.md, then ARCHITECTURE.md, and use CLAUDE.md as the reference. Follow the working rules in HANDOVER.md §2 exactly: merge only when I say "merge", run `node tools/stamp.js` after edits, edit `server/` not `Code.gs`, update CLAUDE.md with each change, run the full test suite before merging, keep replies short and plain, and show the pending list only when I ask for it. Then tell me in a few lines where things stand and wait for my next request.
