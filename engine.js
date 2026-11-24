import { TEAMS, GAMES, SCENARIOS, SSA, GAPS } from "./data.js";

// Variables: each game (value = winning team code) plus the SportSource tiebreak.
export const VARS = [
  ...GAMES.map((g) => ({ id: g.id, kind: "game", options: [g.away, g.home], game: g })),
  { id: SSA.id, kind: "ssa", options: ["IOWA", "UCLA"] },
];

export const CONTENDERS = Object.keys(TEAMS).filter((t) => TEAMS[t].contender);

const teamGame = {};
for (const g of GAMES) { teamGame[g.away] = g.id; teamGame[g.home] = g.id; }

// An outcome is an integer; bit i selects VARS[i].options[bit].
export const ALL_OUTCOMES = Array.from({ length: 1 << VARS.length }, (_, i) => i);
const varIndex = Object.fromEntries(VARS.map((v, i) => [v.id, i]));

export function valueOf(outcome, varId) {
  const i = varIndex[varId];
  return VARS[i].options[(outcome >> i) & 1];
}

function wins(outcome, team) { return valueOf(outcome, teamGame[team]) === team; }

function lit(outcome, l) {
  if (typeof l === "object") return l.any.some((t) => wins(outcome, t));
  if (l.startsWith("SSA:")) return valueOf(outcome, "SSA") === l.slice(4);
  if (l.startsWith("!")) return !wins(outcome, l.slice(1));
  return wins(outcome, l);
}

// Which scenarios (by index) clinch for a team in this outcome.
export function matchedScenarios(outcome, team) {
  return SCENARIOS[team].map((s, i) => (s.c.every((l) => lit(outcome, l)) ? i : -1)).filter((i) => i >= 0);
}

export function clinchers(outcome) {
  return CONTENDERS.filter((t) => matchedScenarios(outcome, t).length > 0);
}

// Result per outcome: { teams: [two clinchers] } or, where the league's
// scenarios fall short, { teams: [known], gap: GAPS entry }.
function resolve(o) {
  const teams = clinchers(o);
  if (teams.length === 2) return { teams, key: teams.join("+") };
  const gap = GAPS.find((g) => g.c.every((l) => lit(o, l)));
  if (!gap || teams.length !== 1) throw new Error("Unhandled outcome " + o + " " + teams);
  return { teams, gap, key: teams.join("+") + "+?" + gap.candidates.join("/") };
}
export const RESULT = ALL_OUTCOMES.map(resolve);
export const resultKey = (o) => RESULT[o].key;

