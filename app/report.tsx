import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemedText } from '@/components/ThemedText';
import { useDatabase } from '@/hooks/useDatabase';
import { 
  getLearnerProgressByMainTopic, 
  getLearnerProgressByTopic, 
  getOverallStatistics,
  getRecentActivity,
  getAllQuestionReports
} from '@/services/database';

interface MainTopicProgress {
  main_topic: string;
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  accuracy_percentage: number;
  subtopics_count: number;
  completed_subtopics: number;
  last_activity: string | null;
}

interface SubtopicProgress {
  main_topic: string;
  sub_topic: string;
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  accuracy_percentage: number;
  last_activity: string | null;
}

interface OverallStats {
  total_questions_available: number;
  total_questions_answered: number;
  total_correct_answers: number;
  overall_accuracy: number;
  total_subtopics: number;
  completed_subtopics: number;
  total_main_topics: number;
  completed_main_topics: number;
  streak_days: number;
}

interface DailyActivity {
  date: string;
  questions_answered: number;
  correct_answers: number;
  accuracy_percentage: number;
}

export default function ReportScreen() {
  const { colors, isDark } = useTheme();
  const { isInitialized, isLoading: isDatabaseLoading } = useDatabase();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [mainTopicProgress, setMainTopicProgress] = useState<MainTopicProgress[]>([]);
  const [subtopicProgress, setSubtopicProgress] = useState<SubtopicProgress[]>([]);
  const [recentActivity, setRecentActivity] = useState<DailyActivity[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    const fetchReportData = async () => {
      if (!isInitialized) {
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Get all question reports data (for internal use)
        try {
          await getAllQuestionReports();
        } catch (e) {
          // Silently handle error for question reports
        }

        const [stats, mainTopics, subtopics, activity] = await Promise.all([
          getOverallStatistics(),
          getLearnerProgressByMainTopic(),
          getLearnerProgressByTopic(),
          getRecentActivity(7)
        ]);

        setOverallStats(stats);
        setMainTopicProgress(mainTopics);
        setSubtopicProgress(subtopics);
        setRecentActivity(activity);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReportData();
  }, [isInitialized]);

  const toggleTopicExpansion = (mainTopic: string) => {
    const newExpanded = new Set(expandedTopics);
    if (newExpanded.has(mainTopic)) {
      newExpanded.delete(mainTopic);
    } else {
      newExpanded.add(mainTopic);
    }
    setExpandedTopics(newExpanded);
  };

  const getSubtopicProgressForMainTopic = (mainTopic: string) => {
    return subtopicProgress.filter(subtopic => subtopic.main_topic === mainTopic);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return '#22c55e'; // Green
    if (percentage >= 60) return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  };

  const renderOverallStats = () => {
    if (!overallStats) return null;

    const stats = [
      {
        icon: '📊',
        title: 'Overall Accuracy',
        value: `${overallStats.overall_accuracy || 0}%`,
        color: getProgressColor(overallStats.overall_accuracy || 0)
      },
      {
        icon: '📝',
        title: 'Questions Answered',
        value: `${overallStats.total_questions_answered || 0}/${overallStats.total_questions_available || 0}`,
        color: colors.primary
      },
      {
        icon: '✅',
        title: 'Correct Answers',
        value: (overallStats.total_correct_answers || 0).toString(),
        color: '#22c55e'
      },
      {
        icon: '📚',
        title: 'Topics Completed',
        value: `${overallStats.completed_main_topics || 0}/${overallStats.total_main_topics || 0}`,
        color: colors.primary
      },
      {
        icon: '🔥',
        title: 'Current Streak',
        value: (overallStats.streak_days || 0).toString(),
        color: '#f59e0b'
      },
      {
        icon: '📖',
        title: 'Subtopics Completed',
        value: `${overallStats.completed_subtopics || 0}/${overallStats.total_subtopics || 0}`,
        color: colors.primary
      }
    ];

    return (
      <View style={styles.overallStatsContainer}>
        <ThemedText style={styles.sectionTitle}>Overall Progress</ThemedText>
        <View style={styles.statsGrid}>
          {stats.map((stat, index) => (
            <View key={index} style={[styles.statCard, { backgroundColor: isDark ? colors.surface : '#fff' }]}>
              <ThemedText style={styles.statIcon}>{stat.icon}</ThemedText>
              <ThemedText style={[styles.statValue, { color: stat.color }]}>{stat.value}</ThemedText>
              <ThemedText style={styles.statTitle}>{stat.title}</ThemedText>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderRecentActivity = () => {
    if (recentActivity.length === 0) return null;

    return (
      <View style={styles.recentActivityContainer}>
        <ThemedText style={styles.sectionTitle}>Recent Activity (Last 7 Days)</ThemedText>
        <View style={[styles.activityCard, { backgroundColor: isDark ? colors.surface : '#fff' }]}>
          {recentActivity.map((day, index) => (
            <View key={index} style={styles.activityRow}>
              <ThemedText style={styles.activityDate}>{formatDate(day.date)}</ThemedText>
              <View style={styles.activityStats}>
                <ThemedText style={styles.activityQuestions}>{day.questions_answered || 0} questions</ThemedText>
                <ThemedText style={[styles.activityAccuracy, { color: getProgressColor(day.accuracy_percentage || 0) }]}>
                  {day.accuracy_percentage || 0}% accuracy
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderMainTopicProgress = () => {
    return (
      <View style={styles.topicsContainer}>
        <ThemedText style={styles.sectionTitle}>Progress by Topic</ThemedText>
        {mainTopicProgress.map((topic, index) => {
          const subtopics = getSubtopicProgressForMainTopic(topic.main_topic);
          const isExpanded = expandedTopics.has(topic.main_topic);
          const progressPercentage = (topic.total_questions || 0) > 0 
            ? ((topic.answered_questions || 0) / (topic.total_questions || 0)) * 100 
            : 0;
          const accuracyPercentage = (topic.answered_questions || 0) > 0
            ? ((topic.correct_answers || 0) / (topic.answered_questions || 0)) * 100
            : 0;

          return (
            <View key={index} style={[styles.topicCard, { backgroundColor: isDark ? colors.surface : '#fff' }]}>
              <Pressable 
                style={styles.topicHeader}
                onPress={() => toggleTopicExpansion(topic.main_topic)}
              >
                <View style={styles.topicHeaderLeft}>
                  <ThemedText style={styles.topicName}>{topic.main_topic}</ThemedText>
                  <ThemedText style={styles.topicSubtitle}>
                    {topic.completed_subtopics || 0}/{topic.subtopics_count || 0} subtopics completed
                  </ThemedText>
                </View>
                <View style={styles.topicHeaderRight}>
                  <ThemedText style={[styles.topicAccuracy, { color: getProgressColor(progressPercentage) }]}> 
                    {Math.round(progressPercentage)}%
                  </ThemedText>
                  <ThemedText style={{ fontSize: 10, color: getProgressColor(accuracyPercentage) }}>
                    {topic.answered_questions > 0 ? `${Math.round(accuracyPercentage)}% accuracy` : ''}
                  </ThemedText>
                  <Ionicons 
                    name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                    size={20} 
                    color={colors.textSecondary} 
                  />
                </View>
              </Pressable>

              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
              </View>

              <ThemedText style={styles.topicStats}>
                {topic.answered_questions || 0}/{topic.total_questions || 0} questions answered
              </ThemedText>

              {isExpanded && subtopics.length > 0 && (
                <View style={styles.subtopicsContainer}>
                  {subtopics.map((subtopic, subIndex) => {
                    const subProgress = (subtopic.total_questions || 0) > 0
                      ? ((subtopic.answered_questions || 0) / (subtopic.total_questions || 0)) * 100
                      : 0;
                    const subAccuracy = (subtopic.answered_questions || 0) > 0
                      ? ((subtopic.correct_answers || 0) / (subtopic.answered_questions || 0)) * 100
                      : 0;
                    return (
                      <View key={subIndex} style={styles.subtopicItem}>
                        <View style={styles.subtopicHeader}>
                          <ThemedText style={styles.subtopicName}>{subtopic.sub_topic}</ThemedText>
                          <ThemedText style={[styles.subtopicAccuracy, { color: getProgressColor(subProgress) }]}> 
                            {Math.round(subProgress)}%
                          </ThemedText>
                          <ThemedText style={{ fontSize: 10, color: getProgressColor(subAccuracy), marginLeft: 8 }}>
                            {subtopic.answered_questions > 0 ? `${Math.round(subAccuracy)}% accuracy` : ''}
                          </ThemedText>
                        </View>
                        <View style={styles.subtopicProgressBar}>
                          <View 
                            style={[
                              styles.subtopicProgressFill, 
                              { 
                                width: `${subProgress}%`,
                                backgroundColor: getProgressColor(subProgress)
                              }
                            ]} 
                          />
                        </View>
                        <ThemedText style={styles.subtopicStats}>
                          {subtopic.answered_questions || 0}/{subtopic.total_questions || 0} questions
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  if (isLoading || isDatabaseLoading || !isInitialized) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText style={[styles.loadingText, { color: colors.textSecondary }]}>
            {!isInitialized ? 'Initializing database...' : 'Loading report...'}
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={colors.error} />
          <ThemedText style={[styles.errorText, { color: colors.text }]}>
            {error}
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <ThemedText style={[styles.headerTitle, { color: colors.text }]}>📈 Learning Report</ThemedText>
          <Pressable 
            style={styles.closeButton}
            onPress={() => router.back()}
            android_ripple={{ color: colors.surface }}
            hitSlop={10}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <ThemedText style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Your personalized progress overview 🚀</ThemedText>
      </View>
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderOverallStats()}
        {renderRecentActivity()}
        {renderMainTopicProgress()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSubtitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 24,
  },
  overallStatsContainer: {
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    opacity: 0.7,
  },
  recentActivityContainer: {
    marginBottom: 20,
  },
  activityCard: {
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  activityDate: {
    fontSize: 14,
    fontWeight: '500',
  },
  activityStats: {
    alignItems: 'flex-end',
  },
  activityQuestions: {
    fontSize: 14,
    fontWeight: '600',
  },
  activityAccuracy: {
    fontSize: 12,
    fontWeight: '500',
  },
  topicsContainer: {
    marginBottom: 20,
  },
  topicCard: {
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  topicHeaderLeft: {
    flex: 1,
  },
  topicName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  topicSubtitle: {
    fontSize: 12,
    opacity: 0.7,
  },
  topicHeaderRight: {
    alignItems: 'flex-end',
  },
  topicAccuracy: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 2,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  topicStats: {
    fontSize: 12,
    opacity: 0.7,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  subtopicsContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingTop: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  subtopicItem: {
    marginBottom: 12,
  },
  subtopicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  subtopicName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  subtopicAccuracy: {
    fontSize: 12,
    fontWeight: '600',
  },
  subtopicProgressBar: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 2,
    marginBottom: 4,
  },
  subtopicProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  subtopicStats: {
    fontSize: 11,
    opacity: 0.6,
  },
}); 