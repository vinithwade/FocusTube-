import type { LearningGoal, ParsedIntent, IntentType } from "@shared/types";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "must", "shall", "can", "need", "want", "know", "learn",
  "how", "what", "when", "where", "why", "which", "who", "this", "that", "these",
  "those", "i", "me", "my", "we", "our", "you", "your", "it", "its", "they",
  "them", "their", "he", "she", "his", "her", "about", "into", "through",
  "during", "before", "after", "above", "below", "between", "under", "again",
  "further", "then", "once", "here", "there", "all", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "because", "as", "until", "while",
  "open", "show", "visit", "watch", "goto", "channel", "youtube", "videos",
  "video", "please", "help",
]);

const LEARNING_SIGNALS = [
  "learn", "learning", "how to", "tutorial", "explained", "guide", "setup",
  "implement", "understand", "course", "lesson", "walkthrough", "example",
  "build", "create", "fix", "debug", "master", "introduction", "intro",
  "basics", "advanced", "project", "step by step", "walk through",
];

const AVOID_TERMS = [
  "reaction", "reacts", "prank", "vlog", "podcast", "asmr", "shorts",
  "compilation", "funny", "meme", "drama", "roast", "roasting", "tiktok",
  "celebrity", "gossip", "trailer", "teaser", "unboxing", "mukbang",
  "live stream", "highlights", "montage",
];

const CHANNEL_PATTERNS: RegExp[] = [
  /^(?:open|go to|show me|take me to|visit|watch)\s+(?:the\s+)?(.+?)(?:\s+channel)?$/i,
  /^(.+?)\s+channel$/i,
  /^@([\w.-]+)$/i,
  /^channel[:\s]+(.+)$/i,
];

const CHANNEL_FROM_LEARN = [
  /\bfrom\s+([A-Za-z0-9][\w\s.-]{1,40}?)(?:\s+(?:channel|on youtube)|[.,!?]|$)/i,
  /\bby\s+([A-Za-z0-9][\w\s.-]{1,40}?)(?:\s+(?:channel|on youtube)|[.,!?]|$)/i,
  /\bon\s+([A-Za-z0-9][\w\s.-]{1,40}?)(?:'s)?\s+channel/i,
];

function unique(words: string[]): string[] {
  return [...new Set(words)];
}

function hasLearningSignals(text: string): boolean {
  const lower = text.toLowerCase();
  return LEARNING_SIGNALS.some((signal) => lower.includes(signal));
}

function cleanChannelName(name: string): string {
  return name
    .replace(/^@/, "")
    .replace(/\s+channel$/i, "")
    .replace(/['']s$/i, "")
    .trim();
}

function extractTopic(query: string): string {
  return query
    .replace(/^(?:i\s+)?(?:want|need)\s+to\s+/i, "")
    .replace(/^help\s+me\s+/i, "")
    .replace(/^show\s+me\s+(?:how\s+to\s+)?/i, "")
    .replace(/\s+(?:please|thanks|thank you)[.!]?$/i, "")
    .trim();
}

function extractChannelHint(query: string): string | undefined {
  for (const pattern of CHANNEL_FROM_LEARN) {
    const match = query.match(pattern);
    if (match?.[1]) {
      const hint = cleanChannelName(match[1]);
      if (hint.length >= 2 && !hasLearningSignals(hint)) {
        return hint;
      }
    }
  }
  return undefined;
}

function detectChannelIntent(query: string): string | null {
  const trimmed = query.trim();

  if (/^@[\w.-]+$/.test(trimmed)) {
    return cleanChannelName(trimmed);
  }

  for (const pattern of CHANNEL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const name = cleanChannelName(match[1]);
      if (name.length >= 2) return name;
    }
  }

  // Short query without learning signals → likely a channel name
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 3 && !hasLearningSignals(trimmed) && trimmed.length >= 2) {
    return cleanChannelName(trimmed);
  }

  return null;
}

function buildLearnQueries(topic: string, channelHint?: string): string[] {
  const queries: string[] = [];
  const lower = topic.toLowerCase();

  if (channelHint) {
    queries.push(`${channelHint} ${topic}`);
    queries.push(`${topic} ${channelHint}`);
  }

  queries.push(topic);

  if (!lower.startsWith("how to") && !lower.startsWith("how do")) {
    queries.push(`how to ${topic}`);
  }

  if (!/tutorial|course|guide|explained|walkthrough/i.test(topic)) {
    queries.push(`${topic} tutorial explained`);
  }

  return unique(queries).slice(0, 5);
}

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function parseIntent(goal: LearningGoal): ParsedIntent {
  const query = goal.query.trim();
  const channelName = detectChannelIntent(query);
  const channelHint = extractChannelHint(query);

  if (channelName && !hasLearningSignals(query)) {
    return {
      type: "channel",
      channelName,
      searchQueries: [channelName],
      mustCover: [],
      avoid: AVOID_TERMS,
      idealDuration: goal.maxDurationMinutes
        ? `under ${goal.maxDurationMinutes} minutes`
        : "under 30 minutes",
    };
  }

  const topic = extractTopic(query);
  const keywords = extractKeywords(topic);
  const mustCover = unique(keywords).slice(0, 15);

  return {
    type: "learn",
    topic,
    channelHint,
    searchQueries: buildLearnQueries(topic, channelHint),
    mustCover,
    avoid: AVOID_TERMS,
    idealDuration: goal.maxDurationMinutes
      ? `under ${goal.maxDurationMinutes} minutes`
      : "under 30 minutes",
  };
}

export function buildIntentText(goal: LearningGoal, intent: ParsedIntent): string {
  if (intent.type === "channel" && intent.channelName) {
    return `YouTube channel: ${intent.channelName}`;
  }
  const parts = [intent.topic || goal.query];
  if (intent.channelHint) {
    parts.push(`from channel ${intent.channelHint}`);
  }
  return parts.join(" — ");
}

export function classifyIntentType(query: string): IntentType {
  const channelName = detectChannelIntent(query);
  if (channelName && !hasLearningSignals(query)) return "channel";
  return "learn";
}
