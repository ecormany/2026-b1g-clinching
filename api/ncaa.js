// Backup live-score feed for live.js. The NCAA scoreboard proxy doesn't send
// CORS headers, so the browser can't call it directly; this passes it through
// and lets Vercel's edge cache share one request among visitors.
const URL = "https://ncaa-api.henrygd.me/scoreboard/football/fbs/2026/13/all-conf";

export default async function handler(req, res) {
  try {
    const r = await fetch(URL, { headers: { accept: "application/json" } });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=30");
    res.status(200).json(await r.json());
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
}
