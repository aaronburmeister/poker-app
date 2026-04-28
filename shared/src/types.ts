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
  /** Only set for bot players */
  personality?: BotPersonalityId;
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
  /** If true, only the street header is rendered — no action row (used for all-in board run-outs) */
  isStreetMarker?: boolean;
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
  /** Players who entered this hand and finished with 0 chips */
  eliminatedThisHand?: string[];
}

export interface RoomOptions {
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
}

export type BotDifficulty = 'easy';

export type BotPersonalityId = 'nit' | 'calling_station' | 'tag' | 'lag' | 'maniac';

export interface BotPersonality {
  id: BotPersonalityId;
  name: string;
  description: string;
}

export const PERSONALITIES: BotPersonality[] = [
  {
    id: 'nit',
    name: 'Nit',
    description: 'Nit (Tight-Passive): Only plays premium hands and almost never bets or raises. If a Nit enters the pot, they almost certainly have a strong hand.',
  },
  {
    id: 'calling_station',
    name: 'Calling Station',
    description: 'Calling Station (Loose-Passive): Calls nearly any bet regardless of hand strength or pot odds, but rarely raises. Value-bet them relentlessly; bluffing is almost always wasted.',
  },
  {
    id: 'tag',
    name: 'TAG',
    description: 'TAG (Tight-Aggressive): Plays a narrow range of strong hands but bets and raises aggressively when they enter the pot. Considered the most fundamentally sound style.',
  },
  {
    id: 'lag',
    name: 'LAG',
    description: 'LAG (Loose-Aggressive): Plays a wide range of hands and applies constant pressure with frequent bets, raises, and bluffs. Difficult to read; powerful when used with skill.',
  },
  {
    id: 'maniac',
    name: 'Maniac',
    description: 'Maniac (Ultra Loose-Aggressive): Raises and re-raises with almost any hand, bluffs constantly, and uses oversized bets. Volatile and unpredictable; patient opponents can exploit them.',
  },
];

export type PlayerAction =
  | { type: 'FOLD' }
  | { type: 'CHECK' }
  | { type: 'CALL' }
  | { type: 'RAISE'; amount: number }
  | { type: 'ALL_IN' };
