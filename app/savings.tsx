import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable, TextInput, Alert, Modal } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/contexts/ThemeContext';
import { useDatabase } from '@/hooks/useDatabase';
import { DatabaseLoading } from '@/components/DatabaseLoading';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  getAllSavingsJugs, 
  getSavingsStatistics,
  insertSavingsJug,
  deleteSavingsJug,
  getAllProfiles
} from '@/services/database';
import { 
  addMoneyToJug,
  removeMoneyFromJug
} from '@/services/savingsService';

interface SavingsJug {
  id: number;
  name: string;
  balance: number;
  created: string;
  updated: string;
}

export default function SavingsScreen() {
  const [jugs, setJugs] = useState<SavingsJug[]>([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddMoneyModal, setShowAddMoneyModal] = useState(false);
  const [showRemoveMoneyModal, setShowRemoveMoneyModal] = useState(false);
  const [selectedJug, setSelectedJug] = useState<SavingsJug | null>(null);
  const [currentProfileId, setCurrentProfileId] = useState<string>('');
  
  // Form states
  const [newJugName, setNewJugName] = useState('');
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
        // Error loading current profile
      }
    };
    loadCurrentProfile();
  }, []);

  // Track currentProfileId changes
  useEffect(() => {
    // currentProfileId changed
  }, [currentProfileId]);

  useEffect(() => {
    if (isInitialized && !isDatabaseLoading && currentProfileId) {
      loadSavingsData();
    }
  }, [isInitialized, isDatabaseLoading, currentProfileId]);

  const loadSavingsData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all savings goals
      const allJugs = await getAllSavingsJugs(currentProfileId);
      setJugs(allJugs);

      // Load statistics
      const stats = await getSavingsStatistics(currentProfileId);
      setStatistics(stats);

      setLoading(false);
    } catch (error) {
      setError('Failed to load savings data');
      setLoading(false);
    }
  };

  const handleCreateJug = async () => {
    if (!newJugName.trim()) {
      Alert.alert('Error', 'Please enter a jug name');
      return;
    }

    if (!currentProfileId) {
      Alert.alert('Error', 'No profile selected');
      return;
    }

    try {
      const jugData = {
        name: newJugName.trim(),
        emoji: '💰',
        profile_id: currentProfileId
      };
      
      const jugId = await insertSavingsJug(jugData);
      
      setNewJugName('');
      setShowAddModal(false);
      
      await loadSavingsData();
    } catch (error) {
      setError('Failed to create savings goal');
    }
  };

  const handleDeleteJug = async (jug: SavingsJug) => {
    Alert.alert(
      'Delete savings goal',
      `Are you sure you want to delete "${jug.name}"? This will also delete all its transactions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSavingsJug(jug.id);
              await loadSavingsData();
            } catch (error) {
              setError('Failed to delete savings goal');
            }
          }
        }
      ]
    );
  };

  const handleAddMoney = async () => {
    if (!selectedJug || !transactionAmount || !transactionName.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid positive amount');
      return;
    }

    try {
      await addMoneyToJug(selectedJug.id, amount, transactionName.trim(), currentProfileId);
      setTransactionAmount('');
      setTransactionName('');
      setSelectedJug(null);
      setShowAddMoneyModal(false);
      await loadSavingsData();
    } catch (error) {
      setError('Failed to add money to jug');
    }
  };

  const handleRemoveMoney = async () => {
    if (!selectedJug || !transactionAmount || !transactionName.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid positive amount');
      return;
    }

    if (selectedJug.balance < amount) {
      Alert.alert('Error', 'Insufficient funds in this jug');
      return;
    }

    try {
      await removeMoneyFromJug(selectedJug.id, amount, transactionName.trim(), currentProfileId);
      setTransactionAmount('');
      setTransactionName('');
      setSelectedJug(null);
      setShowRemoveMoneyModal(false);
      await loadSavingsData();
    } catch (error) {
      setError('Failed to remove money from jug');
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
    header: {
      marginBottom: 20,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 8,
      color: colors.text,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    statsContainer: {
      backgroundColor: colors.surface,
      padding: 20,
      borderRadius: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statsTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 12,
      color: colors.text,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    statsLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    statsValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    emptyStateContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyStateIcon: {
      fontSize: 80,
      marginBottom: 20,
    },
    emptyStateTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 12,
      textAlign: 'center',
      color: colors.text,
    },
    emptyStateText: {
      fontSize: 16,
      textAlign: 'center',
      marginBottom: 40,
      color: colors.textSecondary,
      paddingHorizontal: 20,
    },
    bigButton: {
      backgroundColor: colors.primary,
      paddingVertical: 20,
      paddingHorizontal: 40,
      borderRadius: 16,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
    },
    bigButtonText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '600',
    },
    jugsContainer: {
      marginBottom: 20,
    },
    jugsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    jugsTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    smallButton: {
      backgroundColor: colors.primary,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
    },
    smallButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    jugCard: {
      backgroundColor: colors.surface,
      padding: 20,
      borderRadius: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    jugHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    jugName: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    jugBalance: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.primary,
      marginLeft: 12,
    },
    jugActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    actionButton: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    addButton: {
      backgroundColor: '#059669',
    },
    removeButton: {
      backgroundColor: '#dc2626',
    },
    deleteButton: {
      backgroundColor: '#6b7280',
    },
    actionButtonText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: colors.surface,
      padding: 24,
      borderRadius: 16,
      width: '90%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 20,
      color: colors.text,
    },
    modalInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      color: colors.text,
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
      backgroundColor: colors.primary,
    },
    modalButtonSecondary: {
      backgroundColor: colors.border,
    },
    modalButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    modalButtonTextPrimary: {
      color: '#fff',
    },
    modalButtonTextSecondary: {
      color: colors.text,
    },
    errorText: {
      color: '#dc2626',
      fontSize: 16,
      marginBottom: 15,
      textAlign: 'center',
    },
  });

  if (!isInitialized || isDatabaseLoading) {
    return <DatabaseLoading message="Loading savings..." />;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>💰 Savings Goals</ThemedText>
        <ThemedText style={styles.subtitle}>Manage your savings goals</ThemedText>
      </View>

      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      {loading ? (
        <ThemedText>Loading savings data...</ThemedText>
      ) : (
        <>
          {/* Statistics */}
          {statistics && (
            <View style={styles.statsContainer}>
              <ThemedText style={styles.statsTitle}>📊 Overview</ThemedText>
              <View style={styles.statsRow}>
                <ThemedText style={styles.statsLabel}>Total Jugs:</ThemedText>
                <ThemedText style={styles.statsValue}>{statistics.total_jugs}</ThemedText>
              </View>
              <View style={styles.statsRow}>
                <ThemedText style={styles.statsLabel}>Total Balance:</ThemedText>
                <ThemedText style={styles.statsValue}>{formatCurrency(statistics.total_balance)}</ThemedText>
              </View>
              <View style={styles.statsRow}>
                <ThemedText style={styles.statsLabel}>Total Transactions:</ThemedText>
                <ThemedText style={styles.statsValue}>{statistics.total_transactions}</ThemedText>
              </View>
              <View style={styles.statsRow}>
                <ThemedText style={styles.statsLabel}>Average Balance:</ThemedText>
                <ThemedText style={styles.statsValue}>{formatCurrency(statistics.average_balance)}</ThemedText>
              </View>
            </View>
          )}

          {/* Empty State or Jugs List */}
          {jugs.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <ThemedText style={styles.emptyStateIcon}>🏺</ThemedText>
              <ThemedText style={styles.emptyStateTitle}>No Savings Goals Yet</ThemedText>
              <ThemedText style={styles.emptyStateText}>
                Create your first savings goal to start tracking your savings. 
                You can create multiple goals for different purposes like emergency fund, 
                vacation, or a new car.
              </ThemedText>
              <Pressable style={styles.bigButton} onPress={() => setShowAddModal(true)}>
                <ThemedText style={styles.bigButtonText}>➕ Create Your First Savings Goal</ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.jugsContainer}>
              <View style={styles.jugsHeader}>
                <ThemedText style={styles.jugsTitle}>Your Savings Goals ({jugs.length})</ThemedText>
                <Pressable style={styles.smallButton} onPress={() => setShowAddModal(true)}>
                  <ThemedText style={styles.smallButtonText}>➕ Add Goal</ThemedText>
                </Pressable>
              </View>

              {jugs.map((jug) => (
                <View key={jug.id} style={styles.jugCard}>
                  <View style={styles.jugHeader}>
                    <ThemedText style={styles.jugName}>{jug.name}</ThemedText>
                    <ThemedText style={styles.jugBalance}>{formatCurrency(jug.balance)}</ThemedText>
                  </View>
                  
                  <View style={styles.jugActions}>
                    <Pressable 
                      style={[styles.actionButton, styles.addButton]}
                      onPress={() => {
                        setSelectedJug(jug);
                        setShowAddMoneyModal(true);
                      }}
                    >
                      <ThemedText style={styles.actionButtonText}>➕ Add Money</ThemedText>
                    </Pressable>
                    
                    <Pressable 
                      style={[styles.actionButton, styles.removeButton]}
                      onPress={() => {
                        setSelectedJug(jug);
                        setShowRemoveMoneyModal(true);
                      }}
                    >
                      <ThemedText style={styles.actionButtonText}>➖ Remove</ThemedText>
                    </Pressable>
                    
                    <Pressable 
                      style={[styles.actionButton, styles.deleteButton]}
                      onPress={() => handleDeleteJug(jug)}
                    >
                      <ThemedText style={styles.actionButtonText}>🗑️ Delete</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* Add Jug Modal */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Create New Savings Goal</ThemedText>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter jar name..."
              placeholderTextColor={colors.textSecondary}
              value={newJugName}
              onChangeText={setNewJugName}
            />
            <View style={styles.modalButtons}>
              <Pressable 
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => {
                  setShowAddModal(false);
                  setNewJugName('');
                }}
              >
                <ThemedText style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>Cancel</ThemedText>
              </Pressable>
              <Pressable 
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleCreateJug}
              >
                <ThemedText style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>Create</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Money Modal */}
      <Modal visible={showAddMoneyModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>
              Add Money to {selectedJug?.name}
            </ThemedText>
            <TextInput
              style={styles.modalInput}
              placeholder="Amount..."
              placeholderTextColor={colors.textSecondary}
              value={transactionAmount}
              onChangeText={setTransactionAmount}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Transaction name (e.g., Monthly deposit)"
              placeholderTextColor={colors.textSecondary}
              value={transactionName}
              onChangeText={setTransactionName}
            />
            <View style={styles.modalButtons}>
              <Pressable 
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => {
                  setShowAddMoneyModal(false);
                  setTransactionAmount('');
                  setTransactionName('');
                  setSelectedJug(null);
                }}
              >
                <ThemedText style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>Cancel</ThemedText>
              </Pressable>
              <Pressable 
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleAddMoney}
              >
                <ThemedText style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>Add Money</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Remove Money Modal */}
      <Modal visible={showRemoveMoneyModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>
              Remove Money from {selectedJug?.name}
            </ThemedText>
            <TextInput
              style={styles.modalInput}
              placeholder="Amount..."
              placeholderTextColor={colors.textSecondary}
              value={transactionAmount}
              onChangeText={setTransactionAmount}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Transaction name (e.g., Emergency expense)"
              placeholderTextColor={colors.textSecondary}
              value={transactionName}
              onChangeText={setTransactionName}
            />
            <View style={styles.modalButtons}>
              <Pressable 
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => {
                  setShowRemoveMoneyModal(false);
                  setTransactionAmount('');
                  setTransactionName('');
                  setSelectedJug(null);
                }}
              >
                <ThemedText style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>Cancel</ThemedText>
              </Pressable>
              <Pressable 
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleRemoveMoney}
              >
                <ThemedText style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>Remove Money</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
} 