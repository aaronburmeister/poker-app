import { useMemo } from 'react';
import type { Card, GameState, Rank, Suit } from '@poker/shared';
import { getBestHand, compareHands, HandRank } from '@poker/shared';

// ── Deck ─────────────────────────────────────────────────────────────────────

const ALL_RANKS: Rank[] = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const ALL_SUITS: Suit[] = ['hearts','diamonds','clubs','spades'];
const FULL_DECK: Card[] = ALL_RANKS.flatMap(rank => ALL_SUITS.map(suit => ({ rank, suit })));

const RANK_VALUE: Record<Rank, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14,
};

const RANK_CHAR: Record<number, string> = {
  14:'A',13:'K',12:'Q',11:'J',10:'T',9:'9',8:'8',7:'7',6:'6',5:'5',4:'4',3:'3',2:'2',
};

// Approximate HU equity for made hands vs one random opponent.
// Tuple index: 0 = flop (2 cards to come), 1 = turn (1 card to come), 2 = river (final).
// Drawing hands (pair, high card) use the outs formula instead.
const MADE_HAND_BASE_EQUITY: Partial<Record<HandRank, [number, number, number]>> = {
  [HandRank.STRAIGHT_FLUSH]: [99, 99, 99],
  [HandRank.FOUR_OF_A_KIND]: [98, 98, 98],
  [HandRank.FULL_HOUSE]:     [94, 96, 96],
  [HandRank.FLUSH]:          [82, 86, 85],
  [HandRank.STRAIGHT]:       [79, 83, 82],
  [HandRank.THREE_OF_A_KIND]:[73, 74, 73],
  [HandRank.TWO_PAIR]:       [62, 65, 64],
};
const TOP_PAIR_BASE_EQUITY: [number, number, number] = [68, 70, 69];

// ── Preflop HU equity lookup ──────────────────────────────────────────────────
// Heads-up equity vs one random opponent for all 169 canonical starting hands.
// Values sourced from simulation data (±1% for premium hands, ±3% for weak hands).
// Used in place of a coarse tier table so the multiway formula has an accurate base.

const PREFLOP_HU_EQUITY: Record<string, number> = {
  // Pairs
  'AA':85,'KK':82,'QQ':80,'JJ':77,'TT':75,'99':72,'88':69,'77':66,'66':63,'55':60,'44':57,'33':54,'22':51,
  // Ace-high suited
  'AKs':67,'AQs':66,'AJs':65,'ATs':64,'A9s':63,'A8s':62,'A7s':61,'A6s':60,'A5s':60,'A4s':59,'A3s':58,'A2s':57,
  // Ace-high offsuit
  'AKo':65,'AQo':64,'AJo':63,'ATo':61,'A9o':59,'A8o':58,'A7o':57,'A6o':56,'A5o':56,'A4o':55,'A3o':54,'A2o':53,
  // King-high suited
  'KQs':63,'KJs':62,'KTs':61,'K9s':59,'K8s':57,'K7s':56,'K6s':55,'K5s':54,'K4s':53,'K3s':52,'K2s':51,
  // King-high offsuit
  'KQo':61,'KJo':60,'KTo':58,'K9o':56,'K8o':54,'K7o':53,'K6o':52,'K5o':51,'K4o':50,'K3o':49,'K2o':48,
  // Queen-high suited
  'QJs':60,'QTs':59,'Q9s':57,'Q8s':55,'Q7s':53,'Q6s':52,'Q5s':51,'Q4s':50,'Q3s':49,'Q2s':48,
  // Queen-high offsuit
  'QJo':58,'QTo':56,'Q9o':54,'Q8o':52,'Q7o':50,'Q6o':49,'Q5o':48,'Q4o':47,'Q3o':46,'Q2o':45,
  // Jack-high suited
  'JTs':58,'J9s':56,'J8s':54,'J7s':52,'J6s':50,'J5s':49,'J4s':48,'J3s':47,'J2s':46,
  // Jack-high offsuit
  'JTo':56,'J9o':53,'J8o':51,'J7o':49,'J6o':47,'J5o':46,'J4o':45,'J3o':44,'J2o':43,
  // Ten-high suited
  'T9s':56,'T8s':54,'T7s':51,'T6s':49,'T5s':47,'T4s':46,'T3s':45,'T2s':44,
  // Ten-high offsuit
  'T9o':53,'T8o':51,'T7o':48,'T6o':46,'T5o':44,'T4o':43,'T3o':42,'T2o':41,
  // Nine-high suited
  '98s':53,'97s':51,'96s':49,'95s':47,'94s':45,'93s':42,'92s':40,
  // Nine-high offsuit
  '98o':50,'97o':48,'96o':46,'95o':44,'94o':41,'93o':38,'92o':36,
  // Eight-high suited
  '87s':51,'86s':49,'85s':47,'84s':45,'83s':41,'82s':39,
  // Eight-high offsuit
  '87o':48,'86o':46,'85o':43,'84o':41,'83o':38,'82o':35,
  // Seven-high suited
  '76s':49,'75s':47,'74s':44,'73s':41,'72s':38,
  // Seven-high offsuit
  '76o':46,'75o':43,'74o':41,'73o':37,'72o':34,
  // Six-high suited
  '65s':48,'64s':45,'63s':42,'62s':39,
  // Six-high offsuit
  '65o':45,'64o':42,'63o':39,'62o':36,
  // Five-high suited
  '54s':46,'53s':43,'52s':40,
  // Five-high offsuit
  '54o':43,'53o':40,'52o':37,
  // Four-high suited
  '43s':44,'42s':41,
  // Four-high offsuit
  '43o':41,'42o':38,
  // Three-high
  '32s':42,'32o':38,
};

// ── Preflop range-equity adjustment ──────────────────────────────────────────
// As bet level rises the opponent's range tightens. Medium hands lose equity
// disproportionately (dominated kickers, coin-flips with premium pairs).
// betLevel 0 = blinds / no raise | 1 = open raise | 2 = 3-bet | 3 = 4-bet | 4 = 5-bet+

