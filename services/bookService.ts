import { insertBook, getAllBooks, getBookStatistics, clearAllBooks } from './database';

// Import the books data
import booksData from '@/assets/books.json';

// Interface for book data from JSON
interface BookData {
  book_id: string;
  title: string;
  genre: string;
  sub_genre: string;
  chapter_number: number;
  chapter_name: string;
  content: string;
  quiz: {
    questions: Array<{
      question: string;
      options: string[];
      correct_answer: string;
    }>;
  };
  images: {
    chapter_cover: string;
    illustrations: string[];
  };
  word_count: number;
  reading_level: string;
}

// Load books from JSON and populate database
export const loadBooksFromJSON = async (): Promise<void> => {
  try {
    console.log('[BookService] Starting to load books from JSON...');
    
    const books = (booksData as any).books as BookData[];
    console.log(`[BookService] Found ${books.length} books in JSON file`);
    
    let insertedCount = 0;
    let skippedCount = 0;
    
    for (const book of books) {
      try {
        await insertBook({
          book_id: book.book_id,
          title: book.title,
          genre: book.genre,
          sub_genre: book.sub_genre,
          chapter_number: book.chapter_number,
          chapter_name: book.chapter_name,
          content: book.content,
          quiz: JSON.stringify(book.quiz),
          images: JSON.stringify(book.images),
          word_count: book.word_count,
          reading_level: book.reading_level
        });
        insertedCount++;
      } catch (error) {
        console.error(`[BookService] Error inserting book ${book.book_id}:`, error);
        skippedCount++;
      }
    }
    
    console.log(`[BookService] Successfully inserted ${insertedCount} books, skipped ${skippedCount}`);
    
    // Log book statistics
    const stats = await getBookStatistics();
    console.log('[BookService] Book Statistics:', stats);
    
  } catch (error) {
    console.error('[BookService] Error loading books from JSON:', error);
    throw error;
  }
};

// Reload books from JSON (clear existing and reload)
export const reloadBooksFromJSON = async (): Promise<void> => {
  try {
    console.log('[BookService] Starting to reload books from JSON...');
    
    // Clear existing books first
    await clearAllBooks();
    console.log('[BookService] Cleared existing books from database');
    
    // Load books from JSON
    await loadBooksFromJSON();
    
    console.log('[BookService] Successfully reloaded books from JSON');
    
  } catch (error) {
    console.error('[BookService] Error reloading books from JSON:', error);
    throw error;
  }
};

// Check if books are already loaded in database
export const checkBooksLoaded = async (): Promise<boolean> => {
  try {
    const books = await getAllBooks();
    return books.length > 0;
  } catch (error) {
    console.error('[BookService] Error checking if books are loaded:', error);
    return false;
  }
};

// Initialize books (load from JSON if not already in database)
export const initializeBooks = async (): Promise<void> => {
  try {
    console.log('[BookService] Initializing books...');
    
    const booksLoaded = await checkBooksLoaded();
    
    if (booksLoaded) {
      console.log('[BookService] Books already loaded in database');
      return;
    }
    
    console.log('[BookService] No books found in database, loading from JSON...');
    await loadBooksFromJSON();
    
  } catch (error) {
    console.error('[BookService] Error initializing books:', error);
    throw error;
  }
};

// Get books grouped by genre
export const getBooksByGenre = async () => {
  try {
    const books = await getAllBooks();
    
    const groupedBooks = books.reduce((acc, book) => {
      if (!acc[book.genre]) {
        acc[book.genre] = [];
      }
      acc[book.genre].push(book);
      return acc;
    }, {} as Record<string, typeof books>);
    
    return groupedBooks;
  } catch (error) {
    console.error('[BookService] Error grouping books by genre:', error);
    throw error;
  }
};

// Get books grouped by reading level
export const getBooksByReadingLevel = async () => {
  try {
    const books = await getAllBooks();
    
    const groupedBooks = books.reduce((acc, book) => {
      if (!acc[book.reading_level]) {
        acc[book.reading_level] = [];
      }
      acc[book.reading_level].push(book);
      return acc;
    }, {} as Record<string, typeof books>);
    
    return groupedBooks;
  } catch (error) {
    console.error('[BookService] Error grouping books by reading level:', error);
    throw error;
  }
};

// Search books by content
export const searchBooks = async (searchTerm: string) => {
  try {
    const books = await getAllBooks();
    
    const searchLower = searchTerm.toLowerCase();
    
    return books.filter(book => 
      (book.title && book.title.toLowerCase().includes(searchLower)) ||
      book.chapter_name.toLowerCase().includes(searchLower) ||
      book.content.toLowerCase().includes(searchLower) ||
      book.genre.toLowerCase().includes(searchLower) ||
      book.sub_genre.toLowerCase().includes(searchLower)
    );
  } catch (error) {
    console.error('[BookService] Error searching books:', error);
    throw error;
  }
}; 