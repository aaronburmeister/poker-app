import { describe, it, expect } from 'vitest';
import { Deck } from '../Deck';

describe('Deck', () => {
  it('contains exactly 52 cards', () => {
    const deck = new Deck();
    expect(deck.remaining).toBe(52);
  });

  it('deals all 52 unique cards with no duplicates', () => {
    const deck = new Deck();
    const dealt = Array.from({ length: 52 }, () => deck.deal());
    const keys = dealt.map(c => `${c.rank}${c.suit}`);
    expect(new Set(keys).size).toBe(52);
  });

  it('reduces remaining count on each deal', () => {
    const deck = new Deck();
    deck.deal();
    deck.deal();
    expect(deck.remaining).toBe(50);
  });

  it('throws when dealt from an empty deck', () => {
    const deck = new Deck();
    for (let i = 0; i < 52; i++) deck.deal();
    expect(() => deck.deal()).toThrow();
  });

  it('produces all four suits', () => {
    const deck = new Deck();
    const suits = new Set(Array.from({ length: 52 }, () => deck.deal()).map(c => c.suit));
    expect(suits).toEqual(new Set(['hearts', 'diamonds', 'clubs', 'spades']));
  });

  it('produces all 13 ranks', () => {
    const deck = new Deck();
    const ranks = new Set(Array.from({ length: 52 }, () => deck.deal()).map(c => c.rank));
    expect(ranks).toEqual(new Set(['2','3','4','5','6','7','8','9','T','J','Q','K','A']));
  });
});
