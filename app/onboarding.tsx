import { HOST_URL } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { analytics } from '@/services/analytics';
import { completeDeviceRegistration, checkDeviceRegistration, getDeviceId, DeviceRegistrationInfo } from '@/services/deviceRegistration';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { ThemedText } from '../components/ThemedText';
import { DailyLimitSelector } from './components/DailyLimitSelector';
import { setDailyEarningLimit } from '@/services/dailyEarningLimit';

const SUPERHERO_NAMES = [
  // Reading Heroes
  'Bookworm',
  'Story Master',
  'Word Wizard',
  'Reading Ranger',
  'Page Turner',
  'Literary Lion',
  'Book Buddy',
  'Story Seeker',
  'Word Warrior',
  'Reading Rocket',
  // Magical Characters
  'Wizard Willow',
  'Fairy Flora',
  'Dragon Drake',
  'Unicorn Luna',
  'Phoenix Finn',
  'Mermaid Maya',
  'Pixie Piper',
  'Witch Wendy',
  'Sorcerer Sam',
  'Enchanted Emma',
  // Adventure Characters
  'Explorer Eli',
  'Adventurer Ava',
  'Treasure Hunter Tom',
  'Map Master Mia',
  'Compass Cody',
  'Journey Jack',
  'Discovery Daisy',
  'Quest Queen',
  'Voyage Victor',
  'Expedition Ella',
  // Animal Friends
  'Lion Leo',
  'Elephant Ellie',
  'Giraffe Grace',
  'Monkey Max',
  'Penguin Penny',
  'Dolphin Dan',
  'Owl Oliver',
  'Rabbit Ruby',
  'Tiger Theo',
  'Bear Bella',
  // Space Explorers
  'Astronaut Alex',
  'Cosmic Clara',
  'Star Scout',
  'Galaxy Grace',
  'Planet Pete',
  'Rocket Riley',
  'Space Sam',
  'Nebula Nina',
  'Comet Cody',
  'Meteor Maya',
  // Nature Friends
  'Forest Finn',
  'Ocean Olivia',
  'Mountain Max',
  'River Rose',
  'Desert Dan',
  'Jungle Jack',
  'Arctic Ava',
  'Savanna Sam',
  'Tundra Theo',
  'Canyon Clara',
  // Super Readers
  'Super Reader',
  'Captain Book',
  'The Amazing Reader',
  'Book Power',
  'Reading Force',
  'Story Squad',
  'Word Team',
  'Literary League',
  'Page Patrol',
  'Chapter Champion'
];

function getRandomSuperheroName(): string {
  const randomIndex = Math.floor(Math.random() * SUPERHERO_NAMES.length);
  return SUPERHERO_NAMES[randomIndex];
}

WebBrowser.maybeCompleteAuthSession();

const EMOJIS = {
  welcome: '📚',
  topics: '🌟',
  practice: '🎯',
  examples: '🎨',
};

type AvatarImages = {
  [key: string]: any;
};

const AVATAR_IMAGES: AvatarImages = {
  '1': require('@/assets/images/avatars/1.png'),
  '2': require('@/assets/images/avatars/2.png'),
  '3': require('@/assets/images/avatars/3.png'),
  '4': require('@/assets/images/avatars/4.png'),
  '5': require('@/assets/images/avatars/5.png'),
  '6': require('@/assets/images/avatars/6.png'),
  '7': require('@/assets/images/avatars/7.png'),
  '8': require('@/assets/images/avatars/8.png'),
  '9': require('@/assets/images/avatars/9.png'),
};

