import {
  insertSavingsJug,
  getAllSavingsJugs,
  getSavingsJugById,
  updateSavingsJugBalance,
  deleteSavingsJug,
  insertSavingsTransaction,
  getSavingsTransactionsByJugId,
  getAllSavingsTransactions,
  getSavingsJugWithTransactions,
  getSavingsStatistics,
  clearAllSavingsData
} from './database';

// Sample savings jars data
const SAMPLE_SAVINGS_JUGS = [
  {
    name: 'Emergency Fund',
    balance: 0
  },
  {
    name: 'Vacation Fund',
    balance: 0
  },
  {
    name: 'Home Renovation',
    balance: 0
  },
  {
    name: 'Gift Fund',
    balance: 0
  }
];

// Sample transactions data
const SAMPLE_TRANSACTIONS = [
  {
    jugName: 'Emergency Fund',
    transaction_name: 'Monthly contribution',
    amount: 100,
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days ago
  },
  {
    jugName: 'Emergency Fund',
    transaction_name: 'Monthly contribution',
    amount: 100,
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days ago
  },
  {
    jugName: 'Vacation Fund',
    transaction_name: 'Bonus deposit',
    amount: 500,
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
  },
  {
    jugName: 'Gift Fund',
    transaction_name: 'Birthday money',
    amount: 75,
    date: new Date().toISOString() // Today
  }
];

// Initialize savings with sample data
export const initializeSavingsWithSampleData = async (profile_id: string): Promise<void> => {
  try {
    console.log('[SavingsService] Initializing savings with sample data...');
    
    // Check if savings jars already exist
    const existingJugs = await getAllSavingsJugs(profile_id);
    
    if (existingJugs.length > 0) {
      console.log('[SavingsService] Savings jugs already exist, skipping initialization');
      return;
    }
    
    // Create sample savings jars
    const jugIds: { [key: string]: number } = {};
    
    for (const jug of SAMPLE_SAVINGS_JUGS) {
      const emoji = (jug as any).emoji || '💰';
      const jugId = await insertSavingsJug({ name: jug.name, emoji, profile_id });
      jugIds[jug.name] = jugId;
      console.log(`[SavingsService] Created savings jar: ${jug.name} (ID: ${jugId})`);
    }
    
    // Add sample transactions
    for (const transaction of SAMPLE_TRANSACTIONS) {
      const jugId = jugIds[transaction.jugName];
      if (jugId) {
        await insertSavingsTransaction({
          savings_jug_id: jugId,
          transaction_name: transaction.transaction_name,
          amount: transaction.amount
        });
        // Update jug balance
        const jug = await getSavingsJugById(jugId, profile_id);
        if (jug) {
          const newBalance = jug.balance + transaction.amount;
          await updateSavingsJugBalance(jugId, newBalance);
        }
      }
    }
    
    console.log('[SavingsService] Successfully initialized savings with sample data');
    
    // Log statistics
    const stats = await getSavingsStatistics(profile_id);
    console.log('[SavingsService] Savings Statistics:', stats);
    
  } catch (error) {
    console.error('[SavingsService] Error initializing savings:', error);
    throw error;
  }
};

// Add money to a savings jar
export const addMoneyToJug = async (jugId: number, amount: number, transactionName: string, profile_id: string): Promise<void> => {
  try {
    // Get current jug
    const jug = await getSavingsJugById(jugId, profile_id);
    if (!jug) {
      throw new Error('Savings jug not found');
    }
    
    // Add transaction
    await insertSavingsTransaction({
      savings_jug_id: jugId,
      transaction_name: transactionName,
      amount: amount
    });
    
    // Update balance
    const newBalance = jug.balance + amount;
    await updateSavingsJugBalance(jugId, newBalance);
    
    console.log(`[SavingsService] Added ${amount} to ${jug.name}`);
  } catch (error) {
    console.error('[SavingsService] Error adding money to jug:', error);
    throw error;
  }
};

// Remove money from a savings jar
export const removeMoneyFromJug = async (jugId: number, amount: number, transactionName: string, profile_id: string): Promise<void> => {
  try {
    // Get current jug
    const jug = await getSavingsJugById(jugId, profile_id);
    if (!jug) {
      throw new Error('Savings jug not found');
    }
    
    if (jug.balance < amount) {
      throw new Error('Insufficient funds in savings jar');
    }
    
    // Add transaction (negative amount)
    await insertSavingsTransaction({
      savings_jug_id: jugId,
      transaction_name: transactionName,
      amount: -amount
    });
    
    // Update balance
    const newBalance = jug.balance - amount;
    await updateSavingsJugBalance(jugId, newBalance);
    
    console.log(`[SavingsService] Removed ${amount} from ${jug.name}`);
  } catch (error) {
    console.error('[SavingsService] Error removing money from jug:', error);
    throw error;
  }
};

