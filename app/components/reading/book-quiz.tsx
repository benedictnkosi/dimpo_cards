import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Animated, useColorScheme, Image, Modal } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { HOST_URL } from '@/config/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useSound } from '../../contexts/SoundContext';
import { analytics } from '@/services/analytics';
import { Ionicons } from '@expo/vector-icons';
import { getBookByChapterId, insertChapterCompletion, getAllSavingsJugs, hasUserCompletedChapter, hasUserCompletedChapterWithScore, initializeReadingLevel, getCurrentReadingLevel, getNextChapterByReadingLevel, getCurrentReading, getAllProfiles, updateCurrentProfileReadingLevel, getUserCompletedChaptersWithScore } from '@/services/database';
import { getDailyEarningLimitInfo, canEarnMoreToday } from '@/services/dailyEarningLimit';
import { submitCompletedChapter } from '@/services/api';
import { addMoneyToJug } from '@/services/savingsService';
import { updateReading } from '@/services/readingService';
import ConfettiCannon from '@felipecsl/react-native-confetti-cannon';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as StoreReview from 'expo-store-review';

interface BookQuizProps {
    chapterId: number;
    startTime?: number; // Make startTime optional since we're removing reading speed
    onClose?: (shouldRetry?: boolean) => void;
    wordCount?: number; // Add wordCount prop
    readingDuration?: number; // Add reading duration in seconds
    onQuizStart?: () => void; // Callback to notify parent to stop timer
}

interface QuizQuestion {
    question: string;
    options: string[];
    correct: number; // Index of the correct answer
}

interface QuizData {
    chapterId: number;
    chapterName: string;
    quiz: QuizQuestion[];
    wordCount?: number; // Add wordCount to QuizData
}

