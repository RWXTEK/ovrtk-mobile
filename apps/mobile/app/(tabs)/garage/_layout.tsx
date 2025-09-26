import { Stack } from "expo-router";

const C = {
  bg: "#0C0D11",
  text: "#E7EAF0",
};

export default function GarageLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "My Garage" }} />
      <Stack.Screen name="car/[id]" options={{ title: "Car Detail" }} />
      <Stack.Screen name="car/edit" options={{ title: "Edit Car" }} />
    </Stack>
  );
}
