import type {
  Card, GamePhase, GameState, HandLogEntry, PlayerAction,
  PlayerState, PlayerStatus, PotInfo, RoomOptions, ShowdownHandInfo, WinnerInfo,
} from '@poker/shared';
import { Deck } from './Deck';
import { getBestHand, compareHands } from './HandEvaluator';

interface InternalPlayer {
  id: string;
  name: string;
  chips: number;
  holeCards: Card[];
  bet: number;
  totalBetThisHand: number;
  status: PlayerStatus;
  isBot: boolean;
  seatIndex: number;
  isConnected: boolean;
}

export class GameEngine {
  private players: InternalPlayer[];
  private deck: Deck;
  private communityCards: Card[];
  private phase: GamePhase;
  private dealerIndex: number;
  private smallBlindIndex: number;
  private bigBlindIndex: number;
  private currentPlayerIndex: number;
  private playersToAct: Set<string>;
  private currentBet: number;
  private lastRaiseSize: number;
  private readonly smallBlindAmount: number;
  private readonly bigBlindAmount: number;
  private handNumber: number;
  private winners: WinnerInfo[] | undefined;
  private lastAction: GameState['lastAction'];
  private roundActions: Map<string, NonNullable<GameState['lastAction']>>;
  private handLog: HandLogEntry[];
  private showdownHands: Map<string, ShowdownHandInfo>;
  private eliminatedThisHand: string[];

  constructor(
    players: Pick<InternalPlayer, 'id' | 'name' | 'chips' | 'isBot' | 'seatIndex' | 'isConnected'>[],
    options: RoomOptions,
    startingHandNumber = 0,
    startingDealerPlayerId?: string,
  ) {
    this.players = players.map(p => ({
      ...p,
      holeCards: [],
      bet: 0,
      totalBetThisHand: 0,
      status: 'sitting-out',
    }));
    this.deck = new Deck();
    this.communityCards = [];
    this.phase = 'waiting';
    this.dealerIndex = 0;
    this.smallBlindIndex = 0;
    this.bigBlindIndex = 0;
    this.currentPlayerIndex = 0;
    this.playersToAct = new Set();
    this.currentBet = 0;
    this.lastRaiseSize = options.bigBlind;
    this.smallBlindAmount = options.smallBlind;
    this.bigBlindAmount = options.bigBlind;
    this.handNumber = startingHandNumber;
    if (startingDealerPlayerId) {
      const idx = this.players.findIndex(p => p.id === startingDealerPlayerId);
      if (idx >= 0) this.dealerIndex = idx;
    }
    this.winners = undefined;
    this.lastAction = undefined;
    this.roundActions = new Map();
    this.handLog = [];
    this.showdownHands = new Map();
    this.eliminatedThisHand = [];
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  startHand(): void {
    this.handNumber++;
    this.deck = new Deck();
    this.communityCards = [];
    this.winners = undefined;
    this.lastAction = undefined;
    this.roundActions = new Map();
    this.handLog = [];
    this.showdownHands = new Map();
    this.eliminatedThisHand = [];

    this.players.forEach(p => {
      p.holeCards = [];
      p.bet = 0;
      p.totalBetThisHand = 0;
      p.status = p.chips > 0 ? 'active' : 'sitting-out';
    });

    const active = this.activePlayers();
    if (active.length < 2) throw new Error('Need at least 2 players with chips');

    this.advanceDealer();

    if (active.length === 2) {
      // Heads-up: dealer = small blind, other = big blind
      this.smallBlindIndex = this.dealerIndex;
      this.bigBlindIndex = this.nextActiveIndex(this.dealerIndex);
    } else {
      this.smallBlindIndex = this.nextActiveIndex(this.dealerIndex);
      this.bigBlindIndex = this.nextActiveIndex(this.smallBlindIndex);
    }

    this.postBlind(this.smallBlindIndex, this.smallBlindAmount);
    this.postBlind(this.bigBlindIndex, this.bigBlindAmount);

    const dealer = this.players[this.dealerIndex];
    const sb = this.players[this.smallBlindIndex];
    const bb = this.players[this.bigBlindIndex];
    this.handLog.push({ street: 'preflop', playerName: dealer.name, actionText: 'is the Dealer' });
    this.handLog.push({ street: 'preflop', playerName: sb.name, actionText: 'posts small blind', amount: this.smallBlindAmount });
    this.handLog.push({ street: 'preflop', playerName: bb.name, actionText: 'posts big blind', amount: this.bigBlindAmount });

    this.currentBet = this.bigBlindAmount;
    this.lastRaiseSize = this.bigBlindAmount;

    // Deal two hole cards to each active player, starting left of dealer
    for (let round = 0; round < 2; round++) {
      for (let i = 1; i <= this.players.length; i++) {
        const idx = (this.dealerIndex + i) % this.players.length;
        const p = this.players[idx];
        if (p.status === 'active' || p.status === 'all-in') {
          p.holeCards.push(this.deck.deal());
        }
      }
    }

    this.phase = 'preflop';
    this.playersToAct = new Set(this.activePlayers().map(p => p.id));

    // Preflop action starts with UTG (player after BB), or dealer in heads-up
    this.currentPlayerIndex = active.length === 2
      ? this.dealerIndex
      : this.nextActiveIndex(this.bigBlindIndex);
  }

  handleAction(playerId: string, action: PlayerAction): void {
    if (this.phase === 'waiting' || this.phase === 'showdown') {
      throw new Error('No action allowed in current phase');
    }
    const player = this.players.find(p => p.id === playerId);
    if (!player) throw new Error('Player not found');
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      throw new Error("Not your turn");
    }

    this.applyAction(player, action);

    if (this.onlyOnePlayerLeft()) {
      this.runShowdown();
    } else if (this.playersToAct.size === 0) {
      this.advancePhase();
    } else {
      this.advanceCurrentPlayer();
    }
  }