const RANGE_EQUITY_FACTOR: Record<'Premium' | 'Strong' | 'Playable' | 'Speculative' | 'Weak',
  readonly [number, number, number, number, number]> = {
  //          [  0,     1,    2-3bet, 3-4bet, 4-5bet+]
  Premium:    [1.00,  1.00,   0.82,   0.68,   0.56],
  Strong:     [1.00,  0.97,   0.72,   0.57,   0.44],
  Playable:   [1.00,  0.95,   0.62,   0.48,   0.35],
  Speculative:[1.00,  0.90,   0.53,   0.39,   0.27],
  Weak:       [1.00,  0.85,   0.45,   0.31,   0.20],
};

// Per-hand overrides for top pairs, which diverge heavily from their tier average.
// AA gains equity vs tighter ranges; KK/QQ face AA/KK more frequently.
const PAIR_RANGE_FACTOR: Record<number, readonly [number, number, number, number, number]> = {
  14: [1.00, 1.00, 1.05, 1.10, 1.15],  // AA — benefits from tight ranges
  13: [1.00, 1.00, 0.93, 0.85, 0.72],  // KK — solid until 5-bet (faces AA)
  12: [1.00, 1.00, 0.81, 0.63, 0.50],  // QQ — faces AA/KK significantly at 4-bet+
};

function calcRangeEquity(
  tier: 'Premium' | 'Strong' | 'Playable' | 'Speculative' | 'Weak',
  equityVsRandom: number,
  betLevel: number,
  isPair: boolean,
  pairRank: number,
): number {
  if (betLevel <= 1) return equityVsRandom;
  const pairFactors = isPair ? PAIR_RANGE_FACTOR[pairRank] : undefined;
  const factor = pairFactors
    ? (pairFactors[betLevel] ?? 1.0)
    : (RANGE_EQUITY_FACTOR[tier][betLevel] ?? 1.0);
  return Math.min(Math.round(equityVsRandom * factor), 99);
}

// Range label shown in the panel when facing raised aggression
const BET_LEVEL_LABEL: Record<number, string> = {
  2: 'vs 3-bet range (TT+/AK/AJs+)',
  3: 'vs 4-bet range (QQ+/AK)',
  4: 'vs 5-bet range (KK+)',
};

// ── Static preflop hand tier matrix ──────────────────────────────────────────
// Sklansky-inspired tier assignments for all 169 canonical starting hands.
// Tiers are fixed by hand quality, never derived from raw equity percentages,
// so T6o is always 'Weak' and AA is always 'Premium' regardless of opponent count.

const PREFLOP_STATIC_TIER: Record<string, PreflopTier> = {
  // Pairs
  'AA': 'Premium', 'KK': 'Premium', 'QQ': 'Premium', 'JJ': 'Premium', 'TT': 'Premium',
  '99': 'Strong',  '88': 'Strong',
  '77': 'Playable', '66': 'Playable', '55': 'Playable',
  '44': 'Speculative', '33': 'Speculative', '22': 'Speculative',
  // Ace-high suited
  'AKs': 'Premium', 'AQs': 'Premium', 'AJs': 'Strong', 'ATs': 'Strong',
  'A9s': 'Playable', 'A8s': 'Playable', 'A7s': 'Playable', 'A6s': 'Playable',
  'A5s': 'Playable', 'A4s': 'Playable', 'A3s': 'Playable', 'A2s': 'Playable',
  // Ace-high offsuit
  'AKo': 'Premium', 'AQo': 'Strong', 'AJo': 'Strong', 'ATo': 'Playable',
  'A9o': 'Playable',
  'A8o': 'Speculative', 'A7o': 'Speculative', 'A6o': 'Speculative',
  'A5o': 'Speculative', 'A4o': 'Speculative', 'A3o': 'Speculative', 'A2o': 'Speculative',
  // King-high suited
  'KQs': 'Strong', 'KJs': 'Strong', 'KTs': 'Playable', 'K9s': 'Playable',
  'K8s': 'Speculative', 'K7s': 'Speculative', 'K6s': 'Speculative', 'K5s': 'Speculative',
  'K4s': 'Speculative', 'K3s': 'Speculative', 'K2s': 'Speculative',
  // King-high offsuit
  'KQo': 'Playable', 'KJo': 'Playable', 'KTo': 'Speculative', 'K9o': 'Speculative',
  'K8o': 'Weak', 'K7o': 'Weak', 'K6o': 'Weak', 'K5o': 'Weak',
  'K4o': 'Weak', 'K3o': 'Weak', 'K2o': 'Weak',
  // Queen-high suited
  'QJs': 'Strong', 'QTs': 'Playable', 'Q9s': 'Playable',
  'Q8s': 'Speculative', 'Q7s': 'Speculative', 'Q6s': 'Speculative', 'Q5s': 'Speculative',
  'Q4s': 'Weak', 'Q3s': 'Weak', 'Q2s': 'Weak',
  // Queen-high offsuit
  'QJo': 'Playable', 'QTo': 'Speculative', 'Q9o': 'Speculative',
  'Q8o': 'Weak', 'Q7o': 'Weak', 'Q6o': 'Weak', 'Q5o': 'Weak',
  'Q4o': 'Weak', 'Q3o': 'Weak', 'Q2o': 'Weak',
  // Jack-high suited
  'JTs': 'Strong', 'J9s': 'Playable', 'J8s': 'Playable',
  'J7s': 'Speculative', 'J6s': 'Speculative',
  'J5s': 'Weak', 'J4s': 'Weak', 'J3s': 'Weak', 'J2s': 'Weak',
  // Jack-high offsuit
  'JTo': 'Playable', 'J9o': 'Speculative', 'J8o': 'Speculative',
  'J7o': 'Weak', 'J6o': 'Weak', 'J5o': 'Weak', 'J4o': 'Weak', 'J3o': 'Weak', 'J2o': 'Weak',
  // Ten-high suited
  'T9s': 'Playable', 'T8s': 'Playable', 'T7s': 'Speculative', 'T6s': 'Speculative',
  'T5s': 'Weak', 'T4s': 'Weak', 'T3s': 'Weak', 'T2s': 'Weak',
  // Ten-high offsuit
  'T9o': 'Speculative', 'T8o': 'Speculative',
  'T7o': 'Weak', 'T6o': 'Weak', 'T5o': 'Weak', 'T4o': 'Weak', 'T3o': 'Weak', 'T2o': 'Weak',
  // Nine-high suited
  '98s': 'Playable', '97s': 'Speculative', '96s': 'Speculative',
  '95s': 'Weak', '94s': 'Weak', '93s': 'Weak', '92s': 'Weak',
  // Nine-high offsuit
  '98o': 'Speculative', '97o': 'Weak', '96o': 'Weak', '95o': 'Weak',
  '94o': 'Weak', '93o': 'Weak', '92o': 'Weak',
  // Eight-high suited
  '87s': 'Playable', '86s': 'Speculative', '85s': 'Speculative',
  '84s': 'Weak', '83s': 'Weak', '82s': 'Weak',
  // Eight-high offsuit
  '87o': 'Speculative', '86o': 'Weak', '85o': 'Weak', '84o': 'Weak', '83o': 'Weak', '82o': 'Weak',
  // Seven-high suited
  '76s': 'Playable', '75s': 'Speculative', '74s': 'Weak', '73s': 'Weak', '72s': 'Weak',
  // Seven-high offsuit
  '76o': 'Speculative', '75o': 'Weak', '74o': 'Weak', '73o': 'Weak', '72o': 'Weak',
  // Six-high suited
  '65s': 'Playable', '64s': 'Speculative', '63s': 'Weak', '62s': 'Weak',
  // Six-high offsuit
  '65o': 'Speculative', '64o': 'Weak', '63o': 'Weak', '62o': 'Weak',
  // Five-high suited
  '54s': 'Speculative', '53s': 'Weak', '52s': 'Weak',
  // Five-high offsuit
  '54o': 'Weak', '53o': 'Weak', '52o': 'Weak',
  // Four-high
  '43s': 'Weak', '42s': 'Weak', '43o': 'Weak', '42o': 'Weak',
  // Three-high
  '32s': 'Weak', '32o': 'Weak',
};

