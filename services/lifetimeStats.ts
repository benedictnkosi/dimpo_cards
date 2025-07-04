import AsyncStorage from '@react-native-async-storage/async-storage';
import { getQuestionStatistics } from './database';
import { getDailyLimitInfo, isPremiumUser } from './dailyLimit';

const LIFETIME_STATS_KEY = 'lifetime_stats';
const LIFETIME_LIMIT = 100;
const MILESTONE_NOTIFICATIONS_KEY = 'milestone_notifications';

export interface LifetimeStats {
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  totalIncorrectAnswers: number;
  accuracyPercentage: number;
  lastUpdated: string;
  remainingQuestions: number;
  isLimitReached: boolean;
}

export interface MilestoneNotifications {
  milestone75: boolean;
  milestone50: boolean;
  milestone25: boolean;
}

export interface CombinedLimitInfo {
  daily: {
    count: number;
    limit: number;
    date: string;
    isLimitReached: boolean;
    isPremium: boolean;
  };
  lifetime: LifetimeStats;
}

/**
 * Get milestone notifications from storage
 */
const getMilestoneNotifications = async (): Promise<MilestoneNotifications> => {
  try {
    const stored = await AsyncStorage.getItem(MILESTONE_NOTIFICATIONS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      milestone75: false,
      milestone50: false,
      milestone25: false
    };
  } catch (error) {
    console.error('[LifetimeStats] Error reading milestone notifications:', error);
    return {
      milestone75: false,
      milestone50: false,
      milestone25: false
    };
  }
};

/**
 * Save milestone notifications to storage
 */
const saveMilestoneNotifications = async (notifications: MilestoneNotifications): Promise<void> => {
  try {
    await AsyncStorage.setItem(MILESTONE_NOTIFICATIONS_KEY, JSON.stringify(notifications));
  } catch (error) {
    console.error('[LifetimeStats] Error saving milestone notifications:', error);
  }
};

/**
 * Check if a milestone should be shown
 */
export const checkMilestoneNotification = async (remainingQuestions: number): Promise<{
  shouldShow: boolean;
  milestone: '75' | '50' | '25' | null;
  message: string;
}> => {
  try {
    const notifications = await getMilestoneNotifications();
    
    if (remainingQuestions <= 25 && !notifications.milestone25) {
      await saveMilestoneNotifications({ ...notifications, milestone25: true });
      return {
        shouldShow: true,
        milestone: '25',
        message: 'Only 25 questions remaining! Consider upgrading to Premium for unlimited access.'
      };
    }
    
    if (remainingQuestions <= 50 && !notifications.milestone50) {
      await saveMilestoneNotifications({ ...notifications, milestone50: true });
      return {
        shouldShow: true,
        milestone: '50',
        message: 'Halfway through your free questions! Only 50 questions remaining.'
      };
    }
    
    if (remainingQuestions <= 75 && !notifications.milestone75) {
      await saveMilestoneNotifications({ ...notifications, milestone75: true });
      return {
        shouldShow: true,
        milestone: '75',
        message: '75% of your free questions used! Only 25 questions remaining.'
      };
    }
    
    return {
      shouldShow: false,
      milestone: null,
      message: ''
    };
  } catch (error) {
    console.error('[LifetimeStats] Error checking milestone notification:', error);
    return {
      shouldShow: false,
      milestone: null,
      message: ''
    };
  }
};

/**
 * Get lifetime statistics from database and cache
 */
export const getLifetimeStats = async (): Promise<LifetimeStats> => {
  try {
    console.log('[LifetimeStats] getLifetimeStats called');
    // Always get from database
    const dbStats = await getQuestionStatistics();
    console.log('[LifetimeStats] DB stats fetched:', dbStats);
    const totalQuestionsAnswered = dbStats.total_answers;
    const remainingQuestions = Math.max(0, LIFETIME_LIMIT - totalQuestionsAnswered);
    const isLimitReached = totalQuestionsAnswered >= LIFETIME_LIMIT;
    const lifetimeStats: LifetimeStats = {
      totalQuestionsAnswered,
      totalCorrectAnswers: dbStats.correct_answers,
      totalIncorrectAnswers: dbStats.incorrect_answers,
      accuracyPercentage: dbStats.accuracy_percentage,
      lastUpdated: new Date().toISOString(),
      remainingQuestions,
      isLimitReached
    };
    console.log('[LifetimeStats] Returning lifetimeStats:', lifetimeStats);
    return lifetimeStats;
  } catch (error) {
    console.error('[LifetimeStats] Error getting lifetime stats from database:', error);
    // Return default stats if everything fails
    return {
      totalQuestionsAnswered: 0,
      totalCorrectAnswers: 0,
      totalIncorrectAnswers: 0,
      accuracyPercentage: 0,
      lastUpdated: new Date().toISOString(),
      remainingQuestions: LIFETIME_LIMIT,
      isLimitReached: false
    };
  }
};

