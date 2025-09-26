import React, { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";

/** Wrap content that has inputs so the keyboard never covers them */
export function SafeKeyboard({ children }: PropsWithChildren) {
  const headerHeight = useHeaderHeight(); // expo-router header height
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
