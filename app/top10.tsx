import React, { useEffect, useState, useRef } from 'react';
import { Image, View, StyleSheet, TouchableOpacity, Dimensions, Alert, ScrollView, findNodeHandle, InteractionManager, Animated as LegacyAnimated, Button, Linking, Modal, ActivityIndicator, Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
import {  onSnapshot,  serverTimestamp, doc, updateDoc, getDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { useUsername } from '@/hooks/useUsername';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { getPlayer } from '@/services/playersService';
import { useAuth } from '@/contexts/AuthContext';
import type { Card as CardType } from '@/app/crazyEightsGame';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');


// Number of cards to deal to each player
const CARDS_PER_PLAYER = 0; // Deal zero cards to players

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

// Generate consistent random transformations for cards
function getCardTransformations(card: Card, index: number) {
  // Use card properties and index to generate consistent random values
  const seed = card.suit.charCodeAt(0) + card.value.charCodeAt(0) + index;
  const random = (seed * 9301 + 49297) % 233280;
  const normalized = random / 233280;
  
  const rotation = (normalized - 0.5) * 8; // Random rotation between -4 and 4 degrees
  const translateX = (normalized - 1.5) * 6; // Random horizontal offset between -3 and 3
  const translateY = (normalized - 0.5) * 4; // Random vertical offset between -2 and 2
  const scale = 0.95 + (normalized * 0.1); // Random scale between 0.95 and 1.05
  
  return { rotation, translateX, translateY, scale };
}

// Helper to check if in development mode
const isDev = __DEV__ || process.env.NODE_ENV === 'development';

export default function CasinoGameScreen() {
  const { username, isLoading: usernameLoading } = useUsername();
  const { user, isLoading: authLoading } = useAuth();
  const { gameId } = useLocalSearchParams();
  const [game, setGame] = useState<GameState>(initGame());
  const [firebaseGameData, setFirebaseGameData] = useState<any>(null);
  const [choosingSuit, setChoosingSuit] = useState(false);
  const [gamePhase, setGamePhase] = useState<'init' | 'dealing' | 'playing'>('init');
  const [dealtHands, setDealtHands] = useState<{ north: Card[]; south: Card[] }>({ north: [], south: [] });
  const [dealtStock, setDealtStock] = useState<Card[]>([]);
  const [dealtDiscard, setDealtDiscard] = useState<Card[]>([]);
  const [screen, setScreen] = useState<'welcome' | 'game'>('welcome');
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

  const opponentCardAnimStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: typeof opponentCardX?.value === 'number' ? opponentCardX.value : 0,
    top: typeof opponentCardY?.value === 'number' ? opponentCardY.value : 0,
    zIndex: 100,
  }));

  const isMounted = useRef(true);
  const isSyncingToFirebase = useRef(false);

  // Track previous discard card when discard pile changes (for opponent plays)
  const lastDiscardRef = useRef<Card | null>(null);
  const prevOpponentHandLength = useRef<number>(0);

  const [localTopCard, setLocalTopCard] = useState<Card | null>(null);
  const prevDiscardLength = useRef<number>(0);
  const [opponentPhoneNumber, setOpponentPhoneNumber] = useState<string | null>(null);
  const [showGameCancelledPopup, setShowGameCancelledPopup] = useState(false);
  const [cancelledGameInfo, setCancelledGameInfo] = useState<{cancelledBy: string, reason: string} | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [gamePoints, setGamePoints] = useState<{
    south: { total: number; cards: Card[]; breakdown: { [key: string]: number } };
    north: { total: number; cards: Card[]; breakdown: { [key: string]: number } };
  } | null>(null);

  // 1. Add a ref array for north hand cards
  const northHandCardRefs = useRef<(View | null)[]>([]);

  // Add at the top of the component, after other refs:
  const autoDealtRef = useRef(false);

  // Reset autoDealtRef if game resets or new gameId
  useEffect(() => {
    if (gamePhase === 'init') {
      autoDealtRef.current = false;
    }
  }, [gamePhase, currentGameId]);

  // Reset turn-specific states when turn changes
  useEffect(() => {
    if (game.turn === 'north') {
      setHasAddedCardsThisTurn(false);
      setOpponentCardSelected(false);
      setHasDrawnThisTurn(false);
      setSelectedDiscardIndices([]);
      setDrawnCardIndex(null);
      drawnCardIndexRef.current = null;
    }
  }, [game.turn]);

  // Improved auto-deal effect with logging
  useEffect(() => {
    if (
      gamePhase === 'init' &&
      isPlayer1 === true &&
      firebaseGameData?.status === 'started' &&
      firebaseGameData?.players?.player1?.name &&
      firebaseGameData?.players?.player2?.name &&
      !autoDealtRef.current
    ) {
      autoDealtRef.current = true;
      handleDeal();
    }
  }, [gamePhase, isPlayer1, firebaseGameData, currentGameId]);

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

  // Initialize currentGameId from URL params
  useEffect(() => {
    if (gameId && typeof gameId === 'string') {
      setCurrentGameId(gameId);
      setScreen('game');
    }
  }, [gameId]);

  // Listen for current game updates
  useEffect(() => {
    if (!currentGameId) return;
    
    const gameDoc = doc(db, 'games', currentGameId);
    const unsub = onSnapshot(gameDoc, (docSnapshot) => {
      // Check if component is still mounted before updating state
      if (!isMounted.current) return;
      
      if (!docSnapshot.exists()) {
        // Game was deleted
        setCancelledGameInfo({
          cancelledBy: 'Opponent',
          reason: 'Game was deleted'
        });
        setShowGameCancelledPopup(true);
        return;
      }
      
      if (docSnapshot.exists()) {
        const gameData = docSnapshot.data();
        
        // Check if component is still mounted before updating state
        if (!isMounted.current) return;
        
        setFirebaseGameData(gameData);
        
        // Check for game cancellation
        if (gameData.status === 'cancelled' || gameData.status === 'deleted') {
          const cancelledBy = gameData.cancelledBy || 'Opponent';
          const reason = gameData.cancellationReason || 'Game was cancelled';
          
          setCancelledGameInfo({
            cancelledBy,
            reason
          });
          setShowGameCancelledPopup(true);
          return;
        } else {
          // If the popup is showing but game is not cancelled, hide it
          if (showGameCancelledPopup) {
            setShowGameCancelledPopup(false);
            setCancelledGameInfo(null);
          }
        }
        
                if (gameData && gameData.players && gameData.players.player1 && gameData.players.player2) {
          // Set syncing flag to prevent auto-sync during Firebase update
          isSyncingToFirebase.current = true;
          
          // Replace the old isP1 logic with UID-based logic and add logging
          let isP1 = null;
          if (gameData.players.player1?.uid && user?.uid && gameData.players.player1.uid === user.uid) {
            isP1 = true;
          } else if (gameData.players.player2?.uid && user?.uid && gameData.players.player2.uid === user.uid) {
            isP1 = false;
          }
          
          // Only update isPlayer1 if we can determine it, otherwise keep the current value
          if (isP1 !== null) {
            setIsPlayer1(isP1);
          } else {
            // Don't update isPlayer1 if we can't determine it
            // Also don't show game cancelled popup if we can't determine player position
            if (showGameCancelledPopup) {
              setShowGameCancelledPopup(false);
              setCancelledGameInfo(null);
            }
            return;
          }

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
          
          // Preserve drawn card index when Firebase updates
          if (drawnCardIndex !== null) {
            const newDiscardPile = Array.isArray(gameData.discardPile) ? gameData.discardPile : (gameData.currentCard ? [gameData.currentCard] : []);
            // If the drawn card index is now out of bounds, reset it
            if (drawnCardIndex >= newDiscardPile.length) {
              setDrawnCardIndex(null);
            }
          }
          
          // Only set gamePhase to 'init' if both hands are empty, otherwise set to 'playing'
          setGamePhase('playing');
          setPlayerNames({
            south: isP1 ? (gameData.players.player1?.name || username) : (gameData.players.player2?.name || 'Player 2'),
            north: isP1 ? (gameData.players.player2?.name || 'Player 2') : (gameData.players.player1?.name || username),
          });
          
            // Detect opponent draw: check if discard pile increased during opponent's turn
  const prevDiscardLen = prevDiscardLength.current;
  const currDiscardLen = discardPile.length;
  const isOpponentTurn = gameData.turn === (isP1 ? 'player2' : 'player1');
  
  if (currDiscardLen > prevDiscardLen && isOpponentTurn) {
    const numAdded = currDiscardLen - prevDiscardLen;
    
    if (numAdded === 1) {
      // This is likely an opponent draw - show draw animation
      setIsOpponentDrawing(true);
      setAnimatingDrawCard({ suit: '♠', value: '?' }); // Use a placeholder card for opponent draw
      
      // Animate from draw pile to discard pile (center of screen)
      InteractionManager.runAfterInteractions(() => {
        const startX = width - 24 - 28; // Draw pile position: right: 24, card width: 56/2 = 28
        const startY = height - 32 - 40; // Draw pile position: bottom: 32, card height: 80/2 = 40
        const endX = width / 2 - 28; // Center of screen (discard pile)
        const endY = height / 2 - 40; // Center of screen (discard pile)
        
        // Set initial position to draw pile (bottom right)
        drawCardX.value = startX;
        drawCardY.value = startY;
        
        setTimeout(() => {
          drawCardX.value = withTiming(endX, { duration: 800 });
          drawCardY.value = withTiming(endY, { duration: 800 });
          
          setTimeout(() => {
            setAnimatingDrawCard(null);
            setIsOpponentDrawing(false);
          }, 900);
        }, 100);
      });
    }
  }
  
  // Update the discard length ref
  prevDiscardLength.current = currDiscardLen;
          
          // Clear syncing flag after a short delay
          setTimeout(() => {
            isSyncingToFirebase.current = false;
          }, 200);
          
          // Fetch opponent's phone number
          fetchOpponentPhoneNumber();
          
          // Also try to fetch immediately if we have the data
          if (gameData.players) {
            const opponentPlayerKey = isP1 ? 'player2' : 'player1';
            const opponentData = gameData.players[opponentPlayerKey];
            if (opponentData?.uid) {
              getPlayer(opponentData.uid).then(opponentPlayer => {
                if (opponentPlayer?.whatsappNumber) {
                  setOpponentPhoneNumber(opponentPlayer.whatsappNumber);
                }
              }).catch(error => {
              });
            }
          }
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
      // Check if component is still mounted before syncing
      if (!isMounted.current) return;
      
      isSyncingToFirebase.current = true;
      updateGameInFirebase(game).finally(() => {
        if (isMounted.current) {
          isSyncingToFirebase.current = false;
        }
      });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [game, currentGameId, isPlayer1, gamePhase]);

  // Log all cards in discard pile on every render
  useEffect(() => {
  }, [game.discard]);

  // Cleanup animation states when component unmounts or game changes
  useEffect(() => {
    return () => {
      // Clear animation states on cleanup
      setAnimatingDrawCard(null);
      setAnimatingCard(null);
      setAnimatingOpponentCard(null);
      setAnimatingCardsDown([]);
      setAnimatingCardsUp([]);
      setShowCenterCardDown(false);
      setShowCenterCardUp(false);
      setShowCenterCardTopToMiddle(false);
      setDrawnCardIndex(null);
      drawnCardIndexRef.current = null;
      setIsOpponentDrawing(false);
    };
  }, []);

  // Handle game started from lobby
  function handleGameStarted(gameId: string) {
    setCurrentGameId(gameId);
    setScreen('game');
  }

  // Handle game joined from lobby
  function handleGameJoined(gameId: string) {
    setCurrentGameId(gameId);
    setScreen('game');
  }

  // Handle cancel game from lobby
  function handleCancelGame() {
    setCurrentGameId(null);
    setScreen('welcome');
  }

  // Handle popup dismissal
  const handlePopupDismiss = () => {
    setShowGameCancelledPopup(false);
    setCancelledGameInfo(null);
    setCurrentGameId(null);
    router.push('/');
  };

  // Handle leave game (remove player from game)
  async function handleLeaveGame() {
    if (!currentGameId || isPlayer1 === null) return;
    
    const title = 'Leave Game';
    const message = 'Are you sure you want to leave this game? This will delete the game entirely.';
    
    Alert.alert(
      title,
      message,
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              const gameDocRef = doc(db, 'games', currentGameId);
              
              // Both player 1 and player 2 will delete the game when leaving
              // Set status to cancelled first to show popup to opponent
              await updateDoc(gameDocRef, {
                status: 'cancelled',
                cancelledBy: username || 'Player',
                cancellationReason: 'Game was cancelled',
                cancelledAt: serverTimestamp(),
              });
              
              // Delete the game after a short delay to allow popup to show
              setTimeout(async () => {
                try {
                  await deleteDoc(gameDocRef);
                } catch (err) {
                }
              }, 3000); // 3 second delay
              
              // Reset local state
              setCurrentGameId(null);
            } catch (err) {
              Alert.alert('Error', 'Failed to leave the game. Please try again.');
            }
          },
        },
      ]
    );
  }

  // Fetch opponent's phone number from players collection
  async function fetchOpponentPhoneNumber() {
    if (!firebaseGameData?.players || isPlayer1 === null) {
      return;
    }
    
    try {
      const opponentPlayerKey = isPlayer1 ? 'player2' : 'player1';
      const opponentData = firebaseGameData.players[opponentPlayerKey];
      
      if (opponentData?.uid) {
        const opponentPlayer = await getPlayer(opponentData.uid);
        
        if (opponentPlayer?.whatsappNumber) {
          setOpponentPhoneNumber(opponentPlayer.whatsappNumber);
        }
      }
    } catch (error) {
    }
  }

  // Calculate points for a player's hand
  function isSpade(card: Card) {
    return card.suit === '♠' || card.suit === 'spades';
  }
  function isHeart(card: Card) {
    return card.suit === '♥' || card.suit === 'hearts';
  }
  function isClub(card: Card) {
    return card.suit === '♣' || card.suit === 'clubs';
  }
  function isDiamond(card: Card) {
    return card.suit === '♦' || card.suit === 'diamonds';
  }

  function calculatePlayerPoints(hand: Card[]) {
    let total = 0;
    const breakdown: { [key: string]: number } = {};
    
    hand.forEach(card => {
      let points = 0;
      let reason = '';
      // A (all) = 1 each
      if (card.value === 'A') {
        points = 1;
        reason = 'Ace';
      }
      // 10 (spade, heart, clubs) = 1 each
      else if (card.value === '10' && (isSpade(card) || isHeart(card) || isClub(card))) {
        points = 1;
        reason = `10 of ${card.suit.charAt(0).toUpperCase() + card.suit.slice(1)}`;
      }
      // 10 (diamond) = 2
      else if (card.value === '10' && isDiamond(card)) {
        points = 2;
        reason = '10 of Diamonds';
      }
      // 2 spade = 1
      else if (card.value === '2' && isSpade(card)) {
        points = 1;
        reason = '2 of Spades';
      }
      
      if (points > 0) {
        total += points;
        if (breakdown[reason]) {
          breakdown[reason] += points;
        } else {
          breakdown[reason] = points;
        }
      }
    });
    return { total, cards: hand, breakdown };
  }

  // Check if game should end and calculate points
  function checkGameEnd(finalGameState: GameState) {
    // Log all relevant info
    console.log('[checkGameEnd] firebaseGameData.lastMover:', firebaseGameData?.lastMover);
    if (!firebaseGameData?.lastMover || !['player1', 'player2'].includes(firebaseGameData.lastMover)) {
      console.log('[checkGameEnd] lastMover not set or invalid, skipping end logic.');
      return;
    }
    // Get hands from firebaseGameData.players for Firestore update
    const player1Hand = (firebaseGameData?.players?.player1?.hand || []).slice();
    const player2Hand = (firebaseGameData?.players?.player2?.hand || []).slice();
    const moverKey = firebaseGameData.lastMover; // 'player1' or 'player2'
    const discardPile = finalGameState.discard;
    if (moverKey === 'player1') {
      player1Hand.push(...discardPile);
    } else {
      player2Hand.push(...discardPile);
    }
    // For local state/UI, still use south/north mapping for compatibility
    let hands = { ...finalGameState.hands };
    if (isPlayer1 !== null) {
      if (moverKey === 'player1') {
        hands = {
          ...hands,
          [isPlayer1 ? 'south' : 'north']: [...hands[isPlayer1 ? 'south' : 'north'], ...discardPile],
        };
      } else {
        hands = {
          ...hands,
          [isPlayer1 ? 'north' : 'south']: [...hands[isPlayer1 ? 'north' : 'south'], ...discardPile],
        };
      }
    }
    setGame(prev => ({
      ...prev,
      hands,
      discard: [],
    }));
    // Calculate points for UI (south/north)
    const southPoints = calculatePlayerPoints(hands.south);
    const northPoints = calculatePlayerPoints(hands.north);
    setGamePoints({
      south: southPoints,
      north: northPoints
    });
    setShowPointsModal(true);
    // Wait 5 seconds before updating Firestore to mark game as finished and store points and hands
    if (currentGameId) {
      setTimeout(() => {
        const gameDocRef = doc(db, 'games', currentGameId);
        console.log('[checkGameEnd] Writing finished state to Firestore.');
        updateDoc(gameDocRef, {
          status: 'finished',
          lastUpdated: serverTimestamp(),
          points: {
            player1: calculatePlayerPoints(player1Hand),
            player2: calculatePlayerPoints(player2Hand)
          },
          'players.player1.hand': player1Hand,
          'players.player2.hand': player2Hand,
        }).then(() => {
          console.log('[checkGameEnd] Firestore update success');
        }).catch((err: any) => {
          console.error('Error updating game status:', err);
        });
      }, 1000);
    }
  }

  // Manual test function for debugging
  async function testFetchPhoneNumber() {
    await fetchOpponentPhoneNumber();
  }

  // Handle WhatsApp call
  async function handleWhatsAppCall() {
    if (!opponentPhoneNumber) {
      Alert.alert('No Phone Number', 'Opponent has not shared their phone number.');
      return;
    }
    
    try {
      // Format phone number for WhatsApp
      let formattedNumber = opponentPhoneNumber.replace(/[^\d+]/g, '');
      
      // Handle South African numbers: if starts with 0, remove it and add +27
      if (formattedNumber.startsWith('0')) {
        formattedNumber = '27' + formattedNumber.substring(1);
      }
      
      // Try to open WhatsApp directly
      const whatsappUrl = `https://wa.me/${formattedNumber}`;
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        // Fallback to web WhatsApp
        const webWhatsappUrl = `https://wa.me/${formattedNumber}`;
        await Linking.openURL(webWhatsappUrl);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open WhatsApp. Please try again.');
    }
  }

  // Update game state in Firebase
  async function updateGameInFirebase(gameState: GameState, lastCardPlayed?: Card) {
    if (!currentGameId || isPlayer1 === null) {
      return;
    }
    try {
      const gameDocRef = doc(db, 'games', currentGameId);
      
      // Get current game data to preserve UIDs
      const currentGameDoc = await getDoc(gameDocRef);
      const currentGameData = currentGameDoc.exists() ? currentGameDoc.data() : null;
      
      // Use current username with fallbacks
      const currentUsername = username || user?.displayName || user?.email?.split('@')[0] || 'Player';
      
      // Prepare the update data
      const updateData: any = {
        players: {
          player1: {
            name: currentGameData?.players?.player1?.name || 'Player 1',
            hand: isPlayer1 ? gameState.hands.south : gameState.hands.north,
            ...(currentGameData?.players?.player1?.uid && { uid: currentGameData.players.player1.uid }),
          },
          player2: {
            name: currentGameData?.players?.player2?.name || 'Player 2',
            hand: isPlayer1 ? gameState.hands.north : gameState.hands.south,
            ...(currentGameData?.players?.player2?.uid && { uid: currentGameData.players.player2.uid }),
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
    }
  }

  // Handle Deal button
  async function handleDeal() {
    try {
      // Shuffle and prepare deck
      const deck = shuffle((cards as Card[]).filter(card => card.value !== 'Q' && card.value !== 'K' && card.value !== 'J' && card.value !== 'Joker'));
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
            // Start discard pile as empty
            let discard: Card[] = [];
            setDealtDiscard(discard);
            setDealtStock(stock.slice());
            setTimeout(async () => {
              const newGameState: GameState = {
                hands: { north, south },
                stock,
                discard,
                turn: 'south' as Player,
                currentSuit: '', // No current suit if discard is empty
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
      // If zero cards per player, skip animation and go straight to playing phase
      if (CARDS_PER_PLAYER === 0) {
        // Start discard pile as empty
        let discard: Card[] = [];
        setDealtDiscard(discard);
        setDealtStock(stock.slice());
        const newGameState: GameState = {
          hands: { north, south },
          stock,
          discard,
          turn: 'south' as Player,
          currentSuit: '', // No current suit if discard is empty
          winner: null,
          chooseSuit: false,
        };
        setGame(newGameState);
        setGamePhase('playing');
        await updateGameInFirebase(newGameState);
      } else {
        dealNext();
      }
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
    const top = game.discard[game.discard.length - 1] ?? undefined;
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
              animCardX.value = withTiming(dx, { duration: 1000 });
              animCardY.value = withTiming(dy, { duration: 1000 }, (finished) => {
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
    // If stock is empty, do nothing
    if (game.stock.length === 0) return;
    // Only allow draw if it's the local player's turn
    if (game.turn !== 'south') return;
    // Only allow one draw per turn
    if (hasDrawnThisTurn) return;
    
    // Get the card to be drawn
    const drawnCard = game.stock[0];
    
    // Safety check - ensure we have a valid card
    if (!drawnCard) return;
    
    // Capture current game state to avoid stale closure issues
    const currentGame = game;
    const currentDrawnCard = drawnCard;
    
    // Start animation
    setAnimatingDrawCard(drawnCard);
    
    // Safety timeout to prevent animation from getting stuck
    const safetyTimeout = setTimeout(() => {
      if (isMounted.current) {
        setAnimatingDrawCard(null);
        setHasDrawnThisTurn(true);
      }
    }, 3000); // 3 second timeout
    
    // Use InteractionManager to ensure layout is complete
    InteractionManager.runAfterInteractions(() => {
      // Check if component is still mounted
      if (!isMounted.current) {
        clearTimeout(safetyTimeout);
        return;
      }
      
      // Calculate positions more accurately
      // Draw pile is at bottom right: position: 'absolute', bottom: 32, right: 24
      // Discard pile is centered in the middle area
      const startX = width - 80; // Approximate draw pile X position
      const startY = height - 120; // Approximate draw pile Y position
      const endX = width / 2 - 28; // Center of screen, offset for card width
      const endY = height / 2 - 40; // Center of screen, offset for card height
      
      // Set initial position
      drawCardX.value = startX;
      drawCardY.value = startY;
      
      // Add a small delay to make the animation more visible
      setTimeout(() => {
        // Check if component is still mounted
        if (!isMounted.current) {
          clearTimeout(safetyTimeout);
          return;
        }
        
        // Animate to discard pile
        drawCardX.value = withTiming(endX, { duration: 800 });
        drawCardY.value = withTiming(endY, { duration: 800 });
        
        // Use a separate timeout for completion instead of callback
        setTimeout(() => {
          // Check if component is still mounted
          if (!isMounted.current) {
            clearTimeout(safetyTimeout);
            return;
          }
          
                      try {
              // Clear safety timeout
              clearTimeout(safetyTimeout);
              
              // Animation finished, update game state using captured values
              const newStock = currentGame.stock.slice(1);
              
              // Check if the drawn card is a 10 - if so, auto-move it to player's hand
              if (currentDrawnCard.value === '10') {
                // Add the 10 directly to player's hand instead of discard pile
                const newHand = [...currentGame.hands.south, currentDrawnCard];
              const newGameState: GameState = {
                ...currentGame,
                stock: newStock,
                hands: {
                  ...currentGame.hands,
                  south: newHand,
                },
                // Don't update discard pile or currentSuit since 10 goes to hand
              };
              
              // Update state in order to prevent race conditions
              setAnimatingDrawCard(null); // Clear animation first
              setHasDrawnThisTurn(false); // Allow drawing again since 10 was auto-moved
              setGame(newGameState); // Update game state last
              
              // Clear drawn card tracking since 10 goes directly to hand
              setDrawnCardIndex(null);
              drawnCardIndexRef.current = null;
              setSelectedDiscardIndices([]);
              
              // Update Firebase with the new game state
              setTimeout(() => {
                updateGameInFirebase(newGameState).catch(() => {
                  // Ignore Firebase errors to prevent crashes
                });
              }, 100);
            } else {
              // Normal flow for non-10 cards
              const newDiscard = [...currentGame.discard, currentDrawnCard];
              const newGameState: GameState = {
                ...currentGame,
                stock: newStock,
                discard: newDiscard,
                currentSuit: currentDrawnCard.suit, // Update current suit to the drawn card's suit
              };
              
              // Update state in order to prevent race conditions
              setAnimatingDrawCard(null); // Clear animation first
              setHasDrawnThisTurn(true); // Mark that player has drawn this turn
              setGame(newGameState); // Update game state last
              
              // Automatically add the drawn card to the selection (it will be the last card in the discard pile)
              // Use the Firebase discard pile length to calculate the correct index
              const currentDiscardPile = firebaseGameData?.discardPile ?? currentGame.discard;
              const newDrawnCardIndex = currentDiscardPile.length; // The new card will be at the end
              
              // Set the drawn card index and selection immediately
              setDrawnCardIndex(newDrawnCardIndex);
              drawnCardIndexRef.current = newDrawnCardIndex; // Also set the ref
              setSelectedDiscardIndices([newDrawnCardIndex]);
              
              // Update Firebase with the new game state (don't await to avoid blocking)
              // Add a small delay to ensure local state is set first
              setTimeout(() => {
                updateGameInFirebase(newGameState).catch(() => {
                  // Ignore Firebase errors to prevent crashes
                });
              }, 100);
            }
          } catch (error) {
            // Safety fallback - clear animation state
            clearTimeout(safetyTimeout);
            if (isMounted.current) {
              setAnimatingDrawCard(null);
              setHasDrawnThisTurn(true);
            }
          }
        }, 900); // Slightly longer than animation duration to ensure completion
      }, 100); // 100ms delay
    });
  }

  // Handle end turn
  async function handleEndTurn() {
    if (gamePhase !== 'playing') return;
    if (game.winner !== null || game.chooseSuit) return;
    // Only allow end turn if it's the local player's turn
    if (game.turn !== 'south') return;
    
    // Switch turn to opponent
    const newGameState: GameState = {
      ...game,
      turn: 'north' as Player,
    };
    setGame(newGameState);
    // Reset turn-specific states
    setHasAddedCardsThisTurn(false);
    setOpponentCardSelected(false);
    setHasDrawnThisTurn(false);
    setSelectedDiscardIndices([]);
    setDrawnCardIndex(null);
    // Update Firebase with the new game state
    await updateGameInFirebase(newGameState);

    // Only check for game end after turn ends and draw pile is empty
    if (newGameState.stock.length === 0 && (newGameState.hands.south.length > 0 || newGameState.hands.north.length > 0)) {
      checkGameEnd(newGameState);
    }
  }

  // Handle opponent card selection
  async function handleOpponentCardSelect() {
    if (gamePhase !== 'playing') {
      return;
    }
    if (game.winner !== null || game.chooseSuit) {
      return;
    }
    // Only allow selection if it's the local player's turn and they've added cards this turn
    if (game.turn !== 'south' || !hasAddedCardsThisTurn) {
      return;
    }
    // Toggle selection
    setOpponentCardSelected(!opponentCardSelected);
  }

  // Helper function to finish opponent card animation
  function finishOpponentCardAnimation(opponentCard: Card) {
    setAnimatingOpponentCard(null);
    const newNorthHand = game.hands.north.slice(0, -1); // Remove from opponent
    const newSouthHand = [...game.hands.south, opponentCard]; // Add to player
    
    const newGameState: GameState = {
      ...game,
      hands: {
        north: newNorthHand,
        south: newSouthHand,
      },
    };
    setGame(newGameState);
    updateGameInFirebase(newGameState);
    setOpponentCardSelected(false); // Clear selection highlight
  }

  // Handle moving selected cards when sum equals 10
  async function handleMoveSelectedCards() {
    if (gamePhase !== 'playing') return;
    if (game.winner !== null || game.chooseSuit) return;
    if (game.turn !== 'south' || !hasAddedCardsThisTurn) return;
    
    const opponentCard = game.hands.north[game.hands.north.length - 1];
    const discardPile = firebaseGameData?.discardPile ?? game.discard;
    
    // Calculate sum to double-check
    const sumDiscard = selectedDiscardIndices.reduce((acc, idx) => {
      const card = discardPile[idx];
      const v = card.value === 'A' ? 1 : parseInt(card.value, 10);
      return isNaN(v) ? acc : acc + v;
    }, 0);
    const opponentCardValue = opponentCard.value === 'A' ? 1 : parseInt(opponentCard.value, 10);
    const totalSum = sumDiscard + opponentCardValue;
    
    if (totalSum !== 10) {
      return;
    }
    
    // Include opponent card in selectedCards for sorting and adding to hand
    const selectedCards = [
      ...selectedDiscardIndices.map(i => discardPile[i]),
      opponentCard
    ];
    const sortedSelectedCards = [...selectedCards].sort((a, b) => {
      const getValue = (c: Card) => c.value === 'A' ? 1 : parseInt(c.value, 10);
      return getValue(b) - getValue(a);
    });
    
    // Remove selected cards from discard pile
    const newDiscard = discardPile.filter((_: Card, i: number) => !selectedDiscardIndices.includes(i));
    
    // Add all selected cards (including opponent card) to player's hand
    const newHand = [...game.hands.south, ...sortedSelectedCards];
    
    // Remove opponent card from opponent's hand
    const newNorthHand = game.hands.north.slice(0, -1);
    
    const newGameState: GameState = {
      ...game,
      hands: {
        north: newNorthHand,
        south: newHand,
      },
      discard: newDiscard,
    };
    
    setGame(newGameState);
    setSelectedDiscardIndices([]);
    setOpponentCardSelected(false);
    // Clear drawn card tracking when cards are successfully moved
    setDrawnCardIndex(null);
    drawnCardIndexRef.current = null;
    setHasAddedCardsThisTurn(true);
    setHasDrawnThisTurn(true); // Enable discard pile again after adding cards
    
    await updateGameInFirebase(newGameState);
    // After successfully moving cards:
    setLastMover('south');
    if (currentGameId) {
      const gameDocRef = doc(db, 'games', currentGameId);
      const lastMoverValue = isPlayer1 ? 'player1' : 'player2';
      console.log('[lastMover] Writing lastMover to Firestore:', lastMoverValue);
      await updateDoc(gameDocRef, { lastMover: lastMoverValue })
        .then(() => console.log('[lastMover] Firestore update success'))
        .catch(err => console.error('[lastMover] Firestore update error', err));
    }else{
      console.log('[lastMover] No currentGameId');
    }
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
  const [centerCardTopToMiddleCard, setCenterCardTopToMiddleCard] = useState<Card | null>(null);
  const centerCardTopToMiddleY = useSharedValue(0);

  // Center card from middle to up (for opponent draw or claim animation)
  const [showCenterCardUp, setShowCenterCardUp] = useState(false);
  const [animatingCardsUp, setAnimatingCardsUp] = useState<Card[]>([]);
  const centerCardUpY = useSharedValue(0);
  const centerCardUpAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: centerCardUpY.value }],
    opacity: 1 + centerCardUpY.value / (height / 2),
  }));

  // State for animating the cards moving down
  const [animatingCardsDown, setAnimatingCardsDown] = useState<Card[]>([]);

  const centerCardDownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: centerCardDownY.value }],
    opacity: 1 - centerCardDownY.value / (height / 2),
  }));

  function animateCenterCardDown() {
    centerCardDownY.value = 0;
    centerCardDownY.value = withTiming(height, { duration: 2500 }, (finished) => {
      if (finished) {
        runOnJS(setShowCenterCardDown)(false);
        runOnJS(setAnimatingCardsDown)([]);
      }
    });
  }

  function animateCenterCardUp() {
    centerCardUpY.value = 0;
    centerCardUpY.value = withTiming(-height, { duration: 2500 }, (finished) => {
      if (finished) {
        runOnJS(setShowCenterCardUp)(false);
        runOnJS(setAnimatingCardsUp)([]);
      }
    });
  }

  // Detect when opponent's hand increases in length (opponent claims cards)
  useEffect(() => {
    if (game.turn === 'north') {
      // Only check when it's opponent's turn
      const currLen = game.hands.north.length;
      const prevLen = prevOpponentHandLength.current;
      
      if (currLen > prevLen) {
        // Cards were added to opponent's hand
        // Find the new cards (assume they are added at the end)
        const numAdded = currLen - prevLen;
        const newCards = game.hands.north.slice(-numAdded);
        setAnimatingCardsUp(newCards);
        setShowCenterCardUp(true);
        animateCenterCardUp();
      }
      prevOpponentHandLength.current = currLen;
    }
  }, [game.hands.north.length, game.turn]);

  // Restore showMenu state declaration (fix linter error)
  const [showMenu, setShowMenu] = useState(false);

  // State for selected discard cards (multiple selection)
  const [selectedDiscardIndices, setSelectedDiscardIndices] = useState<number[]>([]);
  
  // State for tracking if player has added cards to their pile in current turn
  const [hasAddedCardsThisTurn, setHasAddedCardsThisTurn] = useState(false);
  
  // State for selected opponent card
  const [opponentCardSelected, setOpponentCardSelected] = useState<boolean>(false);
  
  // State for tracking if player has drawn this turn
  const [hasDrawnThisTurn, setHasDrawnThisTurn] = useState<boolean>(false);
  
  // State for tracking the drawn card (to prevent deselection)
  const [drawnCardIndex, setDrawnCardIndex] = useState<number | null>(null);
  
  // Ref to track drawn card index that won't be affected by state updates
  const drawnCardIndexRef = useRef<number | null>(null);
  
  // Animation for opponent card moving to player
  const [animatingOpponentCard, setAnimatingOpponentCard] = useState<Card | null>(null);
  const opponentCardX = useSharedValue(0);
  const opponentCardY = useSharedValue(0);

  // Animation for draw pile to discard pile
  const [animatingDrawCard, setAnimatingDrawCard] = useState<Card | null>(null);
  const [isOpponentDrawing, setIsOpponentDrawing] = useState(false);
  const drawCardX = useSharedValue(0);
  const drawCardY = useSharedValue(0);
  const drawCardAnimStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: typeof drawCardX.value === 'number' && !isNaN(drawCardX.value) ? drawCardX.value : 0,
    top: typeof drawCardY.value === 'number' && !isNaN(drawCardY.value) ? drawCardY.value : 0,
    zIndex: 1000,
  }));

  // Reset drawn card index if it becomes invalid (when discard pile changes)
  useEffect(() => {
    const discardPile = firebaseGameData?.discardPile ?? game.discard;
    if (drawnCardIndex !== null && drawnCardIndex >= discardPile.length) {
      setDrawnCardIndex(null);
    }
  }, [game.discard, firebaseGameData?.discardPile, drawnCardIndex]);

  // Check for game end conditions
  useEffect(() => {
    const initialHandSize = 19;
    const bothHandsAreInitial = game.hands.south.length === initialHandSize && game.hands.north.length === initialHandSize;
    const bothHandsEmpty = game.hands.south.length === 0 && game.hands.north.length === 0;
    const hasCardsInHands = game.hands.south.length > 0 || game.hands.north.length > 0;
    
    // Only check for game end in handleEndTurn, not here
    // if (
    //   gamePhase === 'playing' &&
    //   !showPointsModal &&
    //   game.stock.length === 0 &&
    //   hasCardsInHands &&
    //   (firebaseGameData?.status === 'in-progress' || firebaseGameData?.status === 'finished')
    // ) {
    //   checkGameEnd(game);
    // }
  }, [
    game.stock.length,
    gamePhase,
    showPointsModal,
    game.hands.south.length,
    game.hands.north.length,
    firebaseGameData?.status,
  ]);

  // Ensure drawn card is always selected when it exists
  useEffect(() => {
    const currentDrawnIndex = drawnCardIndex ?? drawnCardIndexRef.current;
    if (currentDrawnIndex !== null && !selectedDiscardIndices.includes(currentDrawnIndex)) {
      setSelectedDiscardIndices(prev => {
        // Only add if not already present to avoid duplicates
        if (!prev.includes(currentDrawnIndex)) {
          return [...prev, currentDrawnIndex];
        }
        return prev;
      });
    }
  }, [drawnCardIndex]); // Remove selectedDiscardIndices from dependencies to prevent infinite loop

  // DEV: Set up test state
  async function setupDevTestState() {
    // Use 2♠ for both players, and discard pile: 10♣, 8♦, 7♥, 3♠, 6♣, 4♦
    const testCard = { suit: '♠', value: '2' };
    const discardPile = [
      { suit: '♣', value: '10' },
      { suit: '♦', value: '8' },
      { suit: '♥', value: '7' },
      { suit: '♠', value: '3' },
      { suit: '♣', value: '6' },
      { suit: '♦', value: '4' },
    ];
    // Add some cards to the draw pile (stock)
    const stock = [
      { suit: '♠', value: '4' },
    ];
    const newGameState: GameState = {
      hands: {
        south: [testCard],
        north: [testCard],
      },
      stock,
      discard: discardPile,
      turn: 'south',
      currentSuit: discardPile[discardPile.length - 1].suit,
      winner: null,
      chooseSuit: false,
    };
    setGame(newGameState);
    setGamePhase('playing');
    await updateGameInFirebase(newGameState);
  }

  // Add at the top of the component, after other refs:
  const closeModalTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Add cleanup for the timeout on unmount
  useEffect(() => {
    return () => {
      if (closeModalTimeoutRef.current) {
        clearTimeout(closeModalTimeoutRef.current);
        console.log('[ModalClose] Cleanup: Cleared timeout on unmount');
      }
    };
  }, []);

  const alreadyNavigatedToResults = useRef(false);

  useEffect(() => {
    if (!currentGameId) return;

    const gameDoc = doc(db, 'games', currentGameId);
    const unsub = onSnapshot(gameDoc, (docSnapshot) => {
      // Check if component is still mounted before updating state
      if (!isMounted.current) return;
      
      if (!docSnapshot.exists()) {
        // Game was deleted
        setCancelledGameInfo({
          cancelledBy: 'Opponent',
          reason: 'Game was deleted'
        });
        setShowGameCancelledPopup(true);
        return;
      }
      
      if (docSnapshot.exists()) {
        const gameData = docSnapshot.data();
        // LOG: Firestore snapshot received
        console.log('[RESULTS REDIRECT] Firestore snapshot:', {
          status: gameData.status,
          points: gameData.points,
          alreadyNavigated: alreadyNavigatedToResults.current
        });
        // ... existing code ...
        setFirebaseGameData(gameData);
        // ... existing code ...
        // NAVIGATE TO RESULTS PAGE FOR BOTH PLAYERS WHEN GAME IS FINISHED
        if (
          gameData.status === 'finished' &&
          gameData.points &&
          !alreadyNavigatedToResults.current
        ) {
          console.log('[RESULTS REDIRECT] Redirect condition met. Navigating to /results...', {
            status: gameData.status,
            points: gameData.points
          });
          alreadyNavigatedToResults.current = true;
          const player1Total = gameData.points.player1?.total || 0;
          const player2Total = gameData.points.player2?.total || 0;
          const player1Name = gameData.players.player1?.name || 'Player 1';
          const player2Name = gameData.players.player2?.name || 'Player 2';
          const player1Breakdown = JSON.stringify(gameData.points.player1?.breakdown || {});
          const player2Breakdown = JSON.stringify(gameData.points.player2?.breakdown || {});
          let winner = '';
          if (player1Total > player2Total) winner = player1Name;
          else if (player2Total > player1Total) winner = player2Name;
          router.push({
            pathname: '/results',
            params: {
              player1Total: String(player1Total),
              player2Total: String(player2Total),
              player1Name,
              player2Name,
              player1Breakdown,
              player2Breakdown,
              winner,
            },
          });
        } else {
          console.log('[RESULTS REDIRECT] Redirect condition NOT met.', {
            status: gameData.status,
            points: gameData.points,
            alreadyNavigated: alreadyNavigatedToResults.current
          });
        }
        // ... existing code ...
      }
    });
    return () => unsub();
  }, [currentGameId, router]);

  // Add at the top of the component, after other state declarations:
  const [lastMover, setLastMover] = useState<'south' | 'north' | null>(null);

  // Add a single function to handle moving cards from discard pile (and possibly opponent card) to player's hand
  async function handleMoveCardsCombo({
    selectedIndices,
    includeOpponentCard
  }: {
    selectedIndices: number[];
    includeOpponentCard: boolean;
  }) {
    const discardPile = firebaseGameData?.discardPile ?? game.discard;
    let selectedCards = selectedIndices.map(i => discardPile[i]);
    let sum = selectedCards.reduce((acc, c) => {
      const v = c.value === 'A' ? 1 : parseInt(c.value, 10);
      return isNaN(v) ? acc : acc + v;
    }, 0);
    let newHand = [...game.hands.south, ...selectedCards];
    let newNorthHand = game.hands.north;
    if (includeOpponentCard && game.hands.north.length > 0) {
      const opponentCard = game.hands.north[game.hands.north.length - 1];
      const v = opponentCard.value === 'A' ? 1 : parseInt(opponentCard.value, 10);
      sum += !isNaN(v) ? v : 0;
      newHand = [...newHand, opponentCard];
      newNorthHand = game.hands.north.slice(0, -1);
    }
    if (selectedIndices.length > 0 && sum === 10) {
      const sortedSelectedCards = [...selectedCards].sort((a, b) => {
        const getValue = (c: Card) => c.value === 'A' ? 1 : parseInt(c.value, 10);
        return getValue(b) - getValue(a);
      });
      setAnimatingCardsDown(sortedSelectedCards);
      setShowCenterCardDown(true);
      animateCenterCardDown();
      const newDiscard = discardPile.filter((_: Card, i: number) => !selectedIndices.includes(i));
      const newGameState: GameState = {
        ...game,
        hands: {
          ...game.hands,
          south: newHand,
          north: newNorthHand,
        },
        discard: newDiscard,
      };
      setGame(newGameState);
      setSelectedDiscardIndices([]);
      setOpponentCardSelected(false);
      setDrawnCardIndex(null);
      drawnCardIndexRef.current = null;
      setHasAddedCardsThisTurn(true);
      setHasDrawnThisTurn(true);
      await updateGameInFirebase(newGameState);
      setLastMover('south');
      if (currentGameId) {
        const gameDocRef = doc(db, 'games', currentGameId);
        const lastMoverValue = isPlayer1 ? 'player1' : 'player2';
        console.log('[lastMover] Writing lastMover to Firestore:', lastMoverValue);
        await updateDoc(gameDocRef, { lastMover: lastMoverValue })
          .then(() => console.log('[lastMover] Firestore update success'))
          .catch(err => console.error('[lastMover] Firestore update error', err));
      } else {
        console.log('[lastMover] No currentGameId');
      }
    }
  }

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      {/* DEV BUTTON: Only show in dev mode */}
      {isDev && (
        <View style={{ position: 'absolute', top: 8, left: 8, zIndex: 2000 }}>
          <TouchableOpacity
            style={{ backgroundColor: '#FFD700', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, elevation: 4 }}
            onPress={setupDevTestState}
            activeOpacity={0.8}
          >
            <ThemedText style={{ color: '#14532d', fontWeight: 'bold', fontSize: 14 }}>DEV: Test Cards</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      
      {/* Animated card at root level for correct absolute positioning */}
      {animatingCard && (
        <Animated.View
          style={animCardStyle}
          pointerEvents="none"
        >
          <CasinoCard suit={animatingCard.suit} value={animatingCard.value} />
        </Animated.View>
      )}

      {/* Animated opponent card moving to player */}
      {animatingOpponentCard &&
        typeof opponentCardX.value === 'number' &&
        typeof opponentCardY.value === 'number' &&
        !isNaN(opponentCardX.value) &&
        !isNaN(opponentCardY.value) && (
        <Animated.View
          style={opponentCardAnimStyle}
          pointerEvents="none"
        >
          <CasinoCard suit={animatingOpponentCard.suit} value={animatingOpponentCard.value} style={{ width: 72, height: 104 }} />
        </Animated.View>
      )}

      {/* Animated draw card moving from draw pile to discard pile or opponent hand */}
      {animatingDrawCard && 
       typeof drawCardX.value === 'number' && 
       typeof drawCardY.value === 'number' && 
       !isNaN(drawCardX.value) && 
       !isNaN(drawCardY.value) && (
        <Animated.View
          style={drawCardAnimStyle}
          pointerEvents="none"
        >
          {isOpponentDrawing ? (
            // Show card back for opponent draw
            <Image
              source={require('../assets/images/facedown-card.png')}
              style={{ width: 56, height: 80, borderRadius: 10 }}
              resizeMode="contain"
            />
          ) : (
            // Show actual card for player draw
            <CasinoCard 
              suit={animatingDrawCard.suit} 
              value={animatingDrawCard.value} 
              style={{ width: 56, height: 80 }} 
            />
          )}
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
              
              {/* Deal button only for player 1, waiting message for player 2 */}
              {firebaseGameData?.status === 'started' && firebaseGameData?.players?.player2?.name ? (
                isPlayer1 ? null : (
                  <View style={{ alignItems: 'center', marginTop: 32 }}>
                    <ActivityIndicator size="large" color="#FFD700" style={{ marginBottom: 16 }} />
                    <ThemedText style={{ color: '#FFD700', fontSize: 18, fontWeight: 'bold', textAlign: 'center' }}>
                      Waiting for host to deal the cards...
                    </ThemedText>
                  </View>
                )
              ) : null}
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
              
              
              {/* North hand (opponent) */}
              <View style={styles.northHandContainer}>
                <View style={styles.northHandRow}>
                  {game.hands.north.length > 0 ? (
                    game.hands.north.map((card, idx) => {
                      // Generate random transformations for realistic stacking
                      const rotation = (Math.random() - 0.5) * 8; // Random rotation between -4 and 4 degrees
                      const translateX = (Math.random() - 0.5) * 6; // Random horizontal offset between -3 and 3
                      const translateY = (Math.random() - 0.5) * 4; // Random vertical offset between -2 and 2
                      const scale = 0.95 + (Math.random() * 0.1); // Random scale between 0.95 and 1.05
                      
                      const canSelectOpponentCard = game.turn === 'south' && hasAddedCardsThisTurn && idx === game.hands.north.length - 1;
                      
                      return (
                        <View
                          key={`${card.suit}-${card.value}-${idx}`}
                          ref={ref => (northHandCardRefs.current[idx] = ref)}
                          style={{
                            position: 'absolute',
                            left: idx * 2, // Slight overlap
                            zIndex: idx,
                            transform: [
                              { rotate: `${rotation}deg` },
                              { translateX },
                              { translateY },
                              { scale: scale * (opponentCardSelected && idx === game.hands.north.length - 1 ? 1.1 : 1) }
                            ],
                          }}
                        >
                          <TouchableOpacity
                            disabled={!canSelectOpponentCard}
                            activeOpacity={canSelectOpponentCard ? 0.7 : 1}
                            onPress={() => {
                              if (canSelectOpponentCard) {
                                setOpponentCardSelected(!opponentCardSelected);
                                setTimeout(async () => {
                                  if (!opponentCardSelected) { // just selected
                                    await handleMoveCardsCombo({
                                      selectedIndices: selectedDiscardIndices,
                                      includeOpponentCard: true
                                    });
                                  }
                                }, 0);
                              }
                            }}
                          >
                            <View style={[
                              opponentCardSelected && idx === game.hands.north.length - 1 ? styles.selectedOpponentCard : null
                            ]}>
                              <CasinoCard suit={card.suit} value={card.value} style={{ width: 72, height: 104 }} />
                            </View>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.emptyHandPlaceholder}>
                      <ThemedText style={styles.emptyHandText}>No cards</ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText style={styles.nameText}>{playerNames.north}</ThemedText>
              </View>
              
              {/* Discard and stock piles at center */}
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                {/* Hint text when discard pile is disabled */}
                {game.turn === 'south' && !hasDrawnThisTurn && (
                  <View style={{ position: 'absolute', top: -40, alignItems: 'center', zIndex: 10 }}>
                    <ThemedText style={{ color: '#FFD700', fontSize: 14, fontWeight: 'bold', textAlign: 'center' }}>
                      Draw a card first to interact with discard pile
                    </ThemedText>
                  </View>
                )}
                
                {/* Hint text for opponent card selection */}
                {game.turn === 'south' && hasAddedCardsThisTurn && game.hands.north.length > 0 && !opponentCardSelected && (
                  <View style={{ position: 'absolute', top: -80, alignItems: 'center', zIndex: 10 }}>
                    <ThemedText style={{ color: '#FFD700', fontSize: 14, fontWeight: 'bold', textAlign: 'center' }}>
                      Tap opponent's card to include it in your combination
                    </ThemedText>
                  </View>
                )}
                {/* Discard pile - show all cards from firebase discardPile, centered both ways */}
                <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', minHeight: 66 }}>
                  {(() => {
                    const discardPile = firebaseGameData?.discardPile ?? game.discard;
                    // Show all cards in the discard pile, wrapped to multiple rows if needed, with smaller cards
                    return discardPile.map((card: Card, idx: number) => {
                      const isSelected = selectedDiscardIndices.includes(idx);
                      const isPlayerTurn = game.turn === 'south';
                      const isDrawnCard = (drawnCardIndex ?? drawnCardIndexRef.current) === idx;
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={{
                            marginRight: 4,
                            marginBottom: 4,
                            transform: [{ scale: isSelected ? 0.85 : 1 }],
                            opacity: (isPlayerTurn && hasDrawnThisTurn) ? 1 : 0.5,
                          }}
                          activeOpacity={(isPlayerTurn && hasDrawnThisTurn) ? 0.7 : 1}
                          disabled={!isPlayerTurn || !hasDrawnThisTurn}
                          onPress={async () => {
                            if (!isPlayerTurn) return;
                            
                            // Prevent deselection of the drawn card (use ref as fallback)
                            const currentDrawnIndex = drawnCardIndex ?? drawnCardIndexRef.current;
                            if (isSelected && currentDrawnIndex === idx) {
                              return; // Don't allow deselection of drawn card
                            }
                            
                            let newSelected;
                            if (isSelected) {
                              newSelected = selectedDiscardIndices.filter(i => i !== idx);
                            } else {
                              newSelected = [...selectedDiscardIndices, idx];
                            }
                            
                            // Ensure drawn card is always included in selection (only if not already present)
                            const fallbackDrawnIndex = drawnCardIndex ?? drawnCardIndexRef.current;
                            if (fallbackDrawnIndex !== null && !newSelected.includes(fallbackDrawnIndex)) {
                              newSelected = [...newSelected, fallbackDrawnIndex];
                            }
                            
                            // Remove duplicates from selection
                            const uniqueSelected = [...new Set(newSelected)];
                            setSelectedDiscardIndices(uniqueSelected);
                            // If opponent card is selected, include it
                            await handleMoveCardsCombo({
                              selectedIndices: uniqueSelected,
                              includeOpponentCard: opponentCardSelected && game.hands.north.length > 0
                            });
                          }}
                        >
                          <CasinoCard suit={card.suit} value={card.value} style={{ width: 64, height: 90 }} />
                        </TouchableOpacity>
                      );
                    });
                  })()}
                </View>
              </View>
              
              {/* Draw pile (pile) at bottom right */}
              <View style={{ position: 'absolute', bottom: 32, right: 24, alignItems: 'center', zIndex: 200 }}>
                <TouchableOpacity
                  onPress={() => handleDraw('south')}
                  style={{ 
                    marginBottom: 4,
                    opacity: (game.turn === 'south' && !hasDrawnThisTurn) ? 1 : 0.5,
                  }}
                  disabled={game.turn !== 'south' || hasDrawnThisTurn}
                  activeOpacity={(game.turn === 'south' && !hasDrawnThisTurn) ? 0.7 : 1}
                >
                  {getCardBack()}
                </TouchableOpacity>
                <ThemedText style={[styles.drawHintText, { opacity: (game.turn === 'south' && !hasDrawnThisTurn) ? 1 : 0.5 }]}>
                  {game.turn === 'south' 
                    ? (hasDrawnThisTurn ? 'Already drawn' : 'Tap to Draw') 
                    : 'Not your turn'}
                </ThemedText>
                {/* Stock count indicator */}
                <ThemedText style={[styles.stockCountText, { 
                  color: game.stock.length <= 5 ? '#FFD700' : '#fff',
                  fontWeight: game.stock.length <= 5 ? 'bold' : 'normal'
                }]}>
                  {game.stock.length} cards left
                </ThemedText>
              </View>
              
              {/* South hand (player) - moved to bottom */}
              <View style={styles.southHandContainer}>
                <ThemedText style={styles.nameText}>{playerNames.south}</ThemedText>
                <View style={styles.southHandRow}>
                  {game.hands.south.length > 0 ? (
                    game.hands.south.map((card, idx) => {
                      // Generate consistent random transformations for realistic stacking
                      const { rotation, translateX, translateY, scale } = getCardTransformations(card, idx);
                      
                      return (
                        <View
                          key={`${card.suit}-${card.value}-${idx}`}
                          ref={ref => (handCardRefs.current[idx] = ref)}
                          style={{
                            position: 'absolute',
                            left: idx * 2, // Slight overlap
                            zIndex: idx,
                            transform: [
                              { rotate: `${rotation}deg` },
                              { translateX },
                              { translateY },
                              { scale }
                            ],
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => handlePlay('south', idx)}
                            disabled={ game.winner !== null || game.chooseSuit || !canPlay(card, game.discard[game.discard.length - 1] ?? undefined, game.currentSuit) || game.turn !== 'south'}
                          >
                            <CasinoCard suit={card.suit} value={card.value} style={{ width: 72, height: 104 }} />
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.emptyHandPlaceholder}>
                      <ThemedText style={styles.emptyHandText}>No cards</ThemedText>
                    </View>
                  )}
                </View>
              </View>
              
              {/* End Turn button */}
              {game.turn === 'south' && (
                <View style={styles.endTurnButtonContainer}>
                  <TouchableOpacity
                    style={styles.endTurnButton}
                    onPress={handleEndTurn}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={styles.endTurnButtonText}>End Turn</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
              
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
        
        {/* Info button - top left */}
        {gamePhase === 'playing' && (
          <View style={styles.infoButtonWrapper}>
            <TouchableOpacity
              style={styles.infoButton}
              onPress={() => setShowRulesModal(true)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="info" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        
        {/* Menu button - top right */}
        {gamePhase === 'playing' && (
          <View style={styles.menuButtonWrapper}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setShowMenu(!showMenu)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="more-vert" size={28} color="#fff" />
            </TouchableOpacity>
            
            {/* Menu dropdown */}
            {showMenu && (
              <View style={styles.menuDropdown}>
                {/* WhatsApp call option */}
                {opponentPhoneNumber && (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setShowMenu(false);
                      handleWhatsAppCall();
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={require('../assets/images/whatsapp.png')}
                      style={{ width: 24, height: 24, marginRight: 12 }}
                      resizeMode="contain"
                    />
                    <ThemedText style={styles.menuItemText}>Call Opponent</ThemedText>
                  </TouchableOpacity>
                )}
                
                {/* Leave game option */}
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowMenu(false);
                    handleLeaveGame();
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="exit-to-app" size={24} color="#dc2626" style={{ marginRight: 12 }} />
                  <ThemedText style={[styles.menuItemText, { color: '#dc2626' }]}>Leave Game</ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ThemedView>
      
      {/* Game Cancelled Popup */}
      <Modal
        visible={showGameCancelledPopup}
        transparent
        animationType="fade"
        onRequestClose={handlePopupDismiss}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>🎲 Game Cancelled</ThemedText>
            </View>
            <View style={styles.modalBody}>
              <ThemedText style={styles.modalMessage}>
                Player cancelled the game.
              </ThemedText>
              <ThemedText style={styles.modalSubMessage}>
                {cancelledGameInfo?.reason || 'The game has been cancelled.'}
              </ThemedText>
            </View>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={handlePopupDismiss}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.modalButtonText}>OK</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Game Rules Modal */}
      <Modal
        visible={showRulesModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRulesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.rulesModalContent]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>🎯 Game Rules</ThemedText>
            </View>
            <ScrollView style={styles.rulesScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.modalBody}>
                <ThemedText style={styles.rulesSectionTitle}>Objective</ThemedText>
                <ThemedText style={styles.rulesText}>
                  Collect cards from the discard pile by selecting combinations that sum to 10, along with the opponent's top card.
                </ThemedText>
                
                <ThemedText style={styles.rulesSectionTitle}>How to Play</ThemedText>
                <ThemedText style={styles.rulesText}>
                  1. <ThemedText style={styles.rulesBold}>Draw a card</ThemedText> from the draw pile on your turn
                </ThemedText>
                <ThemedText style={styles.rulesText}>
                  2. <ThemedText style={styles.rulesBold}>Select cards</ThemedText> from the discard pile that sum to 10
                </ThemedText>
                <ThemedText style={styles.rulesText}>
                  3. <ThemedText style={styles.rulesBold}>Select opponent's card</ThemedText> to include in your combination
                </ThemedText>
                <ThemedText style={styles.rulesText}>
                  4. <ThemedText style={styles.rulesBold}>Move cards</ThemedText> to your hand when the total equals 10
                </ThemedText>
                
                <ThemedText style={styles.rulesSectionTitle}>Card Values</ThemedText>
                <ThemedText style={styles.rulesText}>
                  • Aces (A) = 1 point{'\n'}
                  • Number cards (2-10) = face value{'\n'}
                  • Face cards (J, Q, K) are not used in this game
                </ThemedText>
                
                <ThemedText style={styles.rulesSectionTitle}>Special Rules</ThemedText>
                <ThemedText style={styles.rulesText}>
                  • <ThemedText style={styles.rulesBold}>10 cards:</ThemedText> When you draw a 10, it automatically goes to your hand{'\n'}
                  • <ThemedText style={styles.rulesBold}>Combinations:</ThemedText> You can select multiple cards from the discard pile{'\n'}
                  • <ThemedText style={styles.rulesBold}>Opponent's card:</ThemedText> Can be included, after you added cards to your hand{'\n'}
                  • <ThemedText style={styles.rulesBold}>Turn order:</ThemedText> Players take turns drawing and collecting cards
                </ThemedText>
                
                <ThemedText style={styles.rulesSectionTitle}>Winning</ThemedText>
                <ThemedText style={styles.rulesText}>
                  The game continues until the draw pile is empty. The player with the most cards in their hand wins!
                </ThemedText>
                
                <ThemedText style={styles.rulesSectionTitle}>Scoring</ThemedText>
                <ThemedText style={styles.rulesText}>
                  At the end of the game, points are awarded for special cards:{'\n'}
                  • <ThemedText style={styles.rulesBold}>Aces (A):</ThemedText> 1 point each{'\n'}
                  • <ThemedText style={styles.rulesBold}>10 of Spades/Hearts/Clubs:</ThemedText> 1 point each{'\n'}
                  • <ThemedText style={styles.rulesBold}>10 of Diamonds:</ThemedText> 2 points{'\n'}
                  • <ThemedText style={styles.rulesBold}>2 of Spades:</ThemedText> 1 point
                </ThemedText>
              </View>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowRulesModal(false)}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.modalButtonText}>Got it!</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Center card from middle to down (for draw animation) */}
      {showCenterCardDown && (
        <Animated.View
          style={[{ position: 'absolute', top: '45%', left: '20%', transform: [{ translateX: -28 }], zIndex: 100, flexDirection: 'row' }, centerCardDownAnimStyle]}
          pointerEvents="none"
        >
          {animatingCardsDown.length > 0 ? (
            animatingCardsDown.map((card, idx) => (
              <CasinoCard
                key={idx}
                suit={card.suit}
                value={card.value}
                style={{ width: 56, height: 80, marginLeft: idx === 0 ? 0 : -24 }}
              />
            ))
          ) : (
            <Image
              source={require('../assets/images/facedown-card.png')}
              style={{ width: 56, height: 80, borderRadius: 10, marginHorizontal: 6 }}
              resizeMode="contain"
            />
          )}
        </Animated.View>
      )}

      {/* Center card from middle to up (for opponent draw or claim animation) */}
      {showCenterCardUp && (
        <Animated.View
          style={[{ position: 'absolute', top: '45%', left: '20%', transform: [{ translateX: -28 }], zIndex: 100, flexDirection: 'row' }, centerCardUpAnimStyle]}
          pointerEvents="none"
        >
          {animatingCardsUp.length > 0 ? (
            animatingCardsUp.map((card, idx) => (
              <CasinoCard
                key={idx}
                suit={card.suit}
                value={card.value}
                style={{ width: 56, height: 80, marginLeft: idx === 0 ? 0 : -24 }}
              />
            ))
          ) : (
            <Image
              source={require('../assets/images/facedown-card.png')}
              style={{ width: 56, height: 80, borderRadius: 10, marginHorizontal: 6 }}
              resizeMode="contain"
            />
          )}
        </Animated.View>
      )}
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
  northHandContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: 3,
    alignItems: 'center',
  },
  northHandRow: {
    position: 'relative',
    marginBottom: 0,
    zIndex: 2,
    height: 134,
    width: 100, // Fixed width to contain stacked cards
    alignItems: 'center',
  },
  southHandContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    zIndex: 3,
    alignItems: 'center',
  },
  southHandRow: {
    position: 'relative',
    zIndex: 3,
    height: 134,
    marginTop: 8,
    width: 100, // Fixed width to contain stacked cards
    alignItems: 'center',
  },
  playerNameTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 4,
  },
  nameText: {
    color: '#fff',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
    opacity: 0.92,
    textAlign: 'center',
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

  drawHintText: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 1,
    textAlign: 'center',
    color: '#fff',
  },
  undoHintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 8,
  },

  // Menu styles
  infoButtonWrapper: {
    position: 'absolute',
    top: 48,
    left: 20,
    zIndex: 1000,
  },
  menuButtonWrapper: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  menuButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  menuDropdown: {
    position: 'absolute',
    top: 56,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    minWidth: 180,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    margin: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 280,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#dc2626',
    textAlign: 'center',
  },
  modalBody: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalMessage: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '600',
  },
  modalSubMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: '#19C37D',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Rules modal styles
  rulesModalContent: {
    maxHeight: '80%',
    maxWidth: '90%',
  },
  rulesScrollView: {
    maxHeight: 400,
  },
  rulesSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#19C37D',
    marginTop: 16,
    marginBottom: 8,
  },
  rulesText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 8,
  },
  rulesBold: {
    fontWeight: 'bold',
    color: '#19C37D',
  },
  
  // End Turn button styles
  endTurnButtonContainer: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    alignItems: 'center',
    zIndex: 200,
  },
  endTurnButton: {
    backgroundColor: '#dc2626',
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endTurnButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  moveCardsButtonContainer: {
    position: 'absolute',
    bottom: 32,
    left: '50%',
    transform: [{ translateX: -60 }],
    alignItems: 'center',
    zIndex: 200,
  },
  moveCardsButton: {
    backgroundColor: '#19C37D',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 2,
    borderColor: '#fff',
    minWidth: 120,
    alignItems: 'center',
  },
  moveCardsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  selectedOpponentCard: {
    borderWidth: 3,
    borderColor: '#FFD700',
    borderRadius: 12,
    padding: 2,
    shadowColor: '#FFD700',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  emptyHandPlaceholder: {
    width: 72,
    height: 104,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  emptyHandText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  
  // Points modal styles
  pointsModalContent: {
    height: '100%',
    width: '100%',
    backgroundColor: '#1f2937',
  },
  pointsScrollView: {
    maxHeight: 600,
  },
  playerPointsContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    width: '70%',
  },
  playerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  totalPoints: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  pointsBreakdown: {
    gap: 8,
  },
  pointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  pointsReason: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  pointsValue: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  noPointsText: {
    color: '#9ca3af',
    fontSize: 14,
    fontStyle: 'italic',
  },
  winnerContainer: {
    marginTop: 20,
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  winnerText: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  stockCountText: {
    fontSize: 12,
    fontWeight: 'normal',
    color: '#fff',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlayCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nicePointsModalContent: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: 'rgba(31,41,55,0.98)',
    borderRadius: 28,
    paddingBottom: 24,
    paddingTop: 0,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
    overflow: 'hidden',
    marginTop: 32,
    marginBottom: 32,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
    padding: 4,
  },
  modalHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 8,
    width: '100%',
  },
  niceModalTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 1,
    textAlign: 'center',
  },
  niceWinnerContainer: {
    marginTop: 24,
    alignItems: 'center',
    padding: 18,
    backgroundColor: 'rgba(255, 215, 0, 0.18)',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  niceWinnerText: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  niceModalButton: {
    backgroundColor: '#19C37D',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 18,
    marginHorizontal: 24,
    shadowColor: '#19C37D',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  niceModalButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
