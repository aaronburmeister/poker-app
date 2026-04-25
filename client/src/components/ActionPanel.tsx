import { useState } from 'react';
import type { GameState, PlayerAction } from '@poker/shared';
import { socket } from '../socket';

interface Props {
  state: GameState;
}

function fmtChips(n: number): string {
  return n.toLocaleString();
}

export function ActionPanel({ state }: Props) {
  const me = state.players.find(p => p.id === state.myPlayerId);
  const [raiseAmount, setRaiseAmount] = useState(state.minRaise);

  if (!state.isMyTurn || !me || me.status !== 'active') return null;

  const callAmount = state.currentBet - me.bet;
  const canCheck = callAmount === 0;
  const canCall = callAmount > 0 && callAmount < me.chips;
  const canRaise = me.chips > callAmount;
  const maxRaise = me.bet + me.chips;

  function send(action: PlayerAction) {
    socket.emit('player_action', action);
  }

  return (
    <div className="action-panel">
      <button className="btn btn-danger" onClick={() => send({ type: 'FOLD' })}>
        Fold
      </button>

      {canCheck && (
        <button className="btn btn-secondary" onClick={() => send({ type: 'CHECK' })}>
          Check
        </button>
      )}

      {canCall && (
        <button className="btn btn-secondary" onClick={() => send({ type: 'CALL' })}>
          Call {fmtChips(callAmount)}
        </button>
      )}

      {canRaise && (
        <div className="raise-controls">
          <input
            type="range"
            min={state.minRaise}
            max={maxRaise}
            step={state.bigBlindAmount}
            value={Math.min(raiseAmount, maxRaise)}
            onChange={e => setRaiseAmount(Number(e.target.value))}
          />
          <button
            className="btn btn-primary"
            onClick={() => send({ type: 'RAISE', amount: Math.min(raiseAmount, maxRaise) })}
          >
            Raise to {fmtChips(Math.min(raiseAmount, maxRaise))}
          </button>
        </div>
      )}

      <button className="btn btn-warning" onClick={() => send({ type: 'ALL_IN' })}>
        All In ({fmtChips(me.chips)})
      </button>
    </div>
  );
}
