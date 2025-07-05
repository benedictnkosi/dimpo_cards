import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getPlayer } from '@/services/playersService';
import { deleteGamesWherePlayer1 } from '@/services/gamesService';

export default function IndexScreen() {
  const { colors, isDark } = useTheme();
  const { signOut, user } = useAuth();
  const insets = useSafeAreaInsets();
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
          console.log('Firebase player data:', player);
          console.log('Player username from Firebase:', player?.userName);
          console.log('Player displayName from Firebase:', player?.displayName);
          // Use Firestore data for player name
          setPlayerName(player?.userName || player?.displayName || 'Player');
        } catch (e) {
          console.error('Error fetching player from Firebase:', e);
          setPlayerName('Player');
        } finally {
          setIsPlayerLoading(false);
        }
      }
    };
    fetchPlayerName();
  }, [user?.uid]);

  // Delete games where user is player1 when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      const deletePlayer1Games = async () => {
        console.log('🔄 Starting deletePlayer1Games function');
        console.log('👤 Current playerName:', playerName);
        console.log('📊 Player loading state:', { isLoading: isPlayerLoading, playerName });
        
        // Wait for player name to finish loading before proceeding
        if (isPlayerLoading) {
          console.log('⏳ Player name still loading, waiting...');
          return;
        }
        
        if (playerName && playerName !== 'Player') {
          console.log('✅ Player name exists, proceeding with game deletion');
          try {
            console.log('🗑️ Calling deleteGamesWherePlayer1 with playerName:', playerName);
            const result = await deleteGamesWherePlayer1(playerName);
            console.log('✅ Successfully deleted games where user is player1. Result:', result);
          } catch (error) {
            console.error('❌ Error deleting games where user is player1:', error);
            console.error('🔍 Error details:', {
              message: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
              playerName: playerName
            });
          }
        } else {
          console.log('⚠️ No valid player name available, skipping game deletion');
          console.log('💡 This is normal if user hasn\'t set a player name yet');
        }
        
        console.log('🏁 Completed deletePlayer1Games function');
      };
      
      console.log('🎯 Screen focused, triggering deletePlayer1Games');
      deletePlayer1Games();
    }, [playerName, isPlayerLoading])
  );

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
    router.push('/GameLobby?gameType=crazy8');
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (isPlayerLoading) {
    return (
      <ThemedView style={styles.container}>
        
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
          <View style={styles.avatarContainer}>
            <View style={styles.avatarCircle}>
              <Image
                source={require('@/assets/images/avatars/1.png')}
                style={styles.avatarImage}
                resizeMode="cover"
              />
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

        {/* Dev Buttons at Bottom */}
        <View style={styles.bottomLogoutContainer}>
          <TouchableOpacity
            style={styles.bottomLogoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.bottomLogoutText}>Logout</ThemedText>
          </TouchableOpacity>
          

        </View>

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
    alignItems: 'flex-start',
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
  avatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    borderWidth: 2,
    borderColor: '#eee',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarName: {
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
    color: '#232526',
    fontWeight: '600',
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
  bottomLogoutContainer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 20,
  },
  bottomLogoutButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  bottomLogoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#232526',
  },
  devButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 193, 7, 0.9)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    marginTop: 12,
  },
  devButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#232526',
  },
});
