import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useTheme } from '@/contexts/ThemeContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { DailyLimitInfo } from '@/services/dailyLimit';
import { LifetimeStats, CombinedLimitInfo } from '@/services/lifetimeStats';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface DailyLimitBannerProps {
  dailyLimitInfo?: DailyLimitInfo;
  lifetimeStats?: LifetimeStats;
  combinedLimitInfo?: CombinedLimitInfo;
  onUpgradePress?: () => void;
  showUpgradeButton?: boolean;
  showLifetimeStats?: boolean;
}

export function DailyLimitBanner({ 
  dailyLimitInfo, 
  lifetimeStats,
  combinedLimitInfo,
  onUpgradePress,
  showUpgradeButton = true,
  showLifetimeStats = true
}: DailyLimitBannerProps) {
  const { colors, isDark } = useTheme();
  const { showPaywall } = useRevenueCat();

  // Use combined info if provided, otherwise use individual props
  const limitInfo = combinedLimitInfo?.daily || dailyLimitInfo;
  const lifetime = combinedLimitInfo?.lifetime || lifetimeStats;

  const handleUpgradePress = async () => {
    if (onUpgradePress) {
      onUpgradePress();
    } else {
      try {
        await showPaywall();
      } catch (error) {
        console.error('Error showing paywall:', error);
      }
    }
  };

  // Don't show banner for premium users
  if (limitInfo?.isPremium) {
    return null;
  }

  const isLimitReached = limitInfo?.isLimitReached || false;
  const remainingQuestions = limitInfo ? Math.max(0, limitInfo.limit - limitInfo.count) : 0;
  const isLifetimeLimitReached = lifetime?.isLimitReached || false;

  return (
    <LinearGradient
      colors={isLimitReached || isLifetimeLimitReached
        ? ['#FEF2F2', '#FEE2E2'] 
        : ['#F0F9FF', '#E0F2FE']
      }
      style={[
        styles.container,
        { borderColor: (isLimitReached || isLifetimeLimitReached) ? colors.error + '30' : colors.primary + '30' }
      ]}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons 
            name={isLimitReached || isLifetimeLimitReached ? "time-outline" : "hourglass-outline"} 
            size={24} 
            color={isLimitReached || isLifetimeLimitReached ? colors.error : colors.primary} 
          />
        </View>
        
        <View style={styles.textContainer}>
          <ThemedText style={[
            styles.title,
            { color: isLimitReached || isLifetimeLimitReached ? colors.error : colors.primary }
          ]}>
            {isLifetimeLimitReached ? 'Lifetime Limit Reached!' : 
             isLimitReached ? 'Daily Limit Reached!' : 'Question Limits'}
          </ThemedText>
          
          <ThemedText style={[
            styles.subtitle,
            { color: colors.textSecondary }
          ]}>
            {isLifetimeLimitReached 
              ? 'You\'ve used all your free questions. Upgrade to Premium for unlimited access!'
              : isLimitReached 
              ? `You've answered ${limitInfo?.count || 0} questions today. Upgrade to Premium for unlimited questions!`
              : `Daily: ${remainingQuestions} remaining | Lifetime: ${lifetime?.remainingQuestions || 0} remaining`
            }
          </ThemedText>
          
          {!isLimitReached && !isLifetimeLimitReached && limitInfo && (
            <View style={styles.progressContainer}>
              <View style={[
                styles.progressBar,
                { backgroundColor: colors.textSecondary + '20' }
              ]}>
                <View 
                  style={[
                    styles.progressFill,
                    { 
                      width: `${(limitInfo.count / limitInfo.limit) * 100}%`,
                      backgroundColor: colors.primary
                    }
                  ]} 
                />
              </View>
              <ThemedText style={[
                styles.progressText,
                { color: colors.textSecondary }
              ]}>
                {limitInfo.count}/{limitInfo.limit}
              </ThemedText>
            </View>
          )}
        </View>
        
        {showUpgradeButton && (
          <Pressable
            style={[
              styles.upgradeButton,
              { backgroundColor: isLimitReached || isLifetimeLimitReached ? colors.error : colors.primary }
            ]}
            onPress={handleUpgradePress}
          >
            <ThemedText style={styles.upgradeButtonText}>
              {isLimitReached || isLifetimeLimitReached ? 'Upgrade Now' : 'Upgrade'}
            </ThemedText>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Lifetime stats styles
  lifetimeContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    padding: 16,
    paddingTop: 12,
  },
  lifetimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  lifetimeTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  lifetimeStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  lifetimeStat: {
    alignItems: 'center',
    flex: 1,
  },
  lifetimeStatValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  lifetimeStatLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
}); 