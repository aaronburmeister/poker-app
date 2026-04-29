import type { LastAction, PlayerState } from '@poker/shared';
import { CardComponent } from './CardComponent';

interface Props {
  player: PlayerState;
  isCurrentTurn: boolean;
  isSelf: boolean;
  lastAction?: LastAction;
}

function fmtChips(n: number): string {
  return n.toLocaleString();
}

function formatActionLabel(action: LastAction): string {
  const amt = action.amount !== undefined ? ` ${action.amount.toLocaleString()}` : '';
  switch (action.actionText) {
    case 'checks':       return 'CHECKED';
    case 'calls':        return `CALLED${amt}`;
    case 'raises to':    return `RAISED TO${amt}`;
    case 'goes all-in for': return `ALL IN${amt}`;
    default:             return action.actionText.toUpperCase();
  }
}

export function PlayerSeat({ player, isCurrentTurn, isSelf, lastAction }: Props) {
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all-in';
  const isOut = player.status === 'sitting-out';

  let statusLabel = '';
  if (isFolded) statusLabel = 'FOLDED';
  else if (isAllIn) statusLabel = 'ALL IN';
  else if (isOut) statusLabel = 'OUT';

  const isLastActor = lastAction?.playerId === player.id;
  // Don't show action label when a permanent status badge already covers it
  const actionLabel = isLastActor && !isFolded && !isOut ? formatActionLabel(lastAction!) : null;

  let badge = '';
  if (player.isDealer) badge = 'D';
  else if (player.isSmallBlind) badge = 'SB';
  else if (player.isBigBlind) badge = 'BB';

  return (
    <div
      className={[
        'player-seat',
        isCurrentTurn ? 'player-seat--active' : '',
        isSelf ? 'player-seat--self' : '',
        isFolded ? 'player-seat--folded' : '',
        isOut ? 'player-seat--out' : '',
      ].filter(Boolean).join(' ')}
    >
      {badge && <div className="dealer-badge">{badge}</div>}

      <div className="player-cards">
        {player.cards.length === 0 ? (
          <>
            <CardComponent card={null} faceDown small />
            <CardComponent card={null} faceDown small />
          </>
        ) : (
          player.cards.map((c, i) => (
            <CardComponent key={i} card={c} faceDown={c === null} small />
          ))
        )}
      </div>

      <div className="player-info">
        <div className="player-name">
          {player.name}
          {player.isBot && <span className="bot-tag"> 🤖</span>}
          {!player.isConnected && <span className="offline-tag"> ⚪</span>}
        </div>
        <div className="player-chips">{fmtChips(player.chips)}</div>
        {statusLabel && <div className="player-status">{statusLabel}</div>}
        {actionLabel && <div className="player-action-label">{actionLabel}</div>}
      </div>

      {player.bet > 0 && (
        <div className="player-bet">{fmtChips(player.bet)}</div>
      )}
    </div>
  );
}
