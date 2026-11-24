import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { TEAMS, SCENARIOS } from "./data.js";
import { VARS, CONTENDERS, ORDERS, condKey, weight, buildFlow, matchedScenarios } from "./engine.js";

// ---------- constants ----------
const ROW = 62;          // vertical distance between games
const TOP = 18;          // space above the trunk
const STUB = 34;         // length of the trunk before the first split
const LEAF_DROP = 30;    // how far a decided branch runs past its last split
const DUR = 750;
const ABBR = { IND: "IND", IOWA: "IOWA", OSU: "OSU", ORE: "ORE", UCLA: "UCLA", USC: "USC" };
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const T = (t) => TEAMS[t];
const band = (t) => T(t).band || T(t).color;
const ink = (t) => T(t).ink || "#fff";
const varById = Object.fromEntries(VARS.map((v) => [v.id, v]));
let orderName = "decisive";   // "decisive" | "time"
let orderIds = ORDERS[orderName].map((i) => VARS[i].id);
const $ = (id) => document.getElementById(id);

// ---------- state ----------
let picks = {};
let prevPicks = {};
let slow = 1;
let current = null;      // layout of the tree on screen
let selected = null;      // clicked branch (node)
let focusTeam = null;     // clicked team code

const svg = d3.select("#tree");
const defs = svg.append("defs");
defs.append("pattern").attr("id", "hatch").attr("width", 5).attr("height", 5)
  .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)")
  .call((p) => { p.append("rect").attr("width", 5).attr("height", 5).attr("fill", "#ece8df"); p.append("rect").attr("width", 2.2).attr("height", 5).attr("fill", "#b9b3a6"); });
const gRows = svg.append("g").attr("class", "rows");
const gBands = svg.append("g").attr("class", "bands");
const gRibbons = svg.append("g").attr("class", "ribbons");
const gLeaves = svg.append("g").attr("class", "leaves");

// ---------- helpers ----------
function pct(x) {
  if (x >= 1 - 1e-9) return "100%";
  if (x <= 1e-9) return "0%";
  if (x < 0.001) return "<0.1%";
  if (x < 0.01) return "<1%";
  if (x > 0.99) return ">99%";
  return Math.round(x * 100) + "%";
}
const nm = (t) => `<b style="color:${band(t)}">${T(t).name}</b>`;
function listJoin(a) { return a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + (a.length > 2 ? "," : "") + " and " + a.at(-1); }
function matchupHTML(r) {
  if (r.gap) return `${nm(r.teams[0])} vs. ${r.gap.candidates.map(nm).join(" or ")}<span class="q">?</span>`;
  return `${nm(r.teams[0])} vs. ${nm(r.teams[1])}`;
}
function phrase(id, val) {
  const v = varById[id];
  if (v.kind === "ssa") return `${nm(val)} ranks higher in SportSource`;
  const loser = v.options.find((t) => t !== val);
  return `${nm(val)} beats ${T(loser).name}`;
}

