# Ristorante Alfredo

Your offline recipe app. To put it on your iPhone:

1. Create a free account at github.com and make a new **public** repository, e.g. `recipes`.
2. Click **Add file → Upload files** and drag in everything from this folder (keep the folders `css`, `js`, `icons`). Commit.
3. Go to **Settings → Pages**, set Source to *Deploy from a branch*, branch `main`, folder `/ (root)`, and save.
4. After a minute your app is at `https://YOUR-NAME.github.io/recipes/`.
5. Open that link in **Safari** on your iPhone → Share → **Add to Home Screen**.
6. Open it once from the new icon while online. After that it works fully offline.

Your recipes are stored only on your phone (only the app code is public). Use *Profile → Export backup* now and then.

When updating files later, change `CACHE` in `sw.js` (e.g. `alfredo-v1.0.1`), upload, then close and reopen the app.
