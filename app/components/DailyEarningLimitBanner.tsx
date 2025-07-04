import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { DailyEarningLimitInfo } from '@/services/dailyEarningLimit';

interface DailyEarningLimitBannerProps {
  dailyEarningLimitInfo: DailyEarningLimitInfo;
}

export function DailyEarningLimitBanner({ dailyEarningLimitInfo }: DailyEarningLimitBannerProps) {
  const { colors, isDark } = useTheme();

  const isLimitReached = dailyEarningLimitInfo.isLimitReached;
  const remainingAmount = dailyEarningLimitInfo.remainingAmount;

  // Format numbers as amounts with two decimal places
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  return (
    <LinearGradient
      colors={
        isDark
          ? (isLimitReached ? ['#2d2323', '#4b2323'] : ['#23272f', '#3B27C1'])
          : (isLimitReached ? ['#FEF2F2', '#FEE2E2'] : ['#F0F9FF', '#E0F2FE'])
      }
      style={[styles.container, { borderColor: isDark ? (isLimitReached ? '#b91c1c' : '#6366F1') : (isLimitReached ? '#fecaca' : '#bae6fd') }]}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={isLimitReached ? 'cash-outline' : 'wallet-outline'}
            size={24}
            color={isLimitReached ? colors.error : colors.primary}
          />
        </View>
        <View style={styles.textContainer}>
          <ThemedText style={[styles.title, { color: isLimitReached ? colors.error : colors.primary }]}> 
            {isLimitReached ? 'Daily Earning Limit Reached!' : 'Daily Earning Limit'}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}> 
            {isLimitReached
              ? `You've earned your maximum of ${formatAmount(dailyEarningLimitInfo.limit)} today.`
              : `Earnings: ${formatAmount(dailyEarningLimitInfo.earnedToday)}`}
          </ThemedText>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: isDark ? '#444' : colors.textSecondary + '20' }]}> 
              <View
                style={[styles.progressFill, {
                  width: `${(dailyEarningLimitInfo.earnedToday / dailyEarningLimitInfo.limit) * 100}%`,
                  backgroundColor: isLimitReached ? colors.error : colors.primary
                }]}
              />
            </View>
            <ThemedText style={[styles.progressText, { color: colors.textSecondary }]}> 
              {formatAmount(dailyEarningLimitInfo.earnedToday)} / {formatAmount(dailyEarningLimitInfo.limit)}
            </ThemedText>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 24,
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
    minWidth: 60,
    textAlign: 'right',
  },
}); 