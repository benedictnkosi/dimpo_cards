const fs = require('fs');
const path = require('path');

// Read the books.json file
const booksPath = path.join(__dirname, '../assets/books.json');
const booksData = JSON.parse(fs.readFileSync(booksPath, 'utf8'));

console.log('=== BOOK TITLE DEBUG ===');
console.log(`Total books in JSON: ${booksData.books.length}`);

// Check for books with missing or null titles
let missingTitles = 0;
let emptyTitles = 0;
let validTitles = 0;

booksData.books.forEach((book, index) => {
  if (!book.hasOwnProperty('title')) {
    missingTitles++;
    console.log(`Book ${index + 1} (${book.book_id}) - MISSING title field`);
  } else if (book.title === null || book.title === undefined) {
    missingTitles++;
    console.log(`Book ${index + 1} (${book.book_id}) - title is null/undefined`);
  } else if (book.title === '') {
    emptyTitles++;
    console.log(`Book ${index + 1} (${book.book_id}) - title is empty string`);
  } else {
    validTitles++;
  }
});

console.log('\n=== SUMMARY ===');
console.log(`Valid titles: ${validTitles}`);
console.log(`Missing titles: ${missingTitles}`);
console.log(`Empty titles: ${emptyTitles}`);

// Check for duplicate book_ids and their titles
const bookIdMap = new Map();
booksData.books.forEach((book, index) => {
  if (!bookIdMap.has(book.book_id)) {
    bookIdMap.set(book.book_id, []);
  }
  bookIdMap.get(book.book_id).push({
    index: index + 1,
    chapter_number: book.chapter_number,
    title: book.title
  });
});

console.log('\n=== BOOK ID ANALYSIS ===');
console.log(`Unique book IDs: ${bookIdMap.size}`);

// Check if all chapters of the same book have the same title
bookIdMap.forEach((chapters, bookId) => {
  const titles = chapters.map(ch => ch.title);
  const uniqueTitles = [...new Set(titles)];
  
  if (uniqueTitles.length > 1) {
    console.log(`\n⚠️  Book ${bookId} has inconsistent titles:`);
    chapters.forEach(ch => {
      console.log(`  Chapter ${ch.chapter_number}: "${ch.title}"`);
    });
  } else if (uniqueTitles.length === 1 && (uniqueTitles[0] === null || uniqueTitles[0] === '')) {
    console.log(`\n❌ Book ${bookId} has no valid title`);
    chapters.forEach(ch => {
      console.log(`  Chapter ${ch.chapter_number}: "${ch.title}"`);
    });
  }
});

// Sample a few books to show their structure
console.log('\n=== SAMPLE BOOK STRUCTURE ===');
for (let i = 0; i < Math.min(3, booksData.books.length); i++) {
  const book = booksData.books[i];
  console.log(`\nBook ${i + 1}:`);
  console.log(`  book_id: ${book.book_id}`);
  console.log(`  title: "${book.title}"`);
  console.log(`  chapter_number: ${book.chapter_number}`);
  console.log(`  chapter_name: "${book.chapter_name}"`);
  console.log(`  genre: ${book.genre}`);
  console.log(`  reading_level: ${book.reading_level}`);
} 