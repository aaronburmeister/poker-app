import type { GameState, PlayerState } from '@poker/shared';
import { CardComponent } from './CardComponent';
import { PlayerSeat } from './PlayerSeat';
import { ActionPanel } from './ActionPanel';

interface Props {
  state: GameState;
}

function fmtChips(n: number): string {
  return n.toLocaleString();
}

function totalPot(state: GameState): number {
  // pots are calculated from totalBetThisHand which already includes current-round bets
  return state.pots.reduce((s, p) => s + p.amount, 0);
}

/** Evenly distribute N players around an ellipse, starting from the bottom-centre for self */
function seatPositions(players: PlayerState[], myId: string): { x: number; y: number }[] {
  const n = players.length;
  const myIdx = players.findIndex(p => p.id === myId);
  const cx = 50, cy = 50, rx = 42, ry = 38;

  return players.map((_, i) => {
    // Offset so "self" is always at the bottom
    const offset = myIdx >= 0 ? myIdx : 0;
    const angle = (2 * Math.PI * (i - offset)) / n - Math.PI / 2;
    return {
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    };
  });
}

export function PokerTable({ state }: Props) {
  const positions = seatPositions(state.players, state.myPlayerId);
  const pot = totalPot(state);

  const lastActionPlayer = state.lastAction
    ? state.players.find(p => p.id === state.lastAction?.playerId)
    : null;

  return (
    <div className="table-container">
      {/* Felt table */}
      <div className="felt-table">
        {/* Community cards + pot */}
        <div className="board-center">
          <div className="community-cards">
            {Array.from({ length: 5 }).map((_, i) => (
              <CardComponent key={i} card={state.communityCards[i] ?? null} faceDown={i >= state.communityCards.length} />
            ))}
          </div>
          {pot > 0 && <div className="pot-display">Pot: {fmtChips(pot)}</div>}
          {state.phase !== 'showdown' && state.lastAction && lastActionPlayer && (
            <div className="last-action">
              {lastActionPlayer.name}{' '}
              {state.lastAction.actionText}
              {state.lastAction.amount !== undefined ? ` ${fmtChips(state.lastAction.amount)}` : ''}
            </div>
          )}
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

        {/* Player seats, positioned absolutely around the table */}
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
            />
          </div>
        ))}
      </div>

      {/* Action controls outside the table */}
      <ActionPanel state={state} />

      {/* Phase indicator */}
      <div className="phase-indicator">
        {state.phase.charAt(0).toUpperCase() + state.phase.slice(1)}
        {' · '}Hand #{state.handNumber}
      </div>
    </div>
  );
}