// ---------- layout ----------
// Horizontal space is shared out by probability (band width) plus gaps that
// grow the higher up two neighbouring branches split, so the tree reads as one
// trunk dividing into ever-smaller streams.
function layout(root, width) {
  const narrow = width < 560;
  const gutter = narrow ? 76 : 150;
  const pad = 10;
  const nodes = [], leaves = [];
  const total = d3.sum(root.outcomes, (o) => weight(o, true));
  (function walk(n, depth) {
    n.p = d3.sum(n.outcomes, (o) => weight(o, true)) / total;
    n.depth = depth;
    nodes.push(n);
    if (n.leaf) leaves.push(n); else n.children.forEach((c) => walk(c, depth + 1));
  })(root, 0);

  const used = new Set(nodes.filter((n) => !n.leaf).map((n) => n.varId));
  const rows = orderIds.filter((id) => used.has(id));
  const rowY = (id) => TOP + STUB + rows.indexOf(id) * ROW;

  const avail = width - gutter - pad * 2;
  const W = Math.min(560, avail * (leaves.length > 1 ? 0.6 : 0.35));
  const lw = leaves.map((l) => Math.max(l.p * W, 2));
  // gap before leaf i (i>0) weighted by how shallow its split from leaf i-1 is
  const maxD = d3.max(leaves, (l) => l.depth) || 1;
  const lca = (a, b) => { const s = new Set(); for (let x = a; x; x = x.parent) s.add(x); for (let x = b; x; x = x.parent) if (s.has(x)) return x.depth; return 0; };
  const gw = leaves.map((l, i) => (i ? Math.pow(maxD - lca(leaves[i - 1], l), 1.6) + 0.6 : 0));
  const gapTotal = Math.max(0, avail - d3.sum(lw));
  const gsum = d3.sum(gw) || 1;
  const gaps = gw.map((g) => Math.min(g / gsum * gapTotal, 160));
  const span = d3.sum(lw) + d3.sum(gaps);
  let x = gutter + pad + Math.max(0, (avail - span) / 2);
  leaves.forEach((l, i) => { x += gaps[i]; l.x = x + lw[i] / 2; x += lw[i]; });
  (function setX(n) {
    if (n.leaf) return;
    n.children.forEach(setX);
    // centre the parent over the span its children's bands will occupy
    const a = n.children[0], b = n.children[1];
    n.x = ((a.x - a.p * W / 2) + (b.x + b.p * W / 2)) / 2;
  })(root);

  for (const n of [...nodes].reverse()) n.leafList = n.leaf ? [n] : [...n.children[0].leafList, ...n.children[1].leafList];
  for (const n of nodes) {
    n.w = n.p * W;
    n.y = n.leaf ? (n.parent ? n.parent.y + LEAF_DROP : TOP + STUB) : rowY(n.varId);
  }
  for (const n of nodes) {
    if (!n.parent) {
      n.g = { xa: n.x - n.w / 2, xb: n.x + n.w / 2, y0: TOP, cx: n.x, w: n.w, y1: n.y, ch: 0, color: "#c4bdae" };
      continue;
    }
    const P = n.parent;
    const left = P.x - P.w / 2 + (P.children[0] === n ? 0 : P.children[0].w);
    n.g = { xa: left, xb: left + n.w, y0: P.y, cx: n.x, w: n.w, y1: n.y, ch: Math.min(ROW * 0.92, n.y - P.y), color: band(n.value) };
  }

  // End-point caps: a split bar for wide bands; for thin ones, two stacked
  // color squares sized to the room between neighbours at the same depth.
  for (const l of leaves) {
    l.bar = l.w >= 18;
    if (l.bar) { l.capH = 7; continue; }
    let room = 20;
    for (const m of leaves) if (m !== l && Math.abs(m.y - l.y) < 30) room = Math.min(room, Math.abs(m.x - l.x));
    l.sq = Math.max(4, Math.min(9, room - 3));
    l.capH = l.sq * 2 + 1;
  }
  const height = d3.max(leaves, (l) => l.y + 60) + 8;
  return { root, nodes, leaves, rows, rowY, width, height, gutter, narrow };
}

function bandPath(g) {
  const w = Math.max(g.w, 1.4);
  let xa = g.xa, xb = g.xb;
  if (xb - xa < 1.4) { const m = (xa + xb) / 2; xa = m - 0.7; xb = m + 0.7; }
  const l = g.cx - w / 2, r = g.cx + w / 2;
  const yc = g.y0 + g.ch, ym = g.y0 + g.ch / 2;
  return `M${xa},${g.y0}C${xa},${ym} ${l},${ym} ${l},${yc}L${l},${g.y1}L${r},${g.y1}L${r},${yc}C${r},${ym} ${xb},${ym} ${xb},${g.y0}Z`;
}

// Find where a node "was" in the previous render, so it can morph rather than pop.
function previousKey(n, oldKeys) {
  if (oldKeys.has(n.key)) return n.key;
  const c = { ...n.cond };
  for (const k of Object.keys(picks)) if (!(k in prevPicks)) delete c[k];
  for (const k of Object.keys(prevPicks)) {
    if (k in picks) continue;
    if (k in c && c[k] !== prevPicks[k]) return null;
    c[k] = prevPicks[k];
  }
  const k2 = condKey(c);
  return oldKeys.has(k2) ? k2 : null;
}

