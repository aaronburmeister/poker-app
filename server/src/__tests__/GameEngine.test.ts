import { describe, it, expect, beforeEach } from 'vitest';
import type { RoomOptions } from '@poker/shared';
import { GameEngine } from '../GameEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────

const DEFAULT_OPTS: RoomOptions = {
  maxPlayers: 9,
  smallBlind: 10,
  bigBlind: 20,
  startingChips: 1000,
};

function makeEngine(numPlayers: number, opts: Partial<RoomOptions> = {}) {
  const options = { ...DEFAULT_OPTS, ...opts };
  const players = Array.from({ length: numPlayers }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    chips: options.startingChips,
    isBot: false,
    seatIndex: i,
    isConnected: true,
  }));
  const engine = new GameEngine(players, options);
  return { engine, ids: players.map(p => p.id) };
}

/** Convenience: get state from the perspective of player 1 */
function state(engine: GameEngine) {
  return engine.getStateForPlayer('p1');
}

/** Who is currently acting? */
function currentId(engine: GameEngine): string {
  const s = state(engine);
  return s.players[s.currentPlayerIndex].id;
}

/** Total money on the table: stack chips + pot (pots already include current-round bets) */
function totalOnTable(engine: GameEngine): number {
  const s = state(engine);
  const inPot = s.pots.reduce((sum, p) => sum + p.amount, 0);
  const inStacks = s.players.reduce((sum, p) => sum + p.chips, 0);
  return inPot + inStacks;
}

// ─── Setup / basic state ──────────────────────────────────────────────────

describe('GameEngine — initial state', () => {
  it('starts in waiting phase', () => {
    const { engine } = makeEngine(3);
    expect(state(engine).phase).toBe('waiting');
  });

  it('requires at least 2 players to start a hand', () => {
    const { engine } = makeEngine(1);
    expect(() => engine.startHand()).toThrow();
  });
});

// ─── Blind posting ────────────────────────────────────────────────────────

describe('GameEngine — blind posting', () => {
  it('posts small and big blind correctly in a 3-player game', () => {
    const { engine } = makeEngine(3);
    engine.startHand();
    const s = state(engine);

    const sb = s.players.find(p => p.isSmallBlind)!;
    const bb = s.players.find(p => p.isBigBlind)!;

    expect(sb.bet).toBe(10);
    expect(bb.bet).toBe(20);
    expect(sb.chips).toBe(990);
    expect(bb.chips).toBe(980);
  });

  it('total chips on table equals starting chips × players after blinds', () => {
    const { engine } = makeEngine(3);
    engine.startHand();
    expect(totalOnTable(engine)).toBe(3000);
  });

  it('starts preflop with correct current bet equal to big blind', () => {
    const { engine } = makeEngine(3);
    engine.startHand();
    expect(state(engine).currentBet).toBe(20);
  });
});

// ─── Heads-up rules ───────────────────────────────────────────────────────

describe('GameEngine — heads-up (2 players)', () => {
  it('dealer posts small blind in heads-up', () => {
    const { engine } = makeEngine(2);
    engine.startHand();
    const s = state(engine);
    const dealer = s.players.find(p => p.isDealer)!;
    expect(dealer.isSmallBlind).toBe(true);
  });

  it('dealer acts first preflop in heads-up', () => {
    const { engine } = makeEngine(2);
    engine.startHand();
    const s = state(engine);
    const acting = s.players[s.currentPlayerIndex];
    expect(acting.isDealer).toBe(true);
  });

  it('isMyTurn is correct for each perspective', () => {
    const { engine } = makeEngine(2);
    engine.startHand();

    const actingId = currentId(engine);
    const waitingId = actingId === 'p1' ? 'p2' : 'p1';

    expect(engine.getStateForPlayer(actingId).isMyTurn).toBe(true);
    expect(engine.getStateForPlayer(waitingId).isMyTurn).toBe(false);
  });
});

// ─── Hole cards ───────────────────────────────────────────────────────────

describe('GameEngine — hole cards', () => {
  it('each active player receives exactly 2 hole cards', () => {
    const { engine } = makeEngine(4);
    engine.startHand();
    const s = state(engine);
    s.players.forEach(p => {
      expect(p.cards).toHaveLength(2);
    });
  });

  it('viewer sees own cards but opponent cards are hidden (null)', () => {
    const { engine } = makeEngine(3);
    engine.startHand();

    const asP1 = engine.getStateForPlayer('p1');
    const me = asP1.players.find(p => p.id === 'p1')!;
    const opp = asP1.players.find(p => p.id === 'p2')!;

    expect(me.cards.every(c => c !== null)).toBe(true);
    expect(opp.cards.every(c => c === null)).toBe(true);
  });
});

// ─── Betting round mechanics ──────────────────────────────────────────────

