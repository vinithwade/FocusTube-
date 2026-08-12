const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

const DISTRACTING_PATHS = [
  /^\/$/,
  /^\/feed/,
  /^\/shorts/,
  /^\/gaming/,
  /^\/music/,
  /^\/trending/,
  /^\/subscriptions/,
  /^\/history/,
  /^\/playlist/,
];

function isDistractingPath(pathname) {
  return DISTRACTING_PATHS.some((pattern) => pattern.test(pathname));
}

function getVideoIdFromUrl(url) {
  try {
    return new URL(url).searchParams.get("v");
  } catch {
    return null;
  }
}

function isYouTubeUrl(url) {
  try {
    return new URL(url).hostname.includes("youtube.com");
  } catch {
    return false;
  }
}

function isSessionValid(session) {
  if (!session) return false;
  return Date.now() - session.startedAt < SESSION_DURATION_MS;
}

function getStorage() {
  return chrome.storage.local.get(["activeSession", "skipUntil"]);
}

async function shouldInterceptUrl(url) {
  const { activeSession, skipUntil } = await getStorage();

  if (skipUntil && Date.now() < skipUntil) {
    return false;
  }

  if (!isYouTubeUrl(url)) {
    return false;
  }

  const parsed = new URL(url);
  const pathname = parsed.pathname;
  const videoId = getVideoIdFromUrl(url);

  if (videoId) {
    if (!isSessionValid(activeSession)) return true;
    if (activeSession.approvedVideoIds.includes(videoId)) return false;
    return true;
  }

  if (isDistractingPath(pathname)) {
    if (isSessionValid(activeSession)) return false;
    return true;
  }

  return false;
}

function redirectToGoal() {
  window.location.replace(chrome.runtime.getURL("goal.html"));
}
