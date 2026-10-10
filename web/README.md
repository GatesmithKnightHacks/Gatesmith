# Gatesmith web

The Gatesmith workbench in the browser: every screen from the design file, built to match it pixel for pixel, with the motion from the storyboards. It runs the canonical demo (sidechain_qaoa, 12 qubits, FakeTorino, 44 → 33 two-qubit gates over four rounds) on a scripted engine, so the whole flow works without a GPU.

## Run it

```sh
cd web
npm install
npm run dev          # http://localhost:5173
```

Open `#/new` and click through: pick the example, Continue, Confirm and score, Request fix on D03, Accept, Export final, Export.

Any screen also opens on its own at its route and shows its design snapshot:

| Route | Screen |
|---|---|
| `#/template` | S-00 Shell template |
| `#/new` | S-01 New run |
| `#/scan` | S-02 Repo scan |
| `#/preflight` | S-03 Pre-flight |
| `#/workspace` | S-04 Workspace |
| `#/estimate` | S-05 Machine estimate |
| `#/fix` | S-06 Fix review |
| `#/loop` | S-07 Loop view and stop |
| `#/report` | S-09 Final report |
| `#/export` | S-10 Export |
| `#/pr` | S-11 PR comment |
| `#/repo` | S-12 Repo dashboard |
| `#/runs` | S-13 Runs |
| `#/leaderboard` | S-14 Leaderboard |
| `#/screening` | S-15 Candidate screening |
| `#/bench` | S-16 Model bench |

States from each screen's states board are at `?state=<name>`, for example `#/new?state=drag-over`, `#/fix?state=worse-than-before`, `#/loop?state=budget-hit`.

## Check it

```sh
npm run typecheck
npm run e2e          # the full flow with video, plus every route rendering cleanly
npm run diff         # screenshots vs the design exports in tests/design
npm run diff S-04    # one screen; writes tests/output/S-04.side.png (design | code | diff)
```

`diff` converts the design exports from Display P3 to sRGB before comparing (`scripts/srgb.py`). The remaining 1 to 2.5% per screen is text antialiasing.

## How it is built

- **Tokens.** `../design/tokens.css` is imported as is; nothing redefines it. Motion values from the design system live in `src/styles/motion.css` as proposed tokens with the same names.
- **Shell and parts.** `src/ui` holds the shell (top bar 52, rail 50, tab strip 36, inspector 380, 4px gutters) and the shared components: tiles, inspector sections, fields, buttons, finding cards, status words.
- **Screens.** `src/screens/<Screen>.tsx`, each with its own folder for local parts and CSS. Screens load lazily and are preloaded, so a view transition never captures a blank frame.
- **Demo engine.** `src/data/run.ts` plays the run with the storyboard timings: scan, findings landing, rounds, the fix review, the accept moment and the stop. `src/data/demo.ts` holds the data, named like the engine's `qscore.scorecard/v0.2` fields and rule ids (D01 to D10), so a real backend can replace it.
- **Motion.** Same-document view transitions carry shared elements between screens (`circuit-canvas`, `primary-action`, `finding-card`, `rail-marker`); in-screen motion uses CSS with the motion tokens. Reduced motion shortens everything to a quick crossfade.

## The engine

The scoring engine (`qscore/`) lives on the `t00-bootstrap` branch and is developed separately. This app does not compute scores; it renders what the engine reports. To connect it, implement the run store's actions against the engine's API (`GET /jobs/{id}`, `/events`, `/scorecards`, `/attempts`) and map the responses onto `RunState`.
