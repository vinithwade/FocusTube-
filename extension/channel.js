const params = new URLSearchParams(window.location.search);
const channelName = params.get("name") || "";
const channelId = params.get("channelId") || "";
const query = params.get("query") || channelName;

const loading = document.getElementById("loading");
const errorEl = document.getElementById("error");
const videoGrid = document.getElementById("video-grid");
const channelInfo = document.getElementById("channel-info");

document.getElementById("back-btn").addEventListener("click", () => {
  window.location.href = chrome.runtime.getURL("goal.html");
});

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${count}`;
}

function openWatch(videoId, title) {
  const watchParams = new URLSearchParams({ v: videoId, query, title });
  window.location.href = chrome.runtime.getURL(`watch.html?${watchParams}`);
}

function renderChannel(data) {
  loading.classList.add("hidden");
  channelInfo.classList.remove("hidden");
  videoGrid.classList.remove("hidden");

  const { channel, videos } = data;

  document.getElementById("channel-avatar").src = channel.thumbnailUrl;
  document.getElementById("channel-name").textContent = channel.channelName;
  document.getElementById("channel-meta").textContent = [
    channel.subscribers,
    channel.verified ? "Verified" : null,
    `${videos.length} videos`,
  ]
    .filter(Boolean)
    .join(" · ");

  if (videos.length === 0) {
    videoGrid.innerHTML = `<p class="empty">No videos found for this channel.</p>`;
    return;
  }

  videoGrid.innerHTML = videos
    .map(
      (video, i) => `
    <div class="grid-card" data-index="${i}">
      <div class="thumb-wrap">
        <img src="${video.thumbnailUrl}" alt="" />
        ${video.durationSeconds > 0 ? `<span class="duration-badge">${formatDuration(video.durationSeconds)}</span>` : ""}
      </div>
      <div class="grid-card-body">
        <h3>${escapeHtml(video.title)}</h3>
        <p>${video.viewCount > 0 ? formatViews(video.viewCount) + " views" : "Tap to watch"}</p>
      </div>
    </div>
  `
    )
    .join("");

  videoGrid.querySelectorAll(".grid-card").forEach((card) => {
    const video = videos[parseInt(card.dataset.index, 10)];
    card.addEventListener("click", () => {
      openWatch(video.videoId, video.title);
    });
  });
}

chrome.runtime.sendMessage(
  { type: "FETCH_CHANNEL", payload: { name: channelName, channelId } },
  (response) => {
    if (chrome.runtime.lastError) {
      loading.classList.add("hidden");
      errorEl.textContent = chrome.runtime.lastError.message;
      errorEl.classList.remove("hidden");
      return;
    }
    if (!response.success) {
      loading.classList.add("hidden");
      errorEl.textContent = response.error;
      errorEl.classList.remove("hidden");
      return;
    }
    renderChannel(response.data);
  }
);
