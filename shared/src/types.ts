// 'T' = Ten (two-char rank avoided for type safety; display layer renders it as "10")
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type PlayerStatus = 'active' | 'folded' | 'all-in' | 'sitting-out';

export interface PlayerState {
  id: string;
  name: string;
  chips: number;
  bet: number;
  totalBetThisHand: number;
  status: PlayerStatus;
  isBot: boolean;
  isConnected: boolean;
  seatIndex: number;
  /** null entries are face-down cards (opponent's hidden hole cards) */
  cards: (Card | null)[];
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
}

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PotInfo {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface WinnerInfo {
  playerId: string;
  playerName: string;
  amount: number;
  handDescription?: string;
  cards?: Card[];
}

export interface LastAction {
  playerId: string;
  actionText: string;
  amount?: number;
}

export interface HandLogEntry {
  street: GamePhase;
  playerName: string;
  actionText: string;
  amount?: number;
}

export interface ShowdownHandInfo {
  playerName: string;
  cards: Card[];
  handDescription: string;
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: PlayerState[];
  communityCards: Card[];
  pots: PotInfo[];
  /** Index into players[] whose turn it is */
  currentPlayerIndex: number;
  dealerIndex: number;
  smallBlindAmount: number;
  bigBlindAmount: number;
  /** Highest bet placed this round — what a caller must match */
  currentBet: number;
  /** Minimum total-bet amount for a legal raise */
  minRaise: number;
  myPlayerId: string;
  isMyTurn: boolean;
  winners?: WinnerInfo[];
  handNumber: number;
  lastAction?: LastAction;
  /** Actions taken by each player this betting round — cleared when the street advances */
  roundActions: Record<string, LastAction>;
  /** Full action log for the current hand — use at showdown to save history */
  handLog: HandLogEntry[];
  /** Evaluated hands for non-folded players at showdown; keyed by playerId */
  showdownHands?: Record<string, ShowdownHandInfo>;
}

export interface RoomOptions {
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
}

export type BotDifficulty = 'easy';

export type PlayerAction =
  | { type: 'FOLD' }
  | { type: 'CHECK' }
  | { type: 'CALL' }
  | { type: 'RAISE'; amount: number }
  | { type: 'ALL_IN' };
