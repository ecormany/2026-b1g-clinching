// Live scores. Fetches the week's Big Ten games and turns them into one
// entry per game id in data.js:
//   { id, state: "pre"|"in"|"post", winner?, away: {code, score}, home: {code, score},
//     period, clock, status, possession?, pHome? }
// Main source: ESPN's public scoreboard (no key, open CORS). Fallback: the
// NCAA scoreboard through our own /api/ncaa proxy (that feed has no CORS).
// If both fail the page just keeps working without live data.
import { GAMES, ESPN_ABBR, NCAA_SEO } from "./data.js";
import { phi } from "./engine.js";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=5&week=13&dates=2026&seasontype=2&limit=100";
const ESPN_SUMMARY = (id) => `https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${id}`;
const NCAA = "/api/ncaa";

const FAST = 60_000;          // while a game is on (or about to start)
const SLOW = 5 * 60_000;      // otherwise
const SOON = 10 * 60_000;     // "about to start" window
const MAX_BACKOFF = 2 * 60_000;

const byEspn = Object.fromEntries(GAMES.map((g) => [g.espn, g]));
const byNcaa = Object.fromEntries(GAMES.map((g) => [g.ncaa, g]));
const espnCode = (a) => ESPN_ABBR[a] || a;

async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

// Rough in-game win chance when the feed has none: the pregame line counts for
// the share of the game left, and the spread of outcomes shrinks with time.
function modelPHome(g, s) {
  if (s.state !== "in") return null;
  const qLeft = s.period > 4 ? 0 : Math.max(0, 4 - s.period);
  const [m, sec] = (s.clock || "15:00").split(":").map(Number);
  const left = (s.period > 4 ? 0.5 : qLeft * 15 + (m || 0) + (sec || 0) / 60) / 60; // share of 60 min
  const homeLine = g.fav === g.home ? g.spread : -g.spread;
  const margin = s.home.score - s.away.score;
  return phi((margin + homeLine * left) / Math.max(13.5 * Math.sqrt(left), 1.5));
}

// ---------- ESPN ----------
export function parseEspn(json) {
  const out = {};
  for (const e of json.events || []) {
    const g = byEspn[e.id];
    if (!g) continue;
    const c = e.competitions[0], st = c.status;
    const side = (ha) => c.competitors.find((x) => x.homeAway === ha);
    const H = side("home"), A = side("away");
    const s = {
      id: g.id,
      state: st.type.state,
      status: st.type.name,                       // STATUS_HALFTIME, STATUS_END_PERIOD, STATUS_FINAL, ...
      period: st.period || 0,
      clock: st.displayClock,
      away: { code: espnCode(A.team.abbreviation), score: +A.score || 0 },
      home: { code: espnCode(H.team.abbreviation), score: +H.score || 0 },
    };
    if (s.away.code !== g.away || s.home.code !== g.home) continue; // not the game we think it is
    if (st.type.completed) {
      s.state = "post";
      s.winner = A.winner ? g.away : H.winner ? g.home : s.home.score > s.away.score ? g.home : g.away;
    }
    const sit = c.situation;
    if (sit?.possession) s.possession = sit.possession === H.team.id ? g.home : sit.possession === A.team.id ? g.away : undefined;
    const p = sit?.lastPlay?.probability?.homeWinPercentage;
    if (s.state === "in" && typeof p === "number") { s.pHome = p; s.pSource = "espn"; }
    out[g.id] = s;
  }
  return out;
}

// The scoreboard doesn't always carry a win chance; the game summary does.
async function fillEspnChances(slate) {
  await Promise.all(Object.values(slate).filter((s) => s.state === "in" && s.pHome == null).map(async (s) => {
    try {
      const wp = (await getJSON(ESPN_SUMMARY(GAMES.find((g) => g.id === s.id).espn))).winprobability;
      const last = wp?.at(-1)?.homeWinPercentage;
      if (typeof last === "number") { s.pHome = last; s.pSource = "espn"; }
    } catch { /* model below */ }
  }));
}