// ---------- render tree ----------
function renderTree(animate = true) {
  const width = $("tree").parentElement.clientWidth;
  const L = layout(buildFlow(picks, ORDERS[orderName]), Math.max(width, 300));
  current = L;
  selected = null;
  const dur = animate && !reduceMotion ? DUR * slow : 0;
  const t = svg.transition().duration(dur).ease(d3.easeCubicInOut);

  const prevH = dur ? +svg.attr("height") || 0 : 0;
  const h0 = Math.max(L.height, prevH);
  svg.classed("narrow", L.narrow).attr("width", L.width).attr("height", h0).attr("viewBox", `0 0 ${L.width} ${h0}`);
  if (dur) t.on("end.size", () => svg.attr("height", L.height).attr("viewBox", `0 0 ${L.width} ${L.height}`));

  // rows (game labels + guide lines)
  const rows = gRows.selectAll("g.row").data(L.rows, (d) => d);
  rows.exit().transition(t).style("opacity", 0).remove();
  const rEnter = rows.enter().append("g").attr("class", "row").style("opacity", 0)
    .attr("transform", (d) => `translate(0,${L.rowY(d)})`);
  rEnter.append("line").attr("class", "guide");
  rEnter.append("text").attr("class", "rl1");
  rEnter.append("text").attr("class", "rl2");
  const rAll = rEnter.merge(rows);
  rAll.select("line").attr("x1", L.gutter - 8).attr("x2", L.width - 4).attr("y1", 0).attr("y2", 0);
  rAll.select(".rl1").attr("x", 4).attr("y", -3).html((id) => rowLabel(id, L.narrow));
  rAll.select(".rl2").attr("x", 4).attr("y", 12).text((id) => rowSub(id, L.narrow));
  rAll.transition(t).style("opacity", 1).attr("transform", (d) => `translate(0,${L.rowY(d)})`);

  // bands
  const oldGeom = new Map();
  gBands.selectAll("path.band").each(function (d) { oldGeom.set(d.key, this.__g); });
  const oldKeys = new Set(oldGeom.keys());
  const claimed = new Set();
  for (const n of L.nodes) { n.from = previousKey(n, oldKeys); if (n.from) claimed.add(n.from); }

  const bands = gBands.selectAll("path.band").data(L.nodes, (d) => d.key);
  bands.exit().each(function (d) {
    const sel = d3.select(this);
    if (claimed.has(d.key) || !dur) return sel.remove();
    const g = this.__g, m = (g.xa + g.xb) / 2;
    const end = { ...g, xa: m, xb: m, w: 0 };
    sel.classed("leaving", true).transition(t).style("opacity", 0)
      .attrTween("d", () => { const i = d3.interpolateObject(g, end); return (s) => bandPath(i(s)); }).remove();
  });
  const bEnter = bands.enter().append("path").attr("class", "band")
    .each(function (d) {
      const from = dur && d.from && oldGeom.get(d.from);
      this.__g = from ? { ...from } : dur ? { ...d.g, y1: d.g.y0, ch: 0, cx: (d.g.xa + d.g.xb) / 2, w: d.g.xb - d.g.xa } : { ...d.g };
      d3.select(this).style("opacity", from || !dur ? 1 : 0).attr("fill", from ? from.color : d.g.color);
    })
    .attr("d", function () { return bandPath(this.__g); });
  bEnter.merge(bands).classed("dim", false).classed("hot", false)
    .transition(t).style("opacity", 1)
    .attrTween("d", function (d) {
      const i = d3.interpolateObject(this.__g, d.g);
      return (s) => { this.__g = i(s); return bandPath(this.__g); };
    })
    .attr("fill", (d) => d.g.color);

  // leaves (end points)
  const lv = gLeaves.selectAll("g.leaf").data(L.leaves, (d) => d.key);
  lv.exit().transition(t).style("opacity", 0).remove();
  const lEnter = lv.enter().append("g").attr("class", "leaf").style("opacity", 0)
    .attr("transform", (d) => `translate(${d.x},${d.y})`);
  const lAll = lEnter.merge(lv).classed("dim", false);
  lAll.each(function (d) { drawLeaf(d3.select(this), d); });
  placeLabels(L, lAll);
  lAll.transition(t).delay(dur ? dur * 0.25 : 0).style("opacity", 1).attr("transform", (d) => `translate(${d.x},${d.y})`);

  prevPicks = { ...picks };
}

