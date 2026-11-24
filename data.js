// Source: Big Ten Conference, "2026 Discover Big Ten Football Championship Game Clinch Update" (Nov. 23, 2026)
// https://bigten.org/news/2026/11/23/2026-discover-big-ten-football-championship-game-clinch-update.aspx
// Schedule/lines: ESPN Big Ten schedule, week 13 (Nov. 27–28, 2026)

export const TEAMS = {
  IND:  { name: "Indiana",        short: "Indiana",   color: "#990000", contender: true },
  IOWA: { name: "Iowa",           short: "Iowa",      color: "#111111", accent: "#FFCD00", ink: "#FFCD00", contender: true },
  OSU:  { name: "Ohio State",     short: "Ohio St.",  color: "#BB0000", contender: true },
  ORE:  { name: "Oregon",         short: "Oregon",    color: "#154733", accent: "#FEE123", contender: true },
  UCLA: { name: "UCLA",           short: "UCLA",      color: "#2D68C4", accent: "#F2A900", contender: true },
  USC:  { name: "USC",            short: "USC",       color: "#9D2235", accent: "#FFC72C", contender: true },
  NEB:  { name: "Nebraska",       short: "Nebraska",  color: "#E41C38" },
  MINN: { name: "Minnesota",      short: "Minnesota", color: "#7A0019", accent: "#FFCC33", band: "#E8B320" },
  WIS:  { name: "Wisconsin",      short: "Wisconsin", color: "#C5050C" },
  MICH: { name: "Michigan",       short: "Michigan",  color: "#00274C", accent: "#FFCB05" },
  ILL:  { name: "Illinois",       short: "Illinois",  color: "#E84A27", accent: "#13294B" },
  NW:   { name: "Northwestern",   short: "N'western", color: "#4E2A84" },
  PSU:  { name: "Penn State",     short: "Penn St.",  color: "#041E42" },
  MD:   { name: "Maryland",       short: "Maryland",  color: "#E03A3E", accent: "#FFD520" },
  MSU:  { name: "Michigan State", short: "Mich. St.", color: "#18453B" },
  RUT:  { name: "Rutgers",        short: "Rutgers",   color: "#CC0033" },
  PUR:  { name: "Purdue",         short: "Purdue",    color: "#111111", accent: "#CFB991", ink: "#CFB991" },
  WASH: { name: "Washington",     short: "Washington",color: "#4B2E83", accent: "#B7A57A" },
};

// Each game: away @ home. `fav` / `spread` from ESPN lines (used only for optional odds estimate).
export const GAMES = [
  { id: "NEB-IOWA", away: "NEB",  home: "IOWA", day: "Fri 11/27", time: "12:00 PM", tv: "CBS", fav: "IOWA", spread: 4.5 },
  { id: "MINN-WIS", away: "MINN", home: "WIS",  day: "Fri 11/27", time: "7:30 PM",  tv: "NBC", fav: "WIS",  spread: 7.5 },
  { id: "MICH-OSU", away: "MICH", home: "OSU",  day: "Sat 11/28", time: "12:00 PM", tv: "FOX", fav: "OSU",  spread: 10 },
  { id: "ILL-NW",   away: "ILL",  home: "NW",   day: "Sat 11/28", time: "12:30 PM", tv: "BTN", fav: "NW",   spread: 3 },
  { id: "USC-UCLA", away: "USC",  home: "UCLA", day: "Sat 11/28", time: "3:30 PM",  tv: "CBS", fav: "USC",  spread: 7 },
  { id: "PSU-MD",   away: "PSU",  home: "MD",   day: "Sat 11/28", time: "3:30 PM",  tv: "FS1", fav: "PSU",  spread: 7 },
  { id: "MSU-RUT",  away: "MSU",  home: "RUT",  day: "Sat 11/28", time: "4:15 PM",  tv: "BTN", fav: "MSU",  spread: 3.5 },
  { id: "PUR-IND",  away: "PUR",  home: "IND",  day: "Sat 11/28", time: "7:00 PM",  tv: "FS1", fav: "IND",  spread: 22.5 },
  { id: "WASH-ORE", away: "WASH", home: "ORE",  day: "Sat 11/28", time: "7:30 PM",  tv: "NBC", fav: "ORE",  spread: 14 },
];

// Non-game variable referenced by the final UCLA scenario.
export const SSA = { id: "SSA", label: "SportSource Analytics ranking", options: { UCLA: "UCLA ahead of Iowa", IOWA: "Iowa ahead of UCLA" } };

