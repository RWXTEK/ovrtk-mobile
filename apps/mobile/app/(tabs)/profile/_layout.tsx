// apps/mobile/app/profile/_layout.tsx
import { Stack } from "expo-router";

const C = { bg: "#0C0D11", text: "#E7EAF0" };

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        contentStyle: { backgroundColor: C.bg },
        animation: "slide_from_right",
        presentation: "card",
      }}
    >
      {/* profile/index is the default */}
      <Stack.Screen name="index" options={{ title: "Profile" }} />
      {/* Add more later: e.g. <Stack.Screen name="edit" options={{ title: "Edit profile" }} /> */}
    </Stack>
  );
}
