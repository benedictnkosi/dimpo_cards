import React, { useState } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '@/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface UsernameModalProps {
  visible: boolean;
  onSave: (username: string) => void;
}

export function UsernameModal({ visible, onSave }: UsernameModalProps) {
  const { colors, isDark } = useTheme();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError('Please enter your name');
      return;
    }
    if (trimmedUsername.length < 2) {
      setError('Name must be at least 2 characters long');
      return;
    }
    if (trimmedUsername.length > 20) {
      setError('Name must be less than 20 characters');
      return;
    }
    
    setError('');
    onSave(trimmedUsername);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}} // Prevent closing by back button
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: isDark ? colors.card : '#FFFFFF' }]}>
          <LinearGradient
            colors={isDark ? ['#4A5568', '#2D3748'] : ['#667eea', '#764ba2']}
            style={styles.gradientBackground}
          />
          
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="person-circle" size={48} color="#FFFFFF" />
            </View>
            <ThemedText style={styles.title}>
              Welcome to Dimpo Cards! 👋
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              What should we call you?
            </ThemedText>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#374151' : '#F3F4F6',
                  color: colors.text,
                  borderColor: error ? '#DC2626' : '#E5E7EB',
                }
              ]}
              placeholder="Enter your name"
              placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (error) setError('');
              }}
              maxLength={20}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
            />
            {error ? (
              <ThemedText style={styles.errorText}>
                {error}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                { backgroundColor: colors.primary }
              ]}
              onPress={handleSave}
            >
              <ThemedText style={styles.saveButtonText}>
                Get Started
              </ThemedText>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    alignItems: 'center',
    padding: 32,
    paddingBottom: 24,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
  },
  inputContainer: {
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    textAlign: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  buttonContainer: {
    paddingHorizontal: 32,
    paddingBottom: 32,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    gap: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
}); 