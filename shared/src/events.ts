import type { GameState, PlayerAction, RoomOptions, BotDifficulty } from './types';

export interface ClientToServerEvents {
  create_room: (
    data: { playerName: string; options: RoomOptions },
    callback: (result: { success: boolean; roomCode?: string; error?: string }) => void
  ) => void;

  join_room: (
    data: { roomCode: string; playerName: string },
    callback: (result: { success: boolean; error?: string }) => void
  ) => void;

  start_game: (
    callback: (result: { success: boolean; error?: string }) => void
  ) => void;

  player_action: (action: PlayerAction) => void;

  add_bot: (difficulty: BotDifficulty) => void;

  remove_bot: (botId: string) => void;
}

export interface ServerToClientEvents {
  game_state: (state: GameState) => void;
  error: (message: string) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  playerId: string;
  playerName: string;
  roomCode: string;
}
