import { useState } from 'react';
import type { GameState, PlayerState } from '@poker/shared';
import { CardComponent } from './CardComponent';
import { PlayerSeat } from './PlayerSeat';
import { ActionPanel } from './ActionPanel';
import { HandHistoryPanel, type CompletedHand } from './HandHistoryPanel';
import { HandRankingsGuide } from './HandRankingsGuide';
import { SettingsModal, type Settings } from './SettingsModal';
import { OddsPanel } from './OddsPanel';

interface Props {
  state: GameState;
  handHistory: CompletedHand[];
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
}

function fmtChips(n: number): string {
  return n.toLocaleString();
}

function totalPot(state: GameState): number {
  return state.pots.reduce((s, p) => s + p.amount, 0);
}

function seatPositions(players: PlayerState[], myId: string): { x: number; y: number }[] {
  const n = players.length;
  const myIdx = players.findIndex(p => p.id === myId);
  const cx = 50, cy = 50, rx = 42, ry = 38;

  return players.map((_, i) => {
    const offset = myIdx >= 0 ? myIdx : 0;
    const angle = (2 * Math.PI * (i - offset)) / n - Math.PI / 2;
    return {
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    };
  });
}

export function PokerTable({ state, handHistory, settings, onSettingsChange }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const positions = seatPositions(state.players, state.myPlayerId);
  const pot = totalPot(state);

  return (
    <div className="table-container">
      {/* Felt table */}
      <div className="felt-table">
        <div className="board-center">
          <div className="community-cards">
            {Array.from({ length: 5 }).map((_, i) => (
              <CardComponent key={i} card={state.communityCards[i] ?? null} faceDown={i >= state.communityCards.length} />
            ))}
          </div>
          {pot > 0 && <div className="pot-display">Pot: {fmtChips(pot)}</div>}
          {state.phase === 'showdown' && state.winners && (
            <div className="winners-display">
              {state.winners.map((w, i) => (
                <div key={i} className="winner-line">
                  🏆 {w.playerName} wins {fmtChips(w.amount)}
                  {w.handDescription ? ` — ${w.handDescription}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>

        {state.players.map((player, i) => (
          <div
            key={player.id}
            className="seat-wrapper"
            style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }}
          >
            <PlayerSeat
              player={player}
              isCurrentTurn={i === state.currentPlayerIndex && state.phase !== 'showdown' && state.phase !== 'waiting'}
              isSelf={player.id === state.myPlayerId}
              lastAction={state.roundActions[player.id]}
            />
          </div>
        ))}
      </div>

      {/* Action controls + odds panel */}
      <ActionPanel state={state} />
      {settings.showOdds && <OddsPanel state={state} />}

      {/* Phase indicator */}
      <div className="phase-indicator">
        {state.phase.charAt(0).toUpperCase() + state.phase.slice(1)}
        {' · '}Hand #{state.handNumber}
      </div>

      {/* Settings button */}
      <button className="settings-btn" onClick={() => setSettingsOpen(true)}>⚙</button>
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChange={s => { onSettingsChange(s); setSettingsOpen(false); }}
        />
      )}

      {/* Hand history panel */}
      <HandHistoryPanel history={handHistory} />

      {/* Hand rankings reference */}
      <HandRankingsGuide />
    </div>
  );
}
