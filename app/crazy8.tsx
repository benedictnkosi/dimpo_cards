import React, { useEffect, useState, useRef } from 'react';
import { Image, View, StyleSheet, TouchableOpacity, Dimensions, Alert, ScrollView, findNodeHandle, InteractionManager, Animated as LegacyAnimated, Button } from 'react-native';
import ThemedView from './components/ThemedView';
import ThemedText from './components/ThemedText';
import { LinearGradient } from 'expo-linear-gradient';
import CasinoCard from './components/CasinoCard';
import {
  initGame,
  playCard,
  drawCard,
  hasPlayableCard,
  canPlay,
  GameState,
  Card,
  Player
} from '@/app/crazyEightsGame';
import cards from '@/app/cards.json';
import { db } from '@/config/firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, doc, updateDoc, getDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { useUsername } from '@/hooks/useUsername';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

const AVATARS = [
  require('../assets/images/avatars/1.png'),
  require('../assets/images/avatars/2.png'),
  require('../assets/images/avatars/3.png'),
  require('../assets/images/avatars/4.png'),
];

const COMMUNITY_CARDS = [
  { suit: '♦', value: '9' },
  { suit: '♦', value: 'A' },
  { suit: '♠', value: 'Q' },
  { suit: '♥', value: 'Q' },
  { suit: '♦', value: 'J' },
];

const MAIN_PLAYER_CARDS = [
  { suit: '♥', value: '10' },
  { suit: '♠', value: '10' },
];

// Number of cards to deal to each player
const CARDS_PER_PLAYER = 4; // Changed back to 4 cards per player

function getCardBack() {
  // Use the facedown card image for card backs
  return (
    <Image
      source={require('../assets/images/facedown-card.png')}
      style={{ width: 56, height: 80, borderRadius: 10, marginHorizontal: 6 }}
      resizeMode="contain"
    />
  );
}

