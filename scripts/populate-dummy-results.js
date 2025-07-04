/**
 * Generate a random date within a specified range
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @returns {string} ISO date string
 */
function getRandomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
}

/**
 * Generate realistic dummy results for all questions
 * @param {number} attemptsPerQuestion - Number of attempts per question (default: 1-3)
 * @param {number} accuracyRate - Target accuracy rate as percentage (default: 70)
 */
async function populateDummyResults(attemptsPerQuestion = { min: 1, max: 3 }, accuracyRate = 70) {
  console.log('🎯 Populating dummy results for all questions...');
  
  try {
    // Dynamically import database functions
    const { 
      initDatabase, 
      getAllQuestions, 
      insertQuestionReport, 
      getQuestionStatistics,
      getLearnerProgressByTopic 
    } = await import('../services/database.ts');
    
    // Initialize database
    initDatabase();
    console.log('✅ Database initialized');
    
    // Get all questions
    console.log('\n📚 Fetching all questions...');
    const allQuestions = await getAllQuestions();
    console.log(`✅ Found ${allQuestions.length} questions`);
    
    if (allQuestions.length === 0) {
      console.log('❌ No questions found in database. Please populate questions first.');
      return;
    }
    
    // Generate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
    
    let totalReports = 0;
    let correctReports = 0;
    let incorrectReports = 0;
    
    console.log('\n📝 Generating dummy results...');
    console.log(`📅 Date range: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
    console.log(`🎯 Target accuracy: ${accuracyRate}%`);
    
    // Process each question
    for (const question of allQuestions) {
      // Determine number of attempts for this question
      const attempts = Math.floor(Math.random() * (attemptsPerQuestion.max - attemptsPerQuestion.min + 1)) + attemptsPerQuestion.min;
      
      // Track if this question has been answered correctly at least once
      let hasCorrectAnswer = false;
      
      for (let attempt = 1; attempt <= attempts; attempt++) {
        // Generate random date for this attempt
        const attemptDate = getRandomDate(startDate, endDate);
        
        // Determine if this attempt is correct
        let isCorrect;
        if (attempt === attempts && !hasCorrectAnswer) {
          // If this is the last attempt and we haven't had a correct answer yet,
          // make it more likely to be correct to maintain reasonable accuracy
          isCorrect = Math.random() < 0.8;
        } else {
          // Normal accuracy distribution
          isCorrect = Math.random() < (accuracyRate / 100);
        }
        
        if (isCorrect) {
          hasCorrectAnswer = true;
          correctReports++;
        } else {
          incorrectReports++;
        }
        
        // Insert the question report
        await insertQuestionReport(question.question_id, isCorrect ? 'correct' : 'incorrect');
        totalReports++;
        
        // Add some delay to avoid overwhelming the database
        if (totalReports % 100 === 0) {
          console.log(`   Processed ${totalReports} reports...`);
        }
      }
    }
    
    console.log('\n✅ Dummy results generation completed!');
    console.log(`📊 Summary:`);
    console.log(`   Total questions: ${allQuestions.length}`);
    console.log(`   Total reports: ${totalReports}`);
    console.log(`   Correct answers: ${correctReports}`);
    console.log(`   Incorrect answers: ${incorrectReports}`);
    console.log(`   Actual accuracy: ${((correctReports / totalReports) * 100).toFixed(1)}%`);
    
    // Get and display statistics
    console.log('\n📈 Current statistics:');
    const stats = await getQuestionStatistics();
    console.log(`   Total Answers: ${stats.total_answers}`);
    console.log(`   Correct Answers: ${stats.correct_answers}`);
    console.log(`   Incorrect Answers: ${stats.incorrect_answers}`);
    console.log(`   Overall Accuracy: ${stats.accuracy_percentage}%`);
    
    // Get and display progress by topic
    console.log('\n📋 Progress by topic:');
    const progressByTopic = await getLearnerProgressByTopic();
    progressByTopic.slice(0, 10).forEach((topic, index) => {
      console.log(`   ${index + 1}. ${topic.main_topic} - ${topic.sub_topic}: ${topic.accuracy_percentage}% (${topic.answered_questions}/${topic.total_questions})`);
    });
    
    if (progressByTopic.length > 10) {
      console.log(`   ... and ${progressByTopic.length - 10} more topics`);
    }
    
    console.log('\n🎉 Dummy results population completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during dummy results population:', error);
    throw error;
  }
}

/**
 * Clear all existing question reports (use with caution!)
 */
async function clearAllQuestionReports() {
  console.log('🗑️ Clearing all question reports...');
  
  try {
    const { initDatabase } = await import('../services/database.ts');
    initDatabase();
    
    // This would require a new function in database.ts
    // For now, we'll just warn the user
    console.log('⚠️  Clear function not implemented. Please manually clear question_report table if needed.');
    
  } catch (error) {
    console.error('❌ Error clearing question reports:', error);
    throw error;
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'populate':
      const attempts = args[1] ? parseInt(args[1]) : 3;
      const accuracy = args[2] ? parseInt(args[2]) : 70;
      await populateDummyResults({ min: 1, max: attempts }, accuracy);
      break;
      
    case 'clear':
      await clearAllQuestionReports();
      break;
      
    case 'stats':
      const { initDatabase, getQuestionStatistics } = await import('../services/database.ts');
      initDatabase();
      const stats = await getQuestionStatistics();
      console.log('📊 Current Statistics:');
      console.log(`   Total Answers: ${stats.total_answers}`);
      console.log(`   Correct Answers: ${stats.correct_answers}`);
      console.log(`   Incorrect Answers: ${stats.incorrect_answers}`);
      console.log(`   Accuracy: ${stats.accuracy_percentage}%`);
      break;
      
    default:
      console.log('🎯 Dummy Results Population Script');
      console.log('');
      console.log('Usage:');
      console.log('  node scripts/populate-dummy-results.js populate [attempts] [accuracy]');
      console.log('  node scripts/populate-dummy-results.js stats');
      console.log('');
      console.log('Examples:');
      console.log('  node scripts/populate-dummy-results.js populate');
      console.log('  node scripts/populate-dummy-results.js populate 5 75');
      console.log('  node scripts/populate-dummy-results.js stats');
      break;
  }
}

// Run the script if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { 
  populateDummyResults, 
  clearAllQuestionReports,
  getRandomDate 
}; 