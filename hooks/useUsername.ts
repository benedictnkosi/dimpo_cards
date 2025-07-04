import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useUsername() {
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUsername();
  }, []);

  const loadUsername = async () => {
    try {
      const storedUsername = await AsyncStorage.getItem('username');
      setUsername(storedUsername);
    } catch (error) {
      console.error('Error loading username:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveUsername = async (newUsername: string) => {
    try {
      await AsyncStorage.setItem('username', newUsername);
      setUsername(newUsername);
      return true;
    } catch (error) {
      console.error('Error saving username:', error);
      return false;
    }
  };

  const clearUsername = async () => {
    try {
      await AsyncStorage.removeItem('username');
      setUsername(null);
      return true;
    } catch (error) {
      console.error('Error clearing username:', error);
      return false;
    }
  };

  return {
    username,
    isLoading,
    saveUsername,
    clearUsername,
    loadUsername,
  };
} 