import { describe, it, expect } from 'vitest';
import type { Card } from '@poker/shared';
import { getBestHand, compareHands } from '../HandEvaluator';

const c = (rank: string, suit: string): Card => ({ rank: rank as Card['rank'], suit: suit as Card['suit'] });

// ─── Hand-type detection ───────────────────────────────────────────────────

describe('getBestHand — hand type detection', () => {
  it('identifies a Royal Flush', () => {
    const cards = [c('A','spades'), c('K','spades'), c('Q','spades'), c('J','spades'), c('T','spades'), c('2','hearts'), c('3','hearts')];
    const result = getBestHand(cards);
    expect(result.description).toBe('Royal Flush');
  });

  it('identifies a Straight Flush', () => {
    const cards = [c('9','clubs'), c('8','clubs'), c('7','clubs'), c('6','clubs'), c('5','clubs'), c('A','hearts'), c('K','hearts')];
    const result = getBestHand(cards);
    expect(result.description).toContain('Straight Flush');
    expect(result.description).toContain('9');
  });

  it('identifies Four of a Kind', () => {
    const cards = [c('A','spades'), c('A','hearts'), c('A','clubs'), c('A','diamonds'), c('K','spades'), c('2','hearts'), c('3','clubs')];
    const result = getBestHand(cards);
    expect(result.description).toContain('Four of a Kind');
    expect(result.description).toContain('Ace');
  });

  it('identifies a Full House', () => {
    const cards = [c('K','spades'), c('K','hearts'), c('K','clubs'), c('Q','hearts'), c('Q','diamonds'), c('2','spades'), c('3','clubs')];
    const result = getBestHand(cards);
    expect(result.description).toContain('Full House');
    expect(result.description).toContain('King');
  });

  it('identifies a Flush (non-straight)', () => {
    // A K Q J 9 of spades — has a gap at J-9, not a straight
    const cards = [c('A','spades'), c('K','spades'), c('Q','spades'), c('J','spades'), c('9','spades'), c('2','hearts'), c('3','clubs')];
    const result = getBestHand(cards);
    expect(result.description).toContain('Flush');
    expect(result.description).not.toContain('Straight');
  });

  it('identifies a Straight (Broadway)', () => {
    const cards = [c('A','spades'), c('K','hearts'), c('Q','clubs'), c('J','diamonds'), c('T','spades'), c('2','hearts'), c('3','clubs')];
    const result = getBestHand(cards);
    expect(result.description).toContain('Straight');
    expect(result.description).toContain('Ace');
  });

  it('identifies an Ace-low Straight (wheel: A-2-3-4-5)', () => {
    const cards = [c('A','spades'), c('2','hearts'), c('3','clubs'), c('4','diamonds'), c('5','spades'), c('K','hearts'), c('Q','clubs')];
    const result = getBestHand(cards);
    expect(result.description).toContain('Straight');
    expect(result.description).toContain('5'); // high card of wheel is 5
    expect(result.description).not.toContain('Ace'); // ace is not the high card
  });

  it('identifies Three of a Kind', () => {
    const cards = [c('Q','spades'), c('Q','hearts'), c('Q','clubs'), c('A','diamonds'), c('K','spades'), c('2','hearts'), c('3','clubs')];
    const result = getBestHand(cards);
    expect(result.description).toContain('Three of a Kind');
    expect(result.description).toContain('Queen');
  });

  it('identifies Two Pair', () => {
    const cards = [c('A','spades'), c('A','hearts'), c('K','clubs'), c('K','diamonds'), c('Q','spades'), c('2','hearts'), c('3','clubs')];
    const result = getBestHand(cards);
    expect(result.description).toContain('Two Pair');
    expect(result.description).toContain('Ace');
    expect(result.description).toContain('King');
  });

  it('identifies a Pair', () => {
    const cards = [c('A','spades'), c('A','hearts'), c('K','clubs'), c('Q','diamonds'), c('J','spades'), c('2','hearts'), c('3','clubs')];
    const result = getBestHand(cards);
    expect(result.description).toContain('Pair of Aces');
  });

  it('identifies High Card', () => {
    const cards = [c('A','spades'), c('K','hearts'), c('Q','clubs'), c('J','diamonds'), c('9','spades'), c('2','hearts'), c('3','clubs')];
    const result = getBestHand(cards);
    expect(result.description).toContain('High Card');
    expect(result.description).toContain('Ace');
  });

  it('returns exactly 5 best cards', () => {
    const cards = [c('A','spades'), c('K','hearts'), c('Q','clubs'), c('J','diamonds'), c('9','spades'), c('2','hearts'), c('3','clubs')];
    expect(getBestHand(cards).bestCards).toHaveLength(5);
  });
});

// ─── Best-hand selection from 7 cards ─────────────────────────────────────

