<div align="center">

# WraeclastLedger

<img src="resources/icon.png" alt="WraeclastLedger Logo" width="120" />

**A Path of Exile map-farming companion — track sessions, generate stash regex, browse strategies, and search trade.**

Built with Electron + React + TypeScript. Windows only.

---

[![GitHub release](https://img.shields.io/github/v/release/gund0lf/wraeclastledger_react?style=flat-square&color=orange&label=latest)](https://github.com/gund0lf/wraeclastledger_react/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/gund0lf/wraeclastledger_react/total?style=flat-square&color=blue)](https://github.com/gund0lf/wraeclastledger_react/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-informational?style=flat-square&logo=windows)](https://github.com/gund0lf/wraeclastledger_react/releases/latest)
[![Electron](https://img.shields.io/badge/electron-latest-47848f?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/react-19-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![License](https://img.shields.io/github/license/gund0lf/wraeclastledger_react?style=flat-square)](LICENSE)

</div>

---

## What it does

You Ctrl-C a map tooltip in PoE, and WraeclastLedger captures it — IIQ, IIR, pack size, mods, tier, everything. From there it tracks your session, calculates profit, generates stash regex for your next batch, and gives you a trade search that already knows what you're looking for.

It's a single-window desktop app with draggable panels. Arrange them however you want — layout persists across sessions.

<div align="center">
  <img src="docs/screenshots/1.png" alt="WraeclastLedger Overview" width="800" />
  <br/><br/>
  <img src="docs/screenshots/2.png" alt="Trade Search" width="800" />
</div>

---

## Features

**Map Log** — Paste map tooltips from clipboard. Tracks IIQ, IIR, pack size, currency mods, scarabs, delirium orbs. Filterable table with per-map detail.

**Dashboard** — Session profit at a glance. Import loot CSVs to get a categorized breakdown (Currency, Scarabs, Gems, Maps, etc.) with diff against your baseline. Shows per-map averages and atlas multiplier impact. Currently supports [WealthyExile](https://wealthyexile.com) CSV exports — loot import may change as better options become available.

**Investment Module** — Define your per-map costs: scarabs, delirium orbs, astrolabe, chisels. Tracks divine price via poe.ninja. Calculates cost-per-map and net profit after investment.

**Atlas Calc** — Atlas multiplier calculator. Plug in your scarab values, atlas nodes, and map tier to see effective IIQ/IIR.

**Regex Panel** — Generates stash highlight regex from your session averages (min IIQ, pack, currency). Pick which brick mods to exclude — the regex updates live. Integrates with PoE Trade: opens a search pre-filled with your IIQ/IIR/pack thresholds, mod count, delirium, reward type, and map tier filters.

**Regex Builder** — Combinatorial K-of-N stash regex generator. Pick a reward category (Currency, Maps, Scarabs, Pack Size, Quantity), select which uber mods you want, set a threshold (e.g. "at least 3 of these 8"), and it generates a Product-of-Sums regex that fits the 250-char stash limit. Useful for quickly scanning a stash tab full of rolled maps.

**Strategy Browser** *(experimental)* — Community-shared mapping strategies pulled from a shared server. Each strategy shows estimated profit/map, cost breakdown, and the atlas setup used. You can import a strategy's build settings (chisel type, scarabs, regex) directly into your own session. Share your own via Discord export format.

**Atlas Tree** — Embedded [pathofpathing.com](https://pathofpathing.com) atlas planner. Auto-applies atlas passives for stat calculations without leaving the app.

**Session Manager** — Save and load sessions. Bulk export/import as JSON. Persistent panel layout — your window arrangement carries over between launches.

**Auto-updater** — Checks GitHub releases on startup and prompts to install.

---

## Download

Grab the latest `.exe` installer from the [**Releases page**](https://github.com/gund0lf/wraeclastledger_react/releases/latest).

---

## Development

```bash
npm install
npm start          # preview the built app
npm run dev        # dev server with hot reload
```

### Build & Publish

```bash
npm run build          # production build
npm run publish:win    # build + publish to GitHub releases
```

---

## Tech Stack

[![Electron](https://img.shields.io/badge/Electron-47848f?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Mantine](https://img.shields.io/badge/Mantine_v8-339af0?style=flat-square)](https://mantine.dev/)
[![Zustand](https://img.shields.io/badge/Zustand-orange?style=flat-square)](https://zustand-demo.pmnd.rs/)
[![electron-vite](https://img.shields.io/badge/electron--vite-646cff?style=flat-square&logo=vite&logoColor=white)](https://electron-vite.org/)

---

*WraeclastLedger is not affiliated with or endorsed by Grinding Gear Games.*
