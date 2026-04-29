import type { GameState, PlayerAction, RoomOptions, BotDifficulty, BotPersonalityId } from './types';

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

  rename_bot: (data: { botId: string; name: string }) => void;

  set_bot_personality: (data: { botId: string; personality: BotPersonalityId }) => void;
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
