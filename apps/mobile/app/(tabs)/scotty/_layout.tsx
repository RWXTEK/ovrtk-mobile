import { Stack } from "expo-router";

const C = {
  bg: "#0C0D11",
  text: "#E7EAF0",
};

export default function ScottyLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
      }}
    >
      <Stack.Screen name="index" options={{ title: "" }} />
    </Stack>
  );
}
