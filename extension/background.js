importScripts("config.js", "session-utils.js");

const API_URL = FOCUSTUBE_API_URL;
const SKIP_DURATION_MS = 30 * 60 * 1000;

function redirectTab(tabId) {
  chrome.tabs.update(tabId, { url: chrome.runtime.getURL("goal.html") });
}

function handleNavigation(details) {
  if (details.frameId !== 0) return;

  shouldInterceptUrl(details.url).then((intercept) => {
    if (intercept) {
      redirectTab(details.tabId);
    }
  });
}

chrome.webNavigation.onBeforeNavigate.addListener(handleNavigation, {
  url: [{ hostContains: "youtube.com" }],
});

chrome.webNavigation.onCommitted.addListener(handleNavigation, {
  url: [{ hostContains: "youtube.com" }],
});

chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation, {
  url: [{ hostContains: "youtube.com" }],
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SEARCH") {
    searchApi("/api/search", { method: "POST", body: JSON.stringify(message.payload) })
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message || "Search failed" })
      );
    return true;
  }

  if (message.type === "FETCH_CHANNEL") {
    const { name, channelId } = message.payload;
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (channelId) params.set("channelId", channelId);

    searchApi(`/api/channel?${params}`)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message || "Failed to load channel" })
      );
    return true;
  }

  if (message.type === "START_SESSION") {
    const { query, videoIds, maxDurationMinutes } = message.payload;
    chrome.storage.local.set({
      activeSession: {
        query,
        approvedVideoIds: videoIds,
        startedAt: Date.now(),
        maxDurationMinutes,
      },
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "END_SESSION") {
    chrome.storage.local.remove("activeSession", () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "SKIP_FOR_30_MIN") {
    chrome.storage.local.set({ skipUntil: Date.now() + SKIP_DURATION_MS });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "CLEAR_SKIP") {
    chrome.storage.local.remove("skipUntil");
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "GET_SESSION") {
    getStorage().then((data) => sendResponse(data));
    return true;
  }
});

async function searchApi(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();

  if (!contentType.includes("application/json")) {
    if (response.status === 502 || response.status === 503) {
      throw new Error(
        "The API is waking up or restarting. Wait 30–60 seconds, then try again."
      );
    }
    throw new Error(
      "The API returned an unexpected response. Check that the Render service is running."
    );
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(
      "The API returned invalid data. It may still be starting — try again in a moment."
    );
  }

  if (!response.ok) {
    throw new Error(data.error || `API error (${response.status})`);
  }
  return data;
}