// ---------- NCAA (via /api/ncaa) ----------
const NCAA_PERIOD = { "1ST": 1, "2ND": 2, "3RD": 3, "4TH": 4, HALF: 2, OT: 5 };
export function parseNcaa(json) {
  const out = {};
  for (const { game: x } of json.games || []) {
    const g = byNcaa[x.gameID];
    if (!g || NCAA_SEO[x.away.names.seo] !== g.away || NCAA_SEO[x.home.names.seo] !== g.home) continue;
    const per = String(x.currentPeriod || "").toUpperCase();
    const s = {
      id: g.id,
      state: x.gameState === "final" ? "post" : x.gameState === "live" ? "in" : "pre",
      status: per === "HALF" ? "STATUS_HALFTIME" : x.gameState === "final" ? "STATUS_FINAL" : "",
      period: NCAA_PERIOD[per] || (/OT/.test(per) ? 5 : 0),
      clock: x.contestClock,
      away: { code: g.away, score: +x.away.score || 0 },
      home: { code: g.home, score: +x.home.score || 0 },
    };
    if (s.state === "post") s.winner = x.away.winner ? g.away : x.home.winner ? g.home : s.home.score > s.away.score ? g.home : g.away;
    out[g.id] = s;
  }
  return out;
}

function finish(slate) {
  for (const s of Object.values(slate)) if (s.state === "in" && s.pHome == null) {
    s.pHome = modelPHome(GAMES.find((g) => g.id === s.id), s);
    s.pSource = "model";
  }
  return slate;
}

export async function fetchSlate() {
  try {
    const slate = parseEspn(await getJSON(ESPN));
    if (!Object.keys(slate).length) throw new Error("ESPN: no matching games");
    await fillEspnChances(slate);
    return { slate: finish(slate), source: "ESPN" };
  } catch (err) {
    const slate = parseNcaa(await getJSON(NCAA)); // throws if this fails too
    if (!Object.keys(slate).length) throw err;
    return { slate: finish(slate), source: "NCAA" };
  }
}

// ---------- polling ----------
function nextDelay(slate) {
  const now = Date.now();
  const all = GAMES.map((g) => slate[g.id]);
  if (all.every((s) => s?.state === "post")) return null;            // done
  if (all.some((s) => s?.state === "in")) return FAST;
  if (GAMES.some((g) => slate[g.id]?.state !== "post" && Date.parse(g.kick) - now < SOON)) return FAST;
  return SLOW;
}

// Calls onData({ slate, source, updated }) after every successful fetch and
// onError(err) after a failure. ?mock=<name> loads scripts/fixtures/<name>.json
// once instead (local testing only; scripts/ isn't deployed).
export function startLive({ onData, onError }) {
  const q = new URLSearchParams(location.search);
  const mock = q.get("mock");
  if (mock) {
    getJSON(`scripts/fixtures/${encodeURIComponent(mock)}.json`)
      .then((j) => {
        const slate = j.games ? parseNcaa(j) : parseEspn(j);
        onData({ slate: finish(slate), source: j.games ? `NCAA mock:${mock}` : `mock:${mock}`, updated: Date.now() - (+q.get("age") || 0) * 1000 });
        if (q.has("fail")) onError(new Error("mock: refresh failed")); // a later poll failing
      })
      .catch(onError);
    return;
  }
  let timer, backoff = FAST, last = null;
  async function tick() {
    clearTimeout(timer);
    if (document.hidden) return; // resumes on visibilitychange
    let delay;
    try {
      last = { ...(await fetchSlate()), updated: Date.now() };
      onData(last);
      backoff = FAST;
      delay = nextDelay(last.slate);
    } catch (err) {
      onError(err);
      delay = backoff;
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
    if (delay != null) timer = setTimeout(tick, delay);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  tick();
}
