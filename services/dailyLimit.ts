import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTodaysQuestionCount } from './database';

const DAILY_LIMIT_KEY = 'daily_question_count';
const DAILY_LIMIT_DATE_KEY = 'daily_question_date';
const DAILY_LIMIT_FREE_USERS = 20;

export interface DailyLimitInfo {
  count: number;
  limit: number;
  date: string;
  isLimitReached: boolean;
  isPremium: boolean;
}

/**
 * Get the current date in YYYY-MM-DD format
 */
const getCurrentDate = (): string => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Check if user has premium subscription
 */
export const isPremiumUser = (customerInfo: any): boolean => {
  if (!customerInfo) return false;
  
  // Check if user has any active entitlements
  const hasActiveEntitlements = customerInfo.entitlements && 
    Object.keys(customerInfo.entitlements.active).length > 0;
  
  // Check if user has active subscriptions
  const hasActiveSubscriptions = customerInfo.activeSubscriptions && 
    customerInfo.activeSubscriptions.length > 0;
  
  return hasActiveEntitlements || hasActiveSubscriptions;
};

/**
 * Get daily question limit information
 */
export const getDailyLimitInfo = async (customerInfo: any): Promise<DailyLimitInfo> => {
  try {
    const isPremium = isPremiumUser(customerInfo);
    const currentDate = getCurrentDate();
    
    // Premium users have unlimited questions
    if (isPremium) {
      return {
        count: 0,
        limit: -1, // -1 indicates unlimited
        date: currentDate,
        isLimitReached: false,
        isPremium: true
      };
    }
    
    // Query the database for today's answered questions
    const count = await getTodaysQuestionCount();
    return {
      count,
      limit: DAILY_LIMIT_FREE_USERS,
      date: currentDate,
      isLimitReached: count >= DAILY_LIMIT_FREE_USERS,
      isPremium: false
    };
  } catch (error) {
    console.error('[DailyLimit] Error getting daily limit info:', error);
    // Return default values on error
    return {
      count: 0,
      limit: DAILY_LIMIT_FREE_USERS,
      date: getCurrentDate(),
      isLimitReached: false,
      isPremium: false
    };
  }
};

/**
 * Increment the daily question count
 */
export const incrementDailyCount = async (): Promise<DailyLimitInfo> => {
  try {
    const currentDate = getCurrentDate();
    const storedDate = await AsyncStorage.getItem(DAILY_LIMIT_DATE_KEY);
    const storedCount = await AsyncStorage.getItem(DAILY_LIMIT_KEY);
    
    // If it's a new day, start from 1
    if (storedDate !== currentDate) {
      await AsyncStorage.setItem(DAILY_LIMIT_DATE_KEY, currentDate);
      await AsyncStorage.setItem(DAILY_LIMIT_KEY, '1');
      return {
        count: 1,
        limit: DAILY_LIMIT_FREE_USERS,
        date: currentDate,
        isLimitReached: false,
        isPremium: false
      };
    }
    
    // Same day, increment count
    const currentCount = parseInt(storedCount || '0', 10);
    const newCount = currentCount + 1;
    await AsyncStorage.setItem(DAILY_LIMIT_KEY, newCount.toString());
    
    return {
      count: newCount,
      limit: DAILY_LIMIT_FREE_USERS,
      date: currentDate,
      isLimitReached: newCount >= DAILY_LIMIT_FREE_USERS,
      isPremium: false
    };
  } catch (error) {
    console.error('[DailyLimit] Error incrementing daily count:', error);
    throw error;
  }
};

/**
 * Check if user can answer more questions today
 */
export const canAnswerQuestion = async (customerInfo: any): Promise<boolean> => {
  try {
    const limitInfo = await getDailyLimitInfo(customerInfo);
    return !limitInfo.isLimitReached;
  } catch (error) {
    console.error('[DailyLimit] Error checking if user can answer question:', error);
    return true; // Allow on error to avoid blocking user experience
  }
};

/**
 * Reset daily count (useful for testing or admin purposes)
 */
export const resetDailyCount = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(DAILY_LIMIT_KEY);
    await AsyncStorage.removeItem(DAILY_LIMIT_DATE_KEY);
    console.log('[DailyLimit] Daily count reset successfully');
  } catch (error) {
    console.error('[DailyLimit] Error resetting daily count:', error);
    throw error;
  }
};

/**
 * Get remaining questions for today
 */
export const getRemainingQuestions = async (customerInfo: any): Promise<number> => {
  try {
    const limitInfo = await getDailyLimitInfo(customerInfo);
    
    if (limitInfo.isPremium) {
      return -1; // Unlimited
    }
    
    return Math.max(0, limitInfo.limit - limitInfo.count);
  } catch (error) {
    console.error('[DailyLimit] Error getting remaining questions:', error);
    return 0;
  }
}; 