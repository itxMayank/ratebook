# Rate Book: how it fits together

Start here before changing code. [`CLAUDE.md`](CLAUDE.md) is the full history of every feature and decision; [`designinstructions.md`](designinstructions.md) is the rulebook for anything people see. This page is the map.

## The pieces

```
 Phones / laptops (installed web app, GitHub Pages)
   index.html + app files ──POST {action, tok, env, shop}──▶ the shop's Apps Script web app (Code.gs)
        ▲   │                                                     │
        │   └── 25-second "rev" check (versions only) ◀───────────┤   reads and writes one Google Sheet
        │                                                         │   (+ Drive folders: backups, vendor bills)
   admin.html (dashboard) ──admin PIN──▶ Directory (admin/Directory.gs) ──health key──▶ every shop's script
   admin.html?shop=… (owner's business page) ──owner sign-in──▶ that shop's script only
   vendor.html?t=… (a vendor's read-only link) ──token──▶ that shop's script
```

- **One shop = one Google Sheet + one Drive folder + one Apps Script project**, all in Mayank's Google account. Shops never share data or sign-ins. The original shop is `main`; the others were made by the Directory and also carry a generated `Shop.gs` (`SHOP_BOOT`: their sheet and folder ids, health key, starting PIN).
- **The Directory** finds a shop's script link from its code (`?shop=CODE`), creates, updates, pauses and deletes shops, and gathers every shop's health and errors for the dashboard. It installs only the GitHub commit the dashboard showed (commit + digest).
- **No server of our own and no build step for the app.** Google runs the scripts; GitHub Pages serves the files.

## The app (phones and laptops)

Plain scripts in global scope, loaded in this order by `index.html` (each only declares things while loading; `app.js` comes last and starts the app):

| File | What |
|---|---|
| `strings.js` | every English / Hindi text (`window.RB_STR`) |
| `shops.js` | which shop, its script link, per-shop phone storage (`ls`) |
| `money.js` | bill sums, profit and the bill-text check; **the same code runs in the sheet script** |
| `search.js` | phonetic search, the wand's command reader, English → Hindi letters |
| `print.js` | PDF invoices, A4/A5 and roll printing |
| `reports.js` | Reports and Today's summary |
| `settings.js` | Settings, people, phones, backups |
| `bills.js` | Past bills (the phone's copy, search, a bill's screen) |
| `customers.js` | Credit and Customers |
| `lock.js` | sign-in, lock screen, fingerprint |
| `vendors.js` | vendor khata |
| `prices.js` | price list, item screens, groups, bulk add/edit |
| `billing.js` | the bill page |
| `app.js` | start-up, talking to the sheet, sync, the outbox, sheets/navigation, keyboard |
| `app.css` | all styles; design tokens first |
| `sw.js` | offline copy of the app; a new release is offered only when all its files are published |

After editing any of these, run `node tools/stamp.js` (version stamps, page script digests, `money.js` copy, `Code.gs` build).

### What a phone keeps

- **Its copies:** the price list (`rb_cache`), recent bills (IndexedDB `bills:<mode>`, up to 3,000) and their texts (`btx:<mode>`), customers, Credit, vendors, notices, photos. Each copy carries the version it was made from.
- **Sync:** one small `rev` request returns every version: prices `rev`; bills `bl`/`bt`; vendors `vl`/`vt`; notices `nl`/`nt`; next bill numbers `nb`; script version `sv`. A copy is refreshed only when its version changed (bills by delta). The request goes every 25 s while the phone is in use, every 3 min when it's untouched, at once on the first tap after a quiet spell, and never in the background.
- **One outbox** (`obRun` in `app.js`). Nothing is lost when there's no signal or the sheet is busy. Waiting changes go in this order, one pass at a time, retried after 4 s, doubling to 60 s:
  1. new bills (`rb_billq`);
  2. bill edits, payments, customers and settings (`rb_wq`);
  3. vendor changes (`rb_vq_<mode>`);
  4. display choices (`rb_upq`).
- **Refusals:** a change the sheet refuses goes to "couldn't be saved" (`rb_wqfail`), never dropped.
- **Test and real mode:** every request carries `env`, and every per-mode store is keyed by it.

## The sheet script

**Source:** `server/*.gs`, one file per area. `Code.gs` is those files joined in name order, made by `node tools/stamp.js`; a test fails if they differ. `Code.gs` is the file pasted into Apps Script and installed by the Directory. **Edit `server/`, never `Code.gs`.**

