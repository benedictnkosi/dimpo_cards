import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Dimensions, Alert } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { useAuth } from '@/contexts/AuthContext';
import { createTestGame, updateTestGame, subscribeToTestGame, deleteTestGame, TestGame } from '@/services/testGamesService';
import TestGameList from './components/TestGameList';

const CARD_SIZE = 60;
const CARD_MARGIN = 12;
const { width } = Dimensions.get('window');

export default function TestReanimatedPage() {
  const { user } = useAuth();
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [cards, setCards] = useState([0, 1, 2, 3]);
  const [discarded, setDiscarded] = useState<number[]>([]);
  const [animatingCard, setAnimatingCard] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGameList, setShowGameList] = useState(false);
  
  const animX = useSharedValue(0);
  const animY = useSharedValue(0);
  const cardRefs = useRef<(View | null)[]>([]);
  const discardRef = useRef<View | null>(null);

  const animStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: animX.value,
    top: animY.value,
    zIndex: 100,
  }));

  // Initialize or join a test game
  useEffect(() => {
    if (!user) {
      setError('User not authenticated');
      setIsLoading(false);
      return;
    }

    // Don't auto-create a game, let user choose
    setIsLoading(false);
  }, [user]);

  async function createNewGame() {
    if (!user) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Create a new test game
      const gameId = await createTestGame(user.uid);
      setCurrentGameId(gameId);
      setShowGameList(false);
      console.log('[TestGame] Created new game:', gameId);
    } catch (err) {
      console.error('[TestGame] Error creating game:', err);
      setError('Failed to create game');
    } finally {
      setIsLoading(false);
    }
  }

  function joinGame(gameId: string) {
    setCurrentGameId(gameId);
    setShowGameList(false);
    console.log('[TestGame] Joined game:', gameId);
  }

  // Subscribe to real-time updates
  useEffect(() => {
    if (!currentGameId) return;

    const unsubscribe = subscribeToTestGame(
      currentGameId,
      (game: TestGame | null) => {
        if (game) {
          console.log('[TestGame] Received update:', game);
          setCards(game.cards);
          setDiscarded(game.discarded);
          
          // Check if animation state changed and trigger animation if needed
          if (game.animatingCard !== animatingCard) {
            const previousAnimatingCard = animatingCard;
            setAnimatingCard(game.animatingCard);
            
            // If a card started animating (not null), trigger the animation
            if (game.animatingCard !== null && previousAnimatingCard === null) {
              console.log('[TestGame] Triggering animation for card:', game.animatingCard);
              // Small delay to ensure UI has updated
              setTimeout(() => triggerAnimation(game.animatingCard!), 50);
            }
          }
        } else {
          console.log('[TestGame] Game not found');
          setError('Game not found');
        }
      },
      (error) => {
        console.error('[TestGame] Error listening to game:', error);
        setError('Failed to sync with game');
      }
    );

    return unsubscribe;
  }, [currentGameId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentGameId) {
        deleteTestGame(currentGameId).catch(err => 
          console.error('[TestGame] Error cleaning up game:', err)
        );
      }
    };
  }, [currentGameId]);

  function onAnimationEnd(cardIdx: number) {
    console.log('[TestGame] Animation ended for card:', cardIdx);
    setAnimatingCard(null);
    const newCards = cards.filter(c => c !== cardIdx);
    const newDiscarded = [...discarded, cardIdx];
    
    setCards(newCards);
    setDiscarded(newDiscarded);
    
    // Update Firebase
    if (currentGameId) {
      updateTestGame(currentGameId, {
        cards: newCards,
        discarded: newDiscarded,
        animatingCard: null,
      }).catch(err => {
        console.error('[TestGame] Error updating game:', err);
        setError('Failed to sync changes');
      });
    }
  }

  function triggerAnimation(idx: number) {
    console.log('[TestGame] Starting animation for card:', idx);
    function tryMeasure(attempt = 0) {
      const cardRef = cardRefs.current[idx];
      const discard = discardRef.current;
      if (!cardRef || !discard) {
        console.log('[TestGame] Missing refs, ending animation for card:', idx);
        onAnimationEnd(idx);
        return;
      }
      cardRef.measureInWindow((x, y, width, height) => {
        discard.measureInWindow((dx, dy, dwidth, dheight) => {
          if (
            [x, y, dx, dy].some(v => typeof v !== 'number' || isNaN(v)) ||
            (x === 0 && y === 0 && attempt < 5)
          ) {
            // Try again on the next frame, up to 5 times
            console.log('[TestGame] Retrying measurement, attempt:', attempt + 1);
            requestAnimationFrame(() => tryMeasure(attempt + 1));
            return;
          }
          console.log('[TestGame] Starting animation from', { x, y }, 'to', { dx, dy });
          animX.value = x;
          animY.value = y;
          animX.value = withTiming(dx, { duration: 600 });
          animY.value = withTiming(dy, { duration: 600 }, (finished) => {
            if (finished) runOnJS(onAnimationEnd)(idx);
          });
        });
      });
    }
    setTimeout(() => tryMeasure(), 10);
  }

  function handleCardPress(idx: number) {
    if (!currentGameId) return;
    
    setAnimatingCard(idx);
    
    // Update Firebase immediately to show animation state
    updateTestGame(currentGameId, {
      cards,
      discarded,
      animatingCard: idx,
    }).catch(err => {
      console.error('[TestGame] Error updating animation state:', err);
    });

    // Trigger the animation locally
    triggerAnimation(idx);
  }

  function resetGame() {
    if (!currentGameId || !user) return;
    
    const initialCards = [0, 1, 2, 3];
    setCards(initialCards);
    setDiscarded([]);
    setAnimatingCard(null);
    
    updateTestGame(currentGameId, {
      cards: initialCards,
      discarded: [],
      animatingCard: null,
    }).catch(err => {
      console.error('[TestGame] Error resetting game:', err);
      setError('Failed to reset game');
    });
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Loading test game...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'red', marginBottom: 20 }}>Error: {error}</Text>
        <TouchableOpacity 
          onPress={() => window.location.reload()} 
          style={{ padding: 10, backgroundColor: '#19C37D', borderRadius: 8 }}
        >
          <Text style={{ color: 'white' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show game list if no game is selected
  if (!currentGameId || showGameList) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 10 }}>
            Test Games
          </Text>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 20 }}>
            Create a new game or join an existing one to test real-time synchronization
          </Text>
          <TouchableOpacity 
            onPress={createNewGame}
            style={{ 
              padding: 15, 
              backgroundColor: '#19C37D', 
              borderRadius: 8, 
              marginBottom: 20,
              minWidth: 200,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
              Create New Game
            </Text>
          </TouchableOpacity>
        </View>
        <TestGameList onJoinGame={joinGame} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {/* Game Info */}
      <View style={{ position: 'absolute', top: 40, alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 5 }}>
          Real-time Test Game
        </Text>
        <Text style={{ fontSize: 12, color: '#666' }}>
          Game ID: {currentGameId?.slice(0, 8)}...
        </Text>
        <Text style={{ fontSize: 12, color: '#666' }}>
          Connected devices will see the same state
        </Text>
        {animatingCard !== null && (
          <Text style={{ fontSize: 12, color: '#ff6b6b', marginTop: 5 }}>
            🎬 Animating card {animatingCard}...
          </Text>
        )}
      </View>

      {/* Back to Game List Button */}
      <TouchableOpacity 
        onPress={() => setShowGameList(true)}
        style={{
          position: 'absolute',
          left: 20,
          top: 40,
          padding: 10,
          backgroundColor: '#666',
          borderRadius: 8,
        }}
      >
        <Text style={{ color: 'white', fontSize: 12 }}>Back</Text>
      </TouchableOpacity>

      {/* Reset Button */}
      <TouchableOpacity 
        onPress={resetGame}
        style={{
          position: 'absolute',
          right: 20,
          top: 40,
          padding: 10,
          backgroundColor: '#ff6b6b',
          borderRadius: 8,
        }}
      >
        <Text style={{ color: 'white', fontSize: 12 }}>Reset</Text>
      </TouchableOpacity>

      {/* Discard pile */}
      <View
        ref={discardRef}
        style={{
          position: 'absolute',
          right: 40,
          top: 120,
          width: CARD_SIZE,
          height: CARD_SIZE,
          backgroundColor: '#eee',
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {discarded.length > 0 && (
          <View style={{ width: CARD_SIZE, height: CARD_SIZE, backgroundColor: '#19C37D', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>Card</Text>
          </View>
        )}
        <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Discard ({discarded.length})</Text>
      </View>

      {/* Card row */}
      <View style={{ flexDirection: 'row', marginTop: 200 }}>
        {cards.map((c, idx) => (
          <View
            key={c}
            ref={ref => (cardRefs.current[c] = ref)}
            style={{
              width: CARD_SIZE,
              height: CARD_SIZE,
              backgroundColor: '#19C37D',
              borderRadius: 12,
              marginHorizontal: CARD_MARGIN / 2,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: animatingCard === c ? 0 : 1,
            }}
          >
            <TouchableOpacity onPress={() => handleCardPress(c)} disabled={animatingCard !== null}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>Card</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Animated card */}
      {animatingCard !== null && (
        <Animated.View style={animStyle} pointerEvents="none">
          <View style={{ width: CARD_SIZE, height: CARD_SIZE, backgroundColor: '#19C37D', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>Card</Text>
          </View>
        </Animated.View>
      )}

      {/* Status */}
      <View style={{ position: 'absolute', bottom: 40, alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: '#666' }}>
          Cards remaining: {cards.length}
        </Text>
        <Text style={{ fontSize: 12, color: '#999' }}>
          Changes sync in real-time across devices
        </Text>
      </View>
    </View>
  );
} 