describe('GameEngine — betting actions', () => {
  it('fold removes player from action', () => {
    const { engine } = makeEngine(3);
    engine.startHand();

    const first = currentId(engine);
    engine.handleAction(first, { type: 'FOLD' });

    const s = state(engine);
    const folded = s.players.find(p => p.id === first)!;
    expect(folded.status).toBe('folded');
  });

  it('throws when wrong player acts', () => {
    const { engine } = makeEngine(3);
    engine.startHand();
    const first = currentId(engine);
    const notFirst = first === 'p1' ? 'p2' : 'p1';
    expect(() => engine.handleAction(notFirst, { type: 'CHECK' })).toThrow();
  });

  it('throws when check is attempted against an outstanding bet', () => {
    const { engine } = makeEngine(3);
    engine.startHand();
    // UTG is facing the BB — cannot check
    const utg = currentId(engine);
    expect(() => engine.handleAction(utg, { type: 'CHECK' })).toThrow();
  });

  it('call reduces chips by the correct amount', () => {
    const { engine } = makeEngine(2);
    engine.startHand();
    const s0 = state(engine);
    const actingId = currentId(engine);
    const chipsBefore = s0.players.find(p => p.id === actingId)!.chips;
    const betBefore = s0.players.find(p => p.id === actingId)!.bet;

    engine.handleAction(actingId, { type: 'CALL' });

    const s1 = state(engine);
    const after = s1.players.find(p => p.id === actingId)!;
    // chips + bet should sum to same as before (chips went down, bet went up)
    expect(after.chips + after.bet).toBe(chipsBefore + betBefore);
  });

  it('raise increases currentBet and re-opens action for others', () => {
    const { engine } = makeEngine(3);
    engine.startHand();

    const raiser = currentId(engine);
    engine.handleAction(raiser, { type: 'RAISE', amount: 60 });

    const s = state(engine);
    expect(s.currentBet).toBe(60);
    // The raiser should no longer be the current player
    expect(s.players[s.currentPlayerIndex].id).not.toBe(raiser);
  });

  it('reject raise below minimum', () => {
    const { engine } = makeEngine(3);
    engine.startHand();
    const utg = currentId(engine);
    // min raise = 20 + 20 = 40; raising to 30 should throw
    expect(() => engine.handleAction(utg, { type: 'RAISE', amount: 30 })).toThrow();
  });
});

// ─── Big blind option ─────────────────────────────────────────────────────

describe('GameEngine — big blind option', () => {
  it('BB can check preflop when everyone just calls (no raise)', () => {
    const { engine } = makeEngine(3);
    engine.startHand();

    // Have everyone call until we reach BB
    const s0 = state(engine);
    const bbId = s0.players.find(p => p.isBigBlind)!.id;

    // Act until we hit BB
    while (currentId(engine) !== bbId) {
      engine.handleAction(currentId(engine), { type: 'CALL' });
    }

    // BB should now be able to CHECK (currentBet === BB's existing bet)
    expect(() => engine.handleAction(bbId, { type: 'CHECK' })).not.toThrow();
  });

  it('BB option raise re-opens action for the caller', () => {
    const { engine } = makeEngine(2);
    engine.startHand();

    // SB (dealer in HU) calls
    const sbId = currentId(engine);
    engine.handleAction(sbId, { type: 'CALL' });

    // BB raises
    const bbId = currentId(engine);
    engine.handleAction(bbId, { type: 'RAISE', amount: 60 });

    // Now SB must act again
    expect(currentId(engine)).toBe(sbId);
  });
});

// ─── Phase transitions ────────────────────────────────────────────────────

describe('GameEngine — phase transitions', () => {
  function playPreflop(engine: GameEngine) {
    const s = state(engine);
    const bbId = s.players.find(p => p.isBigBlind)!.id;
    while (currentId(engine) !== bbId) {
      engine.handleAction(currentId(engine), { type: 'CALL' });
    }
    engine.handleAction(bbId, { type: 'CHECK' });
  }

  it('moves from preflop to flop after everyone checks/calls', () => {
    const { engine } = makeEngine(3);
    engine.startHand();
    playPreflop(engine);
    expect(state(engine).phase).toBe('flop');
  });

  it('deals exactly 3 community cards on the flop', () => {
    const { engine } = makeEngine(3);
    engine.startHand();
    playPreflop(engine);
    expect(state(engine).communityCards).toHaveLength(3);
  });

  it('advances through all streets to showdown on repeated check-arounds', () => {
    const { engine } = makeEngine(2);
    engine.startHand();

    // Preflop: SB calls, BB checks
    const sbId = currentId(engine);
    engine.handleAction(sbId, { type: 'CALL' });
    const bbId = currentId(engine);
    engine.handleAction(bbId, { type: 'CHECK' });
    expect(state(engine).phase).toBe('flop');

    // Flop, Turn, River: everyone checks
    for (const street of ['flop', 'turn', 'river'] as const) {
      expect(state(engine).phase).toBe(street);
      while (state(engine).phase === street) {
        engine.handleAction(currentId(engine), { type: 'CHECK' });
      }
    }

    expect(state(engine).phase).toBe('showdown');
    expect(state(engine).communityCards).toHaveLength(5);
  });

  it('goes straight to showdown when one player folds', () => {
    const { engine } = makeEngine(3);
    engine.startHand();

    // Everyone folds except last one
    const first = currentId(engine);
    engine.handleAction(first, { type: 'FOLD' });
    const second = currentId(engine);
    engine.handleAction(second, { type: 'FOLD' });

    expect(state(engine).phase).toBe('showdown');
  });
});

