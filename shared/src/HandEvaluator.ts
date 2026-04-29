import type { Card, Rank } from './types';

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

const RANK_NAME: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

export enum HandRank {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
}

export interface EvaluatedHand {
  rank: HandRank;
  /** Descending-priority values used for tiebreaking within the same rank */
  tiebreaker: number[];
  description: string;
  bestCards: Card[];
}

function evaluate5Card(cards: Card[]): EvaluatedHand {
  const values = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Standard straight
  let isStraight = values[0] - values[4] === 4 && new Set(values).size === 5;
  let straightHigh = values[0];

  // Ace-low straight (A-2-3-4-5)
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5;
  }

  // Group by rank: [{rank, count}] sorted count desc, rank desc
  const countMap: Record<number, number> = {};
  values.forEach(v => { countMap[v] = (countMap[v] ?? 0) + 1; });
  const groups = Object.entries(countMap)
    .map(([r, c]) => ({ rank: parseInt(r), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  if (isFlush && isStraight) {
    return {
      rank: HandRank.STRAIGHT_FLUSH,
      tiebreaker: [straightHigh],
      description: straightHigh === 14 ? 'Royal Flush' : `Straight Flush, ${RANK_NAME[straightHigh]} high`,
      bestCards: cards,
    };
  }

  if (groups[0].count === 4) {
    return {
      rank: HandRank.FOUR_OF_A_KIND,
      tiebreaker: [groups[0].rank, groups[1].rank],
      description: `Four of a Kind, ${RANK_NAME[groups[0].rank]}s`,
      bestCards: cards,
    };
  }

  if (groups[0].count === 3 && groups[1].count === 2) {
    return {
      rank: HandRank.FULL_HOUSE,
      tiebreaker: [groups[0].rank, groups[1].rank],
      description: `Full House, ${RANK_NAME[groups[0].rank]}s full of ${RANK_NAME[groups[1].rank]}s`,
      bestCards: cards,
    };
  }

  if (isFlush) {
    return {
      rank: HandRank.FLUSH,
      tiebreaker: values,
      description: `Flush, ${RANK_NAME[values[0]]} high`,
      bestCards: cards,
    };
  }

  if (isStraight) {
    return {
      rank: HandRank.STRAIGHT,
      tiebreaker: [straightHigh],
      description: `Straight, ${RANK_NAME[straightHigh]} high`,
      bestCards: cards,
    };
  }

  if (groups[0].count === 3) {
    return {
      rank: HandRank.THREE_OF_A_KIND,
      tiebreaker: groups.map(g => g.rank),
      description: `Three of a Kind, ${RANK_NAME[groups[0].rank]}s`,
      bestCards: cards,
    };
  }

  if (groups[0].count === 2 && groups[1].count === 2) {
    return {
      rank: HandRank.TWO_PAIR,
      tiebreaker: groups.map(g => g.rank),
      description: `Two Pair, ${RANK_NAME[groups[0].rank]}s and ${RANK_NAME[groups[1].rank]}s`,
      bestCards: cards,
    };
  }

  if (groups[0].count === 2) {
    return {
      rank: HandRank.PAIR,
      tiebreaker: groups.map(g => g.rank),
      description: `Pair of ${RANK_NAME[groups[0].rank]}s`,
      bestCards: cards,
    };
  }

  return {
    rank: HandRank.HIGH_CARD,
    tiebreaker: values,
    description: `High Card, ${RANK_NAME[values[0]]}`,
    bestCards: cards,
  };
}

/** Positive = a is better, negative = b is better, 0 = tie */
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreaker.length, b.tiebreaker.length); i++) {
    const av = a.tiebreaker[i] ?? 0;
    const bv = b.tiebreaker[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Evaluate all C(n,5) combinations and return the best 5-card hand */
export function getBestHand(cards: Card[]): EvaluatedHand {
  const n = cards.length;
  if (n < 5) throw new Error(`Need at least 5 cards, got ${n}`);

  let best: EvaluatedHand | null = null;

  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const hand = evaluate5Card([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareHands(hand, best) > 0) best = hand;
          }

  return best!;
}
