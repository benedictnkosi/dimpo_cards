import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable, TextInput, Alert } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/contexts/ThemeContext';
import { useDatabase } from '@/hooks/useDatabase';
import { DatabaseLoading } from '@/components/DatabaseLoading';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  getAllSavingsJugs, 
  getSavingsStatistics, 
  getAllSavingsTransactions,
  insertSavingsJug,
  deleteSavingsJug,
  getAllProfiles
} from '@/services/database';
import { 
  initializeSavingsWithSampleData,
  addMoneyToJug,
  removeMoneyFromJug,
  getSavingsSummary
} from '@/services/savingsService';

interface SavingsJug {
  id: number;
  name: string;
  balance: number;
  created: string;
  updated: string;
}

interface SavingsTransaction {
  id: number;
  savings_jug_id: number;
  transaction_name: string;
  amount: number;
  date: string;
  created: string;
}

export default function SavingsTestScreen() {
  const [jugs, setJugs] = useState<SavingsJug[]>([]);
  const [transactions, setTransactions] = useState<SavingsTransaction[]>([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentProfileId, setCurrentProfileId] = useState<string>('');
  
  // Form states
  const [newJugName, setNewJugName] = useState('');
  const [selectedJugId, setSelectedJugId] = useState<number | null>(null);
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionName, setTransactionName] = useState('');

  const { colors } = useTheme();
  const { isInitialized, isLoading: isDatabaseLoading } = useDatabase();

  // Load current profile ID
  useEffect(() => {
    const loadCurrentProfile = async () => {
      try {
        const selectedProfileUid = await AsyncStorage.getItem('selectedProfileUid');
        if (selectedProfileUid) {
          const profiles = await getAllProfiles();
          const selectedProfile = profiles.find(p => p.uid === selectedProfileUid);
          if (selectedProfile) {
            setCurrentProfileId(selectedProfile.uid);
          }
        }
      } catch (error) {
        console.error('Error loading current profile:', error);
      }
    };
    loadCurrentProfile();
  }, []);

  useEffect(() => {
    if (isInitialized && !isDatabaseLoading && currentProfileId) {
      loadSavingsData();
    }
  }, [isInitialized, isDatabaseLoading, currentProfileId]);

  const loadSavingsData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all savings jars
      const allJugs = await getAllSavingsJugs(currentProfileId);
      setJugs(allJugs);

      // Load all transactions
      const allTransactions = await getAllSavingsTransactions(currentProfileId);
      setTransactions(allTransactions);

      // Load statistics
      const stats = await getSavingsStatistics(currentProfileId);
      setStatistics(stats);

      // Load summary
      const savingsSummary = await getSavingsSummary(currentProfileId);
      setSummary(savingsSummary);

      setLoading(false);
    } catch (error) {
      setError('Failed to load savings data');
      setLoading(false);
      console.error('Error loading savings data:', error);
    }
  };

  const handleInitializeSavings = async () => {
    try {
      setLoading(true);
      await initializeSavingsWithSampleData(currentProfileId);
      await loadSavingsData();
    } catch (error) {
      setError('Failed to initialize savings');
      console.error('Error initializing savings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJug = async () => {
    if (!newJugName.trim()) {
      Alert.alert('Error', 'Please enter a jug name');
      return;
    }

    try {
      await insertSavingsJug({ name: newJugName.trim(), emoji: '💰', profile_id: currentProfileId });
      setNewJugName('');
      await loadSavingsData();
    } catch (error) {
      setError('Failed to create savings jar');
      console.error('Error creating savings jar:', error);
    }
  };

  const handleDeleteJug = async (jugId: number) => {
    Alert.alert(
      'Delete Savings Jar',
      'Are you sure you want to delete this savings jar? This will also delete all its transactions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSavingsJug(jugId);
              await loadSavingsData();
            } catch (error) {
              setError('Failed to delete savings jar');
              console.error('Error deleting savings jar:', error);
            }
          }
        }
      ]
    );
  };

  const handleAddMoney = async () => {
    if (!selectedJugId || !transactionAmount || !transactionName.trim()) {
      Alert.alert('Error', 'Please select a jug, enter amount and transaction name');
      return;
    }

    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid positive amount');
      return;
    }

    try {
      await addMoneyToJug(selectedJugId, amount, transactionName.trim(), currentProfileId);
      setTransactionAmount('');
      setTransactionName('');
      setSelectedJugId(null);
      await loadSavingsData();
    } catch (error) {
      setError('Failed to add money to jug');
      console.error('Error adding money to jug:', error);
    }
  };

  const handleRemoveMoney = async () => {
    if (!selectedJugId || !transactionAmount || !transactionName.trim()) {
      Alert.alert('Error', 'Please select a jug, enter amount and transaction name');
      return;
    }

    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid positive amount');
      return;
    }

    try {
      await removeMoneyFromJug(selectedJugId, amount, transactionName.trim(), currentProfileId);
      setTransactionAmount('');
      setTransactionName('');
      setSelectedJugId(null);
      await loadSavingsData();
    } catch (error) {
      setError('Failed to remove money from jug');
      console.error('Error removing money from jug:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 20,
      color: colors.text,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 10,
      color: colors.text,
    },
    statsContainer: {
      backgroundColor: colors.surface,
      padding: 15,
      borderRadius: 10,
      marginBottom: 15,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 5,
    },
    statLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    jugCard: {
      backgroundColor: colors.surface,
      padding: 15,
      borderRadius: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    jugHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 5,
    },
    jugName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    jugBalance: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.primary,
    },
    jugInfo: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    transactionCard: {
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    transactionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 3,
    },
    transactionName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    transactionAmount: {
      fontSize: 14,
      fontWeight: '600',
    },
    transactionDate: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    button: {
      backgroundColor: colors.primary,
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginBottom: 15,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    dangerButton: {
      backgroundColor: '#dc2626',
      padding: 8,
      borderRadius: 6,
      alignItems: 'center',
      marginLeft: 10,
    },
    dangerButtonText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      marginBottom: 10,
      color: colors.text,
    },
    formSection: {
      backgroundColor: colors.surface,
      padding: 15,
      borderRadius: 10,
      marginBottom: 15,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 10,
    },
    errorText: {
      color: 'red',
      fontSize: 16,
      marginBottom: 15,
    },
  });

  if (!isInitialized || isDatabaseLoading) {
    return <DatabaseLoading message="Loading savings..." />;
  }

  return (
    <ScrollView style={styles.container}>
      <ThemedText style={styles.title}>💰 Savings Test</ThemedText>

      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      <Pressable style={styles.button} onPress={handleInitializeSavings}>
        <ThemedText style={styles.buttonText}>🔄 Initialize Savings with Sample Data</ThemedText>
      </Pressable>

      {loading ? (
        <ThemedText>Loading savings data...</ThemedText>
      ) : (
        <>
          {/* Statistics */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>📊 Statistics</ThemedText>
            {statistics && (
              <View style={styles.statsContainer}>
                <View style={styles.statRow}>
                  <ThemedText style={styles.statLabel}>Total Jugs:</ThemedText>
                  <ThemedText style={styles.statValue}>{statistics.total_jugs}</ThemedText>
                </View>
                <View style={styles.statRow}>
                  <ThemedText style={styles.statLabel}>Total Balance:</ThemedText>
                  <ThemedText style={styles.statValue}>{formatCurrency(statistics.total_balance)}</ThemedText>
                </View>
                <View style={styles.statRow}>
                  <ThemedText style={styles.statLabel}>Total Transactions:</ThemedText>
                  <ThemedText style={styles.statValue}>{statistics.total_transactions}</ThemedText>
                </View>
                <View style={styles.statRow}>
                  <ThemedText style={styles.statLabel}>Average Balance:</ThemedText>
                  <ThemedText style={styles.statValue}>{formatCurrency(statistics.average_balance)}</ThemedText>
                </View>
              </View>
            )}
          </View>

          {/* Create New Jug */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>➕ Create New Savings Goal</ThemedText>
            <View style={styles.formSection}>
              <TextInput
                style={styles.input}
                placeholder="Jug name..."
                placeholderTextColor={colors.textSecondary}
                value={newJugName}
                onChangeText={setNewJugName}
              />
              <Pressable style={styles.button} onPress={handleCreateJug}>
                <ThemedText style={styles.buttonText}>Create Goal</ThemedText>
              </Pressable>
            </View>
          </View>

          {/* Add/Remove Money */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>💸 Add/Remove Money</ThemedText>
            <View style={styles.formSection}>
              <TextInput
                style={styles.input}
                placeholder="Select jug (enter jar ID)..."
                placeholderTextColor={colors.textSecondary}
                value={selectedJugId?.toString() || ''}
                onChangeText={(text) => setSelectedJugId(parseInt(text) || null)}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                placeholder="Amount..."
                placeholderTextColor={colors.textSecondary}
                value={transactionAmount}
                onChangeText={setTransactionAmount}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                placeholder="Transaction name..."
                placeholderTextColor={colors.textSecondary}
                value={transactionName}
                onChangeText={setTransactionName}
              />
              <View style={styles.buttonRow}>
                <Pressable style={[styles.button, { flex: 1 }]} onPress={handleAddMoney}>
                  <ThemedText style={styles.buttonText}>➕ Add Money</ThemedText>
                </Pressable>
                <Pressable style={[styles.button, { flex: 1, backgroundColor: '#dc2626' }]} onPress={handleRemoveMoney}>
                  <ThemedText style={styles.buttonText}>➖ Remove Money</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Savings Jars */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>🏺 Savings Jars ({jugs.length})</ThemedText>
            {jugs.map((jug) => (
              <View key={jug.id} style={styles.jugCard}>
                <View style={styles.jugHeader}>
                  <ThemedText style={styles.jugName}>{jug.name}</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ThemedText style={styles.jugBalance}>{formatCurrency(jug.balance)}</ThemedText>
                    <Pressable 
                      style={styles.dangerButton} 
                      onPress={() => handleDeleteJug(jug.id)}
                    >
                      <ThemedText style={styles.dangerButtonText}>Delete</ThemedText>
                    </Pressable>
                  </View>
                </View>
                <ThemedText style={styles.jugInfo}>ID: {jug.id}</ThemedText>
                <ThemedText style={styles.jugInfo}>Created: {formatDate(jug.created)}</ThemedText>
                <ThemedText style={styles.jugInfo}>Updated: {formatDate(jug.updated)}</ThemedText>
              </View>
            ))}
          </View>

          {/* Recent Transactions */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>📝 Recent Transactions ({transactions.length})</ThemedText>
            {transactions.slice(0, 10).map((transaction) => (
              <View key={transaction.id} style={styles.transactionCard}>
                <View style={styles.transactionHeader}>
                  <ThemedText style={styles.transactionName}>{transaction.transaction_name}</ThemedText>
                  <ThemedText style={[
                    styles.transactionAmount,
                    { color: transaction.amount >= 0 ? '#059669' : '#dc2626' }
                  ]}>
                    {transaction.amount >= 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                  </ThemedText>
                </View>
                <ThemedText style={styles.transactionDate}>
                  Jug ID: {transaction.savings_jug_id} • {formatDate(transaction.date)}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Summary */}
          {summary && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>📋 Summary</ThemedText>
              <View style={styles.statsContainer}>
                <View style={styles.statRow}>
                  <ThemedText style={styles.statLabel}>Total Balance:</ThemedText>
                  <ThemedText style={styles.statValue}>{formatCurrency(summary.totalBalance)}</ThemedText>
                </View>
                {summary.topJug && (
                  <View style={styles.statRow}>
                    <ThemedText style={styles.statLabel}>Top Jug:</ThemedText>
                    <ThemedText style={styles.statValue}>
                      {summary.topJug.name} ({formatCurrency(summary.topJug.balance)})
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
} 