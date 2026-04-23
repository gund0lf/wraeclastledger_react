<div align="center">

# WraeclastLedger

<img src="resources/icon.png" alt="WraeclastLedger Logo" width="120" />

**A Path of Exile map-running tracker built with Electron + React + TypeScript.**

Track your session profits, analyse your map stash, generate regex filters, browse community strategies, and search PoE Trade — all in one place.

---

[![GitHub release](https://img.shields.io/github/v/release/gund0lf/wraeclastledger_react?style=flat-square&color=orange&label=latest)](https://github.com/gund0lf/wraeclastledger_react/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/gund0lf/wraeclastledger_react/total?style=flat-square&color=blue)](https://github.com/gund0lf/wraeclastledger_react/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-informational?style=flat-square&logo=windows)](https://github.com/gund0lf/wraeclastledger_react/releases/latest)
[![Electron](https://img.shields.io/badge/electron-latest-47848f?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/react-19-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![License](https://img.shields.io/github/license/gund0lf/wraeclastledger_react?style=flat-square)](LICENSE)

</div>

---

## Features

- **Map Log** — Live clipboard capture of map tooltips. Tracks IIQ, IIR, pack size, currency mods, scarabs, delirium orbs.
- **Dashboard** — Session profit overview with investment baseline, loot tracker, per-map averages, and atlas multiplier breakdown.
- **Atlas Calc** — Atlas multiplier calculator with scarab, node, and mounting inputs. Avarice chisel indicator.
- **Investment Module** — Scarab and cost tracking with divine price, per-map cost, and gem leveling offset.
- **Strategy Browser** — Community strategy feed with profit/map estimates, inline divine sub-values, Cost/map column, and Discord export.
- **Regex Module** — Auto-generates stash highlight regex from your session averages. Brick exclusion mod picker, persistent default preset, PoE Trade integration with IIQ/IIR/pack/pseudo stats/delirium/reward type/map type/tier filters.
- **Map Analyzer** — Visual stash grid with quality tier colouring and chisel recommendation. Supports Originator/Uber and regular T16 mod pools. Multi-tab support.
- **Atlas Tree** — Embedded pathofpathing.com atlas planner.
- **Session Manager** — Save, load, import and export sessions. Persistent panel layout.
- **Auto-updater** — Checks GitHub releases on startup.

---

## Download

Head to the [**Releases page**](https://github.com/gund0lf/wraeclastledger_react/releases/latest) and download the latest `.exe` installer.

---

## Project Setup

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

---

## Tech Stack

[![Electron](https://img.shields.io/badge/Electron-47848f?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Mantine](https://img.shields.io/badge/Mantine_v8-339af0?style=flat-square)](https://mantine.dev/)
[![Zustand](https://img.shields.io/badge/Zustand-orange?style=flat-square)](https://zustand-demo.pmnd.rs/)
[![electron-vite](https://img.shields.io/badge/electron--vite-646cff?style=flat-square&logo=vite&logoColor=white)](https://electron-vite.org/)
