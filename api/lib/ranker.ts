import type {
  LearningGoal,
  ParsedIntent,
  RankedResult,
  VideoCandidate,
} from "@shared/types";
import { buildIntentText, extractKeywords } from "./intent";
import { cosineSimilarity, embedText, embedBatch } from "./embeddings";
import { channelNameMatches } from "./youtube";

const CLICKBAIT_PATTERNS = [
  /\byou won't believe\b/i,
  /\bshocking\b/i,
  /\bgone wrong\b/i,
  /\bdestroyed\b/i,
  /\bexposed\b/i,
  /\binsane\b/i,
  /\bcrazy\b/i,
  /\bwatch this\b/i,
  /\bclick here\b/i,
];

const TUTORIAL_SIGNALS = [
  "tutorial",
  "course",
  "beginner",
  "beginners",
  "introduction",
  "intro",
  "guide",
  "explained",
  "walkthrough",
  "lesson",
  "full course",
  "crash course",
];

interface ScoreBreakdown {
  youtube: number;
  titleMatch: number;
  keywords: number;
  semantic: number;
  channelMatch: number;
  tutorialBonus: number;
  penalties: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  avoidHits: string[];
}

function buildVideoText(candidate: VideoCandidate): string {
  return [candidate.title, candidate.channelTitle, candidate.description]
    .filter(Boolean)
    .join(". ")
    .slice(0, 4000);
}

function keywordOverlapScore(
  keywords: string[],
  text: string
): { score: number; matched: string[]; missing: string[] } {
  if (keywords.length === 0) {
    return { score: 0, matched: [], missing: [] };
  }

  const lower = text.toLowerCase();
  const matched = keywords.filter((kw) => lower.includes(kw));
  const missing = keywords.filter((kw) => !lower.includes(kw));
  return { score: matched.length / keywords.length, matched, missing };
}

function titleRelevanceScore(title: string, topic: string): number {
  const titleLower = title.toLowerCase();
  const topicLower = topic.toLowerCase();

  if (titleLower.includes(topicLower) && topicLower.length > 4) return 1;

  const topicWords = topicLower.split(/\s+/).filter((w) => w.length > 2);
  if (topicWords.length === 0) return 0;

  const matched = topicWords.filter((w) => titleLower.includes(w));
  return matched.length / topicWords.length;
}

function youtubeRankScore(rank: number | undefined): number {
  if (rank === undefined) return 5;
  // YouTube's top results dominate — mirrors native search relevance.
  return Math.max(0, 50 - rank * 2.5);
}

function tutorialBonusScore(title: string, description: string, query: string): number {
  const text = `${title} ${description} ${query}`.toLowerCase();
  const queryWantsLearning = TUTORIAL_SIGNALS.some((s) => query.toLowerCase().includes(s));
  if (!queryWantsLearning) return 0;
  return TUTORIAL_SIGNALS.some((s) => text.includes(s)) ? 5 : 0;
}

function detectAvoidHits(text: string, avoid: string[]): string[] {
  const lower = text.toLowerCase();
  return avoid.filter((term) => lower.includes(term));
}

function detectClickbait(title: string): boolean {
  return CLICKBAIT_PATTERNS.some((pattern) => pattern.test(title));
}

function scoreCandidate(
  candidate: VideoCandidate,
  intent: ParsedIntent,
  goal: LearningGoal,
  semanticSimilarity: number
): ScoreBreakdown {
  const videoText = buildVideoText(candidate);
  const topic = intent.topic || goal.query;
  const queryKeywords = extractKeywords(topic);

  const mustCover = keywordOverlapScore(intent.mustCover.length > 0 ? intent.mustCover : queryKeywords, videoText);
  const titleMatch = titleRelevanceScore(candidate.title, topic);
  const avoidHits = detectAvoidHits(videoText, intent.avoid);

  let penalties = 0;
  if (avoidHits.length > 0) penalties += 12;
  if (detectClickbait(candidate.title)) penalties += 8;
  if (candidate.durationSeconds > 0 && candidate.durationSeconds < 45) penalties += 15;

  const channelMatch =
    intent.channelHint && channelNameMatches(candidate.channelTitle, intent.channelHint) ? 10 : 0;

  return {
    youtube: youtubeRankScore(candidate.youtubeRank),
    titleMatch: titleMatch * 20,
    keywords: mustCover.score * 15,
    semantic: Math.max(0, semanticSimilarity) * 10,
    channelMatch,
    tutorialBonus: tutorialBonusScore(candidate.title, candidate.description, goal.query),
    penalties,
    matchedKeywords: mustCover.matched,
    missingKeywords: mustCover.missing.slice(0, 5),
    avoidHits,
  };
}

