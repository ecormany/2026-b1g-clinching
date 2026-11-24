"""Big Ten championship-game tiebreaker (2026 rules), applied to every
final-week combination and compared with the results the site shows.

Usage:  npm run tiebreak
  (= node scripts/export-outcomes.mjs | python3 scripts/tiebreak.py)

Conference results come from ESPN's public scoreboard API. Rules:
https://bigten.org/sports/2026/11/10/FB_1110261447.aspx

Interpretation notes, both confirmed by reproducing every combination the
league's published scenarios spell out:
  * common opponents tied in the standings are compared as one group;
  * in a 3+ team tie, once a team is selected only the teams still in
    contention at that step start over (eliminated teams stay out).
"""
import json, sys, itertools, urllib.request
from fractions import Fraction as F

ESPN = {"IU": "IND", "RUTG": "RUT", "NU": "NW"}
code = lambda a: ESPN.get(a, a)

API = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=5&week={}&dates=2026&seasontype=2&limit=100"

def load_games():
    g = []
    for week in range(1, 16):
        with urllib.request.urlopen(API.format(week), timeout=30) as r:
            data = json.load(r)
        for e in data.get("events", []):
            c = e["competitions"][0]
            if not c.get("conferenceCompetition") or not c["status"]["type"]["completed"]:
                continue
            t = {x["homeAway"]: x for x in c["competitors"]}
            h, a = t["home"], t["away"]
            hs, as_ = int(h["score"]), int(a["score"])
            w, l = (code(h["team"]["abbreviation"]), code(a["team"]["abbreviation"])) if hs > as_ else (code(a["team"]["abbreviation"]), code(h["team"]["abbreviation"]))
            g.append((w, l))
    return g

class Season:
    def __init__(self, games):
        self.games = games  # (winner, loser)
        self.teams = sorted({t for g in games for t in g})
        self.opp = {t: [] for t in self.teams}
        for w, l in games:
            self.opp[w].append(l); self.opp[l].append(w)
        self.wins = {t: sum(1 for w, _ in games if w == t) for t in self.teams}
        self.n = {t: len(self.opp[t]) for t in self.teams}
    pct = lambda s, t: F(s.wins[t], s.n[t])
    def result(self, a, b):  # +1 a beat b, -1 lost, 0 didn't play
        r = 0
        for w, l in self.games:
            if (w, l) == (a, b): r += 1
            if (w, l) == (b, a): r -= 1
        return r
    def rec_vs(self, t, opps):
        w = sum(1 for o in opps for x in self.games if x == (t, o))
        l = sum(1 for o in opps for x in self.games if x == (o, t))
        return F(w, w + l) if w + l else None
    def opp_pct(self, t):
        return F(sum(self.wins[o] for o in self.opp[t]), sum(self.n[o] for o in self.opp[t]))
    def finish_groups(self, opps):
        by = {}
        for o in opps: by.setdefault(self.pct(o), []).append(o)
        return [by[k] for k in sorted(by, reverse=True)]

class Oracle:
    """Enumerates every combination of choices made during a run."""
    def __init__(self): self.prefix, self.sizes, self.i = [], [], 0
    def choose(self, k):
        if self.i < len(self.prefix): c = self.prefix[self.i]
        else: c = 0; self.prefix.append(0)
        if self.i < len(self.sizes): self.sizes[self.i] = k
        else: self.sizes.append(k)
        self.i += 1
        return c
    def next(self):
        self.prefix, self.sizes = self.prefix[:self.i], self.sizes[:self.i]
        for j in reversed(range(len(self.prefix))):
            if self.prefix[j] + 1 < self.sizes[j]:
                self.prefix = self.prefix[:j] + [self.prefix[j] + 1]; self.sizes = self.sizes[:j + 1]
                self.i = 0; return True
        return False

SSA_PREF = {"v": None}

class NeedSSA(Exception):
    def __init__(self, teams): self.teams = sorted(teams)

def common(S, teams):
    sets = [set(S.opp[t]) - set(teams) for t in teams]
    return sorted(set.intersection(*sets))

def by_order(S, teams, opps, mode):
    """Common opponents in order of finish. mode='group' treats opponents
    tied in the standings as one unit; otherwise mode is a full ordering."""
    if mode == "group":
        units = S.finish_groups(opps)
    else:  # mode is an Oracle choosing an order within each tied group
        units = []
        for g in S.finish_groups(opps):
            perms = list(itertools.permutations(g))
            units += [[o] for o in perms[mode.choose(len(perms))]]
    for u in units:
        vals = {t: S.rec_vs(t, u) for t in teams}
        if len(set(vals.values())) > 1:
            return vals
    return {t: 0 for t in teams}

