import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { LearningGoal, SearchResponse } from "@shared/types";
import { searchVideos, searchChannel } from "@/lib/youtube";
import { enrichWithTranscripts } from "@/lib/transcripts";
import { parseIntent } from "@/lib/intent";
import { rankVideos } from "@/lib/ranker";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCached, setCache } from "@/lib/cache";

const searchSchema = z.object({
  query: z.string().min(3, "Please enter what you want to find"),
  maxDurationMinutes: z.number().positive().optional(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientId = request.headers.get("x-forwarded-for") || "local";

  const rateCheck = checkRateLimit(clientId);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rateCheck.retryAfterMs },
      { status: 429, headers: corsHeaders }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }

  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders }
    );
  }

  const goal: LearningGoal = parsed.data;

  const cached = getCached(goal.query, goal.maxDurationMinutes);
  if (cached) {
    return NextResponse.json(cached, { headers: corsHeaders });
  }

  try {
    const intent = parseIntent(goal);

    // Channel intent → open channel directly
    if (intent.type === "channel" && intent.channelName) {
      const channel = await searchChannel(intent.channelName);

      if (!channel) {
        return NextResponse.json(
          {
            error: `Could not find channel "${intent.channelName}". Try the exact channel name or @handle.`,
            searchQueries: intent.searchQueries,
          },
          { status: 404, headers: corsHeaders }
        );
      }

      const response: SearchResponse = {
        intentType: "channel",
        results: [],
        searchQueries: intent.searchQueries,
        took_ms: Date.now() - startTime,
        channel,
      };

      setCache(goal.query, response, goal.maxDurationMinutes);
      return NextResponse.json(response, { headers: corsHeaders });
    }

    const candidates = await searchVideos(intent, goal.maxDurationMinutes);

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error: "No videos found. Try being more specific about the topic.",
          searchQueries: intent.searchQueries,
        },
        { status: 404, headers: corsHeaders }
      );
    }

    const enriched = await enrichWithTranscripts(candidates);
    const results = await rankVideos(goal, intent, enriched);

    if (results.length === 0) {
      return NextResponse.json(
        {
          error: "No good matches found. Try rephrasing — be specific about the topic you want to learn.",
          searchQueries: intent.searchQueries,
        },
        { status: 404, headers: corsHeaders }
      );
    }

    const response: SearchResponse = {
      intentType: "learn",
      results,
      searchQueries: intent.searchQueries,
      took_ms: Date.now() - startTime,
    };

    setCache(goal.query, response, goal.maxDurationMinutes);
    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
