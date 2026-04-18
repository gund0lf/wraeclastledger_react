# WraeclastLedger

A Path of Exile map-running tracker built with Electron + React + TypeScript.

Track your session profits, analyse your map stash, generate regex filters, browse strategies, and search PoE Trade — all in one place.

---

## Features

- **Map Log** — Live clipboard capture of map tooltips. Tracks IIQ, IIR, pack size, currency mods, scarabs, delirium orbs.
- **Dashboard** — Session profit overview with investment baseline, loot tracker, per-map averages, and atlas multiplier breakdown.
- **Atlas Calc** — Atlas multiplier calculator with scarab, node, and mounting inputs. Avarice chisel indicator.
- **Investment Module** — Scarab and cost tracking with divine price, per-map cost, and gem leveling offset.
- **Strategy Browser** — Community strategy feed with profit/map estimates, inline divine sub-values, and Discord export.
- **Regex Module** — Auto-generates stash highlight regex from your session averages. Brick exclusion terms, save/load sets. PoE Trade integration opens a pre-built map search with IIQ, IIR, pack, pseudo currency/scarabs/maps, delirium %, reward type, map type (Regular/8-mod/Nightmare/Originator/Empowered), and corrupted filters.
- **Map Analyzer** — Visual stash grid with quality tier colouring and chisel recommendation (Avarice vs Proliferation) per map. Supports both Originator/Uber mod pool and regular T16 mod pool. Multi-tab support for sessions beyond 72 maps.
- **Atlas Tree** — Embedded pathofpathing.com atlas planner.
- **Session Manager** — Save, load, import and export sessions. Share links.
- **Auto-updater** — Checks GitHub releases on startup.

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

### Publish release (Windows, pushes to GitHub Releases)

```bash
npm run publish:win
```

---

## Tech Stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Mantine v8](https://mantine.dev/) UI
- [Zustand](https://zustand-demo.pmnd.rs/) state management
- [electron-updater](https://www.electron.build/auto-update) auto-updates via GitHub Releases