// ── Preflop strength ─────────────────────────────────────────────────────────

type PreflopTier = 'Premium' | 'Strong' | 'Playable' | 'Speculative' | 'Weak';

// 'draw'      — pocket pairs (set mining) and suited connectors/one-gappers:
//               good implied odds, can profitably call with a moderate negative edge.
// 'dominated' — offsuit hands where pairing the high card gives a weak kicker
//               (e.g. K7o, Q6o, J5o): suffer from reverse implied odds; require
//               positive immediate EV to call.
// 'neutral'   — everything else: use a moderate threshold.
type ImpliedOddsProfile = 'draw' | 'dominated' | 'neutral';

interface PreflopStrength {
  tier: PreflopTier;
  label: string;
  equityVsRandom: number;
  impliedOddsProfile: ImpliedOddsProfile;
  isPair: boolean;
  pairRank: number;   // numeric rank of the pair (0 if not a pair)
  hiCard: number;     // numeric rank of the higher hole card
  loCard: number;     // numeric rank of the lower hole card
}

function getPreflopStrength(cards: Card[]): PreflopStrength {
  if (cards.length < 2) return {
    tier: 'Weak', label: '—', equityVsRandom: 0, impliedOddsProfile: 'neutral',
    isPair: false, pairRank: 0, hiCard: 0, loCard: 0,
  };
  const [a, b] = cards;
  const v1 = RANK_VALUE[a.rank], v2 = RANK_VALUE[b.rank];
  const hi = Math.max(v1, v2), lo = Math.min(v1, v2);
  const suited = a.suit === b.suit;
  const isPair = hi === lo;
  const gap = hi - lo;
  const s = suited ? 's' : 'o';

  const label = isPair
    ? `Pocket ${RANK_CHAR[hi]}s`
    : `${RANK_CHAR[hi]}${RANK_CHAR[lo]}${s}`;

  const key = isPair ? `${RANK_CHAR[hi]}${RANK_CHAR[hi]}` : `${RANK_CHAR[hi]}${RANK_CHAR[lo]}${s}`;
  const equityVsRandom = PREFLOP_HU_EQUITY[key] ?? 40;

  const tier: PreflopTier = PREFLOP_STATIC_TIER[key] ?? 'Weak';

  // Pocket pairs and suited connectors/one-gappers have good implied odds (set mining,
  // flush/straight draws that either hit big or fold cheaply).
  // Offsuit hands where pairing the high card gives a dominated kicker suffer from
  // reverse implied odds — they lose big pots to better kickers.
  let impliedOddsProfile: ImpliedOddsProfile;
  if (isPair || (suited && gap <= 2)) {
    impliedOddsProfile = 'draw';
  } else if (!suited && hi >= 11 && lo <= 8) {
    impliedOddsProfile = 'dominated';
  } else {
    impliedOddsProfile = 'neutral';
  }

  return { tier, label, equityVsRandom, impliedOddsProfile, isPair, pairRank: isPair ? hi : 0, hiCard: hi, loCard: lo };
}

const TIER_COLOR: Record<PreflopTier, string> = {
  Premium:     '#f59e0b',
  Strong:      '#6ee7b7',
  Playable:    '#93c5fd',
  Speculative: '#c4b5fd',
  Weak:        '#f87171',
};

// ── Genuine out detection ─────────────────────────────────────────────────────

/**
 * Returns true only if newCard genuinely helps the player using their hole cards,
 * not just because it pairs a board card that any player could use.
 *
 * The direct board comparison (hero vs board-only) was previously used on the turn
 * but incorrectly counted board-pairing cards as outs: e.g. a second Ace gives the
 * hero a better kicker than the bare board, but opponents also play the board Ace
 * and may have better kickers. Heuristics avoid this by requiring a hole-card link.
 */