describe('getBestHand — picks best 5 from 7', () => {
  it('picks flush over a pair when both are possible', () => {
    // 5 spades + a pair of aces; flush should win
    const cards = [
      c('A','spades'), c('A','hearts'),
      c('K','spades'), c('Q','spades'), c('J','spades'), c('9','spades'), c('2','clubs'),
    ];
    const result = getBestHand(cards);
    expect(result.description).toContain('Flush');
  });

  it('picks straight flush over a lesser straight', () => {
    const cards = [
      c('9','hearts'), c('8','hearts'), c('7','hearts'), c('6','hearts'), c('5','hearts'),
      c('T','spades'), c('J','clubs'),
    ];
    const result = getBestHand(cards);
    expect(result.description).toContain('Straight Flush');
  });

  it('uses community cards to form the best hand', () => {
    // hole: 2♠ 3♠  board: 4♠ 5♠ 6♠ K♥ Q♦  → straight flush 2-6
    const cards = [
      c('2','spades'), c('3','spades'),
      c('4','spades'), c('5','spades'), c('6','spades'),
      c('K','hearts'), c('Q','diamonds'),
    ];
    const result = getBestHand(cards);
    expect(result.description).toContain('Straight Flush');
  });
});

// ─── compareHands ─────────────────────────────────────────────────────────

describe('compareHands', () => {
  it('higher hand rank wins', () => {
    const flush = getBestHand([c('A','spades'), c('K','spades'), c('Q','spades'), c('J','spades'), c('9','spades'), c('2','hearts'), c('3','clubs')]);
    const straight = getBestHand([c('A','spades'), c('K','hearts'), c('Q','clubs'), c('J','diamonds'), c('T','spades'), c('2','hearts'), c('4','clubs')]);
    expect(compareHands(flush, straight)).toBeGreaterThan(0);
  });

  it('same hand rank — higher kicker wins', () => {
    // Both have pair of aces, different kickers (K vs Q)
    const pairAcesKicker_K = getBestHand([c('A','spades'), c('A','hearts'), c('K','clubs'), c('3','diamonds'), c('2','spades'), c('7','hearts'), c('8','clubs')]);
    const pairAcesKicker_Q = getBestHand([c('A','clubs'), c('A','diamonds'), c('Q','clubs'), c('3','hearts'), c('2','clubs'), c('7','spades'), c('8','diamonds')]);
    expect(compareHands(pairAcesKicker_K, pairAcesKicker_Q)).toBeGreaterThan(0);
  });

  it('same hand rank — higher straight wins', () => {
    const straightQ = getBestHand([c('Q','spades'), c('J','hearts'), c('T','clubs'), c('9','diamonds'), c('8','spades'), c('2','hearts'), c('3','clubs')]);
    const straightK = getBestHand([c('K','spades'), c('Q','hearts'), c('J','clubs'), c('T','diamonds'), c('9','spades'), c('2','hearts'), c('3','clubs')]);
    expect(compareHands(straightK, straightQ)).toBeGreaterThan(0);
  });

  it('identical hands return 0 (chop)', () => {
    // Both players share the same board five cards as their best hand
    const hand1 = getBestHand([c('A','spades'), c('K','hearts'), c('Q','clubs'), c('J','diamonds'), c('9','spades'), c('2','hearts'), c('3','clubs')]);
    const hand2 = getBestHand([c('A','hearts'), c('K','clubs'), c('Q','diamonds'), c('J','spades'), c('9','clubs'), c('2','spades'), c('3','diamonds')]);
    expect(compareHands(hand1, hand2)).toBe(0);
  });

  it('four of a kind beats a full house', () => {
    const quads = getBestHand([c('A','spades'), c('A','hearts'), c('A','clubs'), c('A','diamonds'), c('K','spades'), c('2','hearts'), c('3','clubs')]);
    const boat  = getBestHand([c('K','spades'), c('K','hearts'), c('K','clubs'), c('Q','diamonds'), c('Q','spades'), c('2','hearts'), c('3','clubs')]);
    expect(compareHands(quads, boat)).toBeGreaterThan(0);
  });

  it('ace-low straight loses to a six-high straight', () => {
    const wheel  = getBestHand([c('A','spades'), c('2','hearts'), c('3','clubs'), c('4','diamonds'), c('5','spades'), c('K','hearts'), c('Q','clubs')]);
    const sixHi  = getBestHand([c('6','spades'), c('5','hearts'), c('4','clubs'), c('3','diamonds'), c('2','spades'), c('K','hearts'), c('Q','clubs')]);
    expect(compareHands(sixHi, wheel)).toBeGreaterThan(0);
  });

  it('requires at least 5 cards', () => {
    expect(() => getBestHand([c('A','spades'), c('K','hearts'), c('Q','clubs'), c('J','diamonds')])).toThrow();
  });
});
