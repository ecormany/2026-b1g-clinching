// Prints every final-week combination with the result this site shows, as
// JSON, for scripts/tiebreak.py to check against the tiebreaker rules.
import { ALL_OUTCOMES, RESULT, VARS, valueOf, CONTENDERS, matchedScenarios } from "../engine.js";
import { SCENARIOS } from "../data.js";
console.log(JSON.stringify(ALL_OUTCOMES.map((o) => ({
  o,
  w: Object.fromEntries(VARS.map((v) => [v.id, valueOf(o, v.id)])),
  result: RESULT[o].teams,
  inferred: CONTENDERS.some((t) => matchedScenarios(o, t).some((i) => SCENARIOS[t][i].inferred)),
}))));