/**
 * Update lifetime stats when a question is answered
 */
export const updateLifetimeStats = async (isCorrect: boolean): Promise<{
  stats: LifetimeStats;
  milestoneNotification?: {
    shouldShow: boolean;
    milestone: '75' | '50' | '25' | null;
    message: string;
  };
}> => {
  try {
    console.log('[LifetimeStats] updateLifetimeStats called. isCorrect:', isCorrect);
    // Always get the latest stats from the database
    const currentStats = await getLifetimeStats();
    console.log('[LifetimeStats] Current stats before update:', currentStats);
    const updatedStats: LifetimeStats = {
      totalQuestionsAnswered: currentStats.totalQuestionsAnswered + 1,
      totalCorrectAnswers: currentStats.totalCorrectAnswers + (isCorrect ? 1 : 0),
      totalIncorrectAnswers: currentStats.totalIncorrectAnswers + (isCorrect ? 0 : 1),
      accuracyPercentage: 0, // Will be calculated below
      lastUpdated: new Date().toISOString(),
      remainingQuestions: 0, // Will be calculated below
      isLimitReached: false // Will be calculated below
    };
    // Calculate new accuracy percentage
    updatedStats.accuracyPercentage = updatedStats.totalQuestionsAnswered > 0 
      ? Math.round((updatedStats.totalCorrectAnswers / updatedStats.totalQuestionsAnswered) * 100 * 100) / 100
      : 0;
    // Calculate remaining questions and limit status
    updatedStats.remainingQuestions = Math.max(0, LIFETIME_LIMIT - updatedStats.totalQuestionsAnswered);
    updatedStats.isLimitReached = updatedStats.totalQuestionsAnswered >= LIFETIME_LIMIT;
    console.log('[LifetimeStats] Updated stats after answering:', updatedStats);
    // Check for milestone notification
    const milestoneNotification = await checkMilestoneNotification(updatedStats.remainingQuestions);
    console.log('[LifetimeStats] Milestone notification:', milestoneNotification);
    return {
      stats: updatedStats,
      milestoneNotification
    };
  } catch (error) {
    console.error('[LifetimeStats] Error updating lifetime stats:', error);
    throw error;
  }
};

/**
 * Get combined daily and lifetime limit information
 */
export const getCombinedLimitInfo = async (customerInfo: any): Promise<CombinedLimitInfo> => {
  try {
    const [dailyLimitInfo, lifetimeStats] = await Promise.all([
      getDailyLimitInfo(customerInfo),
      getLifetimeStats()
    ]);
    console.log('[LifetimeStats] Daily stats fetched:', dailyLimitInfo);
    console.log('[LifetimeStats] Lifetime stats fetched:', lifetimeStats);
    const combined = {
      daily: dailyLimitInfo,
      lifetime: lifetimeStats
    };
    console.log('[LifetimeStats] Returning combined limit info:', combined);
    return combined;
  } catch (error) {
    console.error('[LifetimeStats] Error getting combined limit info:', error);
    throw error;
  }
};

/**
 * Check if user can answer more questions (considering both daily and lifetime limits)
 */
export const canAnswerLifetimeQuestion = async (customerInfo: any): Promise<boolean> => {
  try {
    const lifetimeStats = await getLifetimeStats();
    
    // Premium users have unlimited lifetime questions
    if (customerInfo && isPremiumUser(customerInfo)) {
      return true;
    }
    
    return !lifetimeStats.isLimitReached;
  } catch (error) {
    console.error('[LifetimeStats] Error checking lifetime question limit:', error);
    return true; // Allow on error to avoid blocking user experience
  }
};

/**
 * Reset lifetime stats (useful for testing)
 */
export const resetLifetimeStats = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LIFETIME_STATS_KEY);
    await AsyncStorage.removeItem(MILESTONE_NOTIFICATIONS_KEY);
    console.log('[LifetimeStats] Lifetime stats reset successfully');
  } catch (error) {
    console.error('[LifetimeStats] Error resetting lifetime stats:', error);
    throw error;
  }
};

/**
 * Get the lifetime limit constant
 */
export const getLifetimeLimit = (): number => {
  return LIFETIME_LIMIT;
}; 