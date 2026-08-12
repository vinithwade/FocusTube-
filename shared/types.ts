export type IntentType = "channel" | "learn";

export interface LearningGoal {
  query: string;
  maxDurationMinutes?: number;
}

export interface ParsedIntent {
  type: IntentType;
  searchQueries: string[];
  mustCover: string[];
  avoid: string[];
  idealDuration: string;
  channelName?: string;
  topic?: string;
  channelHint?: string;
}

export interface VideoCandidate {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId?: string;
  durationSeconds: number;
  viewCount: number;
  publishedAt: string;
  thumbnailUrl: string;
  transcriptSample?: string;
  hasTranscript: boolean;
  /** Position in YouTube search results (0 = top result). Lower is better. */
  youtubeRank?: number;
}

export interface RankedResult {
  videoId: string;
  score: number;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
  viewCount: number;
  whyThisVideo: string;
  tradeoffs: string;
  timestamp?: string;
  hasTranscript: boolean;
}

export interface ChannelResult {
  channelId: string;
  channelName: string;
  channelUrl: string;
  thumbnailUrl: string;
  subscribers?: string;
  verified: boolean;
}

export interface SearchResponse {
  intentType: IntentType;
  results: RankedResult[];
  searchQueries: string[];
  took_ms: number;
  channel?: ChannelResult;
}

export interface ActiveSession {
  query: string;
  approvedVideoIds: string[];
  startedAt: number;
  maxDurationMinutes?: number;
}

export interface ExtensionStorage {
  activeSession?: ActiveSession;
  skipUntil?: number;
}
