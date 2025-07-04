import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Header } from '@/components/Header';
import { useTheme } from '@/contexts/ThemeContext';
import { UsernameModal } from '@/app/components/UsernameModal';
import { useUsername } from '@/hooks/useUsername';

export default function IndexScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { username, isLoading: isUsernameLoading, saveUsername } = useUsername();
  const [showUsernameModal, setShowUsernameModal] = useState(false);

  useEffect(() => {
    if (!isUsernameLoading && !username) {
      setShowUsernameModal(true);
    }
  }, [isUsernameLoading, username]);

  const handleSaveUsername = async (newUsername: string) => {
    const success = await saveUsername(newUsername);
    if (success) {
      setShowUsernameModal(false);
    }
  };

  const handleCrazy8Press = () => {
    router.push('/crazy8');
  };

  if (isUsernameLoading) {
    return (
      <ThemedView style={styles.container}>
        <Header />
        <View style={styles.loadingContainer}>
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Header />
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ThemedText style={styles.title}>
            {username ? `Welcome back, ${username}! 👋` : 'Welcome to Dimpo Cards'}
          </ThemedText>
          <ThemedText style={styles.subtitle}>Choose your game</ThemedText>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.button}
            onPress={handleCrazy8Press}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={isDark ? ['#4A5568', '#2D3748'] : ['#667eea', '#764ba2']}
              style={styles.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.buttonContent}>
                <ThemedText style={styles.buttonEmoji}>🎴</ThemedText>
                <ThemedText style={styles.buttonTitle}>Crazy 8</ThemedText>
                <ThemedText style={styles.buttonSubtitle}>Classic card game</ThemedText>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={{ backgroundColor: '#19C37D', padding: 16, borderRadius: 12, marginVertical: 16, alignItems: 'center' }}
          onPress={() => router.push('/TestReanimatedPage')}
        >
          <ThemedText style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>Test Reanimated Page</ThemedText>
        </TouchableOpacity>
      </ScrollView>

      <UsernameModal 
        visible={showUsernameModal}
        onSave={handleSaveUsername}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    opacity: 0.7,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    opacity: 0.7,
    textAlign: 'center',
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    width: '100%',
    maxWidth: 300,
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContent: {
    alignItems: 'center',
  },
  buttonEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  buttonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  buttonSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
});
