// Simple script to test database population
// This can be run to verify the predefined topics are working correctly

const { populateDatabaseWithPredefinedTopics, getPredefinedTopicsCount } = require('../services/databaseUtils');

async function testDatabasePopulation() {
  try {
    console.log('Testing database population...');
    console.log(`Total predefined topics: ${getPredefinedTopicsCount()}`);
    
    await populateDatabaseWithPredefinedTopics();
    
    console.log('Database population test completed successfully!');
  } catch (error) {
    console.error('Error during database population test:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testDatabasePopulation();
}

module.exports = { testDatabasePopulation }; 