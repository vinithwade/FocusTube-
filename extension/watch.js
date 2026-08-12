const API_URL = FOCUSTUBE_API_URL;

const params = new URLSearchParams(window.location.search);
const videoId = params.get("v");
const query = params.get("query") || "";
const title = params.get("title") || "";

if (!videoId) {
  window.location.href = chrome.runtime.getURL("goal.html");
}

document.getElementById("goal-text").textContent = query;
document.getElementById("video-title").textContent = title;

const player = document.getElementById("player");
player.src = `${API_URL}/embed?v=${encodeURIComponent(videoId)}&autoplay=1`;
player.referrerPolicy = "strict-origin-when-cross-origin";

chrome.runtime.sendMessage({
  type: "START_SESSION",
  payload: { query, videoIds: [videoId] },
});

document.getElementById("end-session").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "END_SESSION" }, () => {
    window.location.href = chrome.runtime.getURL("goal.html");
  });
});
