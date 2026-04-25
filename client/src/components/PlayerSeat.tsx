import type { PlayerState } from '@poker/shared';
import { CardComponent } from './CardComponent';

interface Props {
  player: PlayerState;
  isCurrentTurn: boolean;
  isSelf: boolean;
}

function fmtChips(n: number): string {
  return n.toLocaleString();
}

export function PlayerSeat({ player, isCurrentTurn, isSelf }: Props) {
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all-in';
  const isOut = player.status === 'sitting-out';

  let statusLabel = '';
  if (isFolded) statusLabel = 'Folded';
  else if (isAllIn) statusLabel = 'All In';
  else if (isOut) statusLabel = 'Out';

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
      </div>

      {player.bet > 0 && (
        <div className="player-bet">{fmtChips(player.bet)}</div>
      )}
    </div>
  );
}
