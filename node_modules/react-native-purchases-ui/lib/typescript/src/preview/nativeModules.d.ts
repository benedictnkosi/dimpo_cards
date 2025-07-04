import { PAYWALL_RESULT } from "@revenuecat/purchases-typescript-internal";
/**
 * Preview implementation of the native module for Preview API mode, i.e. for environments where native modules are not available
 * (like Expo Go).
 */
export declare const previewNativeModuleRNPaywalls: {
    presentPaywall: () => PAYWALL_RESULT;
    presentPaywallIfNeeded: () => PAYWALL_RESULT;
};
export declare const previewNativeModuleRNCustomerCenter: {
    presentCustomerCenter: () => null;
};
//# sourceMappingURL=nativeModules.d.ts.map