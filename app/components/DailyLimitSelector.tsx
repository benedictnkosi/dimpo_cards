import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { setDailyEarningLimit } from '@/services/dailyEarningLimit';

interface DailyLimitSelectorProps {
  isVisible: boolean;
  onClose: () => void;
  onLimitChanged: (newLimit: number) => void;
  currentLimit?: number;
  title?: string;
  subtitle?: string;
  description?: string;
  label?: string;
  showConfirmation?: boolean;
  confirmButtonText?: string;
  successToast?: boolean;
}

const LIMIT_OPTIONS = ['1', '5', '10', '25', '50', '75', '100', '200',  '500', '1000','5000','10000'];
export function DailyLimitSelector({ 
  isVisible, 
  onClose, 
  onLimitChanged, 
  currentLimit = 50,
  title,
  subtitle,
  description,
  label,
  showConfirmation = true,
  confirmButtonText = 'Update Limit',
  successToast = true
}: DailyLimitSelectorProps) {
  const { colors, isDark } = useTheme();
  const [selectedLimit, setSelectedLimit] = useState(currentLimit.toString());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedLimit(currentLimit.toString());
  }, [currentLimit]);

  // Helper to chunk array into rows of 4
  const chunkArray = (arr: string[], size: number) => 
    arr.reduce((acc: string[][], _, i: number) => 
      (i % size ? acc : [...acc, arr.slice(i, i + size)]), []);

  const limitRows = chunkArray(LIMIT_OPTIONS, 4);

  const handleSave = async () => {
    if (parseInt(selectedLimit) === currentLimit) {
      onClose();
      return;
    }

    if (!showConfirmation) {
      setIsSaving(true);
      try {
        const newLimit = parseInt(selectedLimit);
        await setDailyEarningLimit(newLimit);
        onLimitChanged(newLimit);
        if (successToast) {
          Toast.show({
            type: 'success',
            text1: 'Daily Limit Updated',
            text2: `You can now earn up to ${selectedLimit} per day`,
            position: 'top',
            topOffset: 60,
            visibilityTime: 3000,
            autoHide: true
          });
        }
        onClose();
      } catch (error) {
        console.error('Error updating daily earning limit:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Failed to update daily earning limit',
          position: 'top',
          topOffset: 60,
          visibilityTime: 3000,
          autoHide: true
        });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    Alert.alert(
      'Update Daily Earning Limit',
      `Are you sure you want to change your daily earning limit from ${currentLimit} to ${selectedLimit}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          style: 'default',
          onPress: async () => {
            setIsSaving(true);
            try {
              const newLimit = parseInt(selectedLimit);
              await setDailyEarningLimit(newLimit);
              onLimitChanged(newLimit);
              
              if (successToast) {
                Toast.show({
                  type: 'success',
                  text1: 'Daily Limit Updated',
                  text2: `You can now earn up to ${selectedLimit} per day`,
                  position: 'top',
                  topOffset: 60,
                  visibilityTime: 3000,
                  autoHide: true
                });
              }

              onClose();
            } catch (error) {
              console.error('Error updating daily earning limit:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to update daily earning limit',
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
              {title || 'Set Daily Earning Limit! 💰'}
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              {subtitle || 'How much can you earn each day?'}
            </ThemedText>
            <ThemedText style={styles.description}>
              {description || 'This limit resets every day at midnight'}
            </ThemedText>
          </View>

          <View style={styles.limitSection}>
            <ThemedText style={styles.limitLabel}>
              {label || 'Select your daily earning limit:'}
            </ThemedText>
            
            <View style={styles.limitGrid}>
              {limitRows.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.limitRow}>
                  {row.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.limitButton,
                        {
                          backgroundColor: selectedLimit === option ? '#4F46E5' : 'rgba(255,255,255,0.15)',
                          borderColor: selectedLimit === option ? '#fff' : 'rgba(255,255,255,0.2)'
                        }
                      ]}
                      onPress={() => setSelectedLimit(option)}
                    >
                      <ThemedText style={styles.limitText}>
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
                {isSaving ? (confirmButtonText === 'Set Limit' ? 'Setting...' : 'Updating...') : confirmButtonText}
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
  limitSection: {
    marginBottom: 24,
  },
  limitLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FBBF24',
    textAlign: 'center',
    marginBottom: 16,
  },
  limitGrid: {
    gap: 12,
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  limitButton: {
    width: 72,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  limitText: {
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
    opacity: 0.5,
  },
}); 