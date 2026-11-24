# Road to Indy: 2026 Big Ten title game scenarios

A one-page interactive decision tree built from the Big Ten's Nov. 23, 2026 clinch update.

- `data.js`: teams, final-week games and lines, and the league's scenarios (verbatim), encoded as conditions
- `engine.js`: evaluates all 1,024 combinations (9 games × SportSource tiebreaker), picks a fixed game order by information gain, and builds the pruned binary tree
- `app.js` / `styles.css` / `index.html`: the UI, a width-proportional branching tree in the spirit of NYT's "512 Paths to the White House" (D3 loaded from jsDelivr; no build step)

## Run locally
```
npm run dev      # http://localhost:5173
npm run check    # sanity-check scenario coverage
npm run tiebreak # re-derive every combination from the tiebreaker rules (needs python3 + internet)
```

## Data notes
The league's clinch update names only one clinching team in 69 of the 1,024 final-week combinations. Those were resolved by applying the [Big Ten tiebreaker rules](https://bigten.org/sports/2026/11/10/FB_1110261447.aspx) to every conference result (from ESPN), and they're marked `inferred` in `data.js`. `scripts/tiebreak.py` implements the rules; it reproduces all 955 combinations the league spells out and agrees with all 1,024 shown on the site.

## Deploy
Static site, no build. From this folder: `npx vercel` (or import the repo in Vercel with Framework Preset "Other" and no build command).
