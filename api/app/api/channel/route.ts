import { NextRequest, NextResponse } from "next/server";
import { searchChannel, getChannelVideos } from "@/lib/youtube";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  const channelId = request.nextUrl.searchParams.get("channelId");

  if (!name && !channelId) {
    return NextResponse.json(
      { error: "name or channelId is required" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const channel = await searchChannel(name || channelId!);
    if (!channel) {
      return NextResponse.json(
        { error: "Channel not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const videos = await getChannelVideos(
      channel.channelName,
      channel.channelId,
      channel.channelUrl
    );

    return NextResponse.json({ channel, videos }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load channel";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
