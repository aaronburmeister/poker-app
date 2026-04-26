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

// ── Preflop strength ─────────────────────────────────────────────────────────

type PreflopTier = 'Premium' | 'Strong' | 'Playable' | 'Speculative' | 'Weak';

interface PreflopStrength {
  tier: PreflopTier;
  label: string;       // e.g. "AKs", "Pocket Jacks"
  equityVsRandom: number; // rough %
}

function getPreflopStrength(cards: Card[]): PreflopStrength {
  if (cards.length < 2) return { tier: 'Weak', label: '—', equityVsRandom: 0 };
  const [a, b] = cards;
  const v1 = RANK_VALUE[a.rank], v2 = RANK_VALUE[b.rank];
  const hi = Math.max(v1, v2), lo = Math.min(v1, v2);
  const suited = a.suit === b.suit;
  const isPair = hi === lo;
  const gap = hi - lo;
  const s = suited ? 's' : 'o';
  const RANK_NAME: Record<number,string> = {14:'A',13:'K',12:'Q',11:'J',10:'T',9:'9',8:'8',7:'7',6:'6',5:'5',4:'4',3:'3',2:'2'};
  const label = isPair
    ? `Pocket ${RANK_NAME[hi]}s`
    : `${RANK_NAME[hi]}${RANK_NAME[lo]}${s}`;

  if (isPair) {
    if (hi >= 14) return { tier: 'Premium',     label, equityVsRandom: 85 };
    if (hi >= 12) return { tier: 'Premium',     label, equityVsRandom: hi === 13 ? 82 : 79 };
    if (hi >= 10) return { tier: 'Strong',      label, equityVsRandom: hi === 11 ? 77 : 75 };
    if (hi >= 7)  return { tier: 'Playable',    label, equityVsRandom: 62 };
    return               { tier: 'Speculative', label, equityVsRandom: 56 };
  }

  // Ace-high
  if (hi === 14) {
    if (lo === 13) return { tier: 'Premium',  label, equityVsRandom: suited ? 67 : 65 };
    if (lo >= 11)  return { tier: 'Strong',   label, equityVsRandom: suited ? 65 : 63 };
    if (lo === 10) return { tier: 'Strong',   label, equityVsRandom: suited ? 64 : 60 };
    if (lo >= 7)   return { tier: 'Playable', label, equityVsRandom: suited ? 61 : 57 };
    return               { tier: suited ? 'Speculative' : 'Weak', label, equityVsRandom: suited ? 58 : 53 };
  }

  // King-high
  if (hi === 13) {
    if (lo === 12) return { tier: suited ? 'Strong' : 'Playable', label, equityVsRandom: suited ? 63 : 60 };
    if (lo >= 10)  return { tier: suited ? 'Playable' : 'Speculative', label, equityVsRandom: suited ? 60 : 56 };
    return               { tier: suited ? 'Speculative' : 'Weak', label, equityVsRandom: suited ? 56 : 50 };
  }

  // Connected / semi-connected suited
  if (gap <= 2 && suited && hi >= 9) return { tier: 'Playable',    label, equityVsRandom: 56 };
  if (gap <= 1 && suited)            return { tier: 'Speculative', label, equityVsRandom: 52 };
  if (gap <= 2 && hi >= 11)          return { tier: 'Playable',    label, equityVsRandom: 54 };

  return { tier: 'Weak', label, equityVsRandom: suited ? 50 : 46 };
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
 * Returns true only if newCard genuinely helps the player's own hand,
 * not just because it pairs a board card that anyone could use.
 *
 * Turn (4 community): compare hole+board+new vs board+new directly (5 cards).
 * Flop (3 community): board-only is 4 cards, so use targeted heuristics instead.
 */
function isGenuineOut(holeCards: Card[], community: Card[], newCard: Card, currentRank: number): boolean {
  const improved = getBestHand([...holeCards, ...community, newCard]);
  if (improved.rank <= currentRank) return false;

  if (community.length === 4) {
    // Turn: board + new = exactly 5 cards — direct comparison possible
    const boardOnly = getBestHand([...community, newCard]);
    return compareHands(improved, boardOnly) > 0;
  }

  // Flop heuristics: check whether a hole card is the reason for the improvement

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
    if (equityPct >= 65) {
      return { min: twoThird, max: fullPot,  label: '2/3 to full pot (value bet)' };
    }
    return               { min: halfPot,  max: twoThird, label: '1/2 to 2/3 pot (semi-bluff sizing)' };
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
  cardsToRiver: number,
  currentPot: number,
  myBet: number,
  bigBlind: number,
  minRaise: number,
  myChips: number,
  currentBet: number,
): Recommendation {
  const facingBet = callAmount > 0;
  const edge = equityPct - potOddsPct;
  const isPreflop = cardsToRiver === 2 && !handName;

  function withRaise(action: 'RAISE' | 'BET', reason: string): Recommendation {
    return {
      action,
      reason,
      raiseSuggestion: calcRaiseSuggestion(
        currentPot, callAmount, myBet, bigBlind, minRaise, myChips, isPreflop, currentBet, equityPct,
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
    if (preflopTier === 'Premium')
      return withRaise('RAISE', 'Premium hand — maximize value before the flop.');
    if (preflopTier === 'Strong')
      return { action: 'CALL', reason: 'Strong hand — worth calling most raises.' };
    if (preflopTier === 'Playable' || preflopTier === 'Speculative')
      return { action: 'CALL', reason: 'Decent hand — calling is reasonable, but be cautious against large raises.' };
    return { action: 'FOLD', reason: 'Weak hand — not worth calling without pot odds.' };
  }

  if (!facingBet) {
    if (equityPct >= 65)
      return withRaise('BET', 'Strong hand — bet to build the pot and charge draws.');
    if (equityPct >= 40)
      return { action: 'CHECK', reason: 'Moderate hand — check to control the pot size.' };
    return { action: 'CHECK', reason: 'Weak hand — check and reassess on the next card.' };
  }

  if (edge >= 20)
    return withRaise('RAISE', `Your equity (${Math.round(equityPct)}%) strongly exceeds pot odds — raise to charge drawing hands.`);
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

  const postflopInfo = useMemo(() => {
    if (community.length < 3) return null;
    const known = [...myCards, ...community];
    const current = getBestHand(known);
    const knownSet = new Set(known.map(c => `${c.rank}${c.suit}`));
    const unseen = FULL_DECK.filter(c => !knownSet.has(`${c.rank}${c.suit}`));
    const outs = cardsToRiver > 0
      ? unseen.filter(card => isGenuineOut(myCards, community, card, current.rank)).length
      : 0;
    return { handName: current.description, outs };
  }, [myCards.map(c=>`${c.rank}${c.suit}`).join(','), community.map(c=>`${c.rank}${c.suit}`).join(',')]);

  const distribution = useMemo(() => {
    if (community.length < 3) return null;
    return getHandDistribution(myCards, community);
  }, [myCards.map(c=>`${c.rank}${c.suit}`).join(','), community.map(c=>`${c.rank}${c.suit}`).join(',')]);

  // On the flop, Rule of 4 only applies when facing an all-in (guaranteed to see both
  // remaining cards). With chips behind, use Rule of 2 for the immediate street only.
  const isFacingAllIn = callAmount > 0 &&
    state.players.some(p => p.id !== state.myPlayerId && p.status === 'all-in');
  const equityMultiplier = cardsToRiver === 2 && isFacingAllIn ? 4 : 2;
  const equityRuleLabel = cardsToRiver === 2
    ? (isFacingAllIn ? 'Rule of 4 — all-in, 2 cards to come' : 'Rule of 2 — chips remain, 1 card at a time')
    : 'Rule of 2';

  const outs = postflopInfo?.outs ?? 0;
  const equityPct = cardsToRiver > 0
    ? Math.min(outs * equityMultiplier, 100)
    : (preflopStrength?.equityVsRandom ?? 0);
  const handName = postflopInfo?.handName ?? null;

  const recommendation = getRecommendation(
    equityPct, potOddsPct, callAmount, handName,
    preflopStrength?.tier ?? null, cardsToRiver,
    currentPot, me.bet, state.bigBlindAmount, state.minRaise, me.chips, state.currentBet,
  );

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
              <span className="odds-muted"> (~{preflopStrength.equityVsRandom}% vs random hand)</span>
            </span>
          </div>
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
                <span className="odds-value">{outs} cards improve your hand</span>
              </div>
              <div className="odds-row">
                <span className="odds-label">Equity est.</span>
                <span className="odds-value">
                  ~{pct(equityPct)}
                  <span className="odds-muted"> ({outs} × {equityMultiplier} — {equityRuleLabel})</span>
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
        <span className="odds-reason">{recommendation.reason}</span>
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
