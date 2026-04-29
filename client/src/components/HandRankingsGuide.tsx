import { useState } from 'react';
import type { Card } from '@poker/shared';
import { CardComponent } from './CardComponent';

interface HandExample {
  name: string;
  cards: Card[];
}

const HANDS: HandExample[] = [
  {
    name: 'Royal Flush',
    cards: [
      { rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' },
      { rank: 'Q', suit: 'spades' }, { rank: 'J', suit: 'spades' }, { rank: 'T', suit: 'spades' },
    ],
  },
  {
    name: 'Straight Flush',
    cards: [
      { rank: '9', suit: 'hearts' }, { rank: '8', suit: 'hearts' },
      { rank: '7', suit: 'hearts' }, { rank: '6', suit: 'hearts' }, { rank: '5', suit: 'hearts' },
    ],
  },
  {
    name: 'Four of a Kind',
    cards: [
      { rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' },
      { rank: 'A', suit: 'diamonds' }, { rank: 'A', suit: 'clubs' }, { rank: 'K', suit: 'spades' },
    ],
  },
  {
    name: 'Full House',
    cards: [
      { rank: 'K', suit: 'spades' }, { rank: 'K', suit: 'hearts' }, { rank: 'K', suit: 'diamonds' },
      { rank: 'Q', suit: 'spades' }, { rank: 'Q', suit: 'hearts' },
    ],
  },
  {
    name: 'Flush',
    cards: [
      { rank: 'A', suit: 'diamonds' }, { rank: 'J', suit: 'diamonds' },
      { rank: '8', suit: 'diamonds' }, { rank: '5', suit: 'diamonds' }, { rank: '2', suit: 'diamonds' },
    ],
  },
  {
    name: 'Straight',
    cards: [
      { rank: '9', suit: 'spades' }, { rank: '8', suit: 'hearts' },
      { rank: '7', suit: 'diamonds' }, { rank: '6', suit: 'clubs' }, { rank: '5', suit: 'spades' },
    ],
  },
  {
    name: 'Three of a Kind',
    cards: [
      { rank: 'Q', suit: 'spades' }, { rank: 'Q', suit: 'hearts' }, { rank: 'Q', suit: 'diamonds' },
      { rank: 'A', suit: 'clubs' }, { rank: 'K', suit: 'spades' },
    ],
  },
  {
    name: 'Two Pair',
    cards: [
      { rank: 'J', suit: 'spades' }, { rank: 'J', suit: 'hearts' },
      { rank: '9', suit: 'diamonds' }, { rank: '9', suit: 'clubs' }, { rank: 'A', suit: 'spades' },
    ],
  },
  {
    name: 'One Pair',
    cards: [
      { rank: 'T', suit: 'spades' }, { rank: 'T', suit: 'hearts' },
      { rank: 'A', suit: 'diamonds' }, { rank: 'K', suit: 'clubs' }, { rank: 'Q', suit: 'spades' },
    ],
  },
  {
    name: 'High Card',
    cards: [
      { rank: 'A', suit: 'spades' }, { rank: 'J', suit: 'hearts' },
      { rank: '9', suit: 'diamonds' }, { rank: '6', suit: 'clubs' }, { rank: '2', suit: 'hearts' },
    ],
  },
];

export function HandRankingsGuide() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="rankings-btn" onClick={() => setOpen(true)}>
        Hand Rankings
      </button>

      {open && (
        <div className="rankings-overlay" onClick={() => setOpen(false)}>
          <div className="rankings-modal" onClick={e => e.stopPropagation()}>
            <div className="rankings-header">
              <span className="rankings-title">Hand Rankings</span>
              <button className="rankings-close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="rankings-list">
              {HANDS.map((hand, rank) => (
                <div key={hand.name} className="rankings-row">
                  <span className="rankings-rank">#{rank + 1}</span>
                  <span className="rankings-name">{hand.name}</span>
                  <div className="rankings-cards">
                    {hand.cards.map((card, i) => (
                      <CardComponent key={i} card={card} small />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
