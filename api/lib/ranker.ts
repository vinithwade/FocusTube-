import type {
  LearningGoal,
  ParsedIntent,
  RankedResult,
  VideoCandidate,
} from "@shared/types";
import { buildIntentText, extractKeywords } from "./intent";
import { cosineSimilarity, embedText } from "./embeddings";
import { channelNameMatches, formatDuration } from "./youtube";

const MIN_SEMANTIC_SCORE = 0.28;
const MIN_FINAL_SCORE = 35;

const CLICKBAIT_PATTERNS = [
  /\byou won't believe\b/i,
  /\bshocking\b/i,
  /\bgone wrong\b/i,
  /\bdestroyed\b/i,
  /\bexposed\b/i,
  /\binsane\b/i,
  /\bcrazy\b/i,
  /\bultimate guide\b/i,
  /\beverything you need\b/i,
  /\bwatch this\b/i,
  /\bclick here\b/i,
];

interface ScoreBreakdown {
  semantic: number;
  keywords: number;
  titleMatch: number;
  channelMatch: number;
  efficiency: number;
  transcript: number;
  penalties: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  avoidHits: string[];
}

function buildVideoText(candidate: VideoCandidate): string {
  return [candidate.title, candidate.channelTitle, candidate.description, candidate.transcriptSample || ""]
    .join(". ")
    .slice(0, 12000);
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
  const score = matched.length / keywords.length;

  return { score, matched, missing };
}

function titleRelevanceScore(title: string, topic: string, keywords: string[]): number {
  const titleLower = title.toLowerCase();
  const topicLower = topic.toLowerCase();

  if (titleLower.includes(topicLower) && topicLower.length > 5) return 1;

  const topicWords = topicLower.split(/\s+/).filter((w) => w.length > 3);
  if (topicWords.length === 0) return 0;

  const matched = topicWords.filter((w) => titleLower.includes(w));
  return matched.length / topicWords.length;
}

function efficiencyScore(durationSeconds: number, maxDurationMinutes?: number): number {
  if (durationSeconds <= 0) return 0.5;
  const idealMax = (maxDurationMinutes || 30) * 60;
  if (durationSeconds <= idealMax * 0.5) return 1;
  if (durationSeconds <= idealMax) return 0.85;
  if (durationSeconds <= idealMax * 1.5) return 0.4;
  return 0.1;
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
): ScoreBreakdown | null {
  if (semanticSimilarity < MIN_SEMANTIC_SCORE) {
    return null;
  }

  const videoText = buildVideoText(candidate);
  const queryKeywords = extractKeywords(intent.topic || goal.query);
  const topic = intent.topic || goal.query;

  const mustCover = keywordOverlapScore(intent.mustCover, videoText);
  const titleMatch = titleRelevanceScore(candidate.title, topic, queryKeywords);

  // Require at least some keyword overlap for learning queries
  if (intent.mustCover.length >= 2 && mustCover.matched.length === 0 && titleMatch < 0.3) {
    return null;
  }

  const avoidHits = detectAvoidHits(videoText, intent.avoid);

  let penalties = 0;
  if (avoidHits.length > 0) penalties += 20;
  if (detectClickbait(candidate.title)) penalties += 15;
  if (!candidate.hasTranscript) penalties += 5;

  const channelMatch =
    intent.channelHint && channelNameMatches(candidate.channelTitle, intent.channelHint) ? 15 : 0;

  const semantic = Math.max(0, semanticSimilarity) * 45;
  const keywords = mustCover.score * 25;
  const title = titleMatch * 15;
  const efficiency = efficiencyScore(candidate.durationSeconds, goal.maxDurationMinutes) * 10;
  const transcript = candidate.hasTranscript ? 5 : 0;

  return {
    semantic,
    keywords,
    titleMatch: title,
    channelMatch,
    efficiency,
    transcript,
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

  parts.push(`Strong match (${Math.round(totalScore)}/100) for your query.`);

  if (breakdown.titleMatch >= 0.7) {
    parts.push("Title directly addresses your topic.");
  }

  if (breakdown.matchedKeywords.length > 0) {
    parts.push(`Covers: ${breakdown.matchedKeywords.slice(0, 5).join(", ")}.`);
  }

  if (breakdown.channelMatch > 0 && intent.channelHint) {
    parts.push(`From the channel you asked for (${intent.channelHint}).`);
  }

  if (candidate.hasTranscript) {
    parts.push("Transcript verified for content relevance.");
  }

  const tradeoffs: string[] = [];

  if (!candidate.hasTranscript) {
    tradeoffs.push("No transcript — ranked from title and description.");
  }

  if (breakdown.missingKeywords.length > 0) {
    tradeoffs.push(`May not cover: ${breakdown.missingKeywords.slice(0, 3).join(", ")}.`);
  }

  if (breakdown.avoidHits.length > 0) {
    tradeoffs.push(`Possible off-topic content detected.`);
  }

  if (tradeoffs.length === 0) {
    tradeoffs.push("Best match found for your query.");
  }

  return { whyThisVideo: parts.join(" "), tradeoffs: tradeoffs.join(" ") };
}

export async function rankVideos(
  goal: LearningGoal,
  intent: ParsedIntent,
  candidates: VideoCandidate[]
): Promise<RankedResult[]> {
  if (candidates.length === 0) return [];

  const intentText = buildIntentText(goal, intent);
  const intentEmbedding = await embedText(intentText);

  const scored: RankedResult[] = [];

  for (const candidate of candidates) {
    const videoText = buildVideoText(candidate);
    const videoEmbedding = await embedText(videoText);
    const similarity = cosineSimilarity(intentEmbedding, videoEmbedding);
    const breakdown = scoreCandidate(candidate, intent, goal, similarity);

    if (!breakdown) continue;

    const rawScore =
      breakdown.semantic +
      breakdown.keywords +
      breakdown.titleMatch +
      breakdown.channelMatch +
      breakdown.efficiency +
      breakdown.transcript -
      breakdown.penalties;

    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    if (score < MIN_FINAL_SCORE) continue;

    const { whyThisVideo, tradeoffs } = buildExplanation(candidate, breakdown, score, intent);

    scored.push({
      videoId: candidate.videoId,
      score,
      title: candidate.title,
      channelTitle: candidate.channelTitle,
      thumbnailUrl: candidate.thumbnailUrl,
      durationSeconds: candidate.durationSeconds,
      viewCount: candidate.viewCount,
      whyThisVideo,
      tradeoffs,
      hasTranscript: candidate.hasTranscript,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}
