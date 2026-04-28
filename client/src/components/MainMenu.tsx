import { useState, FormEvent } from 'react';
import type { BotDifficulty, GameState, RoomOptions } from '@poker/shared';
import { socket } from '../socket';

interface Props {
  gameState: GameState | null;
}

const DEFAULT_OPTIONS: RoomOptions = {
  maxPlayers: 6,
  smallBlind: 10,
  bigBlind: 20,
  startingChips: 1000,
};

type Screen = 'home' | 'create' | 'join' | 'lobby';

export function MainMenu({ gameState }: Props) {
  const [screen, setScreen] = useState<Screen>('home');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [options, setOptions] = useState<RoomOptions>(DEFAULT_OPTIONS);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [renamingBotId, setRenamingBotId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const inLobby = gameState?.phase === 'waiting';
  const isHost = inLobby && gameState?.myPlayerId === gameState?.players[0]?.id;

  // Auto-enter lobby view when we have a waiting-phase state
  if (inLobby && screen !== 'lobby') setScreen('lobby');

  function connect() {
    if (!socket.connected) socket.connect();
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!playerName.trim()) return;
    connect();
    setLoading(true);
    setLocalError('');
    socket.emit('create_room', { playerName: playerName.trim(), options }, result => {
      setLoading(false);
      if (!result.success) setLocalError(result.error ?? 'Failed to create room');
    });
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!playerName.trim() || !roomCode.trim()) return;
    connect();
    setLoading(true);
    setLocalError('');
    socket.emit('join_room', { roomCode: roomCode.trim().toUpperCase(), playerName: playerName.trim() }, result => {
      setLoading(false);
      if (!result.success) setLocalError(result.error ?? 'Failed to join room');
    });
  }

  function handleStartGame() {
    socket.emit('start_game', result => {
      if (!result.success) setLocalError(result.error ?? 'Failed to start game');
    });
  }

  function handleAddBot(difficulty: BotDifficulty) {
    socket.emit('add_bot', difficulty);
  }

  function handleRemoveBot(botId: string) {
    socket.emit('remove_bot', botId);
  }

  function startRename(botId: string, currentName: string) {
    setRenamingBotId(botId);
    setRenameValue(currentName);
  }

  function commitRename(botId: string) {
    const trimmed = renameValue.trim();
    if (trimmed) socket.emit('rename_bot', { botId, name: trimmed });
    setRenamingBotId(null);
  }

  // ── Lobby screen ──────────────────────────────────────────────────────────
  if (screen === 'lobby' && gameState) {
    return (
      <div className="menu-container">
        <h1 className="menu-title">Texas Hold'em</h1>
        <div className="lobby-box">
          <div className="lobby-code">
            Room Code: <span className="code-badge">{gameState.roomCode}</span>
          </div>
          <p className="lobby-hint">Share this code with friends to join.</p>
          <ul className="lobby-players">
            {gameState.players.map(p => (
              <li key={p.id} className="lobby-player">
                {p.isBot && isHost && renamingBotId === p.id ? (
                  <form
                    className="rename-form"
                    onSubmit={e => { e.preventDefault(); commitRename(p.id); }}
                  >
                    <input
                      className="rename-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      maxLength={20}
                      autoFocus
                    />
                    <button type="submit" className="btn btn-sm btn-primary">✓</button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRenamingBotId(null)}>✕</button>
                  </form>
                ) : (
                  <>
                    <span>{p.name}{p.isBot && ' 🤖'}</span>
                    {p.isBot && isHost && (
                      <>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => startRename(p.id, p.name)}
                        >
                          Rename
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleRemoveBot(p.id)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {!p.isBot && p.id === gameState.players[0]?.id && (
                      <span className="host-badge">HOST</span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {isHost && (
            <div className="lobby-actions">
              <button className="btn btn-secondary" onClick={() => handleAddBot('easy')}>
                + Add Bot
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStartGame}
                disabled={gameState.players.length < 2}
              >
                Start Game
              </button>
            </div>
          )}
          {!isHost && <p className="lobby-hint">Waiting for the host to start the game…</p>}
          {localError && <p className="form-error">{localError}</p>}
        </div>
      </div>
    );
  }

  // ── Home screen ───────────────────────────────────────────────────────────
  if (screen === 'home') {
    return (
      <div className="menu-container">
        <h1 className="menu-title">♠ Poker</h1>
        <p className="menu-subtitle">Texas Hold'em</p>
        <div className="menu-buttons">
          <button className="btn btn-primary btn-large" onClick={() => setScreen('create')}>
            Create Game
          </button>
          <button className="btn btn-secondary btn-large" onClick={() => setScreen('join')}>
            Join Game
          </button>
        </div>
      </div>
    );
  }

  // ── Create screen ─────────────────────────────────────────────────────────
  if (screen === 'create') {
    return (
      <div className="menu-container">
        <h1 className="menu-title">Create Game</h1>
        <form className="menu-form" onSubmit={handleCreate}>
          <label>
            Your name
            <input
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              placeholder="Enter name"
              maxLength={20}
              required
            />
          </label>
          <label>
            Starting chips
            <input
              type="number"
              value={options.startingChips}
              onChange={e => setOptions(o => ({ ...o, startingChips: Number(e.target.value) }))}
              min={100}
              step={100}
            />
          </label>
          <label>
            Small blind
            <input
              type="number"
              value={options.smallBlind}
              onChange={e => setOptions(o => ({ ...o, smallBlind: Number(e.target.value) }))}
              min={1}
            />
          </label>
          <label>
            Big blind
            <input
              type="number"
              value={options.bigBlind}
              onChange={e => setOptions(o => ({ ...o, bigBlind: Number(e.target.value) }))}
              min={2}
            />
          </label>
          <label>
            Max players
            <input
              type="number"
              value={options.maxPlayers}
              onChange={e => setOptions(o => ({ ...o, maxPlayers: Number(e.target.value) }))}
              min={2}
              max={9}
            />
          </label>
          {localError && <p className="form-error">{localError}</p>}
          <div className="form-row">
            <button type="button" className="btn btn-ghost" onClick={() => setScreen('home')}>
              Back
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Join screen ───────────────────────────────────────────────────────────
  return (
    <div className="menu-container">
      <h1 className="menu-title">Join Game</h1>
      <form className="menu-form" onSubmit={handleJoin}>
        <label>
          Your name
          <input
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Enter name"
            maxLength={20}
            required
          />
        </label>
        <label>
          Room code
          <input
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase())}
            placeholder="XXXXXX"
            maxLength={6}
            style={{ textTransform: 'uppercase', letterSpacing: '0.15em' }}
            required
          />
        </label>
        {localError && <p className="form-error">{localError}</p>}
        <div className="form-row">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('home')}>
            Back
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Joining…' : 'Join'}
          </button>
        </div>
      </form>
    </div>
  );
}
