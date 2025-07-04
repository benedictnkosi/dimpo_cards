import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

let db: SQLite.SQLiteDatabase | null = null;

// Initialize database
export const initDatabase = () => {
  if (db) return db;

  try {
    db = SQLite.openDatabaseSync('dimpo_reads.db');
    console.log('Database initialized successfully');
    createTables();
    return db;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Create tables
const createTables = () => {
  if (!db) return;

  try {
    // Migration: Add emoji column if it doesn't exist
    db.execSync(`ALTER TABLE savings_jug ADD COLUMN emoji TEXT`);
  } catch (e) {
    // Ignore error if column already exists
  }

  // Migration: Fix book table schema to allow multiple chapters per book
  try {
    // Check if the old unique constraint exists on book_id
    const tableInfo = db.getAllSync<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>("PRAGMA table_info(book)");
    const bookIdColumn = tableInfo.find(col => col.name === 'book_id');
    
    if (bookIdColumn) {
      // Check if there's a unique constraint by looking at the index
      const indexes = db.getAllSync<{
        name: string;
        type: string;
        tbl_name: string;
        sql: string;
      }>("PRAGMA index_list(book)");
      
      const hasUniqueBookIdIndex = indexes.some(index => 
        index.sql && index.sql.includes('UNIQUE') && index.sql.includes('book_id')
      );
      
      if (hasUniqueBookIdIndex) {
        // This means book_id has a unique constraint, we need to recreate the table
        console.log('Migrating book table schema to support multiple chapters per book...');
        
        // Create a temporary table with the new schema
        db.execSync(`
          CREATE TABLE book_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id TEXT NOT NULL,
            title TEXT,
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
            updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(book_id, chapter_number)
          );
        `);
        
        // Copy data from old table to new table
        db.execSync(`
          INSERT INTO book_new (id, book_id, genre, sub_genre, chapter_number, chapter_name, content, quiz, images, word_count, reading_level, created, updated)
          SELECT id, book_id, genre, sub_genre, chapter_number, chapter_name, content, quiz, images, word_count, reading_level, created, updated
          FROM book;
        `);
        
        // Drop old table and rename new table
        db.execSync('DROP TABLE book');
        db.execSync('ALTER TABLE book_new RENAME TO book');
        
        console.log('Book table migration completed successfully');
      }
    }
  } catch (e) {
    console.log('Book table migration not needed or failed:', e);
  }

  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS question_report (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('correct', 'incorrect')),
        date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS book (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id TEXT NOT NULL,
        title TEXT,
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
        updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(book_id, chapter_number)
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS savings_jug (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        balance REAL NOT NULL DEFAULT 0.0,
        emoji TEXT,
        profile_id TEXT,
        created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS savings_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        savings_jug_id INTEGER NOT NULL,
        transaction_name TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (savings_jug_id) REFERENCES savings_jug (id)
      );
    `);

    // Migration: Add profile_id to learner_reading if it doesn't exist
    try {
      db.execSync('ALTER TABLE learner_reading ADD COLUMN profile_id TEXT');
    } catch (e) {}
    // Migration: Add profile_id to chapter_completion if it doesn't exist
    try {
      db.execSync('ALTER TABLE chapter_completion ADD COLUMN profile_id TEXT');
    } catch (e) {}

    db.execSync(`
      CREATE TABLE IF NOT EXISTS learner_reading (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id TEXT NOT NULL,
        chapter_number INTEGER NOT NULL,
        chapter_name TEXT NOT NULL,
        reading_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        profile_id TEXT,
        FOREIGN KEY (book_id) REFERENCES book (book_id)
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS chapter_completion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        learner_uid TEXT NOT NULL,
        chapter_id INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        score INTEGER NOT NULL,
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        profile_id TEXT,
        FOREIGN KEY (chapter_id) REFERENCES book (id)
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        reading_level TEXT NOT NULL DEFAULT 'Explorer',
        avatar TEXT,
        created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: Add reading_level to profiles if it doesn't exist
    try {
      db.execSync('ALTER TABLE profiles ADD COLUMN reading_level TEXT DEFAULT "Explorer"');
    } catch (e) {}

    // Migration: Add avatar to profiles if it doesn't exist
    try {
      db.execSync('ALTER TABLE profiles ADD COLUMN avatar TEXT');
    } catch (e) {}

    // Create indexes for better performance
    db.execSync('CREATE INDEX IF NOT EXISTS idx_question_report_question_id ON question_report (question_id);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_question_report_date ON question_report (date);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_question_report_outcome ON question_report (outcome);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_book_genre ON book (genre);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_book_sub_genre ON book (sub_genre);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_book_reading_level ON book (reading_level);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_book_chapter_number ON book (chapter_number);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_savings_jug_name ON savings_jug (name);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_savings_transaction_jug_id ON savings_transaction (savings_jug_id);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_savings_transaction_date ON savings_transaction (date);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_chapter_completion_learner_uid ON chapter_completion (learner_uid);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_chapter_completion_chapter_id ON chapter_completion (chapter_id);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_chapter_completion_completed_at ON chapter_completion (completed_at);');

    console.log('Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
};

// Question Report Functions
export const insertQuestionReport = (questionId: string, outcome: 'correct' | 'incorrect'): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync('INSERT INTO question_report (question_id, outcome) VALUES (?, ?)', [questionId, outcome]);
      console.log('Question report inserted successfully');
      resolve();
    } catch (error) {
      console.error('Error inserting question report:', error);
      reject(error);
    }
  });
};

export const getQuestionReports = (): Promise<Array<{ id: number; question_id: string; outcome: string; date: string; created: string }>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getAllSync<{ id: number; question_id: string; outcome: string; date: string; created: string }>(
        'SELECT * FROM question_report ORDER BY date DESC'
      );
      resolve(result);
    } catch (error) {
      console.error('Error fetching question reports:', error);
      reject(error);
    }
  });
};

export const getQuestionReportsByQuestionId = (questionId: string): Promise<Array<{ id: number; question_id: string; outcome: string; date: string; created: string }>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getAllSync<{ id: number; question_id: string; outcome: string; date: string; created: string }>(
        'SELECT * FROM question_report WHERE question_id = ? ORDER BY date DESC',
        [questionId]
      );
      resolve(result);
    } catch (error) {
      console.error('Error fetching question reports by question ID:', error);
      reject(error);
    }
  });
};

export const deleteQuestionReport = (id: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync('DELETE FROM question_report WHERE id = ?', [id]);
      console.log('Question report deleted successfully');
      resolve();
    } catch (error) {
      console.error('Error deleting question report:', error);
      reject(error);
    }
  });
};

export const clearAllQuestionReports = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync('DELETE FROM question_report');
      console.log('All question reports cleared successfully');
      resolve();
    } catch (error) {
      console.error('Error clearing question reports:', error);
      reject(error);
    }
  });
};

