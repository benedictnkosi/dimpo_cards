import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, NativeSyntheticEvent, NativeScrollEvent, Pressable, Image, Animated, Modal, TouchableOpacity, Clipboard } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { HOST_URL } from '@/config/api';
import { analytics } from '@/services/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { getLearner } from '@/services/api';
import { getCurrentReadingLevel } from '@/services/database';
import { router } from 'expo-router';
import dictionary from '@/assets/dictionary.json';
import _ from 'lodash';

interface ChapterContentProps {
    bookName?: string;
    chapterName: string;
    chapterNumber: number;
    content: string;
    fontSize?: number;
    onProgress?: (progress: number) => void;
    onStartQuiz?: (wordCount: number, readingDuration: number) => void;
    onClose?: () => void;
    image1?: string; // URL for first image placeholder
    image2?: string; // URL for second image placeholder
    readingLevel?: string; // Add reading level prop
}

function removeDoubleAsteriskText(text: string): string {
    return text.replace(/\*\*.*?\*\*/g, '');
}

// Helper function for safe analytics logging
async function logAnalyticsEvent(eventName: string, eventParams?: Record<string, any>) {
    try {
        await analytics.track(eventName, eventParams);
    } catch (error) {
        // ... existing code ...
    }
}

export function ChapterContent({ bookName, chapterName: initialChapterName, chapterNumber, content: initialContent, fontSize = 18, onProgress, onStartQuiz, onClose, image1, image2, readingLevel }: ChapterContentProps) {
    const { colors } = useTheme();
    const { user } = useAuth();
    const [localProgress, setLocalProgress] = useState(0);
    const [hasStartedReading, setHasStartedReading] = useState(false);
    const [isFreeUser, setIsFreeUser] = useState(true);
    const [showQuizButton, setShowQuizButton] = useState(false);
    const [currentReadingLevel, setCurrentReadingLevel] = useState<string>('Explorer');
    const fadeAnim = useState(new Animated.Value(0))[0];
    const scaleAnim = useState(new Animated.Value(0.8))[0];
    const startTimeRef = useRef<number>(Date.now());
    const [image1Url, setImage1Url] = useState<string | null>(null);
    const [image2Url, setImage2Url] = useState<string | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedWord, setSelectedWord] = useState<string | null>(null);
    const [selectedWordMeanings, setSelectedWordMeanings] = useState<string[]>([]);
    const [selectedWordPhonetic, setSelectedWordPhonetic] = useState<string | null>(null);
    const [isFetchingDefinition, setIsFetchingDefinition] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Extract chapter name from content if present at the start
    let chapterName = initialChapterName;
    let content = initialContent;
    // Regex: e.g., 'Chapter 2: Rivalry Ignites' or 'Chapter 2' at the start
    const chapterHeadingRegex = /^(Chapter\s*\d+(:?\s*[:\-]?\s*[^\n]*)?)\n+([\s\S]*)/i;
    const match = initialContent.match(chapterHeadingRegex);
    if (match) {
        chapterName = match[1].trim();
        content = match[3];
    }

    // Calculate word count from content
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

    // Get current reading level
    useEffect(() => {
        const loadReadingLevel = async () => {
            try {
                const readingLevel = await getCurrentReadingLevel();
                setCurrentReadingLevel(readingLevel);
            } catch (error) {
                setCurrentReadingLevel('Explorer');
            }
        };
        loadReadingLevel();
        
    }, []);

    // Get reading level emoji and description
    const getReadingLevelInfo = (level: string) => {
        switch (level) {
            case 'Explorer':
                return { emoji: '🧭', description: 'Beginner stories with simple words' };
            case 'Builder':
                return { emoji: '🧱', description: 'Slightly more complex phrasing, idioms' };
            case 'Challenger':
                return { emoji: '🧗‍♂️', description: 'More plot, bigger words' };
            default:
                return { emoji: '📖', description: 'Reading level' };
        }
    };

    // Calculate font size and spacing based on reading level
    const getTextStyles = () => {
        const isExplorer = currentReadingLevel === 'Explorer';
        
        return {
            fontSize: isExplorer ? Math.max(fontSize + 8, 26) : fontSize,
            lineHeight: isExplorer ? Math.max(fontSize + 12, 36) : fontSize + 6,
            letterSpacing: isExplorer ? 0.5 : 0,
            marginBottom: isExplorer ? 20 : 12,
        };
    };

    // Calculate container styles based on reading level
    const getContainerStyles = () => {
        const isExplorer = currentReadingLevel === 'Explorer';
        
        return {
            paddingTop: isExplorer ? 12 : 8,
            paddingHorizontal: isExplorer ? 16 : 12,
            paddingBottom: isExplorer ? 24 : 20,
            gap: isExplorer ? 12 : 8,
        };
    };

    // Calculate chapter name styles based on reading level
    const getChapterNameStyles = () => {
        const isExplorer = currentReadingLevel === 'Explorer';
        
        return {
            fontSize: isExplorer ? 26 : 22,
            fontWeight: 'bold' as const,
            textAlign: 'center' as const,
            flexShrink: 1,
            marginBottom: isExplorer ? 8 : 4,
            marginTop: 16,
        };
    };

    useEffect(() => {
        if (!user?.uid) return;
        getLearner(user.uid).then(learner => {
            setIsFreeUser((learner as any).subscription === 'free');
        }).catch(error => {
            // Error fetching learner info
        });
    }, [user?.uid]);

    // Fetch remote images for placeholders
    useEffect(() => {
        const fetchImage = async (imageName: string | undefined, setImageUrl: (url: string | null) => void) => {
            if (!imageName) return;
            
            try {
                const imageUrl = `${HOST_URL}/public/learn/book/get-image?image=${imageName}`;
                const response = await fetch(imageUrl, { method: 'HEAD' });
                if (response.ok) {
                    setImageUrl(imageUrl);
                } else {
                    setImageUrl(null);
                }
            } catch (error) {
                setImageUrl(null);
            }
        };

        fetchImage(image1, setImage1Url);
        fetchImage(image2, setImage2Url);
    }, [image1, image2]);

    // Handle quiz button visibility with animation
    useEffect(() => {
        if (localProgress >= 0.9 && onStartQuiz && !showQuizButton) {
            setShowQuizButton(true);
            // Small delay before starting animation
            setTimeout(() => {
                Animated.parallel([
                    Animated.timing(fadeAnim, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: false,
                    }),
                    Animated.timing(scaleAnim, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: false,
                    })
                ]).start();
            }, 300);
        }
    }, [localProgress, onStartQuiz, showQuizButton, fadeAnim, scaleAnim]);

    function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        const totalScrollable = contentSize.height - layoutMeasurement.height;

        // Log reading start event when user first scrolls
        if (!hasStartedReading && contentOffset.y > 0) {
            setHasStartedReading(true);
            logAnalyticsEvent('reading_started', {
                chapter_name: chapterName,
                chapter_number: chapterNumber
            });
        }

        if (totalScrollable <= 0) {
            onProgress?.(1);
            setLocalProgress(1);
            return;
        }
        const progress = Math.min(1, Math.max(0, contentOffset.y / totalScrollable));
        onProgress?.(progress);
        setLocalProgress(progress);
    }

    const handleStartQuiz = () => {
        // Calculate reading duration
        const endTime = Date.now();
        const readingDuration = endTime - startTimeRef.current;
        const readingDurationSeconds = Math.round(readingDuration / 1000);
        logAnalyticsEvent('quiz_started', {
            chapter_name: chapterName,
            chapter_number: chapterNumber,
            reading_progress: localProgress,
            word_count: wordCount,
            reading_duration_seconds: readingDurationSeconds
        });
        onStartQuiz?.(wordCount, readingDurationSeconds);
    };

    // Fetch word definition from Free Dictionary API
    async function fetchWordDefinition(word: string) {
        setIsFetchingDefinition(true);
        setFetchError(null);
        setSelectedWordMeanings([]);
        setSelectedWordPhonetic(null);
        try {
            const cleanWord = word.replace(/[^a-zA-Z]/g, '');
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanWord}`);
            if (!response.ok) {
                throw new Error('No definition found.');
            }
            const data = await response.json();
            // Get first phonetic
            let phonetic: string | null = null;
            if (Array.isArray(data) && data[0]?.phonetics?.length) {
                const found = data[0].phonetics.find((p: any) => p.text);
                phonetic = found ? found.text : null;
            }
            setSelectedWordPhonetic(phonetic);
            // Gather all definitions from all meanings
            const allDefinitions: string[] = [];
            if (Array.isArray(data)) {
                data.forEach((entry: any) => {
                    if (Array.isArray(entry.meanings)) {
                        entry.meanings.forEach((meaningObj: any) => {
                            if (Array.isArray(meaningObj.definitions)) {
                                meaningObj.definitions.forEach((defObj: any) => {
                                    if (defObj.definition) {
                                        allDefinitions.push(defObj.definition);
                                    }
                                });
                            }
                        });
                    }
                });
            }
            if (allDefinitions.length > 0) {
                setSelectedWordMeanings(allDefinitions.slice(0, 3));
            } else {
                setSelectedWordMeanings([]);
                setFetchError('No definition found.');
            }
        } catch (err) {
            setSelectedWordMeanings([]);
            setSelectedWordPhonetic(null);
            setFetchError('No definition found.');
        } finally {
            setIsFetchingDefinition(false);
        }
    }

    // Function to process content and replace image placeholders with actual images
    const processContentWithImages = (content: string): React.ReactNode[] => {
        let workingContent = content;

        // Remove all placeholders from the content (including those with descriptions)
        workingContent = workingContent.replace(/\[IMAGE_PLACEHOLDER_1[^\]]*\]/g, '');
        workingContent = workingContent.replace(/\[IMAGE_PLACEHOLDER_2[^\]]*\]/g, '');

        // Insert [IMAGE_PLACEHOLDER_2] in the middle (after nearest \n\n)
        let contentWithImage2 = workingContent;
        if (image2Url) {
            // Find all \n\n positions
            const doubleNewlineMatches = [...workingContent.matchAll(/\n\n/g)].map(m => m.index!);
            if (doubleNewlineMatches.length > 0) {
                // Find the one closest to the middle
                const middle = Math.floor(workingContent.length / 2);
                let closest = doubleNewlineMatches[0];
                let minDist = Math.abs(closest - middle);
                for (const idx of doubleNewlineMatches) {
                    const dist = Math.abs(idx - middle);
                    if (dist < minDist) {
                        closest = idx;
                        minDist = dist;
                    }
                }
                // Insert [IMAGE_PLACEHOLDER_2] after this \n\n
                contentWithImage2 =
                    workingContent.slice(0, closest + 2) + // +2 to go after the \n\n
                    '\n[IMAGE_PLACEHOLDER_2]\n' +
                    workingContent.slice(closest + 2);
            } else {
                // If no \n\n found, just append to the middle
                const middle = Math.floor(workingContent.length / 2);
                contentWithImage2 =
                    workingContent.slice(0, middle) +
                    '\n[IMAGE_PLACEHOLDER_2]\n' +
                    workingContent.slice(middle);
            }
        }

        // Log the final content after image logic
        // ... existing code ...

        // Split for rendering
        const parts = contentWithImage2.split(/(\[IMAGE_PLACEHOLDER_2\])/);
        const result: React.ReactNode[] = [];

        parts.forEach((part, index) => {
            if (part === '[IMAGE_PLACEHOLDER_2]') {
                if (image2Url) {
                    result.push(
                        <Image
                            key={`img-2-${index}`}
                            source={{ uri: image2Url }}
                            style={{ width: '100%', height: undefined, aspectRatio: 1, borderRadius: 12, marginVertical: 16 }}
                            resizeMode="cover"
                        />
                    );
                }
            } else if (part.trim().length > 0) {
                // Split part into words and spaces, preserving spaces
                const wordsAndSpaces = part.split(/(\s+)/);
                result.push(
                    <Text
                        key={`text-${index}`}
                        style={[styles.content, { color: colors.text, ...getTextStyles() }]}
                        accessibilityLabel={removeDoubleAsteriskText(part)}
                    >
                        {wordsAndSpaces.map((word, i) => {
                            if (/^\s+$/.test(word)) {
                                return word;
                            }
                            return (
                                <Text
                                    key={`word-${index}-${i}`}
                                    onLongPress={() => {
                                        setSelectedWord(word);
                                        setModalVisible(true);
                                        fetchWordDefinition(word);
                                    }}
                                    style={{ backgroundColor: selectedWord === word && modalVisible ? colors.surface : undefined }}
                                >
                                    {removeDoubleAsteriskText(word)}
                                </Text>
                            );
                        })}
                    </Text>
                );
            }
        });

        return result;
    };

    // Always show image1 at the top if present
    const shouldShowImage1AtTop = !!image1Url;

    // Get the reading level to display (use prop if available, otherwise use current user level)
    const displayReadingLevel = readingLevel || currentReadingLevel;
    const readingLevelInfo = getReadingLevelInfo(displayReadingLevel);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.contentContainer, getContainerStyles()]}
                showsVerticalScrollIndicator={true}
                accessibilityRole="scrollbar"
                onScroll={handleScroll}
                scrollEventThrottle={16}
            >
                <View style={styles.chapterHeader}>
                    <View style={styles.closeButtonContainer}>
                        <Pressable
                            style={({ pressed }) => [
                                styles.closeButton,
                                {
                                    opacity: pressed ? 0.7 : 1,
                                    transform: [{ scale: pressed ? 0.95 : 1 }]
                                }
                            ]}
                            onPress={() => router.back()}
                            accessibilityRole="button"
                            accessibilityLabel="Close chapter"
                        >
                            <Text style={[styles.closeIcon, { color: colors.primary }]}>✕</Text>
                        </Pressable>
                    </View>
                    
                    {/* Book Name Display */}
                    {bookName && (
                        <Text
                            style={{ color: colors.text, fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 2 }}
                            accessibilityRole="header"
                            accessibilityLabel={`Book: ${bookName}`}
                        >
                            {bookName}
                        </Text>
                    )}
                    <Text
                        style={[styles.chapterName, { color: colors.primary }, getChapterNameStyles()]}
                        accessibilityRole="header"
                        accessibilityLabel={`Chapter: ${chapterName}`}
                    >
                        {chapterName}
                    </Text>

                    {/* Reading Level Display */}
                    <View style={styles.readingLevelContainer}>
                        <View style={[styles.readingLevelBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={styles.readingLevelEmoji}>{readingLevelInfo.emoji}</Text>
                            <Text style={[styles.readingLevelText, { color: colors.text }]}>{displayReadingLevel}</Text>
                        </View>
                        <Text style={[styles.readingLevelDescription, { color: colors.textSecondary }]}>
                            {readingLevelInfo.description}
                        </Text>
                    </View>
                </View>

                {/* Always show first image at the beginning if present */}
                {shouldShowImage1AtTop && (
                    <Image
                        source={{ uri: image1Url! }}
                        style={{ width: '100%', height: undefined, aspectRatio: 1, borderRadius: 12, marginVertical: 16 }}
                        resizeMode="cover"
                    />
                )}

                {processContentWithImages(content)}
                
                {/* Quiz button inside scroll content */}
                {onStartQuiz && showQuizButton && (
                    <View style={styles.buttonContainer}>
                        <Animated.View style={{
                            opacity: fadeAnim,
                            transform: [{ scale: scaleAnim }]
                        }}>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.quizButton, 
                                    { 
                                        backgroundColor: colors.primary,
                                        opacity: pressed ? 0.8 : 1,
                                        transform: [{ scale: pressed ? 0.95 : 1 }]
                                    }
                                ]}
                                onPress={handleStartQuiz}
                                accessibilityRole="button"
                            >
                                <Text style={[styles.quizButtonText, { color: colors.background }]}>Take a Quick Quiz</Text>
                            </Pressable>
                        </Animated.View>
                    </View>
                )}
            </ScrollView>
            {/* Modal for word context */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                    <View style={{ backgroundColor: colors.surface, padding: 24, borderRadius: 16, alignItems: 'center', minWidth: 200 }}>
                        
                        {isFetchingDefinition ? (
                            <Text style={{ fontSize: 18, color: '#FFB300', marginBottom: 16, textAlign: 'center' }}>Looking up...</Text>
                        ) : fetchError ? (
                            <Text style={{ fontSize: 18, color: '#FF5252', marginBottom: 16, textAlign: 'center' }}>{fetchError}</Text>
                        ) : selectedWordMeanings.length > 0 ? (
                            <View style={{ marginBottom: 12, width: 260 }}>
                                {/* Word and phonetic */}
                                <View style={{ alignItems: 'center', marginBottom: 10 }}>
                                    <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#4F8EF7', marginBottom: 2 }}>{selectedWord}</Text>
                                    {selectedWordPhonetic && (
                                        <Text style={{ fontSize: 18, color: '#43A047', fontStyle: 'italic', marginBottom: 6 }}>{selectedWordPhonetic}</Text>
                                    )}
                                </View>
                                {/* Meanings */}
                                <View style={{ backgroundColor: '#FFF8E1', borderRadius: 16, padding: 12, borderWidth: 2, borderColor: '#FFD54F', marginBottom: 8 }}>
                                    {selectedWordMeanings.map((meaning, idx) => (
                                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                                            <Text style={{ fontSize: 20, color: '#FFB300', fontWeight: 'bold', marginRight: 8 }}>{String.fromCodePoint(0x1F4D6)}</Text>
                                            <Text style={{ fontSize: 16, color: '#333', flex: 1 }}>{meaning}</Text>
                                        </View>
                                    ))}
                                </View>
                                <Text style={{ fontSize: 14, color: '#888', textAlign: 'center', marginTop: 4 }}>Powered by <Text style={{ color: '#4F8EF7', fontWeight: 'bold' }}>dictionaryapi.dev</Text></Text>
                            </View>
                        ) : null}
                        <TouchableOpacity onPress={() => setModalVisible(false)} style={{ marginTop: 8, backgroundColor: '#4F8EF7', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 24, alignSelf: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 }}>
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>Yay, Got it!</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        borderRadius: 16,
        position: 'relative',
        paddingTop: 32,
    },
    closeButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0, 0, 0, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    closeIcon: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        // Dynamic values applied via getContainerStyles()
    },
    chapterName: {
        // Dynamic values applied via getChapterNameStyles()
    },
    content: {
        textAlign: 'left',
        fontWeight: '400',
    },
    buttonContainer: {
        padding: 16,
        backgroundColor: 'transparent',
        marginTop: 20,
    },
    quizButton: {
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 16,
        alignItems: 'center',
        minWidth: 200,
        alignSelf: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    quizButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    chapterHeader: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 4,
        position: 'relative',
        paddingTop: 32,
    },
    closeButtonContainer: {
        position: 'absolute',
        top: -8,
        right: 0,
        zIndex: 1,
    },
    readingLevelContainer: {
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 8,
        gap: 4,
    },
    readingLevelBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderWidth: 1,
        borderRadius: 20,
        gap: 6,
    },
    readingLevelEmoji: {
        fontSize: 18,
    },
    readingLevelText: {
        fontSize: 14,
        fontWeight: '600',
    },
    readingLevelDescription: {
        fontSize: 12,
        fontWeight: '400',
        textAlign: 'center',
        opacity: 0.8,
    },
}); 