| File | Area |
|---|---|
| `01-core` | constants, sheet helpers, shop settings, timings, reply cache, `cPut_`, **one change log** (`chg_`) |
| `02-reads` | `doGet`, price list, most-sold order |
| `03-buyrates` | who may see buy rates |
| `04-writes` | `doPost`: the script lock and every action |
| `05-signin` | roles (`NEEDS`), the PIN / token check (`auth_`), people, sign-in tokens |
| `06-shops` | reads that skip the lock (`NOLOCK_`), pause, new-phone approval, health, `setupShop` |
| `07-prefs` | per-person settings, shop code, hand edits (`onSheetEdit`, `watchSheet`) |
| `08-bills` | items, `takeBill`, Past bills, `updateBill` |
| `09-archive` | yearly archive of bills |
| `10-credit` | credit, `money.js` copy, customers |
| `11-backups` | backups and restore |
| `12-reports` | cancel a bill, reports |
| `13-insights` | the owner's business page |
| `14-vendors` | vendor khata |
| `15-billreading` | Gemini bill reading and the calculation check |
| `16-pricehistory` | price history, soft-error log |

How requests are handled:
- **Every request:** the sign-in token (or PIN) is checked, then the person's role against `NEEDS`, then the shop and the mode.
- **Writes** wait for the one script lock (25 s; if they time out the reply is `busy` and nothing was done).
- **Pure reads** skip the lock (`NOLOCK_`). Read-mostly replies are cached against their version (`rcRead_`).

**The sheet trusts nothing the phone works out:**
- it adds up every bill (`billCheck_`);
- it checks the bill's text shows its number, items and total (`billTextCheck_`);
- it fills in buy rates and profit for people who may not see them;
- it renumbers a clashing bill number.

**Every change phones must notice** goes through `chg_`, which raises a version and writes one line to the shared change log (`CHG`, shown in health). The versions are `rev` (prices and settings), `brev_<mode>` (bills, plus a per-bill log for deltas), `vrev_<mode>` (vendors) and `nrev_<mode>` (notices).

**What's stored where:**
- **The sheet:** `Items`, `Config`, `Images`, `Bills` (+ yearly `Bills YYYY-YY`, `BillYears`), `BillHistory`, `Customers`, `Vendors`, `VendorLedger`, `VendorDocs`, `Purchases`, `Notices`, `PriceHistory`. In test mode each per-mode tab is prefixed `Test `.
- **Script properties:** versions, sign-ins (`SESS`), people (`USERS`), keys, flags. They are the real copy.
- **CacheService:** only a faster copy. When it's empty, everything falls back to the properties or the Config tab.

**Timed jobs:**
- `autoBackup`, every 4 h;
- `watchSheet`, hourly: hand-edit fallback, plus the yearly archive at night;
- the Directory's hourly error pull;
- the sheet's own edit trigger, `onSheetEdit`.

## Rules that keep it working

- **Versions:** `SCRIPT_VERSION` (in `server/01-core.gs`) goes up with every script change. `NEED_SV` in `app.js` (= `MIN_SV` in `admin.html`) is the oldest script the app still supports. Check every shop on the dashboard before raising it.
- **Rollout:**
  1. Merge, so the app goes live within a minute.
  2. If the Directory changed, paste `admin/Directory.gs` and deploy a New version.
  3. Update scripts from the dashboard: your shop first, then Update all.
  4. Never use "New deployment": it changes the link.
- **Security:** see CLAUDE.md "Security step 1/2", "A PIN opens only its own person's account" and "Gap fixes".
  - Shops are kept apart.
  - Only files the shop uploaded can be opened.
  - A PIN only opens its own person's account.
  - Guessing is limited per name.
  - A Content-Security-Policy applies on every page.
  - Technical messages are shown only to the admin.
- **Tests:** `node tests/run-all.js` runs everything (GitHub runs it on every push). It has three kinds of test:
  - server tests run the real script in Node over an in-memory sheet (`tests/gas-mock.js`);
  - app tests run simulated phones in Chromium (`tests/browser.js`);
  - `*.real.app` tests connect the two (`tests/realshop.js`).
- **Limits of one Google account:** see CLAUDE.md "How many shops one Google account can run". Stay under about 30–35 shops on free Gmail.
