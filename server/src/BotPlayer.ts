import type { Card, GameState, PlayerAction, Rank } from '@poker/shared';
import { getBestHand } from './HandEvaluator';

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// Pre-flop hand strength 0–1 based on hole cards.
// Designed to give the bot a reasonable range without being exploitable.
function preflopStrength(cards: Card[]): number {
  const [a, b] = cards.map(c => RANK_VALUE[c.rank]).sort((x, y) => y - x);
  const suited = cards[0].suit === cards[1].suit;
  const paired = a === b;
  const gap = a - b;

  if (paired) {
    if (a >= 14) return 1.0;  // AA
    if (a >= 12) return 0.90; // KK, QQ
    if (a >= 10) return 0.80; // JJ, TT
    if (a >= 7)  return 0.65; // 99–77
    return 0.50;              // 66–22
  }

  if (a === 14) {
    if (b >= 13) return suited ? 0.95 : 0.85; // AK
    if (b >= 12) return suited ? 0.85 : 0.75; // AQ
    if (b >= 11) return suited ? 0.78 : 0.68; // AJ
    if (b >= 10) return suited ? 0.72 : 0.60; // AT
    return suited ? 0.60 : 0.45;              // A2–A9
  }

  if (a === 13 && b >= 12) return suited ? 0.75 : 0.65; // KQ
  if (a >= 11 && gap <= 1) return suited ? 0.65 : 0.55; // QJ, JT connectors
  if (gap <= 1 && a >= 9) return suited ? 0.55 : 0.42;  // connected mid-cards
  if (suited && gap <= 2 && a >= 8) return 0.38;
  if (gap <= 1) return 0.30;
  return 0.15;
}

// Post-flop: normalise hand rank (0–8) to 0–1
function postFlopStrength(holeCards: Card[], communityCards: Card[]): number {
  if (communityCards.length < 3) return 0.5;
  try {
    const { rank } = getBestHand([...holeCards, ...communityCards]);
    return rank / 8;
  } catch {
    return 0.5;
  }
}

export class BotPlayer {
  decide(state: GameState, botId: string): PlayerAction {
    const me = state.players.find(p => p.id === botId);
    if (!me) return { type: 'FOLD' };

    const myCards = me.cards.filter((c): c is NonNullable<typeof c> => c !== null);
    if (myCards.length < 2) return { type: 'CHECK' };

    const callAmount = state.currentBet - me.bet;
    const potSize = state.pots.reduce((s, p) => s + p.amount, 0);
    const potOdds = callAmount > 0 ? callAmount / (potSize + callAmount) : 0;

    const strength = state.phase === 'preflop'
      ? preflopStrength(myCards)
      : postFlopStrength(myCards, state.communityCards);

    // Small random bluff factor so the bot isn't purely mechanical
    const bluff = Math.random() < 0.08;

    const effectiveStrength = bluff ? Math.min(1, strength + 0.3) : strength;

    if (effectiveStrength < 0.25) {
      // Weak hand: fold if there's a bet, else check
      return callAmount > 0 ? { type: 'FOLD' } : { type: 'CHECK' };
    }

    if (effectiveStrength < 0.50) {
      // Marginal: call if pot odds justify it
      if (callAmount === 0) return { type: 'CHECK' };
      if (effectiveStrength > potOdds) return { type: 'CALL' };
      return { type: 'FOLD' };
    }

    if (effectiveStrength < 0.75) {
      // Decent hand: call or small raise
      if (callAmount === 0) {
        // Bet half pot occasionally
        if (Math.random() < 0.4 && potSize > 0) {
          const betAmount = Math.min(
            me.bet + Math.floor(potSize * 0.5),
            me.bet + me.chips,
          );
          if (betAmount > state.currentBet) {
            return { type: 'RAISE', amount: betAmount };
          }
        }
        return { type: 'CHECK' };
      }
      return { type: 'CALL' };
    }

    // Strong hand: raise or re-raise
    if (callAmount === 0) {
      const betAmount = me.bet + Math.floor(potSize * 0.75);
      const capped = Math.min(betAmount, me.bet + me.chips);
      if (capped > state.currentBet && me.chips > 0) {
        return { type: 'RAISE', amount: capped };
      }
      return { type: 'CHECK' };
    }

    const raiseAmount = Math.max(state.minRaise, state.currentBet + Math.floor(potSize * 0.5));
    const capped = Math.min(raiseAmount, me.bet + me.chips);
    if (capped > state.currentBet && capped >= state.minRaise) {
      return { type: 'RAISE', amount: capped };
    }
    return { type: 'CALL' };
  }
}
