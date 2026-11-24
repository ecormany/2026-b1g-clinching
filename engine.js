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
function phi(x) { // standard normal CDF
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
export function weight(outcome, useOdds) {
  if (!useOdds) return 1;
  let w = 1;
  for (let i = 0; i < VARS.length; i++) w *= VAR_PROB[i][(outcome >> i) & 1];
  return w;
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
export const ORDER = (() => {
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

// Does flipping game i change the matchup anywhere in this set of outcomes?
function relevant(outcomes, i) {
  return outcomes.some((o) => RESULT[o].key !== RESULT[o ^ (1 << i)].key);
}

const condKey = (cond) =>
  ORDER.map((i) => VARS[i].id).filter((id) => id in cond).map((id) => `${id}:${cond[id]}`).join("|") || "root";

// Binary tree in ORDER. A game that can't change the result inside a branch is
// skipped there (the band passes straight through). A branch stops as soon as
// the matchup is decided.
export function buildFlow(picks) {
  return grow(filterOutcomes(picks), { ...picks }, 0, null);
}
function grow(outcomes, cond, k, parent) {
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
    grow(outcomes.filter((o) => ((o >> i) & 1) === b), { ...cond, [VARS[i].id]: val }, k + 1, n));
  n.children.forEach((c, b) => (c.value = VARS[i].options[b]));
  return n;
}