interface SavingsJug {
    id: number;
    name: string;
    balance: number;
    created: string;
    updated: string;
    emoji?: string;
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Add these constants at the top of the file after the imports
const JUG_EMOJIS = [
  '🐷', // piggy bank
  '💎', // diamond
  '🎯', // target
  '🌈', // rainbow
];

const JUG_GRADIENTS: [string, string][] = [
  ['#667eea', '#764ba2'], // blue-purple
  ['#f093fb', '#f5576c'], // pink-orange
  ['#43e97b', '#38f9d7'], // teal-green
  ['#fceabb', '#f8b500'], // yellow-orange
  ['#43cea2', '#185a9d'], // aqua-blue
  ['#ff5858', '#f09819'], // red-orange
  ['#c471f5', '#fa71cd'], // lavender-pink
  ['#30cfd0', '#330867'], // mint-blue
];

// Reading level constants
const READING_LEVELS = {
  EXPLORER: 'Explorer',
  BUILDER: 'Builder', 
  CHALLENGER: 'Challenger'
};

// Helper functions to convert between numeric and text levels
const getNumericLevel = (textLevel: string): number => {
  switch (textLevel) {
    case READING_LEVELS.EXPLORER: return 1;
    case READING_LEVELS.BUILDER: return 2;
    case READING_LEVELS.CHALLENGER: return 3;
    default: return 1;
  }
};

const getTextLevel = (numericLevel: number): string => {
  switch (numericLevel) {
    case 1: return READING_LEVELS.EXPLORER;
    case 2: return READING_LEVELS.BUILDER;
    case 3: return READING_LEVELS.CHALLENGER;
    default: return READING_LEVELS.EXPLORER;
  }
};

export function BookQuiz({ chapterId, startTime, onClose, wordCount, readingDuration, onQuizStart }: BookQuizProps) {
    const { colors } = useTheme();
    const colorScheme = useColorScheme();
    const { user } = useAuth();
    const { soundEnabled } = useSound();
    const isDark = colorScheme === 'dark';
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [quiz, setQuiz] = useState<QuizData | null>(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [showFeedback, setShowFeedback] = useState(false);
    const [score, setScore] = useState(0);
    const [showResults, setShowResults] = useState(false);
    const [isCompleting, setIsCompleting] = useState(false);
    const [quizStartTime, setQuizStartTime] = useState<number>(Date.now());
    
    // New state for savings jar selection
    const [showJarSelection, setShowJarSelection] = useState(false);
    const [savingsJugs, setSavingsJugs] = useState<SavingsJug[]>([]);
    const [selectedJugId, setSelectedJugId] = useState<number | null>(null);
    const [isAddingMoney, setIsAddingMoney] = useState(false);
    const [hasEarnedMoney, setHasEarnedMoney] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [hasCompletedChapter, setHasCompletedChapter] = useState(false);
    const [agreedAmount, setAgreedAmount] = useState('5');
    const [readingLevelPromoted, setReadingLevelPromoted] = useState<number | null>(null);
    const [readingLevelDemoted, setReadingLevelDemoted] = useState<number | null>(null);
    const [readingSpeed, setReadingSpeed] = useState<number>(0);
    const [currentProfileId, setCurrentProfileId] = useState<string>('');
    const [chapterNumber, setChapterNumber] = useState<number | null>(null);
    const [dailyEarningLimitInfo, setDailyEarningLimitInfo] = useState<any>(null);
    const [canEarnToday, setCanEarnToday] = useState<boolean>(true);
    const [hasShownRatePrompt, setHasShownRatePrompt] = useState(false);

    // Initialize reading level if not set
    const initializeUserReadingLevel = async () => {
        try {
            await initializeReadingLevel();
        } catch (error) {
            // ... existing code ...
        }
    };

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

    useEffect(() => {
        if (chapterId) {
            // Notify parent to stop timer
            if (typeof onQuizStart === 'function') onQuizStart();

            // Calculate reading speed from duration and word count
            if (readingDuration && wordCount) {
                const calculatedSpeed = Math.round((wordCount / readingDuration) * 60);
                setReadingSpeed(calculatedSpeed);
                
            }
            
            fetchQuiz();
            checkIfUserCompletedChapter();
            loadAgreedAmount();
            initializeUserReadingLevel(); // Initialize reading level
        }
    }, [chapterId, readingDuration, wordCount]);

    // Check daily earning limit when profile ID or agreed amount changes
    useEffect(() => {
        if (currentProfileId && agreedAmount) {
            checkDailyEarningLimit();
        }
    }, [currentProfileId, agreedAmount]);

    // Fetch chapter number when quiz is available
    useEffect(() => {
        if (quiz && chapterNumber === null) {
            getBookByChapterId(quiz.chapterId).then(bookData => {
                if (bookData && typeof bookData.chapter_number === 'number') {
                    setChapterNumber(bookData.chapter_number);
                }
            });
        }
    }, [quiz, chapterNumber]);

    useEffect(() => {
        // Check if rate prompt has been shown before
        AsyncStorage.getItem('hasShownRatePrompt').then(val => {
            if (val === 'true') setHasShownRatePrompt(true);
        });
    }, []);

    async function fetchQuiz() {
        if (!chapterId) {
            setError('Invalid chapter ID');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const bookData = await getBookByChapterId(chapterId);
            // ... existing code ...
            if (bookData && bookData.quiz) {
                // Parse the quiz string into an array of questions
                const parsedQuiz = JSON.parse(bookData.quiz);
                // ... existing code ...
                // Shuffle options for each question
                const shuffledQuestions = parsedQuiz.questions.map((q: any) => ({
                    ...q,
                    options: shuffleArray(q.options),
                }));
                setQuiz({
                    chapterId: bookData.id,
                    chapterName: bookData.chapter_name,
                    quiz: shuffledQuestions,
                    wordCount: bookData.word_count || wordCount // Use wordCount from database or prop
                });
                setQuizStartTime(Date.now());
                // Log quiz answers on load
          
                
                // Log correct answers for debugging
                console.log('=== QUIZ CORRECT ANSWERS ===');
                shuffledQuestions.forEach((q: any, index: number) => {
                    const correctAnswer = typeof q.correct === 'number' ? q.options[q.correct] : q.correct_answer || 'Unknown';
                    console.log(`Question ${index + 1}: ${correctAnswer}`);
                });
                console.log('===========================');
                
                // Fetch chapter image if available
            } else {
                setError('Quiz not available for this chapter.');
            }
        } catch (e) {
            setError('Failed to load quiz from database.');
        } finally {
            setIsLoading(false);
        }
    }

    async function completeChapter(percentage: number, readingDuration: number, isReview: boolean = false) {
        if (!user?.uid || !chapterId) return;

        // Get selected profile from AsyncStorage
        let selectedProfileUid = await AsyncStorage.getItem('selectedProfileUid');
        let profileId: number | undefined = undefined;
        if (selectedProfileUid) {
            const profiles = await getAllProfiles();
            const selectedProfile = profiles.find(p => p.uid === selectedProfileUid);
            if (selectedProfile) {
                profileId = selectedProfile.id;
            }
        }

        // For review readings, we still want to record completion to unlock next chapter
        // but we don't want to create duplicate records. Check if already completed.
        const alreadyCompleted = await hasUserCompletedChapterWithScore(user.uid, chapterId, 0, profileId?.toString());
        if (alreadyCompleted && !isReview) {
            return;
        }
        
        // For review readings, we still want to update progress even if already completed
        // but we don't need to insert a new completion record
        const shouldInsertCompletion = !alreadyCompleted || !isReview;
        
        console.log(`Chapter completion - isReview: ${isReview}, alreadyCompleted: ${alreadyCompleted}, shouldInsert: ${shouldInsertCompletion}`);

        setIsCompleting(true);
        try {
            // Use the readingSpeed prop passed to the component
            const finalReadingSpeed = readingSpeed || 0;
            const score = Math.floor(percentage);

            // Get book details for API submission
            const bookData = await getBookByChapterId(chapterId);
            if (!bookData) {
                throw new Error('Book data not found');
            }

            // Get selected profile from AsyncStorage
            let selectedProfileUid = await AsyncStorage.getItem('selectedProfileUid');
            let profileId: string | undefined = undefined;
            if (selectedProfileUid) {
                const profiles = await getAllProfiles();
                const selectedProfile = profiles.find(p => p.uid === selectedProfileUid);
                if (selectedProfile) {
                    profileId = selectedProfile.uid;
                }
            }

            // Insert into local database (readingSpeed is actually duration in DB)
            if (!profileId) {
                throw new Error('Profile ID is required for chapter completion');
            }
            
            // Only insert completion record if not already completed or not a review
            if (shouldInsertCompletion) {
                await insertChapterCompletion({
                    learnerUid: user.uid,
                    chapterId,
                    readingSpeed: readingDuration || 0,
                    score,
                    profile_id: profileId,
                });
            }

            // Query for all completed chapters for the current profile
            try {
                if (!profileId) {
                    return;
                }
                const completedChapters = await getUserCompletedChaptersWithScore(profileId, 80);
            } catch (error) {
                // Error fetching completed chapters
            }

            // Submit to API only if book title is available and not a review
            if (bookData.title && shouldInsertCompletion) {
                try {
                    await submitCompletedChapter({
                        learnerUid: user.uid,
                        chapterName: bookData.chapter_name,
                        bookTitle: bookData.title,
                        duration: readingDuration || 0,
                        score,
                        profileUid: profileId || '',
                    });
                } catch (apiError) {
                    // ... existing code ...
                }
            } else {
                // ... existing code ...
            }
            
            // Update reading progress to next chapter if score is 80% or higher
            if (percentage >= 80) {
                await updateReadingProgressToNextChapter();
            }
        } catch (error) {
            // ... existing code ...
        } finally {
            setIsCompleting(false);
        }
    }

    // Function to update reading progress to the next chapter
    const updateReadingProgressToNextChapter = async () => {
        try {
            // Get current reading status
            const currentReading = await getCurrentReading();
            if (!currentReading) {
                return;
            }
            // Get user's reading level
            const userReadingLevel = await getCurrentReadingLevel();
            // Get the next chapter at user's reading level
            const nextChapter = await getNextChapterByReadingLevel(
                currentReading.book_id, 
                currentReading.chapter_number, 
                userReadingLevel,
                user?.uid,
                currentProfileId
            );
            if (nextChapter) {
                // Update reading progress to next chapter
                await updateReading({
                    book_id: nextChapter.book_id,
                    chapter_number: nextChapter.chapter_number,
                    chapter_name: nextChapter.chapter_name
                });
            } else {
                // ... existing code ...
            }
        } catch (error) {
            // ... existing code ...
        }
    };

    // Load savings jars for jar selection
    const loadSavingsJugs = async () => {
        try {
            const jugs = await getAllSavingsJugs(currentProfileId);
            setSavingsJugs(jugs);
        } catch (error) {
            // ... existing code ...
        }
    };

    // Load agreed amount from AsyncStorage
    const loadAgreedAmount = async () => {
        try {
            const storedAmount = await AsyncStorage.getItem('learnerAgreedAmount');
            if (storedAmount) {
                setAgreedAmount(storedAmount);
            }
        } catch (error) {
            // ... existing code ...
        }
    };

    // Check daily earning limit
    const checkDailyEarningLimit = async () => {
        try {
            const limitInfo = await getDailyEarningLimitInfo(currentProfileId);
            setDailyEarningLimitInfo(limitInfo);
            
            // Check if user can earn the agreed amount today
            const canEarn = await canEarnMoreToday(parseFloat(agreedAmount), currentProfileId);
            setCanEarnToday(canEarn);
        } catch (error) {
            setCanEarnToday(true); // Default to true on error
        }
    };

    // Check and promote reading level if conditions are met
    const checkAndPromoteReadingLevel = async (percentage: number) => {
        try {
            // Only promote if reading speed > 100 WPM and comprehension is 100%
            if (readingSpeed && readingSpeed > 100 && percentage === 100) {
                const currentLevelText = await getCurrentReadingLevel();
                const currentLevelNum = getNumericLevel(currentLevelText);
                
                // Only promote if not already at max level (Challenger)
                if (currentLevelNum < 3) {
                    const newLevelNum = currentLevelNum + 1;
                    const newLevelText = getTextLevel(newLevelNum);
                    await updateCurrentProfileReadingLevel(newLevelText);
                    // Ensure the new reading level is committed before proceeding
                    await AsyncStorage.flushGetRequests?.();
                    const confirmedLevel = await getCurrentReadingLevel();
                    // Set promotion state for UI display
                    setReadingLevelPromoted(newLevelNum);

                    return newLevelNum;
                }
            }
            return null;
        } catch (error) {
            // ... existing code ...
            return null;
        }
    };

    // Check and demote reading level if conditions are met
    const checkAndDemoteReadingLevel = async (percentage: number) => {
        try {
            // Only demote if reading speed < 100 WPM and comprehension < 80%
            if (readingSpeed && readingSpeed < 100 && percentage < 80) {
                const currentLevelText = await getCurrentReadingLevel();
                const currentLevelNum = getNumericLevel(currentLevelText);
                
                // Only demote if not already at min level (Explorer)
                if (currentLevelNum > 1) {
                    const newLevelNum = currentLevelNum - 1;
                    const newLevelText = getTextLevel(newLevelNum);
                    await updateCurrentProfileReadingLevel(newLevelText);
                    setReadingLevelDemoted(newLevelNum);
                    
                    analytics.track('reading_level_demoted', {
                        userId: user?.uid,
                        chapterId,
                        previousLevel: currentLevelText,
                        newLevel: newLevelText,
                        readingSpeedWPM: readingSpeed,
                        comprehensionPercentage: percentage,
                        trigger: 'speed_and_comprehension'
                    });
                    return newLevelNum;
                }
            }
            return null;
        } catch (error) {
            // ... existing code ...
            return null;
        }
    };

    // Add money to selected jug
    const handleAddMoneyToJug = async () => {
        if (!selectedJugId || !currentProfileId) return;
        setIsAddingMoney(true);
        try {
            const amount = parseFloat(agreedAmount);
            await addMoneyToJug(selectedJugId, amount, quiz?.chapterName || 'Chapter quiz', currentProfileId);
            // Play money sound only if sound is enabled
            if (soundEnabled) {
                const { sound } = await Audio.Sound.createAsync(
                    require('../../../assets/audio/money.mp3')
                );
                await sound.playAsync();
            }
            setShowJarSelection(false);
            setSelectedJugId(null);
            setHasEarnedMoney(true);
            setShowConfetti(true);
            setTimeout(async () => {
                setShowConfetti(false);
                // Ensure the new reading level is committed before redirecting
                await AsyncStorage.flushGetRequests?.();
                const confirmedLevel = await getCurrentReadingLevel();
                // Redirect to home page instead of just closing the quiz
                router.replace('/');
            }, 2200); // Confetti duration + buffer
        } catch (error) {
            // ... existing code ...
        } finally {
            setIsAddingMoney(false);
        }
    };

    // Helper to get the correct answer index for a question
    const getCorrectIndex = (question: any) => {
        if (typeof question.correct === 'number') return question.correct;
        if (question.correct_answer) {
            return question.options.findIndex((opt: string) => opt === question.correct_answer);
        }
        return -1;
    };

    function handleSelect(qid: number, option: string) {
        if (!quiz?.quiz[currentQuestionIndex]) return;

        setAnswers(a => ({ ...a, [qid]: option }));
        setShowFeedback(true);
        const currentQuestion = quiz.quiz[currentQuestionIndex];
        const isCorrect = option === currentQuestion.options[getCorrectIndex(currentQuestion)];
        if (isCorrect) {
            setScore(prev => prev + 1);
        }
        // Play correct/wrong sound
        (async () => {
            try {
                if (soundEnabled) {
                    const { sound } = await Audio.Sound.createAsync(
                        isCorrect
                            ? require('../../../assets/audio/correct.mp3')
                            : require('../../../assets/audio/wrong.mp3')
                    );
                    await sound.playAsync();
                }
            } catch (e) {
                // ... existing code ...
            }
        })();
    }

    async function handleNext() {
        if (!quiz?.quiz) return;

        if (currentQuestionIndex < quiz.quiz.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            setShowFeedback(false);
        } else {
            const percentage = (score / quiz.quiz.length) * 100;
            
            // Only promote/demote reading level on first attempt
            let promotedLevel = null;
            let demotedLevel = null;
            if (!hasCompletedChapter) {
                // Try promotion first, then demotion if not promoted
                promotedLevel = await checkAndPromoteReadingLevel(percentage);
                if (!promotedLevel) {
                    demotedLevel = await checkAndDemoteReadingLevel(percentage);
                } else {
                    setReadingLevelDemoted(null);
                }
            } else {
                setReadingLevelPromoted(null);
                setReadingLevelDemoted(null);
            }
            
            // Check if user earned money (80% or higher) AND hasn't completed this chapter before AND hasn't reached daily earning limit
            
            if (percentage >= 80 && !hasCompletedChapter && canEarnToday) {
                completeChapter(percentage, readingDuration || 0, false);
                setHasEarnedMoney(true);
                loadSavingsJugs();
                setShowJarSelection(true);
            } else {
                // Always complete the chapter to ensure progress is recorded
                // For review readings, this ensures next chapter can be unlocked
                completeChapter(percentage, readingDuration || 0, hasCompletedChapter);
                setShowResults(true);
            }

            // Enhanced quiz completion analytics
            analytics.track('reading_quiz_completed', {
                userId: user?.uid,
                chapterId,
                chapterName: quiz.chapterName,
                score,
                totalQuestions: quiz.quiz.length,
                percentage,
                duration: Math.floor((Date.now() - quizStartTime) / 1000),
                performance: percentage >= 90 ? 'excellent' :
                    percentage >= 75 ? 'good' :
                        percentage >= 60 ? 'average' : 'needs_improvement',
                correctAnswers: score,
                incorrectAnswers: quiz.quiz.length - score,
                timePerQuestion: Math.floor((Date.now() - quizStartTime) / 1000 / quiz.quiz.length),
                readingSpeedWPM: readingSpeed,
                readingLevelPromoted: promotedLevel,
                readingLevelDemoted: demotedLevel
            });

            // Show rate prompt only once, after quiz completion
            if (!hasShownRatePrompt && StoreReview.isAvailableAsync) {
                (async () => {
                    const available = await StoreReview.isAvailableAsync();
                    if (available) {
                        await StoreReview.requestReview();
                        await AsyncStorage.setItem('hasShownRatePrompt', 'true');
                        setHasShownRatePrompt(true);
                    }
                })();
            }
        }
    }

    // Check if user has already completed this chapter
    const checkIfUserCompletedChapter = async () => {
        if (!user?.uid || !chapterId) {
            return;
        }
        
        try {
            // Get selected profile from AsyncStorage
            let selectedProfileUid = await AsyncStorage.getItem('selectedProfileUid');
            let profileId: number | undefined = undefined;
            let profileName = 'Unknown';
            
            if (selectedProfileUid) {
                const profiles = await getAllProfiles();
                const selectedProfile = profiles.find(p => p.uid === selectedProfileUid);
                if (selectedProfile) {
                    profileId = selectedProfile.id;
                    profileName = selectedProfile.name;
                }
            }
            
            // Check for any completion (not just 80%+ scores) to prevent earning on retries
            const completed = await hasUserCompletedChapterWithScore(user.uid, chapterId, 0, selectedProfileUid || undefined);
            
            setHasCompletedChapter(completed);
        } catch (error) {
            setHasCompletedChapter(false); // Default to false on error
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.errorContainer}>
                <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
            </View>
        );
    }

    if (!quiz?.quiz?.length) {
        return (
            <View style={styles.errorContainer}>
                <Text style={[styles.error, { color: colors.error }]}>No questions available.</Text>
            </View>
        );
    }

    const currentQuestion = quiz.quiz[currentQuestionIndex];
    if (!currentQuestion) return null;

    const progress = ((currentQuestionIndex + 1) / quiz.quiz.length) * 100;
    const isCorrect = answers[currentQuestionIndex] === currentQuestion.options[getCorrectIndex(currentQuestion)];

    // Dynamic colors
    const cardBg = isDark ? '#181A20' : '#fff';
    const gradientColors: [string, string] = isDark
        ? ['rgba(124,58,237,0.18)', 'rgba(124,58,237,0.08)']
        : ['rgba(124,58,237,0.10)', 'rgba(124,58,237,0.05)'];
    const optionBg = isDark ? '#23242A' : '#F3F4F6';
    const optionText = isDark ? '#E5E7EB' : '#374151';
    const borderColor = isDark ? '#33364A' : '#E5E7EB';
    const progressBg = isDark ? '#23242A' : '#F3F4F6';
    const progressBar = isDark ? '#A78BFA' : '#7C3AED';
    const correctBg = isDark ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.15)';
    const correctBorder = isDark ? 'rgba(34,197,94,0.5)' : 'rgba(34,197,94,0.5)';
    const correctText = isDark ? '#4ADE80' : '#16A34A';
    const wrongBg = isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.15)';
    const wrongBorder = isDark ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.5)';
    const wrongText = isDark ? '#F87171' : '#DC2626';
    const feedbackBadgeBg = (isCorrect: boolean) => isCorrect ? correctBg : wrongBg;
    const feedbackBadgeText = (isCorrect: boolean) => isCorrect ? correctText : wrongText;
    const nextButtonGradient: [string, string] = isDark ? ['#7C3AED', '#6366F1'] : [colors.primary, `${colors.primary}CC`];
    const shadow = isDark ? {} : styles.lightShadow;

    const getOptionStyle = (opt: string) => {
        if (!showFeedback) {
            return answers[currentQuestionIndex] === opt
                ? { backgroundColor: progressBar, transform: [{ scale: 1.02 }] }
                : { backgroundColor: optionBg, borderColor, borderWidth: 1 };
        }
        if (opt === currentQuestion.options[getCorrectIndex(currentQuestion)]) {
            return {
                backgroundColor: correctBg,
                borderColor: correctBorder,
                borderWidth: 1,
            };
        }
        if (answers[currentQuestionIndex] === opt && opt !== currentQuestion.options[getCorrectIndex(currentQuestion)]) {
            return {
                backgroundColor: wrongBg,
                borderColor: wrongBorder,
                borderWidth: 1,
            };
        }
        return { backgroundColor: optionBg, borderColor, borderWidth: 1 };
    };

    const getOptionTextStyle = (opt: string) => {
        if (!showFeedback) {
            return answers[currentQuestionIndex] === opt
                ? { color: '#fff' }
                : { color: optionText };
        }
        if (opt === currentQuestion.options[getCorrectIndex(currentQuestion)]) {
            return { color: correctText, fontWeight: '700' as const };
        }
        if (answers[currentQuestionIndex] === opt && opt !== currentQuestion.options[getCorrectIndex(currentQuestion)]) {
            return { color: wrongText, fontWeight: '700' as const };
        }
        return { color: optionText };
    };

    if (showResults) {
        const percentage = (score / quiz.quiz.length) * 100;
        let resultEmoji, resultMessage, resultColor, shouldRetry, resultSubText;

        if (percentage >= 90) {
            resultEmoji = '🎉';
            resultMessage = 'Amazing! You and Dimpo are totally in sync with the story!';
            resultSubText = 'You caught every detail — like a true story explorer!';
            resultColor = '#10B981'; // Emerald
            shouldRetry = false;
        } else if (percentage >= 75) {
            resultEmoji = '🌟';
            resultMessage = "Great work! You're catching all the key moments!";
            resultSubText = "Dimpo's impressed. You're really following the journey!";
            resultColor = '#3B82F6'; // Blue
            shouldRetry = false;
        } else if (percentage >= 60) {
            resultEmoji = '👍';
            resultMessage = "Nice try! You're getting the hang of it — keep going!";
            resultSubText = "Some twists might've slipped by — read closely next time!";
            resultColor = '#F59E0B'; // Amber
            shouldRetry = true;
        } else {
            resultEmoji = '📖';
            resultMessage = "Let's dive back into the story together. Dimpo believes in you!";
            resultSubText = "Sometimes it takes a second read — every hero learns with time!";
            resultColor = '#EF4444'; // Red
            shouldRetry = true;
        }

        return (
            <View style={[styles.resultsContainer, { backgroundColor: cardBg }, shadow]}>
                <LinearGradient
                    colors={gradientColors}
                    style={styles.gradientBackground}
                />
                <Image
                    source={require('../../../assets/images/dimpo/reading.png')}
                    style={{ width: 160, height: 240, marginBottom: 8 }}
                    resizeMode="contain"
                    accessibilityLabel="Dimpo reading a book"
                />
                <Text style={[styles.quizTitle, { color: colors.primary, marginBottom: 4, fontSize: 22 }]}>
                    {resultMessage}
                </Text>
                <Text style={[styles.resultMessage, { color: colors.textSecondary, marginBottom: 12, fontSize: 15 }]}>
                    {resultSubText}
                </Text>

                {/* Book completion message if chapter 5 and 80%+ */}
                {chapterNumber === 5 && percentage >= 80 && (
                    <View style={{ 
                        backgroundColor: isDark ? 'rgba(253,224,71,0.12)' : 'rgba(253,224,71,0.12)', 
                        padding: 14, 
                        borderRadius: 8, 
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(253,224,71,0.3)' : 'rgba(253,224,71,0.3)',
                        alignItems: 'center',
                    }}>
                        <Text style={{ 
                            color: isDark ? '#fde047' : '#b45309', 
                            fontSize: 16, 
                            fontWeight: '700', 
                            textAlign: 'center' 
                        }}>
                            🏆 You finished the book! Dimpo is super proud of you!
                        </Text>
                        <Text style={{ color: isDark ? '#fde68a' : '#b45309', fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                            Celebrate your achievement and pick your next adventure!
                        </Text>
                    </View>
                )}
                
                {/* Show money earned message if applicable */}
                {hasEarnedMoney && percentage >= 80 && canEarnToday && (
                    <View style={{ 
                        backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.1)', 
                        padding: 12, 
                        borderRadius: 8, 
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.3)'
                    }}>
                        <Text style={{ 
                            color: isDark ? '#4ADE80' : '#16A34A', 
                            fontSize: 14, 
                            fontWeight: '600', 
                            textAlign: 'center' 
                        }}>
                            💰 You earned {Number(agreedAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}! You can add it to your savings jars later.
                        </Text>
                    </View>
                )}
                
                {/* Show reading level promotion message if applicable */}
                {readingLevelPromoted && (
                    <View style={{ 
                        backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.1)', 
                        padding: 12, 
                        borderRadius: 8, 
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.3)'
                    }}>
                        <Text style={{ 
                            color: isDark ? '#60A5FA' : '#2563EB', 
                            fontSize: 14, 
                            fontWeight: '600', 
                            textAlign: 'center' 
                        }}>
                            🚀 Amazing! You've been promoted to {getTextLevel(readingLevelPromoted)} level! 
                            Your reading speed and comprehension are outstanding!
                        </Text>
                    </View>
                )}
                
                {/* Show reading level demotion message if applicable */}
                {readingLevelDemoted && (
                    <View style={{ 
                        backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.08)', 
                        padding: 12, 
                        borderRadius: 8, 
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.3)'
                    }}>
                        <Text style={{ 
                            color: isDark ? '#F87171' : '#DC2626', 
                            fontSize: 14, 
                            fontWeight: '600', 
                            textAlign: 'center' 
                        }}>
                            ⬇️ Your reading level has been adjusted to {getTextLevel(readingLevelDemoted)} level. 
                            Keep practicing to improve your speed and comprehension!
                        </Text>
                    </View>
                )}
                
                {/* Show message if user has already completed this chapter before */}
                {hasCompletedChapter && percentage >= 80 && (
                    <View style={{ 
                        backgroundColor: isDark ? 'rgba(156,163,175,0.1)' : 'rgba(156,163,175,0.1)', 
                        padding: 12, 
                        borderRadius: 8, 
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(156,163,175,0.3)' : 'rgba(156,163,175,0.3)'
                    }}>
                        <Text style={{ 
                            color: isDark ? '#9CA3AF' : '#6B7280', 
                            fontSize: 14, 
                            fontWeight: '600', 
                            textAlign: 'center' 
                        }}>
                            📚 You've already completed this chapter before. Great job reviewing!
                        </Text>
                    </View>
                )}
                
                {/* Show message if user has reached daily earning limit */}
                {percentage >= 80 && !hasCompletedChapter && !canEarnToday && dailyEarningLimitInfo && (
                    <View style={{ 
                        backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.1)', 
                        padding: 12, 
                        borderRadius: 8, 
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.3)'
                    }}>
                        <Text style={{ 
                            color: isDark ? '#F87171' : '#DC2626', 
                            fontSize: 14, 
                            fontWeight: '600', 
                            textAlign: 'center' 
                        }}>
                            💰 You've reached your daily earning limit of {Number(dailyEarningLimitInfo.limit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}! 
                            You earned {Number(dailyEarningLimitInfo.earnedToday).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} today. Come back tomorrow for more rewards!
                        </Text>
                    </View>
                )}
                
                <View style={{ width: '100%', height: 1, backgroundColor: isDark ? '#23242A' : '#E0E7FF', marginVertical: 12 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 8, gap: 24 }}>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 15, color: colors.textSecondary }}>Comprehension</Text>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: resultColor }}>
                            <Ionicons name="book-outline" size={18} color={resultColor} /> {percentage.toFixed(0)}%
                        </Text>
                    </View>
                </View>
                <Pressable
                    style={[styles.quizButton, { backgroundColor: colors.primary }]}
                    onPress={() => {
                        if (shouldRetry) {
                            // Reset quiz state
                            setCurrentQuestionIndex(0);
                            setAnswers({});
                            setShowResults(false);
                            setScore(0);
                            setShowFeedback(false);
                            setHasEarnedMoney(false);
                            setReadingLevelPromoted(null);
                            setReadingLevelDemoted(null);
                            // Close quiz and return to reading
                            onClose?.(true);
                        } else {
                            // If user has already completed this chapter, redirect to home
                            if (hasCompletedChapter) {
                                router.replace('/');
                            } else {
                                // Just close the quiz for good scores on first completion
                                onClose?.(false);
                            }
                        }
                    }}
                    disabled={isCompleting}
                >
                    {isCompleting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.quizButtonText}>
                            {shouldRetry ? 'Try Again' : 'Done'}
                        </Text>
                    )}
                </Pressable>
            </View>
        );
    }

    // Jar Selection Modal
    if (showJarSelection) {
        const percentage = (score / quiz.quiz.length) * 100;
        
        return (
            <Modal visible={showJarSelection} transparent animationType="fade">
                <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.35)' }]}>
                    <View style={[styles.modalContent, { backgroundColor: cardBg, borderRadius: 28, padding: 0, width: '92%', maxWidth: 420 }]}>
                        <LinearGradient
                            colors={gradientColors}
                            style={[styles.gradientBackground, { borderRadius: 20 }]}
                        />
                        <ScrollView contentContainerStyle={{ padding: 28 }} showsVerticalScrollIndicator={false}>
                            {/* Success Message */}
                            <View style={{ alignItems: 'center', marginBottom: 24 }}>
                                <Text style={{ fontSize: 64, marginBottom: 16 }}>💰</Text>
                                <Text style={[styles.quizTitle, { color: colors.primary, marginBottom: 8, fontSize: 24, textAlign: 'center' }]}>
                                    Congratulations! You earned {Number(agreedAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}!
                                </Text>
                                <Text style={[styles.resultMessage, { color: colors.textSecondary, marginBottom: 16, fontSize: 16, textAlign: 'center' }]}>
                                    You scored {percentage.toFixed(0)}% on the quiz! Choose a savings jar to add your reward.
                                </Text>
                                
                                {/* Daily earning limit info */}
                                {dailyEarningLimitInfo && (
                                    <View style={{ 
                                        backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.1)', 
                                        padding: 10, 
                                        borderRadius: 8, 
                                        marginTop: 8,
                                        borderWidth: 1,
                                        borderColor: isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.3)'
                                    }}>
                                        <Text style={{ 
                                            color: isDark ? '#60A5FA' : '#2563EB', 
                                            fontSize: 12, 
                                            fontWeight: '600', 
                                            textAlign: 'center' 
                                        }}>
                                            📊 Daily Progress: {(Number(dailyEarningLimitInfo.earnedToday) + Number(agreedAmount)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {Number(dailyEarningLimitInfo.limit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Show reading level promotion message if applicable */}
                            {readingLevelPromoted && (
                                <View style={{ 
                                    backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.1)', 
                                    padding: 12, 
                                    borderRadius: 8, 
                                    marginBottom: 24,
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.3)'
                                }}>
                                    <Text style={{ 
                                        color: isDark ? '#60A5FA' : '#2563EB', 
                                        fontSize: 14, 
                                        fontWeight: '600', 
                                        textAlign: 'center' 
                                    }}>
                                        🚀 Amazing! You've been promoted to {getTextLevel(readingLevelPromoted)} level! 
                                        Your reading speed and comprehension are outstanding!
                                    </Text>
                                </View>
                            )}

                            {/* Show reading level demotion message if applicable */}
                            {readingLevelDemoted && (
                                <View style={{ 
                                    backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.08)', 
                                    padding: 12, 
                                    borderRadius: 8, 
                                    marginBottom: 12,
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.3)'
                                }}>
                                    <Text style={{ 
                                        color: isDark ? '#F87171' : '#DC2626', 
                                        fontSize: 14, 
                                        fontWeight: '600', 
                                        textAlign: 'center' 
                                    }}>
                                        ⬇️ Your reading level has been adjusted to {getTextLevel(readingLevelDemoted)} level. 
                                        Keep practicing to improve your speed and comprehension!
                                    </Text>
                                </View>
                            )}

                            {/* Jar Selection */}
                            <View style={[styles.jarList, { marginBottom: 24 }]}> 
                                <Text style={[styles.questionText, { color: colors.text, marginBottom: 16, fontSize: 18, textAlign: 'center' }]}> 
                                    Select a savings goal:
                                </Text>
                                
                                {savingsJugs.length === 0 ? (
                                    <View style={{ alignItems: 'center', padding: 20 }}>
                                        <ActivityIndicator size="large" color={colors.primary} />
                                        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading savings jars...</Text>
                                    </View>
                                ) : (
                                    <View style={styles.jarsGrid}>
                                        {savingsJugs.map((jug, idx) => (
                                            <LinearGradient
                                                key={jug.id}
                                                colors={JUG_GRADIENTS[idx % JUG_GRADIENTS.length]}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={[
                                                    styles.jarGridCard,
                                                    selectedJugId === jug.id && styles.jarGridCardSelected
                                                ]}
                                            >
                                                <Pressable
                                                    style={({ pressed }) => [
                                                        styles.jarGridPressable,
                                                        pressed && styles.jarGridPressed
                                                    ]}
                                                    onPress={() => setSelectedJugId(jug.id)}
                                                >
                                                    <View style={styles.jarGridHeader}>
                                                        <Text style={[styles.jarEmoji, { color: '#fff' }]}> 
                                                            {jug.emoji || JUG_EMOJIS[idx % JUG_EMOJIS.length]}
                                                        </Text>
                                                    </View>
                                                    <Text style={[styles.jarGridName, { color: '#fff' }]}>{jug.name}</Text>
                                                    <Text style={[styles.jarGridBalance, { color: '#fff' }]}> 
                                                        {jug.balance.toLocaleString('en-US', {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2
                                                        })}
                                                    </Text>
                                                </Pressable>
                                            </LinearGradient>
                                        ))}
                                    </View>
                                )}
                            </View>

                            {/* Action Buttons */}
                            <View style={[styles.modalButtonRow, { width: '100%', marginTop: 8 }]}> 
                                <Pressable
                                    style={[
                                        styles.modalButton,
                                        { 
                                            backgroundColor: selectedJugId ? '#7C3AED' : '#9CA3AF',
                                            width: '100%'
                                        }
                                    ]}
                                    onPress={handleAddMoneyToJug}
                                    disabled={!selectedJugId || isAddingMoney}
                                >
                                    {isAddingMoney ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={[styles.modalButtonText, { color: '#fff' }]}> 
                                            Add {Number(agreedAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </Text>
                                    )}
                                </Pressable>
                            </View>
                            {showConfetti && (
                                <ConfettiCannon
                                    count={90}
                                    origin={{ x: 200, y: 0 }}
                                    fadeOut
                                    explosionSpeed={350}
                                    fallSpeed={3000}
                                />
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        );
    }

    return (
        <View style={[styles.quizContainer, { backgroundColor: cardBg, marginTop: 0, borderRadius: 10, padding: 0, width: '95%' }, shadow]}>
            <LinearGradient
                colors={gradientColors}
                style={styles.gradientBackground}
            />
            <Pressable
                style={styles.closeButton}
                onPress={() => onClose?.(false)}
                accessibilityRole="button"
                accessibilityLabel="Close quiz"
            >
                <Ionicons
                    name="close"
                    size={24}
                    color={isDark ? '#E5E7EB' : '#374151'}
                />
            </Pressable>
            <View style={[styles.progressContainer, { backgroundColor: progressBg }]}>
                <View style={[styles.progressBar, { width: `${progress}%`, backgroundColor: progressBar }]} />
            </View>
            <Text style={[styles.quizTitle, { color: progressBar }]}>{quiz.chapterName}</Text>
            <Text style={[styles.progressText, { color: isDark ? '#A1A1AA' : '#6B7280' }]}>
                Question {currentQuestionIndex + 1} of {quiz.quiz.length}
            </Text>
            
            {/* Reading Speed Display */}
            {readingSpeed && readingSpeed <= 200 && (
                <View style={[styles.readingSpeedContainer, { backgroundColor: isDark ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.05)' }]}>
                    <Text style={[styles.readingSpeedText, { color: isDark ? '#A78BFA' : '#7C3AED' }]}>
                        📖 Reading Speed: {readingSpeed} WPM
                    </Text>
                </View>
            )}
            
            <View style={styles.questionBlock}>
                <Text style={[styles.questionText, { color: isDark ? '#F3F4F6' : colors.text }]}>{currentQuestion.question}</Text>
                {currentQuestion.options.map((opt, index) => (
                    <Pressable
                        key={opt}
                        style={[
                            styles.optionButton,
                            getOptionStyle(opt),
                        ]}
                        onPress={() => !showFeedback && handleSelect(currentQuestionIndex, opt)}
                        disabled={showFeedback}
                        accessibilityRole="button"
                    >
                        <Text style={[styles.optionText, getOptionTextStyle(opt)]}>{opt}</Text>
                    </Pressable>
                ))}
            </View>
            <View style={styles.feedbackContainer}>
                {showFeedback && (
                    <>
                        <View style={[
                            styles.feedbackBadge,
                            { backgroundColor: feedbackBadgeBg(isCorrect) }
                        ]}>
                            <Text style={[
                                styles.feedbackText,
                                { color: feedbackBadgeText(isCorrect) }
                            ]}>
                                {isCorrect ? 'Correct!' : 'Incorrect!'}
                            </Text>
                        </View>
                        {/* Show correct answer if user was wrong */}
                        {!isCorrect && (
                            <Text style={{ color: correctText, fontWeight: '600', marginBottom: 12 }}>
                                Correct answer: {currentQuestion.options[getCorrectIndex(currentQuestion)]}
                            </Text>
                        )}
                    </>
                )}
                <Pressable
                    style={[
                        styles.nextButton,
                        !answers[currentQuestionIndex] && styles.disabledButton
                    ]}
                    onPress={handleNext}
                    disabled={!answers[currentQuestionIndex]}
                >
                    <LinearGradient
                        colors={answers[currentQuestionIndex] ? nextButtonGradient : ['#9CA3AF', '#9CA3AF']}
                        style={styles.nextButtonGradient}
                    >
                        <Text style={[
                            styles.nextButtonText,
                            !answers[currentQuestionIndex] && styles.disabledButtonText
                        ]}>
                            {currentQuestionIndex < quiz.quiz.length - 1 ? 'Next Question' : 'See Results'}
                        </Text>
                    </LinearGradient>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    quizContainer: {
        width: '90%',
        minWidth: 320,
        maxWidth: 420,
        alignSelf: 'center',
        borderRadius: 28,
        backgroundColor: '#fff', // fallback, will be overridden by cardBg
        paddingHorizontal: 24,
        paddingVertical: 28,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        overflow: 'hidden',
        marginVertical: 24,
    },
    lightShadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    gradientBackground: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    },
    progressContainer: {
        height: 6,
        borderRadius: 3,
        marginBottom: 20,
        overflow: 'hidden',
        marginTop: 32,
    },
    progressBar: {
        height: '100%',
        borderRadius: 3,
    },
    quizTitle: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
    },
    progressText: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        fontWeight: '500',
    },
    questionBlock: {
        marginBottom: 24,
    },
    questionText: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 20,
        lineHeight: 26,
    },
    optionButton: {
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    optionText: {
        fontSize: 16,
        fontWeight: '500',
    },
    feedbackContainer: {
        alignItems: 'center',
        marginTop: 24,
    },
    feedbackBadge: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        marginBottom: 20,
    },
    feedbackText: {
        fontSize: 16,
        fontWeight: '600',
    },
    nextButton: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    nextButtonGradient: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    nextButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    error: {
        marginTop: 24,
        fontSize: 16,
        textAlign: 'center',
        color: '#DC2626',
    },
    resultsContainer: {
        alignItems: 'center',
        width: '90%',
        minWidth: 320,
        maxWidth: 420,
        alignSelf: 'center',
        borderRadius: 28,
        backgroundColor: '#fff', // fallback, will be overridden by cardBg
        paddingHorizontal: 24,
        paddingVertical: 28,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        overflow: 'hidden',
        marginTop: 0,
        marginVertical: 24,
    },
    resultEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    scoreContainer: {
        alignItems: 'center',
        marginVertical: 24,
    },
    scoreText: {
        fontSize: 32,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    percentageText: {
        fontSize: 24,
        fontWeight: '600',
    },
    resultMessage: {
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 26,
    },
    quizButton: {
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 16,
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 8,
        minWidth: 200,
    },
    quizButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    disabledButton: {
        opacity: 0.7,
    },
    disabledButtonText: {
        color: '#E5E7EB',
    },
    retryMessage: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
        fontStyle: 'italic',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 10,
        padding: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.35)', // slightly darker overlay
    },
    modalContent: {
        width: '92%',
        maxWidth: 420,
        padding: 28,
        borderRadius: 28,
        backgroundColor: '#fff',
        elevation: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 32,
        alignItems: 'center',
    },
    jarList: {
        width: '100%',
        marginBottom: 24,
    },
    jarsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginHorizontal: 8,
        marginBottom: 24,
    },
    jarGridCard: {
        width: '48%',
        borderRadius: 20,
        paddingVertical: 18,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 12,
        elevation: 4,
        minHeight: 120,
        position: 'relative',
        backgroundColor: '#fff',
        borderWidth: 0,
        marginBottom: 16,
    },
    jarGridCardSelected: {
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
        elevation: 8,
    },
    jarGridPressable: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 22,
        paddingVertical: 2,
    },
    jarGridPressed: {
        opacity: 0.7,
        transform: [{ scale: 0.97 }],
    },
    jarGridHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        justifyContent: 'center',
        marginBottom: 2,
    },
    jarEmoji: {
        fontSize: 36,
        paddingTop: 14,
        textAlign: 'center',
    },
    jarGridName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#222',
        marginTop: 6,
        marginBottom: 2,
        textAlign: 'center',
    },
    jarGridBalance: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#3B27C1',
        marginTop: 2,
        textAlign: 'center',
    },
    modalButtonRow: {
        flexDirection: 'row',
        gap: 14,
        width: '100%',
        marginTop: 8,
    },
    modalButton: {
        flex: 1,
        borderRadius: 14,
        paddingVertical: 15,
        alignItems: 'center',
        backgroundColor: '#E5E7EB',
    },
    modalButtonPrimary: {
        backgroundColor: '#7C3AED',
    },
    modalButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    modalButtonTextPrimary: {
        color: '#fff',
    },
    readingSpeedContainer: {
        padding: 8,
        borderRadius: 8,
        marginBottom: 24,
    },
    readingSpeedText: {
        fontSize: 16,
        fontWeight: '500',
    },
}); 