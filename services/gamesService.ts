import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  query,
  where,
  getDocs,
  getDoc
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface Game {
  id: string;
  status: 'waiting' | 'pending_acceptance' | 'started' | 'finished';
  createdAt: Date;
  updatedAt: Date;
  gameName: string;
  players: {
    player1: {
      name: string;
      hand: any[];
      lastCardPlayed?: any;
    };
    player2?: {
      name: string;
      hand: any[];
      lastCardPlayed?: any;
    };
  };
  pile?: any[];
  currentCard?: any;
  discardPile?: any[];
  turn?: 'player1' | 'player2';
  lastUpdated?: Date;
}

export interface GameUpdate {
  status?: string;
  players?: any;
  pile?: any[];
  currentCard?: any;
  discardPile?: any[];
  turn?: 'player1' | 'player2';
}

// Create a new game
export async function createGame(userName: string): Promise<string> {
  try {
    const gameData = {
      status: 'waiting',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      gameName: userName,
      players: {
        player1: {
          name: userName,
          hand: [],
        },
      },
    };

    const docRef = await addDoc(collection(db, 'games'), gameData);
    return docRef.id;
  } catch (error) {
    console.error('[GamesService] Error creating game:', error);
    throw error;
  }
}

// Update a game
export async function updateGame(gameId: string, update: GameUpdate): Promise<void> {
  try {
    const gameDocRef = doc(db, 'games', gameId);
    await updateDoc(gameDocRef, {
      ...update,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[GamesService] Error updating game:', error);
    throw error;
  }
}

// Delete a specific game
export async function deleteGame(gameId: string): Promise<void> {
  try {
    const gameDocRef = doc(db, 'games', gameId);
    await deleteDoc(gameDocRef);
  } catch (error) {
    console.error('[GamesService] Error deleting game:', error);
    throw error;
  }
}

// Delete all games where the user is player1
export async function deleteGamesWherePlayer1(userName: string): Promise<void> {
  try {
    const gamesQuery = query(collection(db, 'games'));
    const gamesSnapshot = await getDocs(gamesQuery);
    
    const deletePromises = gamesSnapshot.docs
      .filter(doc => {
        const gameData = doc.data();
        const player1Name = gameData.players?.player1?.name;
        return player1Name === userName;
      })
      .map(doc => deleteDoc(doc.ref));
    
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
      console.log(`[GamesService] Deleted ${deletePromises.length} games where user is player1`);
    }
  } catch (error) {
    console.error('[GamesService] Error deleting games where user is player1:', error);
    throw error;
  }
}

// Get a specific game
export async function getGame(gameId: string): Promise<Game | null> {
  try {
    const gameDocRef = doc(db, 'games', gameId);
    const gameDoc = await getDoc(gameDocRef);
    
    if (gameDoc.exists()) {
      const data = gameDoc.data();
      return {
        id: gameDoc.id,
        status: data.status || 'waiting',
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        gameName: data.gameName || '',
        players: data.players || {},
        pile: data.pile || [],
        currentCard: data.currentCard || null,
        discardPile: data.discardPile || [],
        turn: data.turn || 'player1',
        lastUpdated: data.lastUpdated?.toDate() || new Date(),
      };
    }
    
    return null;
  } catch (error) {
    console.error('[GamesService] Error getting game:', error);
    throw error;
  }
}

// Listen to a game in real-time
export function subscribeToGame(
  gameId: string,
  onUpdate: (game: Game | null) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const gameDocRef = doc(db, 'games', gameId);
    
    const unsubscribe = onSnapshot(
      gameDocRef,
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const game: Game = {
            id: doc.id,
            status: data.status || 'waiting',
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            gameName: data.gameName || '',
            players: data.players || {},
            pile: data.pile || [],
            currentCard: data.currentCard || null,
            discardPile: data.discardPile || [],
            turn: data.turn || 'player1',
            lastUpdated: data.lastUpdated?.toDate() || new Date(),
          };
          onUpdate(game);
        } else {
          onUpdate(null);
        }
      },
      (error) => {
        console.error('[GamesService] Error listening to game:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('[GamesService] Error setting up game listener:', error);
    if (onError) onError(error as Error);
    return () => {};
  }
}

// Listen to waiting games
export function subscribeToWaitingGames(
  onUpdate: (games: Game[]) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const q = query(collection(db, 'games'), where('status', '==', 'waiting'));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const games: Game[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          games.push({
            id: doc.id,
            status: data.status || 'waiting',
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            gameName: data.gameName || '',
            players: data.players || {},
            pile: data.pile || [],
            currentCard: data.currentCard || null,
            discardPile: data.discardPile || [],
            turn: data.turn || 'player1',
            lastUpdated: data.lastUpdated?.toDate() || new Date(),
          });
        });
        onUpdate(games);
      },
      (error) => {
        console.error('[GamesService] Error listening to waiting games:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('[GamesService] Error setting up waiting games listener:', error);
    if (onError) onError(error as Error);
    return () => {};
  }
} 