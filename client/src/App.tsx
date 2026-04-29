import { useEffect, useRef, useState } from 'react';
import type { GameState } from '@poker/shared';
import { socket } from './socket';
import { MainMenu } from './components/MainMenu';
import { PokerTable } from './components/PokerTable';
import type { CompletedHand } from './components/HandHistoryPanel';
import type { Settings } from './components/SettingsModal';

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handHistory, setHandHistory] = useState<CompletedHand[]>([]);
  const [settings, setSettings] = useState<Settings>({ showOdds: false });
  const lastSavedHand = useRef<number>(0);

  useEffect(() => {
    socket.on('game_state', state => {
      // Capture completed hand at showdown, before state is overwritten
      if (
        state.phase === 'showdown' &&
        state.winners &&
        state.handNumber > lastSavedHand.current
      ) {
        lastSavedHand.current = state.handNumber;
        setHandHistory(prev => [
          {
            handNumber: state.handNumber,
            log: state.handLog,
            winners: state.winners!,
            communityCards: state.communityCards,
            showdownHands: state.showdownHands,
            eliminatedPlayers: state.eliminatedThisHand ?? [],
          },
          ...prev,
        ]);
      }
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
        <PokerTable state={gameState} handHistory={handHistory} settings={settings} onSettingsChange={setSettings} />
      )}
    </div>
  );
}
