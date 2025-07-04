import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTodaysEarnings } from './database';

const DAILY_EARNING_LIMIT_KEY = 'daily_earning_limit';
const DAILY_EARNING_DATE_KEY = 'daily_earning_date';
const DAILY_EARNING_AMOUNT_KEY = 'daily_earning_amount';
const DEFAULT_DAILY_EARNING_LIMIT = 50; // Default $50 per day

export interface DailyEarningLimitInfo {
  earnedToday: number;
  limit: number;
  date: string;
  isLimitReached: boolean;
  remainingAmount: number;
}

/**
 * Get the current date in YYYY-MM-DD format
 */
const getCurrentDate = (): string => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Get daily earning limit information
 */
export const getDailyEarningLimitInfo = async (profileId?: string): Promise<DailyEarningLimitInfo> => {
  try {
    const currentDate = getCurrentDate();
    
    // Get the daily earning limit from storage
    const storedLimit = await AsyncStorage.getItem(DAILY_EARNING_LIMIT_KEY);
    const limit = storedLimit ? parseFloat(storedLimit) : DEFAULT_DAILY_EARNING_LIMIT;
    
    // Get today's earnings from database (filtered by profile if provided)
    const earnedToday = await getTodaysEarnings(profileId);
    
    const remainingAmount = Math.max(0, limit - earnedToday);
    const isLimitReached = earnedToday >= limit;
    
    return {
      earnedToday,
      limit,
      date: currentDate,
      isLimitReached,
      remainingAmount
    };
  } catch (error) {
    // Return default values on error
    return {
      earnedToday: 0,
      limit: DEFAULT_DAILY_EARNING_LIMIT,
      date: getCurrentDate(),
      isLimitReached: false,
      remainingAmount: DEFAULT_DAILY_EARNING_LIMIT
    };
  }
};

/**
 * Set the daily earning limit
 */
export const setDailyEarningLimit = async (limit: number): Promise<void> => {
  try {
    if (limit < 0) {
      throw new Error('Daily earning limit cannot be negative');
    }
    
    await AsyncStorage.setItem(DAILY_EARNING_LIMIT_KEY, limit.toString());
  } catch (error) {
    throw error;
  }
};

/**
 * Get the current daily earning limit
 */
export const getDailyEarningLimit = async (): Promise<number> => {
  try {
    const storedLimit = await AsyncStorage.getItem(DAILY_EARNING_LIMIT_KEY);
    return storedLimit ? parseFloat(storedLimit) : DEFAULT_DAILY_EARNING_LIMIT;
  } catch (error) {
    return DEFAULT_DAILY_EARNING_LIMIT;
  }
};

/**
 * Check if user can earn more money today
 */
export const canEarnMoreToday = async (amountToEarn: number = 0, profileId?: string): Promise<boolean> => {
  try {
    const limitInfo = await getDailyEarningLimitInfo(profileId);
    return (limitInfo.earnedToday + amountToEarn) <= limitInfo.limit;
  } catch (error) {
    return true; // Allow on error to avoid blocking user experience
  }
};

/**
 * Get remaining earning amount for today
 */
export const getRemainingEarningAmount = async (profileId?: string): Promise<number> => {
  try {
    const limitInfo = await getDailyEarningLimitInfo(profileId);
    return limitInfo.remainingAmount;
  } catch (error) {
    return DEFAULT_DAILY_EARNING_LIMIT;
  }
};

/**
 * Reset daily earning tracking (useful for testing or admin purposes)
 */
export const resetDailyEarningTracking = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(DAILY_EARNING_DATE_KEY);
    await AsyncStorage.removeItem(DAILY_EARNING_AMOUNT_KEY);
  } catch (error) {
    throw error;
  }
};

/**
 * Get today's earnings from database
 * This function should be implemented in database.ts
 */
export const getTodaysEarningsFromDB = async (profileId?: string): Promise<number> => {
  try {
    // This will be implemented in database.ts
    return await getTodaysEarnings(profileId);
  } catch (error) {
    return 0;
  }
}; 