export interface OnboardingData {
  curriculum: string;
  difficultSubject?: string;
  avatar: string;
  school?: string;
  school_address?: string;
  school_latitude?: string | number;
  school_longitude?: string | number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

interface GuestAccountParams {
  selectedAvatar: string;
  signUp: (email: string, password: string) => Promise<any>;
}

interface FirebaseError extends Error {
  code?: string;
  name: string;
  message: string;
  stack?: string;
}

async function createGuestAccount({ selectedAvatar, signUp }: GuestAccountParams, retryCount = 0): Promise<any> {
  try {
    //console.log(`[Guest Account] Attempt ${retryCount + 1}/${MAX_RETRIES} - Starting guest account creation`);

    // Generate a 16-character UID
    const guestUid = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);

    const guestEmail = `${guestUid}@guest.com`;
    const defaultPassword = 'password';

    //console.log('[Guest Account] Generated credentials:', { guestEmail });

    // Register the guest user
    //console.log('[Guest Account] Attempting to sign up with Firebase...');
    const user = await signUp(guestEmail, defaultPassword);
    //console.log('[Guest Account] Firebase signup successful:', { uid: user?.uid });

    // Create learner profile for guest
    const learnerData = {
      name: getRandomSuperheroName(),
      email: guestEmail,
      avatar: selectedAvatar,
    };

    //console.log('[Guest Account] Created learner data:', learnerData);

    // Create new learner in database using the new API endpoint
    try {
      const response = await fetch(`${HOST_URL}/public/learn/learner/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: user.uid,
          name: learnerData.name,
          grade: "12", // Default grade for guest users
          school_name: "Guest School", // Default school name for guest users
          school_address: "Guest Address", // Default address for guest users
          school_latitude: 0, // Default latitude for guest users
          school_longitude: 0, // Default longitude for guest users
          terms: "1,2,4", // Default terms for guest users
          curriculum: "CAPS", // Default curriculum for guest users
          email: learnerData.email,
          avatar: `${learnerData.avatar}.png` // Ensure avatar has .png extension
        }),
      });

      //console.log('[Guest Account] Response:', response);

      if (!response.ok) {
        console.error('[Guest Account] Failed to create learner profile');
        console.error('[Guest Account] Response:', response.body);
        throw new Error('Failed to create learner profile');
      }

    } catch (error) {
      console.error('[Guest Account] Error creating learner:', error);
      // Don't throw here as the user is already registered
      // Just log the error and continue
    }

    // Store onboarding data
    //console.log('[Guest Account] Storing onboarding data...');
    await AsyncStorage.setItem('onboardingData', JSON.stringify({
      curriculum: 'CAPS',
      avatar: selectedAvatar,
      onboardingCompleted: true,
      isGuest: true
    }));

    // Store auth token
    //console.log('[Guest Account] Storing auth token...');
    await SecureStore.setItemAsync('auth', JSON.stringify({ user }));

    // Register device with the server
    try {
      const deviceRegistrationResult = await completeDeviceRegistration(user.uid);
      if (deviceRegistrationResult.success) {
        console.log('[Guest Account] Device registered successfully:', deviceRegistrationResult.deviceId);
      } else {
        console.warn('[Guest Account] Device registration failed:', deviceRegistrationResult.message);
        // Don't block the guest account creation if device registration fails
      }
    } catch (deviceError) {
      console.error('[Guest Account] Error during device registration:', deviceError);
      // Don't block the guest account creation if device registration fails
    }

    //console.log('[Guest Account] Guest account creation completed successfully');
    return user;
  } catch (error: unknown) {
    const firebaseError = error as FirebaseError;
    console.error('[Guest Account] Error details:', {
      error: firebaseError,
      errorName: firebaseError.name,
      errorMessage: firebaseError.message,
      errorCode: firebaseError.code,
      errorStack: firebaseError.stack,
      retryCount,
      timestamp: new Date().toISOString()
    });

    if (retryCount < MAX_RETRIES) {
      //console.log(`[Guest Account] Retrying in ${RETRY_DELAY}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return createGuestAccount({ selectedAvatar, signUp }, retryCount + 1);
    }
    throw error;
  }
}

// Helper to chunk array into rows of 4 (move this above renderStep)
function chunkArray(arr: any[], size: number) {
  return arr.reduce((acc: any[], _, i: number) => (i % size ? acc : [...acc, arr.slice(i, i + size)]), []);
}

// Add a color palette for amount/limit buttons
const AMOUNT_COLORS = [
  '#F59E42', // orange
  '#4F46E5', // indigo
  '#10B981', // green
  '#F43F5E', // pink
  '#6366F1', // blue
  '#FBBF24', // yellow
  '#3B82F6', // sky
  '#A21CAF', // purple
  '#059669', // emerald
  '#DC2626', // red
  '#0EA5E9', // cyan
  '#E11D48', // rose
  '#F472B6', // fuchsia
  '#22D3EE', // teal
  '#FACC15', // amber
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [selectedAvatar, setSelectedAvatar] = useState<string>('1');
  const [registrationMethod, setRegistrationMethod] = useState<'email' | 'phone'>('email');
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const { isDark, colors } = useTheme();

  const [errors, setErrors] = useState({
    curriculum: ''
  });

  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  
  // Device registration state
  // const [deviceInfo, setDeviceInfo] = useState<DeviceRegistrationInfo | null>(null);
  // const [isCheckingDevice, setIsCheckingDevice] = useState(true);

  const [age, setAge] = useState('');
  const [agreedAmount, setAgreedAmount] = useState('');
  const [dailyLimit, setDailyLimit] = useState(0);

  useEffect(() => {
    async function checkAuthAndOnboarding() {
      try {
        const authData = await SecureStore.getItemAsync('auth');
        const onboardingData = await AsyncStorage.getItem('onboardingData');

        if (authData && onboardingData) {
          const parsedOnboarding = JSON.parse(onboardingData);
          if (parsedOnboarding.onboardingCompleted && !router.canGoBack()) {
            router.replace('/');
          }
        }
      } catch (error) {
        console.error('Error checking auth and onboarding:', error);
      }
    }

    checkAuthAndOnboarding();
  }, []);

  // Track onboarding screen view
  useEffect(() => {
    const stepName = getStepName(step);
    analytics.track(`reading_onboarding_${stepName}_viewed`, {
      step_number: step,
      step_name: stepName,
      total_steps: 4
    });
  }, [step]);

  const handleNextStep = () => {
    setErrors({ curriculum: '' });

    // Only complete onboarding after avatar selection (step 5)
    if (step === 5) {
      handleComplete();
    } else {
      setStep(step + 1);
    }
  };

  const getStepName = (step: number): string => {
    switch (step) {
      case 0:
        return 'welcome';
      case 1:
        return 'earn';
      case 2:
        return 'quiz';
      case 3:
        return 'deal';
      case 4:
        return 'daily_limit';
      case 5:
        return 'avatar';
      default:
        return 'unknown';
    }
  };

  const handleComplete = async () => {
    try {
      // Track onboarding completion through registration
      analytics.track('reading_onboarding_completed', {
        method: 'registration',
        avatar_id: selectedAvatar,
        total_steps: 4,
        agreed_amount: agreedAmount,
        age: age
      });

      // Store onboarding data
      await AsyncStorage.setItem('onboardingData', JSON.stringify({
        curriculum: 'CAPS',
        avatar: selectedAvatar,
        onboardingCompleted: true,
        age: age,
        agreedAmount: agreedAmount
      }));

      // Persist the selected daily limit
      if (dailyLimit) {
        await setDailyEarningLimit(dailyLimit);
      }

      // Navigate to registration screen
      router.push({
        pathname: '/register',
        params: {
          curriculum: 'CAPS',
          avatar: selectedAvatar,
          age: age,
          agreedAmount: agreedAmount
        }
      });

    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to complete registration',
        position: 'bottom'
      });
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={[styles.step, { justifyContent: 'flex-start', paddingTop: 40 }]} testID="welcome-step">
            <View style={{ width: '100%', height: 340, marginBottom: 40, justifyContent: 'center', alignItems: 'center', paddingTop: 40 }}>
              <Image
                source={require('../assets/images/dimpo/reading.png')}
                style={{ width: 220, height: 220, resizeMode: 'contain', marginTop: 60 }}
                testID="welcome-image"
              />
            </View>
            <View style={[styles.textContainer, { paddingHorizontal: 20 }]} testID="welcome-text-container">
              <ThemedText style={[styles.welcomeTitle, { fontSize: 24, marginBottom: 24, color: isDark ? '#FFFFFF' : '#1E293B' }]} testID="welcome-title">
                Welcome to Dimpo Reads
              </ThemedText>
              <ThemedText style={[styles.welcomeText, { fontSize: 20, lineHeight: 32, marginBottom: 24, color: isDark ? '#E2E8F0' : '#475569' }]} testID="welcome-description">
                Read amazing stories and earn an allowance! Start your reading adventure today.
              </ThemedText>
            </View>
          </View>
        );
      case 1:
        return (
          <View style={[styles.step, { justifyContent: 'flex-start', paddingTop: 40 }]} testID="earn-step">
            <View style={{ width: '100%', height: 340, marginBottom: 40, justifyContent: 'center', alignItems: 'center', paddingTop: 40 }}>
              <Image
                source={require('../assets/images/dimpo/earning.png')}
                style={{ width: 220, height: 220, resizeMode: 'contain', marginTop: 60 }}
                testID="earn-image"
              />
            </View>
            <View style={[styles.textContainer, { paddingHorizontal: 20 }]} testID="earn-text-container">
              <ThemedText style={[styles.welcomeTitle, { fontSize: 26, marginBottom: 20, color: isDark ? '#FFFFFF' : '#1E293B' }]} testID="earn-title">
                Read and Earn!
              </ThemedText>
              <ThemedText style={[styles.welcomeText, { fontSize: 18, lineHeight: 28, marginBottom: 20, color: isDark ? '#E2E8F0' : '#475569' }]} testID="earn-description">
                Every time you finish a story, you can earn real money. The more you read, the more you earn!
              </ThemedText>
            </View>
          </View>
        );
      case 2:
        return (
          <View style={[styles.step, { justifyContent: 'flex-start', paddingTop: 40 }]} testID="quiz-step">
            <View style={{ width: '100%', height: 340, marginBottom: 40, justifyContent: 'center', alignItems: 'center', paddingTop: 40 }}>
              <Image
                source={require('../assets/images/dimpo/quiz.png')}
                style={{ width: 220, height: 220, resizeMode: 'contain', marginTop: 60 }}
                testID="quiz-image"
              />
            </View>
            <View style={[styles.textContainer, { paddingHorizontal: 20 }]} testID="quiz-text-container">
              <ThemedText style={[styles.welcomeTitle, { fontSize: 26, marginBottom: 20, color: isDark ? '#FFFFFF' : '#1E293B' }]} testID="quiz-title">
                Take a Quick Quiz
              </ThemedText>
              <ThemedText style={[styles.welcomeText, { fontSize: 18, lineHeight: 28, marginBottom: 20, color: isDark ? '#E2E8F0' : '#475569' }]} testID="quiz-description">
                After each chapter, answer a few fun questions to show you've read and understood the story.
              </ThemedText>
            </View>
          </View>
        );
      case 3:
        // Contract/Deal screen
        const amountOptions = ['0.5','1','2','3','4','5','10','20','50','100','200','500'];
        const amountRows = chunkArray(amountOptions, 4);
        return (
          <View style={[styles.step, { justifyContent: 'flex-start', paddingTop: 40 }]} testID="deal-step">
            <View style={[styles.textContainer, { paddingHorizontal: 20 }]} testID="deal-text-container">
              <ThemedText style={[styles.welcomeTitle, { fontSize: 26, marginBottom: 20, color: isDark ? '#FFFFFF' : '#1E293B' }]} testID="deal-title">
                Make a Deal with Your Parent! 🤝
              </ThemedText>
              <ThemedText style={[styles.welcomeText, { fontSize: 18, lineHeight: 28, marginBottom: 20, color: isDark ? '#E2E8F0' : '#475569' }]} testID="deal-description">
                Talk to your parent or guardian and agree on an amount you can earn <ThemedText style={{ fontWeight: 'bold' }}>per child</ThemedText> for every chapter you read.
                Each chapter takes just 8–10 minutes — like a snack break for your brain!
              </ThemedText>
              <ThemedText style={[styles.welcomeText, { fontSize: 16, marginBottom: 12, color: isDark ? '#FBBF24' : '#D97706' }]}>Select your amount <ThemedText style={{ fontWeight: 'bold' }}>per child</ThemedText> per chapter:</ThemedText>
              <View style={{ gap: 12, marginTop: 8 }}>
                {amountRows.map((row: any[], rowIdx: number) => (
                  <View key={rowIdx} style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
                    {row.map((option: string, colIdx: number) => {
                      const idx = rowIdx * 4 + colIdx;
                      const bgColor = agreedAmount === option
                        ? (isDark ? '#4F46E5' : '#1E293B')
                        : AMOUNT_COLORS[idx % AMOUNT_COLORS.length];
                      return (
                        <TouchableOpacity
                          key={option}
                          style={{
                            width: 72,
                            height: 56,
                            borderRadius: 16,
                            backgroundColor: bgColor,
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginHorizontal: 6,
                            borderWidth: agreedAmount === option ? 2 : 1,
                            borderColor: agreedAmount === option
                              ? (isDark ? '#fff' : '#1E293B')
                              : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'),
                            shadowColor: agreedAmount === option ? bgColor : undefined,
                            shadowOpacity: agreedAmount === option ? 0.4 : 0,
                            shadowRadius: agreedAmount === option ? 8 : 0,
                            elevation: agreedAmount === option ? 5 : 0,
                          }}
                          onPress={() => {
                            analytics.track('reading_onboarding_amount_selected', {
                              amount: option,
                              step_name: 'deal',
                              step_number: 3
                            });
                            setAgreedAmount(option);
                          }}
                          testID={`amount-btn-${option}`}
                        >
                          <ThemedText style={{
                            color: agreedAmount === option
                              ? (isDark ? '#fff' : '#FFFFFF')
                              : (isDark ? '#fff' : '#1E293B'),
                            fontSize: 20,
                            fontWeight: '700'
                          }}>{option}</ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </View>
        );
      case 4:
        // Daily Limit selection step (new, styled like deal screen)
        const limitOptions = ['1', '5', '10', '25', '50', '75', '100', '200',  '500', '1000','5000','10000'];
        const limitRows = chunkArray(limitOptions, 4);
        const agreedAmountNum = parseFloat(agreedAmount) || 0;
        return (
          <View style={[styles.step, { justifyContent: 'flex-start', paddingTop: 40 }]} testID="daily-limit-step">
            <View style={[styles.textContainer, { paddingHorizontal: 20 }]} testID="daily-limit-text-container">
              <ThemedText style={[styles.welcomeTitle, { fontSize: 26, marginBottom: 20, color: isDark ? '#FFFFFF' : '#1E293B' }]} testID="daily-limit-title">
                Set a Daily Earning Limit with Your Parent! 💰
              </ThemedText>
              <ThemedText style={[styles.welcomeText, { fontSize: 18, lineHeight: 28, marginBottom: 20, color: isDark ? '#E2E8F0' : '#475569' }]} testID="daily-limit-description">
                Ask your parent or guardian: What is the maximum you can earn per child each day?
              </ThemedText>
              <ThemedText style={[styles.welcomeText, { fontSize: 16, marginBottom: 12, color: isDark ? '#FBBF24' : '#D97706' }]}>This limit is per child and resets every day at midnight.</ThemedText>
              <ThemedText style={[styles.welcomeText, { fontSize: 16, marginBottom: 12, color: isDark ? '#FBBF24' : '#D97706' }]}>Select your daily earning limit per child:</ThemedText>
              <View style={{ gap: 12, marginTop: 8 }}>
                {limitRows.map((row: string[], rowIdx: number) => (
                  <View key={rowIdx} style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
                    {row.map((option: string, colIdx: number) => {
                      const idx = rowIdx * 4 + colIdx;
                      const optionNum = parseFloat(option);
                      const isDisabled = optionNum < agreedAmountNum;
                      const bgColor = dailyLimit.toString() === option
                        ? (isDark ? '#4F46E5' : '#1E293B')
                        : AMOUNT_COLORS[idx % AMOUNT_COLORS.length];
                      return (
                        <TouchableOpacity
                          key={option}
                          style={{
                            width: 72,
                            height: 56,
                            borderRadius: 16,
                            backgroundColor: bgColor,
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginHorizontal: 6,
                            borderWidth: dailyLimit.toString() === option ? 2 : 1,
                            borderColor: dailyLimit.toString() === option
                              ? (isDark ? '#fff' : '#1E293B')
                              : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'),
                            opacity: isDisabled ? 0.4 : 1,
                            shadowColor: dailyLimit.toString() === option ? bgColor : undefined,
                            shadowOpacity: dailyLimit.toString() === option ? 0.4 : 0,
                            shadowRadius: dailyLimit.toString() === option ? 8 : 0,
                            elevation: dailyLimit.toString() === option ? 5 : 0,
                          }}
                          onPress={() => {
                            if (isDisabled) return;
                            analytics.track('reading_onboarding_daily_limit_selected', {
                              limit: option,
                              step_name: 'daily_limit',
                              step_number: 4
                            });
                            setDailyLimit(Number(option));
                          }}
                          testID={`daily-limit-btn-${option}`}
                          disabled={isDisabled}
                        >
                          <ThemedText style={{
                            color: dailyLimit.toString() === option
                              ? (isDark ? '#fff' : '#FFFFFF')
                              : (isDark ? '#fff' : '#1E293B'),
                            fontSize: 20,
                            fontWeight: '700'
                          }}>{option}</ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </View>
        );
      case 5:
        // Avatar selection step
        return (
          <View style={styles.step} testID="avatar-step">
            <View style={styles.textContainer}>
              <ThemedText style={[styles.stepTitle, { color: isDark ? '#FFFFFF' : '#1E293B' }]}>
                Choose Your Reading Buddy
              </ThemedText>
              <ThemedText style={[styles.stepSubtitle, { color: isDark ? '#E2E8F0' : '#475569' }]}>
                Pick a reading buddy to join you on your journey to earn and learn!
              </ThemedText>
            </View>

            <ScrollView
              style={styles.avatarsScrollView}
              contentContainerStyle={styles.avatarsScrollContent}
            >
              <View style={styles.avatarsGrid}>
                {Object.keys(AVATAR_IMAGES).map((avatarId) => (
                  <TouchableOpacity
                    key={avatarId}
                    style={[
                      styles.avatarButton,
                      { 
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'
                      },
                      selectedAvatar === avatarId && {
                        borderColor: isDark ? '#4F46E5' : '#1E293B',
                        borderWidth: 3,
                        backgroundColor: isDark ? 'rgba(79, 70, 229, 0.1)' : 'rgba(30, 41, 59, 0.1)',
                        shadowColor: isDark ? '#4F46E5' : '#1E293B',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.5,
                        shadowRadius: 8,
                        elevation: 5,
                      }
                    ]}
                    onPress={() => {
                      analytics.track('reading_onboarding_avatar_selected', {
                        avatar_id: avatarId,
                        step_name: 'avatar',
                        step_number: 5
                      });
                      setSelectedAvatar(avatarId);
                    }}
                    testID={`avatar-${avatarId}`}
                  >
                    <Image
                      source={AVATAR_IMAGES[avatarId]}
                      style={styles.avatarImage}
                    />
                    {selectedAvatar === avatarId && (
                      <View style={[styles.avatarCheckmark, { backgroundColor: isDark ? '#4F46E5' : '#1E293B' }]}>
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.authOptionsContainer}>
              <TouchableOpacity
                style={[styles.authButton, { backgroundColor: isDark ? '#4F46E5' : '#1E293B' }]}
                onPress={handleNextStep}
                testID="create-account-button"
              >
                <ThemedText style={[styles.authButtonText, { color: '#FFFFFF' }]}>
                  Start Reading Adventure
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <LinearGradient
      colors={isDark ? ['#1B1464', '#2B2F77'] : ['#F8FAFC', '#E2E8F0']}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.content}>
        <View style={styles.stepContainer}>
          {renderStep()}
        </View>

        {(step < 4) && (
          <View style={styles.buttonContainer} testID="navigation-buttons">
            {step === 0 ? (
              <>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)' }]}
                  onPress={() => {
                    analytics.track('reading_onboarding_back_to_login', {
                      step_name: 'welcome',
                      step_number: 0
                    });
                    router.replace('/login');
                  }}
                  testID="login-button"
                >
                  <ThemedText style={[styles.buttonText, { color: isDark ? '#FFFFFF' : '#1E293B' }]}>Login</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: isDark ? '#FFFFFF' : '#1E293B' }]}
                  onPress={() => {
                    // Track onboarding start
                    analytics.track('reading_onboarding_started', {
                      step_number: 0,
                      step_name: 'welcome',
                      action: 'start_onboarding'
                    });
                    setStep(1);
                  }}
                  testID="start-onboarding-button"
                >
                  <ThemedText style={[styles.buttonText, { color: isDark ? '#4d5ad3' : '#FFFFFF' }]}> 
                    Let's Read! 📚
                  </ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)' }]}
                  onPress={() => {
                    analytics.track('reading_onboarding_navigation', {
                      action: 'previous_step',
                      from_step: step,
                      to_step: step - 1,
                      step_name: getStepName(step)
                    });
                    setStep(step - 1);
                  }}
                  testID="previous-step-button"
                >
                  <ThemedText style={[styles.buttonText, { color: isDark ? '#FFFFFF' : '#1E293B' }]}>Back</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.button,
                    { backgroundColor: isDark ? '#FFFFFF' : '#1E293B' },
                    (step === 3 && !agreedAmount) && { opacity: 0.5 }
                  ]}
                  onPress={() => {
                    if (step === 3 && !agreedAmount) return;
                    analytics.track('reading_onboarding_navigation', {
                      action: 'next_step',
                      from_step: step,
                      to_step: step + 1,
                      step_name: getStepName(step),
                    });
                    handleNextStep();
                  }}
                  testID="next-step-button"
                  disabled={step === 3 && !agreedAmount}
                >
                  <ThemedText style={[
                    styles.buttonText,
                    { color: isDark ? '#1E293B' : '#FFFFFF' }
                  ]}>
                    Continue! ⭐
                  </ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {(step === 4) && (
          <View style={styles.buttonContainer} testID="navigation-buttons">
            <TouchableOpacity
              style={[styles.button, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)' }]}
              onPress={() => {
                analytics.track('reading_onboarding_navigation', {
                  action: 'previous_step',
                  from_step: step,
                  to_step: step - 1,
                  step_name: getStepName(step)
                });
                setStep(step - 1);
              }}
              testID="previous-step-button"
            >
              <ThemedText style={[styles.buttonText, { color: isDark ? '#FFFFFF' : '#1E293B' }]}>Back</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: isDark ? '#FFFFFF' : '#1E293B' },
                !dailyLimit && { opacity: 0.5 }
              ]}
              onPress={() => {
                if (!dailyLimit) return;
                analytics.track('reading_onboarding_navigation', {
                  action: 'next_step',
                  from_step: step,
                  to_step: step + 1,
                  step_name: getStepName(step),
                });
                handleNextStep();
              }}
              testID="next-step-button"
              disabled={!dailyLimit}
            >
              <ThemedText style={[
                styles.buttonText,
                { color: isDark ? '#1E293B' : '#FFFFFF' }
              ]}>
                Continue! ⭐
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  stepContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 20,
  },
  step: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  textContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 20,
  },
  illustration: {
    width: '60%',
    height: 150,
    marginBottom: 24,
  },
  bigIllustration: {
    width: '80%',
    marginBottom: 40,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  boastingText: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginTop: 24,
  },
  welcomeText: {
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 28,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  picker: {
    width: '100%',
    backgroundColor: '#F8FAFC',
  },
  searchContainer: {
    width: '100%',
    paddingHorizontal: 16,
    zIndex: 1,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    fontSize: 16,
    height: 56,
    paddingHorizontal: 20,
    color: '#1E293B',
  },
  statsText: {
    fontSize: 20,
    color: '#E2E8F0',
    lineHeight: 36,
    textAlign: 'center',
    marginTop: 32,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    marginTop: 'auto',
    marginBottom: 20,
  },
  button: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },

  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },

  errorText: {
    color: '#FCA5A5',
  },
  selectedSchoolContainer: {
    width: '90%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    padding: 20,
    marginTop: 20,
    marginHorizontal: 16,
    backdropFilter: 'blur(10px)',
  },
  selectedSchoolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
    gap: 8,
  },
  selectedSchoolTitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  selectedSchoolName: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 8,
  },
  selectedSchoolAddress: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 24,
  },
  timeStepContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  timeScrollContainer: {
    height: 400,
    width: '100%',
  },
  curriculumButtons: {
    width: '100%',
    gap: 12,
    paddingHorizontal: 20,
  },
  curriculumButton: {
    width: '100%',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  curriculumButtonSelected: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  curriculumButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  curriculumButtonTextSelected: {
    color: '#FFFFFF',
  },
  testimonialContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 16,
    marginVertical: 20,
    alignItems: 'center',
  },
  testimonialRating: {
    fontSize: 22,
    color: '#FFD700',
    marginBottom: 8,
  },
  testimonialTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  testimonialText: {
    fontSize: 16,
    color: '#E2E8F0',
    textAlign: 'center',
    lineHeight: 24,
    fontStyle: 'italic',
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 100,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  planContainer: {
    flex: 1,
    paddingTop: 20,
  },
  planHeaderContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    marginBottom: 24,
    position: 'relative',
  },
  planTitleContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  planTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  unlockText: {
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: 24,
    textAlign: 'center',
  },
  trialBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 24,
  },
  trialText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  planOption: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  selectedPlan: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  planOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  planSubLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  priceAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pricePeriod: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
  },
  savingsText: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 8,
  },
  featuresContainer: {
    width: '100%',
    marginTop: 24,
    marginBottom: 24,
  },
  checkmarkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkmarkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 16,
    flex: 1,
  },
  cancelText: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
    textAlign: 'center',
    marginBottom: 24,
  },
  subscribeButton: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
  },
  subscribeButtonText: {
    color: '#1B1464',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingPlansContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingPlansCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    backdropFilter: 'blur(10px)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  loadingIconContainer: {
    position: 'relative',
    marginBottom: 24,
    alignItems: 'center',
  },
  loadingSpinner: {
    marginBottom: 20,
  },
  emojiContainer: {
    position: 'relative',
    marginTop: 16,
  },
  sparkleContainer: {
    position: 'absolute',
    top: -10,
    right: -15,
    transform: [{ rotate: '15deg' }],
  },
  sparkleEmoji: {
    fontSize: 22,
  },
  loadingPlansEmoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  loadingTextContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  loadingPlansText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    height: 8,
    alignItems: 'center',
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4d5ad3',
    marginHorizontal: 4,
  },
  loadingDot1: {
    opacity: 0.3,
  },
  loadingDot2: {
    opacity: 0.6,
  },
  loadingDot3: {
    opacity: 0.9,
  },
  loadingStepsContainer: {
    width: '100%',
    gap: 16,
  },
  loadingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 12,
  },
  loadingStepEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  loadingStepText: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    flex: 1,
  },
  stepSubtitle: {
    fontSize: 18,
    color: '#E2E8F0',
    textAlign: 'center',
    marginBottom: 16,
  },
  subjectsScrollView: {
    flex: 1,
    width: '100%',
  },
  subjectsScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  subjectButtons: {
    width: '100%',
    gap: 12,
    flex: 1,
  },
  subjectButton: {
    width: '100%',
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  subjectButtonSelected: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  subjectContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subjectEmoji: {
    fontSize: 24,
  },
  subjectButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  subjectButtonTextSelected: {
    color: '#FFFFFF',
    opacity: 1,
  },
  registrationContainer: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  registrationHeader: {
    marginBottom: 32,
    alignItems: 'center',
  },
  registrationTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  registrationSubtitle: {
    fontSize: 16,
    color: '#E2E8F0',
    textAlign: 'center',
    lineHeight: 24,
  },
  funFactContainer: {
    width: '90%',
    backgroundColor: 'rgba(77, 90, 211, 0.3)',
    borderRadius: 24,
    padding: 20,
    marginTop: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  funFactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  funFactTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  funFactText: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 24,
    opacity: 0.9,
  },
  avatarsScrollView: {
    flex: 1,
    marginTop: 16,
  },
  avatarsScrollContent: {
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  avatarsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  avatarButton: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarButtonSelected: {
    borderColor: '#4F46E5',
    borderWidth: 3,
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarCheckmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  skipButtonContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
    position: 'absolute',
    bottom: 0,
    zIndex: 1000,
  },
  skipButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  authOptionsContainer: {
    width: '100%',
    paddingHorizontal: 20,
    gap: 16,
    marginTop: 32,
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 12,
    marginBottom: 24,
  },
  emailButton: {
    backgroundColor: '#4F46E5',
  },
  phoneButton: {
    backgroundColor: '#3B82F6',
  },
  guestButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  authButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  guestPromptText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  disclaimerContainer: {
    width: '90%',
    paddingHorizontal: 20,
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disclaimerInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    gap: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  checkboxChecked: {
    backgroundColor: '#E0E7FF',
    borderColor: '#4F46E5',
  },
  disclaimerTextWrapper: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
  },
  disclaimerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  disclaimerIcon: {
    fontSize: 18,
    marginRight: 2,
  },
  disclaimerTitle: {
    fontWeight: '700',
    color: '#FBBF24',
    fontSize: 15,
  },
  disclaimerText: {
    fontSize: 15,
    color: '#F3F4F6',
    lineHeight: 22,
    opacity: 0.85,
  },
  authButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  checkboxText: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  ratingsContainer: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  ratingsContent: {
    alignItems: 'center',
    marginTop: 40,
  },
  ratingsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 28,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  starButton: {
    padding: 8,
  },
  starIcon: {
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  ratingsSubtitle: {
    fontSize: 16,
    color: '#E2E8F0',
    textAlign: 'center',
    marginTop: 16,
  },
  ratingsFooter: {
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  ratingsFooterText: {
    fontSize: 14,
    color: '#E2E8F0',
    textAlign: 'center',
    opacity: 0.8,
    lineHeight: 20,
  },
  ratingInfoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  ratingInfoText: {
    fontSize: 15,
    color: '#E2E8F0',
    lineHeight: 24,
  },
  deviceInfoContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 16,
    marginVertical: 20,
    alignItems: 'center',
    gap: 12,
  },
  deviceInfoText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  deviceInfoTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 8,
  },
  deviceInfoSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  deviceInfoWarning: {
    fontSize: 16,
    color: '#FBBF24',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  continueWithAccountButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginTop: 8,
  },
  continueWithAccountButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1B1464',
  },
  continueAsNewUserButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginTop: 4,
  },
  continueAsNewUserButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deviceRegistrationBanner: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceRegistrationBannerText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  deviceRegistrationBannerButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  deviceRegistrationBannerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1B1464',
  },
  deviceInfoEmail: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  deviceInfoDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 8,
  },
});