import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface Player {
  uid: string;
  email: string | null;
  displayName?: string | null;
  userName?: string;
  whatsappNumber?: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
  isGuest: boolean;
  isPremium?: boolean;
  totalGamesPlayed?: number;
  totalWins?: number;
  totalLosses?: number;
  currentStreak?: number;
  bestStreak?: number;
}

export interface PlayerUpdate {
  displayName?: string;
  userName?: string;
  whatsappNumber?: string;
  avatar?: string;
  isPremium?: boolean;
  totalGamesPlayed?: number;
  totalWins?: number;
  totalLosses?: number;
  currentStreak?: number;
  bestStreak?: number;
}

/**
 * Add or update a player in the players collection
 * This should be called on login/signup
 */
export async function addOrUpdatePlayer(
  uid: string,
  playerData: Partial<Player>,
  isLogin: boolean = false
): Promise<void> {
  try {
    const playerRef = doc(db, 'players', uid);
    const playerDoc = await getDoc(playerRef);
    
    const now = new Date();
    const timestamp = serverTimestamp();
    
    if (playerDoc.exists()) {
      // Player exists, update with new data
      const updateData: any = {
        ...playerData,
        updatedAt: timestamp,
      };
      
      // Update lastLoginAt only on login
      if (isLogin) {
        updateData.lastLoginAt = timestamp;
      }
      
      await updateDoc(playerRef, updateData);
      console.log(`[PlayersService] Updated existing player: ${uid}`);
    } else {
      // Player doesn't exist, create new player
      const newPlayer: Player = {
        uid,
        email: playerData.email || null,
        displayName: playerData.displayName || null,
        userName: playerData.userName || null,
        whatsappNumber: playerData.whatsappNumber || null,
        avatar: playerData.avatar || '1',
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        isGuest: playerData.isGuest || false,
        isPremium: playerData.isPremium || false,
        totalGamesPlayed: playerData.totalGamesPlayed || 0,
        totalWins: playerData.totalWins || 0,
        totalLosses: playerData.totalLosses || 0,
        currentStreak: playerData.currentStreak || 0,
        bestStreak: playerData.bestStreak || 0,
      };
      
      await setDoc(playerRef, {
        ...newPlayer,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLoginAt: timestamp,
      });
      console.log(`[PlayersService] Created new player: ${uid}`);
    }
  } catch (error) {
    console.error('[PlayersService] Error adding/updating player:', error);
    throw error;
  }
}

/**
 * Get a player by UID
 */
export async function getPlayer(uid: string): Promise<Player | null> {
  try {
    const playerRef = doc(db, 'players', uid);
    const playerDoc = await getDoc(playerRef);
    
    if (playerDoc.exists()) {
      const data = playerDoc.data();
      return {
        uid: playerDoc.id,
        email: data.email,
        displayName: data.displayName,
        userName: data.userName,
        whatsappNumber: data.whatsappNumber,
        avatar: data.avatar,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastLoginAt: data.lastLoginAt?.toDate() || new Date(),
        isGuest: data.isGuest || false,
        isPremium: data.isPremium || false,
        totalGamesPlayed: data.totalGamesPlayed || 0,
        totalWins: data.totalWins || 0,
        totalLosses: data.totalLosses || 0,
        currentStreak: data.currentStreak || 0,
        bestStreak: data.bestStreak || 0,
      };
    }
    
    return null;
  } catch (error) {
    console.error('[PlayersService] Error getting player:', error);
    throw error;
  }
}

/**
 * Update player stats (games played, wins, losses, streaks)
 */
export async function updatePlayerStats(
  uid: string,
  stats: {
    totalGamesPlayed?: number;
    totalWins?: number;
    totalLosses?: number;
    currentStreak?: number;
    bestStreak?: number;
  }
): Promise<void> {
  try {
    const playerRef = doc(db, 'players', uid);
    await updateDoc(playerRef, {
      ...stats,
      updatedAt: serverTimestamp(),
    });
    console.log(`[PlayersService] Updated player stats for: ${uid}`);
  } catch (error) {
    console.error('[PlayersService] Error updating player stats:', error);
    throw error;
  }
}

/**
 * Get all players (for leaderboards, etc.)
 */
export async function getAllPlayers(): Promise<Player[]> {
  try {
    const playersQuery = query(collection(db, 'players'));
    const playersSnapshot = await getDocs(playersQuery);
    
    const players: Player[] = [];
    playersSnapshot.forEach((doc) => {
      const data = doc.data();
      players.push({
        uid: doc.id,
        email: data.email,
        displayName: data.displayName,
        userName: data.userName,
        whatsappNumber: data.whatsappNumber,
        avatar: data.avatar,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastLoginAt: data.lastLoginAt?.toDate() || new Date(),
        isGuest: data.isGuest || false,
        isPremium: data.isPremium || false,
        totalGamesPlayed: data.totalGamesPlayed || 0,
        totalWins: data.totalWins || 0,
        totalLosses: data.totalLosses || 0,
        currentStreak: data.currentStreak || 0,
        bestStreak: data.bestStreak || 0,
      });
    });
    
    return players;
  } catch (error) {
    console.error('[PlayersService] Error getting all players:', error);
    throw error;
  }
}

/**
 * Listen to a player's data in real-time
 */
export function subscribeToPlayer(
  uid: string,
  onUpdate: (player: Player | null) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const playerRef = doc(db, 'players', uid);
    
    const unsubscribe = onSnapshot(
      playerRef,
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const player: Player = {
            uid: doc.id,
            email: data.email,
            displayName: data.displayName,
            userName: data.userName,
            whatsappNumber: data.whatsappNumber,
            avatar: data.avatar,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            lastLoginAt: data.lastLoginAt?.toDate() || new Date(),
            isGuest: data.isGuest || false,
            isPremium: data.isPremium || false,
            totalGamesPlayed: data.totalGamesPlayed || 0,
            totalWins: data.totalWins || 0,
            totalLosses: data.totalLosses || 0,
            currentStreak: data.currentStreak || 0,
            bestStreak: data.bestStreak || 0,
          };
          onUpdate(player);
        } else {
          onUpdate(null);
        }
      },
      (error) => {
        console.error('[PlayersService] Error listening to player:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('[PlayersService] Error setting up player listener:', error);
    if (onError) onError(error as Error);
    return () => {};
  }
} 