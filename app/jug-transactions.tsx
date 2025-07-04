import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { 
  ScrollView, 
  StyleSheet, 
  View, 
  Pressable, 
  TextInput, 
  Alert, 
  Modal as RNModal,
  ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/contexts/ThemeContext';
import { useDatabase } from '@/hooks/useDatabase';
import { DatabaseLoading } from '@/components/DatabaseLoading';
import { 
  getSavingsJugById,
  getSavingsTransactionsByJugId,
  deleteSavingsJug,
  getAllSavingsJugs
} from '@/services/database';
import { 
  addMoneyToJug,
  removeMoneyFromJug,
  transferBetweenJugs
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

export default function JugTransactionsScreen() {
  const { jugId } = useLocalSearchParams<{ jugId: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { isInitialized, isLoading: isDatabaseLoading } = useDatabase();

  const [jug, setJug] = useState<SavingsJug | null>(null);
  const [transactions, setTransactions] = useState<SavingsTransaction[]>([]);
  const [allJugs, setAllJugs] = useState<SavingsJug[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal states
  const [showAddMoneyModal, setShowAddMoneyModal] = useState(false);
  const [showRemoveMoneyModal, setShowRemoveMoneyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  
  // Form states
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionName, setTransactionName] = useState('');
  const [selectedDestinationJugId, setSelectedDestinationJugId] = useState<number | null>(null);

  useEffect(() => {
    if (isInitialized && !isDatabaseLoading && jugId) {
      loadJugData();
    }
  }, [isInitialized, isDatabaseLoading, jugId]);

  const loadJugData = async () => {
    if (!jugId) return;
    
    try {
      setIsLoading(true);
      setError(null);

      const jugIdNum = parseInt(jugId);
      const jugData = await getSavingsJugById(jugIdNum);
      if (!jugData) {
        setError('Jug not found');
        return;
      }
      setJug(jugData);

      const transactionsData = await getSavingsTransactionsByJugId(jugIdNum);
      setTransactions(transactionsData);

      // Load all jugs for transfer selection
      const allJugsData = await getAllSavingsJugs();
      setAllJugs(allJugsData);

      setIsLoading(false);
    } catch (error) {
      setError('Failed to load jug data');
      setIsLoading(false);
      console.error('Error loading jug data:', error);
    }
  };

  const handleAddMoney = async () => {
    if (!jug || !transactionAmount || !transactionName.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid positive amount');
      return;
    }

    try {
      await addMoneyToJug(jug.id, amount, transactionName.trim(), '1'); // Using default profile_id
      setTransactionAmount('');
      setTransactionName('');
      setShowAddMoneyModal(false);
      await loadJugData();
    } catch (error) {
      setError('Failed to add money to jug');
      console.error('Error adding money to jug:', error);
    }
  };

  const handleRemoveMoney = async () => {
    if (!jug || !transactionAmount || !transactionName.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid positive amount');
      return;
    }

    if (jug.balance < amount) {
      Alert.alert('Error', 'Insufficient funds in this savings jar');
      return;
    }

    try {
      await removeMoneyFromJug(jug.id, amount, transactionName.trim(), '1'); // Using default profile_id
      setTransactionAmount('');
      setTransactionName('');
      setShowRemoveMoneyModal(false);
      await loadJugData();
    } catch (error) {
      setError('Failed to withdraw from jug');
      console.error('Error withdrawing from jug:', error);
    }
  };

  const handleTransferMoney = async () => {
    if (!jug || !selectedDestinationJugId || !transactionAmount) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid positive amount');
      return;
    }

    if (jug.balance < amount) {
      Alert.alert('Error', 'Insufficient funds in this savings jar');
      return;
    }

    if (jug.id === selectedDestinationJugId) {
      Alert.alert('Error', 'Cannot transfer to the same savings jar');
      return;
    }

    try {
      await transferBetweenJugs(jug.id, selectedDestinationJugId, amount, 'Transfer', '1'); // Using default profile_id
      setTransactionAmount('');
      setSelectedDestinationJugId(null);
      setShowTransferModal(false);
      await loadJugData();
    } catch (error) {
      setError('Failed to transfer money');
      console.error('Error transferring money:', error);
    }
  };



  const handleDeleteJug = async () => {
    if (!jug) return;

    try {
      await deleteSavingsJug(jug.id);
      setShowDeleteModal(false);
      router.back();
    } catch (error) {
      setError('Failed to delete savings jar');
      console.error('Error deleting savings jar:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Show database loading if database is not initialized
  if (!isInitialized || isDatabaseLoading) {
    return <DatabaseLoading message="Loading..." />;
  }

  if (!jugId) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>No jug ID provided</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <ThemedText style={styles.loadingText}>Loading...</ThemedText>
          </View>
        ) : error ? (
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        ) : jug ? (
          <View>
            {/* Header */}
            

            {/* Jug Info Card */}
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.jugCard}
            >
              <Pressable
                style={styles.jugBackIcon}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </Pressable>
              <Pressable
                style={styles.jugDeleteIcon}
                onPress={() => setShowDeleteModal(true)}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${jug.name}`}
              >
                <Ionicons name="trash-outline" size={24} color="#fff" />
              </Pressable>
              <ThemedText style={styles.jugEmoji}>🐷</ThemedText>
              <ThemedText style={styles.jugName}>{jug.name}</ThemedText>
              <ThemedText style={styles.jugBalance}>{formatCurrency(jug.balance)}</ThemedText>
            </LinearGradient>

            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.primary },
                  pressed && styles.actionButtonPressed,
                  (allJugs.length <= 1 || jug.balance <= 0) && { backgroundColor: colors.border }
                ]}
                onPress={() => setShowTransferModal(true)}
                disabled={allJugs.length <= 1 || jug.balance <= 0}
              >
                <ThemedText style={styles.actionButtonEmoji}>🔄</ThemedText>
                <ThemedText style={[
                  styles.actionButtonText,
                  { color: (allJugs.length <= 1 || jug.balance <= 0) ? colors.textSecondary : '#fff' }
                ]}>Transfer</ThemedText>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: '#dc2626' },
                  pressed && styles.actionButtonPressed,
                  jug.balance <= 0 && { backgroundColor: colors.border }
                ]}
                onPress={() => setShowRemoveMoneyModal(true)}
                disabled={jug.balance <= 0}
              >
                <ThemedText style={styles.actionButtonEmoji}>💸</ThemedText>
                <ThemedText style={[
                  styles.actionButtonText,
                  { color: jug.balance <= 0 ? colors.textSecondary : '#fff' }
                ]}>Withdraw</ThemedText>
              </Pressable>
            </View>

            {/* Transactions List */}
            <View style={styles.transactionsContainer}>
              <ThemedText style={[styles.transactionsTitle, { color: colors.text }]}>
                Transactions ({transactions.length})
              </ThemedText>
              {transactions.length === 0 ? (
                <View style={styles.emptyState}>
                  <ThemedText style={styles.emptyStateIcon}>📝</ThemedText>
                  <ThemedText style={[styles.emptyStateText, { color: colors.textSecondary }]}>No transactions yet</ThemedText>
                </View>
              ) : (
                transactions.map((transaction) => (
                  <View key={transaction.id} style={[styles.transactionCard, { 
                    backgroundColor: colors.card,
                    borderColor: colors.border 
                  }]}>
                    <View style={styles.transactionHeader}>
                      <ThemedText style={[styles.transactionName, { color: colors.text }]}>
                        {transaction.transaction_name}
                      </ThemedText>
                      <ThemedText style={[
                        styles.transactionAmount,
                        { color: transaction.amount >= 0 ? '#059669' : '#dc2626' }
                      ]}>
                        {transaction.amount >= 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                      </ThemedText>
                    </View>
                    <ThemedText style={[styles.transactionDate, { color: colors.textSecondary }]}>
                      {formatDate(transaction.date)}
                    </ThemedText>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : (
          <ThemedText style={styles.errorText}>Jug not found</ThemedText>
        )}
      </ThemedView>

      {/* Add Money Modal */}
      <RNModal visible={showAddMoneyModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.modalTitle, { color: colors.text }]}>
              Add Money to {jug?.name}
            </ThemedText>
            <TextInput
              style={[styles.modalInput, { 
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text
              }]}
              placeholder="Amount..."
              placeholderTextColor={colors.textSecondary}
              value={transactionAmount}
              onChangeText={setTransactionAmount}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.modalInput, { 
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text
              }]}
              placeholder="Transaction name (e.g., Monthly deposit)"
              placeholderTextColor={colors.textSecondary}
              value={transactionName}
              onChangeText={setTransactionName}
            />
            <View style={styles.modalButtons}>
              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => {
                  setShowAddMoneyModal(false);
                  setTransactionAmount('');
                  setTransactionName('');
                }}
              >
                <ThemedText style={[styles.modalButtonText, { color: colors.text }]}>Cancel</ThemedText>
              </Pressable>
              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleAddMoney}
              >
                <ThemedText style={[styles.modalButtonText, { color: '#fff' }]}>Add Money</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </RNModal>

      {/* Remove Money Modal */}
      <RNModal visible={showRemoveMoneyModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.modalTitle, { color: colors.text }]}>
              Withdraw Savings
            </ThemedText>
            <TextInput
              style={[styles.modalInput, { 
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text
              }]}
              placeholder="Amount..."
              placeholderTextColor={colors.textSecondary}
              value={transactionAmount}
              onChangeText={setTransactionAmount}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.modalInput, { 
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text
              }]}
              placeholder="Transaction name (e.g., Emergency expense)"
              placeholderTextColor={colors.textSecondary}
              value={transactionName}
              onChangeText={setTransactionName}
            />
            <View style={styles.modalButtons}>
              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => {
                  setShowRemoveMoneyModal(false);
                  setTransactionAmount('');
                  setTransactionName('');
                }}
              >
                <ThemedText style={[styles.modalButtonText, { color: colors.text }]}>Cancel</ThemedText>
              </Pressable>
              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleRemoveMoney}
              >
                <ThemedText style={[styles.modalButtonText, { color: '#fff' }]}>Confirm</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </RNModal>

      {/* Transfer Money Modal */}
      <RNModal visible={showTransferModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.modalTitle, { color: colors.text }]}>
              Transfer from {jug?.name}
            </ThemedText>
            <TextInput
              style={[styles.modalInput, { 
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text
              }]}
              placeholder="Amount..."
              placeholderTextColor={colors.textSecondary}
              value={transactionAmount}
              onChangeText={setTransactionAmount}
              keyboardType="numeric"
            />
            
            {/* Destination Jug Selection */}
            <View style={styles.jugSelectionContainer}>
              <ThemedText style={[styles.jugSelectionLabel, { color: colors.text }]}>Transfer to:</ThemedText>
              <ScrollView style={styles.jugSelectionScroll} showsVerticalScrollIndicator={false}>
                {allJugs
                  .filter(otherJug => otherJug.id !== jug?.id)
                  .map((otherJug) => (
                    <Pressable
                      key={otherJug.id}
                      style={[
                        styles.jugSelectionItem,
                        { 
                          borderColor: colors.border,
                          backgroundColor: selectedDestinationJugId === otherJug.id ? colors.background : colors.card
                        }
                      ]}
                      onPress={() => setSelectedDestinationJugId(otherJug.id)}
                    >
                      <ThemedText style={styles.jugSelectionEmoji}>🐷</ThemedText>
                      <View style={styles.jugSelectionInfo}>
                        <ThemedText style={[styles.jugSelectionName, { color: colors.text }]}>{otherJug.name}</ThemedText>
                        <ThemedText style={[styles.jugSelectionBalance, { color: colors.textSecondary }]}>
                          {formatCurrency(otherJug.balance)}
                        </ThemedText>
                      </View>
                      {selectedDestinationJugId === otherJug.id && (
                        <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                      )}
                    </Pressable>
                  ))}
              </ScrollView>
            </View>

            <View style={styles.modalButtons}>
              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => {
                  setShowTransferModal(false);
                  setTransactionAmount('');
                  setSelectedDestinationJugId(null);
                }}
              >
                <ThemedText style={[styles.modalButtonText, { color: colors.text }]}>Cancel</ThemedText>
              </Pressable>
              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleTransferMoney}
              >
                <ThemedText style={[styles.modalButtonText, { color: '#fff' }]}>Transfer</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </RNModal>



      {/* Delete Jug Modal */}
      <RNModal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.modalTitle, { color: colors.text }]}>Delete Savings Jar</ThemedText>
            <ThemedText style={[styles.modalText, { color: colors.text }]}>
              Are you sure you want to delete "{jug?.name}"? This will also delete all its transactions.
            </ThemedText>
            <View style={styles.modalButtons}>
              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => setShowDeleteModal(false)}
              >
                <ThemedText style={[styles.modalButtonText, { color: colors.text }]}>Cancel</ThemedText>
              </Pressable>
              <Pressable 
                style={[styles.modalButton, { backgroundColor: '#dc2626' }]}
                onPress={handleDeleteJug}
              >
                <ThemedText style={[styles.modalButtonText, { color: '#fff' }]}>Delete</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </RNModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    opacity: 0.7,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 24,
    marginTop: 32,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    paddingLeft: 10,
  },
  jugCard: {
    marginHorizontal: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 42,
  },
  jugBackIcon: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.18)',
    zIndex: 2,
  },
  jugDeleteIcon: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.18)',
    zIndex: 2,
  },
  jugEmoji: {
    fontSize: 48,
    marginBottom: 12,
    paddingTop: 24,
  },
  jugName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    paddingTop: 12,
  },
  jugBalance: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    paddingTop: 12,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  actionButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  actionButtonEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  transactionsContainer: {
    paddingHorizontal: 20,
  },
  transactionsTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
  },
  transactionCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  transactionName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  transactionDate: {
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    padding: 24,
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#3b82f6',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  jugSelectionContainer: {
    marginBottom: 20,
  },
  jugSelectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  jugSelectionScroll: {
    maxHeight: 200,
  },
  jugSelectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  jugSelectionEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  jugSelectionInfo: {
    flex: 1,
  },
  jugSelectionName: {
    fontSize: 16,
    fontWeight: '600',
  },
  jugSelectionBalance: {
    fontSize: 14,
  },
}); 