import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '../components/ThemedText';
import RegisterForm from './components/RegisterForm';
import { useTheme } from '../contexts/ThemeContext';

export default function RegisterScreen() {
    const params = useLocalSearchParams();
    const { isDark } = useTheme();

    return (
        <SafeAreaView style={styles.container} testID="register-screen">
            <LinearGradient
                colors={isDark ? ['#1B1464', '#2B2F77'] : ['#F8FAFC', '#E2E8F0']}
                style={styles.gradient}
                testID="register-gradient-background"
            >
                <View style={styles.content} testID="register-content">
                    <View style={styles.header} testID="register-header">
                        <ThemedText style={[styles.title, { color: isDark ? '#FFFFFF' : '#1B1464' }]} testID="register-title">Create Account</ThemedText>
                        <ThemedText style={[styles.subtitle, { color: isDark ? '#E2E8F0' : '#475569' }]} testID="register-subtitle">Join thousands of readers earning money! 🎯</ThemedText>
                    </View>

                    <RegisterForm onboardingData={params as any} />
                </View>
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
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: 40,
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
}); 