function rowLabel(id, narrow) {
  const v = varById[id];
  if (v.kind === "ssa") return narrow
    ? `<tspan fill="${band("UCLA")}">UCLA</tspan>/<tspan fill="${band("IOWA")}">IA</tspan>`
    : `<tspan fill="${band("UCLA")}">UCLA</tspan> <tspan class="at">or</tspan> <tspan fill="${band("IOWA")}">Iowa</tspan>`;
  const g = v.game, a = narrow ? g.away : T(g.away).short, h = narrow ? g.home : T(g.home).short;
  return `<tspan fill="${band(g.away)}">${a}</tspan> <tspan class="at">at</tspan> <tspan fill="${band(g.home)}">${h}</tspan>`;
}
function rowSub(id, narrow) {
  const v = varById[id];
  if (v.kind === "ssa") return narrow ? "tiebreak" : "SportSource tiebreaker";
  return narrow ? `${v.game.day.split(" ")[0]} ${v.game.time.replace(":00", "").replace(" ", "")}` : `${v.game.day} · ${v.game.time} · ${v.game.tv}`;
}

function drawLeaf(sel, d) {
  sel.selectAll("*").remove();
  const res = d.result, a = res.teams[0];
  const bFill = res.gap ? "url(#hatch)" : band(res.teams[1]);
  // matchup cap
  if (d.bar) {
    const bw = d.w;
    sel.append("rect").attr("x", -bw / 2).attr("y", 0).attr("width", bw / 2).attr("height", 7).attr("fill", band(a));
    sel.append("rect").attr("x", 0).attr("y", 0).attr("width", bw / 2).attr("height", 7).attr("fill", bFill);
  } else {
    const q = d.sq;
    sel.append("rect").attr("class", "sq").attr("x", -q / 2).attr("y", 0).attr("width", q).attr("height", q).attr("rx", 1).attr("fill", band(a));
    sel.append("rect").attr("class", "sq").attr("x", -q / 2).attr("y", q + 1).attr("width", q).attr("height", q).attr("rx", 1).attr("fill", bFill);
  }
  // Two label layouts; placeLabels() keeps whichever fits, or neither.
  const second = res.gap ? res.gap.candidates.map((c) => ABBR[c]).join("/") + "?" : ABBR[res.teams[1]];
  const secondFill = res.gap ? "#8a857a" : band(res.teams[1]);
  const y = d.capH + 11;
  const one = sel.append("text").attr("class", "ltxt one").attr("y", y);
  one.append("tspan").attr("x", 0).attr("fill", band(a)).text(ABBR[a]);
  one.append("tspan").attr("class", "vs").text(" vs ");
  one.append("tspan").attr("fill", secondFill).text(second);
  one.append("tspan").attr("x", 0).attr("dy", 13).attr("class", "lp").text(pct(d.p));
  const stack = sel.append("text").attr("class", "ltxt stack").attr("y", y);
  stack.append("tspan").attr("x", 0).attr("fill", band(a)).text(ABBR[a]);
  (res.gap ? res.gap.candidates.map((c) => ABBR[c] + "?") : [ABBR[res.teams[1]]])
    .forEach((t) => stack.append("tspan").attr("x", 0).attr("dy", 11).attr("fill", secondFill).text(t));
  stack.append("tspan").attr("x", 0).attr("dy", 12).attr("class", "lp").text(pct(d.p));
}

