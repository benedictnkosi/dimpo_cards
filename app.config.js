export default {
  name: 'Dimpo Reads',
  slug: 'exam-quiz',
  version: '1',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'dimporeads',
  userInterfaceStyle: 'automatic',
  newArchEnabled: false,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.dimporeads',
    buildNumber: '1.0.2',
    googleServicesFile: './GoogleService-Info.plist',
    infoPlist: {
      "ITSAppUsesNonExemptEncryption": false,
      "UIBackgroundModes": ["remote-notification"]
    },
    "associatedDomains": ["applinks:examquiz.co.za"],
    "storeKitConfiguration": "./ios/DimpoReads/Configuration.storekit"
  },
  android: {
    package: 'com.dimporeads',
    "intentFilters": [
      {
        "action": "VIEW",
        "autoVerify": true,
        "data": [
          {
            "scheme": "https",
            "host": "examquiz.co.za",
            "pathPrefix": "/"
          }
        ],
        "category": ["BROWSABLE", "DEFAULT"]
      }
    ],
    versionCode: 2,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    permissions: ["NOTIFICATIONS"]
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png'
  },
  plugins: [
    'expo-router',
    '@react-native-google-signin/google-signin',
    'expo-sqlite',
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          buildToolsVersion: "34.0.0",
          enableWebP: true
        },
        ios: {
          deploymentTarget: "15.1"
        }
      }
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff'
      }
    ],
    [
      'expo-notifications',
      {
        color: '#ffffff'
      }
    ],
    "expo-asset"
  ],
  experiments: {
    typedRoutes: true
  },
  extra: {
    router: {
      origin: false
    },
    eas: {
      projectId: 'b4f9ab87-947e-4014-8990-0c11fa29cb2c'
    },
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || "AIzaSyCaJHGdAh4f7BRJxNDRNkJ_vrrG74Ur_jA"
  },
  owner: 'nkosib',
  runtimeVersion: '1.0.0',
  updates: {
    url: 'https://u.expo.dev/b4f9ab87-947e-4014-8990-0c11fa29cb2c'
  }
}; 
