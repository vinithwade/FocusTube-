function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getVideoId() {
  return new URLSearchParams(window.location.search).get("v");
}

function isWatchPage() {
  return window.location.pathname === "/watch" && getVideoId();
}

async function interceptIfNeeded() {
  if (!window.location.hostname.includes("youtube.com")) return;

  const data = await getStorage();

  if (data.skipUntil && Date.now() < data.skipUntil) {
    return;
  }

  const videoId = getVideoId();
  const pathname = window.location.pathname;

  if (videoId) {
    if (!isSessionValid(data.activeSession)) {
      redirectToGoal();
      return;
    }
    if (!data.activeSession.approvedVideoIds.includes(videoId)) {
      showBlockedOverlay(data);
      return;
    }
    showFocusBanner(data);
    return;
  }

  if (isDistractingPath(pathname) && !isSessionValid(data.activeSession)) {
    redirectToGoal();
  }
}

function showBlockedOverlay(session) {
  if (document.getElementById("focustube-blocked-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "focustube-blocked-overlay";
  overlay.innerHTML = `
    <div class="blocked-card">
      <h2>Stay focused</h2>
      <p>This video isn't part of your current learning session.<br/>
      Your goal: <strong>${escapeHtml(session.activeSession.query)}</strong></p>
      <button id="focustube-go-goal">Find the right video</button>
      <button class="secondary" id="focustube-go-approved">Watch approved video</button>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  document.getElementById("focustube-go-goal").addEventListener("click", () => {
    redirectToGoal();
  });

  document.getElementById("focustube-go-approved").addEventListener("click", () => {
    const approvedId = session.activeSession.approvedVideoIds[0];
    if (approvedId) {
      window.location.href = `https://www.youtube.com/watch?v=${approvedId}`;
    }
  });
}

function showFocusBanner(session) {
  if (document.getElementById("focustube-banner")) return;

  const banner = document.createElement("div");
  banner.id = "focustube-banner";
  banner.innerHTML = `
    <div class="goal-text">
      <span class="goal-label">Learning:</span>
      ${escapeHtml(session.activeSession.query)}
    </div>
    <div class="actions">
      <button id="focustube-toggle-comments">Comments</button>
      <button id="focustube-end-session" class="danger">End session</button>
    </div>
  `;

  const mount = () => {
    if (document.body) {
      document.body.prepend(banner);
      document.body.classList.add("focustube-active");
    } else {
      document.documentElement.appendChild(banner);
    }
  };
  mount();

  let commentsVisible = false;
  document.getElementById("focustube-toggle-comments").addEventListener("click", () => {
    commentsVisible = !commentsVisible;
    const comments = document.querySelector("#comments");
    if (comments) {
      comments.style.display = commentsVisible ? "block" : "none";
    }
    document.getElementById("focustube-toggle-comments").textContent = commentsVisible
      ? "Hide comments"
      : "Comments";
  });

  document.getElementById("focustube-end-session").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "END_SESSION" }, () => {
      document.body.classList.remove("focustube-active");
      banner.remove();
      redirectToGoal();
    });
  });
}

interceptIfNeeded();

window.addEventListener("yt-navigate-finish", interceptIfNeeded);
window.addEventListener("popstate", interceptIfNeeded);

let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    interceptIfNeeded();
  }
});

urlObserver.observe(document.documentElement, { childList: true, subtree: true });