  getStateForPlayer(viewerId: string): GameState {
    return {
      roomCode: '',
      phase: this.phase,
      players: this.players.map((p, i) => this.toPlayerState(p, i, viewerId)),
      communityCards: this.communityCards,
      pots: this.calculatePots(),
      currentPlayerIndex: this.currentPlayerIndex,
      dealerIndex: this.dealerIndex,
      smallBlindAmount: this.smallBlindAmount,
      bigBlindAmount: this.bigBlindAmount,
      currentBet: this.currentBet,
      minRaise: Math.max(this.currentBet + this.lastRaiseSize, this.bigBlindAmount * 2),
      myPlayerId: viewerId,
      isMyTurn: this.phase !== 'waiting' && this.phase !== 'showdown'
        && this.players[this.currentPlayerIndex]?.id === viewerId,
      winners: this.winners,
      handNumber: this.handNumber,
      lastAction: this.lastAction,
      roundActions: Object.fromEntries(this.roundActions),
      handLog: this.handLog,
      showdownHands: Object.fromEntries(this.showdownHands),
      eliminatedThisHand: this.eliminatedThisHand,
    };
  }

  setPlayerConnected(playerId: string, connected: boolean): void {
    const p = this.players.find(p => p.id === playerId);
    if (p) p.isConnected = connected;
  }

  getPhase(): GamePhase { return this.phase; }
  getCurrentPlayerId(): string | null {
    if (this.phase === 'waiting' || this.phase === 'showdown') return null;
    return this.players[this.currentPlayerIndex]?.id ?? null;
  }

  // ─── Action processing ────────────────────────────────────────────────────

  private applyAction(player: InternalPlayer, action: PlayerAction): void {
    switch (action.type) {
      case 'FOLD':
        player.status = 'folded';
        this.playersToAct.delete(player.id);
        this.lastAction = { playerId: player.id, actionText: 'folds' };
        break;

      case 'CHECK':
        if (player.bet < this.currentBet) throw new Error('Cannot check — must call or raise');
        this.playersToAct.delete(player.id);
        this.lastAction = { playerId: player.id, actionText: 'checks' };
        break;

      case 'CALL': {
        const owed = Math.min(this.currentBet - player.bet, player.chips);
        this.applyChips(player, owed);
        if (player.chips === 0) {
          player.status = 'all-in';
          this.lastAction = { playerId: player.id, actionText: 'goes all-in for', amount: player.bet };
        } else {
          this.lastAction = { playerId: player.id, actionText: 'calls', amount: owed };
        }
        this.playersToAct.delete(player.id);
        break;
      }

      case 'RAISE': {
        if (action.amount <= this.currentBet) throw new Error('Raise must exceed current bet');
        const needed = action.amount - player.bet;
        if (needed > player.chips) throw new Error('Not enough chips');
        const raiseSize = action.amount - this.currentBet;
        // Allow sub-min raise only when going all-in
        if (raiseSize < this.lastRaiseSize && needed < player.chips) {
          throw new Error(`Minimum raise to ${this.currentBet + this.lastRaiseSize}`);
        }
        this.applyChips(player, needed);
        player.bet = action.amount;
        this.lastRaiseSize = raiseSize;
        this.currentBet = action.amount;
        this.reopenAction(player.id);
        if (player.chips === 0) {
          player.status = 'all-in';
          this.lastAction = { playerId: player.id, actionText: 'goes all-in for', amount: action.amount };
        } else {
          this.lastAction = { playerId: player.id, actionText: 'raises to', amount: action.amount };
        }
        break;
      }

      case 'ALL_IN': {
        const chips = player.chips;
        this.applyChips(player, chips);
        player.status = 'all-in';
        if (player.bet > this.currentBet) {
          const raiseSize = player.bet - this.currentBet;
          this.currentBet = player.bet;
          if (raiseSize >= this.lastRaiseSize) this.lastRaiseSize = raiseSize;
          this.reopenAction(player.id);
        }
        this.playersToAct.delete(player.id);
        this.lastAction = { playerId: player.id, actionText: 'goes all-in for', amount: player.bet };
        break;
      }
    }
    if (this.lastAction) {
      this.roundActions.set(player.id, this.lastAction);
      this.handLog.push({ street: this.phase, playerName: player.name, actionText: this.lastAction.actionText, amount: this.lastAction.amount });
    }
  }

