# Deploy FocusTube API to Render (Free)

This guide deploys the **API only** to Render. The Chrome/Comet extension stays on your computer — you just point it at your Render URL.

## What runs where

| Component | Where |
|-----------|-------|
| API (search, channels, video embed) | Render cloud |
| Extension (UI, YouTube blocking) | Your browser |

---

## Part 1 — Push code to GitHub

Render deploys from GitHub. If you haven't already:

```bash
cd /Users/wadevinith/Desktop/YouTube
git init
git add .
git commit -m "FocusTube initial"
```

Create a new repo on [github.com/new](https://github.com/new), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/focustube.git
git branch -M main
git push -u origin main
```

---

## Part 2 — Create Render web service

1. Go to [render.com](https://render.com) and sign up (free).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account and select the `focustube` repo.

### Settings

| Field | Value |
|-------|-------|
| **Name** | `focustube-api` (or anything) |
| **Region** | Pick closest to you |
| **Branch** | `main` |
| **Root Directory** | *(leave empty)* |
| **Runtime** | `Node` |
| **Build Command** | `cd api && npm install && npm run build` |
| **Start Command** | `cd api && npm start` |
| **Plan** | **Free** |

4. Click **Create Web Service**.

Render will build and deploy. Wait until status is **Live** (first build takes ~5–10 min).

Your URL will look like:
```
https://focustube-api.onrender.com
```

### Test the API

Open in browser:
```
https://YOUR-APP.onrender.com
```

Or test search:
```bash
curl -X POST https://YOUR-APP.onrender.com/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"React useEffect cleanup tutorial"}'
```

---

## Part 3 — Connect the extension

1. Open `extension/config.js`
2. Replace localhost with your Render URL:

```javascript
const FOCUSTUBE_API_URL = "https://focustube-api.onrender.com";
```

3. Go to `chrome://extensions` in Comet
4. Click **Reload** on FocusTube
5. Use FocusTube — no need to run `npm run dev` on your laptop anymore

---

## Part 4 — Verify everything works

1. Open FocusTube (go to YouTube or click the extension icon)
2. Search for a channel name → channel videos should load
3. Click a video → player should work (uses `https://YOUR-APP.onrender.com/embed`)

---

## Important notes about Render Free

### Cold starts
Free services **sleep after 15 minutes** of no traffic. The first request after sleep can take **30–60 seconds**. After that, it's fast.

**Tip:** Open your Render URL in a tab before using the extension if it's been idle.

### Memory limit (512 MB)
The ranking model downloads on first search (~420 MB). This may be tight on free tier. If searches fail with out-of-memory errors, you may need Render's paid plan ($7/mo) or keep running the API locally.

### No API keys needed
FocusTube uses local ML + YouTube scraping — no OpenAI or YouTube API keys required on Render.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Extension says "Search failed" | Check `config.js` URL matches Render URL exactly (no trailing `/`) |
| Build fails on Render | Check build logs — ensure `shared/` folder is in the repo |
| Video won't play (Error 153) | API must be running; embed goes through Render now |
| First search very slow | Normal — model downloading + cold start |
| Channel shows 0 videos | Wait for cold start to finish, try again |

---

## Switching back to local dev

In `extension/config.js`:
```javascript
const FOCUSTUBE_API_URL = "http://localhost:3000";
```

Then reload the extension and run `cd api && npm run dev`.
