import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator, Alert, Text } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ChapterContent } from './components/reading/chapter-content';
import { BookQuiz } from './components/reading/book-quiz';
import { useTheme } from '@/contexts/ThemeContext';
import { analytics } from '@/services/analytics';
import { HOST_URL } from '@/config/api';
import { 
  getCurrentReadingStatus,
  finishCurrentReading,
  updateReading,
  type CurrentReading
} from '@/services/readingService';
import { getAllBooks, initializeReadingLevel } from '@/services/database';

interface Book {
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
  title: string | null;
}

export default function ReadingScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentReading, setCurrentReading] = useState<CurrentReading | null>(null);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [readingProgress, setReadingProgress] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState<number>(0);
  const [readingDuration, setReadingDuration] = useState<number>(0);

  const router = useRouter();
  const { colors, isDark } = useTheme();

  // Initialize reading level if not set
  const initializeUserReadingLevel = async () => {
    try {
      await initializeReadingLevel();
    } catch (error) {
      console.error('Error initializing reading level in ReadingScreen:', error);
    }
  };

  // Load reading data
  useEffect(() => {
    loadReadingData();
    initializeUserReadingLevel(); // Initialize reading level
  }, []);

  const loadReadingData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get current reading status
      const selectedProfileUid = await AsyncStorage.getItem('selectedProfileUid');
      const readingStatus = await getCurrentReadingStatus(selectedProfileUid || undefined);
      if (!readingStatus) {
        setError('No active reading session found');
        setIsLoading(false);
        return;
      }

      setCurrentReading(readingStatus);

      // Get the current book details
      const allBooks = await getAllBooks();
      const book = allBooks.find(b => 
        b.book_id === readingStatus.book_id && 
        b.chapter_number === readingStatus.chapter_number
      );
      
      if (!book) {
        setError('Book not found');
        setIsLoading(false);
        return;
      }

      setCurrentBook(book);
      setIsLoading(false);
    } catch (error) {
      setError('Failed to load reading data');
      setIsLoading(false);
      console.error('Error loading reading data:', error);
    }
  };

  const handleFinishReading = async () => {
    Alert.alert(
      'Finish Reading',
      'Are you sure you want to finish reading this book?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finish',
          style: 'destructive',
          onPress: async () => {
            try {
              await finishCurrentReading();
              
              // Track reading completion
              analytics.track('reading_finished', {
                book_id: currentReading?.book_id,
                chapter_name: currentReading?.chapter_name,
                reading_progress: readingProgress
              });
              
              // Navigate back to home
              router.back();
            } catch (error) {
              setError('Failed to finish reading');
              console.error('Error finishing reading:', error);
            }
          }
        }
      ]
    );
  };

  const handleStartQuiz = (wordCount: number, readingDuration: number) => {
    console.log('Starting quiz with word count:', wordCount, 'and reading duration:', readingDuration, 'seconds');
    setReadingDuration(readingDuration);
    setShowQuiz(true);
  };

  const handleQuizClose = (shouldRetry?: boolean) => {
    setShowQuiz(false);
    if (shouldRetry) {
      // If user wants to retry, they can scroll back up and click the quiz button again
      console.log('User wants to retry quiz');
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: 20,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 40,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      opacity: 0.7,
    },
    contentContainer: {
      flex: 1,
      paddingBottom: 40,
    },
    bookHeader: {
      backgroundColor: colors.surface,
      padding: 20,
      borderRadius: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bookTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 8,
      color: colors.text,
    },
    bookMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    bookMetaText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    progressContainer: {
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    progressText: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    progressBar: {
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 4,
    },
    bookContentContainer: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: 20,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
    },
    actionButton: {
      flex: 1,
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 12,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    secondaryButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    primaryButtonText: {
      color: '#fff',
    },
    secondaryButtonText: {
      color: colors.text,
    },
    errorText: {
      color: '#dc2626',
      fontSize: 16,
      textAlign: 'center',
      marginTop: 20,
    },
    quizOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    },
  });

  // Track reading screen view
  useEffect(() => {
    analytics.track('reading_screen_viewed', {
      book_id: currentReading?.book_id,
      chapter_name: currentReading?.chapter_name,
      is_loading: isLoading,
      has_error: !!error
    });
  }, [currentReading, isLoading, error]);

  return (
    <ThemedView style={styles.container}>
 
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText style={styles.loadingText}>Loading book...</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.contentContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => router.back()}
          >
            <ThemedText style={[styles.actionButtonText, styles.secondaryButtonText]}>
              ← Go Back
            </ThemedText>
          </Pressable>
        </View>
      ) : currentBook ? (
        <View style={[styles.contentContainer, {flex: 1, paddingBottom: 0}]}>
          

          {/* Book Content */}
          <View style={[styles.bookContentContainer, {flex: 1, marginBottom: 0, paddingVertical: 0}]}>
            <ChapterContent 
              bookName={currentBook.title || ''}
              chapterName={currentBook.chapter_name}
              chapterNumber={currentBook.chapter_number}
              content={currentBook.content}
              onProgress={setReadingProgress}
              onStartQuiz={handleStartQuiz}
              readingLevel={currentBook.reading_level}
              image1={currentBook.images ? (() => {
                try {
                  const imagesData = JSON.parse(currentBook.images);
                  return imagesData.illustrations && imagesData.illustrations.length > 0 
                    ? imagesData.illustrations[0]
                    : undefined;
                } catch (error) {
                  console.error('Error parsing images JSON:', error);
                  return undefined;
                }
              })() : undefined}
              image2={currentBook.images ? (() => {
                try {
                  const imagesData = JSON.parse(currentBook.images);
                  return imagesData.illustrations && imagesData.illustrations.length > 1 
                    ? imagesData.illustrations[1]
                    : undefined;
                } catch (error) {
                  console.error('Error parsing images JSON:', error);
                  return undefined;
                }
              })() : undefined}
            />
          </View>

          
        </View>
      ) : null}

      {/* Quiz Overlay */}
      {showQuiz && currentBook && (
        <View style={styles.quizOverlay}>
          <BookQuiz
            chapterId={currentBook.id}
            onClose={handleQuizClose}
            wordCount={currentBook.word_count}
            readingDuration={readingDuration}
          />
        </View>
      )}
    </ThemedView>
  );
} 