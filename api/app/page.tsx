export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 600 }}>
      <h1 style={{ color: "#ff4444" }}>FocusTube API</h1>
      <p>Goal-first YouTube video ranking — fully local, no API keys.</p>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Uses <code>youtube-sr</code> to scrape search results and{" "}
        <code>Xenova/all-MiniLM-L6-v2</code> for local relevance ranking.
      </p>
      <h2>Endpoint</h2>
      <pre style={{ background: "#f4f4f4", padding: "1rem", borderRadius: 8 }}>
{`POST /api/search
Content-Type: application/json

{
  "goal": "How to set up RLS in Supabase",
  "reason": "Building auth for my side project",
  "output": "A working policy I can copy-paste",
  "maxDurationMinutes": 20
}`}
      </pre>
      <p>
        No API keys needed. The embedding model (~80MB) downloads on first search.
      </p>
    </main>
  );
}
