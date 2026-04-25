# Poker

A multiplayer Texas Hold'em poker app built with TypeScript, React, and Socket.io.

## Stack

| Layer | Tech |
|---|---|
| Client | Vite + React + TypeScript |
| Server | Node.js + Express + Socket.io |
| Shared | TypeScript types & event contracts |
| Tests | Vitest |

## Project Structure

```
poker/
├── shared/       # Types and Socket.io event definitions used by both client and server
├── server/       # Game server — all game logic lives here
│   └── src/
│       ├── Deck.ts           # 52-card deck with Fisher-Yates shuffle
│       ├── HandEvaluator.ts  # Best 5-from-7 hand evaluation and comparison
│       ├── GameEngine.ts     # Texas Hold'em state machine
│       ├── BotPlayer.ts      # Rule-based bot AI
│       ├── GameRoom.ts       # Room lifecycle and player management
│       ├── RoomManager.ts    # Room registry and socket→player index
│       └── index.ts          # Socket.io server entry point
└── client/       # React UI
    └── src/
        ├── components/
        │   ├── MainMenu.tsx        # Home, Create, Join, and Lobby screens
        │   ├── PokerTable.tsx      # Main game view
        │   ├── CardComponent.tsx   # Individual card rendering
        │   ├── PlayerSeat.tsx      # Per-player area with cards, chips, badges
        │   └── ActionPanel.tsx     # Fold / Check / Call / Raise / All-In controls
        └── socket.ts               # Typed Socket.io client
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 8+ (workspaces support)

### Install

```bash
npm install
```

### Run (development)

```bash
npm run dev
```

This starts both the server (port 3001) and the client (port 5173) concurrently. Open [http://localhost:5173](http://localhost:5173) in your browser.

### Run tests

```bash
npm test          # run once
npm run test:watch  # watch mode
```

## How to Play

1. One player clicks **Create Game**, sets blinds and starting chips, and shares the 6-character room code.
2. Other players click **Join Game** and enter the code.
3. The host can add bots to fill empty seats.
4. The host clicks **Start Game**.

## Multiplayer / Hosting

For local network play, run `npm run dev` on one machine and have others connect to that machine's local IP on port 5173.

For internet play, the server needs persistent hosting (Railway, Render, and Fly.io all have free tiers). Set the `CLIENT_URL` environment variable on the server to your deployed client URL, and set `VITE_SERVER_URL` in the client to your deployed server URL.