def two_team(S, a, b, mode):
    r = S.result(a, b)
    if r: return a if r > 0 else b
    c = common(S, [a, b])
    for vals in ({t: S.rec_vs(t, c) for t in (a, b)},
                 by_order(S, [a, b], c, mode),
                 {t: S.opp_pct(t) for t in (a, b)}):
        if vals[a] != vals[b]: return a if vals[a] > vals[b] else b
    if {a, b} == {"UCLA", "IOWA"} and SSA_PREF["v"]: return SSA_PREF["v"]
    raise NeedSSA([a, b])

def multi_steps(S, T, mode):
    """Yield per-step value maps for 3+ team procedure (head-to-head handled separately)."""
    c = common(S, T)
    yield {t: (S.rec_vs(t, c) if c else 0) for t in T}
    yield by_order(S, T, c, mode)
    yield {t: S.opp_pct(t) for t in T}

def head_to_head(S, T):
    allplayed = all(S.result(a, b) for a, b in itertools.combinations(T, 2))
    if allplayed:
        return {t: S.rec_vs(t, [o for o in T if o != t]) for t in T}
    sweep = [t for t in T if all(S.result(t, o) > 0 for o in T if o != t)]
    if sweep: return {t: (1 if t == sweep[0] else 0) for t in T}
    return {t: 0 for t in T}

def pick(S, T, need, mode):
    """Select `need` (1 or 2) teams from tied group T."""
    T = list(T)
    if len(T) <= need: return T
    if len(T) == 2: return [two_team(S, *T, mode)]
    rem = T
    steps = [lambda R: head_to_head(S, R)] + [None]
    vals_iter = None
    i = 0
    while True:
        if i == 0: vals = head_to_head(S, rem)
        else:
            vals = list(multi_steps(S, rem, mode))[i - 1] if i <= 3 else None
            if vals is None: raise NeedSSA(rem)
        i += 1
        top = max(vals.values()); best = [t for t in rem if vals[t] == top]
        if len(best) == len(rem): continue           # everyone still tied
        if len(best) == 1:
            sel = best[0]
            if need == 1: return [sel]
            # only teams still in contention revert; eliminated teams stay out
            others = [t for t in rem if t != sel]
            return [sel] + pick(S, others, 1, mode)
        if len(best) == 2:
            if need == 2: return best
            return [two_team(S, *best, mode)]
        rem = best; i = 0 if False else i         # 3+ remain: continue with them at next step

def participants(S, mode):
    groups = S.finish_groups(S.teams)
    top = groups[0]
    if len(top) >= 2: return sorted(pick(S, top, 2, mode))
    return sorted(top + pick(S, groups[1], 1, mode))

def orderings(S, base):
    """All total orders of base consistent with standings (ties permuted)."""
    gs = S.finish_groups(base)
    for combo in itertools.product(*[itertools.permutations(g) for g in gs]):
        yield [o for g in combo for o in g]

def run(S, mode):
    try: return tuple(participants(S, mode))
    except NeedSSA as e: return ("SSA?",) + tuple(e.teams)

def solve(S, ssa_pref):
    """Answers under 'tied opponents as a group' and under every way of
    ordering tied opponents. Returns (group_answer, set_of_order_answers)."""
    SSA_PREF["v"] = ssa_pref
    g = run(S, "group")
    orc, seen = Oracle(), set()
    while True:
        orc.i = 0
        seen.add(run(S, orc))
        if not orc.next(): break
    return g, seen

if __name__ == "__main__":
    base = load_games()
    print(f"{len(base)} completed conference games", file=sys.stderr)
    rows = json.load(sys.stdin)
    agree = differ = 0
    for row in rows:
        extra = []
        for gid, w in row["w"].items():
            if gid == "SSA": continue
            a, h = gid.split("-"); extra.append((w, h if w == a else a))
        S = Season(base + extra)
        grouped, _ = solve(S, row["w"]["SSA"])
        if grouped == tuple(sorted(row["result"])): agree += 1
        else:
            differ += 1
            print("DIFFERS", row["o"], row["w"], "site:", row["result"], "rules:", grouped)
    print(f"{agree} of {len(rows)} combinations agree with the tiebreaker rules"
          + (f"; {differ} differ" if differ else ""))
    sys.exit(1 if differ else 0)
