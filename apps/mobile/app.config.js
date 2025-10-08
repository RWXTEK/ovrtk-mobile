export default {
  expo: {
    name: "OVRTK",
    slug: "ovrtk",
    scheme: "ovrtk",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/OVRTKICONIC.png",
    jsEngine: "hermes",
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.rwxtek.ovrtk",
      usesAppleSignIn: true,
      associatedDomains: ["applinks:ovrtk.com"],
      infoPlist: {
        NSPhotoLibraryUsageDescription: "OVRTK needs access to your photos so you can upload images to Scotty.",
        NSPhotoLibraryAddUsageDescription: "OVRTK saves generated or edited images to your library when you choose to.",
        NSCameraUsageDescription: "OVRTK uses the camera so you can snap pics for Scotty to analyze.",
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      package: "com.rwxtek.ovrtk",
      versionCode: 2,
      screenOrientation: "portrait",
      adaptiveIcon: {
        foregroundImage: "./assets/images/OVRTKICONIC.png",
        backgroundColor: "#0C0D11"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        "READ_MEDIA_IMAGES",
        "READ_MEDIA_VISUAL_USER_SELECTED",
        "CAMERA"
      ],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "ovrtk.com",
              pathPrefix: "/u"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/OVRTKICONIC.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/SPLASH.png",
          imageWidth: 256,
          resizeMode: "contain",
          backgroundColor: "#0C0D11",
          dark: { backgroundColor: "#0C0D11" }
        }
      ],
      "expo-web-browser",
      "expo-apple-authentication"
    ],
    experiments: { typedRoutes: true },
    extra: {
      router: {},
      eas: { projectId: "b51c33c1-2276-4d1a-916f-aafe0c888374" },
      EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
      EXPO_PUBLIC_RC_IOS_KEY: process.env.EXPO_PUBLIC_RC_IOS_KEY || "appl_kbIDSqefYIxgekZLUxtdjMMJiEx",
      EXPO_PUBLIC_RC_ANDROID_KEY: process.env.EXPO_PUBLIC_RC_ANDROID_KEY || "",
      EXPO_PUBLIC_RC_ENTITLEMENT_ID: process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID || "pro_uploads",
    },
    owner: "rwxtek"
  }
};