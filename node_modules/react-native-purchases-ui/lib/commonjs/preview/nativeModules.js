"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.previewNativeModuleRNPaywalls = exports.previewNativeModuleRNCustomerCenter = void 0;
var _purchasesTypescriptInternal = require("@revenuecat/purchases-typescript-internal");
/**
 * Preview implementation of the native module for Preview API mode, i.e. for environments where native modules are not available
 * (like Expo Go).
 */
const previewNativeModuleRNPaywalls = exports.previewNativeModuleRNPaywalls = {
  presentPaywall: () => {
    return _purchasesTypescriptInternal.PAYWALL_RESULT.NOT_PRESENTED;
  },
  presentPaywallIfNeeded: () => {
    return _purchasesTypescriptInternal.PAYWALL_RESULT.NOT_PRESENTED;
  }
};
const previewNativeModuleRNCustomerCenter = exports.previewNativeModuleRNCustomerCenter = {
  presentCustomerCenter: () => {
    return null;
  }
};
//# sourceMappingURL=nativeModules.js.map