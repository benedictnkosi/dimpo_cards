import { useAuth } from '@/contexts/AuthContext';
import { analytics } from '@/services/analytics';
import React from 'react';
import Purchases from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

interface PaywallProps {
    onSuccess?: () => void;
    onClose?: () => void;
    offerings?: any;
}

export function Paywall({ onSuccess, onClose, offerings }: PaywallProps) {
    const { user } = useAuth();

    const showPaywall = async () => {
        if (!user?.uid) return;

        try {

            // Set the current user's UID as the RevenueCat identifier
            await Purchases.logIn(user.uid);

            // If no offerings provided, fetch them
            const currentOfferings = offerings || (await Purchases.getOfferings()).current;
            if (!currentOfferings) {
                throw new Error('No offerings available');
            }

            // Ensure presentPaywall is called on the main thread
            let result;
            result = await new Promise((resolve, reject) => {
                requestAnimationFrame(async () => {
                    try {
                        const res = await RevenueCatUI.presentPaywall({
                            offering: currentOfferings,
                            displayCloseButton: true,
                        });
                        resolve(res);
                    } catch (err) {
                        reject(err);
                    }
                });
            });

            // Check if purchase was successful
            if (result === PAYWALL_RESULT.PURCHASED) {
                // Track successful purchase
                await analytics.track('reading_purchase_successful', {
                    userId: user.uid,
                    timestamp: new Date().toISOString()
                });

                // Wait a brief moment to show the success state
                await new Promise(resolve => setTimeout(resolve, 1000));
                onSuccess?.();
            } else {
                onClose?.();
            }
        } catch (error) {
            // Track paywall error
            await analytics.track('reading_paywall_error', {
                userId: user.uid,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
            console.error('Failed to show paywall:', error);
            onClose?.();
        }
    };

    // Show paywall immediately when component mounts
    React.useEffect(() => {
        showPaywall();
    }, []);

    return null;
} 