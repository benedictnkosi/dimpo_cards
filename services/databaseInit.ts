import { initDatabase, insertBook, insertSavingsJug, insertSavingsTransaction, addDefaultJarsToExistingProfiles, getAllBooks, getAllSavingsJugs } from './database';
import booksData from '@/assets/books.json';
import { initializeSavingsWithSampleData } from './savingsService';

// Sample savings jars data
const SAMPLE_SAVINGS_JUGS = [
  { name: 'Reading Fund', emoji: '💰' }
];


// Initialize database and populate with sample data
export const initializeDatabase = async () => {
  try {
    console.log('Initializing database...');
    
    // Initialize the database
    initDatabase();
    
    // Load books into database
    await loadBooksIntoDatabase();
    
    // Load savings data into database
    await loadSavingsIntoDatabase();
    
    // Add default jars to existing profiles
    await addDefaultJarsToExistingProfiles();
    
    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Load books from JSON file into database
const loadBooksIntoDatabase = async () => {
  try {
    console.log('Loading books into database...');
    
    // Check if books already exist
    const existingBooks = await getAllBooks();
    if (existingBooks.length > 0) {
      console.log('Books already exist in database, skipping...');
      return;
    }
    
    // Insert books from JSON data
    for (const book of (booksData as any).books) {
      await insertBook({
        book_id: book.book_id,
        title: book.title,
        genre: book.genre,
        sub_genre: book.sub_genre,
        chapter_number: book.chapter_number,
        chapter_name: book.chapter_name,
        content: book.content,
        quiz: book.quiz ? JSON.stringify(book.quiz) : undefined,
        images: book.images ? JSON.stringify(book.images) : undefined,
        word_count: book.word_count,
        reading_level: book.reading_level
      });
    }
    
    console.log(`Loaded ${(booksData as any).books.length} books into database`);
  } catch (error) {
    console.error('Error loading books into database:', error);
    throw error;
  }
};

// Load savings data into database
const loadSavingsIntoDatabase = async () => {
  try {
    console.log('Loading savings data into database...');
    
    // Check if savings jars already exist
    const existingJugs = await getAllSavingsJugs();
    if (existingJugs.length > 0) {
      console.log('Savings data already exists in database, skipping...');
      return;
    }
    
    // Note: We no longer create sample savings jars here since they will be created per profile
    console.log('Savings jars will be created per profile automatically');
    
  } catch (error) {
    console.error('Error loading savings data into database:', error);
    throw error;
  }
}; 