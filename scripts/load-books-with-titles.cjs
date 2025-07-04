const { initDatabase, insertBook, clearAllBooks } = require('../services/database');
const booksData = require('../assets/books.json');

// Interface for book data from JSON
const loadBooksWithTitles = async () => {
  try {
    console.log('Starting to load books with titles from JSON...');
    
    // Initialize database
    await initDatabase();
    console.log('Database initialized');
    
    // Clear existing books first
    await clearAllBooks();
    console.log('Cleared existing books from database');
    
    const books = booksData.books;
    console.log(`Found ${books.length} books in JSON file`);
    
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
        console.log(`Inserted book: ${book.title} (${book.book_id})`);
      } catch (error) {
        console.error(`Error inserting book ${book.book_id}:`, error);
        skippedCount++;
      }
    }
    
    console.log(`Successfully inserted ${insertedCount} books, skipped ${skippedCount}`);
    
    // Log some sample books to verify titles are saved
    const { getAllBooks } = require('../services/database');
    const allBooks = await getAllBooks();
    console.log('\nSample books with titles:');
    allBooks.slice(0, 5).forEach(book => {
      console.log(`- ${book.title} (${book.book_id}) - Chapter ${book.chapter_number}`);
    });
    
  } catch (error) {
    console.error('Error loading books with titles:', error);
    throw error;
  }
};

// Run the script
if (require.main === module) {
  loadBooksWithTitles()
    .then(() => {
      console.log('Books with titles loaded successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to load books with titles:', error);
      process.exit(1);
    });
}

module.exports = { loadBooksWithTitles }; 