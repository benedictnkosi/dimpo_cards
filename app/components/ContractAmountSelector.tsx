import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { HOST_URL } from '@/config/api';
import * as SecureStore from 'expo-secure-store';

interface ContractAmountSelectorProps {
  isVisible: boolean;
  onClose: () => void;
  onAmountChanged: (newAmount: string) => void;
  currentAmount?: string;
}

const AMOUNT_OPTIONS = ['0.5', '1', '2', '3', '4', '5', '10', '20', '50', '100', '200', '500'];

export function ContractAmountSelector({ 
  isVisible, 
  onClose, 
  onAmountChanged, 
  currentAmount = '5' 
}: ContractAmountSelectorProps) {
  const { colors, isDark } = useTheme();
  const [selectedAmount, setSelectedAmount] = useState(currentAmount);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedAmount(currentAmount);
  }, [currentAmount]);

  // Helper to chunk array into rows of 4
  const chunkArray = (arr: string[], size: number) => 
    arr.reduce((acc: string[][], _, i: number) => 
      (i % size ? acc : [...acc, arr.slice(i, i + size)]), []);

  const amountRows = chunkArray(AMOUNT_OPTIONS, 4);

  const handleSave = async () => {
    if (selectedAmount === currentAmount) {
      onClose();
      return;
    }

    Alert.alert(
      'Update Contract Amount',
      `Are you sure you want to change your earning amount from $${currentAmount} to $${selectedAmount} per chapter?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          style: 'default',
          onPress: async () => {
            setIsSaving(true);
            try {
              // Get auth data
              const authData = await SecureStore.getItemAsync('auth');
              if (!authData) {
                throw new Error('No auth data found');
              }
              const { user } = JSON.parse(authData);

              // Update in AsyncStorage
              await AsyncStorage.setItem('learnerAgreedAmount', selectedAmount);

              // Update in API (if endpoint exists)
              try {
                const response = await fetch(`${HOST_URL}/api/language-learners/${user.uid}/agreed-amount`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    agreedAmount: selectedAmount,
                  }),
                });

                if (!response.ok) {
                  console.warn('Failed to update agreed amount in API, but saved locally');
                }
              } catch (error) {
                console.warn('API update failed, but saved locally:', error);
              }

              onAmountChanged(selectedAmount);
              
              Toast.show({
                type: 'success',
                text1: 'Contract Updated',
                text2: `You now earn $${selectedAmount} per chapter`,
                position: 'top',
                topOffset: 60,
                visibilityTime: 3000,
                autoHide: true
              });

              onClose();
            } catch (error) {
              console.error('Error updating contract amount:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to update contract amount',
                position: 'top',
                topOffset: 60,
                visibilityTime: 3000,
                autoHide: true
              });
            } finally {
              setIsSaving(false);
            }
          }
        }
      ]
    );
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: isDark ? colors.card : '#FFFFFF' }]}>
          <LinearGradient
            colors={['#1B1464', '#2B2F77']}
            style={styles.gradientBackground}
          />
          
          <View style={styles.header}>
            <ThemedText style={styles.title}>
              Update Your Contract! 🤝
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Ask your parents: "How much can I earn for every chapter I read?"
            </ThemedText>
            <ThemedText style={styles.description}>
              Each chapter takes just 8–10 minutes — like a snack break for your brain!
            </ThemedText>
          </View>

          <View style={styles.amountSection}>
            <ThemedText style={styles.amountLabel}>
              Select your amount per chapter:
            </ThemedText>
            
            <View style={styles.amountGrid}>
              {amountRows.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.amountRow}>
                  {row.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.amountButton,
                        {
                          backgroundColor: selectedAmount === option ? '#4F46E5' : 'rgba(255,255,255,0.15)',
                          borderColor: selectedAmount === option ? '#fff' : 'rgba(255,255,255,0.2)'
                        }
                      ]}
                      onPress={() => setSelectedAmount(option)}
                    >
                      <ThemedText style={styles.amountText}>
                        {option}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={isSaving}
            >
              <ThemedText style={styles.cancelButtonText}>
                Cancel
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                { backgroundColor: colors.primary },
                isSaving && styles.buttonDisabled
              ]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <ThemedText style={styles.saveButtonText}>
                {isSaving ? 'Updating...' : 'Update'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 22,
  },
  description: {
    fontSize: 14,
    color: '#E5E7EB',
    textAlign: 'center',
    lineHeight: 20,
  },
  amountSection: {
    marginBottom: 24,
  },
  amountLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FBBF24',
    textAlign: 'center',
    marginBottom: 16,
  },
  amountGrid: {
    gap: 12,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  amountButton: {
    width: 72,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  amountText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  saveButton: {
    backgroundColor: '#4F46E5',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
}); 