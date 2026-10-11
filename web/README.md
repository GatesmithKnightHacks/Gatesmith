# Gatesmith web

The Gatesmith workbench in the browser: every screen from the design file, built to match it pixel for pixel, with the motion from the storyboards. It runs the canonical demo (run 7f3a·0412: sidechain_qaoa.qasm, 12 qubits, FakeTorino, 8 seeds, two-qubit gates 321 → 298 → 281 → 270 over four rounds, stopping at 490 s of a 900 s budget) on a scripted engine, so the whole flow works without a GPU.

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
| `#/signin` | S-17 Sign in |
| `#/signup` | S-18 Create account |
| `#/account` | S-19 Account |
| `#/gate` | S-20/S-21 Small-screen gate (shown on its own at desktop size; it also appears under 1280 px or on a touch-only pointer) |

`#/template?state=feedback` shows every feedback part from DS-08 live on the shell: button states, spinners, the shimmer skeleton and its crossfade, field validation, banners, the toast, row flash and drag-over.

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

- **Tokens.** `../design/tokens.css` is imported as is; nothing redefines it. The motion tokens and the few feedback colors it has no name for (skeleton block and band, spinner arc and track, row flash, drag-over) live in `src/styles/motion.css` as proposed tokens, aliased to tokens.css primitives.
- **Shell.** `src/ui/Shell.tsx`, measured from the master board: top bar 52 (2 px ground border), rail 52 including its 2 px border, tab band 42 with 31-tall r4 tiles and a 3 px mint underline under the active one, mode tabs filled 28, section rows 44, inspector 380, 4 px ground gutters. `Shell` takes `rail` (the current item), `railBadges` (`{ runs, repoRegressed }`), `tabs`, `inspector`, `status` and a `toast` slot at the main column's foot.
- **Rail.** New run, Runs, Repo, Leaderboard, Help; Settings, Account and Expand at the foot; 24 px icons on a 70 px pitch and the whole 52 × 70 row is the hit area. Idle icons are #ADC5CA and turn white in 150 ms on hover, with the label chip (and its shortcut) at once; the current item has the 2 px yellow bar and a yellow icon and snaps on click. Expand widens the rail to 200 px in 200 ms with the labels fading in after, and is remembered in localStorage. Badges: a count chip on Runs while runs are in progress, a pink dot on Repo after a CI regression. Keyboard: Tab reaches the rail as one stop, ↑ ↓ move the yellow outline, Enter or Space opens, Esc returns to the main column, and `g` then `n` / `r` / `p` / `l` / `a` jumps to New run, Runs, Repo, Leaderboard, Account.
- **Parts.** `src/ui/parts.tsx` (tiles, mode tabs, sections, fields with warning and invalid validation, primary and editor buttons, finding cards, rows), `Spinner.tsx`, `Banner.tsx` (with `ErrorCode`), `Toast.tsx`, `Tooltip.tsx`, `Skeleton.tsx` (`Sk`, `SkSwap`, …) and `status.tsx` (status is always an icon, a word and a color, in the engine's vocabulary).
- **Screens.** `src/screens/<Screen>.tsx`, each with its own folder for local parts and CSS. Screens load lazily and are preloaded, so a view transition never captures a blank frame.
- **Demo engine.** `src/data/run.ts` plays the run with the storyboard timings: scan, findings landing, rounds, the fix review, the accept moment and the stop. `src/data/demo.ts` holds the data, named like the engine's `qscore.scorecard/v0.2` fields and rule ids (D01 to D10), so a real backend can replace it.
- **Motion.** Three durations, one curve and two loops (DS-07, DS-08): `--motion-hover` 150 ms (hover and press colors, every exit), `--motion-tile` 200 ms (tiles, cards, banners, menus, tooltips, chevron turns, tab content, the rail's Expand), `--motion-load` 400 ms (a screen change, skeleton to content), `--motion-spin` 1000 ms per spinner turn and `--motion-shimmer` 1200 ms per skeleton sweep. Every transition eases with `ease`; only the two loops run linear. Nothing springs, slides, bounces, staggers or ticks digits. A screen change is a same-document view transition in which the main column fades in over 400 ms while the top bar, rail, tab strip and inspector hold still (`src/app/transitions.css`); no element morphs between screens. Buttons keep one width in every state (loading shows the spinner in a reserved slot, done shows the past verb with a check for 1200 ms); banners, toasts, menus and tooltips fade in place (in 200, out 150, tooltips after 400). Reduced motion (the system setting, or Settings in the rail) keeps every fade and stops every transform and sweep: the spinner becomes a whole static ring and the skeleton pulses 1 → 0.6 → 1 over 1.2 s.

## The engine

The scoring engine (`qscore/`) lives on the `t00-bootstrap` branch and is developed separately. This app does not compute scores; it renders what the engine reports. To connect it, implement the run store's actions against the engine's API (`GET /jobs/{id}`, `/events`, `/scorecards`, `/attempts`) and map the responses onto `RunState`.
