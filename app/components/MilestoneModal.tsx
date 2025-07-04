import React from 'react';
import { Modal, View, StyleSheet, Pressable } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '@/contexts/ThemeContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface MilestoneModalProps {
  visible: boolean;
  milestone: '75' | '50' | '25';
  message: string;
  onClose: () => void;
  onUpgrade?: () => void;
}

export function MilestoneModal({ 
  visible, 
  milestone, 
  message, 
  onClose,
  onUpgrade 
}: MilestoneModalProps) {
  const { colors, isDark } = useTheme();
  const { showPaywall } = useRevenueCat();

  const handleUpgradePress = async () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      try {
        await showPaywall();
      } catch (error) {
        console.error('Error showing paywall:', error);
      }
    }
    onClose();
  };

  const getMilestoneConfig = () => {
    switch (milestone) {
      case '75':
        return {
          icon: 'warning-outline',
          colors: ['#FEF3C7', '#FDE68A'] as const,
          borderColor: '#F59E0B',
          title: '75% Used!',
          emoji: '⚠️'
        };
      case '50':
        return {
          icon: 'information-circle-outline',
          colors: ['#DBEAFE', '#BFDBFE'] as const,
          borderColor: '#3B82F6',
          title: 'Halfway There!',
          emoji: '📊'
        };
      case '25':
        return {
          icon: 'alert-circle-outline',
          colors: ['#FEE2E2', '#FECACA'] as const,
          borderColor: '#EF4444',
          title: 'Almost Done!',
          emoji: '🚨'
        };
      default:
        return {
          icon: 'information-circle-outline',
          colors: ['#F0F9FF', '#E0F2FE'] as const,
          borderColor: colors.primary,
          title: 'Milestone Reached!',
          emoji: '🎯'
        };
    }
  };

  const config = getMilestoneConfig();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={config.colors}
            style={[
              styles.modalContent,
              { borderColor: config.borderColor + '30' }
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons 
                  name={config.icon as any} 
                  size={32} 
                  color={config.borderColor} 
                />
              </View>
              <ThemedText style={[styles.title, { color: config.borderColor }]}>
                {config.title}
              </ThemedText>
              <ThemedText style={styles.emoji}>
                {config.emoji}
              </ThemedText>
            </View>

            {/* Message */}
            <View style={styles.messageContainer}>
              <ThemedText style={[styles.message, { color: colors.text }]}>
                {message}
              </ThemedText>
            </View>

            {/* Remaining questions info */}
            <View style={styles.remainingContainer}>
              <ThemedText style={[styles.remainingTitle, { color: colors.textSecondary }]}>
                Questions Remaining
              </ThemedText>
              <ThemedText style={[styles.remainingCount, { color: config.borderColor }]}>
                {milestone === '75' ? '25' : milestone === '50' ? '50' : '25'}
              </ThemedText>
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <Pressable
                style={[styles.button, styles.secondaryButton]}
                onPress={onClose}
              >
                <ThemedText style={[styles.buttonText, { color: colors.textSecondary }]}>
                  Continue
                </ThemedText>
              </Pressable>
              
              <Pressable
                style={[styles.button, styles.primaryButton, { backgroundColor: config.borderColor }]}
                onPress={handleUpgradePress}
              >
                <ThemedText style={styles.primaryButtonText}>
                  Upgrade Now
                </ThemedText>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
  },
  modalContent: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emoji: {
    fontSize: 32,
  },
  messageContainer: {
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '500',
  },
  remainingContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
  },
  remainingTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  remainingCount: {
    fontSize: 32,
    fontWeight: '700',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  primaryButton: {
    flexDirection: 'row',
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
}); 