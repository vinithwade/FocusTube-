import YouTube from "youtube-sr";
import type { ChannelResult, VideoCandidate } from "@shared/types";
import type { ParsedIntent } from "@shared/types";
import { scrapeChannelVideos } from "./channel-scraper";

function parseDurationMs(durationMs: number | null | undefined): number {
  if (!durationMs || durationMs <= 0) return 0;
  return Math.floor(durationMs / 1000);
}

function parseViews(views: string | number | null | undefined): number {
  if (typeof views === "number") return views;
  if (!views) return 0;
  const cleaned = views.toString().replace(/[^0-9.KMB]/gi, "");
  if (cleaned.includes("B")) return parseFloat(cleaned) * 1_000_000_000;
  if (cleaned.includes("M")) return parseFloat(cleaned) * 1_000_000;
  if (cleaned.includes("K")) return parseFloat(cleaned) * 1_000;
  return parseInt(cleaned, 10) || 0;
}

function normalizeChannelName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function channelNameMatches(candidateChannel: string, target: string): boolean {
  const a = normalizeChannelName(candidateChannel);
  const b = normalizeChannelName(target);
  return a.includes(b) || b.includes(a);
}

export async function searchChannel(channelName: string): Promise<ChannelResult | null> {
  try {
    const channel = await YouTube.searchOne(channelName, "channel");
    if (!channel?.id && !channel?.url) return null;

    const channelUrl =
      channel.url ||
      (channel.id?.startsWith("UC")
        ? `https://www.youtube.com/channel/${channel.id}`
        : `https://www.youtube.com/@${channelName.replace(/\s+/g, "")}`);

    return {
      channelId: channel.id || "",
      channelName: channel.name || channelName,
      channelUrl,
      thumbnailUrl: channel.iconURL?.({ size: 176 }) || "",
      subscribers: channel.subscribers,
      verified: channel.verified || false,
    };
  } catch (error) {
    console.error(`Channel search failed for "${channelName}":`, error);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function videoToCandidate(video: any): VideoCandidate | null {
  if (!video.id) return null;

  const durationSeconds = parseDurationMs(video.duration);

  return {
    videoId: video.id,
    title: video.title || "",
    description: video.description || "",
    channelTitle: video.channel?.name || "Unknown",
    channelId: video.channel?.id,
    durationSeconds,
    viewCount: parseViews(video.views),
    publishedAt: video.uploadedAt || "",
    thumbnailUrl:
      video.thumbnail?.url ||
      video.thumbnail?.displayThumbnailURL?.("mqdefault") ||
      "",
    hasTranscript: false,
  };
}

export async function searchVideos(
  intent: ParsedIntent,
  maxDurationMinutes?: number
): Promise<VideoCandidate[]> {
  const ordered: VideoCandidate[] = [];
  const seen = new Set<string>();
  const maxDurationSeconds = maxDurationMinutes ? maxDurationMinutes * 60 : undefined;

  for (let queryIndex = 0; queryIndex < intent.searchQueries.length; queryIndex++) {
    const query = intent.searchQueries[queryIndex];
    const isPrimary = queryIndex === 0;

    try {
      const results = await YouTube.search(query, {
        limit: 20,
        type: "video",
        safeSearch: false,
      });

      for (let position = 0; position < results.length; position++) {
        const candidate = videoToCandidate(results[position]);
        if (!candidate || seen.has(candidate.videoId)) continue;

        if (candidate.durationSeconds > 0 && candidate.durationSeconds < 60) continue;
        if (maxDurationSeconds && candidate.durationSeconds > maxDurationSeconds) continue;

        if (intent.channelHint && !channelNameMatches(candidate.channelTitle, intent.channelHint)) {
          continue;
        }

        seen.add(candidate.videoId);
        ordered.push({
          ...candidate,
          youtubeRank: isPrimary ? position : 100 + position,
        });
      }
    } catch (error) {
      console.error(`YouTube search failed for query "${query}":`, error);
    }
  }

  if (ordered.length < 3 && intent.channelHint && intent.topic) {
    try {
      const fallback = await YouTube.search(intent.topic, {
        limit: 15,
        type: "video",
        safeSearch: false,
      });
      for (let position = 0; position < fallback.length; position++) {
        const candidate = videoToCandidate(fallback[position]);
        if (!candidate || seen.has(candidate.videoId)) continue;
        if (candidate.durationSeconds > 0 && candidate.durationSeconds < 60) continue;
        seen.add(candidate.videoId);
        ordered.push({ ...candidate, youtubeRank: 200 + position });
      }
    } catch {
      // ignore fallback errors
    }
  }

  return ordered
    .sort((a, b) => (a.youtubeRank ?? 999) - (b.youtubeRank ?? 999))
    .slice(0, 20);
}

export async function getChannelVideos(
  channelName: string,
  channelId?: string,
  channelUrl?: string
): Promise<VideoCandidate[]> {
  if (channelUrl || channelId) {
    try {
      const url =
        channelUrl ||
        (channelId?.startsWith("UC")
          ? `https://www.youtube.com/channel/${channelId}`
          : `https://www.youtube.com/@${channelName.replace(/\s+/g, "")}`);

      const live = await scrapeChannelVideos(url, channelName, channelId);
      if (live.length > 0) return live;
    } catch (error) {
      console.error("Live channel scrape failed:", error);
    }
  }

  // Fallback: search-based discovery
  const seen = new Map<string, VideoCandidate>();
  const queries = [channelName, `${channelName} latest`];

  for (const query of queries) {
    try {
      const results = await YouTube.search(query, {
        limit: 20,
        type: "video",
        safeSearch: false,
      });

      for (const video of results) {
        const candidate = videoToCandidate(video);
        if (!candidate || seen.has(candidate.videoId)) continue;
        if (candidate.durationSeconds > 0 && candidate.durationSeconds < 60) continue;

        const matchesChannel =
          channelNameMatches(candidate.channelTitle, channelName) ||
          (channelId && candidate.channelId === channelId);

        if (matchesChannel) {
          seen.set(candidate.videoId, candidate);
        }
      }
    } catch (error) {
      console.error(`Channel video search failed for "${query}":`, error);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 24);
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export { channelNameMatches, normalizeChannelName };
