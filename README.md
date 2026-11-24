# Road to Indy: 2026 Big Ten title game scenarios

A one-page interactive decision tree built from the Big Ten's Nov. 23, 2026 clinch update.

- `data.js`: teams, final-week games and lines, and the league's scenarios (verbatim), encoded as conditions
- `engine.js`: evaluates all 1,024 combinations (9 games × SportSource tiebreaker), picks a fixed game order by information gain, and builds the pruned binary tree
- `app.js` / `styles.css` / `index.html`: the UI, a width-proportional branching tree in the spirit of NYT's "512 Paths to the White House" (D3 loaded from jsDelivr; no build step)

## Run locally
```
npm run dev      # http://localhost:5173
npm run check    # sanity-check scenario coverage
```

## Deploy
Static site, no build. From this folder: `npx vercel` (or import the repo in Vercel with Framework Preset "Other" and no build command).
