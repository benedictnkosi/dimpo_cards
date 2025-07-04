import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ViewStyle, Alert } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '@/contexts/ThemeContext';
import { useSound } from '../contexts/SoundContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { QUESTION_TYPE_EMOJIS } from '../constants/questionTypeEmojis';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { logQuestionAnswer } from '@/services/questionReporting';

// Assign a color to each category for visual feedback
const CATEGORY_COLORS = [
  '#6366F1', // Indigo
  '#22D3EE', // Cyan
  '#F59E42', // Orange
  '#10B981', // Green
  '#F43F5E', // Pink
  '#A21CAF', // Purple
  '#FBBF24', // Yellow
  '#3B82F6', // Blue
];

// Distinct color for item selection
const SELECTION_COLOR = '#D1D5DB'; // Soft grey for selection

interface CategoriseQuestionProps {
  id: string;
  prompt: string;
  categories: string[];
  items: Record<string, string>; // item -> correct category
  onContinue?: () => void;
  setIsQuestionAnswered: (answered: boolean) => void;
  onMilestoneNotification?: (milestoneNotification: {
    shouldShow: boolean;
    milestone: '75' | '50' | '25' | null;
    message: string;
  }) => void;
  onQuestionAnswered?: () => void;
}

// Utility function to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function CategoriseQuestion({
  id,
  prompt,
  categories,
  items,
  onContinue,
  setIsQuestionAnswered,
  onMilestoneNotification,
  onQuestionAnswered,
}: CategoriseQuestionProps) {
  const { colors } = useTheme();
  const { soundEnabled } = useSound();
  const { customerInfo } = useRevenueCat();
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, boolean>>({});
  const [shuffledItemKeys, setShuffledItemKeys] = useState<string[]>([]);
  const soundRef = React.useRef<Audio.Sound | null>(null);

  // Log props on component mount
  useEffect(() => {
    console.log('🔍 CategoriseQuestion mounted with props:', {
      id,
      prompt,
      categories,
      items,
      categoriesCount: categories?.length,
      itemsCount: items ? Object.keys(items).length : 0,
      itemsKeys: items ? Object.keys(items) : [],
      itemsValues: items ? Object.values(items) : []
    });
  }, [id, prompt, categories, items]);

  // Assign a color to each category
  const categoryColorMap = Object.fromEntries(
    categories.map((cat, idx) => [cat, CATEGORY_COLORS[idx % CATEGORY_COLORS.length]])
  );

  // Log category color mapping
  useEffect(() => {
    console.log('🎨 Category color mapping:', categoryColorMap);
  }, [categoryColorMap]);

  // Shuffle items on mount or when question changes
  useEffect(() => {
    setShuffledItemKeys(shuffleArray(Object.keys(items)));
  }, [id, items]);

  // Play feedback sound function
  const playFeedbackSound = async (type: 'correct' | 'wrong') => {
    console.log('🔊 Playing feedback sound:', type, 'Sound enabled:', soundEnabled);
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
      // Unload after playback
      soundObject.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          soundObject.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (e) {
      console.error('❌ Error playing sound:', e);
    }
  };

  // Play wrong sound (keeping for backward compatibility)
  const playWrongSound = async () => {
    await playFeedbackSound('wrong');
  };

  useEffect(() => {
    console.log('🔄 Initializing CategoriseQuestion state for id:', id);
    const initial: Record<string, string | null> = {};
    Object.keys(items).forEach(item => {
      initial[item] = null;
    });
    console.log('📝 Initial assignments:', initial);
    console.log('📝 About to call setAssignments with:', initial);
    setAssignments(initial);
    setSelectedItem(null);
    setIsAnswered(false);
    setFeedback({});
    setIsQuestionAnswered(false);
    
    return () => {
      console.log('🧹 CategoriseQuestion cleanup for id:', id);
    };
  }, [id]);

  // Check if all items are assigned
  useEffect(() => {
    const allAssigned = Object.values(assignments).every(val => val !== null);
    setIsQuestionAnswered(allAssigned);
    if (allAssigned && !isAnswered) {
      // Auto-check answers
      const newFeedback: Record<string, boolean> = {};
      Object.entries(assignments).forEach(([item, cat]) => {
        newFeedback[item] = cat === items[item];
      });
      setFeedback(newFeedback);
      setIsAnswered(true);
      
      // Log the question answer
      const allCorrect = Object.values(newFeedback).every(correct => correct);
      
      // Handle async logging
      const handleQuestionAnswer = async () => {
        const result = await logQuestionAnswer(id, allCorrect, customerInfo);
        
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

        // Call onQuestionAnswered after logging the answer
        onQuestionAnswered?.();
      };
      
      handleQuestionAnswer();
      
      // Play sound based on overall performance
      playFeedbackSound(allCorrect ? 'correct' : 'wrong');
    }
    if (!allAssigned && isAnswered) {
      setIsAnswered(false);
    }
  }, [assignments, setIsQuestionAnswered, isAnswered, items, playFeedbackSound, onQuestionAnswered]);

  // Handle continue (reset)
  const handleContinue = () => {
    console.log('➡️ Continuing to next question');
    // Stop any playing audio
    if (soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    const initial: Record<string, string | null> = {};
    Object.keys(items).forEach(item => {
      initial[item] = null;
    });
    setAssignments(initial);
    setSelectedItem(null);
    setIsAnswered(false);
    setFeedback({});
    setIsQuestionAnswered(false);
    onContinue?.();
  };

  // Tap item to select for assignment
  const handleItemTap = (item: string) => {
    console.log('👆 Item tapped:', item, 'Is answered:', isAnswered);
    if (isAnswered) return;
    setSelectedItem(item);
  };

  // Tap category to assign selected item (restrict to correct category)
  const handleCategoryTap = async (category: string) => {
    console.log('🎯 Category tapped:', category, 'Selected item:', selectedItem, 'Is answered:', isAnswered);
    if (!selectedItem || isAnswered) {
      console.log('❌ Cannot assign - no selected item or already answered');
      return;
    }
    if (items[selectedItem] !== category) {
      console.log('❌ Wrong category! Expected:', items[selectedItem], 'Got:', category);
      await playFeedbackSound('wrong');
      setSelectedItem(null);
      return;
    }
    console.log('✅ Correct assignment!', selectedItem, '->', category);
    // Play correct sound for successful assignment
    await playFeedbackSound('correct');
    setAssignments(prev => ({ ...prev, [selectedItem]: category }));
    setSelectedItem(null);
  };

  // Helper: get color dot for category
  const getCategoryDot = (category: string) => (
    <View style={{
      width: 10, height: 10, borderRadius: 5, marginRight: 8,
      backgroundColor: categoryColorMap[category],
    }} />
  );

  // Helper: get matched items for a category
  const getMatchedItems = (category: string) =>
    shuffledItemKeys.filter(item => assignments[item] === category);

  // Helper: get item card style
  const getItemCardStyle = (item: string): ViewStyle => {
    const assignedCategory = assignments[item];
    const isSelected = selectedItem === item;
    const isCorrect = isAnswered && assignedCategory === items[item];
    let backgroundColor = '#fff';
    let borderColor = '#E5E7EB';
    if (isCorrect && assignedCategory) backgroundColor = '#ECFDF5'; // green-50
    if (isSelected) {
      borderColor = '#3B82F6'; // blue-500
      backgroundColor = '#F0F9FF'; // blue-50
    }
    return {
      backgroundColor,
      borderColor,
      borderWidth: 2,
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 18,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    };
  };

  // Helper: get checkmark and label for correct item
  const getItemStatus = (item: string) => {
    const assignedCategory = assignments[item];
    const isCorrect = isAnswered && assignedCategory === items[item];
    if (isCorrect && assignedCategory) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MaterialIcons name="check-circle" size={18} color="#22C55E" />
          <View style={{
            backgroundColor: '#D1FAE5',
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 2,
            marginLeft: 4,
          }}>
            <ThemedText style={{ color: categoryColorMap[assignedCategory], fontWeight: '700', fontSize: 13 }}>{assignedCategory}</ThemedText>
          </View>
        </View>
      );
    }
    return null;
  };

  // Helper: blue dot for selected item
  const getSelectedDot = (item: string) => {
    if (selectedItem === item) {
      return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6', marginLeft: 8 }} />;
    }
    return null;
  };

  // Log current state for debugging
  useEffect(() => {
    console.log('📊 CategoriseQuestion current state:', {
      selectedItem,
      isAnswered,
      assignments,
      feedback
    });
  }, [selectedItem, isAnswered, assignments, feedback]);

  // Track assignments state changes specifically
  useEffect(() => {
    console.log('🔄 Assignments state changed to:', assignments);
    console.log('🔄 Assignments keys:', Object.keys(assignments));
    console.log('🔄 Assignments values:', Object.values(assignments));
  }, [assignments]);

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: '#F6F8FA' }}>
      <View style={{ backgroundColor: '#F1F5F9', borderRadius: 18, padding: 18, marginBottom: 18 }}>
        <ThemedText style={{ fontSize: 18, fontWeight: '700', marginBottom: 2 }}>Items to Classify <ThemedText style={{ fontSize: 16 }}>→</ThemedText></ThemedText>
      </View>
      <View style={{ marginBottom: 18 }}>
        {shuffledItemKeys.filter(item => !assignments[item]).map(item => (
          <Pressable
            key={item}
            style={getItemCardStyle(item)}
            onPress={() => handleItemTap(item)}
            disabled={isAnswered}
          >
            <ThemedText style={{ fontSize: 16, fontWeight: '600', color: '#222', flex: 1 }}>{item}</ThemedText>
            {getItemStatus(item)}
            {getSelectedDot(item)}
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 12 }}>
        <ThemedText style={{ fontSize: 17, fontWeight: '700', marginBottom: 8 }}>Categories</ThemedText>
        {categories.map(category => (
          <Pressable
            key={category}
            onPress={() => handleCategoryTap(category)}
            disabled={!selectedItem || isAnswered}
            style={({ pressed }) => [{
              borderWidth: 2,
              borderColor: '#CBD5E1',
              borderRadius: 16,
              padding: 16,
              marginBottom: 20,
              backgroundColor: pressed && selectedItem && !isAnswered ? '#F1F5F9' : '#F8FAFC',
              borderStyle: 'dashed',
              opacity: !selectedItem || isAnswered ? 0.6 : 1,
            }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {getCategoryDot(category)}
                <ThemedText style={{ fontWeight: '700', fontSize: 16, color: categoryColorMap[category], marginRight: 6 }}>{category}</ThemedText>
              </View>
              <View style={{
                minWidth: 24,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 12,
                backgroundColor: '#E0E7EF',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <ThemedText style={{ color: '#334155', fontWeight: '700', fontSize: 13 }}>{getMatchedItems(category).length}</ThemedText>
              </View>
            </View>
            {getMatchedItems(category).length > 0 && (
              <View style={{ marginTop: 2 }}>
                {getMatchedItems(category).map(item => (
                  <View key={item} style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F1F5F9',
                    borderRadius: 8,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    marginBottom: 6,
                  }}>
                    <MaterialIcons name="check-circle" size={16} color="#22C55E" style={{ marginRight: 6 }} />
                    <ThemedText style={{ fontSize: 14, color: '#222', fontWeight: '500' }}>{item}</ThemedText>
                  </View>
                ))}
              </View>
            )}
            {getMatchedItems(category).length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <ThemedText style={{ color: '#94A3B8', fontSize: 15, fontWeight: '500' }}>
                  Tap to assign here
                </ThemedText>
              </View>
            )}
          </Pressable>
        ))}
      </View>
      {isAnswered && Object.values(assignments).every(val => val !== null) && (
        <Pressable
          onPress={handleContinue}
          accessibilityRole="button"
          accessibilityLabel="Continue to next question"
          style={{ width: '100%', marginTop: 18 }}
        >
          <LinearGradient
            colors={[colors.primary, '#22c55e']}
            style={styles.continueButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <ThemedText style={styles.continueButtonText}>Continue 🚀</ThemedText>
          </LinearGradient>
        </Pressable>
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
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 32,
    padding: 16 ,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
    backgroundColor: '#fff',
    marginVertical: 24,
    alignItems: 'center',
    
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
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 14,
    color: '#64748B',
    fontStyle: 'italic',
  },
  matchingRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 12,
    alignItems: 'stretch',
    justifyContent: 'center',
    height: 360,
    minHeight: 220,
    gap: 12,
  },
  itemsColumn: {
    flex: 1,
    alignItems: 'stretch',
    minWidth: 120,
    maxWidth: 180,
    height: '100%',
    paddingBottom: 0,
  },
  categoriesColumn: {
    flex: 1,
    alignItems: 'stretch',
    minWidth: 120,
    maxWidth: 180,
    height: '100%',
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    color: '#374151',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  itemButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    marginBottom: 0,
    marginTop: 0,
  },
  itemPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  itemText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'left',
    flex: 1,
  },
  categoryBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    minHeight: 60,
    justifyContent: 'center',
    flex: 1,
    marginVertical: 0,
  },
  categoryHeader: {
    alignItems: 'center',
    marginBottom: 0,
    paddingVertical: 8,
    borderRadius: 12,
    width: '100%',
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  continueButton: {
    marginTop: 24,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  continueButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.2,
  },
  motivation: {
    marginTop: 18,
    fontSize: 16,
    color: '#22C55E',
    fontWeight: '700',
    textAlign: 'center',
  },
  categoryPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  categoryBoxGap: {
    marginBottom: 16, // Adjust as needed for spacing
  },
}); 