// Measure every label and keep it only if it clears the other labels, the
// end-point caps and the bands; biggest end points get first claim. Labels
// that don't fit collapse away, leaving the color squares.
function placeLabels(L, sel) {
  const pad = 2;
  const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const blocks = [];
  for (const n of L.nodes) {
    if (!n.parent) continue;
    const g = n.g, w = Math.max(g.w, 1.4), mid = g.y0 + g.ch / 2;
    blocks.push({ x0: Math.min(g.xa, g.xb - 1.4), x1: Math.max(g.xb, g.xa + 1.4), y0: g.y0, y1: mid, own: n });
    blocks.push({ x0: g.cx - w / 2, x1: g.cx + w / 2, y0: mid, y1: g.y1, own: n });
  }
  for (const l of L.leaves) {
    const hw = l.bar ? l.w / 2 : l.sq / 2;
    blocks.push({ x0: l.x - hw, x1: l.x + hw, y0: l.y, y1: l.y + l.capH, own: l });
  }
  const els = new Map();
  sel.each(function (d) { els.set(d, this); });
  svg.classed("measuring", true); // hidden text has no size, so show it all briefly
  const order = [...L.leaves].sort((a, b) => b.p - a.p);
  for (const l of order) {
    const g = d3.select(els.get(l));
    const variants = ["one", "stack"].map((k) => {
      const node = g.select(".ltxt." + k).node();
      const bb = node.getBBox();
      return { k, box: { x0: l.x + bb.x - pad, x1: l.x + bb.x + bb.width + pad, y0: l.y + bb.y - 1, y1: l.y + bb.y + bb.height } };
    });
    const fits = (b) => b.x0 >= L.gutter - 2 && b.x1 <= L.width - 2 && !blocks.some((o) => o.own !== l && hit(b, o));
    const pick = variants.find((v) => fits(v.box));
    l.label = pick ? pick.k : null;
    if (pick) blocks.push({ ...pick.box, own: l });
    g.classed("collapsed", !pick);
    g.selectAll(".ltxt").classed("show", function () { return !!pick && this.classList.contains(pick.k); });
  }
  svg.classed("measuring", false);
}

// ---------- hover + click ----------
function targetAt(event) {
  if (!current) return null;
  const el = event.target.closest?.("path.band");
  if (el && !el.classList.contains("leaving")) return d3.select(el).datum();
  const [mx, my] = d3.pointer(event, svg.node());
  if (mx < current.gutter - 10) return null;
  let best = null, bd = Infinity;
  for (const l of current.leaves) {
    const dist = Math.hypot(Math.max(0, Math.abs(l.x - mx) - l.w / 2), (l.y + 10) - my);
    if (dist < bd) { bd = dist; best = l; }
  }
  return bd < 36 ? best : null;
}

// One place decides what is highlighted: a clicked branch, or a team's paths.
function applyHighlight() {
  if (!current) return;
  let on = null;
  if (selected) {
    on = new Set();
    for (let a = selected; a; a = a.parent) on.add(a.key);
    (function down(x) { on.add(x.key); if (!x.leaf) x.children.forEach(down); })(selected);
  } else if (focusTeam) {
    on = new Set();
    (function mark(n) {
      const hit = n.leaf ? hasTeam(n.result, focusTeam) : n.children.map(mark).some(Boolean);
      if (hit) on.add(n.key);
      return hit;
    })(current.root);
  }
  const ribbons = !selected && focusTeam;
  gBands.selectAll("path.band").classed("dim", (d) => !!on && !on.has(d.key) && !ribbons).classed("under", !!ribbons).classed("hot", (d) => d === selected);
  drawRibbons(ribbons ? focusTeam : null);
  gLeaves.selectAll("g.leaf").classed("dim", (d) => !!on && !on.has(d.key)).classed("focus", (d) => d === selected);
  gLeaves.selectAll("g.leaf").filter((d) => d === selected).raise();
  document.querySelectorAll(".team[data-team]").forEach((el) => el.classList.toggle("focused", el.dataset.team === focusTeam));
  document.body.classList.toggle("team-focus", !!focusTeam && !selected);
  sentence();
}
// A team's share of each band: the slices belonging to its end points, which
// tile the band exactly because bands are partitioned in end-point order.
function drawRibbons(team) {
  const data = [];
  if (team) for (const n of current.nodes) {
    let o = 0, run = null;
    const flush = () => { if (run) data.push(run); run = null; };
    for (const l of n.leafList) {
      const kind = l.result.teams.includes(team) ? "in" : l.result.gap?.candidates.includes(team) ? "maybe" : null;
      if (kind && run && run.kind === kind) run.w += l.w;
      else { flush(); if (kind) run = { n, kind, o, w: l.w }; }
      o += l.w;
    }
    flush();
  }
  gRibbons.selectAll("path").data(data).join("path")
    .attr("class", (d) => "ribbon " + d.kind)
    .attr("fill", (d) => d.n.g.color)
    .attr("d", ({ n, o, w }) => {
      const g = n.g;
      return bandPath({ ...g, xa: g.xa + o, xb: g.xa + o + w, cx: g.cx - g.w / 2 + o + w / 2, w });
    });
}
const hasTeam = (r, t) => r.teams.includes(t) || !!r.gap?.candidates.includes(t);

