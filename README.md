# RogueEr -- Multiplayer Poker Roguelike

A multiplayer poker game where the rules mutate every round. Players vote on rule changes that alter hand rankings, card properties, and win conditions, creating a different game at every table.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Phaser](https://img.shields.io/badge/Phaser_4-8B0000?logoColor=white)
![Colyseus](https://img.shields.io/badge/Colyseus-7B68EE?logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-24C8D8?logo=tauri&logoColor=white)

## How It Works

Standard Texas Hold'em, but between betting rounds players vote on **rule mutations** drawn from a pool of 30 rules across three categories:

- **Hierarchy** -- Reorder hand rankings (e.g., flushes beat full houses, pairs become the strongest hand)
- **Card Property** -- Transform cards mid-game (wild cards, suit removal, ace splitting into two values)
- **Composition** -- Change what counts as a hand (three-card flushes, full house lite, hole-card-only straights)

Each round has 3 active rule slots. Players vote to **solidify**, **delete**, or **replace** rules, creating an evolving meta-game on top of the poker.

## Architecture

```
packages/
  shared/    # Deterministic game logic (hand evaluation, rule engine,
               betting, pot calculation, deck management)
  server/    # Colyseus game server (room state machine, phase engine,
               voting resolution, turn timers, lobby management)
  client/    # Phaser 4 game client (table rendering, betting controls,
               voting UI, rule display, network manager)
```

All game logic lives in `shared/` as pure functions, used by both server and client. The server is authoritative -- it orchestrates phases, validates actions, and syncs state via Colyseus schemas with per-client visibility (your hole cards are hidden from other players).

### Key Systems

- **4-Stage Evaluation Pipeline** -- hierarchy reorder, card transform, composition modify, then evaluate. Rules compose cleanly without special-casing.
- **14-Phase State Machine** -- Deal, betting rounds, voting rounds, showdown, and round end, with auto-advance for non-interactive phases.
- **Seeded RNG** -- Mulberry32 PRNG for reproducible shuffles and rule draws.
- **Side Pots** -- Multi-level side pot creation on all-in with proper odd-chip distribution.
- **Spectator Support** -- Join mid-game, queue for a seat, delayed hole card reveal.

## Status

Phases 1-4 complete. Core game loop is fully playable: lobby, full Hold'em rounds with rule mutations, voting, showdown, and multi-round progression. Phase 5 (Tauri packaging, audio, visual polish) is next.

`9.5K LOC` | `180 tests`

## Development

```bash
pnpm install
pnpm build          # Build all packages
pnpm --filter server dev   # Start Colyseus server (ws://localhost:2567)
pnpm --filter client dev   # Start Vite dev server
```

## License

All rights reserved.
