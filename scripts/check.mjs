// Verifies every combination of results resolves to a title-game matchup
// (or a documented gap) and prints the tree's shape.  Run: npm run check
import { ALL_OUTCOMES, RESULT, ORDERS, VARS, buildFlow, filterOutcomes } from "../engine.js";

const counts = {};
for (const o of ALL_OUTCOMES) counts[RESULT[o].key] = (counts[RESULT[o].key] || 0) + 1;
console.table(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ result: k, combos: n })));
for (const [name, order] of Object.entries(ORDERS)) {
  let nodes = 0, leaves = 0;
  (function walk(n) { nodes++; if (n.leaf) leaves++; else n.children.forEach(walk); })(buildFlow({}, order));
  console.log(`${name}: ${order.map((i) => VARS[i].id).join(" → ")}\n  ${nodes} nodes, ${leaves} end points`);
}

// Live feed parsers against the mock fixtures (see scripts/make-fixtures.py).
import fs from "node:fs";
globalThis.location ??= { search: "" };
const { parseEspn, parseNcaa } = await import("../live.js");
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const finals = (s) => Object.fromEntries(Object.values(s).filter((g) => g.winner).map((g) => [g.id, g.winner]));
const assert = (ok, msg) => { if (!ok) { console.error("FAIL:", msg); process.exitCode = 1; } };
for (const n of ["pre", "friday", "tied", "saturday", "final"]) assert(Object.keys(parseEspn(fx(n))).length === 9, `${n}: 9 games`);
assert(Object.keys(finals(parseEspn(fx("saturday")))).join() === "NEB-IOWA,MINN-WIS,MICH-OSU", "saturday finals");
const done = [...new Set(filterOutcomes(finals(parseEspn(fx("final")))).map((o) => RESULT[o].key))];
assert(done.join() === "IND+ORE", `final fixture decides IND+ORE (got ${done})`);
const ncaa = parseNcaa(fx("saturday-ncaa")), espn = parseEspn(fx("saturday"));
assert(Object.keys(ncaa).length === 9 && JSON.stringify(finals(ncaa)) === JSON.stringify(finals(espn)), "NCAA parser agrees with ESPN");
console.log(process.exitCode ? "live fixtures: FAILED" : "live fixtures: ok");