function shuffle(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Utility to check if it is the local player's turn based on Firebase doc
function isPlayersTurn(gameData: any, username: string): boolean {
  
  if (!gameData || !gameData.players || !username){
    console.log('data missing');
   return false;
  }else{
    console.log('data is set');
  }
  if (gameData.turn === 'player1') {
    const isPlayer1 = gameData.players.player1?.name === username;
    console.log('[IS PLAYERS TURN]', {
      gameData,
      username,
      isPlayer1,
    });
    return isPlayer1;
  } else if (gameData.turn === 'player2') {
    const isPlayer2 = gameData.players.player2?.name === username;
    console.log('[IS PLAYERS TURN]', {
      gameData,
      username, 
      isPlayer2,
    });
    return isPlayer2;
  }
  return false;
}

export default function CasinoGameScreen() {
  const { username } = useUsername();
  const [game, setGame] = useState<GameState>(initGame());
  const [firebaseGameData, setFirebaseGameData] = useState<any>(null);
  const [choosingSuit, setChoosingSuit] = useState(false);
  const [gamePhase, setGamePhase] = useState<'init' | 'dealing' | 'playing'>('init');
  const [dealtHands, setDealtHands] = useState<{ north: Card[]; south: Card[] }>({ north: [], south: [] });
  const [dealtStock, setDealtStock] = useState<Card[]>([]);
  const [dealtDiscard, setDealtDiscard] = useState<Card[]>([]);
  const [screen, setScreen] = useState<'welcome' | 'game'>('welcome');
  const [waitingGames, setWaitingGames] = useState<any[]>([]);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [playerNames, setPlayerNames] = useState({ south: 'Player 1', north: 'Player 2' });
  const [isPlayer1, setIsPlayer1] = useState<boolean | null>(null);
  const [animatingCardIndex, setAnimatingCardIndex] = useState<number | null>(null);
  const [animatingCard, setAnimatingCard] = useState<Card | null>(null);
  const [opponentLastPlayedCard, setOpponentLastPlayedCard] = useState<Card | null>(null);
  const [previousDiscardCard, setPreviousDiscardCard] = useState<Card | null>(null);
  const animCardX = useSharedValue(0);
  const animCardY = useSharedValue(0);
  const handCardRefs = useRef<(View | null)[]>([]);
  const discardRef = useRef<View | null>(null);
  // Box animation (like the test page)
  const boxOffset = useSharedValue(0);
  const boxAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: boxOffset.value }],
    opacity: 0.5 + 0.5 * (boxOffset.value / 150),
  }));

  const animCardStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: animCardX.value,
    top: animCardY.value,
    zIndex: 100,
  }));

  const animLastPlayedCardStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: animCardX.value,
    top: animCardY.value,
    zIndex: 100,
  }));

  const isMounted = useRef(true);

  // Track previous discard card when discard pile changes (for opponent plays)
  const lastDiscardRef = useRef<Card | null>(null);
  useEffect(() => {
    // Only run if discard pile has at least one card
    if (game.discard.length > 0) {
      const currentTop = game.discard[game.discard.length - 1];
      const prevTop = lastDiscardRef.current;
      // If the top card changed, update previousDiscardCard
      if (
        prevTop &&
        (prevTop.suit !== currentTop.suit || prevTop.value !== currentTop.value)
      ) {
        setPreviousDiscardCard(prevTop);
      }
      lastDiscardRef.current = currentTop;
    } else {
      lastDiscardRef.current = null;
    }
  }, [game.discard]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Listen for waiting games
  useEffect(() => {
    const q = query(collection(db, 'games'), where('status', '==', 'waiting'));
    const unsub = onSnapshot(q, (snap) => {
      setWaitingGames(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // Listen for current game updates
  useEffect(() => {
    if (!currentGameId) return;
    
    const gameDoc = doc(db, 'games', currentGameId);
    const unsub = onSnapshot(gameDoc, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const gameData = docSnapshot.data();
        setFirebaseGameData(gameData);
        if (gameData && gameData.players) {
          // Determine if current user is player1 or player2
          let isP1 = false;
          if (gameData.players.player1?.name && username && gameData.players.player1.name === username) {
            isP1 = true;
          } else if (gameData.players.player2?.name && username && gameData.players.player2.name === username) {
            isP1 = false;
          }
          setIsPlayer1(isP1);

          // Map hands and names based on who you are
          const southHand = isP1 ? gameData.players.player1?.hand || [] : gameData.players.player2?.hand || [];
          const northHand = isP1 ? gameData.players.player2?.hand || [] : gameData.players.player1?.hand || [];
          
          const discardPile = Array.isArray(gameData.discardPile) ? gameData.discardPile : (gameData.currentCard ? [gameData.currentCard] : []);
          const newGameState: GameState = {
            hands: {
              south: southHand,
              north: northHand,
            },
            stock: gameData.pile || [],
            discard: discardPile,
            turn: (gameData.turn === 'player1') === isP1 ? 'south' as Player : 'north' as Player,
            currentSuit: gameData.currentCard?.suit || '♠',
            winner: gameData.status === 'finished' ? ((gameData.turn === 'player1') === isP1 ? 'south' as Player : 'north' as Player) : null,
            chooseSuit: false
          };
          
          // Check for lastCardPlayed in opponent's player object
          const opponentPlayerKey = isP1 ? 'player2' : 'player1';
          const opponentData = gameData.players[opponentPlayerKey];
          if (opponentData && opponentData.lastCardPlayed) {
            console.log('[OPPONENT] Last card played from opponent:', opponentData.lastCardPlayed);
            setOpponentLastPlayedCard(opponentData.lastCardPlayed);
          }
          
          // Clear opponent's played card when it becomes current player's turn
          const currentTurn = (gameData.turn === 'player1') === isP1 ? 'south' as Player : 'north' as Player;
          if (currentTurn === 'south' && opponentLastPlayedCard) {
            console.log('[OPPONENT] Clearing played card - now player turn');
            setOpponentLastPlayedCard(null);
          }
          
          // Clear own lastCardPlayed when it's opponent's turn
          if (currentTurn === 'north') {
            const ownPlayerKey = isP1 ? 'player1' : 'player2';
            const ownData = gameData.players[ownPlayerKey];
            if (ownData && ownData.lastCardPlayed) {
              console.log('[SELF] Clearing own lastCardPlayed - now opponent turn');
              // Clear the lastCardPlayed field for the current player
              const gameDocRef = doc(db, 'games', currentGameId);
              updateDoc(gameDocRef, {
                [`players.${ownPlayerKey}.lastCardPlayed`]: null
              }).catch((err: any) => {
                console.error('[SELF] Error clearing lastCardPlayed:', err);
              });
            }
          }
          
          console.log('[GAME DATA]', {
            username,
            gameDataTurn: gameData.turn,
            player1: gameData.players.player1?.name,
            player2: gameData.players.player2?.name,
            isPlayer1: isP1,
          });
          console.log('[IS IT MY TURN?]', isPlayersTurn(gameData, username || ''));
          
          setGame(newGameState);
          
          // Only set gamePhase to 'init' if both hands are empty, otherwise set to 'playing'
          if (southHand.length === 0 && northHand.length === 0) {
            setGamePhase('init');
          } else {
            setGamePhase('playing');
          }
          setPlayerNames({
            south: isP1 ? (gameData.players.player1?.name || 'Player 1') : (gameData.players.player2?.name || 'Player 2'),
            north: isP1 ? (gameData.players.player2?.name || 'Player 2') : (gameData.players.player1?.name || 'Player 1'),
          });
        }
      }
    });
    
    return () => unsub();
  }, [currentGameId, username]);

  // Log all cards in discard pile on every render
  useEffect(() => {
    console.log('[ALL CARDS IN DISCARD]', JSON.stringify(game.discard));
  }, [game.discard]);

  // Start new game
  async function handleStartNewGame() {
    try {
      console.log('Deleting old games...');
      // Delete all existing games
      const gamesQuery = query(collection(db, 'games'));
      const gamesSnapshot = await getDocs(gamesQuery);
      
      const deletePromises = gamesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      console.log(`Deleted ${gamesSnapshot.docs.length} old games`);
      
      console.log('Creating new game...');
      const docRef = await addDoc(collection(db, 'games'), {
        status: 'waiting',
        createdAt: serverTimestamp(),
        players: {
          player1: {
            name: username || 'Player',
            hand: [],
          },
        },
      });
      console.log('Game created with id:', docRef.id);
      setCurrentGameId(docRef.id);
      setScreen('game');
    } catch (err) {
      console.error('Error creating game:', err);
    }
  }

  // Join game
  async function handleJoinGame(gameId: string) {
    try {
      console.log('Joining game:', gameId);
      const gameDocRef = doc(db, 'games', gameId);
      // Only set player2 if not already set
      const gameSnap = await getDoc(gameDocRef);
      const gameData = gameSnap.exists() ? gameSnap.data() : null;
      if (gameData && (!gameData.players.player2 || !gameData.players.player2.name)) {
        await updateDoc(gameDocRef, {
          status: 'started',
          [`players.player2`]: {
            name: username || 'Player',
            hand: [],
          },
        });
      } else {
        await updateDoc(gameDocRef, { status: 'started' });
      }
      setCurrentGameId(gameId);
      setScreen('game');
    } catch (err) {
      console.error('Error joining game:', err);
    }
  }

  // Update game state in Firebase
  async function updateGameInFirebase(gameState: GameState, lastCardPlayed?: Card) {
    if (!currentGameId || isPlayer1 === null) {
      console.log('[FIREBASE] Skipping update - missing currentGameId or isPlayer1');
      return;
    }
    try {
      console.log('[FIREBASE] Updating game state...');
      const gameDocRef = doc(db, 'games', currentGameId);
      
      // Prepare the update data
      const updateData: any = {
        players: {
          player1: {
            name: isPlayer1 ? (username || 'Player') : playerNames.north,
            hand: isPlayer1 ? gameState.hands.south : gameState.hands.north,
          },
          player2: {
            name: isPlayer1 ? playerNames.north : (username || 'Player'),
            hand: isPlayer1 ? gameState.hands.north : gameState.hands.south,
          },
        },
        pile: gameState.stock,
        currentCard: gameState.discard.length > 0 ? gameState.discard[gameState.discard.length - 1] : null,
        discardPile: gameState.discard,
        turn: gameState.turn === 'south' ? (isPlayer1 ? 'player1' : 'player2') : (isPlayer1 ? 'player2' : 'player1'),
        status: gameState.winner ? 'finished' : 'in-progress',
        lastUpdated: serverTimestamp(),
      };
      
      // Add lastCardPlayed to the appropriate player object if provided
      if (lastCardPlayed) {
        const playerKey = isPlayer1 ? 'player1' : 'player2';
        updateData[`players.${playerKey}.lastCardPlayed`] = lastCardPlayed;
        console.log('[FIREBASE] Adding lastCardPlayed to', playerKey, ':', lastCardPlayed);
      }
      
      console.log('[UPDATE FIREBASE]', {
        username,
        isPlayer1,
        updateTurn: updateData.turn,
        player1: updateData.players.player1?.name,
        player2: updateData.players.player2?.name,
      });
      
      console.log('[FIREBASE] Update data prepared:', updateData);
      await updateDoc(gameDocRef, updateData);
      console.log('[FIREBASE] Game state updated successfully');
    } catch (err) {
      console.error('[FIREBASE] Error updating game in Firebase:', err);
      // Don't throw the error, just log it to prevent crashes
    }
  }

  // Handle Deal button
  async function handleDeal() {
    try {
      console.log('[DEAL] Starting deal process...');
      // Shuffle and prepare deck
      const deck = shuffle(cards as Card[]);
      console.log('[DEAL] Deck shuffled, length:', deck.length);
      let north: Card[] = [];
      let south: Card[] = [];
      let stock: Card[] = [...deck];
      setGamePhase('dealing');
      setDealtHands({ north: [], south: [] });
      setDealtStock(stock);
      setDealtDiscard([]);
    // Animate dealing N cards to each player
    let i = 0;
    function dealNext() {
      if (i < CARDS_PER_PLAYER) {
        setTimeout(() => {
          north = [...north, stock.shift()!];
          setDealtHands(h => ({ ...h, north: north.slice() }));
          setDealtStock(stock.slice());
          i++;
          dealNext();
        }, 300);
      } else if (i < CARDS_PER_PLAYER * 2) {
        setTimeout(() => {
          south = [...south, stock.shift()!];
          setDealtHands(h => ({ ...h, south: south.slice() }));
          setDealtStock(stock.slice());
          i++;
          dealNext();
        }, 300);
      } else {
        // After dealing, set up the rest of the game
        setTimeout(async () => {
          console.log('[DEAL] Setting up discard pile...');
          // Start discard pile with a non-8 card
          let discard: Card[] = [];
          let top: Card | undefined;
          while (stock.length) {
            top = stock.shift();
            if (top && top.value !== '8') {
              discard = [top];
              break;
            } else if (top) {
              stock.push(top);
            }
          }
          
          // If we couldn't find a non-8 card, use the first card (even if it's an 8)
          if (discard.length === 0 && stock.length > 0) {
            top = stock.shift();
            if (top) {
              discard = [top];
            }
          }
          
          // If still no card, create a default card (this shouldn't happen with a full deck)
          if (discard.length === 0) {
            console.warn('No cards available for discard pile, using default card');
            discard = [{ suit: '♠', value: 'A' }];
          }
          
          console.log('[DEAL] Discard pile set up:', discard[0]);
          setDealtDiscard(discard);
          setDealtStock(stock.slice());
          setTimeout(async () => {
            console.log('[DEAL] Creating final game state...');
            const newGameState: GameState = {
              hands: { north, south },
              stock,
              discard,
              turn: 'south' as Player,
              currentSuit: discard[0].suit,
              winner: null,
              chooseSuit: false,
            };
            console.log('[DEAL] Game state created, updating...');
            setGame(newGameState);
            setGamePhase('playing');
            // Update Firebase with the new game state (no card played during deal)
            await updateGameInFirebase(newGameState);
            console.log('[DEAL] Deal process completed successfully');
          }, 400);
        }, 400);
      }
    }
    dealNext();
    } catch (err) {
      console.error('[DEAL] Error during deal process:', err);
      // Reset to init phase on error
      setGamePhase('init');
    }
  }

  // Handle play for either player (with animation for south)
  async function handlePlay(player: Player, idx: number) {
    console.log('[ACTION]', {
      username,
      isPlayer1,
      gameTurn: game.turn,
      playerNames,
      // isPlayersTurn: isPlayersTurn(gameData, username),
    });
    
    if (gamePhase !== 'playing') {
      console.log('[HANDLE_PLAY] Early return: gamePhase !== playing');
      return;
    }
    
    if (game.turn !== player || game.winner !== null || game.chooseSuit) {
      console.log('[HANDLE_PLAY] Early return: turn/winner/chooseSuit check failed', {
        turn: game.turn,
        player,
        winner: game.winner,
        chooseSuit: game.chooseSuit
      });
      return;
    }
    
    const card = game.hands[player][idx];
    const top = game.discard[game.discard.length - 1];
    
    if (!canPlay(card, top, game.currentSuit)) {
      console.log('[HANDLE_PLAY] Early return: cannot play card', { card, top, currentSuit: game.currentSuit });
      return;
    }

    // LOG discard pile before play
    console.log('[DISCARD BEFORE PLAY]', JSON.stringify(game.discard));
    
    // Store the current top card as the previous discard card
    if (game.discard.length > 0) {
      setPreviousDiscardCard(game.discard[game.discard.length - 1]);
    }

    if (player === 'south') {
      setAnimatingCardIndex(idx);
      setAnimatingCard(card);
      InteractionManager.runAfterInteractions(() => {
        function tryMeasure(attempt = 0) {
          const cardRef = handCardRefs.current[idx];
          const discard = discardRef.current;
          if (!cardRef || !discard) {
            finishAnimation();
            let newGame = playCard(game, player, idx);
            if (newGame.chooseSuit) {
              setChoosingSuit(true);
            } else {
              setGame(newGame);
              updateGameInFirebase(newGame);
            }
            // LOG discard pile after play
            console.log('[DISCARD AFTER PLAY]', JSON.stringify(newGame.discard));
            return;
          }
          cardRef.measureInWindow((x, y, width, height) => {
            discard.measureInWindow((dx, dy, dwidth, dheight) => {
              console.log(`[SOUTH] attempt ${attempt}: card=(${x},${y}), discard=(${dx},${dy})`);
              if (
                [x, y, dx, dy].some(v => typeof v !== 'number' || isNaN(v)) ||
                (x === 0 && y === 0 && attempt < 5)
              ) {
                // Try again on the next frame, up to 5 times
                requestAnimationFrame(() => tryMeasure(attempt + 1));
                return;
              }
              animCardX.value = x;
              animCardY.value = y;
              animCardX.value = withTiming(dx, { duration: 500 });
              animCardY.value = withTiming(dy, { duration: 500 }, (finished) => {
                if (finished) runOnJS(onPlayerCardAnimationEnd)(player, idx);
              });
            });
          });
        }
        setTimeout(() => tryMeasure(), 10);
      });

    } else {
      // fallback (should not happen)
      let newGame = playCard(game, player, idx);
      if (newGame.chooseSuit) {
        setChoosingSuit(true);
      } else {
        setGame(newGame);
        const playedCard = game.hands[player][idx];
        await updateGameInFirebase(newGame, playedCard);
      }
      // LOG discard pile after play
      console.log('[DISCARD AFTER PLAY]', JSON.stringify(newGame.discard));
    }
  }

  function finishAnimation() {
    setAnimatingCardIndex(null);
    setAnimatingCard(null);
  }

  // Handle suit choice after 8
  async function handleChooseSuit(suit: string) {
    if (gamePhase !== 'playing') return;
    const idx = game.hands[game.turn].findIndex(card => card.value === '8');
    if (idx === -1) return;
    const newGame = playCard(game, game.turn, idx, suit);
    setGame(newGame);
    setChoosingSuit(false);
    // Update Firebase with the new game state and played card
    const playedCard = game.hands[game.turn][idx];
    await updateGameInFirebase(newGame, playedCard);
  }

  // Handle draw
  async function handleDraw() {
    // Only allow draw if it's the local player's turn

    
    if (gamePhase !== 'playing') return;
    if (game.winner !== null || game.chooseSuit) return;
    // LOG discard pile before draw
    console.log('[DISCARD BEFORE DRAW]', JSON.stringify(game.discard));
    const newGame = drawCard(game, game.turn);
    setGame(newGame);
    // LOG discard pile after draw
    console.log('[DISCARD AFTER DRAW]', JSON.stringify(newGame.discard));
    // Update Firebase with the new game state (no card played for draw)
    await updateGameInFirebase(newGame);
  }

  // Handle new game
  function handleNewGame() {
    setGame(initGame());
    setChoosingSuit(false);
    setGamePhase('init');
    setOpponentLastPlayedCard(null);
    setPreviousDiscardCard(null);
  }

  // Helper for animation end
  function onPlayerCardAnimationEnd(player: Player, idx: number) {
    finishAnimation();
    let newGame = playCard(game, player, idx);
    if (newGame.chooseSuit) {
      setChoosingSuit(true);
    } else {
      setGame(newGame);
      // Pass the played card to Firebase
      const playedCard = game.hands[player][idx];
      updateGameInFirebase(newGame, playedCard);
    }
  }

  // Ensure refs arrays match hand lengths
  if (handCardRefs.current.length !== game.hands.south.length) {
    handCardRefs.current.length = game.hands.south.length;
  }

  // --- RENDER ---
  if (screen === 'welcome') {
    return (
      <ThemedView style={styles.container}>
        <LinearGradient
          colors={["#43e97b", "#38f9d7", "#22c55e"]}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.fullTableBg}
        >
          <View style={styles.welcomeCenter}>
            <ThemedText style={styles.welcomeTitle}>Welcome to the Crazy 8 Game</ThemedText>
            <TouchableOpacity style={styles.dealBtn} onPress={handleStartNewGame}>
              <ThemedText style={styles.dealBtnText}>Start New Game</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.waitingTitle}>Games waiting for opponents:</ThemedText>
            {waitingGames.length === 0 && (
              <ThemedText style={styles.noGamesText}>No games waiting</ThemedText>
            )}
            {waitingGames.map(game => (
              <TouchableOpacity key={game.id} style={styles.waitingGameBtn} onPress={() => handleJoinGame(game.id)}>
                <ThemedText style={styles.waitingGameText}>Game {game.id.slice(-5)}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>
      </ThemedView>
    );
  }

  console.log('[RENDER LOGIC]', {
    username,
    isPlayer1,
    gameTurn: game.turn,
    playerNames,
    // If you have access to the original gameData, include it:
    // isPlayersTurn: isPlayersTurn(gameData, username),
  });

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      {/* Animated card at root level for correct absolute positioning */}
      {animatingCard && (
        <Animated.View
          style={animCardStyle}
          pointerEvents="none"
        >
          <CasinoCard suit={animatingCard.suit} value={animatingCard.value} />
        </Animated.View>
      )}

      {/* Box animation demo (like the test page) */}
      <View style={{ position: 'absolute', bottom: 80, left: 0, right: 0, alignItems: 'center' }}>
        <Animated.View
          style={[{
            width: 100,
            height: 100,
            backgroundColor: '#19C37D',
            borderRadius: 16,
            marginBottom: 16,
          }, boxAnimatedStyle]}
        />
        <Button
          title="Animate Box"
          onPress={() => {
            boxOffset.value = withTiming(boxOffset.value === 0 ? 150 : 0, { duration: 600 });
          }}
        />
      </View>
      <ThemedView style={styles.container}>
        <LinearGradient
          colors={["#43e97b", "#38f9d7", "#22c55e"]}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.fullTableBg}
        >
          {/* INIT PHASE: Show deck and Deal button */}
          {gamePhase === 'init' && (
            <View style={styles.initCenter}>
              {getCardBack()}
              <TouchableOpacity style={styles.dealBtn} onPress={handleDeal}>
                <ThemedText style={styles.dealBtnText}>Deal</ThemedText>
              </TouchableOpacity>
            </View>
          )}
          {/* DEALING PHASE: Animate cards being dealt */}
          {gamePhase === 'dealing' && (
            <View style={styles.dealCenter}>
              <View style={{ flexDirection: 'row', marginBottom: 24 }}>
                {dealtHands.north.map((card, idx) => (
                  <CasinoCard key={idx} suit={card.suit} value={card.value} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 24 }}>
                {dealtHands.south.map((card, idx) => (
                  <CasinoCard key={idx} suit={card.suit} value={card.value} />
                ))}
              </View>
              <View style={{ alignItems: 'center' }}>
                {dealtStock.length > 0 ? getCardBack() : null}
              </View>
            </View>
          )}
          {/* PLAYING PHASE: Normal game UI */}
          {gamePhase === 'playing' && (
            <>
              {/* Discard and stock piles at center */}
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <View style={styles.pilesRow}>
                  {/* Spacer to separate stock and discard piles */}
                  <View style={{ width: 32 }} />
                  {/* Discard pile - show previous and current discard stacked */}
                  <View
                    ref={discardRef}
                    collapsable={false}
                    style={{
                      alignItems: 'center',
                      position: 'relative',
                      minHeight: 170,
                      minWidth: 120,
                    }}
                  >
                    <View style={{ width: 120, height: 170, position: 'relative' }}>
                      {previousDiscardCard && (
                        <View style={{
                          position: 'absolute',
                          left: -32,
                          top: 16,
                          zIndex: 1,
                          opacity: 0.7,
                        }}>
                          <CasinoCard suit={previousDiscardCard.suit} value={previousDiscardCard.value} style={{ width: 120, height: 170 }} />
                        </View>
                      )}
                      {game.discard.length > 0 && (
                        <View style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          zIndex: 2,
                        }}>
                          <CasinoCard suit={game.discard[game.discard.length - 1].suit} value={game.discard[game.discard.length - 1].value} style={{ width: 120, height: 170 }} />
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
              {/* South hand (player) */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.southHandRow}
                contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
              >
                {game.hands.south.map((card, idx) => (
                  <View
                    key={`${card.suit}-${card.value}-${idx}`}
                    ref={ref => (handCardRefs.current[idx] = ref)}
                    style={{ marginLeft: idx === 0 ? 0 : -32, zIndex: idx }}
                  >
                    <TouchableOpacity
                      onPress={() => handlePlay('south', idx)}
                      disabled={game.turn !== 'south' || game.winner !== null || game.chooseSuit || !canPlay(card, game.discard[game.discard.length - 1], game.currentSuit)}
                    >
                      <CasinoCard suit={card.suit} value={card.value} style={{ width: 72, height: 104 }} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
              {/* Players at the edge of the screen */}
              {([
                { key: 'north', avatar: AVATARS[0], style: { position: 'absolute' as const, top: 24 + 32, alignItems: 'center' as const, marginTop: 32 } },
                { key: 'south', avatar: AVATARS[2], style: { position: 'absolute' as const, bottom: 24, alignItems: 'center' as const } }
              ] as const).map((player) => (
                <View
                  key={player.key}
                  style={player.style}
                >
                  {/* Soft glow for main player */}
                  {player.key === 'south' && (
                    <View style={styles.southGlow} />
                  )}
                  <Image source={player.avatar} style={styles.avatar} />
                  <ThemedText style={styles.nameText}>{playerNames[player.key]}</ThemedText>
                  {/* Opponent's cards below avatar */}
                  {player.key === 'north' && (
                    <>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginTop: 8, maxWidth: width - 40 }}
                        contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
                      >
                        {game.hands.north.map((card, idx) => (
                          <View
                            key={`${card.suit}-${card.value}-${idx}`}
                            style={{ marginLeft: idx === 0 ? 0 : -32, zIndex: idx }}
                          >
                            {getCardBack()}
                          </View>
                        ))}
                      </ScrollView>
                    </>
                  )}
                </View>
              ))}
              {/* Turn indicator and winner */}
              <View style={styles.statusRow}>
                {game.winner !== null ? (
                  <>
                    <ThemedText style={styles.statusText}>{game.winner === 'south' ? 'You win!' : `${playerNames.north} wins!`}</ThemedText>
                    <TouchableOpacity onPress={handleNewGame} style={styles.newGameBtn}>
                      <ThemedText style={styles.newGameBtnText}>New Game</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : (
                  (() => {
                    const isLocalTurn = firebaseGameData ? isPlayersTurn(firebaseGameData, username || '') : false;
                    const opponentName = playerNames.north === username ? playerNames.south : playerNames.north;
                    return (
                      <ThemedText style={styles.statusText}>
                        {isLocalTurn
                          ? 'Your turn'
                          : `${opponentName}'s turn`}
                      </ThemedText>
                    );
                  })()
                )}
              </View>
              {/* Draw button for the current playing player (local user only) */}
              {(() => {
                if (isPlayer1 !== null) {
                  const isLocalTurn = firebaseGameData ? isPlayersTurn(firebaseGameData, username || '') : false;
                  const localHand = isPlayer1 ? game.hands.south : game.hands.north;
                  const canDraw =
                    !game.chooseSuit &&
                    game.stock.length > 0 &&
                    game.winner === null;

                  console.log('[DRAW BUTTON LOGIC]', {
                    isPlayer1,
                    gameTurn: game.turn,
                    isLocalTurn,
                    chooseSuit: game.chooseSuit,
                    stock: game.stock.length,
                    winner: game.winner,
                    canDraw
                  });

                  if (canDraw && isLocalTurn) {
                    return (
                      <TouchableOpacity onPress={handleDraw} style={styles.drawBtn}>
                        <ThemedText style={styles.drawBtnText}>Draw</ThemedText>
                      </TouchableOpacity>
                    );
                  }
                }
                return null;
              })()}
              {/* Suit chooser after 8 */}
              {choosingSuit && (
                <View style={styles.suitChooserRow}>
                  {['hearts', 'diamonds', 'clubs', 'spades'].map(suit => (
                    <TouchableOpacity key={suit} onPress={() => handleChooseSuit(suit)} style={styles.suitBtn}>
                      <ThemedText style={styles.suitBtnText}>{suit}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </LinearGradient>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14532d',
  },
  fullTableBg: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height / 2 - 80,
  },
  dealBtn: {
    backgroundColor: '#19C37D',
    marginLeft: 24,
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 28,
    elevation: 4,
  },
  dealBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 22,
    letterSpacing: 1,
  },
  dealCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height / 2 - 120,
  },
  pilesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -20,
    zIndex: 2,
  },
  pileLabel: {
    color: '#fff',
    fontSize: 13,
    marginTop: 2,
    textAlign: 'center',
  },
  pileLabelSmall: {
    color: '#fff',
    fontSize: 11,
    opacity: 0.7,
    textAlign: 'center',
  },
  cardBack: {
    width: 56,
    height: 80,
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    marginHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#b6b6b6',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  northHandRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 0,
    zIndex: 2,
  },
  southHandRow: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 120,
    zIndex: 3,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    borderColor: '#fff',
    marginBottom: 6,
  },
  nameText: {
    color: '#fff',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
    opacity: 0.92,
    textAlign: 'center',
  },
  southGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 50,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    zIndex: -1,
  },
  statusRow: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  newGameBtn: {
    backgroundColor: '#19C37D',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    marginTop: 6,
  },
  newGameBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  drawBtn: {
    position: 'absolute',
    bottom: 60,
    right: 10,
    backgroundColor: '#222',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 22,
    zIndex: 20,
  },
  drawBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  suitChooserRow: {
    position: 'absolute',
    bottom: 200,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  suitBtn: {
    backgroundColor: '#fff',
    marginHorizontal: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#19C37D',
  },
  suitBtnText: {
    color: '#19C37D',
    fontWeight: 'bold',
    fontSize: 18,
    textTransform: 'capitalize',
  },
  welcomeCenter: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height / 2 - 120,
  },
  welcomeTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  waitingTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  noGamesText: {
    color: '#fff',
    fontSize: 16,
    opacity: 0.7,
  },
  waitingGameBtn: {
    backgroundColor: '#19C37D',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    marginTop: 6,
  },
  waitingGameText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