// Transfer money between jugs
export const transferBetweenJugs = async (
  fromJugId: number, 
  toJugId: number, 
  amount: number, 
  transactionName: string,
  profile_id: string
): Promise<void> => {
  try {
    // Get both jugs
    const fromJug = await getSavingsJugById(fromJugId, profile_id);
    const toJug = await getSavingsJugById(toJugId, profile_id);
    
    if (!fromJug || !toJug) {
      throw new Error('One or both savings jars not found');
    }
    
    if (fromJug.balance < amount) {
      throw new Error('Insufficient funds in source savings jar');
    }
    
    // Remove from source jug
    await removeMoneyFromJug(fromJugId, amount, `Transfer to ${toJug.name}: ${transactionName}`, profile_id);
    
    // Add to destination jug
    await addMoneyToJug(toJugId, amount, `Transfer from ${fromJug.name}: ${transactionName}`, profile_id);
    
    console.log(`[SavingsService] Transferred ${amount} from ${fromJug.name} to ${toJug.name}`);
  } catch (error) {
    console.error('[SavingsService] Error transferring between jugs:', error);
    throw error;
  }
};

// Get jug balance history
export const getJugBalanceHistory = async (jugId: number, days: number = 30, profile_id: string): Promise<Array<{
  date: string;
  balance: number;
  transactions: number;
}>> => {
  try {
    const jug = await getSavingsJugById(jugId, profile_id);
    if (!jug) {
      throw new Error('Savings jug not found');
    }
    
    const transactions = await getSavingsTransactionsByJugId(jugId);
    
    // Group transactions by date
    const transactionsByDate = transactions.reduce((acc, transaction) => {
      const date = transaction.date.split('T')[0]; // Get just the date part
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(transaction);
      return acc;
    }, {} as Record<string, typeof transactions>);
    
    // Calculate balance for each date
    const balanceHistory: Array<{
      date: string;
      balance: number;
      transactions: number;
    }> = [];
    
    let runningBalance = 0;
    const sortedDates = Object.keys(transactionsByDate).sort();
    
    for (const date of sortedDates) {
      const dayTransactions = transactionsByDate[date];
      const dayTotal = dayTransactions.reduce((sum, t) => sum + t.amount, 0);
      runningBalance += dayTotal;
      
      balanceHistory.push({
        date,
        balance: runningBalance,
        transactions: dayTransactions.length
      });
    }
    
    return balanceHistory;
  } catch (error) {
    console.error('[SavingsService] Error getting jug balance history:', error);
    throw error;
  }
};

// Get savings summary
export const getSavingsSummary = async (profile_id: string): Promise<{
  totalBalance: number;
  totalJugs: number;
  totalTransactions: number;
  averageBalance: number;
  topJug: { name: string; balance: number } | null;
  recentTransactions: Array<{
    jugName: string;
    transaction_name: string;
    amount: number;
    date: string;
  }>;
}> => {
  try {
    const stats = await getSavingsStatistics(profile_id);
    const allJugs = await getAllSavingsJugs(profile_id);
    const allTransactions = await getAllSavingsTransactions(profile_id);
    
    // Find top jug by balance
    const topJug = allJugs.length > 0 ? {
      name: allJugs[0].name,
      balance: allJugs[0].balance
    } : null;
    
    // Get recent transactions (last 5)
    const recentTransactions = allTransactions.slice(0, 5).map(async (transaction) => {
      const jug = await getSavingsJugById(transaction.savings_jug_id, profile_id);
      return {
        jugName: jug?.name || 'Unknown',
        transaction_name: transaction.transaction_name,
        amount: transaction.amount,
        date: transaction.date
      };
    });
    
    const resolvedTransactions = await Promise.all(recentTransactions);
    
    return {
      totalBalance: stats.total_balance,
      totalJugs: stats.total_jugs,
      totalTransactions: stats.total_transactions,
      averageBalance: stats.average_balance,
      topJug,
      recentTransactions: resolvedTransactions
    };
  } catch (error) {
    console.error('[SavingsService] Error getting savings summary:', error);
    throw error;
  }
}; 