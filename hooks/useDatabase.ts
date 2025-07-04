import { useState, useEffect } from 'react';
import { initDatabase } from '@/services/database';
import { initializeDatabase } from '@/services/databaseInit';

export interface Book {
  id: number;
  book_id: string;
  genre: string;
  sub_genre: string;
  chapter_number: number;
  chapter_name: string;
  content: string;
  quiz: string | null;
  images: string | null;
  word_count: number;
  reading_level: string;
  created: string;
  updated: string;
}

export interface SavingsJug {
  id: number;
  name: string;
  balance: number;
  created: string;
  updated: string;
}

export interface SavingsTransaction {
  id: number;
  savings_jug_id: number;
  transaction_name: string;
  amount: number;
  date: string;
  created: string;
}

export const useDatabase = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Initialize the database
        initDatabase();
        
        // Initialize with sample data
        await initializeDatabase();
        
        setIsInitialized(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize database');
        console.error('Database initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, []);

  return {
    isInitialized,
    isLoading,
    error
  };
}; 