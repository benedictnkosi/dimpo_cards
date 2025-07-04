// Simple database wrapper for scripts
// This file provides a JavaScript interface to the database functions

import { initDatabase as initDB, getAllQuestions as getAllQ, insertQuestionReport as insertQR, getQuestionStatistics as getQS, getLearnerProgressByTopic as getLPT } from '../services/database.js';

// Export functions with simpler names for scripts
export const initDatabase = initDB;
export const getAllQuestions = getAllQ;
export const insertQuestionReport = insertQR;
export const getQuestionStatistics = getQS;
export const getLearnerProgressByTopic = getLPT; 