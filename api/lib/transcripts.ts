import { YoutubeTranscript } from "youtube-transcript";
import type { VideoCandidate } from "@shared/types";

interface TranscriptEntry {
  text: string;
  offset: number;
  duration: number;
}

function sampleTranscript(entries: TranscriptEntry[]): string {
  const words = entries.map((e) => e.text).join(" ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const first = words.slice(0, 500).join(" ");
  const middleStart = Math.floor(words.length / 2) - 100;
  const middle = words.slice(Math.max(0, middleStart), middleStart + 200).join(" ");
  const last = words.slice(-200).join(" ");

  return `[BEGINNING]\n${first}\n\n[MIDDLE]\n${middle}\n\n[END]\n${last}`;
}

export async function enrichWithTranscripts(
  candidates: VideoCandidate[]
): Promise<VideoCandidate[]> {
  const enriched = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const entries = await YoutubeTranscript.fetchTranscript(candidate.videoId);
        const sample = sampleTranscript(entries as TranscriptEntry[]);
        return {
          ...candidate,
          transcriptSample: sample,
          hasTranscript: sample.length > 0,
        };
      } catch {
        return {
          ...candidate,
          transcriptSample: undefined,
          hasTranscript: false,
        };
      }
    })
  );

  return enriched;
}
