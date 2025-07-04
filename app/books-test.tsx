import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable, TextInput } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/contexts/ThemeContext';
import { useDatabase } from '@/hooks/useDatabase';
import { DatabaseLoading } from '@/components/DatabaseLoading';
import { getAllBooks, getBookStatistics, getUniqueGenres, getUniqueReadingLevels } from '@/services/database';
import { loadBooksFromJSON, getBooksByGenre, getBooksByReadingLevel, searchBooks } from '@/services/bookService';

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
}

export default function BooksTestScreen() {
  const [books, setBooks] = useState<Book[]>([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [readingLevels, setReadingLevels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Book[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const { colors } = useTheme();
  const { isInitialized, isLoading: isDatabaseLoading } = useDatabase();

  useEffect(() => {
    if (isInitialized && !isDatabaseLoading) {
      loadBooksData();
    }
  }, [isInitialized, isDatabaseLoading]);

  const loadBooksData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all books
      const allBooks = await getAllBooks();
      setBooks(allBooks);

      // Load statistics
      const stats = await getBookStatistics();
      setStatistics(stats);

      // Load unique genres
      const uniqueGenres = await getUniqueGenres();
      setGenres(uniqueGenres);

      // Load unique reading levels
      const uniqueReadingLevels = await getUniqueReadingLevels();
      setReadingLevels(uniqueReadingLevels);

      setLoading(false);
    } catch (error) {
      setError('Failed to load books data');
      setLoading(false);
      console.error('Error loading books data:', error);
    }
  };

  const handleReloadBooks = async () => {
    try {
      setLoading(true);
      await loadBooksFromJSON();
      await loadBooksData();
    } catch (error) {
      setError('Failed to reload books');
      console.error('Error reloading books:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const results = await searchBooks(searchTerm);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching books:', error);
    }
  };

  // Trigger search when searchTerm changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      handleSearch();
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 20,
      color: colors.text,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 10,
      color: colors.text,
    },
    statsContainer: {
      backgroundColor: colors.surface,
      padding: 15,
      borderRadius: 10,
      marginBottom: 15,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 5,
    },
    statLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    bookCard: {
      backgroundColor: colors.surface,
      padding: 15,
      borderRadius: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bookTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 5,
      color: colors.text,
    },
    bookInfo: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    button: {
      backgroundColor: colors.primary,
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginBottom: 15,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    searchInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      marginBottom: 10,
      color: colors.text,
    },
    errorText: {
      color: 'red',
      fontSize: 16,
      marginBottom: 15,
    },
  });

  if (!isInitialized || isDatabaseLoading) {
    return <DatabaseLoading message="Loading books..." />;
  }

  return (
    <ScrollView style={styles.container}>
      <ThemedText style={styles.title}>📚 Books Test</ThemedText>

      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      <Pressable style={styles.button} onPress={handleReloadBooks}>
        <ThemedText style={styles.buttonText}>🔄 Reload Books from JSON</ThemedText>
      </Pressable>

      {loading ? (
        <ThemedText>Loading books data...</ThemedText>
      ) : (
        <>
          {/* Statistics */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>📊 Statistics</ThemedText>
            {statistics && (
              <View style={styles.statsContainer}>
                <View style={styles.statRow}>
                  <ThemedText style={styles.statLabel}>Total Books:</ThemedText>
                  <ThemedText style={styles.statValue}>{statistics.total_books}</ThemedText>
                </View>
                <View style={styles.statRow}>
                  <ThemedText style={styles.statLabel}>Genres:</ThemedText>
                  <ThemedText style={styles.statValue}>{statistics.total_genres}</ThemedText>
                </View>
                <View style={styles.statRow}>
                  <ThemedText style={styles.statLabel}>Reading Levels:</ThemedText>
                  <ThemedText style={styles.statValue}>{statistics.total_reading_levels}</ThemedText>
                </View>
                <View style={styles.statRow}>
                  <ThemedText style={styles.statLabel}>Average Word Count:</ThemedText>
                  <ThemedText style={styles.statValue}>{statistics.average_word_count}</ThemedText>
                </View>
                <View style={styles.statRow}>
                  <ThemedText style={styles.statLabel}>Total Word Count:</ThemedText>
                  <ThemedText style={styles.statValue}>{statistics.total_word_count}</ThemedText>
                </View>
              </View>
            )}
          </View>

          {/* Genres */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>📖 Genres ({genres.length})</ThemedText>
            {genres.map((genre, index) => (
              <ThemedText key={index} style={styles.bookInfo}>• {genre}</ThemedText>
            ))}
          </View>

          {/* Reading Levels */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>📚 Reading Levels ({readingLevels.length})</ThemedText>
            {readingLevels.map((level, index) => (
              <ThemedText key={index} style={styles.bookInfo}>• {level}</ThemedText>
            ))}
          </View>

          {/* Search */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>🔍 Search Books</ThemedText>
            <TextInput
              style={styles.searchInput}
              placeholder="Search books..."
              placeholderTextColor={colors.textSecondary}
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
            {searchResults.length > 0 && (
              <ThemedText style={styles.bookInfo}>
                Found {searchResults.length} results for "{searchTerm}"
              </ThemedText>
            )}
          </View>

          {/* All Books */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>📚 All Books ({books.length})</ThemedText>
            {books.map((book) => (
              <View key={book.id} style={styles.bookCard}>
                <ThemedText style={styles.bookTitle}>{book.chapter_name}</ThemedText>
                <ThemedText style={styles.bookInfo}>Book ID: {book.book_id}</ThemedText>
                <ThemedText style={styles.bookInfo}>Genre: {book.genre} → {book.sub_genre}</ThemedText>
                <ThemedText style={styles.bookInfo}>Chapter: {book.chapter_number}</ThemedText>
                <ThemedText style={styles.bookInfo}>Reading Level: {book.reading_level}</ThemedText>
                <ThemedText style={styles.bookInfo}>Word Count: {book.word_count}</ThemedText>
                <ThemedText style={styles.bookInfo}>
                  Content Preview: {book.content.substring(0, 100)}...
                </ThemedText>
                {book.quiz && (
                  <ThemedText style={styles.bookInfo}>✅ Has Quiz</ThemedText>
                )}
                {book.images && (
                  <ThemedText style={styles.bookInfo}>🖼️ Has Images</ThemedText>
                )}
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
} 