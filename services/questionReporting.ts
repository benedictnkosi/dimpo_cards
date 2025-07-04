import { insertQuestionReport } from './database';
import { canAnswerQuestion, incrementDailyCount, getDailyLimitInfo } from './dailyLimit';
import { updateLifetimeStats, canAnswerLifetimeQuestion } from './lifetimeStats';

/**
 * Log a question answer to the database with daily and lifetime limit checks
 * @param questionId - The unique identifier of the question
 * @param isCorrect - Whether the answer was correct or not
 * @param customerInfo - RevenueCat customer info to check subscription status
 */
export const logQuestionAnswer = async (
  questionId: string, 
  isCorrect: boolean, 
  customerInfo?: any
): Promise<{ 
  success: boolean; 
  limitReached?: boolean; 
  dailyLimitInfo?: any;
  lifetimeLimitReached?: boolean;
  milestoneNotification?: {
    shouldShow: boolean;
    milestone: '75' | '50' | '25' | null;
    message: string;
  };
}> => {
  try {
    // Check if user can answer more questions today
    const canAnswerDaily = await canAnswerQuestion(customerInfo);
    
    if (!canAnswerDaily) {
      console.log(`[QuestionReporting] Daily limit reached for question ${questionId}`);
      return { 
        success: false, 
        limitReached: true,
        dailyLimitInfo: await getDailyLimitInfo(customerInfo)
      };
    }
    
    // Check if user can answer more lifetime questions
    const canAnswerLifetime = await canAnswerLifetimeQuestion(customerInfo);
    
    if (!canAnswerLifetime) {
      console.log(`[QuestionReporting] Lifetime limit reached for question ${questionId}`);
      return { 
        success: false, 
        lifetimeLimitReached: true
      };
    }
    
    // Log the answer to database
    const outcome: 'correct' | 'incorrect' = isCorrect ? 'correct' : 'incorrect';
    await insertQuestionReport(questionId, outcome);
    
    // Update lifetime stats and check for milestone notifications
    const lifetimeUpdate = await updateLifetimeStats(isCorrect);
    
    // Increment daily count
    const dailyLimitInfo = await incrementDailyCount();
    
    console.log(`[QuestionReporting] Logged answer for question ${questionId}: ${outcome}`);
    console.log(`[QuestionReporting] Daily count: ${dailyLimitInfo.count}/${dailyLimitInfo.limit}`);
    console.log(`[QuestionReporting] Lifetime remaining: ${lifetimeUpdate.stats.remainingQuestions}`);
    
    return { 
      success: true, 
      dailyLimitInfo,
      milestoneNotification: lifetimeUpdate.milestoneNotification
    };
  } catch (error) {
    console.error('[QuestionReporting] Error logging question answer:', error);
    // Don't throw the error to avoid breaking the user experience
    return { success: false };
  }
};

/**
 * Log a question answer with additional context and daily/lifetime limit checks
 * @param questionId - The unique identifier of the question
 * @param isCorrect - Whether the answer was correct or not
 * @param customerInfo - RevenueCat customer info to check subscription status
 * @param context - Additional context about the question (optional)
 */
export const logQuestionAnswerWithContext = async (
  questionId: string, 
  isCorrect: boolean, 
  customerInfo?: any,
  context?: {
    topicName?: string;
    subtopicName?: string;
    levelName?: string;
    questionType?: string;
  }
): Promise<{ 
  success: boolean; 
  limitReached?: boolean; 
  dailyLimitInfo?: any;
  lifetimeLimitReached?: boolean;
  milestoneNotification?: {
    shouldShow: boolean;
    milestone: '75' | '50' | '25' | null;
    message: string;
  };
}> => {
  try {
    // Check if user can answer more questions today
    const canAnswerDaily = await canAnswerQuestion(customerInfo);
    
    if (!canAnswerDaily) {
      console.log(`[QuestionReporting] Daily limit reached for question ${questionId}`);
      return { 
        success: false, 
        limitReached: true,
        dailyLimitInfo: await getDailyLimitInfo(customerInfo)
      };
    }
    
    // Check if user can answer more lifetime questions
    const canAnswerLifetime = await canAnswerLifetimeQuestion(customerInfo);
    
    if (!canAnswerLifetime) {
      console.log(`[QuestionReporting] Lifetime limit reached for question ${questionId}`);
      return { 
        success: false, 
        lifetimeLimitReached: true
      };
    }
    
    // Log the answer to database
    const outcome: 'correct' | 'incorrect' = isCorrect ? 'correct' : 'incorrect';
    await insertQuestionReport(questionId, outcome);
    
    // Update lifetime stats and check for milestone notifications
    const lifetimeUpdate = await updateLifetimeStats(isCorrect);
    
    // Increment daily count
    const dailyLimitInfo = await incrementDailyCount();
    
    console.log(`[QuestionReporting] Logged answer for question ${questionId}: ${outcome}`, {
      context,
      timestamp: new Date().toISOString(),
      dailyCount: dailyLimitInfo.count,
      dailyLimit: dailyLimitInfo.limit,
      lifetimeRemaining: lifetimeUpdate.stats.remainingQuestions
    });
    
    return { 
      success: true, 
      dailyLimitInfo,
      milestoneNotification: lifetimeUpdate.milestoneNotification
    };
  } catch (error) {
    console.error('[QuestionReporting] Error logging question answer with context:', error);
    // Don't throw the error to avoid breaking the user experience
    return { success: false };
  }
}; 