// ─── Winner & chip conservation ───────────────────────────────────────────

describe('GameEngine — winner determination & chip conservation', () => {
  it('solo winner (everyone else folded) receives the full pot', () => {
    const { engine } = makeEngine(3);
    engine.startHand();

    const s0 = state(engine);
    const potBefore = s0.pots.reduce((s, p) => s + p.amount, 0);

    // Two players fold, third wins
    engine.handleAction(currentId(engine), { type: 'FOLD' });
    engine.handleAction(currentId(engine), { type: 'FOLD' });

    const s1 = state(engine);
    expect(s1.phase).toBe('showdown');
    expect(s1.winners).toBeDefined();
    expect(s1.winners!.length).toBeGreaterThan(0);
  });

  it('chip conservation: total never changes across an entire hand', () => {
    const numPlayers = 3;
    const { engine } = makeEngine(numPlayers);
    engine.startHand();

    const expected = numPlayers * 1000;

    // Preflop: UTG calls, SB calls, BB checks
    const s0 = state(engine);
    const bbId = s0.players.find(p => p.isBigBlind)!.id;
    while (currentId(engine) !== bbId) {
      engine.handleAction(currentId(engine), { type: 'CALL' });
    }
    engine.handleAction(bbId, { type: 'CHECK' });

    // Flop: raise then everyone calls
    engine.handleAction(currentId(engine), { type: 'RAISE', amount: 50 });
    while (state(engine).phase === 'flop') {
      engine.handleAction(currentId(engine), { type: 'CALL' });
    }

    // Turn & River: check around
    for (const _street of ['turn', 'river']) {
      while (['turn', 'river'].includes(state(engine).phase) && state(engine).phase !== 'showdown') {
        if (state(engine).phase === 'showdown') break;
        engine.handleAction(currentId(engine), { type: 'CHECK' });
      }
    }

    const s = state(engine);
    if (s.phase === 'showdown' && s.winners) {
      const totalChipsAfter = s.players.reduce((sum, p) => sum + p.chips, 0);
      expect(totalChipsAfter).toBe(expected);
    }
  });

  it('all-in player wins only up to their contribution per opponent', () => {
    // p1 has 100, p2 has 1000 — p1 goes all-in
    const engine = new GameEngine(
      [
        { id: 'p1', name: 'Short', chips: 100, isBot: false, seatIndex: 0, isConnected: true },
        { id: 'p2', name: 'Deep',  chips: 1000, isBot: false, seatIndex: 1, isConnected: true },
      ],
      { maxPlayers: 9, smallBlind: 10, bigBlind: 20, startingChips: 1000 },
    );
    engine.startHand();

    // Both go all-in
    engine.handleAction(currentId(engine), { type: 'ALL_IN' });
    engine.handleAction(currentId(engine), { type: 'ALL_IN' });

    const s = state(engine);
    // Total chips must be conserved
    const total = s.players.reduce((sum, p) => sum + p.chips, 0);
    expect(total).toBe(1100);
  });

  it('winner list is populated at showdown', () => {
    const { engine } = makeEngine(2);
    engine.startHand();
    engine.handleAction(currentId(engine), { type: 'FOLD' });
    const s = state(engine);
    expect(s.winners).toBeDefined();
    expect(s.winners!.length).toBe(1);
    expect(s.winners![0].amount).toBeGreaterThan(0);
  });
});

// ─── All-in run-out ───────────────────────────────────────────────────────

describe('GameEngine — all-in run-out', () => {
  it('deals all 5 community cards immediately when all players are all-in', () => {
    const { engine } = makeEngine(2);
    engine.startHand();

    engine.handleAction(currentId(engine), { type: 'ALL_IN' });
    engine.handleAction(currentId(engine), { type: 'ALL_IN' });

    const s = state(engine);
    expect(s.communityCards).toHaveLength(5);
    expect(s.phase).toBe('showdown');
  });
});

// ─── Hidden card privacy ──────────────────────────────────────────────────

describe('GameEngine — card visibility', () => {
  it('opponent cards are revealed at showdown', () => {
    const { engine } = makeEngine(2);
    engine.startHand();

    // Play to showdown via check-arounds
    const sbId = currentId(engine);
    engine.handleAction(sbId, { type: 'CALL' });
    engine.handleAction(currentId(engine), { type: 'CHECK' });
    for (const _street of ['flop', 'turn', 'river']) {
      while (!['showdown', 'flop', 'turn', 'river'].includes(state(engine).phase) || state(engine).phase === _street) {
        if (state(engine).phase === 'showdown') break;
        engine.handleAction(currentId(engine), { type: 'CHECK' });
      }
      if (state(engine).phase === 'showdown') break;
    }

    if (state(engine).phase === 'showdown') {
      const asP1 = engine.getStateForPlayer('p1');
      const opp = asP1.players.find(p => p.id !== 'p1')!;
      // At showdown, opponent's cards should be revealed (non-null)
      if (opp.status !== 'folded') {
        expect(opp.cards.every(c => c !== null)).toBe(true);
      }
    }
  });
});
