import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing, Image } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Header } from '@/components/Header';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUsername } from '@/hooks/useUsername';
import { getPlayer } from '@/services/playersService';

export default function IndexScreen() {
  const { colors, isDark } = useTheme();
  const { signOut, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { username, isLoading: isUsernameLoading } = useUsername();
  const [cardAnim] = useState(new Animated.Value(0));
  const [welcomeAnim] = useState(new Animated.Value(0));
  const [playerName, setPlayerName] = useState<string>('');
  const [isPlayerLoading, setIsPlayerLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchPlayerName = async () => {
      if (user?.uid) {
        setIsPlayerLoading(true);
        try {
          const player = await getPlayer(user.uid);
          // Use local username first, then fallback to Firestore data
          setPlayerName(username || player?.userName || player?.displayName || 'Player');
        } catch (e) {
          setPlayerName(username || 'Player');
        } finally {
          setIsPlayerLoading(false);
        }
      }
    };
    fetchPlayerName();
  }, [user?.uid, username]);

  useEffect(() => {
    Animated.timing(cardAnim, {
      toValue: 1,
      duration: 800,
      delay: 300,
      useNativeDriver: true,
      easing: Easing.out(Easing.exp),
    }).start();
    Animated.timing(welcomeAnim, {
      toValue: 1,
      duration: 700,
      delay: 100,
      useNativeDriver: true,
      easing: Easing.out(Easing.exp),
    }).start();
  }, []);

  const handleCrazy8Press = () => {
    router.push('/crazy8');
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
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
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}> 
      {/* Gradient Header */}
      <LinearGradient
        colors={isDark ? ['#232526', '#414345'] : ['#667eea', '#764ba2']}
        style={[styles.headerGradient, { paddingTop: insets.top + 24 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <View>
            <ThemedText style={styles.appName}>Dimpo Plays Cards <ThemedText style={{ fontSize: 20 }}>🤡</ThemedText></ThemedText>
            <ThemedText style={styles.tagline}>Play classic South African card games</ThemedText>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.logoutText}>Logout</ThemedText>
            </TouchableOpacity>
            <View style={styles.avatarCircle}>
              <Image
                source={require('@/assets/images/avatars/1.png')}
                style={{ width: 44, height: 44, borderRadius: 22 }}
                resizeMode="cover"
              />
              <ThemedText style={{ fontSize: 13, marginTop: 4, textAlign: 'center', color: '#232526' }}>
                {isPlayerLoading ? '...' : playerName}
              </ThemedText>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        

        {/* Animated Game Card */}
        <Animated.View
          style={{
            opacity: cardAnim,
            transform: [
              { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
              { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
            ],
          }}
        >
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.button}
              onPress={handleCrazy8Press}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={isDark ? ['#4A5568', '#2D3748'] : ['#667eea', '#764ba2']}
                style={styles.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.buttonContent}>
                  <ThemedText style={styles.buttonEmoji}>🤡 </ThemedText>
                  <ThemedText style={styles.buttonTitle}>Crazy 8</ThemedText>
                  <ThemedText style={styles.buttonSubtitle}>Classic card game</ThemedText>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.button}
              onPress={handleCrazy8Press}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={isDark ? ['#4A5568', '#2D3748'] : ['#667eea', '#764ba2']}
                style={styles.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.buttonContent}>
                  <ThemedText style={styles.buttonEmoji}>♥️</ThemedText>
                  <ThemedText style={styles.buttonTitle}>Top 10</ThemedText>
                  <ThemedText style={styles.buttonSubtitle}>Classic card game</ThemedText>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.button}
              onPress={handleCrazy8Press}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={isDark ? ['#4A5568', '#2D3748'] : ['#667eea', '#764ba2']}
                style={styles.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.buttonContent}>
                  <ThemedText style={styles.buttonEmoji}>♠️</ThemedText>
                  <ThemedText style={styles.buttonTitle}>Casino</ThemedText>
                  <ThemedText style={styles.buttonSubtitle}>Classic card game</ThemedText>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>

      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    width: '100%',
    paddingBottom: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  tagline: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.85,
    marginBottom: 2,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
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
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#232526',
    letterSpacing: 0.5,
  },
  wave: {
    fontSize: 32,
  },
  subtitle: {
    fontSize: 18,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 8,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  button: {
    width: '100%',
    maxWidth: 320,
    height: 140,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.18,
    shadowRadius: 12,
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
    fontSize: 54,
    marginBottom: 8,
    paddingTop: 42,
  },
  buttonTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  buttonSubtitle: {
    fontSize: 15,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  reanimatedButton: {
    backgroundColor: '#19C37D',
    padding: 16,
    borderRadius: 24,
    marginVertical: 16,
    alignItems: 'center',
    alignSelf: 'center',
    minWidth: 220,
    shadowColor: '#19C37D',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  reanimatedButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
    opacity: 0.7,
  },
  footerText: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#232526',
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#232526',
  },
});