function sentence() {
  const el = $("sentence");
  const root = current.root;
  const n = selected;
  if (!n && focusTeam) {
    let pin = 0, pmaybe = 0, count = 0;
    (function walk(x) {
      if (!x.leaf) return x.children.forEach(walk);
      if (x.result.teams.includes(focusTeam)) { pin += x.p; count++; }
      else if (x.result.gap?.candidates.includes(focusTeam)) { pmaybe += x.p; count++; }
    })(root);
    el.innerHTML = `Every path that sends ${nm(focusTeam)} to Indy: <span class="chance">${pct(pin)}</span>`
      + (pmaybe > 1e-9 ? ` <span class="muted">plus ${pct(pmaybe)} the league leaves unresolved.</span>` : "")
      + ` <span class="muted">${count} end point${count === 1 ? "" : "s"}. Tap any branch to filter possibilities.</span>`;
    return;
  }
  if (!n) {
    if (root.leaf) { el.innerHTML = `Decided: ${matchupHTML(root.result)}.`; return; }
    el.innerHTML = `<span class="muted">Tap any branch to filter possibilities. Most likely right now:</span> ${topMatchups(root, 2)}`;
    return;
  }
  const conds = orderIds.filter((id) => id in n.cond && !(id in picks)).map((id) => phrase(id, n.cond[id]));
  const lead = conds.length ? `If ${listJoin(conds)}` : Object.keys(picks).length ? "With your picks" : "Before any games are played";
  const lock = conds.length ? ` <button type="button" class="lockin" id="lockin" style="--c:${n.g.color}"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2 3h12l-4.6 5.4V13l-2.8-1.4V8.4z" fill="currentColor"/></svg>Show only this branch</button>` : "";
  el.innerHTML = n.leaf
    ? `${lead}, it's ${matchupHTML(n.result)}. <span class="chance">${pct(n.p)}</span>${lock}`
    : `${lead}, it's still open. <span class="muted">Possible:</span> ${topMatchups(n, 3)}${lock}`;
}

function topMatchups(n, k) {
  const m = new Map();
  (function walk(x) { if (x.leaf) { const e = m.get(x.result.key) || { r: x.result, p: 0 }; e.p += x.p; m.set(x.result.key, e); } else x.children.forEach(walk); })(n);
  const list = [...m.values()].sort((a, b) => b.p - a.p);
  const shown = list.slice(0, k).map((e) => `${matchupHTML(e.r)} <span class="chance">${pct(e.p / n.p)}</span>`).join("<span class='sep'>·</span>");
  return shown + (list.length > k ? ` <span class="muted">+${list.length - k} more</span>` : "");
}

svg.on("click", (e) => {
  const n = targetAt(e);
  selected = !n || !n.parent || n === selected ? null : n;
  applyHighlight();
});