// Scenario literals: "TEAM" = team wins, "!TEAM" = team loses,
// { any: [...] } = at least one of these wins, "SSA:UCLA" = UCLA ranked above Iowa by SportSource.
// `text` is the league's wording, verbatim.
export const SCENARIOS = {
  IND: [
    { c: ["IND", "!IOWA", "!ORE"], text: "Indiana win AND Iowa and Oregon losses" },
    { c: ["IND", "IOWA", "!ORE", "!UCLA"], text: "Indiana win AND Iowa win AND Oregon and UCLA losses" },
    { c: ["IND", "ORE", "!IOWA", "!UCLA"], text: "Indiana win AND Oregon win AND Iowa and UCLA losses" },
    { c: ["IND", "IOWA", "MINN", "ORE", "!UCLA"], text: "Indiana win AND Iowa, Minnesota and Oregon wins AND UCLA loss" },
  ],
  IOWA: [
    { c: ["IOWA", "!IND", "!ORE"], text: "Iowa win AND Indiana and Oregon losses" },
    { c: ["IOWA", "ORE", "!IND", "!UCLA"], text: "Iowa win AND Oregon win AND Indiana and UCLA losses" },
    { c: ["IOWA", "IND", "MICH", "WIS", { any: ["NW", "PSU", "RUT"] }, "!UCLA", "!ORE"], text: "Iowa win AND Indiana, Michigan and Wisconsin wins AND either a Northwestern, Penn State or Rutgers win AND UCLA and Oregon losses" },
    { c: ["IOWA", "IND", "ORE", "WIS", "!UCLA"], text: "Iowa win AND Indiana, Oregon and Wisconsin wins AND UCLA loss" },
    { c: ["IOWA", "!IND", "!ORE", "!UCLA"], text: "Iowa win AND Indiana, Oregon and UCLA losses" },
    { c: ["IOWA", "ILL", "IND", "MD", "MICH", "MSU", "WIS", "!ORE", "!UCLA", "SSA:IOWA"], inferred: true,
      text: "Not listed by the league — implied by UCLA's final scenario: Iowa win AND Illinois, Indiana, Maryland, Michigan, Michigan State and Wisconsin wins AND Oregon and UCLA losses AND Iowa has a higher SportSource Analytics ranking than UCLA" },
  ],
  OSU: [
    { c: ["OSU", "MD", "RUT", "WIS", "!IND", "!IOWA", "!ORE", "!USC"], text: "Ohio State win AND Maryland, Rutgers and Wisconsin wins AND Indiana, Iowa, Oregon and USC losses" },
  ],
  ORE: [
    { c: ["ORE", "!IND", "!IOWA"], text: "Oregon win AND Indiana and Iowa losses" },
    { c: ["ORE", "UCLA"], text: "Oregon win AND UCLA win" },
    { c: ["ORE", "IND", "!IOWA", "!UCLA"], text: "Oregon win AND Indiana win AND Iowa and UCLA losses" },
    { c: ["ORE", "IND", "IOWA", "!UCLA"], text: "Oregon win AND Indiana and Iowa wins AND UCLA loss" },
    { c: ["!ORE", "OSU", "!IND", "!IOWA", "!USC", "!WIS"], text: "Oregon loss AND Ohio State win AND Indiana, Iowa, USC and Wisconsin losses" },
    { c: ["!ORE", "!IND", "!IOWA", "!OSU", "!USC", "!WIS"], text: "Oregon loss AND Indiana, Iowa, Ohio State, USC and Wisconsin losses" },
    { c: ["!ORE", "MSU", "OSU", "WIS", "!IND", "!IOWA", "!USC"], text: "Oregon loss AND Michigan State, Ohio State and Wisconsin win AND Indiana, Iowa and USC losses" },
    { c: ["!ORE", "WIS", "!IND", "!IOWA", "!OSU", "!USC"], text: "Oregon loss AND Wisconsin win AND Indiana, Iowa, Ohio State and USC losses" },
  ],
  UCLA: [
    { c: ["UCLA"], text: "UCLA win" },
    { c: ["!UCLA", "!IND", "!IOWA"], text: "UCLA loss AND Indiana and Iowa losses" },
    { c: ["!UCLA", "!IND", "!ORE"], text: "UCLA loss AND Indiana and Oregon losses" },
    { c: ["!UCLA", "!IOWA", "!ORE"], text: "UCLA loss AND Iowa and Oregon losses" },
    { c: ["!UCLA", "IOWA", "ORE", "!IND"], text: "UCLA loss AND Iowa and Oregon wins AND Indiana loss" },
    { c: ["!UCLA", "IND", "IOWA", { any: ["MINN", "OSU"] }, "!ORE"], text: "UCLA loss AND Indiana and Iowa wins AND either a Minnesota or Ohio State win AND Oregon loss" },
    { c: ["!UCLA", "ILL", "IND", "IOWA", "MD", "MICH", "MSU", "WIS", "!ORE", "SSA:UCLA"], text: "UCLA loss AND Illinois, Indiana, Iowa, Maryland, Michigan, Michigan State and Wisconsin wins AND Oregon loss AND UCLA has a higher SportSource Analytics ranking than Iowa" },
  ],
  USC: [
    { c: ["USC", "!IND", "!IOWA", "!OSU", "!ORE", "!WIS"], text: "USC win AND Indiana, Iowa, Ohio State, Oregon and Wisconsin losses" },
    { c: ["USC", "OSU", "WIS", "!IND", "!IOWA", "!ORE"], text: "USC win AND Ohio State and Wisconsin wins AND Indiana, Iowa and Oregon losses" },
    { c: ["USC", "OSU", "!IND", "!IOWA", "!ORE", "!WIS"], text: "USC win AND Ohio State win AND Indiana, Iowa, Oregon and Wisconsin losses" },
    { c: ["USC", "WIS", "!IND", "!IOWA", "!OSU", "!ORE"], text: "USC win AND Wisconsin win AND Indiana, Iowa, Ohio State and Oregon losses" },
  ],
};

// Outcome combinations the league's published scenarios do not resolve
// (only one team is named as clinching). Shown in the tool as unresolved.
export const GAPS = [
  { c: ["IND", "IOWA", "!ORE", "UCLA"], known: ["UCLA"], candidates: ["IND", "IOWA"],
    note: "UCLA wins and clinches, but no published scenario covers Indiana and Iowa both winning while Oregon loses and UCLA wins. The second spot goes to Indiana or Iowa on tiebreakers the league didn't spell out." },
  { c: ["!IND", "!IOWA", "!ORE", "UCLA", "OSU", "WIS", "PSU", "RUT"], known: ["UCLA"], candidates: ["OSU", "ORE"],
    note: "UCLA wins and clinches. Ohio State's scenario requires a Maryland win and Oregon's requires a Michigan State win, so with Penn State and Rutgers both winning, neither team's published scenario applies." },
];
