import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, ImageSourcePropType, StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from './ThemedText';
import { getCurrentProfile } from '@/services/database';

const avatarImages: Record<string, ImageSourcePropType> = {
  '1': require('../assets/images/avatars/1.png'),
  '2': require('../assets/images/avatars/2.png'),
  '3': require('../assets/images/avatars/3.png'),
  '4': require('../assets/images/avatars/4.png'),
  '5': require('../assets/images/avatars/5.png'),
  '6': require('../assets/images/avatars/6.png'),
  '7': require('../assets/images/avatars/7.png'),
  '8': require('../assets/images/avatars/8.png'),
  '9': require('../assets/images/avatars/9.png'),
  'default': require('../assets/images/avatars/8.png'),
};

interface CurrentProfile {
  id: number;
  uid: string;
  name: string;
  reading_level: string;
  avatar: string;
  created: string;
  updated: string;
}

interface HeaderProps {
  selectedProfile?: CurrentProfile | null;
}

function getInitial(name?: string) {
  if (!name) return '';
  return name.trim().charAt(0).toUpperCase();
}

export function Header({ selectedProfile }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentProfile = useCallback(async () => {
    try {
      const profile = await getCurrentProfile();
      setCurrentProfile(profile);
    } catch (error) {
      // Error fetching current profile
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentProfile();
  }, [fetchCurrentProfile]);

  // Update current profile when selectedProfile prop changes
  useEffect(() => {
    if (selectedProfile) {
      setCurrentProfile(selectedProfile);
      setIsLoading(false);
    }
  }, [selectedProfile]);

  // Refresh profile when screen comes into focus (e.g., after profile changes)
  useFocusEffect(
    useCallback(() => {
      fetchCurrentProfile();
    }, [fetchCurrentProfile])
  );

  const avatarSource = currentProfile?.avatar && avatarImages[currentProfile.avatar]
    ? avatarImages[currentProfile.avatar]
    : avatarImages['default'];

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: isDark ? '#1F2937' : '#F8FAFC' }]}>
      <View style={styles.row}>
        <View style={styles.greetingSection}>
          <ThemedText style={[styles.greetingText, { color: isDark ? '#F3F4F6' : '#22223B' }]}>
            Dimpo Reads <ThemedText style={styles.wave}>💰</ThemedText>
          </ThemedText>
          <ThemedText style={[styles.schoolText, { color: isDark ? '#9CA3AF' : '#64748B' }]}>
          Read a story. Earn some cash.
          </ThemedText>
        </View>
        <TouchableOpacity onPress={() => router.push('/profile')}>
          <View style={[styles.avatarCircle, { backgroundColor: isDark ? '#7C3AED' : '#8B5CF6' }]}>
            {currentProfile?.avatar ? (
              <Image
                source={avatarSource}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <ThemedText style={styles.avatarInitial}>
                {getInitial(currentProfile?.name) || 'U'}
              </ThemedText>
            )}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  greetingSection: {
    flex: 1,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '700',
  },
  wave: {
    fontSize: 22,
  },
  schoolText: {
    fontSize: 15,
    marginTop: 2,
    fontWeight: '500',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
  },
}); 