// ---------- teams, games, result ----------
// Team cards persist between renders so their bars, numbers and order can
// animate: bars via CSS width transitions, numbers by counting, and position
// changes with FLIP (measure, reorder, then slide from the old spot).
const teamEls = new Map();
const teamVal = new Map();
function renderTeams(animate = true) {
  const pin = {}, pmaybe = {}, possible = new Set();
  CONTENDERS.forEach((t) => { pin[t] = 0; pmaybe[t] = 0; });
  (function walk(n) {
    if (!n.leaf) return n.children.forEach(walk);
    n.result.teams.forEach((t) => { pin[t] += n.p; possible.add(t); });
    n.result.gap?.candidates.forEach((t) => { pmaybe[t] += n.p; possible.add(t); });
  })(current.root);
  if (focusTeam && !possible.has(focusTeam)) focusTeam = null;
  const order = [...CONTENDERS].sort((a, b) => pin[b] - pin[a] || pmaybe[b] - pmaybe[a]);
  const dur = animate && !reduceMotion ? DUR * slow : 0;
  const box = $("teams");
  const before = new Map();
  if (dur) teamEls.forEach((el, t) => before.set(t, el.getBoundingClientRect()));

  for (const t of order) {
    let el = teamEls.get(t);
    if (!el) {
      el = document.createElement("button");
      el.type = "button";
      el.className = "team";
      el.dataset.team = t;
      el.style.cssText = `--c:${T(t).color};--i:${ink(t)}`;
      el.innerHTML = `<span class="tname">${T(t).name}</span><span class="tval"><span class="num"></span><small></small></span><span class="tbar"><span></span></span>`;
      teamEls.set(t, el);
    }
    box.appendChild(el); // moves it into sorted position
    const status = !possible.has(t) ? "out" : pin[t] > 1 - 1e-9 ? "in" : "alive";
    el.classList.remove("in", "out", "alive");
    el.classList.add(status);
    el.disabled = status === "out";
    el.setAttribute("aria-pressed", focusTeam === t);
    el.title = status === "out" ? "" : `Highlight every path that sends ${T(t).name} to Indy`;
    const bar = el.querySelector(".tbar span"), w = `${(pin[t] * 100).toFixed(1)}%`;
    bar.style.width = w;
    // animated explicitly: moving the card in the DOM would cancel a CSS transition
    if (dur && teamVal.has(t) && Math.abs(teamVal.get(t) - pin[t]) > 1e-9)
      bar.animate([{ width: `${(teamVal.get(t) * 100).toFixed(1)}%` }, { width: w }], { duration: dur, easing: "cubic-bezier(.2, .8, .2, 1)" });
    const small = el.querySelector(".tval small");
    const maybe = status === "alive" && pmaybe[t] > 1e-6;
    small.textContent = maybe ? `+${pct(pmaybe[t])}?` : "";
    small.title = maybe ? "Chance of an outcome the league's text leaves unresolved" : "";
    const final = status === "in" ? "In" : status === "out" ? "Out" : pct(pin[t]);
    countTo(el, teamVal.has(t) ? teamVal.get(t) : pin[t], pin[t], final, dur);
    teamVal.set(t, pin[t]);
  }

  if (dur) for (const [t, el] of teamEls) {
    const a = before.get(t), b = el.getBoundingClientRect();
    if (!a) continue;
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: dur, easing: "cubic-bezier(.2, .8, .2, 1)" });
  }
}

