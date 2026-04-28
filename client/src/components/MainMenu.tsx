import { useState, FormEvent } from 'react';
import type { BlindLevel, BotDifficulty, BotPersonalityId, GameState, RoomOptions } from '@poker/shared';
import { PERSONALITIES } from '@poker/shared';
import { socket } from '../socket';

// ── Blind structure data ──────────────────────────────────────────────────────

type TournamentSpeed = 'slow' | 'standard' | 'turbo';

const SLOW_LEVELS: BlindLevel[] = [
  { small: 10, big: 20 }, { small: 15, big: 30 }, { small: 20, big: 40 },
  { small: 25, big: 50 }, { small: 40, big: 80 }, { small: 50, big: 100 },
  { small: 75, big: 150 }, { small: 100, big: 200 }, { small: 150, big: 300 },
  { small: 200, big: 400 }, { small: 300, big: 600 }, { small: 500, big: 1000 },
];
const STANDARD_LEVELS: BlindLevel[] = [
  { small: 10, big: 20 }, { small: 20, big: 40 }, { small: 25, big: 50 },
  { small: 50, big: 100 }, { small: 100, big: 200 }, { small: 150, big: 300 },
  { small: 300, big: 600 }, { small: 500, big: 1000 },
];
const TURBO_LEVELS: BlindLevel[] = [
  { small: 10, big: 20 }, { small: 25, big: 50 }, { small: 75, big: 150 },
  { small: 100, big: 200 }, { small: 200, big: 400 }, { small: 500, big: 1000 },
];
const SPEED_LEVELS: Record<TournamentSpeed, BlindLevel[]> = {
  slow: SLOW_LEVELS, standard: STANDARD_LEVELS, turbo: TURBO_LEVELS,
};
const SPEED_LABELS: Record<TournamentSpeed, string> = {
  slow: 'Slow — gradual steps, long game',
  standard: 'Standard — balanced progression',
  turbo: 'Turbo — large jumps, fast finish',
};

const STARTING_BLIND_OPTIONS = [
  { label: '10 / 20', small: 10, big: 20 },
  { label: '25 / 50', small: 25, big: 50 },
  { label: '100 / 200', small: 100, big: 200 },
];

function computeBlindLevels(small: number, big: number, speed: TournamentSpeed, interval: number): BlindLevel[] {
  if (interval === 0) return [{ small, big }];
  const levels = SPEED_LEVELS[speed];
  const startIdx = levels.findIndex(l => l.small === small && l.big === big);
  return startIdx >= 0 ? levels.slice(startIdx) : [{ small, big }];
}

interface Props {
  gameState: GameState | null;
}

const DEFAULT_OPTIONS: RoomOptions = {
  maxPlayers: 6,
  smallBlind: 10,
  bigBlind: 20,
  startingChips: 1000,
  blindIncreaseInterval: 0,
  blindLevels: [{ small: 10, big: 20 }],
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
  const [startingBlindsKey, setStartingBlindsKey] = useState('10/20');
  const [tournamentSpeed, setTournamentSpeed] = useState<TournamentSpeed>('standard');

  function updateBlindSelection(blindKey: string, speed: TournamentSpeed, interval: number) {
    const found = STARTING_BLIND_OPTIONS.find(o => `${o.small}/${o.big}` === blindKey)
      ?? STARTING_BLIND_OPTIONS[0];
    setOptions(o => ({
      ...o,
      smallBlind: found.small,
      bigBlind: found.big,
      blindLevels: computeBlindLevels(found.small, found.big, speed, interval),
    }));
  }

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

  function handleSetPersonality(botId: string, personality: BotPersonalityId) {
    socket.emit('set_bot_personality', { botId, personality });
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
                {/* Name row */}
                <div className="lobby-player-top">
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
                      <div className="lobby-player-actions">
                        {p.isBot && isHost && (
                          <>
                            <button className="btn btn-sm btn-ghost" onClick={() => startRename(p.id, p.name)}>Rename</button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleRemoveBot(p.id)}>Remove</button>
                          </>
                        )}
                        {!p.isBot && p.id === gameState.players[0]?.id && (
                          <span className="host-badge">HOST</span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Personality row (bots only) */}
                {p.isBot && p.personality && (
                  <div className="lobby-player-personality">
                    <select
                      className="personality-select"
                      value={p.personality}
                      disabled={!isHost}
                      onChange={e => handleSetPersonality(p.id, e.target.value as BotPersonalityId)}
                    >
                      {PERSONALITIES.map(pers => (
                        <option key={pers.id} value={pers.id} title={pers.description}>
                          {pers.name}
                        </option>
                      ))}
                    </select>
                    <span className="personality-desc">
                      {PERSONALITIES.find(pers => pers.id === p.personality)?.description}
                    </span>
                  </div>
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

          {/* Player Details */}
          <div className="form-section-title">Player Details</div>
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

          {/* Table Settings */}
          <div className="form-section-title">Table Settings</div>
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
            Max players
            <input
              type="number"
              value={options.maxPlayers}
              onChange={e => setOptions(o => ({ ...o, maxPlayers: Number(e.target.value) }))}
              min={2}
              max={9}
            />
          </label>

          {/* Tournament Structure */}
          <div className="form-section-title">Tournament Structure</div>
          <label>
            Starting blinds
            <select
              value={startingBlindsKey}
              onChange={e => {
                const key = e.target.value;
                setStartingBlindsKey(key);
                updateBlindSelection(key, tournamentSpeed, options.blindIncreaseInterval);
              }}
            >
              {STARTING_BLIND_OPTIONS.map(o => (
                <option key={o.label} value={`${o.small}/${o.big}`}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            Increase blinds every (hands)
            <input
              type="number"
              value={options.blindIncreaseInterval}
              onChange={e => {
                const interval = Number(e.target.value);
                setOptions(o => ({ ...o, blindIncreaseInterval: interval }));
                updateBlindSelection(startingBlindsKey, tournamentSpeed, interval);
              }}
              min={0}
              step={1}
              placeholder="0 = never"
            />
          </label>
          {options.blindIncreaseInterval > 0 && (
            <label>
              Tournament speed
              <select
                value={tournamentSpeed}
                onChange={e => {
                  const speed = e.target.value as TournamentSpeed;
                  setTournamentSpeed(speed);
                  updateBlindSelection(startingBlindsKey, speed, options.blindIncreaseInterval);
                }}
              >
                {(Object.keys(SPEED_LABELS) as TournamentSpeed[]).map(s => (
                  <option key={s} value={s}>{SPEED_LABELS[s]}</option>
                ))}
              </select>
            </label>
          )}

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
