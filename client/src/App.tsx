import { useEffect, useState } from 'react';
import type { GameState } from '@poker/shared';
import { socket } from './socket';
import { MainMenu } from './components/MainMenu';
import { PokerTable } from './components/PokerTable';

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socket.on('game_state', state => {
      setGameState(state);
      setError(null);
    });
    socket.on('error', msg => setError(msg));

    return () => {
      socket.off('game_state');
      socket.off('error');
    };
  }, []);

  const inGame = gameState && gameState.phase !== 'waiting';

  return (
    <div className="app">
      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {!gameState || !inGame ? (
        <MainMenu gameState={gameState} />
      ) : (
        <PokerTable state={gameState} />
      )}
    </div>
  );
}
