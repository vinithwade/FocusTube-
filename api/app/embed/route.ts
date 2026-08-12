import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("v");
  const autoplay = request.nextUrl.searchParams.get("autoplay") !== "0";

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return new NextResponse("Invalid video ID", { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const embedSrc = new URL(`https://www.youtube.com/embed/${videoId}`);
  embedSrc.searchParams.set("autoplay", autoplay ? "1" : "0");
  embedSrc.searchParams.set("rel", "0");
  embedSrc.searchParams.set("modestbranding", "1");
  embedSrc.searchParams.set("playsinline", "1");
  embedSrc.searchParams.set("origin", origin);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe
    src="${embedSrc.toString()}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"
    title="YouTube video"
  ></iframe>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "frame-ancestors 'self' chrome-extension: http://localhost:* https://localhost:* https://*.onrender.com",
    },
  });
}