function isGenuineOut(holeCards: Card[], community: Card[], newCard: Card, currentRank: number): boolean {
  const improved = getBestHand([...holeCards, ...community, newCard]);
  if (improved.rank <= currentRank) return false;

  const holeRanks = new Set(holeCards.map(c => c.rank));
  const holeSuits = holeCards.map(c => c.suit);

  // New card pairs (or makes trips/quads with) one of the hole cards
  if (holeRanks.has(newCard.rank)) return true;

  // New card completes a straight and a hole card is inside that straight's range
  if (improved.rank >= HandRank.STRAIGHT) {
    const high = improved.tiebreaker[0];
    const low = high === 5 ? 1 : high - 4; // handle A-2-3-4-5
    for (const hc of holeCards) {
      const v = RANK_VALUE[hc.rank];
      if (v >= low && v <= high) return true;
    }
  }

  // New card completes a flush and shares suit with a hole card
  if (improved.rank === HandRank.FLUSH || improved.rank === HandRank.STRAIGHT_FLUSH) {
    if (holeSuits.includes(newCard.suit)) return true;
  }

  return false;
}

// ── Hand distribution ─────────────────────────────────────────────────────────

const HAND_RANK_NAME = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
] as const;

type HandRankName = typeof HAND_RANK_NAME[number];

interface HandDistribution {
  rank: HandRankName;
  pct: number;
}

function getHandDistribution(myCards: Card[], community: Card[]): HandDistribution[] {
  const known = [...myCards, ...community];
  const knownSet = new Set(known.map(c => `${c.rank}${c.suit}`));
  const unseen = FULL_DECK.filter(c => !knownSet.has(`${c.rank}${c.suit}`));

  const tally = new Array<number>(9).fill(0);
  let total = 0;

  if (community.length === 4) {
    // Turn: one card to come
    for (const card of unseen) {
      tally[getBestHand([...known, card]).rank]++;
      total++;
    }
  } else if (community.length === 3) {
    // Flop: two cards to come — enumerate pairs
    for (let i = 0; i < unseen.length - 1; i++) {
      for (let j = i + 1; j < unseen.length; j++) {
        tally[getBestHand([...known, unseen[i], unseen[j]]).rank]++;
        total++;
      }
    }
  } else {
    // River: hand is final
    tally[getBestHand(known).rank]++;
    total = 1;
  }

  return HAND_RANK_NAME.map((rank, i) => ({
    rank,
    pct: total > 0 ? Math.round((tally[i] / total) * 100) : 0,
  })).filter(d => d.pct > 0).sort((a, b) => b.pct - a.pct);
}

// ── Multiway preflop equity ───────────────────────────────────────────────────

/**
 * Converts heads-up equity to N-opponent equity using a calibrated per-opponent
 * decay factor. e^N (independent wins) is wrong for weak hands because opponents'
 * hands are correlated — one strong opponent means the others are likely weaker.
 * Calibrated so: AA 85%→54% vs 4, avg 50%→25% vs 4, 9-3o 37%→9% vs 4.
 */
function multiwayPreflopEquity(e: number, numOpponents: number): number {
  if (numOpponents <= 1) return e;
  // Strong hands retain edge better (decay ~0.86); weak hands degrade faster (decay ~0.62).
  const slope = e >= 0.5 ? 0.203 : 1.31;
  const decay = 0.794 + (e - 0.5) * slope;
  return e * Math.pow(Math.max(0, decay), numOpponents - 1);
}

// ── Recommendation ────────────────────────────────────────────────────────────

interface RaiseSuggestion {
  min: number;
  max: number;
  label: string;  // e.g. "2/3 to full pot", "2.5–3× big blind"
}

interface Recommendation {
  action: 'FOLD' | 'CALL' | 'RAISE' | 'CHECK' | 'BET';
  reason: string;
  raiseSuggestion?: RaiseSuggestion;
}

function calcRaiseSuggestion(
  currentPot: number,
  callAmount: number,
  myBet: number,
  bigBlind: number,
  minRaise: number,
  myChips: number,
  isPreflop: boolean,
  currentBet: number,
  equityPct: number,
  isMadeHand: boolean,
): RaiseSuggestion {
  const cap = (n: number) => Math.min(Math.round(n), myBet + myChips);

  if (isPreflop) {
    if (callAmount === 0) {
      // Opening: 2.5–3× big blind
      return { min: cap(2.5 * bigBlind), max: cap(3 * bigBlind), label: '2.5–3× big blind' };
    } else {
      // Facing a raise: 3-bet to ~3–4× the raise
      return { min: cap(3 * currentBet), max: cap(4 * currentBet), label: '3–4× the raise' };
    }
  }

  // Postflop: pot-sized raise formula
  // After calling, pot = currentPot + callAmount. Raise by that → total = myBet + currentPot + 2×callAmount
  const potSizedRaiseTo = cap(myBet + currentPot + 2 * callAmount);

  if (callAmount === 0) {
    // Bet into an unchecked pot
    const halfPot  = cap(currentPot * 0.5);
    const twoThird = cap(currentPot * 0.67);
    const fullPot  = cap(currentPot);
    // Made hands always bet for value; drawing hands use value sizing only when very strong.
    if (isMadeHand || equityPct >= 65) {
      return { min: twoThird, max: fullPot, label: '2/3 to full pot (value bet)' };
    }
    return { min: halfPot, max: twoThird, label: '1/2 to 2/3 pot (semi-bluff sizing)' };
  }

  // Raising a bet: from minRaise floor up to pot-sized
  const raiseTo = Math.max(minRaise, cap(2.5 * currentBet));
  return { min: raiseTo, max: potSizedRaiseTo, label: '2.5× bet to pot-sized raise' };
}

