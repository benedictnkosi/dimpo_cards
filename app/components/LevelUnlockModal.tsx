import React from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface LevelUnlockModalProps {
  visible: boolean;
  onDismiss: () => void;
  unlockedLevel: {
    subtopicName: string;
    levelName: string;
    levelIndex: number;
  } | null;
}

export function LevelUnlockModal({ visible, onDismiss, unlockedLevel }: LevelUnlockModalProps) {
  const { colors, isDark } = useTheme();
  const [scale] = React.useState(new Animated.Value(0));
  const [rotation] = React.useState(new Animated.Value(0));

  console.log('🎭 [DEBUG] LevelUnlockModal render:', {
    visible,
    unlockedLevel,
    hasUnlockedLevel: !!unlockedLevel
  });

  React.useEffect(() => {
    console.log('🎭 [DEBUG] LevelUnlockModal useEffect - visible changed to:', visible);
    if (visible) {
      // Animate scale and rotation when modal appears
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(rotation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scale.setValue(0);
      rotation.setValue(0);
    }
  }, [visible]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (!unlockedLevel) return null;

  const levelEmojis: Record<string, string> = {
    'Level 1: Basics': '🧠✨',
    'Level 2: Core Practice': '🛠️📘',
    'Level 3: Advanced': '🧾🔍',
    'Level 4: Expert': '🎯🔥',
  };

  const levelColors = isDark
    ? ['#6C47FF', '#8B5CF6', '#A855F7', '#C084FC']
    : ['#8B5CF6', '#A855F7', '#C084FC', '#D8B4FE'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={onDismiss}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
          >
            <Animated.View
              style={[
                styles.modalContent,
                {
                  backgroundColor: isDark ? colors.card : '#FFFFFF',
                  transform: [{ scale }],
                },
              ]}
            >
              {/* Close button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onDismiss}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>

              {/* Celebration icon */}
              <Animated.View
                style={[
                  styles.celebrationIcon,
                  { transform: [{ rotate: spin }] }
                ]}
              >
                <Ionicons 
                  name="trophy" 
                  size={48} 
                  color={colors.primary} 
                />
              </Animated.View>

              {/* Title */}
              <ThemedText style={[styles.title, { color: colors.text }]}>
                🎉 Level Unlocked! 🎉
              </ThemedText>

              {/* Level info */}
              <View style={styles.levelInfo}>
                <ThemedText style={[styles.subtopicName, { color: colors.textSecondary }]}>
                  {unlockedLevel.subtopicName}
                </ThemedText>
                <View style={styles.levelContainer}>
                  <LinearGradient
                    colors={levelColors.slice(0, Math.min(unlockedLevel.levelIndex + 1, levelColors.length)) as [string, string, ...string[]]}
                    style={styles.levelGradient}
                  >
                    <ThemedText style={styles.levelEmoji}>
                      {levelEmojis[unlockedLevel.levelName] || '📚'}
                    </ThemedText>
                    <ThemedText style={styles.levelName}>
                      {unlockedLevel.levelName}
                    </ThemedText>
                  </LinearGradient>
                </View>
              </View>

              {/* Message */}
              <ThemedText style={[styles.message, { color: colors.textSecondary }]}>
                Congratulations! You've mastered the previous level and unlocked new challenges. Keep up the great work! 🚀
              </ThemedText>

              {/* Continue button */}
              <TouchableOpacity
                style={[styles.continueButton, { backgroundColor: colors.primary }]}
                onPress={onDismiss}
              >
                <ThemedText style={styles.continueButtonText}>
                  Continue Learning
                </ThemedText>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </TouchableOpacity>
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
  },
  modalContent: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  celebrationIcon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  levelInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  subtopicName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  levelContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  levelGradient: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  levelEmoji: {
    fontSize: 24,
  },
  levelName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  continueButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
}); 