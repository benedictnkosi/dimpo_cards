import React, { useEffect, useState, useRef } from 'react';
import { Image, View, StyleSheet, TouchableOpacity, Dimensions, Alert, ScrollView, findNodeHandle, InteractionManager, Animated as LegacyAnimated, Button, Linking, Modal, ActivityIndicator } from 'react-native';
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

const { width, height } = Dimensions.get('window');

const AVATARS = [
  require('../assets/images/avatars/1.png'),
  require('../assets/images/avatars/2.png'),
  require('../assets/images/avatars/3.png'),
  require('../assets/images/avatars/4.png'),
];


// Number of cards to deal to each player
const CARDS_PER_PLAYER = 10; // Deal 10 cards per player

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

// Update DeckPlaceholder to accept props for size and text
function DeckPlaceholder({ text = 'Deck Empty', style = {} }) {
  return (
    <View style={[styles.deckPlaceholderSingle, style]}>
      <View style={styles.deckPlaceholderCard} />
      <ThemedText style={styles.deckPlaceholderText}>{text}</ThemedText>
    </View>
  );
}

// Helper to get card numeric value (A=1, 2-10 as numbers)
function cardNumericValue(card: Card): number {
  if (card.value === 'A') return 1;
  const n = parseInt(card.value, 10);
  if (!isNaN(n)) return n;
  return 0; // fallback for unexpected values
}