  private applyChips(player: InternalPlayer, amount: number): void {
    player.chips -= amount;
    player.bet += amount;
    player.totalBetThisHand += amount;
  }

  private reopenAction(exceptId: string): void {
    this.players.forEach(p => {
      if (p.id !== exceptId && p.status === 'active') {
        this.playersToAct.add(p.id);
      }
    });
    this.playersToAct.delete(exceptId);
  }

  // ─── Phase transitions ────────────────────────────────────────────────────

  private advancePhase(): void {
    // Reset round-bets; totalBetThisHand carries forward for pot calculation
    this.players.forEach(p => { p.bet = 0; });
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlindAmount;
    this.roundActions = new Map();

    if (this.phase === 'river') {
      this.runShowdown();
      return;
    }

    const nextPhase: Record<string, GamePhase> = {
      preflop: 'flop', flop: 'turn', turn: 'river',
    };
    this.phase = nextPhase[this.phase] as GamePhase;

    if (this.phase === 'flop') {
      this.communityCards.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
    } else {
      this.communityCards.push(this.deck.deal());
    }

    // If ≤1 active player (everyone else all-in), run out the board and log each street
    // so history shows the full board rather than jumping straight to showdown.
    if (this.activePlayers().length <= 1) {
      const hasFlop  = this.handLog.some(e => e.street === 'flop');
      const hasTurn  = this.handLog.some(e => e.street === 'turn');
      const hasRiver = this.handLog.some(e => e.street === 'river');

      if (!hasFlop) {
        this.handLog.push({ street: 'flop',  playerName: '', actionText: '', isStreetMarker: true });
      }
      if (this.communityCards.length < 4) {
        this.communityCards.push(this.deck.deal());
      }
      if (!hasTurn) {
        this.handLog.push({ street: 'turn',  playerName: '', actionText: '', isStreetMarker: true });
      }
      if (this.communityCards.length < 5) {
        this.communityCards.push(this.deck.deal());
      }
      if (!hasRiver) {
        this.handLog.push({ street: 'river', playerName: '', actionText: '', isStreetMarker: true });
      }

      this.runShowdown();
      return;
    }

    this.playersToAct = new Set(this.activePlayers().map(p => p.id));
    this.currentPlayerIndex = this.nextActiveIndex(this.dealerIndex);
  }

  private runShowdown(): void {
    this.phase = 'showdown';
    this.winners = this.determineWinners();
    // Detect players who entered this hand and finished with no chips
    this.eliminatedThisHand = this.players
      .filter(p => p.chips === 0 && p.totalBetThisHand > 0)
      .map(p => p.name);
  }

  // ─── Winner determination ─────────────────────────────────────────────────

