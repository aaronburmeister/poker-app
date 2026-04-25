import type { Card, Rank } from '@poker/shared';

interface Props {
  card: Card | null;
  faceDown?: boolean;
  small?: boolean;
}

const SUIT_SYMBOL: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const RED_SUITS = new Set(['hearts', 'diamonds']);

function displayRank(rank: Rank): string {
  return rank === 'T' ? '10' : rank;
}

export function CardComponent({ card, faceDown, small }: Props) {
  if (!card || faceDown) {
    return <div className={`card card-back ${small ? 'card-small' : ''}`} />;
  }

  const red = RED_SUITS.has(card.suit);
  const symbol = SUIT_SYMBOL[card.suit];
  const rank = displayRank(card.rank);

  return (
    <div className={`card card-face ${red ? 'card-red' : 'card-black'} ${small ? 'card-small' : ''}`}>
      <span className="card-corner card-tl">{rank}<br />{symbol}</span>
      <span className="card-center">{symbol}</span>
      <span className="card-corner card-br">{rank}<br />{symbol}</span>
    </div>
  );
}
