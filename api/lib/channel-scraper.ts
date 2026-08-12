import type { VideoCandidate } from "@shared/types";

const VIDEOS_TAB_PARAMS = "EgZ2aWRlb3PyBgQKAjoA";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parseDurationText(text: string): number {
  if (!text) return 0;
  const parts = text.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function parseViewsText(text: string): number {
  if (!text) return 0;
  const cleaned = text.toLowerCase().replace(/[^0-9.kmb]/g, "");
  if (cleaned.includes("b")) return parseFloat(cleaned) * 1_000_000_000;
  if (cleaned.includes("m")) return parseFloat(cleaned) * 1_000_000;
  if (cleaned.includes("k")) return parseFloat(cleaned) * 1_000;
  return parseInt(cleaned, 10) || 0;
}

async function fetchChannelPage(channelUrl: string): Promise<string> {
  const videosUrl = channelUrl.replace(/\/$/, "").includes("/videos")
    ? channelUrl
    : `${channelUrl.replace(/\/$/, "")}/videos`;

  const response = await fetch(videosUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch channel page (${response.status})`);
  }

  return response.text();
}

function extractInnertubeKey(html: string): string {
  const match = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  if (!match) throw new Error("Could not extract YouTube API key");
  return match[1];
}

function extractChannelId(html: string): string | null {
  const match =
    html.match(/"channelId":"(UC[^"]+)"/) ||
    html.match(/"externalId":"(UC[^"]+)"/) ||
    html.match(/"browseId":"(UC[^"]+)"/);
  return match?.[1] || null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseVideoRenderer(renderer: any, channelName: string, channelId?: string): VideoCandidate | null {
  const videoId = renderer.videoId;
  if (!videoId) return null;

  const title =
    renderer.title?.runs?.[0]?.text ||
    renderer.title?.simpleText ||
    "";

  const thumbnailUrl =
    renderer.thumbnail?.thumbnails?.slice(-1)[0]?.url || "";

  return {
    videoId,
    title,
    description: "",
    channelTitle: channelName,
    channelId,
    durationSeconds: parseDurationText(renderer.lengthText?.simpleText || ""),
    viewCount: parseViewsText(renderer.viewCountText?.simpleText || ""),
    publishedAt: renderer.publishedTimeText?.simpleText || "",
    thumbnailUrl,
    hasTranscript: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLockupViewModel(lockup: any, channelName: string, channelId?: string): VideoCandidate | null {
  const videoId = lockup.contentId;
  if (!videoId) return null;
  if (lockup.contentType && !String(lockup.contentType).includes("VIDEO")) return null;

  const meta = lockup.metadata?.lockupMetadataViewModel;
  const title = meta?.title?.content || "";

  const metadataParts = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
  let viewsText = "";
  for (const row of metadataParts) {
    for (const part of row.metadataParts || []) {
      const content = part.text?.content || "";
      if (content.toLowerCase().includes("view")) {
        viewsText = content;
        break;
      }
    }
  }

  const overlays = lockup.contentImage?.thumbnailViewModel?.overlays || [];
  let durationText = "";
  for (const overlay of overlays) {
    const badges = overlay.thumbnailBottomOverlayViewModel?.badges || [];
    for (const badge of badges) {
      if (badge.thumbnailBadgeViewModel?.text) {
        durationText = badge.thumbnailBadgeViewModel.text;
        break;
      }
    }
  }

  const thumbnailUrl =
    lockup.contentImage?.thumbnailViewModel?.image?.sources?.slice(-1)[0]?.url || "";

  return {
    videoId,
    title,
    description: "",
    channelTitle: channelName,
    channelId,
    durationSeconds: parseDurationText(durationText),
    viewCount: parseViewsText(viewsText),
    publishedAt: "",
    thumbnailUrl,
    hasTranscript: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectVideosFromNode(node: any, channelName: string, channelId?: string): VideoCandidate[] {
  const results: VideoCandidate[] = [];
  const seen = new Set<string>();

  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;

    const record = obj as Record<string, unknown>;

    if (record.videoRenderer) {
      const parsed = parseVideoRenderer(record.videoRenderer, channelName, channelId);
      if (parsed && !seen.has(parsed.videoId)) {
        seen.add(parsed.videoId);
        results.push(parsed);
      }
    }

    if (record.lockupViewModel) {
      const parsed = parseLockupViewModel(record.lockupViewModel, channelName, channelId);
      if (parsed && !seen.has(parsed.videoId)) {
        seen.add(parsed.videoId);
        results.push(parsed);
      }
    }

    if (record.richItemRenderer) {
      const content = (record.richItemRenderer as Record<string, unknown>).content;
      if (content) walk(content);
    }

    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        walk(value);
      }
    }
  }

  walk(node);
  return results;
}

async function browseChannelVideos(
  apiKey: string,
  channelId: string,
  channelName: string
): Promise<VideoCandidate[]> {
  const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240101.00.00",
          hl: "en",
          gl: "US",
        },
      },
      browseId: channelId,
      params: VIDEOS_TAB_PARAMS,
    }),
  });

  if (!response.ok) {
    throw new Error(`YouTube browse API failed (${response.status})`);
  }

  const data = await response.json();
  return collectVideosFromNode(data, channelName, channelId);
}

function parseInitialData(html: string, channelName: string, channelId?: string): VideoCandidate[] {
  const match = html.match(/var ytInitialData = ({[\s\S]+?});<\/script>/);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1]);
    return collectVideosFromNode(data, channelName, channelId);
  } catch {
    return [];
  }
}

export async function scrapeChannelVideos(
  channelUrl: string,
  channelName: string,
  channelId?: string
): Promise<VideoCandidate[]> {
  const html = await fetchChannelPage(channelUrl);
  const resolvedChannelId = channelId || extractChannelId(html);

  if (!resolvedChannelId) {
    throw new Error("Could not resolve channel ID");
  }

  let videos: VideoCandidate[] = [];

  try {
    const apiKey = extractInnertubeKey(html);
    videos = await browseChannelVideos(apiKey, resolvedChannelId, channelName);
  } catch (error) {
    console.error("Browse API failed, falling back to page parse:", error);
  }

  if (videos.length === 0) {
    videos = parseInitialData(html, channelName, resolvedChannelId);
  }

  return videos
    .filter((v) => v.videoId && v.title)
    .slice(0, 30);
}
