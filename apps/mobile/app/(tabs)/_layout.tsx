// apps/mobile/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const C = {
  bg: "#0C0D11",
  text: "#E7EAF0",
  line: "#1E2127",
  accent: "#E11D48",
  glass: "rgba(18,19,24,0.92)",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.text,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "800",
          marginTop: -2,
        },
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: -5,          // a lil more breathing room from the edge
          height: 78,          // slightly taller, more tappable
          paddingHorizontal: 12,
          borderRadius: 1,    // fixed pill look
          backgroundColor: C.bg,
          borderTopWidth: 0,
          borderWidth: -12,
          borderColor: C.line,
          shadowColor: "#000",
          shadowOpacity: 0.25, // soften glow
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        },
        tabBarItemStyle: {
          borderRadius: 14,
          paddingVertical: 4,
        },
      }}
    >
      {/* Garage Tab */}
      <Tabs.Screen
        name="garage"
        options={{
          title: "Garage",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "car-sport" : "car-sport-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* Community Tab */}
      <Tabs.Screen
        name="community"
        options={{
          title: "Community",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* Scotty Tab */}
      <Tabs.Screen
        name="scotty"
        options={{
          title: "Scotty",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* Profile Tab */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person-circle" : "person-circle-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* 🚫 Hide everything else so it doesn't show up as tabs */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="car" options={{ href: null }} />
    </Tabs>
  );
}