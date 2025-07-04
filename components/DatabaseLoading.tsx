import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useTheme } from '@/contexts/ThemeContext';

interface DatabaseLoadingProps {
  message?: string;
}

export const DatabaseLoading: React.FC<DatabaseLoadingProps> = ({ 
  message = 'Initializing database...' 
}) => {
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: colors.text,
      textAlign: 'center',
      opacity: 0.7,
    },
  });

  return (
    <ThemedView style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <ThemedText style={styles.loadingText}>{message}</ThemedText>
    </ThemedView>
  );
}; 