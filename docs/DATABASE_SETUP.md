# Database Setup with expo-sqlite

This document explains how to use the SQLite database setup for the Dimpo Reads app.

## Overview

The app uses `expo-sqlite` to store books and savings data locally on the device. The database includes tables for storing books, savings jars, and savings transactions.

## Automatic Database Initialization

The database is automatically initialized when the app starts up. This process includes:

1. **Database Creation**: Creates the SQLite database file if it doesn't exist
2. **Table Creation**: Creates the necessary tables with proper schema
3. **Data Population**: Automatically populates the database with sample books and savings data if it's empty
4. **Error Handling**: Graceful error handling to prevent app crashes

The initialization happens in the background during app startup, so users don't need to manually populate the database.

## Database Schema

### book Table

```sql
CREATE TABLE book (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT NOT NULL UNIQUE,
  genre TEXT NOT NULL,
  sub_genre TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  chapter_name TEXT NOT NULL,
  content TEXT NOT NULL,
  quiz TEXT,
  images TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  reading_level TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**
- `id`: Auto-incrementing primary key
- `book_id`: Unique identifier for the book
- `genre`: The main genre of the book (e.g., "Fiction", "Non-Fiction")
- `sub_genre`: The sub-genre of the book (e.g., "Mystery", "Science Fiction")
- `chapter_number`: The chapter number
- `chapter_name`: The name of the chapter
- `content`: The text content of the chapter
- `quiz`: JSON string containing quiz questions for the chapter
- `images`: JSON string containing image data for the chapter
- `word_count`: Number of words in the chapter
- `reading_level`: The reading level (e.g., "Beginner", "Intermediate", "Advanced")
- `created`: Timestamp when the record was created
- `updated`: Timestamp when the record was last updated

### savings_jug Table

```sql
CREATE TABLE savings_jug (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0.0,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**
- `id`: Auto-incrementing primary key
- `name`: The name of the savings jar (e.g., "Emergency Fund", "Vacation Fund")
- `balance`: Current balance in the jug
- `created`: Timestamp when the jug was created
- `updated`: Timestamp when the jug was last updated

### savings_transaction Table

```sql
CREATE TABLE savings_transaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  savings_jug_id INTEGER NOT NULL,
  transaction_name TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (savings_jug_id) REFERENCES savings_jug (id)
);
```

**Columns:**
- `id`: Auto-incrementing primary key
- `savings_jug_id`: Foreign key reference to the savings_jug table
- `transaction_name`: Description of the transaction (e.g., "Monthly deposit", "Emergency expense")
- `amount`: The amount of the transaction (positive for deposits, negative for withdrawals)
- `date`: Date of the transaction
- `created`: Timestamp when the transaction was created

### question_report Table

```sql
CREATE TABLE question_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('correct', 'incorrect')),
  date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**
- `id`: Auto-incrementing primary key
- `question_id`: Identifier for the question being reported
- `outcome`: Whether the answer was correct or incorrect
- `date`: Date of the report
- `created`: Timestamp when the report was created

## Sample Data

The database comes with sample books and savings data:

### Sample Books
- Various genres including Fiction, Non-Fiction, Mystery, Science Fiction
- Different reading levels from Beginner to Advanced
- Sample content and quizzes for each chapter

### Sample Savings Jars
- Emergency Fund
- Vacation Fund
- New Car Fund
- Home Renovation
- Gift Fund

## Usage Examples

### Adding a new book

```javascript
import { insertBook } from '@/services/database';

await insertBook({
  book_id: 'unique-book-id',
  genre: 'Fiction',
  sub_genre: 'Mystery',
  chapter_number: 1,
  chapter_name: 'The Beginning',
  content: 'Once upon a time...',
  quiz: JSON.stringify(quizData),
  images: JSON.stringify(imageData),
  word_count: 1500,
  reading_level: 'Intermediate'
});
```

### Creating a new savings jar

```javascript
import { insertSavingsJug } from '@/services/database';

const jugId = await insertSavingsJug({ name: 'New Goal' });
```

### Adding money to a savings jar

```javascript
import { addMoneyToJug } from '@/services/savingsService';

await addMoneyToJug(jugId, 100, 'Monthly deposit');
```

### Getting all books

```javascript
import { getAllBooks } from '@/services/database';

const books = await getAllBooks();
```

### Getting savings statistics

```javascript
import { getSavingsStatistics } from '@/services/database';

const stats = await getSavingsStatistics();
console.log(`Total balance: $${stats.total_balance}`);
```

## Database Functions

The database service provides the following main functions:

### Book Functions
- `insertBook()` - Add a new book
- `getAllBooks()` - Get all books
- `getBooksByGenre()` - Get books by genre
- `getBooksByReadingLevel()` - Get books by reading level
- `getBookById()` - Get a specific book
- `updateBook()` - Update book information
- `deleteBook()` - Delete a book
- `getBookStatistics()` - Get book statistics

### Savings Functions
- `insertSavingsJug()` - Create a new savings jar
- `getAllSavingsJugs()` - Get all savings jars
- `getSavingsJugById()` - Get a specific savings jar
- `updateSavingsJug()` - Update jug information
- `updateSavingsJugBalance()` - Update jug balance
- `deleteSavingsJug()` - Delete a savings jar
- `insertSavingsTransaction()` - Add a transaction
- `getSavingsTransactionsByJugId()` - Get transactions for a jug
- `getAllSavingsTransactions()` - Get all transactions
- `getSavingsJugWithTransactions()` - Get jug with its transactions
- `getSavingsStatistics()` - Get savings statistics
- `clearAllSavingsData()` - Clear all savings data

### Question Report Functions
- `insertQuestionReport()` - Add a question report
- `getQuestionReports()` - Get all question reports
- `getQuestionReportsByQuestionId()` - Get reports for a specific question
- `deleteQuestionReport()` - Delete a question report
- `clearAllQuestionReports()` - Clear all question reports

## Error Handling

All database functions include proper error handling and will throw descriptive errors if something goes wrong. The app gracefully handles these errors and displays appropriate messages to users.

## Performance

The database includes indexes on frequently queried columns to ensure good performance:
- Book genre, sub-genre, reading level, and chapter number
- Savings jug name
- Savings transaction jug ID and date
- Question report question ID, date, and outcome 