function getRecommendation(
  equityPct: number,
  potOddsPct: number,
  callAmount: number,
  handName: string | null,
  preflopTier: PreflopTier | null,
  preflopProfile: ImpliedOddsProfile | null,
  cardsToRiver: number,
  currentPot: number,
  myBet: number,
  bigBlind: number,
  minRaise: number,
  myChips: number,
  currentBet: number,
  numOpponents: number,
  isMadeHand: boolean,
  betLevel: number,
  isDeepStack: boolean,
  isPair: boolean,
  pairRank: number,
  hiCard: number,
): Recommendation {
  const facingBet = callAmount > 0;
  const edge = equityPct - potOddsPct;
  const isPreflop = cardsToRiver === 2 && !handName;

  function withRaise(action: 'RAISE' | 'BET', reason: string): Recommendation {
    return {
      action,
      reason,
      raiseSuggestion: calcRaiseSuggestion(
        currentPot, callAmount, myBet, bigBlind, minRaise, myChips, isPreflop, currentBet, equityPct, isMadeHand,
      ),
    };
  }

  if (isPreflop) {
    if (!facingBet) {
      if (preflopTier === 'Premium' || preflopTier === 'Strong')
        return withRaise('BET', 'Strong starting hand — build the pot.');
      if (preflopTier === 'Playable')
        return { action: 'CHECK', reason: 'Decent hand but not strong enough to build the pot preflop.' };
      return { action: 'CHECK', reason: 'Weak hand — see the flop cheaply if possible.' };
    }

    // ── Action-context logic for 3-bet / 4-bet / 5-bet+ ─────────────────────
    // At each level the opponent's range narrows dramatically; most hands that
    // were profitable calling an open raise become losing calls here.
    if (facingBet && betLevel >= 2) {

      // 5-bet+: opponent range ≈ top 1% (essentially KK/AA).
      if (betLevel >= 4) {
        if (isPair && pairRank >= 13)  // AA or KK — only hands that flip or dominate KK+
          return withRaise('RAISE', 'AA/KK — re-raise all-in. Opponent range at 5-bet is KK+ and your hand is never a big underdog.');
        if (isPair && pairRank === 12 && !isDeepStack)
          return { action: 'CALL', reason: 'QQ vs 5-bet: just over 40% equity vs a KK+ range. Calling is the best option at shorter stack depths.' };
        return { action: 'FOLD', reason: 'Facing a 5-bet: opponent range is essentially KK/AA. Only KK or AA can continue profitably — fold everything else.' };
      }

      // 4-bet: opponent range ≈ top 3% (QQ+/AK).
      if (betLevel === 3) {
        if (isPair && pairRank >= 13)  // AA or KK
          return withRaise('RAISE', 'AA/KK — 5-bet all-in for full value against the 4-bet range (QQ+/AK).');
        if (isPair && pairRank === 12)  // QQ
          return { action: 'CALL', reason: isDeepStack
            ? 'QQ vs 4-bet: ~50% equity justifies calling. At 100+ BBs effective, shoving risks too much on a near coin-flip.'
            : 'QQ has ~50% equity vs the 4-bet range (QQ+/AK) — calling is correct.' };
        if (preflopTier === 'Premium' && !isPair && hiCard === 14)  // AKs, AKo
          return { action: 'CALL', reason: 'AK vs 4-bet: ~45% equity — calling is correct. Re-raising risks too much vs a range that dominates or flips with AK.' };
        if (preflopTier === 'Strong' && !isDeepStack)  // JJ, TT at short stack
          return { action: 'CALL', reason: 'JJ/TT has marginal equity vs the 4-bet range. Call only at short stack depths (<40 BBs effective).' };
        return { action: 'FOLD', reason: 'Facing a 4-bet: opponent range is QQ+/AK. Hand equity is too low to continue profitably — fold.' };
      }

      // 3-bet: opponent range ≈ top 8% (TT+/AK/AJs+/KQs).
      if (isPair && pairRank >= 13)  // AA or KK
        return withRaise('RAISE', 'AA/KK — 4-bet for maximum value. You dominate or flip against the entire 3-bet range.');
      if (isPair && pairRank === 12)  // QQ
        return withRaise('RAISE', 'QQ — strong 4-bet candidate. Ahead of most of the 3-bet range (TT/JJ/AQ/KQ) and a flip with AK.');
      if (preflopTier === 'Premium' && !isPair && hiCard === 14 && pairRank === 0) {
        // Non-pair Ace-high Premiums: AK 4-bets; AQ/AJ call (dominated by AK in 3-bet range)
        const isAK = equityPct >= 53;  // range-adjusted AK stays higher than AQ/AJ
        return isAK
          ? withRaise('RAISE', 'AK — 4-betting is standard. A flip or slight favourite vs the entire 3-bet range.')
          : { action: 'CALL', reason: 'AQ/AJ — call the 3-bet. 4-betting inflates the pot into a range that includes AK, which dominates your kicker.' };
      }
      if (preflopTier === 'Strong')  // JJ, TT
        return { action: 'CALL', reason: `Strong hand (JJ/TT) — call the 3-bet and re-evaluate post-flop. 4-betting risks too much vs a range that includes AA/KK/QQ/AK.` };
      return { action: 'FOLD', reason: 'Facing a 3-bet: opponent range (TT+/AK/AJs+/KQs) has your hand dominated or at best a coin-flip. Fold and wait for a better spot.' };
    }

    // ── betLevel 0-1: open raise or no raise ────────────────────────────────
    // Weak/Speculative facing any raise: skip pot-odds math entirely.
    // These hands suffer from reverse implied odds — even when they hit they lose to
    // better kickers — so no equity-to-pot-odds comparison can justify a call.
    if (facingBet && (preflopTier === 'Weak' || preflopTier === 'Speculative'))
      return { action: 'FOLD', reason: betLevel >= 1
        ? 'Speculative/weak hand facing a raise — reverse implied odds make calling unprofitable even when pot odds look close. Fold and wait for a stronger spot.'
        : 'Speculative/weak hand — poor post-flop playability and dominated kickers make limping unprofitable. Fold and wait for a stronger spot.' };

    if (preflopTier === 'Premium')
      return withRaise('RAISE', 'Premium hand — maximize value before the flop.');
    if (preflopTier === 'Strong')
      return { action: 'CALL', reason: 'Strong hand — worth calling most raises.' };
    if (preflopTier === 'Playable' || preflopTier === 'Speculative') {
      // draw (pairs/suited connectors): lenient — good implied odds justify a small negative edge.
      // dominated (weak offsuit kickers): strict — reverse implied odds mean we need positive EV.
      // neutral: moderate threshold.
      const foldEdge = preflopProfile === 'draw' ? -12 : preflopProfile === 'dominated' ? 0 : -5;
      if (edge < foldEdge)
        return { action: 'FOLD', reason: `Equity (~${Math.round(equityPct)}%) doesn't cover the ${Math.round(potOddsPct)}% needed — kicker-dominated hands lose big pots post-flop.` };
      return { action: 'CALL', reason: 'Decent hand — calling is reasonable, but be cautious against large raises.' };
    }
    return { action: 'FOLD', reason: 'Weak hand — poor post-flop playability and reverse implied odds make this unprofitable even when pot odds appear close.' };
  }

  if (!facingBet) {
    // Dynamic BET threshold: your equity must exceed your fair share by 20%.
    // In a 4-way pot fair share = 25%, so threshold = 30% — a set at 52% correctly BETs.
    // Heads-up fair share = 50%, threshold = 60% — avoids frivolous bets with marginal hands.
    const fairSharePct = 100 / (numOpponents + 1);
    const betThreshold = fairSharePct * 1.2;
    if (equityPct >= betThreshold)
      return withRaise('BET', cardsToRiver === 0
        ? 'Strong hand — bet for value.'
        : 'Strong hand — bet to build the pot and charge draws.');
    if (equityPct >= fairSharePct)
      return { action: 'CHECK', reason: 'Moderate hand — check to control the pot size.' };
    return { action: 'CHECK', reason: cardsToRiver === 0
      ? 'Weak hand — check and hope to see a cheap showdown.'
      : 'Weak hand — check and reassess on the next card.' };
  }

  if (edge >= 20)
    return withRaise('RAISE', cardsToRiver === 0
      ? `Your equity (${Math.round(equityPct)}%) strongly exceeds pot odds — raise for maximum value.`
      : `Your equity (${Math.round(equityPct)}%) strongly exceeds pot odds — raise to charge drawing hands.`);
  if (edge >= -5)
    return { action: 'CALL', reason: `Your equity (${Math.round(equityPct)}%) is close to or above pot odds (${Math.round(potOddsPct)}%) — calling is reasonable.` };
  return { action: 'FOLD', reason: `Your equity (${Math.round(equityPct)}%) is well below pot odds (${Math.round(potOddsPct)}%) — folding is the most profitable play.` };
}