function countTo(el, from, to, final, dur) {
  const node = el.querySelector(".num");
  const id = (el._count = (el._count || 0) + 1);
  if (!dur || Math.abs(from - to) < 1e-9) { node.textContent = final; return; }
  const t0 = performance.now();
  (function step(now) {
    if (el._count !== id) return; // a newer change took over
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    node.textContent = k < 1 ? pct(from + (to - from) * e) : final;
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

function renderGames() {
  const live = new Set(current.rows);
  $("games").innerHTML = orderIds.map((id) => {
    const v = varById[id];
    const picked = picks[id];
    const idle = !picked && !live.has(id);
    const meta = v.kind === "ssa" ? "Tiebreaker" : `${v.game.day.split(" ")[0]} ${v.game.time} · ${v.game.tv}`;
    const btns = v.options.map((t, i) => {
      const label = v.kind === "ssa" ? `${T(t).short} higher` : T(t).short;
      const fav = v.kind === "game" && v.game.fav === t ? `<small>−${v.game.spread}</small>` : "";
      return `${i ? `<span class="at">${v.kind === "ssa" ? "or" : "@"}</span>` : ""}<button type="button" class="opt ${picked === t ? "on" : ""} ${picked && picked !== t ? "off" : ""}" data-var="${id}" data-val="${t}" style="--c:${band(t)};--i:${ink(t)}">${label}${fav}</button>`;
    }).join("");
    return `<div class="game ${idle ? "idle" : ""} ${picked ? "picked" : ""}"><div class="gmeta">${meta}${idle ? " · <em>doesn't matter now</em>" : ""}</div><div class="gopts">${btns}</div></div>`;
  }).join("");
}

function renderResult() {
  const el = $("result");
  const root = current.root;
  if (!root.leaf) { el.hidden = true; return; }
  const r = root.result;
  const why = r.teams.map((t) => {
    const idx = new Set();
    root.outcomes.forEach((o) => matchedScenarios(o, t).forEach((i) => idx.add(i)));
    return `<div class="why"><span class="whyc" style="background:${band(t)}"></span><div><b>${T(t).name} clinches</b>${[...idx].map((i) => { const sc = SCENARIOS[t][i]; return sc.inferred ? `<p><em>Inferred.</em> ${sc.text}.</p><p class="whyx">${sc.why}</p>` : `<p>“${sc.text}”</p>`; }).join("")}</div></div>`;
  }).join("");
  el.hidden = false;
  el.innerHTML = `<p class="rk">${r.gap ? "Title game, mostly set" : "Title game set"}</p>
    <h2>${r.teams.map((t) => `<b style="color:${T(t).ink || band(t)}"${T(t).ink ? ' class="ink"' : ""}>${T(t).name}</b>`).join(" vs. ")}</h2>
    ${r.gap ? `<p class="gapnote">${r.gap.note}</p>` : `<p class="rsub">Dec. 5 · Lucas Oil Stadium, Indianapolis · FOX</p>`}
    <div class="whys"><p class="rk">${root.outcomes.some((o) => r.teams.some((t) => matchedScenarios(o, t).some((i) => SCENARIOS[t][i].inferred))) ? "Why" : "Per the league"}</p>${why}</div>`;
}

// ---------- state changes ----------
let hlTimer;
function renderAll(animate) {
  renderTree(animate);
  renderTeams(animate);
  renderGames();
  renderResult();
  clearTimeout(hlTimer);
  if (animate && !reduceMotion && focusTeam) {
    gRibbons.selectAll("path").remove();
    gBands.selectAll("path.band").classed("under", false);
    sentence();
    hlTimer = setTimeout(applyHighlight, DUR * slow + 30);
  } else applyHighlight();
}
function setPicks(next) {
  picks = next;
  writeHash();
  renderAll(true);
  slow = 1;
}

document.addEventListener("click", (e) => {
  const opt = e.target.closest("[data-var]");
  if (opt) {
    slow = e.altKey ? 6 : 1;
    const { var: k, val } = opt.dataset;
    const next = { ...picks };
    if (next[k] === val) delete next[k]; else next[k] = val;
    return setPicks(next);
  }
  const team = e.target.closest("[data-team]");
  if (team) {
    focusTeam = focusTeam === team.dataset.team ? null : team.dataset.team;
    selected = null;
    applyHighlight();
    if (focusTeam) revealTree();
    return;
  }
  if (e.target.closest("#lockin") && selected) {
    slow = e.altKey ? 6 : 1;
    return setPicks({ ...picks, ...selected.cond });
  }
  const ord = e.target.closest("[data-order]");
  if (ord) {
    if (ord.dataset.order === orderName) return;
    slow = e.altKey ? 6 : 1;
    setOrder(ord.dataset.order);
    writeHash();
    renderAll(true);
    slow = 1;
    return;
  }
  if (e.target.closest("#reset")) { slow = e.altKey ? 6 : 1; return setPicks({}); }
});

// On small screens the tree sits well below the team cards. When a team is
// picked and the top of the tree pane isn't (meaningfully) on screen, bring it up.
function revealTree() {
  const box = document.querySelector(".treebox").getBoundingClientRect();
  if (box.top >= 0 && box.top <= innerHeight - 160) return;
  scrollTo({ top: scrollY + box.top - 12, behavior: reduceMotion ? "auto" : "smooth" });
}

let rt;
addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => renderAll(false), 120); });

function setOrder(name) {
  orderName = ORDERS[name] ? name : "decisive";
  orderIds = ORDERS[orderName].map((i) => VARS[i].id);
  document.querySelectorAll("[data-order]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.order === orderName));
}
function readHash() {
  const out = {};
  const m = location.hash.match(/p=([^&]*)/);
  if (m) for (const part of decodeURIComponent(m[1]).split(",")) {
    const [k, v] = part.split(":");
    if (varById[k]?.options.includes(v)) out[k] = v;
  }
  return out;
}
function writeHash() {
  const s = orderIds.filter((k) => k in picks).map((k) => `${k}:${picks[k]}`).join(",");
  const parts = [s && `p=${s}`, orderName !== "decisive" && `o=${orderName}`].filter(Boolean);
  history.replaceState(null, "", parts.length ? `#${parts.join("&")}` : location.pathname + location.search);
}

setOrder((location.hash.match(/o=(\w+)/) || [])[1]);
picks = readHash();
prevPicks = { ...picks };
renderAll(false);
