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
import { router } from 'expo-router';

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

  const isMounted = useRef(true);
  const isSyncingToFirebase = useRef(false);

  // Track previous discard card when discard pile changes (for opponent plays)
  const lastDiscardRef = useRef<Card | null>(null);
  const prevOpponentHandLength = useRef<number>(0);

  const [localTopCard, setLocalTopCard] = useState<Card | null>(null);
  const prevDiscardLength = useRef<number>(0);

  // 1. Add a ref array for north hand cards
  const northHandCardRefs = useRef<(View | null)[]>([]);

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
          // Set syncing flag to prevent auto-sync during Firebase update
          isSyncingToFirebase.current = true;
          
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
            setOpponentLastPlayedCard(opponentData.lastCardPlayed);
          }
          
          // Clear opponent's played card when it becomes current player's turn
          const currentTurn = (gameData.turn === 'player1') === isP1 ? 'south' as Player : 'north' as Player;
          if (currentTurn === 'south' && opponentLastPlayedCard) {
            setOpponentLastPlayedCard(null);
          }
          
          // Clear own lastCardPlayed when it's opponent's turn
          if (currentTurn === 'north') {
            const ownPlayerKey = isP1 ? 'player1' : 'player2';
            const ownData = gameData.players[ownPlayerKey];
            if (ownData && ownData.lastCardPlayed) {
              // Clear the lastCardPlayed field for the current player
              const gameDocRef = doc(db, 'games', currentGameId);
              updateDoc(gameDocRef, {
                [`players.${ownPlayerKey}.lastCardPlayed`]: null
              }).catch((err: any) => {
              });
            }
          }
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
          
          // Detect opponent draw: if opponent's hand increases in length
          const prevLen = prevOpponentHandLength.current;
          const currLen = northHand.length;
          if (currLen > prevLen) {
            setShowCenterCardUp(true);
            animateCenterCardUp();
          }
          prevOpponentHandLength.current = currLen;
          
          // Clear syncing flag after a short delay
          setTimeout(() => {
            isSyncingToFirebase.current = false;
          }, 200);
        }
      }
    });
    
    return () => unsub();
  }, [currentGameId, username]);

  // Auto-sync game state changes to Firebase
  useEffect(() => {
    if (!currentGameId || isPlayer1 === null || gamePhase !== 'playing' || isSyncingToFirebase.current) return;
    
    // Don't sync if this is the initial load from Firebase
    const timeoutId = setTimeout(() => {
      isSyncingToFirebase.current = true;
      updateGameInFirebase(game).finally(() => {
        isSyncingToFirebase.current = false;
      });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [game, currentGameId, isPlayer1, gamePhase]);

  // Log all cards in discard pile on every render
  useEffect(() => {
  }, [game.discard]);

  // Start new game
  async function handleStartNewGame() {
    try {
      // Delete only active games (not completed) where the current user is a player
      const gamesQuery = query(collection(db, 'games'));
      const gamesSnapshot = await getDocs(gamesQuery);
      
      const deletePromises = gamesSnapshot.docs
        .filter(doc => {
          const gameData = doc.data();
          const player1Name = gameData.players?.player1?.name;
          const player2Name = gameData.players?.player2?.name;
          const isPlayerInGame = player1Name === username || player2Name === username;
          const isActiveGame = gameData.status !== 'finished';
          return isPlayerInGame && isActiveGame;
        })
        .map(doc => deleteDoc(doc.ref));
      
      await Promise.all(deletePromises);
      
      const docRef = await addDoc(collection(db, 'games'), {
        status: 'waiting',
        createdAt: serverTimestamp(),
        gameName: username || 'Player',
        players: {
          player1: {
            name: username || 'Player',
            hand: [],
          },
        },
      });
      setCurrentGameId(docRef.id);
      setScreen('game');
    } catch (err) {
    }
  }

  // Join game
  async function handleJoinGame(gameId: string) {
    try {
      const gameDocRef = doc(db, 'games', gameId);
      // Only set player2 if not already set
      const gameSnap = await getDoc(gameDocRef);
      const gameData = gameSnap.exists() ? gameSnap.data() : null;
      if (gameData && (!gameData.players.player2 || !gameData.players.player2.name)) {
        await updateDoc(gameDocRef, {
          status: 'pending_acceptance',
          [`players.player2`]: {
            name: username || 'Player',
            hand: [],
          },
        });
      } else {
        await updateDoc(gameDocRef, { status: 'pending_acceptance' });
      }
      setCurrentGameId(gameId);
      setScreen('game');
    } catch (err) {
    }
  }

  // Update game state in Firebase
  async function updateGameInFirebase(gameState: GameState, lastCardPlayed?: Card) {
    if (!currentGameId || isPlayer1 === null) {
      return;
    }
    try {
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
      }
      
      await updateDoc(gameDocRef, updateData);
    } catch (err) {
      // Don't throw the error, just log it to prevent crashes
    }
  }

  // Handle Deal button
  async function handleDeal() {
    try {
      // Shuffle and prepare deck
      const deck = shuffle(cards as Card[]);
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
            discard = [{ suit: '♠', value: 'A' }];
          }
          setDealtDiscard(discard);
          setDealtStock(stock.slice());
          setTimeout(async () => {
            const newGameState: GameState = {
              hands: { north, south },
              stock,
              discard,
              turn: 'south' as Player,
              currentSuit: discard[0].suit,
              winner: null,
              chooseSuit: false,
            };
            setGame(newGameState);
            setGamePhase('playing');
            // Update Firebase with the new game state (no card played during deal)
            await updateGameInFirebase(newGameState);
          }, 400);
        }, 400);
      }
    }
    dealNext();
    } catch (err) {
      // Reset to init phase on error
      setGamePhase('init');
    }
  }

  // Handle play for either player (with animation for south)
  async function handlePlay(player: Player, idx: number) {
    if (gamePhase !== 'playing') {
      return;
    }
    if ( game.winner !== null || game.chooseSuit) {
      return;
    }
    const card = game.hands[player][idx];
    const top = game.discard[game.discard.length - 1];
    if (!canPlay(card, top, game.currentSuit)) {
      return;
    }
    // Store the current top card as the previous discard card
    if (game.discard.length > 0) {
      setPreviousDiscardCard(game.discard[game.discard.length - 1]);
    }
    if (player === 'south') {
      setLocalTopCard(card);
      setAnimatingCardIndex(idx);
      setAnimatingCard(card);
      InteractionManager.runAfterInteractions(() => {
        function tryMeasure(attempt = 0) {
          const cardRef = handCardRefs.current[idx];
          const discard = discardRef.current;
          if (!cardRef || !discard) {
            finishAnimation();
            setGame(prevGame => playCard(prevGame, player, idx));
            // updateGameInFirebase should be called in a useEffect
            return;
          }
          cardRef.measureInWindow((x, y, width, height) => {
            discard.measureInWindow((dx, dy, dwidth, dheight) => {
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
              animCardX.value = withTiming(dx, { duration: 2500 });
              animCardY.value = withTiming(dy, { duration: 2500 }, (finished) => {
                if (finished) runOnJS(onPlayerCardAnimationEnd)(player, idx);
              });
            });
          });
        }
        setTimeout(() => tryMeasure(), 10);
      });
    } else {
      // fallback (should not happen)
      setGame(prevGame => playCard(prevGame, player, idx));
      // updateGameInFirebase should be called in a useEffect
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
    setGame(prevGame => playCard(prevGame, game.turn, idx, suit));
    setChoosingSuit(false);
    // updateGameInFirebase should be called in a useEffect
  }

  // Handle draw
  async function handleDraw(player: Player) {
    // Only allow draw if it's the local player's turn
    if (gamePhase !== 'playing') return;
    if (game.winner !== null || game.chooseSuit) return;
    // Compute the new game state after drawing a card
    console.log('old game state', game);
    const newGameState = drawCard(game, player);
    console.log('new game state', newGameState);
    setGame(newGameState);
    // Immediately update Firebase with the new game state
    await updateGameInFirebase(newGameState);
    setShowCenterCardDown(true);
    animateCenterCardDown();
  }

  // Accept opponent (for player 1)
  async function handleAcceptOpponent() {
    if (!currentGameId) return;
    try {
      const gameDocRef = doc(db, 'games', currentGameId);
      await updateDoc(gameDocRef, {
        status: 'started',
      });
    } catch (err) {
    }
  }

  // Handle undoing a play by moving top card from discard pile to player's hand
  async function handleUndoPlay(player: Player) {
    // Only allow undo if it's the local player's turn and there are cards in discard pile
    if (gamePhase !== 'playing') return;
    if (game.winner !== null || game.chooseSuit) return;
    if (game.discard.length <= 1) return; // Need at least 2 cards to undo (1 to keep as top, 1 to move back)
    
    // Create a new game state with the top card moved back to player's hand
    const newDiscard = [...game.discard];
    const cardToUndo = newDiscard.pop()!; // Remove the top card
    
    // Update previousDiscardCard to the new top card (or null)
    setPreviousDiscardCard(newDiscard.length > 1 ? newDiscard[newDiscard.length - 2] : null);

    const newGameState: GameState = {
      ...game,
      hands: {
        ...game.hands,
        [player]: [...game.hands[player], cardToUndo]
      },
      discard: newDiscard,
      currentSuit: newDiscard.length > 0 ? newDiscard[newDiscard.length - 1].suit : game.currentSuit
    };
    
    setGame(newGameState);
    // Update Firebase with the new game state
    await updateGameInFirebase(newGameState);
  }

  // Helper for animation end
  function onPlayerCardAnimationEnd(player: Player, idx: number) {
    finishAnimation();
    setGame(prevGame => playCard(prevGame, player, idx));
    // updateGameInFirebase should be called in a useEffect
  }

  // Ensure refs arrays match hand lengths
  if (handCardRefs.current.length !== game.hands.south.length) {
    handCardRefs.current.length = game.hands.south.length;
  }

  // Center card from middle to down (for draw animation)
  const [showCenterCardDown, setShowCenterCardDown] = useState(false);
  const centerCardDownY = useSharedValue(0);

  // Center card from top to middle (for opponent play animation)
  const [showCenterCardTopToMiddle, setShowCenterCardTopToMiddle] = useState(false);
  const centerCardTopToMiddleY = useSharedValue(0);

  // Center card from middle to up (for opponent draw animation)
  const [showCenterCardUp, setShowCenterCardUp] = useState(false);
  const centerCardUpY = useSharedValue(0);

  const centerCardDownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: centerCardDownY.value }],
    opacity: 1 - centerCardDownY.value / (height / 2),
  }));

  const centerCardTopToMiddleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: centerCardTopToMiddleY.value }],
    opacity: 1 + centerCardTopToMiddleY.value / (height / 2),
  }));

  const centerCardUpAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: centerCardUpY.value }],
    opacity: 1 + centerCardUpY.value / (height / 2),
  }));

  function animateCenterCardDown() {
    centerCardDownY.value = 0;
    centerCardDownY.value = withTiming(height, { duration: 2500 }, (finished) => {
      if (finished) runOnJS(setShowCenterCardDown)(false);
    });
  }

  function animateCenterCardUp() {
    centerCardUpY.value = 0.29;
    centerCardUpY.value = withTiming(-height, { duration: 2500 }, (finished) => {
      if (finished) runOnJS(setShowCenterCardUp)(false);
    });
  }

  function animateCenterCardTopToMiddle() {
    centerCardTopToMiddleY.value = -(height * 0.29); // Start from 10% from the top
    centerCardTopToMiddleY.value = withTiming(0, { duration: 2500 }, (finished) => {
      if (finished) runOnJS(setShowCenterCardTopToMiddle)(false);
    });
  }

  // 3. In the useEffect that detects opponent play, measure the north hand card and animate from there
  useEffect(() => {
    if (game.discard.length > 0) {
      const topCard = game.discard[game.discard.length - 1];
      if (
        localTopCard &&
        (localTopCard.suit !== topCard.suit || localTopCard.value !== topCard.value)
      ) {
        // Opponent has added a card
        const added = game.discard.length - prevDiscardLength.current;
        if (added > 0) {
          console.log(`Opponent added ${added} card(s) to the pile.`);
                  // Find the index of the card that was just played (assume it's the last in north hand before update)
        setShowCenterCardTopToMiddle(true);
          animateCenterCardTopToMiddle();
        }
      }
      prevDiscardLength.current = game.discard.length;
    }
  }, [game.discard]);

  // Move these hooks to the top level, before any conditional or return
  const fadeAnim = useRef(new LegacyAnimated.Value(0)).current;
  const emojiScale = useRef(new LegacyAnimated.Value(0.8)).current;
  const [btnScale] = useState(new LegacyAnimated.Value(1));
  useEffect(() => {
    LegacyAnimated.timing(fadeAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
    LegacyAnimated.spring(emojiScale, {
      toValue: 1,
      friction: 3,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, []);
  const onBtnPressIn = () => {
    LegacyAnimated.spring(btnScale, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };
  const onBtnPressOut = () => {
    LegacyAnimated.spring(btnScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  // Only show the playful welcome screen if:
  // - screen === 'welcome' OR
  // - firebaseGameData?.status === 'waiting' OR firebaseGameData?.status === 'pending_acceptance'
  // If firebaseGameData?.status === 'started', show the game table view.
  const showWelcome = (screen === 'welcome') || (firebaseGameData && (firebaseGameData.status === 'waiting' || firebaseGameData.status === 'pending_acceptance'));
  if (showWelcome) {
    return (
      <LinearGradient
        colors={["#14532d", "#006400", "#228B22"]}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 0.9 }}
        style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}
      >
        {/* Playful casino title */}
        <ThemedText style={styles.casinoTitle}>🎲 Dimpo Crazy 8 🎰</ThemedText>
        {/* Casino/joker mascot emoji */}
        <LegacyAnimated.Text
          style={{
            fontSize: 72,
            marginBottom: 10,
            textAlign: 'center',
            transform: [{ scale: emojiScale }],
            shadowColor: '#FFD700',
            shadowOpacity: 0.5,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
          }}
          accessibilityLabel="Joker emoji"
        >
          🃏
        </LegacyAnimated.Text>
        {/* Start New Game button (only show if not waiting for opponent) */}
        {(!firebaseGameData || (firebaseGameData.status !== 'waiting' && firebaseGameData.status !== 'pending_acceptance')) && (
          <LegacyAnimated.View style={{ transform: [{ scale: btnScale }], width: '100%', alignItems: 'center', marginBottom: 10 }}>
            <TouchableOpacity
              style={styles.dealBtnModern}
              onPress={handleStartNewGame}
              activeOpacity={0.85}
              onPressIn={onBtnPressIn}
              onPressOut={onBtnPressOut}
            >
              <ThemedText style={styles.dealBtnTextModern}>Start New Game</ThemedText>
            </TouchableOpacity>
          </LegacyAnimated.View>
        )}
        {/* Animated waiting message (show if waiting for opponent or pending acceptance) */}
        {firebaseGameData && (firebaseGameData.status === 'waiting' || firebaseGameData.status === 'pending_acceptance') && (
          // Host sees accept button if pending_acceptance
          isPlayer1 && firebaseGameData.status === 'pending_acceptance' && firebaseGameData.players?.player2?.name ? (
            <View style={styles.acceptContainer}>
              <ThemedText style={styles.opponentJoinedText}>
                {firebaseGameData.players.player2.name} wants to join!
              </ThemedText>
              <TouchableOpacity style={styles.acceptBtn} onPress={handleAcceptOpponent}>
                <ThemedText style={styles.acceptBtnText}>Accept Opponent</ThemedText>
              </TouchableOpacity>
            </View>
          ) :
          // Player 2 sees waiting for host to accept
          (!isPlayer1 && firebaseGameData.status === 'pending_acceptance') ? (
            <LegacyAnimated.Text
              style={[
                styles.waitingMessagePlayful,
                {
                  opacity: fadeAnim,
                  transform: [{ scale: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.08] }) }],
                },
              ]}
            >
              Waiting for host to accept...
            </LegacyAnimated.Text>
          ) :
          // Default: waiting for opponent to join
          (
            <LegacyAnimated.Text
              style={[
                styles.waitingMessagePlayful,
                {
                  opacity: fadeAnim,
                  transform: [{ scale: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.08] }) }],
                },
              ]}
            >
              Waiting for opponent to join…
            </LegacyAnimated.Text>
          )
        )}
        {/* Games waiting for opponents section (only show if not currently waiting for an opponent) */}
        {(!firebaseGameData || (firebaseGameData.status !== 'waiting' && firebaseGameData.status !== 'pending_acceptance')) && (
          <View style={styles.waitingGamesSection}>
            <ThemedText style={styles.waitingTitleModern}>Games waiting for opponents:</ThemedText>
            {waitingGames.length === 0 && (
              <View style={styles.noGamesModernRow}>
                
                <ThemedText style={styles.noGamesPlayfulText}>No games yet! Be the first to start one!</ThemedText>
              </View>
            )}
            <View style={styles.waitingGamesListModern}>
              {waitingGames.map(game => {
                const createdAt = game.createdAt?.toDate ? game.createdAt.toDate() : new Date();
                const formattedDate = createdAt.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                return (
                  <TouchableOpacity
                    key={game.id}
                    style={styles.waitingGameBtnModern}
                    onPress={() => handleJoinGame(game.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.gameInfoContainerModern}>
                      <ThemedText style={styles.waitingGameTextModern}>🎲 <ThemedText style={{fontWeight:'bold'}}>{game.gameName || 'Player'}</ThemedText></ThemedText>
                      <ThemedText style={styles.gameDateTextModern}>{formattedDate}</ThemedText>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
        {/* Playful casino elements in corners */}
        <View style={[styles.cornerEmojiTL, styles.cornerEmojiTop]}><ThemedText style={styles.cornerEmoji}>🪙</ThemedText></View>
        <View style={[styles.cornerEmojiTR, styles.cornerEmojiTop]}><ThemedText style={styles.cornerEmoji}>🎲</ThemedText></View>
        <View style={styles.cornerEmojiBL}><ThemedText style={styles.cornerEmoji}>🃏</ThemedText></View>
        <View style={styles.cornerEmojiBR}><ThemedText style={styles.cornerEmoji}>🪙</ThemedText></View>
        {/* Cancel Game button */}
        {(firebaseGameData && (firebaseGameData.status === 'waiting' || firebaseGameData.status === 'pending_acceptance')) && (
          <TouchableOpacity
            style={styles.cancelGameBtn}
            onPress={async () => {
              if (currentGameId) {
                try {
                  await deleteDoc(doc(db, 'games', currentGameId));
                  
                } catch (err) {
                  console.error('Error deleting game:', err);
                }
              }
              setCurrentGameId(null);
              router.push('/');
            }}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.cancelGameBtnText}>❌ Cancel Game</ThemedText>
          </TouchableOpacity>
        )}
        {/* Footer */}
        <View style={styles.footer}><ThemedText style={styles.footerText}>© {new Date().getFullYear()} Dimpo Crazy 8</ThemedText></View>
      </LinearGradient>
    );
  }

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
      
      <ThemedView style={styles.container}>
        <LinearGradient
          colors={["#14532d", "#006400", "#228B22"]}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.fullTableBg}
        >
          {/* INIT PHASE: Show deck and Deal button or waiting message */}
          {gamePhase === 'init' && (
            <View style={styles.initCenterFixed}>
              {/* Big deck with glow */}
              <View style={styles.bigDeckContainer}>
                <View style={styles.bigDeckGlow} />
                <Image
                  source={require('../assets/images/facedown-card.png')}
                  style={styles.bigDeckImage}
                  resizeMode="contain"
                />
              </View>
              {/* Deal button or waiting message */}
              {firebaseGameData?.status === 'pending_acceptance' && firebaseGameData?.players?.player2?.name ? (
                isPlayer1 ? (
                  <View style={styles.acceptContainer}>
                    <ThemedText style={styles.opponentJoinedText}>
                      {firebaseGameData.players.player2.name} wants to join!
                    </ThemedText>
                    <TouchableOpacity style={styles.acceptBtn} onPress={handleAcceptOpponent}>
                      <ThemedText style={styles.acceptBtnText}>Accept Opponent</ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.waitingContainer}>
                    <ThemedText style={styles.waitingMessage}>Waiting for host to accept...</ThemedText>
                  </View>
                )
              ) : firebaseGameData?.status === 'started' && firebaseGameData?.players?.player2?.name ? (
                <TouchableOpacity style={styles.dealBtnModernBig} onPress={handleDeal}>
                  <ThemedText style={styles.dealBtnTextModernBig}>🎲 Deal Cards</ThemedText>
                </TouchableOpacity>
              ) : (
                <View style={styles.waitingContainer}>
                  <ThemedText style={styles.waitingMessage}>Waiting for opponent to join...</ThemedText>
                </View>
              )}
            </View>
          )}
          {/* DEALING PHASE: Animate cards being dealt */}
          {gamePhase === 'dealing' && (
            <View style={styles.dealCenter}>
              <View style={{ flexDirection: 'row', marginBottom: 24 }}>
                {dealtHands.north.map((card, idx) => (
                  <View key={idx} style={{ marginLeft: idx === 0 ? 0 : -32, zIndex: idx }}>
                    {getCardBack()}
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 24 }}>
                {dealtHands.south.map((card, idx) => (
                  <View key={idx} style={{ marginLeft: idx === 0 ? 0 : -32, zIndex: idx }}>
                    {getCardBack()}
                  </View>
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
                {/* Permanent facedown card at animation start position */}
                <View style={{ position: 'absolute', top: '45%', left: '50%', transform: [{ translateX: -28 }, { translateY: 0 }], zIndex: 50, alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => handleDraw('south')}
                    style={{ marginBottom: 8 }}
                  >
                    {getCardBack()}
                  </TouchableOpacity>
                  <ThemedText style={styles.drawHintText}>Tap to Draw</ThemedText>
                </View>
                {/* Center card from middle to down (for draw animation) */}
                {showCenterCardDown && (
                  <Animated.View
                    style={[{ position: 'absolute', top: '45%', left: '20%', transform: [{ translateX: -28 }], zIndex: 100 }, centerCardDownAnimStyle]}
                    pointerEvents="none"
                  >
                    <Image
                      source={require('../assets/images/facedown-card.png')}
                      style={{ width: 56, height: 80, borderRadius: 10, marginHorizontal: 6 }}
                      resizeMode="contain"
                    />
                  </Animated.View>
                )}
                {/* Center card from top to middle (for opponent play animation) */}
                {showCenterCardTopToMiddle && (
                  <Animated.View
                    style={[{ position: 'absolute', top: '50%', left: '20%', transform: [{ translateX: -28 }], zIndex: 100 }, centerCardTopToMiddleAnimStyle]}
                    pointerEvents="none"
                  >
                    <Image
                      source={require('../assets/images/facedown-card.png')}
                      style={{ width: 56, height: 80, borderRadius: 10, marginHorizontal: 6 }}
                      resizeMode="contain"
                    />
                  </Animated.View>
                )}
                {/* Center card from middle to up (for opponent draw animation) */}
                {showCenterCardUp && (
                  <Animated.View
                    style={[{ position: 'absolute', top: '45%', left: '50%', transform: [{ translateX: -28 }], zIndex: 100 }, centerCardUpAnimStyle]}
                    pointerEvents="none"
                  >
                    <Image
                      source={require('../assets/images/facedown-card.png')}
                      style={{ width: 56, height: 80, borderRadius: 10, marginHorizontal: 6 }}
                      resizeMode="contain"
                    />
                  </Animated.View>
                )}
                <View style={styles.pilesRow}>
                  {/* Spacer to separate stock and discard piles */}
                  <View style={{ width: 32 }} />
                  {/* Discard pile - show top 2 cards from firebase discardPile */}
                  <TouchableOpacity
                    onPress={() => handleUndoPlay('south')}
                    disabled={ game.winner !== null || game.chooseSuit || (firebaseGameData?.discardPile?.length ?? game.discard.length) <= 1}
                    style={{
                      alignItems: 'center',
                      position: 'relative',
                      minHeight: 170,
                      minWidth: 120,
                    }}
                  >
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
                        {(() => {
                          const discardPile = firebaseGameData?.discardPile ?? game.discard;
                          const len = discardPile.length;
                          // Show second-to-top card (if exists)
                          if (len > 1) {
                            const secondTop = discardPile[len - 2];
                            return (
                              <View style={{
                                position: 'absolute',
                                left: -32,
                                top: 16,
                                zIndex: 1,
                                opacity: 0.7,
                              }}>
                                <CasinoCard suit={secondTop.suit} value={secondTop.value} style={{ width: 120, height: 170 }} />
                              </View>
                            );
                          }
                          return null;
                        })()}
                        {(() => {
                          const discardPile = firebaseGameData?.discardPile ?? game.discard;
                          const len = discardPile.length;
                          if (len > 0) {
                            const top = discardPile[len - 1];
                            return (
                              <View style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                zIndex: 2,
                              }}>
                                <CasinoCard suit={top.suit} value={top.value} style={{ width: 120, height: 170 }} />
                              </View>
                            );
                          }
                          return null;
                        })()}
                      </View>
                    </View>
                    {/* Show hint text when it's the player's turn and they can undo */}
                    { game.winner === null && !game.chooseSuit && ((firebaseGameData?.discardPile?.length ?? game.discard.length) > 1) && (
                      <ThemedText style={styles.undoHintText}>Tap to Undo</ThemedText>
                    )}
                  </TouchableOpacity>
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
                      disabled={ game.winner !== null || game.chooseSuit || !canPlay(card, game.discard[game.discard.length - 1], game.currentSuit)}
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
                            ref={ref => (northHandCardRefs.current[idx] = ref)}
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
  initCenterFixed: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
    paddingTop: 40,
    paddingBottom: 40,
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
    color: '#222',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  waitingTitle: {
    color: '#222',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  noGamesText: {
    color: '#444',
    fontSize: 16,
    opacity: 1,
  },
  waitingGameBtn: {
    backgroundColor: '#19C37D',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    marginTop: 6,
  },
  waitingGameText: {
    color: '#222',
    fontWeight: 'bold',
    fontSize: 16,
  },
  drawHintText: {
    color: '#444',
    fontSize: 12,
    fontWeight: '500',
    opacity: 1,
    textAlign: 'center',
  },
  undoHintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 24,
  },
  gameInfoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameDateText: {
    color: '#555',
    fontSize: 12,
    opacity: 1,
    marginTop: 2,
  },
  waitingContainer: {
    marginLeft: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingMessage: {
    color: '#444',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    opacity: 1,
  },
  acceptContainer: {
    marginLeft: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opponentJoinedText: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 18,
    textShadowColor: '#222',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  acceptBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    elevation: 3,
  },
  acceptBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  welcomeFadeIn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  welcomeCard: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 32,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    marginBottom: 32,
    width: width > 400 ? 380 : '90%',
    minWidth: 320,
  },
  welcomeLogo: {
    width: 72,
    height: 72,
    marginBottom: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#22c55e',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  waitingGamesList: {
    width: '100%',
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.18)',
    paddingVertical: 6,
    paddingHorizontal: 2,
    shadowColor: '#22c55e',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    minHeight: 32,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  footerText: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.5,
    textAlign: 'center',
  },
  welcomeBg: {
    backgroundColor: '#f7f7fa',
  },
  // Modernized welcome card styles
  welcomeCardModern: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 36,
    paddingVertical: 40,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22c55e',
    shadowOpacity: 0.12,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.13)',
    marginBottom: 32,
    width: width > 400 ? 400 : '92%',
    minWidth: 320,
    backdropFilter: 'blur(12px)', // for web, ignored on native
  },
  welcomeTitleModern: {
    color: '#222',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  welcomeSubtitleModern: {
    color: '#444',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.85,
  },
  dealBtnModern: {
    backgroundColor: '#19C37D',
    marginLeft: 0,
    paddingHorizontal: 36,
    paddingVertical: 20,
    borderRadius: 32,
    elevation: 6,
    shadowColor: '#19C37D',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    marginBottom: 18,
    width: '100%',
  },
  dealBtnTextModern: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 22,
    letterSpacing: 1,
    textAlign: 'center',
  },
  dividerModern: {
    width: '80%',
    height: 1.5,
    backgroundColor: 'rgba(34,197,94,0.13)',
    marginVertical: 18,
    borderRadius: 1,
    alignSelf: 'center',
  },
  waitingTitleModern: {
    color: '#222',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  noGamesModernRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  noGamesBigEmoji: {
    fontSize: 54,
    marginBottom: 8,
    textAlign: 'center',
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  noGamesPlayfulText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: '#222',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    marginBottom: 4,
  },
  waitingGamesListModern: {
    width: '100%',
    marginTop: 8,
    
    backgroundColor: 'rgba(34,197,94,0.06)',
   
    paddingVertical: 6,
    paddingHorizontal: 2,
    shadowColor: '#22c55e',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    minHeight: 32,
    alignItems: 'center',
  },
  waitingGameBtnModern: {
    backgroundColor: '#fffbe6', // subtle gold/cream
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 22,
    marginTop: 0,
    marginBottom: 18,
    shadowColor: '#FFD700',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 2,
    borderColor: '#FFD700',
    width: 240,
    alignItems: 'center',
    elevation: 4,
  },
  waitingGameTextModern: {
    color: '#19C37D',
    fontWeight: 'bold',
    fontSize: 20,
    marginBottom: 2,
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    letterSpacing: 0.5,
  },
  gameInfoContainerModern: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameDateTextModern: {
    color: '#555',
    fontSize: 12,
    opacity: 1,
    marginTop: 2,
  },
  casinoTitle: {
    color: '#FFD700',
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 32,
    marginBottom: 8,
    textShadowColor: '#222',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  glowCardBackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  glowCardBack: {
    position: 'absolute',
    width: 66,
    height: 90,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.18)',
    shadowColor: '#FFD700',
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    zIndex: -1,
  },
  waitingMessagePlayful: {
    color: '#FFD700',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 18,
    marginBottom: 18,
    textAlign: 'center',
    textShadowColor: '#222',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    letterSpacing: 1.1,
  },
  cornerEmoji: {
    fontSize: 32,
    opacity: 0.85,
  },
  cornerEmojiTL: {
    position: 'absolute',
    top: 18,
    left: 18,
  },
  cornerEmojiTR: {
    position: 'absolute',
    top: 18,
    right: 18,
  },
  cornerEmojiBL: {
    position: 'absolute',
    bottom: 32,
    left: 18,
  },
  cornerEmojiBR: {
    position: 'absolute',
    bottom: 32,
    right: 18,
  },
  cornerEmojiTop: {
    marginTop: 18,
  },
  waitingGamesSection: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelGameBtn: {
    backgroundColor: 'rgba(220,38,38,0.9)',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    shadowColor: '#dc2626',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  cancelGameBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    textShadowColor: '#222',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bigDeckContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 24,
    marginBottom: 24,
    position: 'relative',
  },
  bigDeckGlow: {
    position: 'absolute',
    width: 140,
    height: 200,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 215, 0, 0.18)',
    shadowColor: '#FFD700',
    shadowOpacity: 0.7,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
    zIndex: -1,
  },
  bigDeckImage: {
    width: 120,
    height: 180,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#FFD700',
    shadowColor: '#222',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  dealBtnModernBig: {
    backgroundColor: 'linear-gradient(90deg, #FFD700 0%, #19C37D 100%)',
    marginLeft: 24,
    paddingHorizontal: 48,
    paddingVertical: 22,
    borderRadius: 36,
    elevation: 8,
    shadowColor: '#FFD700',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    marginTop: 12,
    marginBottom: 8,
    width: 260,
    alignItems: 'center',
  },
  dealBtnTextModernBig: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 28,
    letterSpacing: 1.2,
    textAlign: 'center',
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
