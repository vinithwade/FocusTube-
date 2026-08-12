const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

document.getElementById("new-goal").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("goal.html") });
});

document.getElementById("skip-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SKIP_FOR_30_MIN" }, () => {
    chrome.tabs.create({ url: "https://www.youtube.com" });
    window.close();
  });
});

document.getElementById("clear-skip").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_SKIP" }, () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("goal.html") });
    window.close();
  });
});

document.getElementById("end-session").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "END_SESSION" }, () => {
    window.close();
  });
});

chrome.runtime.sendMessage({ type: "GET_SESSION" }, (data) => {
  const session = data?.activeSession;
  if (session && Date.now() - session.startedAt < SESSION_DURATION_MS) {
    document.getElementById("session-info").classList.remove("hidden");
    document.getElementById("session-goal").textContent = session.query;
    document.getElementById("end-session").classList.remove("hidden");
  }

  if (data?.skipUntil && Date.now() < data.skipUntil) {
    document.getElementById("clear-skip").classList.remove("hidden");
    document.getElementById("skip-btn").classList.add("hidden");
  }
});
