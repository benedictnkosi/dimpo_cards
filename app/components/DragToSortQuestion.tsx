import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Pressable, View, ScrollView, Animated, Alert } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useTheme } from '@/contexts/ThemeContext';
import { useFeedback } from '../contexts/FeedbackContext';
import { useSound } from '../contexts/SoundContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { QUESTION_TYPE_EMOJIS } from '../constants/questionTypeEmojis';
import CheckContinueButton from './CheckContinueButton';
import { logQuestionAnswer } from '@/services/questionReporting';

interface DragToSortQuestionProps {
  id: string;
  prompt: string;
  items: string[];
  correct_order: string[];
  onContinue?: () => void;
  setIsQuestionAnswered: (answered: boolean) => void;
  onMilestoneNotification?: (milestoneNotification: {
    shouldShow: boolean;
    milestone: '75' | '50' | '25' | null;
    message: string;
  }) => void;
  onQuestionAnswered?: () => void;
}

interface SortableItem {
  id: string;
  text: string;
  originalIndex: number;
  currentIndex: number;
  isCorrect: boolean;
}

export function DragToSortQuestion({
  id,
  prompt,
  items,
  correct_order,
  onContinue,
  setIsQuestionAnswered,
  onMilestoneNotification,
  onQuestionAnswered,
}: DragToSortQuestionProps) {
  console.log('[DragToSortQuestion] items:', items);
  const [sortableItems, setSortableItems] = useState<SortableItem[]>([]);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const { colors, isDark } = useTheme();
  const { setFeedback, resetFeedback } = useFeedback();
  const { soundEnabled } = useSound();
  const { customerInfo } = useRevenueCat();
  const soundRef = React.useRef<Audio.Sound | null>(null);

  // Play feedback sound function
  const playFeedbackSound = async (type: 'correct' | 'wrong') => {
    if (!soundEnabled) return;
    
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const soundObject = new Audio.Sound();
      const source =
        type === 'correct'
          ? require('../../assets/audio/correct.mp3')
          : require('../../assets/audio/wrong.mp3');
      await soundObject.loadAsync(source);
      await soundObject.playAsync();
      soundRef.current = soundObject;
      soundObject.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          soundObject.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (e) {
      // fail silently
    }
  };

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  // Initialize items with shuffled order
  useEffect(() => {
    const shuffledItems = [...items].sort(() => Math.random() - 0.5);
    const initialItems: SortableItem[] = shuffledItems.map((item, index) => ({
      id: `item-${index}`,
      text: item,
      originalIndex: items.indexOf(item),
      currentIndex: index,
      isCorrect: false,
    }));
    setSortableItems(initialItems);
  }, [items]);

  const checkAnswer = async () => {
    const currentOrder = sortableItems
      .sort((a, b) => a.currentIndex - b.currentIndex)
      .map(item => item.text);
    
    const isOrderCorrect = currentOrder.every((item, index) => item === correct_order[index]);
    
    if (isOrderCorrect) {
      playFeedbackSound('correct');
      setIsCorrect(true);
      setIsAnswered(true);
      setIsQuestionAnswered(true);
      setFeedback({
        isChecked: true,
        isCorrect: true,
        feedbackText: 'Perfect! The order is correct! 🎉',
        correctAnswer: correct_order.join(' → '),
        questionId: id,
      });
      
      // Log the question answer
      const result = await logQuestionAnswer(id, true, customerInfo);
      
      // Check if daily limit was reached
      if (result.limitReached) {
        Alert.alert(
          'Daily Limit Reached',
          'You\'ve reached your daily question limit. Upgrade to Premium for unlimited questions!',
          [
            { text: 'OK', onPress: () => {} }
          ]
        );
        return;
      }

      // Check if lifetime limit was reached
      if (result.lifetimeLimitReached) {
        Alert.alert(
          'Lifetime Limit Reached',
          'You\'ve used all your free questions. Upgrade to Premium for unlimited access!',
          [
            { text: 'OK', onPress: () => {} }
          ]
        );
        return;
      }

      // Handle milestone notification
      if (result.milestoneNotification && onMilestoneNotification) {
        onMilestoneNotification(result.milestoneNotification);
      }

      onQuestionAnswered?.();
    } else {
      playFeedbackSound('wrong');
      setIsCorrect(false);
      setIsAnswered(true);
      setIsQuestionAnswered(true);
      setFeedback({
        isChecked: true,
        isCorrect: false,
        feedbackText: 'Not quite right. Try again!',
        correctAnswer: correct_order.join(' → '),
        questionId: id,
      });
      
      // Log the question answer
      const result = await logQuestionAnswer(id, false, customerInfo);
      
      // Check if daily limit was reached
      if (result.limitReached) {
        Alert.alert(
          'Daily Limit Reached',
          'You\'ve reached your daily question limit. Upgrade to Premium for unlimited questions!',
          [
            { text: 'OK', onPress: () => {} }
          ]
        );
        return;
      }

      // Check if lifetime limit was reached
      if (result.lifetimeLimitReached) {
        Alert.alert(
          'Lifetime Limit Reached',
          'You\'ve used all your free questions. Upgrade to Premium for unlimited access!',
          [
            { text: 'OK', onPress: () => {} }
          ]
        );
        return;
      }

      // Handle milestone notification
      if (result.milestoneNotification && onMilestoneNotification) {
        onMilestoneNotification(result.milestoneNotification);
      }

      onQuestionAnswered?.();
    }
  };

  const resetQuestion = () => {
    resetFeedback();
    setIsAnswered(false);
    setIsCorrect(false);
    setIsQuestionAnswered(false);
    setSelectedItem(null);
    
    // Reinitialize with new shuffle
    const shuffledItems = [...items].sort(() => Math.random() - 0.5);
    const initialItems: SortableItem[] = shuffledItems.map((item, index) => ({
      id: `item-${index}`,
      text: item,
      originalIndex: items.indexOf(item),
      currentIndex: index,
      isCorrect: false,
    }));
    setSortableItems(initialItems);
  };

  const handleContinue = () => {
    // Stop any playing audio
    if (soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    onContinue?.();
  };

  const handleItemPress = (itemId: string) => {
    if (isAnswered) return;
    
    if (selectedItem === null) {
      // First item selected
      setSelectedItem(itemId);
    } else if (selectedItem === itemId) {
      // Same item selected again - deselect
      setSelectedItem(null);
    } else {
      // Second item selected - swap positions
      const firstItem = sortableItems.find(item => item.id === selectedItem);
      const secondItem = sortableItems.find(item => item.id === itemId);
      
      if (firstItem && secondItem) {
        setSortableItems(prev => prev.map(item => {
          if (item.id === selectedItem) {
            return { ...item, currentIndex: secondItem.currentIndex };
          } else if (item.id === itemId) {
            return { ...item, currentIndex: firstItem.currentIndex };
          }
          return item;
        }));
      }
      
      setSelectedItem(null);
    }
  };

  const getItemStyle = (item: SortableItem) => {
    const baseStyle = {
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      minHeight: 60,
      backgroundColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
      marginVertical: 4,
      borderColor: colors.border,
    };

    if (isAnswered && item.isCorrect) {
      return [
        baseStyle,
        {
          borderColor: '#10B981',
          borderWidth: 3,
          backgroundColor: '#F0FDF4',
        },
      ];
    }

    if (selectedItem === item.id) {
      return [
        baseStyle,
        {
          borderColor: colors.primary,
          borderWidth: 3,
          backgroundColor: '#F0F9FF',
        },
      ];
    }

    return [baseStyle];
  };

  const getItemTextStyle = (item: SortableItem) => {
    if (isAnswered && item.isCorrect) {
      return [
        styles.itemText,
        {
          color: '#10B981',
          fontWeight: '700' as const,
        },
      ];
    }

    if (selectedItem === item.id) {
      return [
        styles.itemText,
        {
          color: colors.primary,
          fontWeight: '600' as const,
        },
      ];
    }

    return [
      styles.itemText,
      {
        color: colors.text,
      },
    ];
  };

  const sortedItems = [...sortableItems].sort((a, b) => a.currentIndex - b.currentIndex);
  console.log('[DragToSortQuestion] sortedItems:', sortedItems);

  return (
    <View style={styles.outerContainer}>
      <LinearGradient
        colors={['#f0f9ff', '#e0e7ff']}
        style={styles.cardContainer}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <ThemedText style={{ fontSize: 32, textAlign: 'center', marginBottom: 2 }}>
          {QUESTION_TYPE_EMOJIS.dragToSort}
        </ThemedText>
        <ThemedText style={[styles.prompt, { color: colors.text }]}> 
          {prompt}
        </ThemedText>
        <View style={styles.instructions}>
          <ThemedText style={[styles.instructionText, { color: colors.textSecondary }]}> 
            Tap two items to swap their positions
          </ThemedText>
        </View>
        <ScrollView style={styles.itemsScroll} contentContainerStyle={styles.itemsContainer}>
          {sortedItems.map((item, index) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                getItemStyle(item),
                pressed && !isAnswered && styles.itemPressed,
              ]}
              onPress={() => handleItemPress(item.id)}
              disabled={isAnswered}
            >
              <View style={styles.itemContent}>
                <View style={styles.itemNumber}>
                  <ThemedText style={[styles.numberText, { color: colors.textSecondary }]}>
                    {index + 1}
                  </ThemedText>
                </View>
                <ThemedText style={getItemTextStyle(item)}>
                  {item.text}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </LinearGradient>
      {!isAnswered && (
        <CheckContinueButton
          isDisabled={false}
          onCheck={checkAnswer}
          onContinue={() => {}}
        />
      )}
      {isAnswered && (
        <CheckContinueButton
          isDisabled={false}
          onCheck={() => {}} // Not used when answered
          onContinue={handleContinue}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F6F8FA',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 32,
    padding: 32,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
    backgroundColor: '#fff',
    marginVertical: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  prompt: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 8,
    letterSpacing: 0.1,
  },
  instructions: {
    alignItems: 'center',
    marginBottom: 24,
  },
  instructionText: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  itemsScroll: {
    width: '100%',
    marginBottom: 0,
  },
  itemsContainer: {
    gap: 8,
    paddingBottom: 8,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  itemText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'left',
    flex: 1,
  },
}); 