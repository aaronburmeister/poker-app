import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@poker/shared';

// When proxied through Vite, connect to the same origin.
// In production set VITE_SERVER_URL to the deployed server URL.
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  autoConnect: false,
});
