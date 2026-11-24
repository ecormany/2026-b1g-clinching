"""Build mock live-score fixtures for ?mock=<name> (see live.js).

Usage: python3 scripts/make-fixtures.py <real ESPN week-13 scoreboard JSON> [<real NCAA scoreboard JSON>]

Each fixture starts from the real (pregame) response, trimmed to the fields
live.js reads, then sets game states by hand.
"""
import copy, json, sys, pathlib

OUT = pathlib.Path(__file__).parent / "fixtures"

def trim(e):
    c = e["competitions"][0]
    return {"id": e["id"], "shortName": e["shortName"], "date": e["date"], "competitions": [{
        "status": {k: c["status"][k] for k in ("clock", "displayClock", "period")} | {"type": {k: c["status"]["type"][k] for k in ("name", "state", "completed")}},
        "competitors": [{"homeAway": x["homeAway"], "score": x.get("score", "0"), "team": {"id": x["team"]["id"], "abbreviation": x["team"]["abbreviation"]}} for x in c["competitors"]],
    }]}

STATUS = {"pre": ("STATUS_SCHEDULED", False), "in": ("STATUS_IN_PROGRESS", False), "half": ("STATUS_HALFTIME", False),
          "end": ("STATUS_END_PERIOD", False), "post": ("STATUS_FINAL", True)}

def setg(ev, short, state, away=0, home=0, period=0, clock="0:00", ball=None, p=None):
    e = next(x for x in ev if x["shortName"] == short)
    c = e["competitions"][0]
    name, done = STATUS[state]
    c["status"].update(displayClock=clock, period=period)
    c["status"]["type"] = {"name": name, "state": "post" if done else ("pre" if state == "pre" else "in"), "completed": done}
    H = next(x for x in c["competitors"] if x["homeAway"] == "home")
    A = next(x for x in c["competitors"] if x["homeAway"] == "away")
    A["score"], H["score"] = str(away), str(home)
    if done:
        A["winner"], H["winner"] = away > home, home > away
    c.pop("situation", None)
    if state in ("in", "half", "end"):
        sit = {}
        if ball: sit["possession"] = (H if ball == "home" else A)["team"]["id"]
        if p is not None: sit["lastPlay"] = {"probability": {"homeWinPercentage": p}}
        c["situation"] = sit

def write(name, ev):
    (OUT / f"{name}.json").write_text(json.dumps({"events": ev}, separators=(",", ":")))
    print("wrote", name)

base = [trim(e) for e in json.load(open(sys.argv[1]))["events"]]
OUT.mkdir(exist_ok=True)
write("pre", base)

# Friday: Nebraska leads Iowa in the 3rd, Nebraska ball.
ev = copy.deepcopy(base)
setg(ev, "NEB @ IOWA", "in", 17, 10, 3, "6:42", ball="away", p=0.31)
write("friday", ev)

# Friday: tied at halftime (no "if leads hold" path).
ev = copy.deepcopy(base)
setg(ev, "NEB @ IOWA", "half", 7, 7, 2, "0:00", p=0.55)
write("tied", ev)

# Saturday afternoon: three finals, four live (one without an ESPN win chance), two to come.
sat = copy.deepcopy(base)
setg(sat, "NEB @ IOWA", "post", 13, 24, 4)
setg(sat, "MINN @ WIS", "post", 20, 17, 4)
setg(sat, "MICH @ OSU", "post", 14, 31, 4)
setg(sat, "ILL @ NU", "in", 24, 21, 4, "2:15", ball="home", p=0.38)
setg(sat, "USC @ UCLA", "in", 10, 14, 2, "3:01", ball="away", p=0.47)
setg(sat, "PSU @ MD", "half", 17, 3, 2, "0:00", p=0.18)
setg(sat, "MSU @ RUTG", "end", 3, 0, 1, "0:00")  # no win chance: falls back to the model
write("saturday", sat)

# Everything final: favorites mostly win.
ev = copy.deepcopy(sat)
setg(ev, "ILL @ NU", "post", 27, 21, 4)
setg(ev, "USC @ UCLA", "post", 28, 17, 4)
setg(ev, "PSU @ MD", "post", 31, 10, 4)
setg(ev, "MSU @ RUTG", "post", 20, 13, 4)
setg(ev, "PUR @ IU", "post", 7, 45, 4)
setg(ev, "WASH @ ORE", "post", 17, 34, 4)
write("final", ev)

# Same Saturday state in the NCAA feed's format (tests the fallback parser).
if len(sys.argv) > 2:
    n = json.load(open(sys.argv[2]))
    seo = {"NEB @ IOWA": "nebraska", "MINN @ WIS": "minnesota", "MICH @ OSU": "michigan", "ILL @ NU": "illinois",
           "USC @ UCLA": "southern-california", "PSU @ MD": "penn-st", "MSU @ RUTG": "michigan-st"}
    games = [g for g in n["games"] if g["game"]["away"]["names"]["seo"] in
             {"nebraska", "minnesota", "michigan", "illinois", "southern-california", "penn-st", "michigan-st", "purdue", "washington"}]
    for g in games:
        x = g["game"]
        e = next((e for e in sat if seo.get(e["shortName"]) == x["away"]["names"]["seo"]), None)
        if not e: continue
        c = e["competitions"][0]
        A = next(y for y in c["competitors"] if y["homeAway"] == "away")
        H = next(y for y in c["competitors"] if y["homeAway"] == "home")
        st = c["status"]
        x["away"]["score"], x["home"]["score"] = A["score"], H["score"]
        x["gameState"] = {"post": "final", "in": "live"}.get(st["type"]["state"], "pre")
        x["away"]["winner"], x["home"]["winner"] = bool(A.get("winner")), bool(H.get("winner"))
        x["currentPeriod"] = "FINAL" if st["type"]["completed"] else "HALF" if st["type"]["name"] == "STATUS_HALFTIME" else ["", "1ST", "2ND", "3RD", "4TH"][st["period"]]
        x["contestClock"] = st["displayClock"]
    (OUT / "saturday-ncaa.json").write_text(json.dumps({"games": games}, separators=(",", ":")))
    print("wrote saturday-ncaa")
