import { 
  getCurrentReading, 
  startReadingBook, 
  updateReadingProgress, 
  getRandomBook,
  getRandomUncompletedBook,
  getRandomBookByReadingLevel,
  getRandomUncompletedBookByReadingLevel,
  finishReadingBook,
  getBookById,
  isChapterCompleted,
  hasUserCompletedChapterWithScore,
  getNextChapter,
  getNextChapterByReadingLevel,
  getCurrentReadingLevel,
  getBooksByReadingLevel,
  getBookByBookIdAndChapterNumber
} from './database';

// Interface for current reading status
export interface CurrentReading {
  id: number;
  book_id: string;
  chapter_number: number;
  chapter_name: string;
  reading_date: string;
  created: string;
}

// Interface for book data
export interface Book {
  id: number;
  book_id: string;
  title?: string | null;
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

// Get current reading status
export const getCurrentReadingStatus = async (profileId?: string): Promise<CurrentReading | null> => {
  try {
    const currentReading = await getCurrentReading(profileId);
    return currentReading;
  } catch (error) {
    throw error;
  }
};

// Start reading a random book
export const startRandomReading = async (profileId?: string): Promise<Book> => {
  try {
    // Get user's current reading level
    const userReadingLevel = await getCurrentReadingLevel();
    
    // Try to get a random book at user's reading level
    let selectedBook = await getRandomBookByReadingLevel(userReadingLevel);
    
    if (!selectedBook) {
      // Fallback to any book if no books found for user's level
      selectedBook = await getRandomBook();
      if (!selectedBook) {
        throw new Error('No books available in the database');
      }
    }
    
    // Start reading the book
    await startReadingBook({
      book_id: selectedBook.book_id,
      chapter_number: selectedBook.chapter_number,
      chapter_name: selectedBook.chapter_name,
      profile_id: profileId
    });
    
    return selectedBook;
  } catch (error) {
    throw error;
  }
};

// Start reading a random uncompleted book
export const startRandomUncompletedReading = async (learnerUid: string, profileId?: string): Promise<Book> => {
  try {
    // Get user's current reading level
    const userReadingLevel = await getCurrentReadingLevel();
    
    // Try to get a random uncompleted book at user's reading level
    let selectedBook = await getRandomUncompletedBookByReadingLevel(learnerUid, userReadingLevel, profileId);
    
    if (!selectedBook) {
      // Fallback to any uncompleted book if no books found for user's level
      selectedBook = await getRandomUncompletedBook(learnerUid, profileId);
      if (!selectedBook) {
        throw new Error('No uncompleted books available for this user');
      }
    }
    
    // Start reading the book
    await startReadingBook({
      book_id: selectedBook.book_id,
      chapter_number: selectedBook.chapter_number,
      chapter_name: selectedBook.chapter_name,
      profile_id: profileId
    });
    
    return selectedBook;
  } catch (error) {
    throw error;
  }
};

// Continue reading current book
export const continueReading = async (): Promise<CurrentReading | null> => {
  try {
    const currentReading = await getCurrentReading();
    
    if (!currentReading) {
      throw new Error('No active reading session found');
    }
    
    return currentReading;
  } catch (error) {
    throw error;
  }
};

// Update reading progress
export const updateReading = async (bookData: {
  book_id: string;
  chapter_number: number;
  chapter_name: string;
  profile_id?: string;
}): Promise<void> => {
  try {
    await updateReadingProgress(bookData);
  } catch (error) {
    throw error;
  }
};

// Finish reading current book
export const finishCurrentReading = async (): Promise<void> => {
  try {
    await finishReadingBook();
  } catch (error) {
    throw error;
  }
};

// Check if user is currently reading
export const isCurrentlyReading = async (): Promise<boolean> => {
  try {
    const currentReading = await getCurrentReading();
    return currentReading !== null;
  } catch (error) {
    return false;
  }
};

// Get book details for current reading
export const getCurrentBookDetails = async (): Promise<Book | null> => {
  try {
    const currentReading = await getCurrentReading();
    
    if (!currentReading) {
      return null;
    }
    
    const bookDetails = await getBookById(currentReading.book_id);
    
    return bookDetails;
  } catch (error) {
    return null;
  }
};

// Check if current chapter is completed
export const isCurrentChapterCompleted = async (learnerUid?: string, profileId?: string): Promise<boolean> => {
  try {
    const currentReading = await getCurrentReading();
    
    if (!currentReading) {
      return false;
    }
    
    const bookDetails = await getBookById(currentReading.book_id);
    
    if (!bookDetails) {
      return false;
    }
    
    // Check if the current user has completed this chapter with a score of 80+
    if (learnerUid) {
      return await hasUserCompletedChapterWithScore(learnerUid, bookDetails.id, 80, profileId);
    } else {
      // Fallback to checking if any user has completed the chapter
      return await isChapterCompleted(bookDetails.id);
    }
  } catch (error) {
    return false;
  }
};

// Get next chapter for current book
export const getNextChapterForCurrentBook = async (learnerUid?: string, profileId?: string): Promise<Book | null> => {
  try {
    const currentReading = await getCurrentReading();
    
    if (!currentReading) {
      return null;
    }
    
    const nextChapter = await getNextChapter(currentReading.book_id, currentReading.chapter_number, learnerUid, profileId);
    
    return nextChapter;
  } catch (error) {
    return null;
  }
};

// Get smart book details (handles completed chapters and next chapters)
export const getSmartBookDetails = async (learnerUid?: string, profileId?: string): Promise<{
  book: Book | null;
  isCompleted: boolean;
  hasNextChapter: boolean;
  nextChapter: Book | null;
} | null> => {
  try {
    const currentReading = await getCurrentReadingStatus(profileId);
    
    if (!currentReading) {
      return null;
    }
    
    // Get the current book with the specific chapter number
    const currentBook = await getBookByBookIdAndChapterNumber(currentReading.book_id, currentReading.chapter_number);
    
    if (!currentBook) {
      return null;
    }
    
    // Check if the current user has completed this chapter with a score of 80+
    let isCompleted = false;
    if (learnerUid) {
      isCompleted = await hasUserCompletedChapterWithScore(learnerUid, currentBook.id, 80, profileId);
    } else {
      // Fallback to checking if any user has completed the chapter
      isCompleted = await isChapterCompleted(currentBook.id);
    }
    
    // Get user's reading level to filter next chapter
    const userReadingLevel = await getCurrentReadingLevel();
    
    // Try to get next chapter at user's reading level first
    let nextChapter = await getNextChapterByReadingLevel(currentReading.book_id, currentReading.chapter_number, userReadingLevel, learnerUid, profileId);
    
    if (!nextChapter) {
      // Fallback to any next chapter if no chapter found at user's level
      nextChapter = await getNextChapter(currentReading.book_id, currentReading.chapter_number, learnerUid, profileId);
    }
    
    const result = {
      book: currentBook,
      isCompleted,
      hasNextChapter: nextChapter !== null,
      nextChapter
    };
    
    return result;
  } catch (error) {
    return null;
  }
}; 