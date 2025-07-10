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

// Update DeckPlaceholder to accept props for size, text, and cards
function DeckPlaceholder({ text = 'Deck Empty', style = {}, cards = [] }: { text?: string; style?: any; cards?: Card[] }) {
  return (
    <View style={[styles.deckPlaceholderSingle, style]}>
      {cards.length > 0 ? (
        // Show actual deck cards as a stacked pile
        <View style={{ position: 'relative', alignItems: 'center' }}>
          {cards.slice(0, 5).map((card, idx) => (
            <View
              key={`deck-card-${idx}`}
              style={{
                position: 'absolute',
                left: idx * 2, // Small horizontal spill
                top: idx * 1,  // Small vertical spill
                zIndex: idx,
                transform: [{ rotate: `${(idx - 2) * 2}deg` }], // Slight rotation for natural look
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 3,
                elevation: idx,
              }}
            >
              <CasinoCard 
                suit={card.suit} 
                value={card.value} 
                style={{ width: 48, height: 68 }}
              />
            </View>
          ))}
          {cards.length > 5 && (
            <View style={{
              position: 'absolute',
              left: 5 * 2 + 4,
              top: 5 * 1 + 2,
              zIndex: 5,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.3)',
            }}>
              <ThemedText style={{
                color: '#fff',
                fontSize: 11,
                fontWeight: 'bold',
              }}>
                +{cards.length - 5}
              </ThemedText>
            </View>
          )}
        </View>
      ) : (
        // Show empty placeholder
        <View style={styles.deckPlaceholderCard} />
      )}
      <ThemedText style={styles.deckPlaceholderText}>
        {cards.length > 0 ? `Deck (${cards.length})` : text}
      </ThemedText>
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
  const [round, setRound] = useState(1); // <-- Add round state
  const handCardRefs = useRef<(View | null)[]>([]);
  const discardRef = useRef<View | null>(null);
  // Track hand size at the start of each turn
  const [handSizeAtTurnStart, setHandSizeAtTurnStart] = useState<number>(0);
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
  const prevTurn = useRef<Player | null>(null);
  const prevDiscardLength = useRef<number>(0);
  const prevOpponentTempDeckLength = useRef<number>(0);
  const prevDiscardPile = useRef<Card[]>([]);
  const prevOpponentDeckLength = useRef<number>(0);

  const [localTopCard, setLocalTopCard] = useState<Card | null>(null);
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
        // --- ROUND SYNC ---
        if (typeof gameData.round === 'number') {
          setRound(gameData.round);
        } else {
          setRound(1);
        }
        
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
          
          // Update previous length for next comparison
          prevOpponentHandLength.current = northHand.length;
          
          // Clear syncing flag after a short delay
          setTimeout(() => {
            isSyncingToFirebase.current = false;
          }, 200);
          
          // Update hand size at turn start when it becomes our turn
          if (newGameState.turn === 'south' && game.turn !== 'south') {
            console.log('[FIREBASE SYNC] Setting hand size at turn start:', {
              oldTurn: game.turn,
              newTurn: newGameState.turn,
              handSize: newGameState.hands.south.length
            });
            setHandSizeAtTurnStart(newGameState.hands.south.length);
          }
          
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
  async function updateGameInFirebase(gameState: GameState, lastCardPlayed?: Card, actionType?: string) {
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
      
      // Add lastAction tracking
      if (actionType) {
        const playerKey = isPlayer1 ? 'player1' : 'player2';
        updateData.lastAction = {
          player: playerKey,
          action: actionType,
          timestamp: serverTimestamp(),
        };
      }
      
      await updateDoc(gameDocRef, updateData);
    } catch (err) {
    }
  }

  // Handle Deal button (for round 1)
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
        }, 150); // Reduced from 300ms to 150ms
      } else if (i < CARDS_PER_PLAYER * 2) {
        setTimeout(() => {
          south = [...south, stock.shift()!]; // Add card to south player's array
          setDealtHands(h => ({ ...h, south: south.slice() }));
          setDealtStock(stock.slice());
          i++;
          dealNext();
        }, 150); // Reduced from 300ms to 150ms
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
              await updateGameInFirebase(newGameState, undefined, 'deal');
              
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
              
              // Set initial hand size for the first turn
              setHandSizeAtTurnStart(south.length);
            }, 200); // Reduced from 400ms to 200ms
          }, 200); // Reduced from 400ms to 200ms
      }
    }
    dealNext();
    // --- Set round to 1 in Firestore ---
    if (currentGameId) {
      const gameDocRef = doc(db, 'games', currentGameId);
      await updateDoc(gameDocRef, { round: 1 });
    }
    setRound(1);
    } catch (err) {
      // Reset to init phase on error
      setGamePhase('init');
    }
  }

  // Handle Deal for Round 2
  async function handleDealRound2() {
    if (!currentGameId) return;
    // Use the remaining stock in Firebase (firebaseGameData.pile)
    const stock = (firebaseGameData?.pile || []).slice();
    let north: Card[] = [];
    let south: Card[] = [];
    // Deal 10 cards to each player (or as many as possible)
    for (let i = 0; i < CARDS_PER_PLAYER && stock.length > 0; i++) {
      north.push(stock.shift());
    }
    for (let i = 0; i < CARDS_PER_PLAYER && stock.length > 0; i++) {
      south.push(stock.shift());
    }
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
    if (discard.length === 0 && stock.length > 0) {
      top = stock.shift();
      if (top) discard = [top];
    }
    if (discard.length === 0) {
      discard = [{ suit: '♠', value: 'A' }];
    }
    // Update Firestore and local state
    const newGameState: GameState = {
      hands: { north, south },
      stock,
      discard,
      turn: 'south',
      currentSuit: discard[0].suit,
      winner: null,
      chooseSuit: false,
    };
    setGame(newGameState);
    setGamePhase('playing');
    setRound(2);
    // Set hand size for round 2
    setHandSizeAtTurnStart(south.length);
    // Update Firestore
    const gameDocRef = doc(db, 'games', currentGameId);
    await updateDoc(gameDocRef, {
      'players.player1.hand': isPlayer1 ? south : north,
      'players.player2.hand': isPlayer1 ? north : south,
      pile: stock,
      discardPile: discard,
      currentCard: discard[0],
      turn: 'player1',
      round: 2,
      status: 'in-progress',
      lastUpdated: serverTimestamp(),
      lastAction: {
        player: isPlayer1 ? 'player1' : 'player2',
        action: 'deal_round2',
        timestamp: serverTimestamp(),
      },
    });
  }

  // Handle play for either player (with animation for south)
  async function handlePlay(player: Player, idx: number) {
    // Prevent play if player is south, has a temp deck, and round is 1
    if (player === 'south' && round === 1) {
      const playerKey = isPlayer1 ? 'player1' : 'player2';
      const tempDeck = firebaseGameData?.players?.[playerKey]?.tempDeck || [];
      if (tempDeck.length > 0) {
        Alert.alert('Invalid move', 'According to the rules, the move is invalid');
        return;
      }
    }
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
      
      // Keep the turn with the current player instead of switching
      newGame.turn = player;
      console.log('[patchPlayAndPreserveTempDecks] Turn kept with current player:', player);
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
        turn: playerKey, // Keep turn with the current player
        status: newGame.winner ? 'finished' : 'in-progress',
        lastUpdated: serverTimestamp(),
        lastAction: {
          player: playerKey,
          action: 'play',
          timestamp: serverTimestamp(),
        },
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
    await updateGameInFirebase(newGameState, undefined, 'draw');
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
    await updateGameInFirebase(newGameState, undefined, 'undo');
  }

  // Removed onPlayerCardAnimationEnd function - no longer needed

  // Ensure refs arrays match hand lengths
  if (handCardRefs.current.length !== game.hands.south.length) {
    handCardRefs.current.length = game.hands.south.length;
  }

  // Animation for cards moving from discard pile to temp deck
  const [showDiscardToTempDeckAnimation, setShowDiscardToTempDeckAnimation] = useState(false);
  const [animatingCardsToTempDeck, setAnimatingCardsToTempDeck] = useState<Card[]>([]);
  const discardToTempDeckX = useSharedValue(0);
  const discardToTempDeckY = useSharedValue(0);
  const discardToTempDeckScale = useSharedValue(1);

  // Dev animation for opponent hand to temp deck
  const [showOpponentHandToTempDeckAnimation, setShowOpponentHandToTempDeckAnimation] = useState(false);
  const [animatingOpponentHandCardsToTempDeck, setAnimatingOpponentHandCardsToTempDeck] = useState<Card[]>([]);
  const opponentHandToTempDeckX = useSharedValue(0);
  const opponentHandToTempDeckY = useSharedValue(0);
  const opponentHandToTempDeckScale = useSharedValue(1);

  // Dev animation for opponent hand to discard pile
  const [showOpponentHandToDiscardAnimation, setShowOpponentHandToDiscardAnimation] = useState(false);
  const [animatingOpponentHandCardsToDiscard, setAnimatingOpponentHandCardsToDiscard] = useState<Card[]>([]);
  const opponentHandToDiscardX = useSharedValue(0);
  const opponentHandToDiscardY = useSharedValue(0);
  const opponentHandToDiscardScale = useSharedValue(1);

  // Dev animation for north temp deck to north deck
  const [showNorthTempDeckToDeckAnimation, setShowNorthTempDeckToDeckAnimation] = useState(false);
  const [animatingNorthTempDeckCardsToDeck, setAnimatingNorthTempDeckCardsToDeck] = useState<Card[]>([]);
  const northTempDeckToDeckX = useSharedValue(0);
  const northTempDeckToDeckY = useSharedValue(0);
  const northTempDeckToDeckScale = useSharedValue(1);

  const discardToTempDeckAnimStyle = useAnimatedStyle(() => ({
    left: discardToTempDeckX.value - 36,
    top: discardToTempDeckY.value - 52,
    transform: [{ scale: discardToTempDeckScale.value }],
    opacity: 1,
  }));

  const opponentHandToTempDeckAnimStyle = useAnimatedStyle(() => ({
    left: opponentHandToTempDeckX.value - 36,
    top: opponentHandToTempDeckY.value - 52,
    transform: [{ scale: opponentHandToTempDeckScale.value }],
    opacity: 1,
  }));

  const opponentHandToDiscardAnimStyle = useAnimatedStyle(() => ({
    left: opponentHandToDiscardX.value - 36,
    top: opponentHandToDiscardY.value - 52,
    transform: [{ scale: opponentHandToDiscardScale.value }],
    opacity: 1,
  }));

  const northTempDeckToDeckAnimStyle = useAnimatedStyle(() => ({
    left: northTempDeckToDeckX.value - 36,
    top: northTempDeckToDeckY.value - 52,
    transform: [{ scale: northTempDeckToDeckScale.value }],
    opacity: 1,
  }));




  function animateDiscardToTempDeck(cards: Card[]) {
    console.log('[ANIMATE] animateDiscardToTempDeck called with cards:', cards);
    
    if (cards.length === 0) {
      console.log('[ANIMATE] No cards to animate, returning early');
      return;
    }
    
    setAnimatingCardsToTempDeck(cards);
    setShowDiscardToTempDeckAnimation(true);
    console.log('[ANIMATE] Animation state set, measuring positions...');
    
    // Measure the discard pile position and temp deck position
    InteractionManager.runAfterInteractions(() => {
      function tryMeasure(attempt = 0) {
        console.log('[ANIMATE] tryMeasure attempt:', attempt);
        const discardRefCurrent = discardRef.current;
        
        if (!discardRefCurrent) {
          console.log('[ANIMATE] discardRef not available');
          if (attempt < 5) {
            console.log('[ANIMATE] Retrying measurement...');
            requestAnimationFrame(() => tryMeasure(attempt + 1));
            return;
          }
          console.log('[ANIMATE] Measurement failed after 5 attempts, using fallback');
          // Fallback animation if measurement fails
          runOnJS(setShowDiscardToTempDeckAnimation)(false);
          runOnJS(setAnimatingCardsToTempDeck)([]);
          return;
        }
        
        discardRefCurrent.measureInWindow((dx, dy, dwidth, dheight) => {
          console.log('[ANIMATE] measureInWindow result:', { dx, dy, dwidth, dheight });
          
          if ([dx, dy].some(v => typeof v !== 'number' || isNaN(v))) {
            console.log('[ANIMATE] Invalid measurements detected');
            if (attempt < 5) {
              console.log('[ANIMATE] Retrying measurement due to invalid values...');
              requestAnimationFrame(() => tryMeasure(attempt + 1));
              return;
            }
            console.log('[ANIMATE] Measurement failed after 5 attempts due to invalid values');
            runOnJS(setShowDiscardToTempDeckAnimation)(false);
            runOnJS(setAnimatingCardsToTempDeck)([]);
            return;
          }
          
          // Calculate discard pile center
          const discardCenterX = dx + dwidth / 2;
          const discardCenterY = dy + dheight / 2;
          
          // Calculate temp deck position (bottom left area)
          const tempDeckX = width * 0.1; // 10% from left
          const tempDeckY = height - 350; // Above the south hand
          
          console.log('[ANIMATE] Animation coordinates calculated:', {
            discardCenterX,
            discardCenterY,
            tempDeckX,
            tempDeckY
          });
          
          // Set initial position to discard pile
          discardToTempDeckX.value = discardCenterX;
          discardToTempDeckY.value = discardCenterY;
          discardToTempDeckScale.value = 1;
          
          // Animate to temp deck position with scale effect
          discardToTempDeckX.value = withTiming(tempDeckX, { duration: 1200 });
          discardToTempDeckY.value = withTiming(tempDeckY, { duration: 1200 });
          discardToTempDeckScale.value = withTiming(0.8, { duration: 600 }, () => {
            discardToTempDeckScale.value = withTiming(0.6, { duration: 600 }, (finished) => {
              if (finished) {
                runOnJS(setShowDiscardToTempDeckAnimation)(false);
                runOnJS(setAnimatingCardsToTempDeck)([]);
              }
            });
          });
          
          console.log('[ANIMATE] Discard to temp deck animation started');
        });
      }
      
      console.log('[ANIMATE] Starting measurement with 10ms delay');
      setTimeout(() => tryMeasure(), 10);
    });
  }





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
  async function handleEndTurn() {
    console.log('[handleEndTurn] End Turn pressed');
    console.log('[handleEndTurn] Current state:', {
      gamePhase,
      gameTurn: game.turn,
      winner: game.winner,
      chooseSuit: game.chooseSuit,
      handSize: game.hands.south.length,
      handSizeAtTurnStart,
      canEndTurn: game.hands.south.length < handSizeAtTurnStart
    });
    
    if (gamePhase !== 'playing') {
      console.log('[handleEndTurn] Not in playing phase, returning');
      return;
    }
    
    if (game.winner !== null || game.chooseSuit) {
      console.log('[handleEndTurn] Game has winner or choosing suit, returning');
      return;
    }
    
    // Only allow end turn if it's the local player's turn
    if (game.turn !== 'south') {
      console.log('[handleEndTurn] Not local player\'s turn, returning');
      return;
    }
    
    // Check if player has played at least one card (hand size decreased)
    if (game.hands.south.length >= handSizeAtTurnStart) {
      console.log('[handleEndTurn] Hand size not decreased, cannot end turn');
      console.log('[handleEndTurn] Hand size details:', {
        currentHandSize: game.hands.south.length,
        handSizeAtTurnStart,
        difference: handSizeAtTurnStart - game.hands.south.length
      });
      Alert.alert('Cannot End Turn', 'You must play at least one card before ending your turn.');
      return;
    }
    
    console.log('[handleEndTurn] Switching turn from south to north');
    
    // Switch turn to opponent
    const newGameState: GameState = {
      ...game,
      turn: 'north' as Player,
    };
    
    setGame(newGameState);
    
    // Clear selections and reset turn-specific states
    setSelectedHandCards([]);
    setSelectedDiscardCards([]);
    
    // Update Firebase with the new game state while preserving all existing values
    try {
      if (currentGameId && isPlayer1 !== null) {
        const playerKey = isPlayer1 ? 'player1' : 'player2';
        const otherPlayerKey = isPlayer1 ? 'player2' : 'player1';
        const gameDocRef = doc(db, 'games', currentGameId);
        
        // Get current Firebase data to preserve all values
        const docSnap = await getDoc(gameDocRef);
        if (docSnap.exists()) {
          const currentData = docSnap.data();
          
          // Preserve all existing Firebase values while updating only the turn
          const updateData = {
            // Preserve existing temp decks
            [`players.${playerKey}.tempDeck`]: currentData?.players?.[playerKey]?.tempDeck || [],
            [`players.${playerKey}.tempDeckSum`]: currentData?.players?.[playerKey]?.tempDeckSum || 0,
            [`players.${otherPlayerKey}.tempDeck`]: currentData?.players?.[otherPlayerKey]?.tempDeck || [],
            [`players.${otherPlayerKey}.tempDeckSum`]: currentData?.players?.[otherPlayerKey]?.tempDeckSum || 0,
            
            // Preserve existing decks
            [`players.${playerKey}.deck`]: currentData?.players?.[playerKey]?.deck || [],
            [`players.${otherPlayerKey}.deck`]: currentData?.players?.[otherPlayerKey]?.deck || [],
            
            // Update only the turn and action
            turn: otherPlayerKey, // Switch to opponent's turn
            lastAction: {
              player: playerKey,
              action: 'end_turn',
              timestamp: serverTimestamp(),
            },
            lastUpdated: serverTimestamp(),
          };
          
          await updateDoc(gameDocRef, updateData);
          console.log('[handleEndTurn] Firebase updated successfully with preserved values');
        }
      }
    } catch (error) {
      console.error('[handleEndTurn] Error updating Firebase:', error);
    }
  }

  // Removed selectedDiscardIndex - now using selectedDiscardCards array

  // Add function to add multiple cards to tempDeck
  async function addSelectedCardsToTempDeck() {
    console.log('[addSelectedCardsToTempDeck] START');
    console.log('[addSelectedCardsToTempDeck] Current state:', {
      selectedHandCards,
      selectedDiscardCards,
      gameTurn: game.turn,
      handSize: game.hands.south.length,
      handSizeAtTurnStart,
      canEndTurn: game.hands.south.length < handSizeAtTurnStart
    });
    
    if (selectedHandCards.length === 0 && selectedDiscardCards.length === 0) {
      console.log('[addSelectedCardsToTempDeck] No cards selected');
      return;
    }
    // Prevent action if not player's turn
    if (game.turn !== 'south') {
      console.log('[addSelectedCardsToTempDeck] Not player\'s turn');
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
    // Remove all validation and ambiguous value logic
    // Just move the selected cards to the temp deck
    // Set the temp deck sum to the sum of the cards (or just increment as needed)
    const sum = allSelectedCards.reduce((total, card) => total + cardNumericValue(card), 0);
    await addCardsToTempDeck(allSelectedCards, sum);
  }

  // Helper function to actually add cards to temp deck
  async function addCardsToTempDeck(cardsToAdd: Card[], newTempDeckSum: number) {
    console.log('[addCardsToTempDeck] Adding cards to temp deck:', cardsToAdd, 'sum:', newTempDeckSum);
    
    // Separate hand cards from discard cards
    const discardCardKeys = new Set(game.discard.map(card => `${card.suit}-${card.value}`));
    const handCards = cardsToAdd.filter(card => !discardCardKeys.has(`${card.suit}-${card.value}`));
    const discardCards = cardsToAdd.filter(card => discardCardKeys.has(`${card.suit}-${card.value}`));
    
    console.log('[addCardsToTempDeck] Hand cards:', handCards, 'Discard cards:', discardCards);
    

    
    // Animate discard cards to temp deck
    if (discardCards.length > 0) {
      animateDiscardToTempDeck(discardCards);
    }
    
    if (currentGameId && isPlayer1 !== null) {
      const playerKey = isPlayer1 ? 'player1' : 'player2';
      const otherPlayerKey = isPlayer1 ? 'player2' : 'player1';
      const gameDocRef = doc(db, 'games', currentGameId);
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
      // Remove cards from hand
      const newHand = [...game.hands.south];
      const cardsToRemove = new Map<string, number>();
      cardsToAdd.forEach(card => {
        const key = `${card.suit}-${card.value}`;
        cardsToRemove.set(key, (cardsToRemove.get(key) || 0) + 1);
      });
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
          await updateDoc(gameDocRef, {
      [`players.${playerKey}.tempDeck`]: newTempDeck,
      [`players.${playerKey}.tempDeckSum`]: newTempDeckSum,
      [`players.${otherPlayerKey}.tempDeck`]: otherTempDeck,
      [`players.player1.hand`]: isPlayer1 ? remainingHandCards : game.hands.north,
      [`players.player2.hand`]: isPlayer1 ? game.hands.north : remainingHandCards,
      discardPile: remainingDiscardCards,
      currentCard: remainingDiscardCards.length > 0 ? remainingDiscardCards[remainingDiscardCards.length - 1] : null,
      lastAction: {
        player: playerKey,
        action: 'add_to_temp_deck',
        timestamp: serverTimestamp(),
      },
    });
    
        // Don't update hand size at turn start - keep it at the original value
    console.log('[addCardsToTempDeck] Keeping hand size at turn start unchanged:', {
      handSizeAtTurnStart,
      newHandSize: remainingHandCards.length,
      cardsAdded: cardsToAdd.length,
      canEndTurn: remainingHandCards.length < handSizeAtTurnStart
    });
    
    // Update local game state to reflect the hand changes immediately
    console.log('[addCardsToTempDeck] Updating local game state');
    setGame(prevGame => {
      const newGame = {
        ...prevGame,
        hands: {
          ...prevGame.hands,
          south: remainingHandCards
        },
        discard: remainingDiscardCards
      };
      console.log('[addCardsToTempDeck] New game state:', {
        handSize: newGame.hands.south.length,
        handSizeAtTurnStart: handSizeAtTurnStart,
        canEndTurn: newGame.hands.south.length < handSizeAtTurnStart
      });
      return newGame;
    });
  }
  setSelectedHandCards([]);
  setSelectedDiscardCards([]);
  }

  // Update handleCardSelect for single card selection
  function handleCardSelect(idx: number) {
    if (gamePhase !== 'playing' || game.winner !== null || game.chooseSuit || game.turn !== 'south') {
      return;
    }
    // Only allow one card to be selected at a time
    if (selectedHandCards.includes(idx)) {
      setSelectedHandCards([]);
      setSelectedDiscardCards([]);
    } else {
      setSelectedHandCards([idx]);
      setSelectedDiscardCards([]);
    }
  }

  // Update handleDiscardCardClick for single card selection
  function handleDiscardCardClick(discardIdx?: number) {
    if (typeof discardIdx !== 'number' || game.turn !== 'south') return;
    // Only allow one card to be selected at a time
    if (selectedDiscardCards.includes(discardIdx)) {
      setSelectedDiscardCards([]);
      setSelectedHandCards([]);
    } else {
      setSelectedDiscardCards([discardIdx]);
      setSelectedHandCards([]);
    }
  }

  // Add state for local player's tempDeck
  const [localTempDeck, setLocalTempDeck] = useState<Card[]>([]);
  const [localTempDeckSum, setLocalTempDeckSum] = useState<number>(0);

  // Add state for opponent's tempDeck
  const [opponentTempDeck, setOpponentTempDeck] = useState<Card[]>([]);
  const [opponentTempDeckSum, setOpponentTempDeckSum] = useState<number>(0);

  // Add state for player's deck
  const [playerDeck, setPlayerDeck] = useState<Card[]>([]);
  const [opponentDeck, setOpponentDeck] = useState<Card[]>([]);

  // Add state to track the last card played by opponent for animation
  const [lastOpponentPlayedCard, setLastOpponentPlayedCard] = useState<Card | null>(null);

  // Sync localTempDeck with Firebase
  useEffect(() => {
    if (!firebaseGameData || isPlayer1 === null) return;
    const playerKey = isPlayer1 ? 'player1' : 'player2';
    const opponentKey = isPlayer1 ? 'player2' : 'player1';
    
    // Sync player and opponent decks FIRST (before animation detection)
    const playerDeckData = firebaseGameData?.players?.[playerKey]?.deck || [];
    const opponentDeckData = firebaseGameData?.players?.[opponentKey]?.deck || [];
    setPlayerDeck(playerDeckData);
    setOpponentDeck(opponentDeckData);
    
    // Sync local player's temp deck
    const tempDeck = firebaseGameData?.players?.[playerKey]?.tempDeck || [];
    const tempDeckSum = firebaseGameData?.players?.[playerKey]?.tempDeckSum || 0;
    setLocalTempDeck(tempDeck);
    setLocalTempDeckSum(tempDeckSum);
    // Sync opponent's temp deck and detect changes
    const opponentTempDeck = firebaseGameData?.players?.[opponentKey]?.tempDeck || [];
    const opponentTempDeckSum = firebaseGameData?.players?.[opponentKey]?.tempDeckSum || 0;
    
    // Add logic to detect if the last action was by the opponent
    const myPlayerKey = isPlayer1 ? 'player1' : 'player2';
    const lastActionByOpponent = firebaseGameData?.lastAction && firebaseGameData.lastAction.player && firebaseGameData.lastAction.player !== myPlayerKey;
    
    // Alternative detection: if opponent's temp deck increased and it's not our turn, assume it was opponent action
    const isOpponentTurn = game.turn === 'north';
    // More reliable detection: if opponent's temp deck increased and we're not in the middle of our own action, assume it was opponent action
    const opponentActionDetected = lastActionByOpponent || (opponentTempDeck.length > prevOpponentTempDeckLength.current && !isSyncingToFirebase.current);
    
    console.log('[ANIMATION] Debug opponent temp deck animation conditions:', {
      myPlayerKey,
      lastActionPlayer: firebaseGameData?.lastAction?.player,
      lastActionByOpponent,
      isOpponentTurn,
      isSyncingToFirebase: isSyncingToFirebase.current,
      opponentActionDetected,
      opponentTempDeckLength: opponentTempDeck.length,
      prevOpponentTempDeckLength: prevOpponentTempDeckLength.current,
      firebaseGameDataLastAction: firebaseGameData?.lastAction
    });
    
    // Check if opponent's temp deck increased (they added cards)
    if (opponentTempDeck.length > prevOpponentTempDeckLength.current) {
      console.log('Opponent added cards to temp deck');
      const newCards = opponentTempDeck.slice(prevOpponentTempDeckLength.current);
      console.log('[ANIMATION] New cards added to opponent temp deck:', newCards);
      
      if (newCards.length > 0) {
        // Get current discard pile
        const currentDiscardPile = firebaseGameData?.discardPile || [];
        
        // Determine if the new cards are from hand or discard pile by comparing with previous discard pile
        const prevDiscardCardKeys = new Set(prevDiscardPile.current.map((card: Card) => `${card.suit}-${card.value}`));
        const currentDiscardCardKeys = new Set(currentDiscardPile.map((card: Card) => `${card.suit}-${card.value}`));
        
        // Cards that were in previous discard pile but not in current discard pile (moved to temp deck)
        const movedFromDiscard = newCards.filter((card: Card) => 
          prevDiscardCardKeys.has(`${card.suit}-${card.value}`) && 
          !currentDiscardCardKeys.has(`${card.suit}-${card.value}`)
        );
        
        // Cards that were not in previous discard pile (from hand)
        const movedFromHand = newCards.filter((card: Card) => 
          !prevDiscardCardKeys.has(`${card.suit}-${card.value}`)
        );
        
        console.log('[ANIMATION] Card analysis:', {
          totalNewCards: newCards.length,
          movedFromHand: movedFromHand.length,
          movedFromDiscard: movedFromDiscard.length,
          prevDiscardLength: prevDiscardPile.current.length,
          currentDiscardLength: currentDiscardPile.length,
          lastActionByOpponent
        });
        
        if (movedFromHand.length > 0 && opponentActionDetected && firebaseGameData?.lastAction?.action === 'add_to_temp_deck') {
          console.log('[ANIMATION] Triggering opponent hand to temp deck animation with:', movedFromHand);
          // Trigger the animation for cards moving from opponent hand to temp deck
          setAnimatingOpponentHandCardsToTempDeck(movedFromHand);
          setShowOpponentHandToTempDeckAnimation(true);
          
          InteractionManager.runAfterInteractions(() => {
            // Start position: approximate opponent hand area (top center)
            const startX = width / 2;
            const startY = 100;
            
            // End position: opponent temp deck area (top right)
            const endX = width * 0.9;
            const endY = 200;
            
            console.log('[ANIMATION] Opponent hand to temp deck animation coordinates:', { startX, startY, endX, endY });
            
            // Set initial position
            opponentHandToTempDeckX.value = startX;
            opponentHandToTempDeckY.value = startY;
            opponentHandToTempDeckScale.value = 1;
            
            // Animate to temp deck position
            opponentHandToTempDeckX.value = withTiming(endX, { duration: 2000 });
            opponentHandToTempDeckY.value = withTiming(endY, { duration: 2000 });
            opponentHandToTempDeckScale.value = withTiming(0.8, { duration: 1000 }, () => {
              opponentHandToTempDeckScale.value = withTiming(0.6, { duration: 1000 }, (finished) => {
                if (finished) {
                  runOnJS(setShowOpponentHandToTempDeckAnimation)(false);
                  runOnJS(setAnimatingOpponentHandCardsToTempDeck)([]);
                }
              });
            });
          });
        } else if (movedFromDiscard.length > 0 && opponentActionDetected && firebaseGameData?.lastAction?.action === 'add_to_temp_deck') {
          console.log('[ANIMATION] Triggering opponent discard to temp deck animation with:', movedFromDiscard);
          // Trigger the animation for cards moving from discard pile to opponent temp deck
          setAnimatingCardsToTempDeck(movedFromDiscard);
          setShowDiscardToTempDeckAnimation(true);
          
          InteractionManager.runAfterInteractions(() => {
            // Start position: discard pile area (center of screen)
            const startX = width / 2;
            const startY = height / 2;
            
            // End position: north temp deck area (top right)
            const endX = width * 0.9;
            const endY = 200;
            
            console.log('[ANIMATION] Opponent discard to temp deck animation coordinates:', { startX, startY, endX, endY });
            
            // Set initial position
            discardToTempDeckX.value = startX;
            discardToTempDeckY.value = startY;
            discardToTempDeckScale.value = 1;
            
            // Animate to north temp deck position with scale effect
            discardToTempDeckX.value = withTiming(endX, { duration: 1200 });
            discardToTempDeckY.value = withTiming(endY, { duration: 1200 });
            discardToTempDeckScale.value = withTiming(0.8, { duration: 600 }, () => {
              discardToTempDeckScale.value = withTiming(0.6, { duration: 600 }, (finished) => {
                if (finished) {
                  runOnJS(setShowDiscardToTempDeckAnimation)(false);
                  runOnJS(setAnimatingCardsToTempDeck)([]);
                }
              });
            });
          });
        } else {
          console.log('[ANIMATION] Not triggering opponent temp deck animation because:', {
            movedFromHandLength: movedFromHand.length,
            movedFromDiscardLength: movedFromDiscard.length,
            opponentActionDetected,
            reason: movedFromHand.length === 0 && movedFromDiscard.length === 0 ? 'No cards to animate' : 'Not opponent action'
          });
        }

      }
    }
    
    // Check if opponent moved cards from temp deck to deck
    // Use Firebase data directly instead of local state to avoid timing issues
    const firebaseOpponentDeck = firebaseGameData?.players?.[opponentKey]?.deck || [];
    const currentOpponentDeckLength = firebaseOpponentDeck.length;
    const previousOpponentDeckLength = prevOpponentDeckLength.current;
    
    // Debug: Log the actual deck data being used for animation detection
    console.log('[ANIMATION][TEMP→DECK] Deck data for animation detection:', {
      opponentDeck: opponentDeck.map((c: Card) => `${c.value}${c.suit}`),
      firebaseOpponentDeck: firebaseOpponentDeck.map((c: Card) => `${c.value}${c.suit}`),
      currentOpponentDeckLength,
      previousOpponentDeckLength,
    });
    
    console.log('[ANIMATION][TEMP→DECK] Debug values:', {
      currentOpponentDeckLength,
      previousOpponentDeckLength,
      deckIncreased: currentOpponentDeckLength > previousOpponentDeckLength,
      opponentActionDetected,
      lastAction: firebaseGameData?.lastAction?.action,
      lastActionPlayer: firebaseGameData?.lastAction?.player,
      shouldTrigger: currentOpponentDeckLength > previousOpponentDeckLength && opponentActionDetected
    });
    
    // Only trigger animation if opponent's deck increased AND the last action was specifically 'eat_temp_deck' by opponent
    if (currentOpponentDeckLength > previousOpponentDeckLength && 
        opponentActionDetected && 
        firebaseGameData?.lastAction?.action === 'eat_temp_deck') {
      console.log('[ANIMATION] Opponent moved cards from temp deck to deck');
      const newDeckCards = firebaseOpponentDeck.slice(previousOpponentDeckLength);
      console.log('[ANIMATION] New cards added to opponent deck:', newDeckCards);
      
      if (newDeckCards.length > 0) {
        console.log('[ANIMATION] Triggering north temp deck to deck animation with:', newDeckCards);
        setAnimatingNorthTempDeckCardsToDeck(newDeckCards);
        setShowNorthTempDeckToDeckAnimation(true);
        
        InteractionManager.runAfterInteractions(() => {
          // Start position: opponent temp deck area (top right)
          const startX = width * 0.8;
          const startY = 250;
          
          // End position: opponent deck area (top left)
          const endX = width * 0.1;
          const endY = 100;
          
          console.log('[ANIMATION] North temp deck to deck animation coordinates:', { startX, startY, endX, endY });
          
          // Set initial position
          northTempDeckToDeckX.value = startX;
          northTempDeckToDeckY.value = startY;
          northTempDeckToDeckScale.value = 1;
          
          // Animate to deck position with scale effect
          northTempDeckToDeckX.value = withTiming(endX, { duration: 1800 });
          northTempDeckToDeckY.value = withTiming(endY, { duration: 1800 });
          northTempDeckToDeckScale.value = withTiming(0.9, { duration: 900 }, () => {
            northTempDeckToDeckScale.value = withTiming(0.7, { duration: 900 }, (finished) => {
              if (finished) {
                runOnJS(setShowNorthTempDeckToDeckAnimation)(false);
                runOnJS(setAnimatingNorthTempDeckCardsToDeck)([]);
              }
            });
          });
        });
      }
    }
    
    // Check if opponent played a card (hand decreased and discard increased)
    const currentOpponentHandLength = game.hands.north.length;
    const currentDiscardLength = game.discard.length;
    const previousOpponentHandLength = prevOpponentHandLength.current;
    const previousDiscardLength = prevDiscardLength.current;

    // Only run hand to discard animation logic if the action is actually 'play'
    if (firebaseGameData?.lastAction?.action === 'play') {
      // Add detailed logging for debugging
      console.log('[ANIMATION][HAND→DISCARD] Values:', {
        currentOpponentHandLength,
        previousOpponentHandLength,
        currentDiscardLength,
        previousDiscardLength,
        handDecreased: currentOpponentHandLength < previousOpponentHandLength,
        discardIncreased: currentDiscardLength > previousDiscardLength,
        isSyncingToFirebase: isSyncingToFirebase.current,
        gameTurn: game.turn,
        lastAction: firebaseGameData?.lastAction?.action,
        lastActionPlayer: firebaseGameData?.lastAction?.player,
        lastActionByOpponent,
        shouldTrigger: game.turn === 'north' && 
                      firebaseGameData?.lastAction?.action === 'play' && 
                      lastActionByOpponent && 
                      !isSyncingToFirebase.current
      });

    // Fix: Trigger animation if it's opponent's turn, last action was a play by opponent
    if (
      game.turn === 'north' && // It's opponent's turn (meaning they just played)
      firebaseGameData?.lastAction?.action === 'play' &&
      lastActionByOpponent && // The last action was by the opponent
      !isSyncingToFirebase.current // Don't trigger during our own sync
    ) {
      console.log('[ANIMATION] Opponent played a card from hand to discard pile (final logic)');
      
      // Get the card that was just played from Firebase currentCard
      const playedCard = firebaseGameData?.currentCard;
      
      if (playedCard) {
        console.log('[ANIMATION] Triggering opponent hand to discard animation with:', playedCard);
        setAnimatingOpponentHandCardsToDiscard([playedCard]);
        setShowOpponentHandToDiscardAnimation(true);
        InteractionManager.runAfterInteractions(() => {
          // Start position: approximate opponent hand area (top center)
          const startX = width / 2;
          const startY = 100;
          // End position: discard pile area (center of screen)
          const endX = width / 2;
          const endY = height / 2;
          console.log('[ANIMATION] Opponent hand to discard animation coordinates:', { startX, startY, endX, endY });
          opponentHandToDiscardX.value = startX;
          opponentHandToDiscardY.value = startY;
          opponentHandToDiscardScale.value = 1;
          opponentHandToDiscardX.value = withTiming(endX, { duration: 1500 });
          opponentHandToDiscardY.value = withTiming(endY, { duration: 1500 });
          opponentHandToDiscardScale.value = withTiming(1.1, { duration: 750 }, () => {
            opponentHandToDiscardScale.value = withTiming(1, { duration: 750 }, (finished) => {
              if (finished) {
                runOnJS(setShowOpponentHandToDiscardAnimation)(false);
                runOnJS(setAnimatingOpponentHandCardsToDiscard)([]);
              }
            });
          });
        });
      }
    }
    }
    
    // Update the previous length for next comparison (after animation)
    prevOpponentTempDeckLength.current = opponentTempDeck.length;
    prevOpponentHandLength.current = game.hands.north.length;
    prevDiscardLength.current = currentDiscardLength;
    prevDiscardPile.current = firebaseGameData?.discardPile || [];
    prevOpponentDeckLength.current = opponentDeck.length;

    setOpponentTempDeck(opponentTempDeck);
    setOpponentTempDeckSum(opponentTempDeckSum);

    // Debug deck data (moved from duplicate sync)
    console.log('[DECK SYNC] Debug deck data:', {
      playerKey,
      opponentKey,
      playerDeckLength: playerDeckData.length,
      opponentDeckLength: opponentDeckData.length,
      playerDeck: playerDeckData.map((c: Card) => `${c.value}${c.suit}`),
      opponentDeck: opponentDeckData.map((c: Card) => `${c.value}${c.suit}`),
      firebaseGameDataPlayers: {
        player1: {
          deckLength: firebaseGameData?.players?.player1?.deck?.length || 0,
          deck: firebaseGameData?.players?.player1?.deck?.map((c: Card) => `${c.value}${c.suit}`) || []
        },
        player2: {
          deckLength: firebaseGameData?.players?.player2?.deck?.length || 0,
          deck: firebaseGameData?.players?.player2?.deck?.map((c: Card) => `${c.value}${c.suit}`) || []
        }
      }
    });
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
    // Prevent play if not player's turn
    if (game.turn !== 'south') {
      return;
    }
    // Prevent play if player has a temp deck and round is 1
    const playerKey = isPlayer1 ? 'player1' : 'player2';
    const tempDeck = firebaseGameData?.players?.[playerKey]?.tempDeck || [];
    if (round === 1 && tempDeck.length > 0) {
      Alert.alert('Invalid Move', 'Can\'t throw card on the floor.');
      return;
    }
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

  // Add this handler above the component return
  async function handleEatTempDeck() {
    console.log('[handleEatTempDeck] START - currentGameId:', currentGameId, 'isPlayer1:', isPlayer1);
    if (!currentGameId || isPlayer1 === null) return;
    // Prevent action if not player's turn
    if (game.turn !== 'south') {
      return;
    }
    const playerKey = isPlayer1 ? 'player1' : 'player2';
    const gameDocRef = doc(db, 'games', currentGameId);
    // Get tempDeck and deck from Firebase
    let tempDeck: Card[] = [];
    let deck: Card[] = [];
    try {
      const docSnap = await getDoc(gameDocRef);
      if (docSnap.exists()) {
        tempDeck = docSnap.data()?.players?.[playerKey]?.tempDeck || [];
        deck = docSnap.data()?.players?.[playerKey]?.deck || [];
        console.log('[handleEatTempDeck] Firebase data:', {
          tempDeckLength: tempDeck.length,
          deckLength: deck.length,
          tempDeck: tempDeck.map(c => `${c.value}${c.suit}`),
          deck: deck.map(c => `${c.value}${c.suit}`)
        });
      }
    } catch (err) {
      console.log('[handleEatTempDeck] Error fetching Firebase doc:', err);
    }
    if (tempDeck.length === 0) {
      console.log('[handleEatTempDeck] No temp deck cards to move, returning');
      return;
    }
    // Move all tempDeck cards to deck
    const newDeck = [...deck, ...tempDeck];
    console.log('[handleEatTempDeck] Moving cards:', {
      fromTempDeck: tempDeck.map(c => `${c.value}${c.suit}`),
      toDeck: newDeck.map(c => `${c.value}${c.suit}`),
      newDeckLength: newDeck.length
    });
    
    try {
      await updateDoc(gameDocRef, {
        [`players.${playerKey}.deck`]: newDeck,
        [`players.${playerKey}.tempDeck`]: [],
        [`players.${playerKey}.tempDeckSum`]: 0,
        lastAction: {
          player: playerKey,
          action: 'eat_temp_deck',
          timestamp: serverTimestamp(),
        },
      });
      console.log('[handleEatTempDeck] Firebase update completed successfully');
    } catch (err) {
      console.log('[handleEatTempDeck] Error updating Firebase:', err);
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
      


      {/* Animated cards moving from discard pile to temp deck */}
      {showDiscardToTempDeckAnimation && animatingCardsToTempDeck.length > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              zIndex: 1000,
              pointerEvents: 'none',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            },
            discardToTempDeckAnimStyle
          ]}
        >
          {/* Show the first card as representative of the group */}
          <CasinoCard 
            suit={animatingCardsToTempDeck[0].suit} 
            value={animatingCardsToTempDeck[0].value} 
            style={{ width: 72, height: 104 }}
          />
          {/* Show a small indicator if multiple cards */}
          {animatingCardsToTempDeck.length > 1 && (
            <View style={{
              position: 'absolute',
              top: -8,
              right: -8,
              backgroundColor: '#FFD700',
              borderRadius: 12,
              width: 24,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: '#fff',
            }}>
              <ThemedText style={{
                color: '#333',
                fontSize: 12,
                fontWeight: 'bold',
              }}>
                {animatingCardsToTempDeck.length}
              </ThemedText>
            </View>
          )}
        </Animated.View>
      )}

      {/* Dev animated card moving from opponent hand to temp deck */}
      {showOpponentHandToTempDeckAnimation && animatingOpponentHandCardsToTempDeck.length > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              zIndex: 1000,
              pointerEvents: 'none',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            },
            opponentHandToTempDeckAnimStyle
          ]}
        >
          <CasinoCard 
            suit={animatingOpponentHandCardsToTempDeck[0].suit} 
            value={animatingOpponentHandCardsToTempDeck[0].value} 
            style={{ width: 72, height: 104 }}
          />
        </Animated.View>
      )}

      {/* Dev animated card moving from opponent hand to discard pile */}
      {showOpponentHandToDiscardAnimation && animatingOpponentHandCardsToDiscard.length > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              zIndex: 1000,
              pointerEvents: 'none',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            },
            opponentHandToDiscardAnimStyle
          ]}
        >
          <CasinoCard 
            suit={animatingOpponentHandCardsToDiscard[0].suit} 
            value={animatingOpponentHandCardsToDiscard[0].value} 
            style={{ width: 72, height: 104 }}
          />
        </Animated.View>
      )}

      {/* Dev animated card moving from north temp deck to north deck */}
      {showNorthTempDeckToDeckAnimation && animatingNorthTempDeckCardsToDeck.length > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              zIndex: 1000,
              pointerEvents: 'none',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            },
            northTempDeckToDeckAnimStyle
          ]}
        >
          <CasinoCard 
            suit={animatingNorthTempDeckCardsToDeck[0].suit} 
            value={animatingNorthTempDeckCardsToDeck[0].value} 
            style={{ width: 72, height: 104 }}
          />
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
              {/* --- ROUND 2 BUTTON --- */}
              {round === 1 && isPlayer1 && firebaseGameData?.status === 'in-progress' &&
                firebaseGameData?.players?.player1?.hand?.length === 0 &&
                firebaseGameData?.players?.player2?.hand?.length === 0 && (
                  <TouchableOpacity style={styles.dealBtn} onPress={handleDealRound2}>
                    <ThemedText style={styles.dealBtnText}>Deal Round 2</ThemedText>
                  </TouchableOpacity>
              )}
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
                    <DeckPlaceholder 
                      style={styles.northDeckPlaceholder} 
                      text="Deck" 
                      cards={opponentDeck}
                    />
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

              {/* Opponent's Temp Deck Display */}
              {opponentTempDeck.length > 0 && (
                <View style={{
                  position: 'absolute',
                  top: 200,
                  right: '10%',
                  transform: [{ translateX: ((opponentTempDeck.length * 16) / 2) }],
                  flexDirection: 'column',
                  zIndex: 20,
                  pointerEvents: 'none',
                  alignItems: 'center',
                }}>
                  
                  {/* Opponent Temp Deck Cards */}
                  <View style={{ flexDirection: 'row', position: 'relative' }}>
                    {opponentTempDeck.map((card, idx) => {
                      // Deterministic random rotation and translation
                      const rot = (seededRandom(idx + 1000) - 0.5) * 30; // -15 to +15 deg
                      const tx = (seededRandom(idx + 1100) - 0.5) * 16; // -8 to +8 px
                      const ty = (seededRandom(idx + 1200) - 0.5) * 8; // -4 to +4 px
                      return (
                        <View
                          key={`opponent-tempdeck-${card.suit}-${card.value}-${idx}`}
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
                  
                  {/* Opponent Temp Deck Sum Display */}
                  <View style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    marginTop: 8,
                    borderWidth: 2,
                    borderColor: '#FF6B6B',
                  }}>
                    <ThemedText style={{
                      color: '#FF6B6B',
                      fontWeight: 'bold',
                      fontSize: 14,
                      textAlign: 'center',
                    }}>
                      {opponentTempDeckSum}
                    </ThemedText>
                  </View>
                  
                  {/* Opponent Temp Deck Label */}
                  <View style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 12,
                    marginTop: 4,
                  }}>
                    <ThemedText style={{
                      color: '#FF6B6B',
                      fontWeight: 'bold',
                      fontSize: 12,
                      textAlign: 'center',
                    }}>
                      {playerNames.north}'s Build
                    </ThemedText>
                  </View>
                </View>
              )}
              
              {/* Turn indicator */}
              <View style={{
                position: 'absolute',
                top: -60,
                left: 0,
                right: 0,
                alignItems: 'center',
                zIndex: 10,
              }}>
                <View style={{
                  backgroundColor: game.turn === 'south' ? 'rgba(255, 215, 0, 0.9)' : 'rgba(255, 107, 107, 0.9)',
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  borderWidth: 2,
                  borderColor: game.turn === 'south' ? '#FFD700' : '#FF6B6B',
                }}>
                  <ThemedText style={{
                    color: game.turn === 'south' ? '#333' : '#fff',
                    fontWeight: 'bold',
                    fontSize: 16,
                  }}>
                    {game.turn === 'south' ? `${playerNames.south}'s Turn` : `${playerNames.north}'s Turn`}
                  </ThemedText>
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
                    activeOpacity={game.turn === 'south' ? 0.8 : 1}
                    disabled={game.turn !== 'south'}
                    style={{
                      alignItems: 'center',
                      position: 'relative',
                      height: 200,
                      width: '100%',
                      flexDirection: 'row',
                      borderWidth: 2,
                      borderColor: game.turn === 'south' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                      borderRadius: 12,
                      padding: 8,
                      backgroundColor: game.turn === 'south' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    {game.turn !== 'south' && (
                      <View style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: 12,
                        zIndex: 1,
                      }} />
                    )}
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
                                const isSelected = selectedDiscardCards.includes(idx);
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
                                      borderWidth: 0, // Remove border
                                      borderColor: 'transparent', // Remove border
                                      borderRadius: 8,
                                      transform: [
                                        { rotate: `${rotation}deg` },
                                        { scale: isSelected ? 0.85 : scale }, // Apply scale if selected
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
                                const discardIdx = halfLength + idx;
                                const isSelected = selectedDiscardCards.includes(discardIdx);
                                return (
                                  <TouchableOpacity
                                    key={`discard-row2-${idx}`}
                                    onPress={e => {
                                      e.stopPropagation && e.stopPropagation();
                                      handleDiscardCardClick(discardIdx);
                                    }}
                                    style={{ 
                                      marginLeft: idx === 0 ? 0 : -8, 
                                      zIndex: idx, 
                                      borderWidth: 0, // Remove border
                                      borderColor: 'transparent', // Remove border
                                      borderRadius: 8,
                                      transform: [
                                        { rotate: `${rotation}deg` },
                                        { scale: isSelected ? 0.85 : scale }, // Apply scale if selected
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
              
              {/* South hand (player) - moved to bottom */}
              <View style={styles.southHandContainer}>
                <View style={{ marginRight: 8, alignSelf: 'flex-end' }}>
                  <DeckPlaceholder 
                    style={styles.southDeckPlaceholder} 
                    text="Deck" 
                    cards={playerDeck}
                  />
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
                            disabled={game.winner !== null || game.chooseSuit || game.turn !== 'south' || !canPlay(card, game.discard[game.discard.length - 1], game.currentSuit)}
                          >
                            <Animated.View style={{ 
                              transform: [{ scale: selectedHandCards.includes(idx) ? 0.85 : 1 }]
                            }}>
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
                (selectedHandCards.length > 0 || selectedDiscardCards.length > 0) ? (
                  <TouchableOpacity
                    style={{
                      position: 'absolute',
                      bottom: 350,
                      left: '10%',
                      transform: [{ translateX: -((localTempDeck.length * 16) / 2) }],
                      flexDirection: 'column',
                      zIndex: 20,
                      pointerEvents: game.turn === 'south' ? 'auto' : 'none',
                      alignItems: 'center',
                    }}
                    onPress={addSelectedCardsToTempDeck}
                    activeOpacity={game.turn === 'south' ? 0.8 : 1}
                    disabled={game.turn !== 'south'}
                  >
                    {/* Temp Deck Cards */}
                    <View style={{ flexDirection: 'row', position: 'relative' }}>
                      {localTempDeck.map((card, idx) => {
                        const rot = (seededRandom(idx + 1) - 0.5) * 30;
                        const tx = (seededRandom(idx + 100) - 0.5) * 16;
                        const ty = (seededRandom(idx + 200) - 0.5) * 8;
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
                  </TouchableOpacity>
                ) : (
                  localTempDeck.length > 0 && (
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
                          const rot = (seededRandom(idx + 1) - 0.5) * 30;
                          const tx = (seededRandom(idx + 100) - 0.5) * 16;
                          const ty = (seededRandom(idx + 200) - 0.5) * 8;
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
                  )
                )
              )}

              {/* Temp Deck Sum Display */}
              <View style={styles.tempDeckSumContainer}>
                <ThemedText style={styles.tempDeckSumText}>
                   {localTempDeckSum}
                </ThemedText>
              </View>
              
              {/* Local Temp Deck Label */}
              {localTempDeck.length > 0 && (
                <View style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 12,
                  marginTop: 4,
                  position: 'absolute',
                  bottom: 320,
                  left: '10%',
                  transform: [{ translateX: -((localTempDeck.length * 16) / 2) }],
                }}>
                  <ThemedText style={{
                    color: '#FFD700',
                    fontWeight: 'bold',
                    fontSize: 12,
                    textAlign: 'center',
                  }}>
                    Your Build
                  </ThemedText>
                </View>
              )}
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


        {/* Action Buttons Row - show only if it's the local player's turn and playing phase */}
        {gamePhase === 'playing' && game.turn === 'south' && game.winner === null && !game.chooseSuit && (
          <View style={{
            position: 'absolute',
            bottom: 170,
            left: 32,
            flexDirection: 'row',
            zIndex: 100,
            alignItems: 'center',
          }}>
            {/* Add to Temp Deck Button */}
            {(selectedHandCards.length > 0 || selectedDiscardCards.length > 0) && localTempDeck.length === 0 && (
              <TouchableOpacity
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: game.turn === 'south' ? '#FFD700' : '#666',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 16,
                  elevation: game.turn === 'south' ? 6 : 2,
                  shadowColor: '#000',
                  shadowOpacity: game.turn === 'south' ? 0.18 : 0.1,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                }}
                onPress={addSelectedCardsToTempDeck}
                activeOpacity={game.turn === 'south' ? 0.85 : 1}
                disabled={game.turn !== 'south'}
              >
                <MaterialIcons name="gavel" size={36} color="#333" />
              </TouchableOpacity>
            )}
            
            {/* Eat Temp Deck Button */}
            {localTempDeck.length > 0 && (
              <TouchableOpacity
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: game.turn === 'south' ? '#FFB300' : '#666',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 16,
                  elevation: game.turn === 'south' ? 8 : 2,
                  shadowColor: '#000',
                  shadowOpacity: game.turn === 'south' ? 0.2 : 0.1,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                }}
                onPress={handleEatTempDeck}
                activeOpacity={game.turn === 'south' ? 0.8 : 1}
                disabled={game.turn !== 'south'}
              >
                <ThemedText style={{ fontSize: 32, color: '#fff' }}>😋</ThemedText>
              </TouchableOpacity>
            )}
            
            {/* End Turn Button */}
            <TouchableOpacity
              style={[styles.endTurnButton, {
                backgroundColor: game.hands.south.length < handSizeAtTurnStart ? '#19C37D' : '#666',
                elevation: game.hands.south.length < handSizeAtTurnStart ? 8 : 2,
                shadowOpacity: game.hands.south.length < handSizeAtTurnStart ? 0.2 : 0.1,
              }]}
              onPress={handleEndTurn}
              activeOpacity={game.hands.south.length < handSizeAtTurnStart ? 0.8 : 1}
              disabled={game.turn !== 'south' || game.hands.south.length >= handSizeAtTurnStart}
            >
              <ThemedText style={[styles.endTurnButtonText, {
                color: game.hands.south.length < handSizeAtTurnStart ? '#fff' : '#999'
              }]}>
                End Turn ({game.hands.south.length}/{handSizeAtTurnStart})
              </ThemedText>
            </TouchableOpacity>
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

      {/* Card Choice Modal */}
      {/* (Removed: No longer needed since all validation is gone) */}
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
