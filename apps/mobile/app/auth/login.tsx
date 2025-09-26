import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase";

const C = {
  bg: "#0C0D11",
  panel: "#121318",
  line: "#1E2127",
  text: "#E7EAF0",
  muted: "#A6ADBB",
  accent: "#E11D48",
};

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const friendlyError = (codeOrMsg: string) => {
    if (codeOrMsg.includes("user-not-found")) return "No account on file for that email.";
    if (codeOrMsg.includes("wrong-password")) return "That password doesn’t match. Give it another go.";
    if (codeOrMsg.includes("invalid-email")) return "That email doesn’t look right.";
    if (codeOrMsg.includes("too-many-requests")) return "Too many tries. Cooldown for a minute and retry.";
    return "I biffed it. Try again in a sec.";
  };

  const onLogin = async () => {
    if (loading) return;
    setErr(null);
    setInfo(null);

    if (!email.trim()) {
      setErr("Toss me a valid email so I can let you in.");
      return;
    }
    if (!pass) {
      setErr("Password, please.");
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      router.replace("/garage");
    } catch (e: any) {
      const msg = String(e?.code || e?.message || "");
      setErr(friendlyError(msg));
    } finally {
      setLoading(false);
    }
  };

  const onReset = async () => {
    setErr(null);
    setInfo(null);

    const addr = email.trim();
    if (!addr) {
      setErr("Type your email above and I’ll send the reset link.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, addr);
      setInfo("Reset link sent. Check your inbox (and spam)!");
    } catch (e: any) {
      const msg = String(e?.code || e?.message || "");
      setErr(friendlyError(msg));
    }
  };

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
        <Text style={s.backTxt}>← Back to Garage</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <Text style={s.title}>Welcome back</Text>
        <Text style={s.sub}>
          Scotty kept the lights on. Log in and let’s wrench.
        </Text>

        <View style={s.group}>
          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            placeholder="you@garage.com"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
          />
        </View>

        <View style={s.group}>
          <Text style={s.label}>Password</Text>
          <View style={s.passRow}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="••••••••"
              placeholderTextColor={C.muted}
              secureTextEntry={!showPass}
              value={pass}
              onChangeText={setPass}
              returnKeyType="go"
              onSubmitEditing={onLogin}
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)} style={s.showBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.showTxt}>{showPass ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {err ? <Text style={s.err}>{err}</Text> : null}
        {info ? <Text style={s.ok}>{info}</Text> : null}

        <TouchableOpacity onPress={onLogin} style={[s.primary, loading && { opacity: 0.7 }]} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>Sign me in</Text>}
        </TouchableOpacity>

        <View style={s.rowBetween}>
          <TouchableOpacity onPress={() => router.replace("/auth/signup")}>
            <Text style={s.link}>New here? Create account</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onReset}>
            <Text style={s.link}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, padding: 18, justifyContent: "center" },
  backBtn: { marginBottom: 12 },
  backTxt: { color: C.accent, fontWeight: "700", fontSize: 16 },
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 18, gap: 12 },
  title: { color: C.text, fontSize: 22, fontWeight: "900" },
  sub: { color: C.muted },
  group: { gap: 6 },
  label: { color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  input: {
    color: C.text,
    backgroundColor: "#11131A",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  passRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  showBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#0f1218",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
  },
  showTxt: { color: C.text, fontWeight: "700" },
  err: { color: "#ff6b6b", fontWeight: "700" },
  ok: { color: "#6ee7b7", fontWeight: "700" },
  primary: { backgroundColor: C.accent, borderRadius: 12, alignItems: "center", paddingVertical: 14, marginTop: 6 },
  primaryTxt: { color: "#fff", fontWeight: "900" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  link: { color: C.text, fontWeight: "700" },
});
