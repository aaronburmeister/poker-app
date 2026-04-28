import type { Card, GameState, PlayerAction, Rank } from '@poker/shared';
import type { BotPersonalityId } from '@poker/shared';
import { getBestHand } from './HandEvaluator';

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// Pre-flop hand strength 0–1 based on hole cards.
function preflopStrength(cards: Card[]): number {
  const [a, b] = cards.map(c => RANK_VALUE[c.rank]).sort((x, y) => y - x);
  const suited = cards[0].suit === cards[1].suit;
  const paired = a === b;
  const gap = a - b;

  if (paired) {
    if (a >= 14) return 1.0;
    if (a >= 12) return 0.90;
    if (a >= 10) return 0.80;
    if (a >= 7)  return 0.65;
    return 0.50;
  }

  if (a === 14) {
    if (b >= 13) return suited ? 0.95 : 0.85;
    if (b >= 12) return suited ? 0.85 : 0.75;
    if (b >= 11) return suited ? 0.78 : 0.68;
    if (b >= 10) return suited ? 0.72 : 0.60;
    return suited ? 0.60 : 0.45;
  }

  if (a === 13 && b >= 12) return suited ? 0.75 : 0.65;
  if (a >= 11 && gap <= 1) return suited ? 0.65 : 0.55;
  if (gap <= 1 && a >= 9)  return suited ? 0.55 : 0.42;
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

// ── Personality profiles ──────────────────────────────────────────────────────

interface BotPersonalityProfile {
  /** Strength below which the bot folds (or checks if no bet to call) */
  foldThreshold: number;
  /** Strength below which the bot only calls (if pot odds allow) */
  callThreshold: number;
  /** Strength below which the bot makes a small bet/call; above = raise big */
  raiseThreshold: number;
  /** Probability of adding a bluff bonus to effective strength */
  bluffRate: number;
  /** Pot fraction used when betting with a decent (non-premium) hand */
  betSizing: number;
  /** Pot fraction used when betting/raising with a strong hand */
  strongBetSizing: number;
  /**
   * Divides the required pot-odds equity for marginal calls.
   * >1 = calls more liberally (Calling Station, Maniac).
   * <1 = calls more strictly (Nit).
   */
  potOddsMultiplier: number;
}

const PERSONALITY_PROFILES: Record<BotPersonalityId, BotPersonalityProfile> = {
  nit: {
    foldThreshold:     0.45,
    callThreshold:     0.75,
    raiseThreshold:    0.92,
    bluffRate:         0.02,
    betSizing:         0.35,
    strongBetSizing:   0.45,
    potOddsMultiplier: 0.5,
  },
  calling_station: {
    foldThreshold:     0.08,
    callThreshold:     0.25,
    raiseThreshold:    0.90,
    bluffRate:         0.03,
    betSizing:         0.35,
    strongBetSizing:   0.50,
    potOddsMultiplier: 8.0,
  },
  tag: {
    foldThreshold:     0.30,
    callThreshold:     0.52,
    raiseThreshold:    0.65,
    bluffRate:         0.10,
    betSizing:         0.65,
    strongBetSizing:   0.85,
    potOddsMultiplier: 1.0,
  },
  lag: {
    foldThreshold:     0.18,
    callThreshold:     0.38,
    raiseThreshold:    0.52,
    bluffRate:         0.22,
    betSizing:         0.80,
    strongBetSizing:   1.0,
    potOddsMultiplier: 1.8,
  },
  maniac: {
    foldThreshold:     0.05,
    callThreshold:     0.12,
    raiseThreshold:    0.25,
    bluffRate:         0.40,
    betSizing:         1.10,
    strongBetSizing:   1.50,
    potOddsMultiplier: 12.0,
  },
};

// ── BotPlayer ─────────────────────────────────────────────────────────────────

export class BotPlayer {
  decide(state: GameState, botId: string, personality: BotPersonalityId = 'tag'): PlayerAction {
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

    const profile = PERSONALITY_PROFILES[personality];
    const bluff = Math.random() < profile.bluffRate;
    const effectiveStrength = bluff ? Math.min(1, strength + 0.3) : strength;

    // Weak hand: fold if facing a bet, else check
    if (effectiveStrength < profile.foldThreshold) {
      return callAmount > 0 ? { type: 'FOLD' } : { type: 'CHECK' };
    }

    // Marginal hand: call only if pot odds are acceptable (adjusted by personality)
    if (effectiveStrength < profile.callThreshold) {
      if (callAmount === 0) return { type: 'CHECK' };
      if (effectiveStrength > potOdds / profile.potOddsMultiplier) return { type: 'CALL' };
      return { type: 'FOLD' };
    }

    // Decent hand: bet small or call
    if (effectiveStrength < profile.raiseThreshold) {
      if (callAmount === 0) {
        if (Math.random() < 0.4 && potSize > 0) {
          const betAmount = Math.min(
            me.bet + Math.floor(potSize * profile.betSizing),
            me.bet + me.chips,
          );
          if (betAmount > state.currentBet) return { type: 'RAISE', amount: betAmount };
        }
        return { type: 'CHECK' };
      }
      return { type: 'CALL' };
    }

    // Strong hand: raise or re-raise
    if (callAmount === 0) {
      const betAmount = me.bet + Math.floor(potSize * profile.strongBetSizing);
      const capped = Math.min(betAmount, me.bet + me.chips);
      if (capped > state.currentBet && me.chips > 0) return { type: 'RAISE', amount: capped };
      return { type: 'CHECK' };
    }

    const raiseAmount = Math.max(
      state.minRaise,
      state.currentBet + Math.floor(potSize * profile.strongBetSizing),
    );
    const capped = Math.min(raiseAmount, me.bet + me.chips);
    if (capped > state.currentBet && capped >= state.minRaise) return { type: 'RAISE', amount: capped };
    return { type: 'CALL' };
  }
}
