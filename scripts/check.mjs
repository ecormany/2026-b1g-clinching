// Verifies every combination of results resolves to a title-game matchup
// (or a documented gap) and prints the tree's shape.  Run: npm run check
import { ALL_OUTCOMES, RESULT, ORDER, VARS, buildFlow } from "../engine.js";

const counts = {};
for (const o of ALL_OUTCOMES) counts[RESULT[o].key] = (counts[RESULT[o].key] || 0) + 1;
console.table(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ result: k, combos: n })));
console.log("Game order:", ORDER.map((i) => VARS[i].id).join(" → "));
let nodes = 0, leaves = 0;
(function walk(n) { nodes++; if (n.leaf) leaves++; else n.children.forEach(walk); })(buildFlow({}));
console.log(`${ALL_OUTCOMES.length} combinations · tree: ${nodes} nodes, ${leaves} end points`);