  private determineWinners(): WinnerInfo[] {
    const results: WinnerInfo[] = [];
    const pots = this.calculatePots();

    for (const pot of pots) {
      if (pot.amount === 0) continue;

      const eligible = this.players.filter(
        p => pot.eligiblePlayerIds.includes(p.id) && p.holeCards.length >= 2
      );

      if (eligible.length === 0) continue;

      if (eligible.length === 1) {
        eligible[0].chips += pot.amount;
        results.push({ playerId: eligible[0].id, playerName: eligible[0].name, amount: pot.amount });
        continue;
      }

      // Evaluate all eligible hands
      const allCards = this.communityCards;
      const evaluated = eligible.map(p => ({
        player: p,
        hand: getBestHand([...p.holeCards, ...allCards]),
      }));

      evaluated.sort((a, b) => compareHands(b.hand, a.hand));
      const best = evaluated[0].hand;
      const winners = evaluated.filter(e => compareHands(e.hand, best) === 0);

      const share = Math.floor(pot.amount / winners.length);
      const leftover = pot.amount - share * winners.length;

      winners.forEach((w, i) => {
        const amount = share + (i === 0 ? leftover : 0);
        w.player.chips += amount;
        results.push({
          playerId: w.player.id,
          playerName: w.player.name,
          amount,
          handDescription: w.hand.description,
          cards: w.hand.bestCards,
        });
      });
    }

    if (this.communityCards.length === 5) {
      this.players
        .filter(p => p.status !== 'folded' && p.status !== 'sitting-out' && p.holeCards.length >= 2)
        .forEach(p => {
          const hand = getBestHand([...p.holeCards, ...this.communityCards]);
          this.showdownHands.set(p.id, { playerName: p.name, cards: p.holeCards, handDescription: hand.description });
        });
    }

    return results;
  }

  // ─── Pot calculation ──────────────────────────────────────────────────────

  private calculatePots(): PotInfo[] {
    const pots: PotInfo[] = [];
    const contribs = this.players
      .filter(p => p.totalBetThisHand > 0)
      .map(p => ({ id: p.id, amount: p.totalBetThisHand, folded: p.status === 'folded' }))
      .sort((a, b) => a.amount - b.amount);

    if (contribs.length === 0) return pots;

    let processed = 0;
    while (contribs.some(c => c.amount > processed)) {
      const remaining = contribs.filter(c => c.amount > processed);
      const level = remaining[0].amount;
      const levelSize = level - processed;
      const potAmount = levelSize * remaining.length;
      // Also include those who contributed exactly 'processed' (they paid into this level too via earlier pots)
      // Actually: remaining already gives exactly those who paid into [processed..level]
      const eligible = remaining.filter(c => !c.folded).map(c => c.id);

      if (potAmount > 0) {
        if (eligible.length > 0) {
          const existing = pots[pots.length - 1];
          const sameEligible = existing &&
            existing.eligiblePlayerIds.length === eligible.length &&
            eligible.every(id => existing.eligiblePlayerIds.includes(id));
          if (sameEligible) {
            existing.amount += potAmount;
          } else {
            pots.push({ amount: potAmount, eligiblePlayerIds: eligible });
          }
        } else if (pots.length > 0) {
          pots[pots.length - 1].amount += potAmount;
        }
      }
      processed = level;
    }

    return pots;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private activePlayers(): InternalPlayer[] {
    return this.players.filter(p => p.status === 'active');
  }

  private onlyOnePlayerLeft(): boolean {
    return this.players.filter(p => p.status !== 'folded' && p.status !== 'sitting-out').length === 1;
  }

  private advanceDealer(): void {
    const start = (this.dealerIndex + 1) % this.players.length;
    for (let i = 0; i < this.players.length; i++) {
      const idx = (start + i) % this.players.length;
      if (this.players[idx].chips > 0) {
        this.dealerIndex = idx;
        return;
      }
    }
  }

  private nextActiveIndex(from: number): number {
    for (let i = 1; i <= this.players.length; i++) {
      const idx = (from + i) % this.players.length;
      if (this.players[idx].status === 'active') return idx;
    }
    return from;
  }

  private advanceCurrentPlayer(): void {
    for (let i = 1; i <= this.players.length; i++) {
      const idx = (this.currentPlayerIndex + i) % this.players.length;
      if (this.playersToAct.has(this.players[idx].id)) {
        this.currentPlayerIndex = idx;
        return;
      }
    }
  }

  private postBlind(idx: number, amount: number): void {
    const p = this.players[idx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    p.bet = actual;
    p.totalBetThisHand = actual;
    if (p.chips === 0) p.status = 'all-in';
  }

  private toPlayerState(p: InternalPlayer, idx: number, viewerId: string): PlayerState {
    const revealCards = p.id === viewerId || this.phase === 'showdown';
    return {
      id: p.id,
      name: p.name,
      chips: p.chips,
      bet: p.bet,
      totalBetThisHand: p.totalBetThisHand,
      status: p.status,
      isBot: p.isBot,
      isConnected: p.isConnected,
      seatIndex: p.seatIndex,
      cards: revealCards
        ? p.holeCards
        : p.holeCards.map(() => null),
      isDealer: idx === this.dealerIndex,
      isSmallBlind: idx === this.smallBlindIndex,
      isBigBlind: idx === this.bigBlindIndex,
    };
  }
}
