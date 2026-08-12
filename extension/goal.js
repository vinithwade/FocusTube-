const form = document.getElementById("goal-form");
const loading = document.getElementById("loading");
const loadingText = document.getElementById("loading-text");
const errorEl = document.getElementById("error");
const resultsEl = document.getElementById("results");
const submitBtn = document.getElementById("submit-btn");
const skipBtn = document.getElementById("skip-btn");

function showLoading(text) {
  form.classList.add("hidden");
  resultsEl.classList.add("hidden");
  errorEl.classList.add("hidden");
  loading.classList.remove("hidden");
  submitBtn.disabled = true;
  loadingText.textContent = text || "Searching...";
}

function hideLoading() {
  loading.classList.add("hidden");
  form.classList.remove("hidden");
  submitBtn.disabled = false;
}

function showError(message) {
  hideLoading();
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K views`;
  return `${count} views`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function openChannel(channel, query) {
  const params = new URLSearchParams({
    name: channel.channelName,
    channelId: channel.channelId,
    query: query || channel.channelName,
  });
  window.location.href = chrome.runtime.getURL(`channel.html?${params}`);
}

function openWatch(videoId, query, title) {
  const params = new URLSearchParams({
    v: videoId,
    query: query || "",
    title: title || "",
  });
  window.location.href = chrome.runtime.getURL(`watch.html?${params}`);
}

function renderResults(data, payload) {
  if (data.intentType === "channel" && data.channel) {
    openChannel(data.channel, payload.query);
    return;
  }

  hideLoading();
  resultsEl.classList.remove("hidden");

  const took = (data.took_ms / 1000).toFixed(1);

  resultsEl.innerHTML = `
    <div class="results-header">
      <h2>Top ${data.results.length} matches</h2>
      <p class="meta">Found in ${took}s</p>
    </div>
    ${data.results
      .map(
        (video, i) => `
      <div class="result-card ${i === 0 ? "best" : ""}">
        <div class="result-rank">#${i + 1}</div>
        <img class="thumbnail" src="${video.thumbnailUrl}" alt="" />
        <div class="result-body">
          <h3>${escapeHtml(video.title)}</h3>
          <p class="channel">${escapeHtml(video.channelTitle)} · ${formatDuration(video.durationSeconds)} · ${formatViews(video.viewCount)}</p>
          <div class="score">Match score: <strong>${video.score}/100</strong></div>
          <p class="why"><strong>Why:</strong> ${escapeHtml(video.whyThisVideo)}</p>
          <button class="watch-btn">Watch this video</button>
        </div>
      </div>
    `
      )
      .join("")}
    <div class="results-actions">
      <button id="search-again" class="secondary">Search again</button>
    </div>
  `;

  resultsEl.querySelectorAll(".watch-btn").forEach((btn, i) => {
    const video = data.results[i];
    btn.addEventListener("click", () => {
      openWatch(video.videoId, payload.query, video.title);
    });
  });

  document.getElementById("search-again").addEventListener("click", () => {
    resultsEl.classList.add("hidden");
    form.classList.remove("hidden");
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  const payload = { query: document.getElementById("query").value.trim() };

  if (payload.query.length < 3) {
    showError("Please enter a channel name or what you want to learn.");
    return;
  }

  showLoading("Finding the best match... (first search may take up to a minute)");

  chrome.runtime.sendMessage({ type: "SEARCH", payload }, (response) => {
    if (chrome.runtime.lastError) {
      showError(chrome.runtime.lastError.message);
      return;
    }
    if (!response.success) {
      showError(response.error);
      return;
    }
    renderResults(response.data, payload);
  });
});

skipBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SKIP_FOR_30_MIN" }, () => {
    chrome.tabs.create({ url: "https://www.youtube.com" });
    window.close();
  });
});
