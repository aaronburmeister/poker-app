import type {
  BotDifficulty, BotPersonalityId, GameState, PlayerAction, RoomOptions,
} from '@poker/shared';
import { GameEngine } from './GameEngine';
import { BotPlayer } from './BotPlayer';

interface RoomPlayer {
  id: string;
  name: string;
  socketId: string | null; // null for bots
  isBot: boolean;
  chips: number;
  personality?: BotPersonalityId;
}

const ALL_PERSONALITY_IDS: BotPersonalityId[] = ['nit', 'calling_station', 'tag', 'lag', 'maniac'];

function randomPersonality(): BotPersonalityId {
  return ALL_PERSONALITY_IDS[Math.floor(Math.random() * ALL_PERSONALITY_IDS.length)];
}

const BOT_NAMES = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eddie', 'Fiona', 'George', 'Hannah',
  'Ivan', 'Julia', 'Kevin', 'Laura', 'Marcus', 'Nina', 'Oscar', 'Petra',
  'Quinn', 'Rosa', 'Sam', 'Tina', 'Ulric', 'Vera', 'Wyatt', 'Xena', 'Yusuf',
];
let botNameIdx = 0;

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class GameRoom {
  readonly roomCode: string;
  readonly hostId: string;
  readonly options: RoomOptions;
  private players: RoomPlayer[];
  private engine: GameEngine | null;
  private bot: BotPlayer;
  private nextHandTimer: ReturnType<typeof setTimeout> | null;
  private handNumber: number;
  private dealerPlayerId: string | null;

  constructor(roomCode: string, hostSocketId: string, hostName: string, options: RoomOptions) {
    this.roomCode = roomCode;
    this.options = options;
    this.bot = new BotPlayer();
    this.engine = null;
    this.nextHandTimer = null;
    this.handNumber = 0;
    this.dealerPlayerId = null;

    const hostId = generateId();
    this.hostId = hostId;
    this.players = [{
      id: hostId,
      name: hostName,
      socketId: hostSocketId,
      isBot: false,
      chips: options.startingChips,
    }];
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────

  addPlayer(socketId: string, name: string): string {
    if (this.players.filter(p => !p.isBot).length >= this.options.maxPlayers) {
      throw new Error('Room is full');
    }
    if (this.engine) throw new Error('Game already in progress');

    const id = generateId();
    this.players.push({ id, name, socketId, isBot: false, chips: this.options.startingChips });
    return id;
  }

  addBot(_difficulty: BotDifficulty): void {
    if (this.players.length >= this.options.maxPlayers) throw new Error('Room is full');
    if (this.engine) throw new Error('Game already in progress');

    const id = generateId();
    const name = BOT_NAMES[botNameIdx++ % BOT_NAMES.length];
    this.players.push({ id, name, socketId: null, isBot: true, chips: this.options.startingChips, personality: randomPersonality() });
  }

  removeBot(botId: string): void {
    const idx = this.players.findIndex(p => p.id === botId && p.isBot);
    if (idx === -1) throw new Error('Bot not found');
    this.players.splice(idx, 1);
  }

  renameBot(botId: string, name: string): void {
    const player = this.players.find(p => p.id === botId && p.isBot);
    if (!player) throw new Error('Bot not found');
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) throw new Error('Name cannot be empty');
    player.name = trimmed;
  }

  setBotPersonality(botId: string, personality: BotPersonalityId): void {
    if (this.engine) throw new Error('Cannot change personality during a game');
    const player = this.players.find(p => p.id === botId && p.isBot);
    if (!player) throw new Error('Bot not found');
    player.personality = personality;
  }

  handleDisconnect(playerId: string): void {
    const p = this.players.find(p => p.id === playerId);
    if (p) {
      p.socketId = null;
      this.engine?.setPlayerConnected(playerId, false);
    }
  }

  handleReconnect(playerId: string, socketId: string): void {
    const p = this.players.find(p => p.id === playerId);
    if (p) {
      p.socketId = socketId;
      this.engine?.setPlayerConnected(playerId, true);
    }
  }

  // ─── Game control ─────────────────────────────────────────────────────────

  startGame(requesterId: string): void {
    if (requesterId !== this.hostId) throw new Error('Only the host can start the game');
    if (this.players.length < 2) throw new Error('Need at least 2 players');
    if (this.engine) throw new Error('Game already in progress');
    this.beginHand();
  }

  handleAction(playerId: string, action: PlayerAction): void {
    if (!this.engine) throw new Error('No game in progress');
    this.engine.handleAction(playerId, action);

    if (this.engine.getPhase() === 'showdown') {
      this.scheduleNextHand();
    }
  }

  // ─── State ────────────────────────────────────────────────────────────────

  getStateForPlayer(playerId: string): GameState {
    if (!this.engine) {
      return this.buildLobbyState(playerId);
    }
    const state = this.engine.getStateForPlayer(playerId);
    state.roomCode = this.roomCode;
    return state;
  }

  /** Returns the bot's decision if it's currently a bot's turn, else null */
  getPendingBotAction(): { botId: string; action: PlayerAction } | null {
    if (!this.engine) return null;
    const currentId = this.engine.getCurrentPlayerId();
    if (!currentId) return null;
    const player = this.players.find(p => p.id === currentId);
    if (!player?.isBot) return null;

    const state = this.engine.getStateForPlayer(currentId);
    const action = this.bot.decide(state, currentId, player.personality ?? 'tag');
    return { botId: currentId, action };
  }

  getPlayerIds(): string[] {
    return this.players.map(p => p.id);
  }

  getSocketId(playerId: string): string | null {
    return this.players.find(p => p.id === playerId)?.socketId ?? null;
  }

  getPhase() {
    return this.engine?.getPhase() ?? 'waiting';
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private beginHand(): void {
    // Drop players with no chips
    const eligible = this.players.filter(p => p.chips > 0);
    if (eligible.length < 2) return; // game over

    this.engine = new GameEngine(
      eligible.map((p, i) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        isBot: p.isBot,
        seatIndex: i,
        isConnected: p.socketId !== null || p.isBot,
      })),
      this.options,
      this.handNumber,
      this.dealerPlayerId ?? undefined,
    );
    this.engine.startHand();
  }

  private scheduleNextHand(): void {
    if (this.nextHandTimer) return;
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      // Sync chips from engine back to room players after hand resolves
      if (this.engine) {
        const finalState = this.engine.getStateForPlayer(this.players[0].id);
        this.handNumber = finalState.handNumber;
        this.dealerPlayerId = finalState.players[finalState.dealerIndex]?.id ?? null;
        finalState.players.forEach(ps => {
          const rp = this.players.find(p => p.id === ps.id);
          if (rp) rp.chips = ps.chips;
        });
      }
      this.engine = null;
      this.beginHand();
      // Callers should re-broadcast state; we expose the timer via onNextHand callback
      this._onNextHand?.();
    }, 4000); // 4 second pause after showdown
  }

  /** Set by the server to re-broadcast state after next hand starts */
  _onNextHand: (() => void) | null = null;

  private buildLobbyState(viewerId: string): GameState {
    return {
      roomCode: this.roomCode,
      phase: 'waiting',
      players: this.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        bet: 0,
        totalBetThisHand: 0,
        status: 'sitting-out',
        isBot: p.isBot,
        isConnected: p.socketId !== null || p.isBot,
        seatIndex: i,
        cards: [],
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        personality: p.personality,
      })),
      communityCards: [],
      pots: [],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      smallBlindAmount: this.options.smallBlind,
      bigBlindAmount: this.options.bigBlind,
      currentBet: 0,
      minRaise: this.options.bigBlind * 2,
      myPlayerId: viewerId,
      isMyTurn: false,
      handNumber: 0,
      roundActions: {},
      handLog: [],
      showdownHands: {},
    };
  }
}
