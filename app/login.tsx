import { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, TextInput, View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import Constants from 'expo-constants';
import { useTheme } from '@/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Login() {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingFirstLogin, setIsCheckingFirstLogin] = useState(true);
  const { signIn } = useAuth();
  const { isDark, colors } = useTheme();

  // Check if this is the user's first login
  useEffect(() => {
    const checkFirstLogin = async () => {
      try {
        const hasLoggedInBefore = await AsyncStorage.getItem('hasLoggedInBefore');
        if (hasLoggedInBefore === null) {
          // First time user, set flag and redirect to onboarding
          await AsyncStorage.setItem('hasLoggedInBefore', 'true');
          router.replace('/onboarding');
        }
      } catch (error) {
        console.error('Error checking first login status:', error);
      } finally {
        setIsCheckingFirstLogin(false);
      }
    };

    checkFirstLogin();
  }, []);

  const validateInput = (input: string): { isValid: boolean; email: string } => {
    // Check if input is a valid email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(input)) {
      return { isValid: true, email: input };
    }

    // Check if input is a valid phone number (10 digits)
    const phoneRegex = /^\d{10}$/;
    if (phoneRegex.test(input)) {
      return { isValid: true, email: `${input}@examquiz.co.za` };
    }

    return { isValid: false, email: '' };
  };

  const handleLogin = async () => {
    if (!emailOrPhone || !password) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please fill in all fields',
        position: 'bottom'
      });
      return;
    }

    const { isValid, email } = validateInput(emailOrPhone);
    if (!isValid) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please enter a valid email or 10-digit phone number',
        position: 'bottom'
      });
      return;
    }

    setIsLoading(true);
    try {
      await signIn(email, password);
      
      // Mark that user has logged in before
      await AsyncStorage.setItem('hasLoggedInBefore', 'true');
    } catch (error: any) {
      console.error('Login error:', error.code, error.message);

      const messages: { [key: string]: string } = {
        'auth/invalid-email': 'Invalid email address',
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect email or password',
        'auth/invalid-credential': 'Incorrect email or password',
        'auth/too-many-requests': 'Too many attempts. Please try again later'
      };

      Toast.show({
        type: 'error',
        text1: 'Login Failed',
        text2: messages[error.code] || 'Invalid email or password',
        position: 'bottom'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while checking first login
  if (isCheckingFirstLogin) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={isDark ? ['#1B1464', '#2B2F77'] : ['#F8FAFC', '#E2E8F0']}
          style={styles.gradient}
        >
          <View style={styles.loadingContainer}>
            <ThemedText style={[styles.title, { color: isDark ? '#FFFFFF' : '#1B1464' }]}>🏳️‍🌈 Dimpo Reads</ThemedText>
            <ThemedText style={[styles.subtitle, { color: isDark ? '#E2E8F0' : '#475569' }]}>
              Loading...
            </ThemedText>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={isDark ? ['#1B1464', '#2B2F77'] : ['#F8FAFC', '#E2E8F0']}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.content}>
              <View style={styles.header}>
                <ThemedText style={[styles.title, { color: isDark ? '#FFFFFF' : '#1B1464' }]}>🏳️‍🌈 Dimpo Reads</ThemedText>
                <ThemedText style={[styles.subtitle, { color: isDark ? '#E2E8F0' : '#475569' }]}> 
                The more you read, the more you earn.
                </ThemedText>
              </View>

              <View style={styles.form}>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', color: isDark ? '#FFFFFF' : '#1B1464', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#E5E7EB' }]}
                  placeholder="Email or Phone Number"
                  placeholderTextColor={isDark ? '#94A3B8' : '#94A3B8'}
                  value={emailOrPhone}
                  onChangeText={setEmailOrPhone}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  testID="email-input"
                  maxLength={50}
                />
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={[styles.input, styles.passwordInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', color: isDark ? '#FFFFFF' : '#1B1464', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#E5E7EB' }]}
                    placeholder="Password"
                    placeholderTextColor={isDark ? '#94A3B8' : '#94A3B8'}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    testID="password-input"
                    maxLength={50}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}
                    testID="toggle-password-visibility"
                  >
                    <Ionicons
                      name={showPassword ? "eye-off" : "eye"}
                      size={24}
                      color={isDark ? '#94A3B8' : '#94A3B8'}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: isDark ? '#FFFFFF' : '#1B1464' }, isLoading && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={isLoading}
                  testID="login-button"
                >
                  <ThemedText style={[styles.buttonText, { color: isDark ? '#1B1464' : '#FFFFFF' }] }>
                    {isLoading ? 'Signing in...' : 'Start Learning →'}
                  </ThemedText>
                </TouchableOpacity>

                <View style={styles.registerContainer}>
                  <ThemedText style={[styles.helperText, { color: isDark ? '#E2E8F0' : '#475569' }] }>
                    New to Dimpo Reads? Join our community of readers! 🌍
                  </ThemedText>
                  <TouchableOpacity
                    style={[styles.createAccountButton, { backgroundColor: isDark ? '#4F46E5' : '#3B82F6' }]}
                    onPress={() => router.push('/onboarding')}
                    testID="create-account-button"
                  >
                    <ThemedText style={[styles.createAccountButtonText, { color: '#FFFFFF' }]}>Create an account</ThemedText>
                  </TouchableOpacity>
                </View>

                <View style={styles.forgotPasswordContainer}>
                  <ThemedText style={[styles.helperText, { color: isDark ? '#E2E8F0' : '#475569' }] }>
                    Forgot your password? We'll help you get back to reading! 🔑
                  </ThemedText>
                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => router.push('/forgot-password')}
                    testID="forgot-password-button"
                  >
                    <ThemedText style={[styles.linkText, { color: isDark ? '#4F46E5' : '#1B1464' }]}>Reset it here</ThemedText>
                  </TouchableOpacity>
                </View>

                <View style={[styles.deleteAccountContainer, { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }] }>
                  <TouchableOpacity
                    style={styles.deleteAccountButton}
                    onPress={() => router.push('https://examquiz.co.za/info/delete-account')}
                    testID="delete-account-button"
                  >
                    <ThemedText style={styles.deleteAccountText}>Delete Account</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
    width: '100%',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    width: '100%',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 28,
    paddingHorizontal: 8,
  },
  form: {
    gap: 16,
  },
  input: {
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  button: {
    padding: 16,
    borderRadius: 28,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  registerContainer: {
    marginTop: 32,
    alignItems: 'center',
    width: '100%',
  },
  createAccountButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
  },
  createAccountButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  forgotPasswordContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  helperText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  linkButton: {
    padding: 8,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  passwordContainer: {
    position: 'relative',
    width: '100%',
    marginBottom: 12,
  },
  passwordInput: {
    paddingRight: 50,
    marginBottom: 0,
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
  },
  deleteAccountContainer: {
    marginTop: 24,
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 24,
  },
  deleteAccountButton: {
    padding: 8,
  },
  deleteAccountText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
}); 