# WraeclastLedger

<img src="resources/icon.png" alt="WraeclastLedger icon" width="96" align="right" />

[![GitHub release](https://img.shields.io/github/v/release/gund0lf/wraeclastledger_react?style=flat-square&color=orange&label=latest)](https://github.com/gund0lf/wraeclastledger_react/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/gund0lf/wraeclastledger_react/total?style=flat-square&color=blue)](https://github.com/gund0lf/wraeclastledger_react/releases)
[![Platform](https://img.shields.io/badge/platform-Windows_%7C_Linux-informational?style=flat-square)](https://github.com/gund0lf/wraeclastledger_react/releases/latest)
[![Electron](https://img.shields.io/badge/Electron-47848f?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm_Noncommercial_1.0.0-blue?style=flat-square)](LICENSE)

A desktop companion app for Path of Exile map farming. Copy a map tooltip in game (Ctrl+C), and it logs the map — IIQ, IIR, pack size, tier, mods. From there it tracks session profit, generates stash-highlight regex, and builds pre-filled trade searches.

Available as a Windows installer and Linux AppImage.

[**Download the latest release**](https://github.com/gund0lf/wraeclastledger_react/releases/latest)
Free for personal use — see LICENSE

![Strategy Browser and Dashboard overview](docs/screenshots/1.png)

## What's in it

- **Map Log** — captures map tooltips from the clipboard. Filterable table with per-map detail (IIQ/IIR/pack, currency mods, scarabs, Delirious level/reward tracks, div cards).
- **Dashboard** — session profit overview. Imports loot CSVs (currently WealthyExile exports) and shows a categorized breakdown against your baseline, plus per-map averages.
- **Investment Module** — per-map cost setup (scarabs, delirium orbs, astrolabe, chisels), divine price via poe.ninja, cost-per-map and net profit.
- **Atlas Calc** — effective IIQ/IIR from scarabs, atlas nodes and map tier.
- **Regex** — one panel, two generators: stash regex from your session thresholds (min IIQ/pack/currency) with named brick-mod exclusion presets, and a K-of-N builder ("at least 3 of these 8 mods") — both stay under the 250-character stash search limit. Can open a PoE trade search pre-filled with the same filters.
- **Strategy Browser** — community-shared farming strategies with cost/profit breakdowns, sortable from the dropdown or table headers by latest activity, cost/map, div/map, profit, community score, and more. Sharing copies a compact submission for Discord; the channel bot validates it, posts a readable card with bounded loot evidence, and adds the strategy to the Browser. Discord reactions become its community score. Optional party size, session time, and atlas-point context can be included, and readable card exports can be pasted back into the app to compare or import a build.
- **Atlas Tree** — embedded [pathofpathing.com](https://pathofpathing.com) planner; applied passives (and point counts, when sharing) feed the calculations.
- **Sessions** — save/load with auto-save, side-by-side comparison of 2-3 saved sessions, JSON export/import. Panels are draggable and the layout persists.
- **Run Statistics (optional)** — an Add Panel-only local tracker for selected Kalguuran, Wildwood, Atlas anomaly, valuable-beast, and Mercenary outcomes. Its sections start collapsed, Session stays editable, and All sessions combines explicitly reported outcomes across saved runs without double-counting the active session. It is not included in shared strategies.

The app auto-updates from GitHub releases.

## More screenshots

### Map capture and session setup

![Map Log, session setup, and Dashboard](docs/screenshots/2.png)

### Regex and trade search

![Regex generation and Path of Exile trade search](docs/screenshots/3.png)

## Development

```bash
npm install
npm run dev        # dev server with hot reload
npm start          # preview the built app
npm run typecheck  # TypeScript checks for main/preload and renderer
npm test           # Vitest and Cargo-query checks
npm run lint       # ESLint
npm run build      # production build
```

Stack: Electron 43, React 19, TypeScript 5, Mantine v8, Zustand, electron-vite, flexlayout-react.

For process boundaries, data flows, persistence, and integration structure, see
[ARCHITECTURE.md](ARCHITECTURE.md).

---

*WraeclastLedger is a fan-made tool and is not affiliated with or endorsed by Grinding Gear Games.*