function buildExplanation(
  candidate: VideoCandidate,
  breakdown: ScoreBreakdown,
  totalScore: number,
  intent: ParsedIntent
): { whyThisVideo: string; tradeoffs: string } {
  const parts: string[] = [];

  if ((candidate.youtubeRank ?? 99) <= 2) {
    parts.push("Top YouTube result for your search.");
  } else {
    parts.push(`Strong match (${Math.round(totalScore)}/100) for your query.`);
  }

  if (breakdown.titleMatch >= 14) {
    parts.push("Title directly matches what you searched.");
  }

  if (breakdown.matchedKeywords.length > 0) {
    parts.push(`Covers: ${breakdown.matchedKeywords.slice(0, 5).join(", ")}.`);
  }

  if (breakdown.channelMatch > 0 && intent.channelHint) {
    parts.push(`From ${intent.channelHint}.`);
  }

  const tradeoffs: string[] = [];
  if (breakdown.missingKeywords.length > 0) {
    tradeoffs.push(`May not mention: ${breakdown.missingKeywords.slice(0, 3).join(", ")}.`);
  }
  if (breakdown.avoidHits.length > 0) {
    tradeoffs.push("Possible off-topic signals in title/description.");
  }
  if (tradeoffs.length === 0) {
    tradeoffs.push("Best match from YouTube search for your query.");
  }

  return { whyThisVideo: parts.join(" "), tradeoffs: tradeoffs.join(" ") };
}

function toRankedResult(
  candidate: VideoCandidate,
  breakdown: ScoreBreakdown,
  score: number,
  intent: ParsedIntent
): RankedResult {
  const { whyThisVideo, tradeoffs } = buildExplanation(candidate, breakdown, score, intent);
  return {
    videoId: candidate.videoId,
    score,
    title: candidate.title,
    channelTitle: candidate.channelTitle,
    thumbnailUrl: candidate.thumbnailUrl,
    durationSeconds: candidate.durationSeconds,
    viewCount: candidate.viewCount,
    whyThisVideo,
    tradeoffs,
    hasTranscript: false,
  };
}

export async function rankVideos(
  goal: LearningGoal,
  intent: ParsedIntent,
  candidates: VideoCandidate[]
): Promise<RankedResult[]> {
  if (candidates.length === 0) return [];

  const sortedByYoutube = [...candidates].sort(
    (a, b) => (a.youtubeRank ?? 999) - (b.youtubeRank ?? 999)
  );
  const pool = sortedByYoutube.slice(0, 15);

  const intentText = buildIntentText(goal, intent);
  let intentEmbedding: number[] | null = null;
  let videoEmbeddings: number[][] = [];

  try {
    intentEmbedding = await embedText(intentText, "query");
    videoEmbeddings = await embedBatch(
      pool.map((c) => buildVideoText(c)),
      "document"
    );
  } catch {
    // Fall back to pure YouTube order if model unavailable.
    return pool.slice(0, 3).map((candidate, i) => {
      const breakdown = scoreCandidate(candidate, intent, goal, 0);
      const score = Math.max(70 - i * 5, 50);
      return toRankedResult(candidate, breakdown, score, intent);
    });
  }

  const scored: RankedResult[] = [];

  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[i];
    const similarity = intentEmbedding
      ? cosineSimilarity(intentEmbedding, videoEmbeddings[i])
      : 0;
    const breakdown = scoreCandidate(candidate, intent, goal, similarity);

    const rawScore =
      breakdown.youtube +
      breakdown.titleMatch +
      breakdown.keywords +
      breakdown.semantic +
      breakdown.channelMatch +
      breakdown.tutorialBonus -
      breakdown.penalties;

    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    scored.push(toRankedResult(candidate, breakdown, score, intent));
  }

  scored.sort((a, b) => b.score - a.score);

  // Never overturn YouTube #1 unless our score says it's clearly worse.
  const topYoutube = pool[0];
  if (topYoutube && scored.length > 1) {
    const youtubeTop = scored.find((r) => r.videoId === topYoutube.videoId);
    const currentTop = scored[0];
    if (youtubeTop && currentTop.videoId !== topYoutube.videoId) {
      const gap = currentTop.score - youtubeTop.score;
      if (gap < 8) {
        scored.sort((a, b) => {
          if (a.videoId === topYoutube.videoId) return -1;
          if (b.videoId === topYoutube.videoId) return 1;
          return b.score - a.score;
        });
      }
    }
  }

  return scored.slice(0, 3);
}