export default function CasinoGameScreen() {
  console.log('[CasinoGameScreen] Component rendering');
  
  try {
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
  const [opponentLastPlayedCard, setOpponentLastPlayedCard] = useState<Card | null>(null);
  const [previousDiscardCard, setPreviousDiscardCard] = useState<Card | null>(null);
  const handCardRefs = useRef<(View | null)[]>([]);
  const discardRef = useRef<View | null>(null);
  // Box animation (like the test page)
  const boxOffset = useSharedValue(0);
  const boxAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: boxOffset.value }],
    opacity: 0.5 + 0.5 * (boxOffset.value / 150),
  }));

  // Removed animated style - no longer needed

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

  // Improved auto-deal effect with logging
  useEffect(() => {
    // Log all relevant values for debugging
    console.log('[AUTO-DEAL] Effect running');
    console.log('[AUTO-DEAL] gamePhase:', gamePhase);
    console.log('[AUTO-DEAL] isPlayer1:', isPlayer1);
    console.log('[AUTO-DEAL] firebaseGameData.status:', firebaseGameData?.status);
    console.log('[AUTO-DEAL] player1 name:', firebaseGameData?.players?.player1?.name);
    console.log('[AUTO-DEAL] player2 name:', firebaseGameData?.players?.player2?.name);
    console.log('[AUTO-DEAL] autoDealtRef.current:', autoDealtRef.current);

    if (
      gamePhase === 'init' &&
      isPlayer1 === true &&
      firebaseGameData?.status === 'started' &&
      firebaseGameData?.players?.player1?.name &&
      firebaseGameData?.players?.player2?.name &&
      !autoDealtRef.current
    ) {
      console.log('[AUTO-DEAL] All conditions met, calling handleDeal()');
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
        }
        
        if (gameData && gameData.players) {
          // Set syncing flag to prevent auto-sync during Firebase update
          isSyncingToFirebase.current = true;
          
          // Replace the old isP1 logic with UID-based logic and add logging
          let isP1 = false;
          if (gameData.players.player1?.uid && user?.uid && gameData.players.player1.uid === user.uid) {
            console.log('[PLAYER DETECT] user.uid:', user.uid, '== player1.uid:', gameData.players.player1.uid, '-> isPlayer1: true');
            isP1 = true;
          } else if (gameData.players.player2?.uid && user?.uid && gameData.players.player2.uid === user.uid) {
            console.log('[PLAYER DETECT] user.uid:', user.uid, '== player2.uid:', gameData.players.player2.uid, '-> isPlayer1: false');
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
            south: isP1 ? (gameData.players.player1?.name || username) : (gameData.players.player2?.name || 'Player 2'),
            north: isP1 ? (gameData.players.player2?.name || 'Player 2') : (gameData.players.player1?.name || username),
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
      console.log('whatsappUrl', whatsappUrl);
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        // Fallback to web WhatsApp
        const webWhatsappUrl = `https://wa.me/${formattedNumber}`;
        console.log('webWhatsappUrl', webWhatsappUrl);
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
      // Filter out J, Q, K, and Joker cards
      const filteredCards = (cards as Card[]).filter(
        card => !["J", "Q", "K", "Joker", "joker"].includes(card.value)
      );
      // Shuffle and prepare deck
      const deck = shuffle(filteredCards);
      let north: Card[] = []; // Initialize empty array for north player
      let south: Card[] = []; // Initialize empty array for south player
      let stock: Card[] = [...deck];
      
      // Initialize empty deck arrays for each player
      const player1Deck: Card[] = [];
      const player2Deck: Card[] = [];
      
      setGamePhase('dealing');
      setDealtHands({ north: [], south: [] }); // Start with empty arrays
      setDealtStock(stock);
      setDealtDiscard([]);
    // Animate dealing N cards to each player
    let i = 0;
    function dealNext() {
      if (i < CARDS_PER_PLAYER) {
        setTimeout(() => {
          north = [...north, stock.shift()!]; // Add card to north player's array
          setDealtHands(h => ({ ...h, north: north.slice() }));
          setDealtStock(stock.slice());
          i++;
          dealNext();
        }, 300);
      } else if (i < CARDS_PER_PLAYER * 2) {
        setTimeout(() => {
          south = [...south, stock.shift()!]; // Add card to south player's array
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
            // Update Firebase with the new game state including empty deck arrays
            await updateGameInFirebase(newGameState);
            
            // Also update the player deck arrays in Firebase
            if (currentGameId) {
              const gameDocRef = doc(db, 'games', currentGameId);
              await updateDoc(gameDocRef, {
                'players.player1.deck': player1Deck,
                'players.player2.deck': player2Deck,
                'players.player1.tempDeck': [],
                'players.player2.tempDeck': [],
                'players.player1.tempDeckSum': 0,
                'players.player2.tempDeckSum': 0,
              });
            }
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
    console.log('[handlePlay] START - player:', player, 'idx:', idx, 'gamePhase:', gamePhase, 'winner:', game.winner, 'chooseSuit:', game.chooseSuit);
    console.log('[handlePlay] Current game state:', {
      hands: { south: game.hands.south.length, north: game.hands.north.length },
      discard: game.discard.length,
      stock: game.stock.length,
      turn: game.turn,
      currentSuit: game.currentSuit
    });
    
    try {
      if (gamePhase !== 'playing') {
        console.log('[handlePlay] Not playing phase, returning');
        return;
      }
      if (game.winner !== null || game.chooseSuit) {
        console.log('[handlePlay] Winner exists or chooseSuit, returning');
        return;
      }
      
      const card = game.hands[player][idx];
      console.log('[handlePlay] Selected card:', card, 'at index:', idx);
      if (!card) {
        console.log('[handlePlay] No card at idx:', idx, 'for player:', player, 'hand:', game.hands[player]);
        return;
      }
      
      const top = game.discard[game.discard.length - 1];
      console.log('[handlePlay] Top card:', top, 'currentSuit:', game.currentSuit, 'discard length:', game.discard.length);
      
      if (!top) {
        // Discard pile is empty, allow the play as the first card
        console.log('[handlePlay] Discard pile is empty, playing first card:', card);
        // Proceed with play logic as first card
        try {
          console.log('[handlePlay] Calling patchPlayAndPreserveTempDecks for first card');
          await patchPlayAndPreserveTempDecks(player, idx);
          console.log('[handlePlay] patchPlayAndPreserveTempDecks completed for first card');
        } catch (err) {
          console.log('[handlePlay] patchPlayAndPreserveTempDecks threw error:', err);
        }
        return;
      }
      
      let canPlayResult;
      try {
        console.log('[handlePlay] Calling canPlay with:', { card, top, currentSuit: game.currentSuit });
        canPlayResult = canPlay(card, top, game.currentSuit);
        console.log('[handlePlay] canPlay result:', canPlayResult);
      } catch (err) {
        console.log('[handlePlay] canPlay threw error:', err);
        return;
      }
      
      if (!canPlayResult) {
        console.log('[handlePlay] cannot play card:', card, 'on top:', top, 'currentSuit:', game.currentSuit);
        return;
      }
      
      // Store the current top card as the previous discard card
      if (game.discard.length > 0) {
        console.log('[handlePlay] Setting previousDiscardCard to:', game.discard[game.discard.length - 1]);
        setPreviousDiscardCard(game.discard[game.discard.length - 1]);
      }
      
      // Remove animations - play card immediately
      console.log('[handlePlay] Playing card immediately without animation');
      patchPlayAndPreserveTempDecks(player, idx).then(() => {
        console.log('[handlePlay] patchPlayAndPreserveTempDecks completed successfully');
      }).catch(err => {
        console.log('[handlePlay] patchPlayAndPreserveTempDecks error:', err);
        console.log('[handlePlay] Error stack:', err instanceof Error ? err.stack : 'No stack trace');
      });
    } catch (err) {
      console.log('[handlePlay] Unexpected error:', err);
      console.log('[handlePlay] Error stack:', err instanceof Error ? err.stack : 'No stack trace');
    }
  }

  // Helper to patch play and preserve tempDecks
  async function patchPlayAndPreserveTempDecks(player: Player, idx: number) {
    console.log('[patchPlayAndPreserveTempDecks] START, player:', player, 'idx:', idx, 'isPlayer1:', isPlayer1, 'currentGameId:', currentGameId);
    console.log('[patchPlayAndPreserveTempDecks] Parameter validation:', {
      player: typeof player,
      idx: typeof idx,
      isPlayer1: typeof isPlayer1,
      currentGameId: typeof currentGameId,
      playerValid: player === 'south' || player === 'north',
      idxValid: typeof idx === 'number' && idx >= 0,
      isPlayer1Valid: typeof isPlayer1 === 'boolean' || isPlayer1 === null,
      currentGameIdValid: typeof currentGameId === 'string' || currentGameId === null
    });
    
    if (!currentGameId || isPlayer1 === null) {
      console.log('[patchPlayAndPreserveTempDecks] Early exit: missing currentGameId or isPlayer1');
      return;
    }
    
    const playerKey = isPlayer1 ? 'player1' : 'player2';
    const otherPlayerKey = isPlayer1 ? 'player2' : 'player1';
    const gameDocRef = doc(db, 'games', currentGameId);
    
    console.log('[patchPlayAndPreserveTempDecks] Player keys - playerKey:', playerKey, 'otherPlayerKey:', otherPlayerKey);
    
    // Get current tempDecks and hands/discard for both players
    let tempDeck: Card[] = [];
    let otherTempDeck: Card[] = [];
    let southHand: Card[] = [];
    let northHand: Card[] = [];
    let discard: Card[] = [];
    let stock: Card[] = [];
    let turn = 'south' as Player;
    let currentSuit = '♠';
    let winner = null;
    let chooseSuit = false;
    
    try {
      console.log('[patchPlayAndPreserveTempDecks] Fetching Firebase doc...');
      const docSnap = await getDoc(gameDocRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('[patchPlayAndPreserveTempDecks] Raw Firebase data:', data);
        
        tempDeck = data?.players?.[playerKey]?.tempDeck || [];
        otherTempDeck = data?.players?.[otherPlayerKey]?.tempDeck || [];
        southHand = isPlayer1 ? (data?.players?.player1?.hand || []) : (data?.players?.player2?.hand || []);
        northHand = isPlayer1 ? (data?.players?.player2?.hand || []) : (data?.players?.player1?.hand || []);
        discard = data?.discardPile || [];
        stock = data?.pile || [];
        turn = data?.turn === 'player1' ? (isPlayer1 ? 'south' as Player : 'north' as Player) : (isPlayer1 ? 'north' as Player : 'south' as Player);
        currentSuit = data?.currentCard?.suit || '♠';
        winner = data?.status === 'finished' ? (turn as Player) : null;
        chooseSuit = false;
        
        console.log('[patchPlayAndPreserveTempDecks] Parsed Firebase data:', {
          tempDeck: tempDeck.length,
          otherTempDeck: otherTempDeck.length,
          southHand: southHand.length,
          northHand: northHand.length,
          discard: discard.length,
          stock: stock.length,
          turn,
          currentSuit,
          winner,
          chooseSuit
        });
        
        console.log('[patchPlayAndPreserveTempDecks] Detailed hands:', {
          southHand: southHand.map(c => `${c.value}${c.suit}`),
          northHand: northHand.map(c => `${c.value}${c.suit}`),
          discard: discard.map(c => `${c.value}${c.suit}`)
        });
      } else {
        console.log('[patchPlayAndPreserveTempDecks] Firebase doc does not exist');
        return;
      }
    } catch (err) {
      console.log('[patchPlayAndPreserveTempDecks] Error fetching Firebase doc:', err);
      console.log('[patchPlayAndPreserveTempDecks] Error stack:', err instanceof Error ? err.stack : 'No stack trace');
      return;
    }
    
    // Build a fresh game state from Firebase
    const freshGame: GameState = {
      hands: { south: southHand, north: northHand },
      stock,
      discard,
      turn,
      currentSuit,
      winner,
      chooseSuit,
    };
    
    console.log('[patchPlayAndPreserveTempDecks] Fresh game state:', {
      hands: { south: freshGame.hands.south.length, north: freshGame.hands.north.length },
      discard: freshGame.discard.length,
      stock: freshGame.stock.length,
      turn: freshGame.turn,
      currentSuit: freshGame.currentSuit
    });
    
    // Defensive: if idx is out of bounds, do nothing
    if (!freshGame.hands[player][idx]) {
      console.log('[patchPlayAndPreserveTempDecks] idx out of bounds:', idx, 'hand length:', freshGame.hands[player].length, 'hand:', freshGame.hands[player]);
      return;
    }
    
    const cardToPlay = freshGame.hands[player][idx];
    console.log('[patchPlayAndPreserveTempDecks] About to play card:', cardToPlay, 'from player:', player, 'at index:', idx);
    
    // Compute new game state after play
    console.log('[patchPlayAndPreserveTempDecks] Calling playCard...');
    let newGame;
    try {
      newGame = playCard(freshGame, player, idx);
      console.log('[patchPlayAndPreserveTempDecks] playCard completed successfully');
      console.log('[patchPlayAndPreserveTempDecks] New game state after playCard:', {
        hands: { south: newGame.hands.south.length, north: newGame.hands.north.length },
        discard: newGame.discard.length,
        stock: newGame.stock.length,
        turn: newGame.turn,
        currentSuit: newGame.currentSuit,
        winner: newGame.winner
      });
    } catch (err) {
      console.log('[patchPlayAndPreserveTempDecks] playCard threw error:', err);
      console.log('[patchPlayAndPreserveTempDecks] playCard error stack:', err instanceof Error ? err.stack : 'No stack trace');
      return;
    }
    
    // Update all relevant fields in a single atomic update
    try {
      console.log('[patchPlayAndPreserveTempDecks] Preparing Firebase update...');
      
      const updateData = {
        [`players.${playerKey}.tempDeck`]: tempDeck,
        [`players.${otherPlayerKey}.tempDeck`]: otherTempDeck,
        [`players.player1.hand`]: isPlayer1 ? newGame.hands.south : newGame.hands.north,
        [`players.player2.hand`]: isPlayer1 ? newGame.hands.north : newGame.hands.south,
        discardPile: newGame.discard,
        currentCard: newGame.discard.length > 0 ? newGame.discard[newGame.discard.length - 1] : null,
        pile: newGame.stock,
        turn: newGame.turn === 'south' ? (isPlayer1 ? 'player1' : 'player2') : (isPlayer1 ? 'player2' : 'player1'),
        status: newGame.winner ? 'finished' : 'in-progress',
        lastUpdated: serverTimestamp(),
      };
      
      console.log('[patchPlayAndPreserveTempDecks] Update data prepared:', {
        tempDeckLength: tempDeck.length,
        otherTempDeckLength: otherTempDeck.length,
        player1HandLength: updateData[`players.player1.hand`].length,
        player2HandLength: updateData[`players.player2.hand`].length,
        discardPileLength: newGame.discard.length,
        currentCard: updateData.currentCard,
        pileLength: newGame.stock.length,
        turn: updateData.turn,
        status: updateData.status
      });
      
      console.log('[patchPlayAndPreserveTempDecks] Calling updateDoc...');
      await updateDoc(gameDocRef, updateData);
      console.log('[patchPlayAndPreserveTempDecks] updateDoc completed successfully');
      
    } catch (err) {
      console.log('[patchPlayAndPreserveTempDecks] updateDoc error:', err);
      console.log('[patchPlayAndPreserveTempDecks] updateDoc error stack:', err instanceof Error ? err.stack : 'No stack trace');
      throw err; // Re-throw to be caught by caller
    }
  }

  // Removed finishAnimation function - no longer needed

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
    const newGameState = drawCard(game, player);
    setGame(newGameState);
    // Immediately update Firebase with the new game state
    await updateGameInFirebase(newGameState);
    setShowCenterCardDown(true);
    animateCenterCardDown();
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

  // Removed onPlayerCardAnimationEnd function - no longer needed

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
    console.log('animateCenterCardTopToMiddle');
    centerCardTopToMiddleY.value = -(height * 0.29); // Start from 10% from the top
    centerCardTopToMiddleY.value = withTiming(0, { duration: 2500 }, (finished) => {
      if (finished) {
        runOnJS(setShowCenterCardTopToMiddle)(false);
        runOnJS(setCenterCardTopToMiddleCard)(null);
      }
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
        console.log('opponent has added a card');
        const added = game.discard.length - prevDiscardLength.current;
        if (added > 0) {
          setCenterCardTopToMiddleCard(topCard);
          setShowCenterCardTopToMiddle(true);
          animateCenterCardTopToMiddle();
        }
      }else{
        console.log('opponent has not added a card');
      }
      prevDiscardLength.current = game.discard.length;
    }
  }, [game.discard]);

  // Add a loading state: show spinner if auth is loading, user is not loaded, or firebaseGameData is not loaded
  // Note: We don't wait for usernameLoading because we can use user.displayName as fallback
  const isLoading = authLoading || !user?.uid || !firebaseGameData;

  const [showMenu, setShowMenu] = useState(false);
  // Track selected cards for temp deck building
  const [selectedHandCards, setSelectedHandCards] = useState<number[]>([]);
  const [selectedDiscardCards, setSelectedDiscardCards] = useState<number[]>([]);

  // Add state for card choice modal
  const [showCardChoiceModal, setShowCardChoiceModal] = useState(false);
  const [cardChoiceOptions, setCardChoiceOptions] = useState<{ value: number; cards: Card[] }[]>([]);
  const [pendingCardsToAdd, setPendingCardsToAdd] = useState<Card[]>([]);

  // Add this handler above the component return
  function handleEndTurn() {
    // TODO: Implement end turn logic
    console.log('End Turn pressed');
  }

  // Removed selectedDiscardIndex - now using selectedDiscardCards array

  // Add function to add multiple cards to tempDeck
  async function addSelectedCardsToTempDeck() {
    if (selectedHandCards.length === 0 && selectedDiscardCards.length === 0) {
      console.log('[addSelectedCardsToTempDeck] No cards selected');
      return;
    }
    
    // Get all selected cards
    const selectedHandCardObjects = selectedHandCards.map(idx => game.hands.south[idx]).filter(Boolean);
    const selectedDiscardCardObjects = selectedDiscardCards.map(idx => game.discard[idx]).filter(Boolean);
    const allSelectedCards = [...selectedHandCardObjects, ...selectedDiscardCardObjects];
    
    if (allSelectedCards.length === 0) {
      console.log('[addSelectedCardsToTempDeck] No valid cards found');
      return;
    }
    
    // Calculate the sum of all selected cards
    const sum = allSelectedCards.reduce((total, card) => total + cardNumericValue(card), 0);
    console.log('[addSelectedCardsToTempDeck] Total sum:', sum, 'cards:', allSelectedCards);
    
    // Get current temp deck sum from Firebase data
    const currentTempDeckSum = firebaseGameData?.players?.[isPlayer1 ? 'player1' : 'player2']?.tempDeckSum || 0;
    console.log('[addSelectedCardsToTempDeck] Current temp deck sum:', currentTempDeckSum);
    
    let newTempDeckSum = currentTempDeckSum;
    // If temp deck sum is 0, only check if new sum is <= 10
    if (currentTempDeckSum === 0) {
      if (sum > 10) {
        console.log('[addSelectedCardsToTempDeck] Sum > 10, not allowing addition to temp deck');
        setSelectedHandCards([]);
        setSelectedDiscardCards([]);
        return;
      }
      // Set the temp deck sum to the sum of the first cards added
      newTempDeckSum = sum;
    } else {
      // If temp deck sum > 0, new cards must add up to the existing sum
      if (sum !== currentTempDeckSum) {
        console.log('[addSelectedCardsToTempDeck] Sum does not match temp deck sum:', sum, '!=', currentTempDeckSum);
        setSelectedHandCards([]);
        setSelectedDiscardCards([]);
        return;
      }
    }
    
    // Check if we have multiple cards of the same value that could be used to build different sums
    const valueGroups = new Map<number, Card[]>();
    allSelectedCards.forEach(card => {
      const value = cardNumericValue(card);
      if (!valueGroups.has(value)) {
        valueGroups.set(value, []);
      }
      valueGroups.get(value)!.push(card);
    });
    
    // Find values that have multiple cards and could be used to build different sums
    const ambiguousValues: { value: number; cards: Card[] }[] = [];
    valueGroups.forEach((cards, value) => {
      if (cards.length > 1) {
        // Check if this value could be used to build different sums
        const possibleSums = new Set<number>();
        
        // Single card sum
        possibleSums.add(value);
        
        // Multiple cards sum (if we have enough cards and the sum is <= 10)
        if (cards.length >= 2 && value * 2 <= 10) {
          possibleSums.add(value * 2);
        }
        if (cards.length >= 3 && value * 3 <= 10) {
          possibleSums.add(value * 3);
        }
        if (cards.length >= 4 && value * 4 <= 10) {
          possibleSums.add(value * 4);
        }
        
        // Only show as ambiguous if we have multiple valid options
        if (possibleSums.size > 1) {
          ambiguousValues.push({ value, cards });
        }
      }
    });
    
    // If we have ambiguous values, show the choice modal
    if (ambiguousValues.length > 0) {
      console.log('[addSelectedCardsToTempDeck] Found ambiguous values:', ambiguousValues);
      setCardChoiceOptions(ambiguousValues);
      setPendingCardsToAdd(allSelectedCards);
      setShowCardChoiceModal(true);
      return;
    }
    
    // No ambiguity, proceed with normal logic
    await addCardsToTempDeck(allSelectedCards, newTempDeckSum);
  }

  // Helper function to actually add cards to temp deck
  async function addCardsToTempDeck(cardsToAdd: Card[], newTempDeckSum: number) {
    console.log('[addCardsToTempDeck] Adding cards to temp deck:', cardsToAdd, 'sum:', newTempDeckSum);
    
    if (currentGameId && isPlayer1 !== null) {
      const playerKey = isPlayer1 ? 'player1' : 'player2';
      const otherPlayerKey = isPlayer1 ? 'player2' : 'player1';
      const gameDocRef = doc(db, 'games', currentGameId);
      
      // Get current tempDecks for both players
      let tempDeck: Card[] = [];
      let otherTempDeck: Card[] = [];
      try {
        const docSnap = await getDoc(gameDocRef);
        if (docSnap.exists()) {
          tempDeck = docSnap.data()?.players?.[playerKey]?.tempDeck || [];
          otherTempDeck = docSnap.data()?.players?.[otherPlayerKey]?.tempDeck || [];
        }
      } catch {}
      
      const newTempDeck = [...tempDeck, ...cardsToAdd];
      
      // Create a map to track which cards to remove
      const cardsToRemove = new Map<string, number>();
      cardsToAdd.forEach(card => {
        const key = `${card.suit}-${card.value}`;
        cardsToRemove.set(key, (cardsToRemove.get(key) || 0) + 1);
      });
      
      // Remove cards from hand
      const newHand = [...game.hands.south];
      const remainingHandCards: Card[] = [];
      newHand.forEach(card => {
        const key = `${card.suit}-${card.value}`;
        const count = cardsToRemove.get(key) || 0;
        if (count > 0) {
          cardsToRemove.set(key, count - 1);
        } else {
          remainingHandCards.push(card);
        }
      });
      
      // Remove cards from discard
      const newDiscard = [...game.discard];
      const remainingDiscardCards: Card[] = [];
      newDiscard.forEach(card => {
        const key = `${card.suit}-${card.value}`;
        const count = cardsToRemove.get(key) || 0;
        if (count > 0) {
          cardsToRemove.set(key, count - 1);
        } else {
          remainingDiscardCards.push(card);
        }
      });
      
      // Update all relevant fields in a single atomic update
      await updateDoc(gameDocRef, {
        [`players.${playerKey}.tempDeck`]: newTempDeck,
        [`players.${playerKey}.tempDeckSum`]: newTempDeckSum,
        [`players.${otherPlayerKey}.tempDeck`]: otherTempDeck,
        [`players.player1.hand`]: isPlayer1 ? remainingHandCards : game.hands.north,
        [`players.player2.hand`]: isPlayer1 ? game.hands.north : remainingHandCards,
        discardPile: remainingDiscardCards,
        currentCard: remainingDiscardCards.length > 0 ? remainingDiscardCards[remainingDiscardCards.length - 1] : null,
      });
    }
    
    // Clear selections
    setSelectedHandCards([]);
    setSelectedDiscardCards([]);
  }

  // Handle card choice from modal
  async function handleCardChoice(selectedValue: number, selectedCards: Card[]) {
    console.log('[handleCardChoice] Selected value:', selectedValue, 'cards:', selectedCards);
    
    // Get current temp deck sum from Firebase data
    const currentTempDeckSum = firebaseGameData?.players?.[isPlayer1 ? 'player1' : 'player2']?.tempDeckSum || 0;
    
    // Calculate new temp deck sum
    let newTempDeckSum = currentTempDeckSum;
    if (currentTempDeckSum === 0) {
      newTempDeckSum = selectedValue;
    } else {
      // This should match the existing sum since we validated earlier
      newTempDeckSum = currentTempDeckSum;
    }
    
    // Add the selected cards to temp deck
    await addCardsToTempDeck(selectedCards, newTempDeckSum);
    
    // Close the modal
    setShowCardChoiceModal(false);
    setCardChoiceOptions([]);
    setPendingCardsToAdd([]);
  }

  // Update handleCardSelect for multiple card selection
  function handleCardSelect(idx: number) {
    if (gamePhase !== 'playing' || game.winner !== null || game.chooseSuit) {
      return;
    }
    const card = game.hands.south[idx];
    const top = game.discard[game.discard.length - 1];
    
    // Only allow selection if card can be played
    if (canPlay(card, top, game.currentSuit)) {
      // Toggle selection - if already selected, remove it
      if (selectedHandCards.includes(idx)) {
        setSelectedHandCards(prev => prev.filter(i => i !== idx));
      } else {
        // Add to selection
        setSelectedHandCards(prev => [...prev, idx]);
      }
    }
  }

  // Update handleDiscardCardClick for multiple card selection
  function handleDiscardCardClick(discardIdx?: number) {
    // If no index provided, do nothing
    if (typeof discardIdx !== 'number') return;
    
    // Toggle selection - if already selected, remove it
    if (selectedDiscardCards.includes(discardIdx)) {
      setSelectedDiscardCards(prev => prev.filter(i => i !== discardIdx));
    } else {
      // Add to selection
      setSelectedDiscardCards(prev => [...prev, discardIdx]);
    }
  }

  // Add state for local player's tempDeck
  const [localTempDeck, setLocalTempDeck] = useState<Card[]>([]);
  const [localTempDeckSum, setLocalTempDeckSum] = useState<number>(0);

  // Sync localTempDeck with Firebase
  useEffect(() => {
    if (!firebaseGameData || isPlayer1 === null) return;
    const playerKey = isPlayer1 ? 'player1' : 'player2';
    const tempDeck = firebaseGameData?.players?.[playerKey]?.tempDeck || [];
    const tempDeckSum = firebaseGameData?.players?.[playerKey]?.tempDeckSum || 0;
    setLocalTempDeck(tempDeck);
    setLocalTempDeckSum(tempDeckSum);
  }, [firebaseGameData, isPlayer1]);

  // Helper for deterministic random (so cards don't jump on every render)
  function seededRandom(seed: number) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  // Update handleDiscardPileClick to play the first selected hand card to the pile
  function handleDiscardPileClick() {
    console.log('[handleDiscardPileClick] START - selectedHandCards:', selectedHandCards, 'gamePhase:', gamePhase);
    console.log('[handleDiscardPileClick] Current game state:', {
      hands: { south: game.hands.south.length, north: game.hands.north.length },
      discard: game.discard.length,
      turn: game.turn,
      winner: game.winner,
      chooseSuit: game.chooseSuit
    });
    
    if (selectedHandCards.length > 0 && gamePhase === 'playing') {
      const firstSelectedIndex = selectedHandCards[0];
      console.log('[handleDiscardPileClick] Calling handlePlay with south player and index:', firstSelectedIndex);
      try {
        handlePlay('south', firstSelectedIndex);
        console.log('[handleDiscardPileClick] handlePlay called successfully');
      } catch (err) {
        console.log('[handleDiscardPileClick] handlePlay threw error:', err);
        console.log('[handleDiscardPileClick] Error stack:', err instanceof Error ? err.stack : 'No stack trace');
      }
      setSelectedHandCards([]);
    } else {
      console.log('[handleDiscardPileClick] Conditions not met - selectedHandCards:', selectedHandCards, 'gamePhase:', gamePhase);
    }
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#14532d' }}>
        <ActivityIndicator size="large" color="#FFD700" />
        <ThemedText style={{ color: '#FFD700', marginTop: 16, fontSize: 18 }}>Loading game...</ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      
      {/* Removed animated card - no longer needed */}

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
              {/* North player deck placeholder */}
              <View style={{ flexDirection: 'row', marginBottom: 24 }}>
                {/* Show actual dealt cards */}
                {dealtHands.north.map((card, idx) => (
                  <View key={`dealt-${idx}`} style={{ marginLeft: idx === 0 ? 0 : -32, zIndex: idx }}>
                    {getCardBack()}
                  </View>
                ))}
                {/* Show placeholder cards for remaining slots */}
                {Array.from({ length: CARDS_PER_PLAYER - dealtHands.north.length }, (_, idx) => (
                  <View key={`placeholder-north-${idx}`} style={{ 
                    marginLeft: dealtHands.north.length === 0 ? 0 : -32, 
                    zIndex: dealtHands.north.length + idx,
                    opacity: 0.3 
                  }}>
                    <View style={styles.cardPlaceholder} />
                  </View>
                ))}
              </View>
              
              {/* South player deck placeholder */}
              <View style={{ flexDirection: 'row', marginBottom: 24 }}>
                {/* Show actual dealt cards */}
                {dealtHands.south.map((card, idx) => (
                  <View key={`dealt-${idx}`} style={{ marginLeft: idx === 0 ? 0 : -32, zIndex: idx }}>
                    {getCardBack()}
                  </View>
                ))}
                {/* Show placeholder cards for remaining slots */}
                {Array.from({ length: CARDS_PER_PLAYER - dealtHands.south.length }, (_, idx) => (
                  <View key={`placeholder-south-${idx}`} style={{ 
                    marginLeft: dealtHands.south.length === 0 ? 0 : -32, 
                    zIndex: dealtHands.south.length + idx,
                    opacity: 0.3 
                  }}>
                    <View style={styles.cardPlaceholder} />
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
                  <View style={{ marginRight: 8 }}>
                    <DeckPlaceholder style={styles.northDeckPlaceholder} text="Deck" />
                  </View>
                  {game.hands.north.length > 0 ? (
                    game.hands.north.map((card, idx) => {
                      const totalCards = game.hands.north.length;
                      const maxRotation = 12; // Maximum rotation in degrees
                      let rotation = 0;
                      if (totalCards === 1) {
                        rotation = 0;
                      } else if (totalCards === 2) {
                        rotation = idx === 0 ? -maxRotation : maxRotation;
                      } else if (totalCards > 2) {
                        // Spread from -maxRotation to +maxRotation
                        rotation = -maxRotation + (2 * maxRotation * idx) / (totalCards - 1);
                      }
                      return (
                        <View
                          key={`${card.suit}-${card.value}-${idx}`}
                          ref={ref => (northHandCardRefs.current[idx] = ref)}
                          style={{
                            marginLeft: idx === 0 ? 0 : -56,
                            zIndex: idx,
                            transform: [{ rotate: `${rotation}deg` }],
                          }}
                        >
                          {getCardBack()}
                        </View>
                      );
                    })
                  ) : null}
                </View>
              </View>
              
              {/* Discard and stock piles at center */}
              <View style={styles.pilesRowContainer}>
                <ThemedText style={styles.discardHintText}>
                  {selectedHandCards.length > 0 ? 'Tap discard pile to play card' : 'Select cards to play or add to temp deck'}
                </ThemedText>
                <View style={styles.pilesRow}>
                  {/* Discard pile - show last 5 cards in a row, smaller size */}
                  <TouchableOpacity
                    onPress={handleDiscardPileClick}
                    activeOpacity={0.8}
                    style={{
                      alignItems: 'center',
                      position: 'relative',
                      height: 200,
                      width: '100%',
                      flexDirection: 'row',
                      borderWidth: 2,
                      borderColor: 'rgba(255, 255, 255, 0.3)',
                      borderRadius: 12,
                      padding: 8,
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <View
                      ref={discardRef}
                      collapsable={false}
                      style={{
                        alignItems: 'center',
                        flexDirection: 'column',
                        minHeight: 80,
                        minWidth: 240,
                      }}
                    >
                      {/* Render discard pile in two rows */}
                      {(() => {
                        const discardPile = firebaseGameData?.discardPile ?? game.discard;
                        const len = discardPile.length;
                        
                        if (len === 0) {
                          return (
                            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                              <ThemedText style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 14 }}>No cards in discard pile</ThemedText>
                            </View>
                          );
                        }
                        
                        // Always use 2 rows for better organization
                        const halfLength = Math.ceil(len / 2);
                        const firstRow = discardPile.slice(0, halfLength);
                        const secondRow = discardPile.slice(halfLength);
                        
                        return (
                          <>
                            <View style={{ flexDirection: 'row', marginBottom: 4, justifyContent: 'center' }}>
                              {firstRow.map((card: Card, idx: number) => {
                                // Add some random but deterministic transformations
                                const seed = idx + firstRow.length;
                                const rotation = (seededRandom(seed) - 0.5) * 8; // -4 to +4 degrees
                                const scale = 0.95 + (seededRandom(seed + 100) * 0.1); // 0.95 to 1.05
                                const translateY = (seededRandom(seed + 200) - 0.5) * 4; // -2 to +2 pixels
                                
                                return (
                                  <TouchableOpacity
                                    key={`discard-row1-${idx}`}
                                    onPress={e => {
                                      e.stopPropagation && e.stopPropagation();
                                      handleDiscardCardClick(idx);
                                    }}
                                    style={{ 
                                      marginLeft: idx === 0 ? 0 : -8, 
                                      zIndex: idx, 
                                      borderWidth: selectedDiscardCards.includes(idx) ? 2 : 0, 
                                      borderColor: selectedDiscardCards.includes(idx) ? '#FFD700' : 'transparent', 
                                      borderRadius: 8,
                                      transform: [
                                        { rotate: `${rotation}deg` },
                                        { scale },
                                        { translateY }
                                      ],
                                      shadowColor: '#000',
                                      shadowOpacity: 0.2,
                                      shadowRadius: 3,
                                      shadowOffset: { width: 0, height: 2 },
                                      elevation: 4,
                                    }}
                                  >
                                    <CasinoCard suit={card.suit} value={card.value} style={{ width: 64, height: 80, opacity: 1 }} />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                              {secondRow.map((card: Card, idx: number) => {
                                // Add some random but deterministic transformations
                                const seed = idx + secondRow.length + 1000; // Different seed for second row
                                const rotation = (seededRandom(seed) - 0.5) * 8; // -4 to +4 degrees
                                const scale = 0.95 + (seededRandom(seed + 100) * 0.1); // 0.95 to 1.05
                                const translateY = (seededRandom(seed + 200) - 0.5) * 4; // -2 to +2 pixels
                                
                                return (
                                  <TouchableOpacity
                                    key={`discard-row2-${idx}`}
                                    onPress={e => {
                                      e.stopPropagation && e.stopPropagation();
                                      handleDiscardCardClick(halfLength + idx);
                                    }}
                                    style={{ 
                                      marginLeft: idx === 0 ? 0 : -8, 
                                      zIndex: idx, 
                                      borderWidth: selectedDiscardCards.includes(halfLength + idx) ? 2 : 0, 
                                      borderColor: selectedDiscardCards.includes(halfLength + idx) ? '#FFD700' : 'transparent', 
                                      borderRadius: 8,
                                      transform: [
                                        { rotate: `${rotation}deg` },
                                        { scale },
                                        { translateY }
                                      ],
                                      shadowColor: '#000',
                                      shadowOpacity: 0.2,
                                      shadowRadius: 3,
                                      shadowOffset: { width: 0, height: 2 },
                                      elevation: 4,
                                    }}
                                  >
                                    <CasinoCard suit={card.suit} value={card.value} style={{ width: 64, height: 80, opacity: 1 }} />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </>
                        );
                      })()}
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Add to Temp Deck Button */}
              {(selectedHandCards.length > 0 || selectedDiscardCards.length > 0) && (
                <View style={styles.tempDeckButtonContainer}>
                  <TouchableOpacity
                    style={styles.addToTempDeckButton}
                    onPress={addSelectedCardsToTempDeck}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={styles.addToTempDeckButtonText}>
                      Add to Temp Deck ({selectedHandCards.length + selectedDiscardCards.length} cards)
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              )}
              
              {/* South hand (player) - moved to bottom */}
              <View style={styles.southHandContainer}>
                <View style={{ marginRight: 8, alignSelf: 'flex-end' }}>
                  <DeckPlaceholder style={styles.southDeckPlaceholder} text="Deck" />
                </View>
                <View style={styles.southHandRow}>
                  {game.hands.south.length > 0 ? (
                    game.hands.south.map((card, idx) => {
                      const totalCards = game.hands.south.length;
                      const maxRotation = 12; // Maximum rotation in degrees
                      let rotation = 0;
                      if (totalCards === 1) {
                        rotation = 0;
                      } else if (totalCards === 2) {
                        rotation = idx === 0 ? -maxRotation : maxRotation;
                      } else if (totalCards > 2) {
                        // Spread from -maxRotation to +maxRotation
                        rotation = -maxRotation + (2 * maxRotation * idx) / (totalCards - 1);
                      }
                      return (
                        <View
                          key={`${card.suit}-${card.value}-${idx}`}
                          ref={ref => (handCardRefs.current[idx] = ref)}
                          style={{
                            marginLeft: idx === 0 ? 0 : -56,
                            zIndex: idx,
                            transform: [{ rotate: `${rotation}deg` }],
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => handleCardSelect(idx)}
                            disabled={game.winner !== null || game.chooseSuit || !canPlay(card, game.discard[game.discard.length - 1], game.currentSuit)}
                          >
                            <Animated.View style={{ transform: [{ scale: selectedHandCards.includes(idx) ? 0.85 : 1 }] }}>
                              <CasinoCard suit={card.suit} value={card.value} style={{ width: 72, height: 104 }} />
                            </Animated.View>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  ) : null}
                </View>
              </View>
              
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

              {/* In the render, above the south hand, render the tempDeck stack */}
              {gamePhase === 'playing' && localTempDeck.length > 0 && (
                <View style={{
                  position: 'absolute',
                  bottom: 350,
                  left: '10%',
                  transform: [{ translateX: -((localTempDeck.length * 16) / 2) }],
                  flexDirection: 'column',
                  zIndex: 20,
                  pointerEvents: 'none',
                  alignItems: 'center',
                }}>
                  
                  
                  {/* Temp Deck Cards */}
                  <View style={{ flexDirection: 'row', position: 'relative' }}>
                    {localTempDeck.map((card, idx) => {
                      // Deterministic random rotation and translation
                      const rot = (seededRandom(idx + 1) - 0.5) * 30; // -15 to +15 deg
                      const tx = (seededRandom(idx + 100) - 0.5) * 16; // -8 to +8 px
                      const ty = (seededRandom(idx + 200) - 0.5) * 8; // -4 to +4 px
                      return (
                        <View
                          key={`tempdeck-${card.suit}-${card.value}-${idx}`}
                          style={{
                            position: 'absolute',
                            left: idx * 5,
                            zIndex: idx,
                            transform: [
                              { rotate: `${rot}deg` },
                              { translateX: tx },
                              { translateY: ty },
                            ],
                            shadowColor: '#000',
                            shadowOpacity: 0.15,
                            shadowRadius: 4,
                            shadowOffset: { width: 0, height: 2 },
                          }}
                        >
                          <CasinoCard suit={card.suit} value={card.value} style={{ width: 48, height: 68 }} />
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
              {/* Temp Deck Sum Display */}
              <View style={styles.tempDeckSumContainer}>
                <ThemedText style={styles.tempDeckSumText}>
                   {localTempDeckSum}
                </ThemedText>
              </View>
            </>
          )}
        </LinearGradient>
        
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
        {/* End Turn Button - show only if it's the local player's turn and playing phase */}
        {gamePhase === 'playing' && game.turn === 'south' && (
          <TouchableOpacity
            style={styles.endTurnButton}
            onPress={handleEndTurn}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.endTurnButtonText}>End Turn</ThemedText>
          </TouchableOpacity>
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

      {/* Card Choice Modal */}
      <Modal
        visible={showCardChoiceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCardChoiceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>🎯 Choose Your Build</ThemedText>
            </View>
            <View style={styles.modalBody}>
              
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 16 }}>
                {cardChoiceOptions.map((option, index) => {
                  // Calculate possible sums for this value
                  const possibleSums = new Set<number>();
                  possibleSums.add(option.value);
                  if (option.cards.length >= 2 && option.value * 2 <= 10) {
                    possibleSums.add(option.value * 2);
                  }
                  if (option.cards.length >= 3 && option.value * 3 <= 10) {
                    possibleSums.add(option.value * 3);
                  }
                  if (option.cards.length >= 4 && option.value * 4 <= 10) {
                    possibleSums.add(option.value * 4);
                  }
                  
                  return Array.from(possibleSums).map((sum, sumIndex) => (
                    <TouchableOpacity
                      key={`${index}-${sumIndex}`}
                      style={styles.cardChoiceOption}
                      onPress={() => {
                        // Use all cards but set the sum to the selected value
                        handleCardChoice(sum, option.cards);
                      }}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={styles.cardChoiceValue}>
                        {sum}
                      </ThemedText>
                    </TouchableOpacity>
                  ));
                })}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: '#6b7280' }]}
              onPress={() => {
                setShowCardChoiceModal(false);
                setCardChoiceOptions([]);
                setPendingCardsToAdd([]);
                setSelectedHandCards([]);
                setSelectedDiscardCards([]);
              }}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
  } catch (err) {
    console.log('[CasinoGameScreen] Component render error:', err);
    console.log('[CasinoGameScreen] Error stack:', err instanceof Error ? err.stack : 'No stack trace');
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#14532d' }}>
        <ThemedText style={{ color: '#FFD700', fontSize: 18, textAlign: 'center' }}>
          Something went wrong. Please restart the app.
        </ThemedText>
      </View>
    );
  }
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
  pilesRowContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -20,
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
  cardPlaceholder: {
    width: 56,
    height: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    marginHorizontal: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderStyle: 'dashed',
  },
  northHandContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: 3,
    alignItems: 'flex-start',
  },
  northHandRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 0,
    zIndex: 2,
    height: 134,
    paddingLeft: 0,
    marginLeft: 0,
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
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
    height: 134,
    marginTop: 8,
    padding: 12,
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
  menuButtonWrapper: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 1000,
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
  emptyHandPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyCardSlot: {
    width: 72,
    height: 104,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderStyle: 'dashed',
    marginBottom: 8,
  },
  emptyHandText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  deckPlaceholderSingle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  deckPlaceholderCard: {
    width: 72,
    height: 104,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginBottom: 4,
  },
  deckPlaceholderText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
    marginHorizontal: 8,
    textAlign: 'center',
  },
  northDeckPlaceholder: {
    alignSelf: 'flex-start',
    marginLeft: 24,
    marginRight: 24,
    marginTop: 4,
    marginBottom: 8,
  },
  southDeckPlaceholder: {
    alignSelf: 'flex-end',
    marginBottom: 16,
    marginTop: 0,
    zIndex: 10,
    marginRight: 24,
  },
  endTurnButton: {
    position: 'absolute',
    bottom: 180,
    left: 32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#19C37D',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 100,
  },
  endTurnButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  discardHintText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
    width: '100%',
    opacity: 0.8,
  },
  pilesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    width: '100%',
    paddingHorizontal: 24,
  },
  tempDeckButtonContainer: {
    position: 'absolute',
    bottom: 280,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  addToTempDeckButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  addToTempDeckButtonText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  tempDeckSumContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  tempDeckSumText: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  cardChoiceOption: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  cardChoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardChoiceValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  cardChoiceCount: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  cardChoiceCards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardChoiceCard: {
    marginRight: 4,
  },
});
