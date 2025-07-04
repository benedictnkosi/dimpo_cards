import { NativeModules } from "react-native";

/**
 * Detects if the app is running in an environment where native modules are not available
 * (like Expo Go) or if the required native modules are missing.
 * 
 * @returns {boolean} True if the app is running in an environment where native modules are not available
 * (like Expo Go) or if the required native modules are missing.
 */
export function shouldUsePreviewAPIMode() {
  let usePreviewAPIMode = isExpoGo();
  if (usePreviewAPIMode) {
    console.log('Expo Go app detected. Using RevenueCat in Preview API Mode.');
  }
  return usePreviewAPIMode;
}
/**
 * Detects if the app is running in Expo Go
 */
function isExpoGo() {
  var _globalThis$expo;
  if (!!NativeModules.RNPaywalls && !!NativeModules.RNCustomerCenter) {
    return false;
  }
  return !!((_globalThis$expo = globalThis.expo) !== null && _globalThis$expo !== void 0 && (_globalThis$expo = _globalThis$expo.modules) !== null && _globalThis$expo !== void 0 && _globalThis$expo.ExpoGo);
}
//# sourceMappingURL=environment.js.map