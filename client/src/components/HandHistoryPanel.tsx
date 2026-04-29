import { useState } from 'react';
import type { Card, GamePhase, HandLogEntry, ShowdownHandInfo, WinnerInfo } from '@poker/shared';

export interface CompletedHand {
  handNumber: number;
  log: HandLogEntry[];
  winners: WinnerInfo[];
  communityCards: Card[];
  showdownHands?: Record<string, ShowdownHandInfo>;
  eliminatedPlayers: string[];
}

interface Props {
  history: CompletedHand[];
}

const SUIT_SYMBOL: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};
const SUIT_COLOR: Record<string, string> = {
  hearts: 'var(--red)', diamonds: 'var(--red)', clubs: '#fff', spades: '#fff',
};

// How many community cards are visible at the start of each street
const STREET_CARD_COUNT: Partial<Record<GamePhase, number>> = {
  flop: 3, turn: 4, river: 5, showdown: 5,
};

function cardStr(card: Card): string {
  const rank = card.rank === 'T' ? '10' : card.rank;
  return `${rank}${SUIT_SYMBOL[card.suit]}`;
}

function fmtChips(n: number): string {
  return n.toLocaleString();
}

function streetLabel(street: GamePhase): string {
  return street.charAt(0).toUpperCase() + street.slice(1);
}

function streetCardsText(street: GamePhase, communityCards: Card[]): string {
  const count = STREET_CARD_COUNT[street];
  if (!count) return '';
  return ` [${communityCards.slice(0, count).map(cardStr).join(',')}]`;
}

function handToPlainText(hand: CompletedHand): string {
  const lines: string[] = [`Hand #${hand.handNumber}`, ''];

  let currentStreet: GamePhase | null = null;
  for (const entry of hand.log) {
    if (entry.street !== currentStreet) {
      currentStreet = entry.street;
      lines.push(`${streetLabel(entry.street)}${streetCardsText(entry.street, hand.communityCards)}`);
    }
    if (!entry.isStreetMarker) {
      const amt = entry.amount !== undefined ? ` ${fmtChips(entry.amount)}` : '';
      lines.push(`  ${entry.playerName} ${entry.actionText}${amt}`);
    }
  }

  if (hand.showdownHands && Object.keys(hand.showdownHands).length > 0) {
    lines.push('');
    lines.push('Showdown');
    for (const info of Object.values(hand.showdownHands)) {
      lines.push(`  ${info.playerName}: ${info.cards.map(cardStr).join(' ')} — ${info.handDescription}`);
    }
  }

  lines.push('');
  for (const w of hand.winners) {
    const desc = w.handDescription ? ` (${w.handDescription})` : '';
    lines.push(`${w.playerName} wins ${fmtChips(w.amount)}${desc}`);
  }

  if (hand.eliminatedPlayers.length > 0) {
    lines.push('');
    for (const name of hand.eliminatedPlayers) {
      lines.push(`${name} was eliminated`);
    }
  }

  return lines.join('\n');
}

function StreetLabel({ street, communityCards }: { street: GamePhase; communityCards: Card[] }) {
  const count = STREET_CARD_COUNT[street];
  const cards = count ? communityCards.slice(0, count) : [];
  return (
    <div className="hh-street-label">
      {streetLabel(street)}
      {cards.length > 0 && (
        <span className="hh-street-cards">
          {' ['}
          {cards.map((card, i) => (
            <span key={i} style={{ color: SUIT_COLOR[card.suit] }}>
              {cardStr(card)}{i < cards.length - 1 ? ',' : ''}
            </span>
          ))}
          {']'}
        </span>
      )}
    </div>
  );
}

function HandEntry({ hand }: { hand: CompletedHand }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(handToPlainText(hand)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const winnerSummary = hand.winners
    .map(w => `${w.playerName} wins ${fmtChips(w.amount)}${w.handDescription ? ` (${w.handDescription})` : ''}`)
    .join(', ');

  let currentStreet: GamePhase | null = null;

  return (
    <div className="hh-hand">
      <div className="hh-hand-header" onClick={() => setExpanded(e => !e)}>
        <span className="hh-chevron">{expanded ? '▾' : '▸'}</span>
        <span className="hh-hand-title">Hand #{hand.handNumber}</span>
        <span className="hh-winner-summary">{winnerSummary}</span>
        <button
          className="btn btn-sm hh-copy-btn"
          onClick={e => { e.stopPropagation(); copy(); }}
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>

      {expanded && (
        <div className="hh-hand-body">
          {hand.log.map((entry, i) => {
            const showStreet = entry.street !== currentStreet;
            if (showStreet) currentStreet = entry.street;
            const amt = entry.amount !== undefined ? ` ${fmtChips(entry.amount)}` : '';
            return (
              <div key={i}>
                {showStreet && <StreetLabel street={entry.street} communityCards={hand.communityCards} />}
                {!entry.isStreetMarker && (
                  <div className="hh-log-entry">
                    <span className="hh-player-name">{entry.playerName}</span>
                    {' '}{entry.actionText}{amt}
                  </div>
                )}
              </div>
            );
          })}

          {hand.showdownHands && Object.keys(hand.showdownHands).length > 0 && (
            <div className="hh-result">
              <div className="hh-street-label">Showdown</div>
              {Object.values(hand.showdownHands).map((info, i) => (
                <div key={i} className="hh-log-entry">
                  <span className="hh-player-name">{info.playerName}</span>
                  {': '}
                  {info.cards.map((card, j) => (
                    <span key={j} className="hh-card" style={{ color: SUIT_COLOR[card.suit] }}>
                      {cardStr(card)}{' '}
                    </span>
                  ))}
                  <span className="hh-hand-desc">— {info.handDescription}</span>
                </div>
              ))}
            </div>
          )}

          <div className="hh-result">
            {hand.winners.map((w, i) => (
              <div key={i} className="hh-winner-line">
                {w.playerName} wins {fmtChips(w.amount)}
                {w.handDescription && <span className="hh-hand-desc"> — {w.handDescription}</span>}
              </div>
            ))}
          </div>

          {hand.eliminatedPlayers.length > 0 && (
            <div className="hh-result">
              {hand.eliminatedPlayers.map((name, i) => (
                <div key={i} className="hh-eliminated-line">
                  {name} was eliminated
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function HandHistoryPanel({ history }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`hh-panel ${open ? 'hh-panel--open' : ''}`}>
      <button className="hh-toggle" onClick={() => setOpen(o => !o)}>
        📋 History {history.length > 0 && `(${history.length})`}
      </button>

      {open && (
        <div className="hh-list">
          {history.length === 0 && (
            <div className="hh-empty">No hands completed yet.</div>
          )}
          {history.map(hand => (
            <HandEntry key={hand.handNumber} hand={hand} />
          ))}
        </div>
      )}
    </div>
  );
}