// Book Functions
export const insertBook = (bookData: {
  book_id: string;
  title?: string;
  genre: string;
  sub_genre: string;
  chapter_number: number;
  chapter_name: string;
  content: string;
  quiz?: string;
  images?: string;
  word_count: number;
  reading_level: string;
}): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync(`
        INSERT OR REPLACE INTO book (
          book_id, title, genre, sub_genre, chapter_number, chapter_name, content, 
          quiz, images, word_count, reading_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        bookData.book_id,
        bookData.title || null,
        bookData.genre,
        bookData.sub_genre,
        bookData.chapter_number,
        bookData.chapter_name,
        bookData.content,
        bookData.quiz || null,
        bookData.images || null,
        bookData.word_count,
        bookData.reading_level
      ]);
      resolve();
    } catch (error) {
      console.error('Error inserting book:', error);
      reject(error);
    }
  });
};

export const getAllBooks = (): Promise<Array<{
  id: number;
  book_id: string;
  title: string | null;
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
}>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getAllSync<{
        id: number;
        book_id: string;
        title: string | null;
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
      }>(
        'SELECT * FROM book ORDER BY genre, sub_genre, chapter_number'
      );
      resolve(result);
    } catch (error) {
      console.error('Error fetching books:', error);
      reject(error);
    }
  });
};

export const getBooksByGenre = (genre: string): Promise<Array<{
  id: number;
  book_id: string;
  title: string | null;
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
}>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getAllSync<{
        id: number;
        book_id: string;
        title: string | null;
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
      }>(
        'SELECT * FROM book WHERE genre = ? ORDER BY sub_genre, chapter_number',
        [genre]
      );
      resolve(result);
    } catch (error) {
      console.error('Error fetching books by genre:', error);
      reject(error);
    }
  });
};

export const getBooksByReadingLevel = (readingLevel: string): Promise<Array<{
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
}>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getAllSync<{
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
      }>(
        'SELECT * FROM book WHERE reading_level = ? ORDER BY genre, sub_genre, chapter_number',
        [readingLevel]
      );
      resolve(result);
    } catch (error) {
      console.error('Error fetching books by reading level:', error);
      reject(error);
    }
  });
};

export const getBookById = (bookId: string): Promise<{
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
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getFirstSync<{
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
      }>(
        'SELECT * FROM book WHERE book_id = ?',
        [bookId]
      );
      resolve(result || null);
    } catch (error) {
      console.error('Error fetching book by ID:', error);
      reject(error);
    }
  });
};

export const updateBook = (bookId: string, bookData: {
  genre?: string;
  sub_genre?: string;
  chapter_number?: number;
  chapter_name?: string;
  content?: string;
  quiz?: string;
  images?: string;
  word_count?: number;
  reading_level?: string;
}): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (bookData.genre !== undefined) {
        updates.push('genre = ?');
        values.push(bookData.genre);
      }
      if (bookData.sub_genre !== undefined) {
        updates.push('sub_genre = ?');
        values.push(bookData.sub_genre);
      }
      if (bookData.chapter_number !== undefined) {
        updates.push('chapter_number = ?');
        values.push(bookData.chapter_number);
      }
      if (bookData.chapter_name !== undefined) {
        updates.push('chapter_name = ?');
        values.push(bookData.chapter_name);
      }
      if (bookData.content !== undefined) {
        updates.push('content = ?');
        values.push(bookData.content);
      }
      if (bookData.quiz !== undefined) {
        updates.push('quiz = ?');
        values.push(bookData.quiz);
      }
      if (bookData.images !== undefined) {
        updates.push('images = ?');
        values.push(bookData.images);
      }
      if (bookData.word_count !== undefined) {
        updates.push('word_count = ?');
        values.push(bookData.word_count);
      }
      if (bookData.reading_level !== undefined) {
        updates.push('reading_level = ?');
        values.push(bookData.reading_level);
      }

      updates.push('updated = CURRENT_TIMESTAMP');
      values.push(bookId);

      const query = `UPDATE book SET ${updates.join(', ')} WHERE book_id = ?`;
      db.runSync(query, values);
      console.log('Book updated successfully');
      resolve();
    } catch (error) {
      console.error('Error updating book:', error);
      reject(error);
    }
  });
};

export const deleteBook = (bookId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync('DELETE FROM book WHERE book_id = ?', [bookId]);
      console.log('Book deleted successfully');
      resolve();
    } catch (error) {
      console.error('Error deleting book:', error);
      reject(error);
    }
  });
};

export const getBookStatistics = (): Promise<{
  total_books: number;
  total_chapters: number;
  total_word_count: number;
  genres_count: number;
  reading_levels_count: number;
  average_word_count: number;
}> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getFirstSync<{
        total_books: number;
        total_chapters: number;
        total_word_count: number;
        genres_count: number;
        reading_levels_count: number;
        average_word_count: number;
      }>(
        `SELECT 
          COUNT(DISTINCT book_id) as total_books,
          COUNT(*) as total_chapters,
          SUM(word_count) as total_word_count,
          COUNT(DISTINCT genre) as genres_count,
          COUNT(DISTINCT reading_level) as reading_levels_count,
          ROUND(AVG(word_count), 0) as average_word_count
        FROM book`
      );
      resolve(result || {
        total_books: 0,
        total_chapters: 0,
        total_word_count: 0,
        genres_count: 0,
        reading_levels_count: 0,
        average_word_count: 0
      });
    } catch (error) {
      console.error('Error fetching book statistics:', error);
      reject(error);
    }
  });
};

// Savings Functions
export const insertSavingsJug = (jugData: { name: string; emoji: string; profile_id: string }): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.runSync('INSERT INTO savings_jug (name, emoji, profile_id) VALUES (?, ?, ?)', [jugData.name, jugData.emoji, jugData.profile_id]);
      resolve(result.lastInsertRowId);
    } catch (error) {
      console.error('Error inserting savings jar:', error);
      reject(error);
    }
  });
};

export const getAllSavingsJugs = (profile_id?: string): Promise<Array<{
  id: number;
  name: string;
  balance: number;
  emoji: string;
  profile_id: string;
  created: string;
  updated: string;
}>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let query = 'SELECT * FROM savings_jug';
      const params: any[] = [];
      if (profile_id) {
        query += ' WHERE profile_id = ?';
        params.push(profile_id);
      }
      query += ' ORDER BY created DESC';
      
      const result = db.getAllSync<{
        id: number;
        name: string;
        balance: number;
        emoji: string;
        profile_id: string;
        created: string;
        updated: string;
      }>(query, params);
      
      resolve(result);
    } catch (error) {
      console.error('Error fetching savings jars:', error);
      reject(error);
    }
  });
};

export const getSavingsJugById = (id: number, profile_id?: string): Promise<{
  id: number;
  name: string;
  balance: number;
  emoji: string;
  profile_id: string;
  created: string;
  updated: string;
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let query = 'SELECT * FROM savings_jug WHERE id = ?';
      const params: any[] = [id];
      if (profile_id) {
        query += ' AND profile_id = ?';
        params.push(profile_id);
      }
      const result = db.getFirstSync<{
        id: number;
        name: string;
        balance: number;
        emoji: string;
        profile_id: string;
        created: string;
        updated: string;
      }>(query, params);
      resolve(result || null);
    } catch (error) {
      console.error('Error fetching savings jar by ID:', error);
      reject(error);
    }
  });
};

export const updateSavingsJug = (id: number, jugData: { name?: string; balance?: number }): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (jugData.name !== undefined) {
        updates.push('name = ?');
        values.push(jugData.name);
      }
      if (jugData.balance !== undefined) {
        updates.push('balance = ?');
        values.push(jugData.balance);
      }

      updates.push('updated = CURRENT_TIMESTAMP');
      values.push(id);

      const query = `UPDATE savings_jug SET ${updates.join(', ')} WHERE id = ?`;
      db.runSync(query, values);
      console.log('Savings jug updated successfully');
      resolve();
    } catch (error) {
      console.error('Error updating savings jar:', error);
      reject(error);
    }
  });
};

export const deleteSavingsJug = (id: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // First delete all transactions for this jug
      db.runSync('DELETE FROM savings_transaction WHERE savings_jug_id = ?', [id]);
      // Then delete the jug
      db.runSync('DELETE FROM savings_jug WHERE id = ?', [id]);
      console.log('Savings jug deleted successfully');
      resolve();
    } catch (error) {
      console.error('Error deleting savings jar:', error);
      reject(error);
    }
  });
};

export const insertSavingsTransaction = (transactionData: {
  savings_jug_id: number;
  transaction_name: string;
  amount: number;
}): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync(
        'INSERT INTO savings_transaction (savings_jug_id, transaction_name, amount) VALUES (?, ?, ?)',
        [transactionData.savings_jug_id, transactionData.transaction_name, transactionData.amount]
      );
      console.log('Savings transaction inserted successfully');
      resolve();
    } catch (error) {
      console.error('Error inserting savings transaction:', error);
      reject(error);
    }
  });
};

export const getSavingsTransactionsByJugId = (jugId: number): Promise<Array<{
  id: number;
  savings_jug_id: number;
  transaction_name: string;
  amount: number;
  date: string;
  created: string;
}>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getAllSync<{
        id: number;
        savings_jug_id: number;
        transaction_name: string;
        amount: number;
        date: string;
        created: string;
      }>(
        'SELECT * FROM savings_transaction WHERE savings_jug_id = ? ORDER BY date DESC',
        [jugId]
      );
      resolve(result);
    } catch (error) {
      console.error('Error fetching savings transactions:', error);
      reject(error);
    }
  });
};

export const getSavingsStatistics = (profile_id?: string): Promise<{
  total_jugs: number;
  total_balance: number;
  total_transactions: number;
  average_balance: number;
}> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let query = `
        SELECT 
          COUNT(*) as total_jugs,
          SUM(balance) as total_balance,
          (SELECT COUNT(*) FROM savings_transaction st 
           JOIN savings_jug sj ON st.savings_jug_id = sj.id 
           WHERE 1=1`;
      let params: any[] = [];
      
      if (profile_id) {
        query += ' AND sj.profile_id = ?';
        params.push(profile_id);
      }
      
      query += `) as total_transactions,
          ROUND(AVG(balance), 2) as average_balance
        FROM savings_jug sj WHERE 1=1`;
      
      if (profile_id) {
        query += ' AND sj.profile_id = ?';
        params.push(profile_id);
      }
      
      const result = db.getFirstSync<{
        total_jugs: number;
        total_balance: number;
        total_transactions: number;
        average_balance: number;
      }>(query, params);
      
      const finalResult = result || {
        total_jugs: 0,
        total_balance: 0,
        total_transactions: 0,
        average_balance: 0
      };
      
      resolve(finalResult);
    } catch (error) {
      console.error('Error fetching savings statistics:', error);
      reject(error);
    }
  });
};

// Update savings jar balance
export const updateSavingsJugBalance = (id: number, balance: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync('UPDATE savings_jug SET balance = ?, updated = CURRENT_TIMESTAMP WHERE id = ?', [balance, id]);
      console.log('Savings jug balance updated successfully');
      resolve();
    } catch (error) {
      console.error('Error updating savings jar balance:', error);
      reject(error);
    }
  });
};

// Get all savings transactions
export const getAllSavingsTransactions = (profile_id?: string): Promise<Array<{
  id: number;
  savings_jug_id: number;
  transaction_name: string;
  amount: number;
  date: string;
  created: string;
}>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let query = `
        SELECT st.* 
        FROM savings_transaction st
        JOIN savings_jug sj ON st.savings_jug_id = sj.id
        WHERE 1=1`;
      let params: any[] = [];
      
      if (profile_id) {
        query += ' AND sj.profile_id = ?';
        params.push(profile_id);
      }
      
      query += ' ORDER BY st.date DESC';
      
      const result = db.getAllSync<{
        id: number;
        savings_jug_id: number;
        transaction_name: string;
        amount: number;
        date: string;
        created: string;
      }>(query, params);
      resolve(result);
    } catch (error) {
      console.error('Error fetching all savings transactions:', error);
      reject(error);
    }
  });
};

// Get savings jar with transactions
export const getSavingsJugWithTransactions = (jugId: number): Promise<{
  jug: {
    id: number;
    name: string;
    balance: number;
    created: string;
    updated: string;
  };
  transactions: Array<{
    id: number;
    savings_jug_id: number;
    transaction_name: string;
    amount: number;
    date: string;
    created: string;
  }>;
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const jug = db.getFirstSync<{
        id: number;
        name: string;
        balance: number;
        created: string;
        updated: string;
      }>(
        'SELECT * FROM savings_jug WHERE id = ?',
        [jugId]
      );

      if (!jug) {
        resolve(null);
        return;
      }

      const transactions = db.getAllSync<{
        id: number;
        savings_jug_id: number;
        transaction_name: string;
        amount: number;
        date: string;
        created: string;
      }>(
        'SELECT * FROM savings_transaction WHERE savings_jug_id = ? ORDER BY date DESC',
        [jugId]
      );

      resolve({
        jug,
        transactions
      });
    } catch (error) {
      console.error('Error fetching savings jar with transactions:', error);
      reject(error);
    }
  });
};

// Clear all savings data
export const clearAllSavingsData = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // Delete all transactions first (due to foreign key constraint)
      db.runSync('DELETE FROM savings_transaction');
      // Then delete all jugs
      db.runSync('DELETE FROM savings_jug');
      console.log('All savings data cleared successfully');
      resolve();
    } catch (error) {
      console.error('Error clearing savings data:', error);
      reject(error);
    }
  });
};

// Learner Reading Functions
export const getCurrentReading = (profileId?: string): Promise<{
  id: number;
  book_id: string;
  chapter_number: number;
  chapter_name: string;
  reading_date: string;
  created: string;
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let query = 'SELECT * FROM learner_reading';
      let params: string[] = [];
      
      if (profileId) {
        query += ' WHERE profile_id = ?';
        params.push(profileId);
      }
      
      query += ' ORDER BY reading_date DESC LIMIT 1';
      
      const result = db.getFirstSync<{
        id: number;
        book_id: string;
        chapter_number: number;
        chapter_name: string;
        reading_date: string;
        created: string;
      }>(query, params);
      
      resolve(result || null);
    } catch (error) {
      console.error('Error fetching current reading:', error);
      reject(error);
    }
  });
};

export const startReadingBook = (bookData: {
  book_id: string;
  chapter_number: number;
  chapter_name: string;
  profile_id?: string;
}): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // First, clear any existing reading progress for this profile
      if (bookData.profile_id) {
        db.runSync('DELETE FROM learner_reading WHERE profile_id = ?', [bookData.profile_id]);
      } else {
        // If no profile_id, clear all (backward compatibility)
        db.runSync('DELETE FROM learner_reading WHERE profile_id IS NULL');
      }
      
      // Start reading the new book
      if (bookData.profile_id) {
        db.runSync(
          'INSERT INTO learner_reading (book_id, chapter_number, chapter_name, profile_id) VALUES (?, ?, ?, ?)',
          [bookData.book_id, bookData.chapter_number, bookData.chapter_name, bookData.profile_id]
        );
      } else {
        db.runSync(
          'INSERT INTO learner_reading (book_id, chapter_number, chapter_name) VALUES (?, ?, ?)',
          [bookData.book_id, bookData.chapter_number, bookData.chapter_name]
        );
      }
      console.log(`Started reading book successfully for profile ${bookData.profile_id || 'global'}`);
      resolve();
    } catch (error) {
      console.error('Error starting reading book:', error);
      reject(error);
    }
  });
};

export const updateReadingProgress = (bookData: {
  book_id: string;
  chapter_number: number;
  chapter_name: string;
  profile_id?: string;
}): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let whereClause = 'WHERE book_id = ?';
      let params = [bookData.book_id];
      
      if (bookData.profile_id) {
        whereClause += ' AND profile_id = ?';
        params.push(bookData.profile_id);
      } else {
        whereClause += ' AND profile_id IS NULL';
      }
      
      db.runSync(
        `UPDATE learner_reading SET chapter_number = ?, chapter_name = ?, reading_date = CURRENT_TIMESTAMP ${whereClause}`,
        [bookData.chapter_number, bookData.chapter_name, ...params]
      );
      
      resolve();
    } catch (error) {
      console.error('Error updating reading progress:', error);
      reject(error);
    }
  });
};

export const getRandomBook = (): Promise<{
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
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getFirstSync<{
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
      }>(
        'SELECT * FROM book ORDER BY RANDOM() LIMIT 1'
      );
      resolve(result || null);
    } catch (error) {
      console.error('Error fetching random book:', error);
      reject(error);
    }
  });
};

export const getRandomBookByReadingLevel = (readingLevel: string): Promise<{
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
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getFirstSync<{
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
      }>(
        'SELECT * FROM book WHERE reading_level = ? ORDER BY RANDOM() LIMIT 1',
        [readingLevel]
      );
      resolve(result || null);
    } catch (error) {
      console.error('Error fetching random book by reading level:', error);
      reject(error);
    }
  });
};

export const getRandomUncompletedBook = (learnerUid: string, profileId?: string): Promise<{
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
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let query = `SELECT b.* FROM book b
                   WHERE b.id NOT IN (
                     SELECT cc.chapter_id 
                     FROM chapter_completion cc 
                     WHERE cc.learner_uid = ? AND cc.score >= 80`;
      const params: any[] = [learnerUid];
      
      if (profileId) {
        query += ' AND cc.profile_id = ?';
        params.push(profileId);
      }
      
      query += ` )
                   ORDER BY RANDOM() 
                   LIMIT 1`;
      
      // Get a random book that the user hasn't completed with a score of 80+
      const result = db.getFirstSync<{
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
      }>(query, params);
      resolve(result || null);
    } catch (error) {
      console.error('Error fetching random uncompleted book:', error);
      reject(error);
    }
  });
};

export const getRandomUncompletedBookByReadingLevel = (learnerUid: string, readingLevel: string, profileId?: string): Promise<{
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
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let query = `SELECT b.* FROM book b
                   WHERE b.reading_level = ? 
                   AND b.chapter_number = 1
                   AND b.id NOT IN (
                     SELECT cc.chapter_id 
                     FROM chapter_completion cc 
                     WHERE cc.learner_uid = ? AND cc.score >= 80`;
      const params: any[] = [readingLevel, learnerUid];
      
      if (profileId) {
        query += ' AND cc.profile_id = ?';
        params.push(profileId);
      }
      
      query += ` )`;
      
      // Get a random book at the specified reading level that the user hasn't completed with a score of 80+, but only chapter 1
      query += ' ORDER BY RANDOM() LIMIT 1';
      const result = db.getFirstSync<{
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
      }>(query, params);
      resolve(result || null);
    } catch (error) {
      console.error('Error fetching random uncompleted book by reading level:', error);
      reject(error);
    }
  });
};

export const finishReadingBook = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync('DELETE FROM learner_reading');
      console.log('Finished reading book successfully');
      resolve();
    } catch (error) {
      console.error('Error finishing reading book:', error);
      reject(error);
    }
  });
};

export const clearLearnerReadingTable = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync('DELETE FROM learner_reading');
      console.log('Learner reading table cleared successfully');
      resolve();
    } catch (error) {
      console.error('Error clearing learner reading table:', error);
      reject(error);
    }
  });
};

export const getBookByChapterId = (chapterId: number): Promise<{
  id: number;
  book_id: string;
  title: string | null;
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
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getFirstSync<{
        id: number;
        book_id: string;
        title: string | null;
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
      }>(
        'SELECT * FROM book WHERE id = ?',
        [chapterId]
      );
      resolve(result || null);
    } catch (error) {
      console.error('Error fetching book by chapter ID:', error);
      reject(error);
    }
  });
};

export const getBookByBookIdAndChapterNumber = (bookId: string, chapterNumber: number): Promise<{
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
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getFirstSync<{
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
      }>(
        'SELECT * FROM book WHERE book_id = ? AND chapter_number = ?',
        [bookId, chapterNumber]
      );
      
      resolve(result || null);
    } catch (error) {
      console.error('Error fetching book by book ID and chapter number:', error);
      reject(error);
    }
  });
};

export const insertChapterCompletion = (completionData: {
  learnerUid: string;
  chapterId: number;
  readingSpeed: number;
  score: number;
  profile_id: string;
}): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync(
        'INSERT INTO chapter_completion (learner_uid, chapter_id, duration, score, profile_id) VALUES (?, ?, ?, ?, ?)',
        [completionData.learnerUid, completionData.chapterId, completionData.readingSpeed, completionData.score, completionData.profile_id]
      );
      resolve();
    } catch (error) {
      console.error('Error recording chapter completion:', error);
      reject(error);
    }
  });
};

export const getChapterCompletionStats = (learnerUid: string, profileId?: string): Promise<{
  totalChaptersCompleted: number;
  averageScore: number;
  totalReadingTime: number;
  averageReadingTime: number;
}> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let query = `
        SELECT 
          COUNT(*) as totalChaptersCompleted,
          AVG(score) as averageScore,
          SUM(duration) as totalReadingTime,
          AVG(duration) as averageReadingTime
        FROM chapter_completion 
        WHERE learner_uid = ?`;
      const params: any[] = [learnerUid];
      if (profileId) {
        query += ' AND profile_id = ?';
        params.push(profileId);
      }
      query += ' ORDER BY cc.completed_at DESC';
      const result = db.getFirstSync<{
        totalChaptersCompleted: number;
        averageScore: number;
        totalReadingTime: number;
        averageReadingTime: number;
      }>(query, params);
      resolve(result || {
        totalChaptersCompleted: 0,
        averageScore: 0,
        totalReadingTime: 0,
        averageReadingTime: 0
      });
    } catch (error) {
      console.error('Error fetching chapter completion stats:', error);
      reject(error);
    }
  });
};

export const getAllCompletedChapters = (): Promise<Array<{
  id: number;
  learner_uid: string;
  chapter_id: number;
  duration: number;
  score: number;
  completed_at: string;
  created: string;
  book_id: string;
  genre: string;
  sub_genre: string;
  chapter_number: number;
  chapter_name: string;
  reading_level: string;
}>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getAllSync<{
        id: number;
        learner_uid: string;
        chapter_id: number;
        duration: number;
        score: number;
        completed_at: string;
        created: string;
        book_id: string;
        genre: string;
        sub_genre: string;
        chapter_number: number;
        chapter_name: string;
        reading_level: string;
      }>(
        `SELECT 
          cc.id,
          cc.learner_uid,
          cc.chapter_id,
          cc.duration,
          cc.score,
          cc.completed_at,
          cc.created,
          b.book_id,
          b.genre,
          b.sub_genre,
          b.chapter_number,
          b.chapter_name,
          b.reading_level
        FROM chapter_completion cc
        JOIN book b ON cc.chapter_id = b.id
        ORDER BY cc.completed_at DESC`
      );
      resolve(result || []);
    } catch (error) {
      console.error('Error fetching completed chapters:', error);
      reject(error);
    }
  });
};

export const clearAllCompletedChapters = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync('DELETE FROM chapter_completion');
      console.log('All completed chapters cleared successfully');
      resolve();
    } catch (error) {
      console.error('Error clearing completed chapters:', error);
      reject(error);
    }
  });
};

export const clearAllBooks = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      db.runSync('DELETE FROM book');
      console.log('All books cleared successfully');
      resolve();
    } catch (error) {
      console.error('Error clearing books:', error);
      reject(error);
    }
  });
};

export const isChapterCompleted = (chapterId: number): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getFirstSync<{ count: number }>(
        'SELECT COUNT(*) as count FROM chapter_completion WHERE chapter_id = ?',
        [chapterId]
      );
      resolve((result?.count || 0) > 0);
    } catch (error) {
      console.error('Error checking if chapter is completed:', error);
      reject(error);
    }
  });
};

export const hasUserCompletedChapter = (learnerUid: string, chapterId: number): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getFirstSync<{ count: number }>(
        'SELECT COUNT(*) as count FROM chapter_completion WHERE learner_uid = ? AND chapter_id = ?',
        [learnerUid, chapterId]
      );
      resolve((result?.count || 0) > 0);
    } catch (error) {
      console.error('Error checking if user has completed chapter:', error);
      reject(error);
    }
  });
};

export const hasUserCompletedChapterWithScore = (learnerUid: string, chapterId: number, minScore: number = 80, profileId?: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let query = 'SELECT COUNT(*) as count FROM chapter_completion WHERE learner_uid = ? AND chapter_id = ? AND score >= ?';
      const params: any[] = [learnerUid, chapterId, minScore];
      
      if (profileId) {
        query += ' AND profile_id = ?';
        params.push(profileId);
      }
      
      const result = db.getFirstSync<{ count: number }>(query, params);
      resolve((result?.count || 0) > 0);
    } catch (error) {
      console.error('Error checking if user has completed chapter with score:', error);
      reject(error);
    }
  });
};

export const getNextChapter = (bookId: string, currentChapterNumber: number, learnerUid?: string, profileId?: string): Promise<{
  id: number;
  book_id: string;
  title: string | null;
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
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // First, get the book title from the current book
      const currentBook = db.getFirstSync<{
        id: number;
        book_id: string;
        title: string | null;
        chapter_number: number;
        chapter_name: string;
        reading_level: string;
      }>(
        'SELECT id, book_id, title, chapter_number, chapter_name, reading_level FROM book WHERE book_id = ? AND chapter_number = ?',
        [bookId, currentChapterNumber]
      );
      
      if (!currentBook) {
        resolve(null);
        return;
      }
      
      // Get all chapters for the same book title across all reading levels
      const allChaptersForBook = db.getAllSync<{
        id: number;
        book_id: string;
        title: string | null;
        chapter_number: number;
        chapter_name: string;
        reading_level: string;
      }>(
        'SELECT id, book_id, title, chapter_number, chapter_name, reading_level FROM book WHERE title = ? ORDER BY reading_level, chapter_number ASC',
        [currentBook.title]
      );
      
      // Get all next chapters (any chapter number greater than current)
      let nextChapters = allChaptersForBook.filter(ch => ch.chapter_number > currentChapterNumber);
      
      // If learnerUid is provided, exclude chapters that the user has already completed
      if (learnerUid && nextChapters.length > 0) {
        const completedChapterIds = db.getAllSync<{ chapter_id: number }>(
          'SELECT chapter_id FROM chapter_completion WHERE learner_uid = ? AND score >= 80',
          [learnerUid]
        ).map(row => row.chapter_id);
        
        if (profileId) {
          const profileCompletedChapterIds = db.getAllSync<{ chapter_id: number }>(
            'SELECT chapter_id FROM chapter_completion WHERE profile_id = ? AND score >= 80',
            [profileId]
          ).map(row => row.chapter_id);
          
          // Use profile-specific completions if available, otherwise fall back to learner completions
          const relevantCompletedIds = profileCompletedChapterIds.length > 0 ? profileCompletedChapterIds : completedChapterIds;
          nextChapters = nextChapters.filter(ch => !relevantCompletedIds.includes(ch.id));
        } else {
          nextChapters = nextChapters.filter(ch => !completedChapterIds.includes(ch.id));
        }
      }
      
      // Get the next chapter (first one after current chapter number)
      const nextChapter = nextChapters.length > 0 ? nextChapters[0] : null;
      
      if (nextChapter) {
        // Get the full book details
        const fullBookDetails = db.getFirstSync<{
          id: number;
          book_id: string;
          title: string | null;
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
        }>(
          'SELECT * FROM book WHERE id = ?',
          [nextChapter.id]
        );
        
        resolve(fullBookDetails || null);
      } else {
        resolve(null);
      }
    } catch (error) {
      console.error('Error fetching next chapter:', error);
      reject(error);
    }
  });
};

export const getNextChapterByReadingLevel = (bookId: string, currentChapterNumber: number, readingLevel: string, learnerUid?: string, profileId?: string): Promise<{
  id: number;
  book_id: string;
  title: string | null;
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
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // First, get the book title from the current book
      const currentBook = db.getFirstSync<{
        id: number;
        book_id: string;
        title: string | null;
        chapter_number: number;
        chapter_name: string;
        reading_level: string;
      }>(
        'SELECT id, book_id, title, chapter_number, chapter_name, reading_level FROM book WHERE book_id = ? AND chapter_number = ?',
        [bookId, currentChapterNumber]
      );
      
      if (!currentBook) {
        resolve(null);
        return;
      }
      
      // Get all chapters for the same book title across all reading levels
      const allChaptersForBook = db.getAllSync<{
        id: number;
        book_id: string;
        title: string | null;
        chapter_number: number;
        chapter_name: string;
        reading_level: string;
      }>(
        'SELECT id, book_id, title, chapter_number, chapter_name, reading_level FROM book WHERE title = ? ORDER BY reading_level, chapter_number ASC',
        [currentBook.title]
      );
      
      // Filter chapters by reading level and chapter number
      const chaptersAtLevel = allChaptersForBook.filter(ch => 
        ch.reading_level === readingLevel && 
        ch.chapter_number > currentChapterNumber
      );
      
      // If no chapters found at the specified reading level, try to find any next chapter
      let nextChapters = chaptersAtLevel;
      if (nextChapters.length === 0) {
        nextChapters = allChaptersForBook.filter(ch => ch.chapter_number > currentChapterNumber);
      }
      
      // If learnerUid is provided, exclude chapters that the user has already completed
      if (learnerUid && nextChapters.length > 0) {
        const completedChapterIds = db.getAllSync<{ chapter_id: number }>(
          'SELECT chapter_id FROM chapter_completion WHERE learner_uid = ? AND score >= 80',
          [learnerUid]
        ).map(row => row.chapter_id);
        
        if (profileId) {
          const profileCompletedChapterIds = db.getAllSync<{ chapter_id: number }>(
            'SELECT chapter_id FROM chapter_completion WHERE profile_id = ? AND score >= 80',
            [profileId]
          ).map(row => row.chapter_id);
          
          // Use profile-specific completions if available, otherwise fall back to learner completions
          const relevantCompletedIds = profileCompletedChapterIds.length > 0 ? profileCompletedChapterIds : completedChapterIds;
          nextChapters = nextChapters.filter(ch => !relevantCompletedIds.includes(ch.id));
        } else {
          nextChapters = nextChapters.filter(ch => !completedChapterIds.includes(ch.id));
        }
      }
      
      // Get the next chapter (first one after current chapter number)
      const nextChapter = nextChapters.length > 0 ? nextChapters[0] : null;
      
      if (nextChapter) {
        // Get the full book details
        const fullBookDetails = db.getFirstSync<{
          id: number;
          book_id: string;
          title: string | null;
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
        }>(
          'SELECT * FROM book WHERE id = ?',
          [nextChapter.id]
        );
        
        resolve(fullBookDetails || null);
      } else {
        resolve(null);
      }
    } catch (error) {
      console.error('Error fetching next chapter by reading level:', error);
      reject(error);
    }
  });
};

export const getQuickReportData = (profileId?: string): Promise<{
  booksRead: number;
  totalEarned: number;
  totalReadingTime: number;
}> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let readingTimeQuery = 'SELECT COALESCE(SUM(duration), 0) as total_time FROM chapter_completion WHERE score >= 80';
      
      // Modified books query to only count books where chapter 5 is completed with 80+ score
      let booksQuery = `SELECT COUNT(DISTINCT b.book_id) as count 
                       FROM chapter_completion cc
                       JOIN book b ON cc.chapter_id = b.id
                       WHERE cc.score >= 80 AND b.chapter_number = 5`;
      const params: any[] = [];
      
      // Add profile filtering if profileId is provided
      if (profileId) {
        readingTimeQuery += ' AND profile_id = ?';
        booksQuery += ' AND cc.profile_id = ?';
        params.push(profileId);
      }
      
      // Get total reading time (duration is in seconds)
      const readingTimeResult = db.getFirstSync<{ total_time: number }>(readingTimeQuery, params);
      
      // Get total earned from all positive savings transactions
      let earningsQuery = 'SELECT COALESCE(SUM(st.amount), 0) as total FROM savings_transaction st';
      let earningsParams: any[] = [];
      
      if (profileId) {
        // Join with savings_jug to filter by profile_id
        earningsQuery += ' JOIN savings_jug sj ON st.savings_jug_id = sj.id WHERE st.amount > 0 AND sj.profile_id = ?';
        earningsParams.push(profileId);
      } else {
        earningsQuery += ' WHERE st.amount > 0';
      }
      
      const earningsResult = db.getFirstSync<{ total: number }>(earningsQuery, earningsParams);
      
      // Get unique books read (only books where chapter 5 is completed with 80+ score)
      const booksResult = db.getFirstSync<{ count: number }>(booksQuery, params);
      
      resolve({
        booksRead: booksResult?.count || 0,
        totalEarned: earningsResult?.total || 0,
        totalReadingTime: readingTimeResult?.total_time || 0
      });
    } catch (error) {
      console.error('Error fetching QuickReport data:', error);
      reject(error);
    }
  });
};

export const getQuickReportDataByPeriod = (period: 'lifetime' | 'week' | 'month' = 'lifetime', profileId?: string): Promise<{
  booksRead: number;
  totalEarned: number;
  totalReadingTime: number;
}> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // Calculate date filters based on period
      let dateFilter = '';
      let dateParams: string[] = [];
      
      if (period === 'week') {
        dateFilter = 'AND cc.completed_at >= datetime("now", "-7 days")';
      } else if (period === 'month') {
        dateFilter = 'AND cc.completed_at >= datetime("now", "-30 days")';
      }
      
      let readingTimeQuery = `SELECT COALESCE(SUM(cc.duration), 0) as total_time FROM chapter_completion cc WHERE cc.score >= 80 ${dateFilter}`;
      
      // Modified books query to only count books where chapter 5 is completed with 80+ score
      let booksQuery = `SELECT COUNT(DISTINCT b.book_id) as count 
                       FROM chapter_completion cc
                       JOIN book b ON cc.chapter_id = b.id
                       WHERE cc.score >= 80 AND b.chapter_number = 5 ${dateFilter}`;
      
      // Add profile filtering if profileId is provided
      if (profileId) {
        readingTimeQuery += ' AND cc.profile_id = ?';
        booksQuery += ' AND cc.profile_id = ?';
        dateParams.push(profileId);
      }
      
      // Get total reading time (duration is in seconds)
      const readingTimeResult = db.getFirstSync<{ total_time: number }>(readingTimeQuery, dateParams);
      
      // Get total earned from positive savings transactions with date filter
      let earningsQuery = 'SELECT COALESCE(SUM(st.amount), 0) as total FROM savings_transaction st';
      let earningsParams: string[] = [];
      
      if (profileId) {
        // Join with savings_jug to filter by profile_id
        earningsQuery += ' JOIN savings_jug sj ON st.savings_jug_id = sj.id WHERE st.amount > 0 AND sj.profile_id = ?';
        earningsParams.push(profileId);
      } else {
        earningsQuery += ' WHERE st.amount > 0';
      }
      
      if (period === 'week') {
        earningsQuery += ' AND st.date >= datetime("now", "-7 days")';
      } else if (period === 'month') {
        earningsQuery += ' AND st.date >= datetime("now", "-30 days")';
      }
      
      const earningsResult = db.getFirstSync<{ total: number }>(earningsQuery, earningsParams);
      
      // Get unique books read (only books where chapter 5 is completed with 80+ score)
      const booksResult = db.getFirstSync<{ count: number }>(booksQuery, dateParams);
      
      resolve({
        booksRead: booksResult?.count || 0,
        totalEarned: earningsResult?.total || 0,
        totalReadingTime: readingTimeResult?.total_time || 0
      });
    } catch (error) {
      console.error('Error fetching QuickReport data by period:', error);
      reject(error);
    }
  });
};

export const getUserCompletedChaptersWithScore = (profileId: string, minScore: number = 80): Promise<Array<{
  id: number;
  learner_uid: string;
  chapter_id: number;
  duration: number;
  score: number;
  completed_at: string;
  created: string;
  book_id: string;
  genre: string;
  sub_genre: string;
  chapter_number: number;
  chapter_name: string;
  reading_level: string;
}>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const query = `
        SELECT 
          cc.id,
          cc.learner_uid,
          cc.chapter_id,
          cc.duration,
          cc.score,
          cc.completed_at,
          cc.created,
          b.book_id,
          b.genre,
          b.sub_genre,
          b.chapter_number,
          b.chapter_name,
          b.reading_level
        FROM chapter_completion cc
        JOIN book b ON cc.chapter_id = b.id
        WHERE cc.profile_id = ? AND cc.score >= ?
        ORDER BY cc.completed_at DESC`;
      const params: any[] = [profileId, minScore];
      const result = db.getAllSync<{
        id: number;
        learner_uid: string;
        chapter_id: number;
        duration: number;
        score: number;
        completed_at: string;
        created: string;
        book_id: string;
        genre: string;
        sub_genre: string;
        chapter_number: number;
        chapter_name: string;
        reading_level: string;
      }>(query, params);
      resolve(result || []);
    } catch (error) {
      console.error('Error fetching user completed chapters with score:', error);
      reject(error);
    }
  });
};

// Get count of unique books completed by a profile
export const getUserCompletedBooksCount = (profileId: string, minScore: number = 80): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // Modified query to only count books where chapter 5 is completed with 80+ score
      const query = `SELECT COUNT(DISTINCT b.book_id) as count
                   FROM chapter_completion cc
                   JOIN book b ON cc.chapter_id = b.id
                   WHERE cc.profile_id = ? AND cc.score >= ? AND b.chapter_number = 5`;
      const params: any[] = [profileId, minScore];
      
      const result = db.getFirstSync<{ count: number }>(query, params);
      resolve(result?.count || 0);
    } catch (error) {
      console.error('Error fetching user completed books count:', error);
      reject(error);
    }
  });
};

// Function to check if completed chapters table is empty
export const isCompletedChaptersTableEmpty = (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      const result = db.getFirstSync<{ count: number }>(
        'SELECT COUNT(*) as count FROM chapter_completion'
      );
      resolve((result?.count || 0) === 0);
    } catch (error) {
      console.error('Error checking if completed chapters table is empty:', error);
      reject(error);
    }
  });
};

// Function to restore completed chapters from API
export const restoreCompletedChapters = async (learnerUid: string): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // Import the API function
      const { fetchCompletedChapters } = require('./api');
      
      const response = await fetchCompletedChapters(learnerUid);
      
      if (!response.completedChapters || response.completedChapters.length === 0) {
        resolve();
        return;
      }

      // Clean up any existing duplicates before restoring
      await removeDuplicateChapterCompletions(learnerUid);

      // For each completed chapter from API, we need to find the corresponding book in our database
      for (const apiChapter of response.completedChapters) {
        try {
          // Find the book by title and chapter name (using the new chapterName field)
          let book = db.getFirstSync<{
            id: number;
            book_id: string;
            title: string;
            chapter_number: number;
            chapter_name: string;
          }>(
            `SELECT id, book_id, title, chapter_number, chapter_name 
             FROM book 
             WHERE title = ? AND chapter_name = ?
             LIMIT 1`,
            [apiChapter.bookTitle, apiChapter.chapterName]
          );

          // If exact match not found, try partial title match
          if (!book) {
            book = db.getFirstSync<{
              id: number;
              book_id: string;
              title: string;
              chapter_number: number;
              chapter_name: string;
            }>(
              `SELECT id, book_id, title, chapter_number, chapter_name 
               FROM book 
               WHERE title LIKE ? AND chapter_name = ?
               LIMIT 1`,
              [`%${apiChapter.bookTitle}%`, apiChapter.chapterName]
            );
          }

          if (book) {
            // Check if this chapter completion already exists for this user and profile
            const existingCompletion = db.getFirstSync<{ count: number }>(
              'SELECT COUNT(*) as count FROM chapter_completion WHERE learner_uid = ? AND chapter_id = ? AND profile_id = ?',
              [learnerUid, book.id, apiChapter.profileUid]
            );

            if (existingCompletion && existingCompletion.count === 0) {
              // Insert the completed chapter with actual values from API
              db.runSync(
                'INSERT INTO chapter_completion (learner_uid, chapter_id, duration, score, completed_at, profile_id) VALUES (?, ?, ?, ?, ?, ?)',
                [
                  learnerUid,
                  book.id,
                  apiChapter.duration,
                  apiChapter.score,
                  apiChapter.completedAt,
                  apiChapter.profileUid
                ]
              );
            }
          }
        } catch (chapterError) {
          console.error('Error restoring individual chapter:', chapterError);
          // Continue with other chapters even if one fails
        }
      }

      resolve();
    } catch (error) {
      console.error('Error restoring completed chapters:', error);
      reject(error);
    }
  });
};

// Function to manually trigger restoration (for testing/debugging)
export const manuallyRestoreCompletedChapters = async (learnerUid: string): Promise<{
  success: boolean;
  message: string;
  restoredCount: number;
}> => {
  try {
    // Clear existing completed chapters first
    await clearAllCompletedChapters();
    
    // Restore from API
    await restoreCompletedChapters(learnerUid);
    
    // Get count of restored chapters
    const completedChapters = await getAllCompletedChapters();
    
    return {
      success: true,
      message: `Successfully restored ${completedChapters.length} completed chapters`,
      restoredCount: completedChapters.length
    };
  } catch (error) {
    console.error('Error in manual restoration:', error);
    return {
      success: false,
      message: `Failed to restore completed chapters: ${error instanceof Error ? error.message : 'Unknown error'}`,
      restoredCount: 0
    };
  }
};

// Reading level initialization utility
export const initializeReadingLevel = async (): Promise<void> => {
  try {
    const selectedProfileUid = await AsyncStorage.getItem('selectedProfileUid');
    if (selectedProfileUid) {
      // Check if profile exists and has a reading level
      const existingLevel = await getProfileReadingLevel(selectedProfileUid);
      if (!existingLevel || existingLevel === 'Explorer') {
        // Profile exists but might not have reading level set, ensure it's set
        await updateProfileReadingLevel(selectedProfileUid, 'Explorer');
      }
    } else {
      // Fallback to AsyncStorage for backward compatibility
      const readingLevel = await AsyncStorage.getItem('readingLevel');
      if (!readingLevel) {
        await AsyncStorage.setItem('readingLevel', 'Explorer');
      }
    }
  } catch (error) {
    console.error('Error initializing reading level:', error);
  }
};

// Get current reading level with fallback to Explorer
export const getCurrentReadingLevel = async (): Promise<string> => {
  try {
    const selectedProfileUid = await AsyncStorage.getItem('selectedProfileUid');
    if (selectedProfileUid) {
      return await getProfileReadingLevel(selectedProfileUid);
    }
    // Fallback to AsyncStorage for backward compatibility
    const stored = await AsyncStorage.getItem('readingLevel');
    return stored || 'Explorer';
  } catch (error) {
    console.error('Error getting current reading level:', error);
    return 'Explorer';
  }
};

// Get reading level for the currently selected profile
export const getCurrentProfileReadingLevel = async (): Promise<string> => {
  try {
    const selectedProfileUid = await AsyncStorage.getItem('selectedProfileUid');
    if (selectedProfileUid) {
      return await getProfileReadingLevel(selectedProfileUid);
    }
    // Fallback to AsyncStorage for backward compatibility
    const stored = await AsyncStorage.getItem('readingLevel');
    return stored || 'Explorer';
  } catch (error) {
    console.error('Error getting current profile reading level:', error);
    return 'Explorer';
  }
};

// Get current profile information
export const getCurrentProfile = async (): Promise<{
  id: number;
  uid: string;
  name: string;
  reading_level: string;
  avatar: string;
  created: string;
  updated: string;
} | null> => {
  try {
    const selectedProfileUid = await AsyncStorage.getItem('selectedProfileUid');
    if (selectedProfileUid) {
      return await getProfileByUid(selectedProfileUid);
    }
    return null;
  } catch (error) {
    console.error('Error getting current profile:', error);
    return null;
  }
};

// Update reading level for the currently selected profile
export const updateCurrentProfileReadingLevel = async (readingLevel: string): Promise<void> => {
  try {
    const selectedProfileUid = await AsyncStorage.getItem('selectedProfileUid');
    if (selectedProfileUid) {
      await updateProfileReadingLevel(selectedProfileUid, readingLevel);
    } else {
      // Fallback to AsyncStorage for backward compatibility
      await AsyncStorage.setItem('readingLevel', readingLevel);
    }
  } catch (error) {
    console.error('Error updating current profile reading level:', error);
  }
};

// Calculate reading streak based on chapter completions
export const calculateReadingStreak = (profileId?: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      let query = `
        SELECT DISTINCT DATE(completed_at) as completion_date
        FROM chapter_completion
        WHERE score >= 80`;
      const params: any[] = [];
      if (profileId) {
        query += ' AND profile_id = ?';
        params.push(profileId);
      }
      query += ' ORDER BY completion_date DESC';
      const completionDates = db.getAllSync<{ completion_date: string }>(query, params);
      if (completionDates.length === 0) {
        resolve(0);
        return;
      }
      // ... existing streak logic ...
      // (rest of function unchanged)
      // ...
    } catch (error) {
      console.error('Error calculating reading streak:', error);
      reject(error);
    }
  });
};

// Get reading streak with additional details
export const getReadingStreakDetails = (profileId?: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  totalDaysRead: number;
  lastActivityDate: string | null;
}> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // Get all completed chapters with dates
      let query = `
        SELECT DISTINCT DATE(completed_at) as completion_date
        FROM chapter_completion
        WHERE score >= 80
      `;
      let params: string[] = [];
      
      if (profileId) {
        query += ' AND profile_id = ?';
        params.push(profileId);
      }
      
      query += ' ORDER BY completion_date DESC';
      
      const completionDates = db.getAllSync<{ completion_date: string }>(query, params);
      
      if (completionDates.length === 0) {
        resolve({
          currentStreak: 0,
          longestStreak: 0,
          totalDaysRead: 0,
          lastActivityDate: null
        });
        return;
      }

      // Convert dates to Date objects and sort in descending order
      const dates = completionDates.map(row => new Date(row.completion_date));
      dates.sort((a, b) => b.getTime() - a.getTime());

      const totalDaysRead = dates.length;
      const lastActivityDate = dates[0].toISOString().split('T')[0];

      // Calculate current streak
      let currentStreak = 0;
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const hasActivityToday = dates.some(date => 
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );

      if (!hasActivityToday) {
        const hasActivityYesterday = dates.some(date => 
          date.getFullYear() === yesterday.getFullYear() &&
          date.getMonth() === yesterday.getMonth() &&
          date.getDate() === yesterday.getDate()
        );
        
        if (!hasActivityYesterday) {
          currentStreak = 0;
        } else {
          currentStreak = 1;
        }
      } else {
        currentStreak = 1;
      }

      // Calculate current streak length
      let currentDate = hasActivityToday ? today : yesterday;
      
      for (let i = 1; i < dates.length; i++) {
        const expectedDate = new Date(currentDate);
        expectedDate.setDate(expectedDate.getDate() - 1);
        
        const hasActivityOnExpectedDate = dates.some(date => 
          date.getFullYear() === expectedDate.getFullYear() &&
          date.getMonth() === expectedDate.getMonth() &&
          date.getDate() === expectedDate.getDate()
        );
        
        if (hasActivityOnExpectedDate) {
          currentStreak++;
          currentDate = expectedDate;
        } else {
          break;
        }
      }

      // Calculate longest streak
      let longestStreak = 0;
      let tempStreak = 0;
      
      for (let i = 0; i < dates.length; i++) {
        if (i === 0) {
          tempStreak = 1;
        } else {
          const currentDate = dates[i];
          const previousDate = dates[i - 1];
          const dayDiff = Math.floor((previousDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (dayDiff === 1) {
            tempStreak++;
          } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
          }
        }
      }
      
      longestStreak = Math.max(longestStreak, tempStreak);

      resolve({
        currentStreak,
        longestStreak,
        totalDaysRead,
        lastActivityDate
      });
    } catch (error) {
      console.error('Error getting reading streak details:', error);
      reject(error);
    }
  });
};

// Function to remove duplicate chapter completions for a user
export const removeDuplicateChapterCompletions = (learnerUid: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // Remove duplicates by keeping only the first occurrence of each chapter_id for the user and profile combination
      db.runSync(`
        DELETE FROM chapter_completion 
        WHERE id NOT IN (
          SELECT MIN(id) 
          FROM chapter_completion 
          WHERE learner_uid = ? 
          GROUP BY chapter_id, profile_id
        ) AND learner_uid = ?
      `, [learnerUid, learnerUid]);
      
      resolve();
    } catch (error) {
      console.error('Error removing duplicate chapter completions:', error);
      reject(error);
    }
  });
};

export default db;

// Reset first-time login flag (useful for testing)
export const resetFirstTimeLoginFlag = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem('hasLoggedInBefore');
    console.log('[Database] First-time login flag reset successfully');
  } catch (error) {
    console.error('[Database] Error resetting first-time login flag:', error);
    throw error;
  }
}; 

// Create a default savings jar for a profile
export const createDefaultSavingsJar = (profileId: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      const result = db.runSync(
        'INSERT INTO savings_jug (name, emoji, profile_id) VALUES (?, ?, ?)',
        ['Reading Fund', '💰', profileId]
      );
      resolve(result.lastInsertRowId);
    } catch (error) {
      console.error('Error creating default savings jar:', error);
      reject(error);
    }
  });
};

// Add default jars to existing profiles that don't have them
export const addDefaultJarsToExistingProfiles = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      // Get all profiles
      const profiles = db.getAllSync<{ uid: string; name: string }>('SELECT uid, name FROM profiles');
      
      // For each profile, check if they have any savings jugs
      for (const profile of profiles) {
        const jugs = db.getAllSync<{ id: number }>('SELECT id FROM savings_jug WHERE profile_id = ?', [profile.uid]);
        
        // If no jugs exist, create a default one
        if (jugs.length === 0) {
          db.runSync(
            'INSERT INTO savings_jug (name, emoji, profile_id) VALUES (?, ?, ?)',
            ['Reading Fund', '💰', profile.uid]
          );
        }
      }
      
      resolve();
    } catch (error) {
      console.error('Error adding default jars to existing profiles:', error);
      reject(error);
    }
  });
};

// Insert a profile (user's name) and create default jar
export const insertProfile = (profileData: { uid: string; name: string; reading_level?: string; avatar?: string }): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      const readingLevel = profileData.reading_level || 'Explorer';
      const avatar = profileData.avatar || '1'; // Default to avatar '1' if not provided
      db.runSync(
        'INSERT OR REPLACE INTO profiles (uid, name, reading_level, avatar, updated) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [profileData.uid, profileData.name, readingLevel, avatar]
      );
      
      // Create default savings jar for the new profile
      createDefaultSavingsJar(profileData.uid)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error('Error creating default savings jar, but profile was created:', error);
          // Still resolve since the profile was created successfully
          resolve();
        });
    } catch (error) {
      console.error('Error inserting profile:', error);
      reject(error);
    }
  });
};

// Get all profiles
export const getAllProfiles = (): Promise<Array<{ id: number; uid: string; name: string; reading_level: string; avatar: string; created: string; updated: string }>> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      const result = db.getAllSync<{
        id: number;
        uid: string;
        name: string;
        reading_level: string;
        avatar: string;
        created: string;
        updated: string;
      }>('SELECT * FROM profiles ORDER BY created ASC');
      
      resolve(result);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      reject(error);
    }
  });
};

// Delete a profile by uid and clean up associated data
export const deleteProfile = (uid: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      // First delete all savings transactions for this profile's jugs
      db.runSync(`
        DELETE FROM savings_transaction 
        WHERE savings_jug_id IN (
          SELECT id FROM savings_jug WHERE profile_id = ?
        )
      `, [uid]);
      
      // Then delete all savings jugs for this profile
      db.runSync('DELETE FROM savings_jug WHERE profile_id = ?', [uid]);
      
      // Finally delete the profile
      db.runSync('DELETE FROM profiles WHERE uid = ?', [uid]);
      
      resolve();
    } catch (error) {
      console.error('Error deleting profile:', error);
      reject(error);
    }
  });
};

// Drop all tables and recreate them (dev tool)
export const dropAllTables = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      // Drop all main tables in correct order (respecting foreign key constraints)
      db.execSync('DROP TABLE IF EXISTS question_report');
      db.execSync('DROP TABLE IF EXISTS savings_transaction');
      db.execSync('DROP TABLE IF EXISTS savings_jug');
      db.execSync('DROP TABLE IF EXISTS chapter_completion');
      db.execSync('DROP TABLE IF EXISTS learner_reading');
      db.execSync('DROP TABLE IF EXISTS book');
      db.execSync('DROP TABLE IF EXISTS profiles');
      // Recreate tables
      createTables();
      resolve();
    } catch (error) {
      console.error('Error dropping all tables:', error);
      reject(error);
    }
  });
};

// Get reading level for a specific profile
export const getProfileReadingLevel = (uid: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      const result = db.getFirstSync<{ reading_level: string }>(
        'SELECT reading_level FROM profiles WHERE uid = ?',
        [uid]
      );
      resolve(result?.reading_level || 'Explorer');
    } catch (error) {
      console.error('Error getting profile reading level:', error);
      reject(error);
    }
  });
};

// Update reading level for a specific profile
export const updateProfileReadingLevel = (uid: string, readingLevel: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      db.runSync(
        'UPDATE profiles SET reading_level = ?, updated = CURRENT_TIMESTAMP WHERE uid = ?',
        [readingLevel, uid]
      );
      resolve();
    } catch (error) {
      console.error('Error updating profile reading level:', error);
      reject(error);
    }
  });
};

/**
 * Get today's earnings (sum of all positive savings_transaction amounts for today)
 */
export const getTodaysEarnings = async (profileId?: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      const today = new Date().toISOString().split('T')[0];
      
      let query: string;
      let params: any[];
      
      if (profileId) {
        // Filter by profile_id by joining with savings_jug table
        query = `SELECT COALESCE(SUM(st.amount), 0) as total
                 FROM savings_transaction st
                 JOIN savings_jug sj ON st.savings_jug_id = sj.id
                 WHERE st.amount > 0 AND DATE(st.date) = ? AND sj.profile_id = ?`;
        params = [today, profileId];
      } else {
        // No profile filter - get global earnings
        query = `SELECT COALESCE(SUM(st.amount), 0) as total
                 FROM savings_transaction st
                 WHERE st.amount > 0 AND DATE(st.date) = ?`;
        params = [today];
      }
      
      const result = db.getFirstSync<{ total: number }>(query, params);
      resolve(result?.total || 0);
    } catch (error) {
      console.error('Error fetching today\'s earnings:', error);
      reject(error);
    }
  });
};

// Get profile by UID
export const getProfileByUid = (uid: string): Promise<{
  id: number;
  uid: string;
  name: string;
  reading_level: string;
  avatar: string;
  created: string;
  updated: string;
} | null> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      const result = db.getFirstSync<{
        id: number;
        uid: string;
        name: string;
        reading_level: string;
        avatar: string;
        created: string;
        updated: string;
      }>(
        'SELECT * FROM profiles WHERE uid = ?',
        [uid]
      );
      resolve(result || null);
    } catch (error) {
      console.error('Error fetching profile by UID:', error);
      reject(error);
    }
  });
};

// Update profile avatar
export const updateProfileAvatar = (uid: string, avatar: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    try {
      db.runSync(
        'UPDATE profiles SET avatar = ?, updated = CURRENT_TIMESTAMP WHERE uid = ?',
        [avatar, uid]
      );
      resolve();
    } catch (error) {
      console.error('Error updating profile avatar:', error);
      reject(error);
    }
  });
};

/**
 * Diagnose the discrepancy between total balance and total earned
 * This function helps identify if there's a synchronization issue between transactions and balances
 */
export const diagnoseBalanceEarnedDiscrepancy = (profileId?: string): Promise<{
  totalBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  netTransactions: number;
  discrepancy: number;
  jugBalances: Array<{ id: number; name: string; balance: number; calculatedBalance: number; difference: number }>;
  transactions: Array<{ id: number; jug_id: number; amount: number; transaction_name: string; date: string }>;
}> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // Get total balance from jugs
      let balanceQuery = 'SELECT SUM(balance) as total FROM savings_jug WHERE 1=1';
      let balanceParams: any[] = [];
      
      if (profileId) {
        balanceQuery += ' AND profile_id = ?';
        balanceParams.push(profileId);
      }
      
      const balanceResult = db.getFirstSync<{ total: number }>(balanceQuery, balanceParams);
      const totalBalance = balanceResult?.total || 0;

      // Get all transactions
      let transactionsQuery = `
        SELECT st.id, st.savings_jug_id as jug_id, st.amount, st.transaction_name, st.date
        FROM savings_transaction st
        JOIN savings_jug sj ON st.savings_jug_id = sj.id
        WHERE 1=1
      `;
      let transactionsParams: any[] = [];
      
      if (profileId) {
        transactionsQuery += ' AND sj.profile_id = ?';
        transactionsParams.push(profileId);
      }
      
      transactionsQuery += ' ORDER BY st.date DESC';
      
      const transactions = db.getAllSync<{
        id: number;
        jug_id: number;
        amount: number;
        transaction_name: string;
        date: string;
      }>(transactionsQuery, transactionsParams) || [];

      // Calculate totals from transactions
      const totalEarned = transactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      
      const totalWithdrawn = transactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      const netTransactions = transactions.reduce((sum, t) => sum + t.amount, 0);
      
      const discrepancy = totalBalance - netTransactions;

      // Get individual jug balances and calculate what they should be
      let jugsQuery = `
        SELECT sj.id, sj.name, sj.balance,
               COALESCE(SUM(st.amount), 0) as calculated_balance
        FROM savings_jug sj
        LEFT JOIN savings_transaction st ON sj.id = st.savings_jug_id
        WHERE 1=1
      `;
      let jugsParams: any[] = [];
      
      if (profileId) {
        jugsQuery += ' AND sj.profile_id = ?';
        jugsParams.push(profileId);
      }
      
      jugsQuery += ' GROUP BY sj.id, sj.name, sj.balance';
      
      const jugBalances = db.getAllSync<{
        id: number;
        name: string;
        balance: number;
        calculated_balance: number;
      }>(jugsQuery, jugsParams) || [];

      const jugBalancesWithDifference = jugBalances.map(jug => ({
        id: jug.id,
        name: jug.name,
        balance: jug.balance,
        calculatedBalance: jug.calculated_balance,
        difference: jug.balance - jug.calculated_balance
      }));

      resolve({
        totalBalance,
        totalEarned,
        totalWithdrawn,
        netTransactions,
        discrepancy,
        jugBalances: jugBalancesWithDifference,
        transactions
      });
    } catch (error) {
      console.error('Error diagnosing balance/earned discrepancy:', error);
      reject(error);
    }
  });
};

/**
 * Fix balance synchronization issues by recalculating all jug balances based on transaction history
 */
export const fixBalanceSynchronization = (profileId?: string): Promise<{
  fixedJugs: number;
  totalDiscrepancyFixed: number;
  details: Array<{ jugId: number; jugName: string; oldBalance: number; newBalance: number; difference: number }>;
}> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    try {
      // Get all jugs with their calculated balances
      let jugsQuery = `
        SELECT sj.id, sj.name, sj.balance,
               COALESCE(SUM(st.amount), 0) as calculated_balance
        FROM savings_jug sj
        LEFT JOIN savings_transaction st ON sj.id = st.savings_jug_id
        WHERE 1=1
      `;
      let jugsParams: any[] = [];
      
      if (profileId) {
        jugsQuery += ' AND sj.profile_id = ?';
        jugsParams.push(profileId);
      }
      
      jugsQuery += ' GROUP BY sj.id, sj.name, sj.balance';
      
      const jugs = db.getAllSync<{
        id: number;
        name: string;
        balance: number;
        calculated_balance: number;
      }>(jugsQuery, jugsParams) || [];

      const details: Array<{ jugId: number; jugName: string; oldBalance: number; newBalance: number; difference: number }> = [];
      let fixedJugs = 0;
      let totalDiscrepancyFixed = 0;

      // Update each jug's balance if there's a discrepancy
      for (const jug of jugs) {
        const difference = jug.balance - jug.calculated_balance;
        
        if (Math.abs(difference) > 0.01) { // Allow for small floating point differences
          // Update the balance to match the calculated balance
          db.runSync('UPDATE savings_jug SET balance = ?, updated = CURRENT_TIMESTAMP WHERE id = ?', 
            [jug.calculated_balance, jug.id]);
          
          details.push({
            jugId: jug.id,
            jugName: jug.name,
            oldBalance: jug.balance,
            newBalance: jug.calculated_balance,
            difference: difference
          });
          
          fixedJugs++;
          totalDiscrepancyFixed += Math.abs(difference);
        }
      }

      resolve({
        fixedJugs,
        totalDiscrepancyFixed,
        details
      });
    } catch (error) {
      console.error('Error fixing balance synchronization:', error);
      reject(error);
    }
  });
};