import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { useRouter, useSegments } from 'expo-router';
import { initializeReadingLevel } from '@/services/database';
import { addOrUpdatePlayer } from '@/services/playersService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  isPremium?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (email: string, password: string) => Promise<AuthUser>;
  signInAnonymously: () => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  signIn: async () => { throw new Error('AuthContext not initialized'); },
  signUp: async () => { throw new Error('AuthContext not initialized'); },
  signInAnonymously: async () => { throw new Error('AuthContext not initialized'); },
  signOut: async () => { throw new Error('AuthContext not initialized'); },
});


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  // Initialize reading level if not set
  const initializeUserReadingLevel = async () => {
    try {
      await initializeReadingLevel();
    } catch (error) {
      console.error('Error initializing reading level:', error);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Attempt to restore from SecureStore first
    async function restoreFromSecureStore() {
      try {
        const storedAuth = await SecureStore.getItemAsync('auth');
        if (storedAuth && !user && isMounted) {
          const { user: storedUser } = JSON.parse(storedAuth);
          setUser(storedUser);
          // Initialize reading level when user is restored
          await initializeUserReadingLevel();
        }
      } catch (error) {
        console.error('Error restoring auth from SecureStore:', error);
      }
    }

    // Then set up Firebase auth listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;

      if (firebaseUser) {
        const userData: AuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };
        // Store in SecureStore as backup
        await SecureStore.setItemAsync('auth', JSON.stringify({ user: userData }));
        setUser(userData);
        // Initialize reading level when user is authenticated
        await initializeUserReadingLevel();
      } else {
        // Only clear auth if we're sure there's no user
        const storedAuth = await SecureStore.getItemAsync('auth');
        if (!storedAuth) {
          setUser(null);
          await SecureStore.deleteItemAsync('auth');
        }
      }
      setIsLoading(false);
    });

    restoreFromSecureStore();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inRegisterScreen = segments.join('/') === 'register';
    const inForgotPasswordScreen = segments.join('/') === 'forgot-password';
    const inOnboardingScreen = segments.join('/') === 'onboarding';

    if (!user && !inRegisterScreen && !inForgotPasswordScreen && !inOnboardingScreen) {
      router.replace('/onboarding');
    } else if (user && (inAuthGroup || inRegisterScreen || inForgotPasswordScreen || inOnboardingScreen)) {
      router.replace('/');
    }
  }, [user, isLoading, segments]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    await SecureStore.deleteItemAsync('auth');
    setUser(null);
  };

  const signIn = async (email: string, password: string): Promise<AuthUser> => {
    const { user: firebaseUser } = await signInWithEmailAndPassword(auth, email, password);
    const userData: AuthUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
    };
    
    // Add/update player in Firebase players collection
    try {
      const onboardingData = await AsyncStorage.getItem('onboardingData');
      const parsedOnboarding = onboardingData ? JSON.parse(onboardingData) : {};
      
      await addOrUpdatePlayer(firebaseUser.uid, {
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        userName: parsedOnboarding.userName,
        whatsappNumber: parsedOnboarding.whatsappNumber,
        avatar: parsedOnboarding.avatar || '1',
        isGuest: parsedOnboarding.isGuest || false,
      }, true); // true indicates this is a login
    } catch (error) {
      console.error('[AuthContext] Error adding player to Firebase on login:', error);
      // Don't throw error to prevent login failure
    }
    
    return userData;
  };

  const signUp = async (email: string, password: string): Promise<AuthUser> => {
    const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);
    const userData: AuthUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
    };
    
    // Add/update player in Firebase players collection
    try {
      const onboardingData = await AsyncStorage.getItem('onboardingData');
      const parsedOnboarding = onboardingData ? JSON.parse(onboardingData) : {};
      
      await addOrUpdatePlayer(firebaseUser.uid, {
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        userName: parsedOnboarding.userName,
        whatsappNumber: parsedOnboarding.whatsappNumber,
        avatar: parsedOnboarding.avatar || '1',
        isGuest: parsedOnboarding.isGuest || false,
      }, false); // false indicates this is a signup
    } catch (error) {
      console.error('[AuthContext] Error adding player to Firebase on signup:', error);
      // Don't throw error to prevent signup failure
    }
    
    return userData;
  };

  const signInAnonymously = async (): Promise<AuthUser> => {
    const { user: firebaseUser } = await signInAnonymously(auth);
    const userData: AuthUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
    };
    
    // Add/update player in Firebase players collection
    try {
      const onboardingData = await AsyncStorage.getItem('onboardingData');
      const parsedOnboarding = onboardingData ? JSON.parse(onboardingData) : {};
      
      await addOrUpdatePlayer(firebaseUser.uid, {
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        userName: parsedOnboarding.userName,
        whatsappNumber: parsedOnboarding.whatsappNumber,
        avatar: parsedOnboarding.avatar || '1',
        isGuest: true, // Anonymous users are always guests
      }, false); // false indicates this is a signup
    } catch (error) {
      console.error('[AuthContext] Error adding player to Firebase on anonymous signup:', error);
      // Don't throw error to prevent signup failure
    }
    
    return userData;
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signInAnonymously, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 