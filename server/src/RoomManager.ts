import type { BotDifficulty, BotPersonalityId, PlayerAction, RoomOptions } from '@poker/shared';
import { GameRoom } from './GameRoom';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export class RoomManager {
  private rooms = new Map<string, GameRoom>();
  /** socketId → playerId + roomCode */
  private socketIndex = new Map<string, { playerId: string; roomCode: string }>();

  createRoom(
    socketId: string,
    playerName: string,
    options: RoomOptions,
  ): { roomCode: string; playerId: string } {
    let roomCode: string;
    do { roomCode = generateRoomCode(); } while (this.rooms.has(roomCode));

    const room = new GameRoom(roomCode, socketId, playerName, options);
    this.rooms.set(roomCode, room);
    const playerId = room.hostId;
    this.socketIndex.set(socketId, { playerId, roomCode });
    return { roomCode, playerId };
  }

  joinRoom(
    roomCode: string,
    socketId: string,
    playerName: string,
  ): { playerId: string } {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    const playerId = room.addPlayer(socketId, playerName);
    this.socketIndex.set(socketId, { playerId, roomCode });
    return { playerId };
  }

  startGame(roomCode: string, requesterId: string): void {
    this.getRoom(roomCode)?.startGame(requesterId);
  }

  handleAction(roomCode: string, playerId: string, action: PlayerAction): void {
    this.getRoom(roomCode)?.handleAction(playerId, action);
  }

  addBot(roomCode: string, requesterId: string, difficulty: BotDifficulty): void {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== requesterId) throw new Error('Only the host can add bots');
    room.addBot(difficulty);
  }

  removeBot(roomCode: string, requesterId: string, botId: string): void {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== requesterId) throw new Error('Only the host can remove bots');
    room.removeBot(botId);
  }

  renameBot(roomCode: string, requesterId: string, botId: string, name: string): void {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== requesterId) throw new Error('Only the host can rename bots');
    room.renameBot(botId, name);
  }

  setBotPersonality(roomCode: string, requesterId: string, botId: string, personality: BotPersonalityId): void {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== requesterId) throw new Error('Only the host can change bot personalities');
    room.setBotPersonality(botId, personality);
  }

  handleDisconnect(socketId: string): { playerId: string; roomCode: string } | null {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return null;
    const room = this.rooms.get(entry.roomCode);
    room?.handleDisconnect(entry.playerId);
    this.socketIndex.delete(socketId);
    return entry;
  }

  getRoom(roomCode: string): GameRoom | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  getEntryBySocket(socketId: string) {
    return this.socketIndex.get(socketId) ?? null;
  }
}