// ---- Probability (optional) from point spreads: P(fav) ≈ Φ(spread / 13.5)
export function phi(x) { // standard normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
export const VAR_PROB = VARS.map((v) => {
  if (v.kind !== "game") return [0.5, 0.5];
  const pf = phi(v.game.spread / 13.5);
  return v.options.map((t) => (t === v.game.fav ? pf : 1 - pf));
});
// `probs` is one [p(option 0), p(option 1)] pair per VARS entry; pass
// liveProbs() to use in-game win chances instead of pregame lines.
export function weight(outcome, probs = VAR_PROB) {
  let w = 1;
  for (let i = 0; i < VARS.length; i++) w *= probs[i][(outcome >> i) & 1];
  return w;
}

// Pregame chances, with in-progress games replaced by their live chance
// (pHome = chance the home team wins). Clamped so no live branch vanishes
// before the game is actually over.
export function liveProbs(slate) {
  return VARS.map((v, i) => {
    const s = v.kind === "game" && slate?.[v.id];
    if (!s || s.state !== "in" || s.pHome == null) return VAR_PROB[i];
    const ph = Math.min(0.995, Math.max(0.005, s.pHome));
    return v.options.map((t) => (t === v.game.home ? ph : 1 - ph));
  });
}

// Chance each contender reaches the title game, given fixed picks.
export function chances(picks, probs = VAR_PROB) {
  const out = Object.fromEntries(CONTENDERS.map((t) => [t, 0]));
  let total = 0;
  for (const o of filterOutcomes(picks)) {
    const w = weight(o, probs);
    total += w;
    RESULT[o].teams.forEach((t) => (out[t] += w));
  }
  for (const t of CONTENDERS) out[t] /= total || 1;
  return out;
}

// Filter outcomes by fixed picks {varId: value}.
export function filterOutcomes(picks) {
  const entries = Object.entries(picks);
  return ALL_OUTCOMES.filter((o) => entries.every(([k, v]) => valueOf(o, k) === v));
}

// ---- Fixed game order (like NYT's "512 Paths"): greedily pick the game that
// most reduces uncertainty about the title-game matchup, given the games
// already placed above it. Every combination counts equally here, so the
// order reflects the league's logic, not the betting lines.
function condEntropy(idxs) {
  const groups = {};
  for (const o of ALL_OUTCOMES) {
    const g = idxs.map((i) => (o >> i) & 1).join("");
    const c = (groups[g] ||= {});
    c[resultKey(o)] = (c[resultKey(o)] || 0) + 1;
  }
  let h = 0;
  for (const c of Object.values(groups)) {
    const n = Object.values(c).reduce((a, b) => a + b, 0);
    for (const k of Object.values(c)) h -= (k / ALL_OUTCOMES.length) * Math.log2(k / n);
  }
  return h;
}
export const DECISIVE_ORDER = (() => {
  const order = [];
  while (order.length < VARS.length) {
    let best = null;
    VARS.forEach((_, i) => {
      if (order.includes(i)) return;
      const h = condEntropy([...order, i]);
      if (!best || h < best.h - 1e-12) best = { i, h };
    });
    order.push(best.i);
  }
  return order; // indices into VARS
})();

// Kickoff order (the SportSource tiebreaker, not a game, goes last).
function kickoff(g) {
  const [, md] = g.day.split(" ");
  const [hm, ap] = g.time.split(" ");
  let [h, m] = hm.split(":").map(Number);
  if (ap === "PM" && h !== 12) h += 12;
  return md + String(h).padStart(2, "0") + String(m).padStart(2, "0");
}
export const TIME_ORDER = VARS.map((v, i) => i).sort((a, b) => {
  const va = VARS[a], vb = VARS[b];
  if (!va.game || !vb.game) return !va.game - !vb.game;
  return kickoff(va.game).localeCompare(kickoff(vb.game)) || a - b;
});
export const ORDERS = { decisive: DECISIVE_ORDER, time: TIME_ORDER };
export const ORDER = DECISIVE_ORDER;

// Does flipping game i change the matchup anywhere in this set of outcomes?
function relevant(outcomes, i) {
  return outcomes.some((o) => RESULT[o].key !== RESULT[o ^ (1 << i)].key);
}

// Canonical key for a set of conditions (independent of tree order, so the
// same branch keeps its identity when the order changes).
export const condKey = (cond) =>
  VARS.map((v) => v.id).filter((id) => id in cond).map((id) => `${id}:${cond[id]}`).join("|") || "root";

// Binary tree in the given game order. A game that can't change the result inside a branch is
// skipped there (the band passes straight through). A branch stops as soon as
// the matchup is decided.
export function buildFlow(picks, order = DECISIVE_ORDER) {
  return grow(filterOutcomes(picks), { ...picks }, 0, null, order);
}
function grow(outcomes, cond, k, parent, ORDER) {
  const n = { key: condKey(cond), cond, outcomes, parent };
  if (new Set(outcomes.map(resultKey)).size === 1) {
    n.leaf = true;
    n.result = RESULT[outcomes[0]];
    return n;
  }
  while (VARS[ORDER[k]].id in cond || !relevant(outcomes, ORDER[k])) k++;
  const i = ORDER[k];
  n.varId = VARS[i].id;
  n.children = VARS[i].options.map((val, b) =>
    grow(outcomes.filter((o) => ((o >> i) & 1) === b), { ...cond, [VARS[i].id]: val }, k + 1, n, ORDER));
  n.children.forEach((c, b) => (c.value = VARS[i].options[b]));
  return n;
}