const ACTION_COLOR: Record<Recommendation['action'], string> = {
  FOLD:  '#f87171',
  CALL:  '#93c5fd',
  RAISE: '#6ee7b7',
  CHECK: '#c4b5fd',
  BET:   '#6ee7b7',
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  state: GameState;
}

function fmtChips(n: number) { return n.toLocaleString(); }
function pct(n: number) { return `${Math.round(n)}%`; }

export function OddsPanel({ state }: Props) {
  if (!state.isMyTurn) return null;

  const me = state.players.find(p => p.id === state.myPlayerId);
  if (!me || me.status !== 'active') return null;

  const myCards = me.cards.filter((c): c is Card => c !== null);
  if (myCards.length < 2) return null;

  const community = state.communityCards;
  const callAmount = Math.max(0, state.currentBet - me.bet);
  const currentPot = state.pots.reduce((s, p) => s + p.amount, 0);
  const potAfterCall = currentPot + callAmount;
  const potOddsPct = potAfterCall > 0 && callAmount > 0 ? (callAmount / potAfterCall) * 100 : 0;
  const impliedChips = state.players
    .filter(p => p.id !== state.myPlayerId && p.status === 'active')
    .reduce((s, p) => s + p.chips, 0);
  const cardsToRiver = community.length === 5 ? 0 : community.length === 4 ? 1 : 2;
  const isPreflop = community.length === 0;
  const onRiver = cardsToRiver === 0;

  const preflopStrength = isPreflop ? getPreflopStrength(myCards) : null;

  // Detect how many times the bet has been raised relative to the big blind.
  // 0 = posted blinds/limp, 1 = open raise, 2 = 3-bet, 3 = 4-bet, 4 = 5-bet+
  const betLevelRatio = state.currentBet / state.bigBlindAmount;
  const betLevel = betLevelRatio <= 1.5 ? 0 : betLevelRatio < 8 ? 1 : betLevelRatio < 22 ? 2 : betLevelRatio < 55 ? 3 : 4;

  // Total chips committed + behind, expressed in big blinds
  const effectiveStackBBs = Math.round((me.chips + me.bet) / state.bigBlindAmount);
  const isDeepStack = effectiveStackBBs > 100;

  // Equity adjusted for the tighter opponent range implied by the current bet level.
  // At betLevel 0-1 this equals the raw heads-up equity from the lookup table.
  const rangeEquityPct = preflopStrength
    ? calcRangeEquity(
        preflopStrength.tier, preflopStrength.equityVsRandom,
        betLevel, preflopStrength.isPair, preflopStrength.pairRank,
      )
    : 0;

  const postflopInfo = useMemo(() => {
    if (community.length < 3) return null;
    const known = [...myCards, ...community];
    const current = getBestHand(known);
    const knownSet = new Set(known.map(c => `${c.rank}${c.suit}`));
    const unseen = FULL_DECK.filter(c => !knownSet.has(`${c.rank}${c.suit}`));
    const maxBoardRank = Math.max(...community.map(c => RANK_VALUE[c.rank]));

    // Determine whether the player's hole cards actively form the primary rank of the hand
    // (not just acting as kickers). Required for accurate made-hand vs drawing-hand routing:
    //   PAIR / THREE_OF_A_KIND / FULL_HOUSE (trips part) / FOUR_OF_A_KIND → check tiebreaker[0]
    //   TWO_PAIR / FULL_HOUSE (pair part considered too) → check EITHER rank in tiebreaker
    //   STRAIGHT+ on flop/turn always require hole cards; river case caught by isPlayingBoard.
    const holeRankSet = new Set(myCards.map(c => RANK_VALUE[c.rank]));
    const holeContributes = (() => {
      if (current.rank < HandRank.PAIR) return false;
      if (current.rank >= HandRank.STRAIGHT) return true;
      if (current.rank === HandRank.TWO_PAIR || current.rank === HandRank.FULL_HOUSE)
        return holeRankSet.has(current.tiebreaker[0]) || holeRankSet.has(current.tiebreaker[1]);
      return holeRankSet.has(current.tiebreaker[0]);  // PAIR, THREE_OF_A_KIND, FOUR_OF_A_KIND
    })();

    let outs = 0, cleanOuts = 0;
    if (cardsToRiver > 0) {
      for (const card of unseen) {
        if (!isGenuineOut(myCards, community, card, current.rank)) continue;
        outs++;
        const improved = getBestHand([...known, card]);
        // Clean = two pair or better, OR top pair (paired rank ≥ highest board card).
        // Dirty = middle/bottom pair on a board with overcards — improves rank but
        // almost never wins since any opponent with a higher card dominates.
        if (
          improved.rank >= HandRank.TWO_PAIR ||
          (improved.rank === HandRank.PAIR && improved.tiebreaker[0] >= maxBoardRank)
        ) cleanOuts++;
      }
    }

    // Top pair: player's hole card pairs the highest board card.
    // Must verify hole card contribution — board = 5-5-3 has maxBoardRank 5 and the
    // pair rank is also 5, so the old check (tiebreaker[0] >= maxBoardRank) incorrectly
    // flagged T-7 here as top pair when the 5-5 comes entirely from the board.
    const isTopPair = current.rank === HandRank.PAIR
      && current.tiebreaker[0] >= maxBoardRank
      && holeContributes;

    // Detect "playing the board": hole cards contribute nothing beyond what the 5-card
    // board already provides. Win probability is 0% — only a split is possible.
    const isPlayingBoard = community.length === 5 && compareHands(current, getBestHand(community)) === 0;

    const maxHoleRank = Math.max(...myCards.map(c => RANK_VALUE[c.rank]));
    const handName = isPlayingBoard
      ? `${current.description} (playing the board)`
      : !holeContributes && current.rank >= HandRank.PAIR && current.rank < HandRank.STRAIGHT
        ? `${current.description} — board-made, ${RANK_CHAR[maxHoleRank]} kicker`
        : current.description;

    return { handName, outs, cleanOuts, currentRank: current.rank, isTopPair, isPlayingBoard, holeContributes };
  }, [myCards.map(c=>`${c.rank}${c.suit}`).join(','), community.map(c=>`${c.rank}${c.suit}`).join(',')]);

  const distribution = useMemo(() => {
    if (community.length < 3) return null;
    return getHandDistribution(myCards, community);
  }, [myCards.map(c=>`${c.rank}${c.suit}`).join(','), community.map(c=>`${c.rank}${c.suit}`).join(',')]);

  // Players still competing (not folded, not sitting out, not me)
  const numOpponents = state.players.filter(
    p => p.id !== state.myPlayerId && (p.status === 'active' || p.status === 'all-in'),
  ).length;

  // On the flop, Rule of 4 only applies when facing an all-in (guaranteed to see both
  // remaining cards). With chips behind, use Rule of 2 for the immediate street only.
  const isFacingAllIn = callAmount > 0 &&
    state.players.some(p => p.id !== state.myPlayerId && p.status === 'all-in');
  const equityMultiplier = cardsToRiver === 2 && isFacingAllIn ? 4 : 2;
  const equityRuleLabel = cardsToRiver === 2
    ? (isFacingAllIn ? 'Rule of 4 — all-in, 2 cards to come' : 'Rule of 2 — chips remain, 1 card at a time')
    : 'Rule of 2';

  const outs = postflopInfo?.outs ?? 0;
  const cleanOuts = postflopInfo?.cleanOuts ?? 0;
  const currentHandRank = postflopInfo?.currentRank ?? null;
  const isTopPair = postflopInfo?.isTopPair ?? false;
  const isPlayingBoard = postflopInfo?.isPlayingBoard ?? false;
  const holeContributes = postflopInfo?.holeContributes ?? true;

  // Made hands (two pair or better, or top pair) already have strong absolute equity;
  // counting outs to improve only measures upside, not the hand's current win probability.
  // Require hole-card contribution: a board pair (e.g. 5-5-3 with T-7 hole) is not a
  // made hand — the player is just playing a kicker and should use the outs formula.
  // Exclude "playing the board" separately (equity = 0%, only splits possible).
  const isMadeHand = !isPreflop && !isPlayingBoard && currentHandRank != null && holeContributes && (
    currentHandRank >= HandRank.TWO_PAIR || isTopPair
  );

  // 0 = flop (2 cards to come), 1 = turn, 2 = river
  const streetIdx = cardsToRiver === 2 ? 0 : cardsToRiver === 1 ? 1 : 2;

  // Base equity (1v1):
  //   Preflop  → range-adjusted equity (accounts for opponent range tightening at 3-bet+)
  //   Made hand → absolute hand-rank estimate (independent of outs)
  //   Draw     → clean outs × Rule-of-2/4 multiplier
  const baseEquityPct = isPreflop
    ? rangeEquityPct
    : isMadeHand
      ? (currentHandRank! >= HandRank.TWO_PAIR
          ? (MADE_HAND_BASE_EQUITY[currentHandRank!]?.[streetIdx] ?? 62)
          : TOP_PAIR_BASE_EQUITY[streetIdx])
      : cardsToRiver > 0
        ? Math.min(cleanOuts * equityMultiplier, 100)
        : 0;

  // Multiway adjustment:
  //   Preflop + made hands: calibrated per-opponent decay (hand correlation matters)
  //   Drawing hands: 2/(N+1) scaling suits outs-based probability
  const adjustedEquityPct = numOpponents <= 1
    ? baseEquityPct
    : isPreflop || isMadeHand
      ? Math.round(multiwayPreflopEquity(baseEquityPct / 100, numOpponents) * 100)
      : Math.round(baseEquityPct * (2 / (numOpponents + 1)));

  const handName = postflopInfo?.handName ?? null;

  const recommendation = getRecommendation(
    adjustedEquityPct, potOddsPct, callAmount, handName,
    preflopStrength?.tier ?? null, preflopStrength?.impliedOddsProfile ?? null, cardsToRiver,
    currentPot, me.bet, state.bigBlindAmount, state.minRaise, me.chips, state.currentBet,
    numOpponents, isMadeHand,
    betLevel, isDeepStack,
    preflopStrength?.isPair ?? false,
    preflopStrength?.pairRank ?? 0,
    preflopStrength?.hiCard ?? 0,
  );

  const phase = isPreflop ? 'preflop' : onRiver ? 'river' : cardsToRiver === 1 ? 'turn' : 'flop';
  const handContext = isPreflop ? (preflopStrength?.label ?? '') : (handName ?? '');

  const myIndex = state.players.findIndex(p => p.id === state.myPlayerId);
  const n = state.players.length;
  const relPos = (myIndex - state.dealerIndex + n) % n;
  const position = relPos === 0 ? 'button'
    : relPos === 1 ? 'small blind'
    : relPos === 2 ? 'big blind'
    : relPos === n - 1 && n > 3 ? 'late position'
    : relPos <= Math.ceil(n / 3) ? 'early position'
    : 'middle position';

  const explainUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `poker strategy why ${recommendation.action.toLowerCase()} ${handContext} ${phase} ${position}`.trim()
  )}`;

  return (
    <div className="odds-panel">
      <div className="odds-title">Odds Assistant</div>

      {/* ── Preflop strength ── */}
      {preflopStrength && (
        <div className="odds-section">
          <div className="odds-row">
            <span className="odds-label">Starting hand</span>
            <span className="odds-value">{preflopStrength.label}</span>
          </div>
          <div className="odds-row">
            <span className="odds-label">Strength</span>
            <span className="odds-value" style={{ color: TIER_COLOR[preflopStrength.tier] }}>
              {preflopStrength.tier}
            </span>
          </div>
          {betLevel >= 2 && (
            <div className="odds-row">
              <span className="odds-label">Action</span>
              <span className="odds-value" style={{ color: '#fbbf24' }}>
                Facing a {betLevel >= 4 ? '5-bet+' : betLevel === 3 ? '4-bet' : '3-bet'}
              </span>
            </div>
          )}
          <div className="odds-row">
            <span className="odds-label">Equity</span>
            <span className="odds-value">
              ~{pct(adjustedEquityPct)} vs {numOpponents} opponent{numOpponents !== 1 ? 's' : ''}
              {numOpponents > 1 && (
                <span className="odds-muted"> ({rangeEquityPct}% heads-up)</span>
              )}
            </span>
          </div>
          {betLevel >= 2 && (
            <div className="odds-row">
              <span className="odds-label" />
              <span className="odds-muted" style={{ fontSize: '0.72rem' }}>
                {BET_LEVEL_LABEL[Math.min(betLevel, 4)] ?? BET_LEVEL_LABEL[4]}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Postflop hand + outs ── */}
      {postflopInfo && (
        <div className="odds-section">
          <div className="odds-row">
            <span className="odds-label">Your hand</span>
            <span className="odds-value">{postflopInfo.handName}</span>
          </div>
          {!onRiver && (
            <>
              <div className="odds-row">
                <span className="odds-label">Outs</span>
                <span className="odds-value">
                  {outs} total
                  {outs > 0 && (
                    <span className="odds-muted">
                      {cleanOuts === outs
                        ? ' (all clean)'
                        : ` (${cleanOuts} clean, ${outs - cleanOuts} dirty)`}
                    </span>
                  )}
                </span>
              </div>
              <div className="odds-row">
                <span className="odds-label">Equity est.</span>
                <span className="odds-value">
                  ~{pct(adjustedEquityPct)} vs {numOpponents} opponent{numOpponents !== 1 ? 's' : ''}
                  {numOpponents > 1 && (
                    <span className="odds-muted"> ({pct(baseEquityPct)} heads-up)</span>
                  )}
                </span>
              </div>
              <div className="odds-row">
                <span className="odds-label" />
                <span className="odds-muted" style={{ fontSize: '0.72rem' }}>
                  {isMadeHand
                    ? 'Made hand — absolute strength estimate'
                    : `${cleanOuts} clean × ${equityMultiplier} — ${equityRuleLabel}`}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Pot odds ── */}
      {callAmount > 0 && (
        <div className="odds-section">
          <div className="odds-row">
            <span className="odds-label">Pot odds</span>
            <span className="odds-value">
              Call {fmtChips(callAmount)} into {fmtChips(potAfterCall)} → need {pct(potOddsPct)}
            </span>
          </div>
          {impliedChips > 0 && !onRiver && (
            <div className="odds-row">
              <span className="odds-label">Implied</span>
              <span className="odds-muted odds-value">Up to {fmtChips(impliedChips)} more at stake if you hit</span>
            </div>
          )}
        </div>
      )}

      {/* ── Recommendation ── */}
      <div className="odds-recommendation" style={{ borderColor: ACTION_COLOR[recommendation.action] }}>
        <span className="odds-action" style={{ color: ACTION_COLOR[recommendation.action] }}>
          {recommendation.action}
        </span>
        <span className="odds-reason">
          {recommendation.reason}{' '}
          <a
            href={explainUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="odds-explain-link"
            title="Opens a Google search in a new tab explaining this recommendation"
          >
            Why?
          </a>
        </span>
        {recommendation.raiseSuggestion && (
          <span className="odds-raise-suggestion">
            Suggested sizing: {fmtChips(recommendation.raiseSuggestion.min)}
            {recommendation.raiseSuggestion.min !== recommendation.raiseSuggestion.max &&
              `–${fmtChips(recommendation.raiseSuggestion.max)}`} chips
            <span className="odds-muted"> ({recommendation.raiseSuggestion.label})</span>
          </span>
        )}
      </div>

      {/* ── Hand distribution ── */}
      {distribution && distribution.length > 0 && (
        <div className="odds-section">
          <div className="odds-dist-title">
            {onRiver ? 'Final hand' : `Possible hands by river`}
          </div>
          {distribution.map(d => (
            <div key={d.rank} className="odds-dist-row">
              <span className="odds-dist-label">{d.rank}</span>
              <div className="odds-dist-bar-track">
                <div className="odds-dist-bar" style={{ width: `${d.pct}%` }} />
              </div>
              <span className="odds-dist-pct">{d.pct}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
