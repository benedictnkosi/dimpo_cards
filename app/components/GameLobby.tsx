import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, Animated as LegacyAnimated, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedText from './ThemedText';
import { db } from '@/config/firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, doc, updateDoc, getDoc, deleteDoc, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getPlayer } from '@/services/playersService';

const { width } = Dimensions.get('window');

export interface GameLobbyProps {
  onGameStarted: (gameId: string) => void;
  onGameJoined: (gameId: string) => void;
  onCancelGame?: () => void;
  currentGameId?: string | null;
  firebaseGameData?: any;
  isPlayer1?: boolean | null;
  gameType?: string;
}

export default function GameLobby({
  onGameStarted,
  onGameJoined,
  onCancelGame,
  currentGameId,
  firebaseGameData,
  isPlayer1,
  gameType
}: GameLobbyProps) {
  const { user } = useAuth();
  const [localUsername, setLocalUsername] = useState<string>('');
  const [firebaseUsername, setFirebaseUsername] = useState<string>('');
  
  // Debug log for player role and game data
  console.log('GameLobby: isPlayer1', isPlayer1, 'user:', user, 'firebaseGameData:', firebaseGameData);
  
  // Log username for debugging
  console.log('GameLobby - Local username from AsyncStorage:', localUsername);
  console.log('GameLobby - User UID:', user?.uid);
  console.log('GameLobby - Firebase username:', firebaseUsername);
  
  const [waitingGames, setWaitingGames] = useState<any[]>([]);
  const [showGameCancelledPopup, setShowGameCancelledPopup] = useState(false);
  const [cancelledGameInfo, setCancelledGameInfo] = useState<{cancelledBy: string, reason: string} | null>(null);
  
  // Animation refs
  const fadeAnim = React.useRef(new LegacyAnimated.Value(0)).current;
  const emojiScale = React.useRef(new LegacyAnimated.Value(0.8)).current;
  const [btnScale] = useState(new LegacyAnimated.Value(1));

  useEffect(() => {
    // Start animations
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

  // Load local username from AsyncStorage
  useEffect(() => {
    const loadLocalUsername = async () => {
      try {
        const storedUsername = await AsyncStorage.getItem('username');
        setLocalUsername(storedUsername || '');
        console.log('GameLobby - Loaded local username from AsyncStorage:', storedUsername);
      } catch (error) {
        console.error('GameLobby - Error loading local username:', error);
      }
    };
    
    loadLocalUsername();
  }, []);

  // Fetch Firebase username
  useEffect(() => {
    const fetchFirebaseUsername = async () => {
      if (user?.uid) {
        try {
          const player = await getPlayer(user.uid);
          console.log('GameLobby - Firebase player data:', player);
          if (player?.userName) {
            setFirebaseUsername(player.userName);
            console.log('GameLobby - Set Firebase username to:', player.userName);
          }
        } catch (error) {
          console.error('GameLobby - Error fetching Firebase username:', error);
        }
      }
    };
    
    fetchFirebaseUsername();
  }, [user?.uid]);

  // Listen for waiting games
  useEffect(() => {
    const q = query(collection(db, 'games'), where('status', '==', 'waiting'));
    const unsub = onSnapshot(q, (snap) => {
      setWaitingGames(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // Listen for game cancellation/deletion
  useEffect(() => {
    if (!currentGameId) return;

    // If firebaseGameData is null but we have a currentGameId, the game was likely deleted
    if (!firebaseGameData && currentGameId) {
      setCancelledGameInfo({
        cancelledBy: 'Opponent',
        reason: 'Game was deleted'
      });
      setShowGameCancelledPopup(true);
      return;
    }

    if (!firebaseGameData) return;

    // Check if game was deleted or cancelled
    if (firebaseGameData.status === 'cancelled' || firebaseGameData.status === 'deleted') {
      const cancelledBy = firebaseGameData.cancelledBy || 'Opponent';
      const reason = firebaseGameData.cancellationReason || 'Game was cancelled';
      
      setCancelledGameInfo({
        cancelledBy,
        reason
      });
      setShowGameCancelledPopup(true);
    }
  }, [firebaseGameData, currentGameId]);

  // Handle popup dismissal
  const handlePopupDismiss = () => {
    setShowGameCancelledPopup(false);
    setCancelledGameInfo(null);
    onCancelGame?.();
    router.push('/');
  };

  // Start new game
  async function handleStartNewGame() {
    try {
      console.log('handleStartNewGame - username being used:', localUsername);
      console.log('handleStartNewGame - user?.uid:', user?.uid);
      
      // Delete only active games (not completed) where the current user is a player
      const gamesQuery = query(collection(db, 'games'));
      const gamesSnapshot = await getDocs(gamesQuery);
      
      const deletePromises = gamesSnapshot.docs
        .filter(doc => {
          const gameData = doc.data();
          const player1Name = gameData.players?.player1?.name;
          const player2Name = gameData.players?.player2?.name;
          const isPlayerInGame = player1Name === localUsername || player2Name === localUsername;
          const isActiveGame = gameData.status !== 'finished';
          return isPlayerInGame && isActiveGame;
        })
        .map(doc => deleteDoc(doc.ref));
      
      await Promise.all(deletePromises);
      
      // Use Firebase username first, then local username, then fallback
      const playerName = firebaseUsername || localUsername || 'Player';
      console.log('handleStartNewGame - Final player name being used:', playerName);
      
      const docRef = await addDoc(collection(db, 'games'), {
        status: 'waiting',
        createdAt: serverTimestamp(),
        gameName: playerName,
        gameType: gameType || 'default',
        players: {
          player1: {
            name: playerName,
            uid: user?.uid || '',
            hand: [],
          },
        },
      });
      onGameStarted(docRef.id);
    } catch (err) {
      console.error('Error starting new game:', err);
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
        // Use Firebase username first, then local username, then fallback
        const playerName = firebaseUsername || localUsername || 'Player';
        console.log('handleJoinGame - Final player name being used:', playerName);
        
        await updateDoc(gameDocRef, {
          status: 'pending_acceptance',
          [`players.player2`]: {
            name: playerName,
            uid: user?.uid || '',
            hand: [],
          },
        });
      } else {
        await updateDoc(gameDocRef, { status: 'pending_acceptance' });
      }
      onGameJoined(gameId);
    } catch (err) {
      console.error('Error joining game:', err);
    }
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
      console.error('Error accepting opponent:', err);
    }
  }

  // Cancel game
  async function handleCancelGame() {
    if (currentGameId && firebaseGameData) {
      try {
        // If player 2 is leaving during pending_acceptance, just remove player2 and set status to 'waiting'
        if (!isPlayer1 && firebaseGameData.status === 'pending_acceptance') {
          const gameDocRef = doc(db, 'games', currentGameId);
          await updateDoc(gameDocRef, {
            status: 'waiting',
            'players.player2': null,
          });
        } else {
          // If player 1 is cancelling, set status to cancelled instead of deleting immediately
          // This allows the opponent to see the cancellation popup
          const gameDocRef = doc(db, 'games', currentGameId);
          await updateDoc(gameDocRef, {
            status: 'cancelled',
            cancelledBy: localUsername || 'Host',
            cancellationReason: 'Game was cancelled by the host',
            cancelledAt: serverTimestamp(),
          });
          
          // Delete the game after a short delay to allow popup to show
          setTimeout(async () => {
            try {
              await deleteDoc(gameDocRef);
            } catch (err) {
              console.error('Error deleting cancelled game:', err);
            }
          }, 3000); // 3 second delay
        }
      } catch (err) {
        console.error('Error updating or deleting game:', err);
      }
    }
    onCancelGame?.();
    router.push('/');
  }

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

  // Determine if the user has a waiting/pending game as player1
  const hasOwnWaitingGame = waitingGames.some(
    game =>
      ((game.players?.player1?.uid && user?.uid && game.players.player1.uid === user.uid) ||
       (game.players?.player1?.name && game.players.player1.name === localUsername)) &&
      (game.status === 'waiting' || game.status === 'pending_acceptance')
  );

  // Determine if the user is waiting for host to accept (player 2, pending_acceptance)
  const isWaitingForHost = firebaseGameData && firebaseGameData.status === 'pending_acceptance' && isPlayer1 === false;
  // Determine if the host needs to accept an opponent (player 1, pending_acceptance, player2 joined)
  const needsToAcceptOpponent = (
    firebaseGameData &&
    firebaseGameData.status === 'pending_acceptance' &&
    isPlayer1 === true &&
    firebaseGameData.players?.player2?.name
  );

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
        // Host sees accept button if pending_acceptance and player2 has joined
        (isPlayer1 === true && firebaseGameData.status === 'pending_acceptance' && !!firebaseGameData.players?.player2?.name) ? (
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
        (isPlayer1 === false && firebaseGameData.status === 'pending_acceptance' && !!firebaseGameData.players?.player2?.name) ? (
          <>
            <LegacyAnimated.Text
              style={[
                styles.waitingMessagePlayful
                // Animation temporarily removed for debugging
              ]}
            >
              Waiting for host to accept...
            </LegacyAnimated.Text>
            <TouchableOpacity
              style={styles.cancelGameBtn}
              onPress={handleCancelGame}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.cancelGameBtnText}>🔄 Find Another Game</ThemedText>
            </TouchableOpacity>
          </>
        ) :
        // Default: waiting for opponent to join (for host when no player2 yet, or when status is 'waiting')
        (isPlayer1 === true && firebaseGameData.status === 'waiting') ? (
          <LegacyAnimated.Text
            style={[
              styles.waitingMessagePlayful
            ]}
          >
            Waiting for opponent to join…
          </LegacyAnimated.Text>
        ) : null
      )}
      
      {/* Games waiting for opponents section */}
      {!hasOwnWaitingGame && !isWaitingForHost && !needsToAcceptOpponent && (
        <View style={styles.waitingGamesSection}>
          <ThemedText style={styles.waitingTitleModern}>Games waiting for opponents:</ThemedText>
          {waitingGames.length === 0 && (
            <View style={styles.noGamesModernRow}>
              <ThemedText style={styles.noGamesPlayfulText}>No games yet! Be the first to start one!</ThemedText>
            </View>
          )}
          <View style={styles.waitingGamesListModern}>
            {waitingGames
              .filter(game => {
                // Prefer filtering by UID if available, fallback to username
                if (game.players?.player1?.uid && user?.uid) {
                  return game.players.player1.uid !== user.uid;
                }
                return game.players?.player1?.name !== localUsername;
              })
              .map(game => {
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
                      <ThemedText style={styles.waitingGameTextModern}>
                        🎲 {game.players?.player1?.name || "Available Game"}
                      </ThemedText>
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
      {firebaseGameData && (
        (firebaseGameData.status === 'waiting' && isPlayer1) ||
        (firebaseGameData.status === 'pending_acceptance' && isPlayer1 && !firebaseGameData.players?.player2?.name)
      ) && (
        <TouchableOpacity
          style={styles.cancelGameBtn}
          onPress={handleCancelGame}
          activeOpacity={0.7}
        >
          <ThemedText style={styles.cancelGameBtnText}>❌ Cancel Game</ThemedText>
        </TouchableOpacity>
      )}
      
      {/* Footer */}
      <View style={styles.footer}><ThemedText style={styles.footerText}>© {new Date().getFullYear()} Dimpo Crazy 8</ThemedText></View>
      
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
                {cancelledGameInfo?.cancelledBy || 'Opponent'} cancelled the game.
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14532d',
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
  waitingGamesSection: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#fffbe6',
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
    marginTop: 24,
  },
  cancelGameBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    textShadowColor: '#222',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
}); 