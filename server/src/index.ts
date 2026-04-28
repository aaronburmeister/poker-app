import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@poker/shared';
import { RoomManager } from './RoomManager';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    cors: {
      origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  },
);

const manager = new RoomManager();

function broadcastState(roomCode: string): void {
  const room = manager.getRoom(roomCode);
  if (!room) return;
  room.getPlayerIds().forEach(playerId => {
    const socketId = room.getSocketId(playerId);
    if (socketId) {
      io.to(socketId).emit('game_state', room.getStateForPlayer(playerId));
    }
  });
}

function scheduleBotActions(roomCode: string): void {
  const room = manager.getRoom(roomCode);
  if (!room) return;

  const pending = room.getPendingBotAction();
  if (!pending) return;

  setTimeout(() => {
    try {
      manager.handleAction(roomCode, pending.botId, pending.action);
      broadcastState(roomCode);
      // Chain: if another bot is up next, schedule again
      scheduleBotActions(roomCode);
    } catch (err) {
      console.error('Bot action error:', err);
    }
  }, 1200);
}

io.on('connection', socket => {
  console.log('connected:', socket.id);

  socket.on('create_room', (data, callback) => {
    try {
      const { roomCode, playerId } = manager.createRoom(socket.id, data.playerName, data.options);
      socket.data.playerId = playerId;
      socket.data.playerName = data.playerName;
      socket.data.roomCode = roomCode;
      socket.join(roomCode);

      const room = manager.getRoom(roomCode)!;
      room._onNextHand = () => {
        broadcastState(roomCode);
        scheduleBotActions(roomCode);
      };

      callback({ success: true, roomCode });
      broadcastState(roomCode);
    } catch (err) {
      callback({ success: false, error: String(err) });
    }
  });

  socket.on('join_room', (data, callback) => {
    try {
      const { playerId } = manager.joinRoom(data.roomCode, socket.id, data.playerName);
      socket.data.playerId = playerId;
      socket.data.playerName = data.playerName;
      socket.data.roomCode = data.roomCode.toUpperCase();
      socket.join(socket.data.roomCode);
      callback({ success: true });
      broadcastState(socket.data.roomCode);
    } catch (err) {
      callback({ success: false, error: String(err) });
    }
  });

  socket.on('start_game', callback => {
    try {
      const { roomCode, playerId } = socket.data;
      manager.startGame(roomCode, playerId);
      broadcastState(roomCode);
      scheduleBotActions(roomCode);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: String(err) });
    }
  });

  socket.on('player_action', action => {
    try {
      const { roomCode, playerId } = socket.data;
      manager.handleAction(roomCode, playerId, action);
      broadcastState(roomCode);
      scheduleBotActions(roomCode);
    } catch (err) {
      socket.emit('error', String(err));
    }
  });

  socket.on('add_bot', difficulty => {
    try {
      const { roomCode, playerId } = socket.data;
      manager.addBot(roomCode, playerId, difficulty);
      broadcastState(roomCode);
    } catch (err) {
      socket.emit('error', String(err));
    }
  });

  socket.on('remove_bot', botId => {
    try {
      const { roomCode, playerId } = socket.data;
      manager.removeBot(roomCode, playerId, botId);
      broadcastState(roomCode);
    } catch (err) {
      socket.emit('error', String(err));
    }
  });

  socket.on('rename_bot', ({ botId, name }) => {
    try {
      const { roomCode, playerId } = socket.data;
      manager.renameBot(roomCode, playerId, botId, name);
      broadcastState(roomCode);
    } catch (err) {
      socket.emit('error', String(err));
    }
  });

  socket.on('disconnect', () => {
    console.log('disconnected:', socket.id);
    const entry = manager.handleDisconnect(socket.id);
    if (entry) broadcastState(entry.roomCode);
  });
});

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
