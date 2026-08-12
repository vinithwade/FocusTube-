# FocusTube

Goal-first YouTube learning extension. Capture what you want to learn before opening YouTube, get locally-ranked video recommendations based on relevance (not view count), and watch with focus mode enabled.

**No API keys required.** FocusTube scrapes YouTube search results and ranks videos using a local embedding model (`all-MiniLM-L6-v2`) that runs on your machine.

## Architecture

- **`api/`** — Next.js backend with `/api/search` endpoint
- **`extension/`** — Chrome Manifest V3 extension
- **`shared/`** — Shared TypeScript types

### How ranking works (no OpenAI)

1. **Intent parsing** — Rule-based query expansion from your goal, reason, and output
2. **YouTube discovery** — Scrapes search results via `youtube-sr` (no YouTube Data API)
3. **Transcript analysis** — Fetches captions for each candidate video
4. **Local model ranking** — `Xenova/all-MiniLM-L6-v2` embeddings compare your intent vs video content
5. **Heuristic scoring** — Keyword overlap, duration fit, clickbait penalty, transcript bonus

> **Note:** Indexing all of YouTube is impossible. FocusTube searches across multiple targeted queries (~25 candidates per search) and ranks them deeply — which is more effective than raw view-count sorting.

## Setup

### 1. Start the API

```bash
cd api
npm install
npm run dev
```

On first search, the local model downloads automatically (~80MB). API runs at `http://localhost:3000`.

### 2. Load the extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

### 3. Use FocusTube

1. Navigate to YouTube — you'll be redirected to the goal form
2. Enter what you want to learn, why, and desired output
3. Review the top 3 locally-ranked videos with explanations
4. Click to watch — focus mode hides distractions

## API

### `POST /api/search`

```json
{
  "goal": "How to set up RLS in Supabase",
  "reason": "Building auth for my side project",
  "output": "A working policy I can copy-paste",
  "maxDurationMinutes": 20
}
```

Response:

```json
{
  "results": [
    {
      "videoId": "abc123",
      "score": 87,
      "title": "...",
      "whyThisVideo": "...",
      "tradeoffs": "..."
    }
  ],
  "searchQueries": ["..."],
  "took_ms": 12000
}
```

## Extension features

- **Navigation intercept** — Blocks distracted YouTube browsing without a goal
- **Session whitelist** — Only approved videos are accessible during a session
- **Focus mode** — Hides sidebar, recommendations, comments on watch pages
- **Skip for 30 min** — Escape hatch when you need normal YouTube access

## Development

```bash
# API
cd api && npm run dev

# Test search endpoint (first run downloads the model)
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"goal":"React useEffect basics","reason":"Debug a memory leak","output":"Know when to use cleanup"}'
```
