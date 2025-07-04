import React from 'react';
import { View, Pressable, StyleSheet, Modal as RNModal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/ThemedText';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  emoji: string;
  title: string;
  completed: number;
  remaining: number;
  description: string;
  highlightColor?: string;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  visible,
  onClose,
  onUpgrade,
  emoji,
  title,
  completed,
  remaining,
  description,
  highlightColor = '#3B27C1',
}) => {
  return (
    <RNModal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <LinearGradient
          colors={["#f8fafc", "#e0e7ff"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.modalContent}
        >
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
            <ThemedText style={{ fontSize: 48, marginBottom: 8 }}>{emoji}</ThemedText>
            <ThemedText style={styles.modalTitle}>{title}</ThemedText>
            <ThemedText style={styles.modalHighlightText}>
              You've completed <ThemedText style={{ fontWeight: 'bold', color: highlightColor }}>{completed} chapters</ThemedText>! Only <ThemedText style={{ fontWeight: 'bold', color: highlightColor }}>{remaining} more free chapters</ThemedText> remaining.
            </ThemedText>
            <ThemedText style={styles.modalDescription}>{description}</ThemedText>
          </View>
          <View style={styles.modalButtons}>
            <Pressable
              style={styles.continueButton}
              onPress={onClose}
            >
              <ThemedText style={styles.continueButtonText}>Continue Free</ThemedText>
            </Pressable>
            <Pressable
              style={styles.upgradeButton}
              onPress={onUpgrade}
            >
              <ThemedText style={styles.upgradeButtonText}>Upgrade Now</ThemedText>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    minWidth: 320,
    maxWidth: 360,
    width: '90%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#222',
  },
  modalHighlightText: {
    textAlign: 'center',
    fontSize: 17,
    color: '#475569',
    marginBottom: 8,
  },
  modalDescription: {
    textAlign: 'center',
    fontSize: 15,
    color: '#64748b',
    marginBottom: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  continueButton: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 14,
    minWidth: 120,
    alignItems: 'center',
    marginRight: 8,
  },
  continueButtonText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 16,
  },
  upgradeButton: {
    backgroundColor: '#3B27C1',
    borderRadius: 10,
    paddingVertical: 14,
    minWidth: 120,
    alignItems: 'center',
    shadowColor: '#3B27C1',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  upgradeButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
}); 