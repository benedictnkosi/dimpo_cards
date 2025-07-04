import React, { useEffect, useState } from 'react';
import { StyleSheet, Pressable, View, Alert } from 'react-native';
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

interface MatchingQuestionProps {
  id: string;
  prompt: string;
  pairs: Record<string, string>;
  onContinue?: () => void;
  setIsQuestionAnswered: (answered: boolean) => void;
  onMilestoneNotification?: (milestoneNotification: {
    shouldShow: boolean;
    milestone: '75' | '50' | '25' | null;
    message: string;
  }) => void;
  onQuestionAnswered?: () => void;
}

interface MatchCard {
  id: string;
  text: string;
  type: 'key' | 'value';
  correctMatch: string;
  isSelected: boolean;
  isMatched: boolean;
  matchedWith: string | null;
}

// Define a palette of colors for matches
const MATCH_COLORS = [
  '#6366F1', // Indigo
  '#22D3EE', // Cyan
  '#F59E42', // Orange
  '#10B981', // Green
  '#F43F5E', // Pink
  '#A21CAF', // Purple
  '#FBBF24', // Yellow
  '#3B82F6', // Blue
];

export function MatchingQuestion({
  id,
  prompt,
  pairs,
  onContinue,
  setIsQuestionAnswered,
  onMilestoneNotification,
  onQuestionAnswered,
}: MatchingQuestionProps) {
  const [cards, setCards] = useState<MatchCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [allMatched, setAllMatched] = useState(false);
  const { colors, isDark } = useTheme();
  const { setFeedback, resetFeedback } = useFeedback();
  const { soundEnabled } = useSound();
  const { customerInfo } = useRevenueCat();
  const soundRef = React.useRef<Audio.Sound | null>(null);

  // Play feedback sound function
  const playFeedbackSound = async (type: 'correct' | 'wrong') => {
    // Only play sound if sound is enabled
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

  // Initialize cards with shuffled values
  useEffect(() => {
    const keys = Object.keys(pairs);
    const values = Object.values(pairs);
    
    // Shuffle the values
    const shuffledValues = [...values].sort(() => Math.random() - 0.5);
    
    const keyCards: MatchCard[] = keys.map((key, index) => ({
      id: `key-${index}`,
      text: key,
      type: 'key',
      correctMatch: pairs[key],
      isSelected: false,
      isMatched: false,
      matchedWith: null,
    }));

    const valueCards: MatchCard[] = shuffledValues.map((value, index) => ({
      id: `value-${index}`,
      text: value,
      type: 'value',
      correctMatch: value,
      isSelected: false,
      isMatched: false,
      matchedWith: null,
    }));

    setCards([...keyCards, ...valueCards]);
  }, [pairs]);

  const handleCardPress = async (cardId: string) => {
    if (isAnswered) return;

    const card = cards.find(c => c.id === cardId);
    if (!card || card.isMatched) return;

    if (selectedCard === null) {
      // First card selected
      setSelectedCard(cardId);
      setCards(prev => prev.map(c => 
        c.id === cardId ? { ...c, isSelected: true } : { ...c, isSelected: false }
      ));
    } else {
      // Second card selected - check if it's a valid match
      const firstCard = cards.find(c => c.id === selectedCard);
      if (!firstCard) return;

      const isValidMatch = firstCard.type !== card.type && 
        ((firstCard.type === 'key' && card.text === firstCard.correctMatch) ||
         (card.type === 'key' && firstCard.text === card.correctMatch));

      if (isValidMatch) {
        // Valid match - play correct sound
        playFeedbackSound('correct');
        
        setCards(prev => prev.map(c => {
          if (c.id === cardId || c.id === selectedCard) {
            return {
              ...c,
              isSelected: false,
              isMatched: true,
              matchedWith: c.id === cardId ? selectedCard : cardId,
            };
          }
          return { ...c, isSelected: false };
        }));

        // Check if all cards are matched
        const updatedCards = cards.map(c => {
          if (c.id === cardId || c.id === selectedCard) {
            return {
              ...c,
              isMatched: true,
              matchedWith: c.id === cardId ? selectedCard : cardId,
            };
          }
          return c;
        });

        const allMatched = updatedCards.every(c => c.isMatched);
        if (allMatched) {
          setAllMatched(true);
          setIsQuestionAnswered(true);
          
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
          
          // Set feedback for correct completion
          setFeedback({
            isChecked: true,
            isCorrect: true,
            feedbackText: 'Perfect! All matches are correct! 🎉',
            correctAnswer: Object.entries(pairs).map(([item, category]) => `${item}: ${category}`).join(', '),
            questionId: id,
          });

          // Call onQuestionAnswered after logging the answer
          onQuestionAnswered?.();
        }
      } else {
        // Invalid match - play wrong sound and deselect first card
        playFeedbackSound('wrong');
        setCards(prev => prev.map(c => ({ ...c, isSelected: false })));
      }
      
      setSelectedCard(null);
    }
  };

  const handleContinue = () => {
    // Stop any playing audio
    if (soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    onContinue?.();
  };

  const resetQuestion = () => {
    resetFeedback();
    setSelectedCard(null);
    setIsAnswered(false);
    setAllMatched(false);
    setIsQuestionAnswered(false);
    
    // Reinitialize with new shuffle
    const keys = Object.keys(pairs);
    const values = Object.values(pairs);
    const shuffledValues = [...values].sort(() => Math.random() - 0.5);
    
    const keyCards: MatchCard[] = keys.map((key, index) => ({
      id: `key-${index}`,
      text: key,
      type: 'key',
      correctMatch: pairs[key],
      isSelected: false,
      isMatched: false,
      matchedWith: null,
    }));

    const valueCards: MatchCard[] = shuffledValues.map((value, index) => ({
      id: `value-${index}`,
      text: value,
      type: 'value',
      correctMatch: value,
      isSelected: false,
      isMatched: false,
      matchedWith: null,
    }));

    setCards([...keyCards, ...valueCards]);
  };

  useEffect(() => {
    // No need to set up callbacks anymore since we're using direct props
  }, []);

  const getCardStyle = (card: MatchCard) => {
    const isSelected = card.id === selectedCard;
    const isMatched = card.isMatched;
    let matchColor = '#22D3EE';
    
    if (isMatched && card.matchedWith) {
      // Find the key card for this match to determine the color index
      const keyCard = cards.find(c => c.type === 'key' && (c.id === card.id || c.id === card.matchedWith));
      if (keyCard) {
        const keyIndex = cards.filter(c => c.type === 'key').findIndex(c => c.id === keyCard.id);
        matchColor = MATCH_COLORS[keyIndex % MATCH_COLORS.length];
      }
    }

    const baseStyle = {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 18,
      borderWidth: 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      minHeight: 80,
      height: 80,
      backgroundColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
      marginBottom: 2,
      marginTop: 2,
      borderColor: colors.border,
    };

    if (isMatched) {
      return [
        baseStyle,
        {
          borderColor: matchColor,
          borderWidth: 3,
        },
      ];
    }

    if (isSelected) {
      return [
        baseStyle,
        {
          borderColor: colors.primary,
          borderWidth: 3,
        },
      ];
    }

    return [baseStyle];
  };

  const getCardTextStyle = (card: MatchCard) => {
    const isSelected = card.id === selectedCard;
    const isMatched = card.isMatched;
    
    if (isMatched || isSelected) {
      return [
        styles.cardText,
        {
          color: colors.primary,
          fontWeight: '600' as const,
        },
      ];
    }

    return [
      styles.cardText,
      {
        color: colors.text,
      },
    ];
  };

  const keyCards = cards.filter(card => card.type === 'key');
  const valueCards = cards.filter(card => card.type === 'value');

  return (
    <View style={styles.outerContainer}>
      <LinearGradient
        colors={['#f0f9ff', '#e0e7ff']}
        style={styles.cardContainer}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <ThemedText style={{ fontSize: 32, textAlign: 'center', marginBottom: 2 }}>
          {QUESTION_TYPE_EMOJIS.matching}
        </ThemedText>
        <ThemedText style={[styles.prompt, { color: colors.text }]}> 
          {prompt}
        </ThemedText>
        <View style={styles.instructions}>
          <ThemedText style={[styles.instructionText, { color: colors.textSecondary }]}> 
            Tap a card on the left, then tap its match on the right
          </ThemedText>
        </View>
        <View style={styles.cardsContainer}>
          <View style={styles.column}>
            <ThemedText style={[styles.columnTitle, { color: colors.text }]}>Items</ThemedText>
            {keyCards.map((card) => (
              <Pressable
                key={card.id}
                style={({ pressed }) => [
                  getCardStyle(card),
                  pressed && !isAnswered && styles.cardPressed,
                ]}
                onPress={() => handleCardPress(card.id)}
                disabled={isAnswered || card.isMatched}
              >
                <ThemedText style={getCardTextStyle(card)}>
                  {card.text}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <View style={styles.column}>
            <ThemedText style={[styles.columnTitle, { color: colors.text }]}>Categories</ThemedText>
            {valueCards.map((card) => (
              <Pressable
                key={card.id}
                style={({ pressed }) => [
                  getCardStyle(card),
                  pressed && !isAnswered && styles.cardPressed,
                ]}
                onPress={() => handleCardPress(card.id)}
                disabled={isAnswered || card.isMatched}
              >
                <ThemedText style={getCardTextStyle(card)}>
                  {card.text}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      </LinearGradient>
      
      {/* Continue button that appears when all matches are completed */}
      {allMatched && (
        <CheckContinueButton
          isDisabled={false}
          onCheck={() => {}} // Not used when all matched
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
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  cardsContainer: {
    flexDirection: 'row',
    gap: 24,
    width: '100%',
    marginTop: 12,
  },
  column: {
    flex: 1,
    gap: 16,
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.1,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  cardText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    color: '#22223B',
  },
}); 