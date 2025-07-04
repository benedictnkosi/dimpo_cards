#!/usr/bin/env node

/**
 * Script to log question counts per subtopic
 * Run with: node scripts/log-question-counts.js
 */

import { initDatabase, logQuestionStatistics } from '../services/database.js';

async function main() {
  try {
    console.log('📊 Starting question count logging script...');
    
    // Initialize database
    initDatabase();
    console.log('📊 Database initialized');
    
    // Log comprehensive statistics
    await logQuestionStatistics();
    
    console.log('📊 Question count logging completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error in question count logging script:', error);
    process.exit(1);
  }
}

main(); 