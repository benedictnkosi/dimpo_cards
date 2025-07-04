import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface TestGame {
  id: string;
  cards: number[];
  discarded: number[];
  animatingCard: number | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface TestGameUpdate {
  cards: number[];
  discarded: number[];
  animatingCard: number | null;
}

// Create a new test game
export async function createTestGame(userId: string, initialCards: number[] = [0, 1, 2, 3]): Promise<string> {
  try {
    const gameData = {
      cards: initialCards,
      discarded: [],
      animatingCard: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userId,
    };

    const docRef = await addDoc(collection(db, 'testgames'), gameData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating test game:', error);
    throw error;
  }
}

// Update a test game
export async function updateTestGame(gameId: string, update: TestGameUpdate): Promise<void> {
  try {
    const gameDocRef = doc(db, 'testgames', gameId);
    await updateDoc(gameDocRef, {
      ...update,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating test game:', error);
    throw error;
  }
}

// Delete a test game
export async function deleteTestGame(gameId: string): Promise<void> {
  try {
    const gameDocRef = doc(db, 'testgames', gameId);
    await deleteDoc(gameDocRef);
  } catch (error) {
    console.error('Error deleting test game:', error);
    throw error;
  }
}

// Listen to a test game in real-time
export function subscribeToTestGame(
  gameId: string,
  onUpdate: (game: TestGame | null) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const gameDocRef = doc(db, 'testgames', gameId);
    
    const unsubscribe = onSnapshot(
      gameDocRef,
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const game: TestGame = {
            id: doc.id,
            cards: data.cards || [],
            discarded: data.discarded || [],
            animatingCard: data.animatingCard || null,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            createdBy: data.createdBy || '',
          };
          onUpdate(game);
        } else {
          onUpdate(null);
        }
      },
      (error) => {
        console.error('Error listening to test game:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up test game listener:', error);
    if (onError) onError(error as Error);
    return () => {};
  }
}

// Get recent test games
export function subscribeToRecentTestGames(
  limitCount: number = 10,
  onUpdate: (games: TestGame[]) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const q = query(
      collection(db, 'testgames'),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const games: TestGame[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          games.push({
            id: doc.id,
            cards: data.cards || [],
            discarded: data.discarded || [],
            animatingCard: data.animatingCard || null,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            createdBy: data.createdBy || '',
          });
        });
        onUpdate(games);
      },
      (error) => {
        console.error('Error listening to recent test games:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up recent test games listener:', error);
    if (onError) onError(error as Error);
    return () => {};
  }
} 