# Rate Book: setup (about 15 minutes, done once)

After this, nothing needs looking after. Prices live in your Google Sheet, the app lives on a free GitHub Pages link, and Claude is not involved.

## 1. Make the Google Sheet the price store

1. Open **script.google.com** (on a phone, use Chrome with ⋮ → *Desktop site* turned on) and tap **New project**. Use your own Google account.
2. Delete the sample code and paste the whole of `Code.gs`. Tap the save (disk) icon. A sheet called "Rate Book prices" will appear in your Google Drive the first time the app connects.
3. Optional: change `DEFAULT_PIN` at the top (default `1234`). You can also change it later from the app.
4. Click **Deploy → New deployment**. Click the gear and pick **Web app**. Set *Execute as:* **Me**, set *Who has access:* **Anyone**, then press **Deploy**. When Google asks for permission: choose your account → *Advanced* → *Go to project (unsafe)* → *Allow*. (It says "unsafe" only because the script is yours and not reviewed by Google.) The Items, Config and Images tabs are created automatically the first time the app connects.
5. Copy the **Web app URL** (it ends in `/exec`).

## 2. Put the link in the app

Open `index.html` in any text editor and find this line near the top of the script:

```js
const API_URL = "";
```

Paste your link between the quotes and save.

## 3. Put the app online (free)

1. Sign in at github.com and create a new **public** repository, for example `ratebook`.
2. Choose **Add file → Upload files** and drag in every file from this folder (`index.html`, `pdf.js`, `sw.js`, `manifest.webmanifest` and all the `.png` icons). Press **Commit**.
3. Go to **Settings → Pages**. Under *Branch*, pick `main` and `/ (root)`, then press **Save**.
4. After a minute your app is at `https://<your-username>.github.io/ratebook/`.

## 4. Share it

Send that link on WhatsApp.

- **Android (Chrome):** open the link. An **Install** banner appears in the app. Tap it, or use Chrome's ⋮ menu → *Add to Home screen*.
- **iPhone (Safari):** open the link in **Safari**, tap **Share**, then **Add to Home Screen**. If the link opened inside WhatsApp, first tap the compass icon or *Open in Safari*.

Anyone with the app can view prices and make bills. To add or change prices, a person taps **Tools → Unlock editing** and enters their name and the shop PIN once on their phone.

## Updating the app later

Upload the new `index.html` to the same GitHub repository. Phones pick up the new version the next time the app is opened online. Prices aren't affected.

## Turn on automatic backups (once)

In the Apps Script editor, pick **setupBackups** in the function list at the top and press **Run**. Allow the permissions it asks for. From then on a full copy of the sheet is saved every 4 hours in the Drive folder "Rate Book backups". You can see and restore copies in the app under **Tools → Settings → Backups**.

## Good to know

- You can also edit prices directly in the Google Sheet's **Items** tab. Phones pick up the change within about 5 minutes (needs the one-time **setupBackups** run, which also allows this check).
- Without internet the app shows the last prices it saw. Saving changes needs internet.
- After 8 wrong PIN tries in 15 minutes, saving is blocked for everyone until the 15 minutes are up.
- If you ever change `Code.gs`, use **Deploy → Manage deployments → Edit → Version: New version** so the link stays the same.
