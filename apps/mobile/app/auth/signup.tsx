import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from "firebase/auth";
import { auth } from "../../lib/firebase";

const C = {
  bg: "#0C0D11",
  panel: "#121318",
  line: "#1E2127",
  text: "#E7EAF0",
  muted: "#A6ADBB",
  accent: "#E11D48",
};

const USERNAME_RULE = /^[a-zA-Z0-9_]{3,20}$/;

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSignUp = async () => {
    if (loading) return;
    setErr(null);

    if (!username.trim() || !USERNAME_RULE.test(username.trim())) {
      setErr("Pick a handle 3–20 chars long (letters, numbers, underscores).");
      return;
    }
    if (!email.trim()) {
      setErr("Toss me a valid email so I can ping you.");
      return;
    }
    if (pass.length < 6) {
      setErr("Make that password at least 6 characters—safety first.");
      return;
    }

    try {
      setLoading(true);
      const res = await createUserWithEmailAndPassword(auth, email.trim(), pass);

      // Show up as “Name (@handle)” or just “@handle”
      const displayName = name.trim() ? `${name.trim()} (@${username.trim()})` : `@${username.trim()}`;
      await updateProfile(res.user, { displayName });

      try { await sendEmailVerification(res.user); } catch {}

      router.replace("/garage");
    } catch (e: any) {
      // Friendlier + keep the real message for debugging if needed
      const msg = String(e?.message || "");
      if (msg.includes("email-already-in-use")) {
        setErr("That email’s already wrenching with us. Try signing in.");
      } else if (msg.includes("invalid-email")) {
        setErr("That email doesn’t look right. Give it another shot.");
      } else if (msg.includes("weak-password")) {
        setErr("Password’s a bit light—go 6+ characters.");
      } else {
        setErr("I biffed it. Try again in a sec.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
        <Text style={s.backTxt}>← Back to Garage</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <Text style={s.title}>Join OVRTK</Text>
        <Text style={s.sub}>
          Grab your handle and roll out. Scotty will keep the lights on.
        </Text>

        <View style={s.group}>
          <Text style={s.label}>Display name (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="Maya, Beez, TurboTom…"
            placeholderTextColor={C.muted}
            value={name}
            onChangeText={setName}
            returnKeyType="next"
          />
        </View>

        <View style={s.group}>
          <Text style={s.label}>Username</Text>
          <TextInput
            style={s.input}
            placeholder="@your_handle"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={(t) => setUsername(t.replace(/\s/g, ""))}
            returnKeyType="next"
          />
          <Text style={s.hint}>Letters, numbers, underscores • 3–20 characters</Text>
        </View>

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
          <TextInput
            style={s.input}
            placeholder="Make it a strong one"
            placeholderTextColor={C.muted}
            secureTextEntry
            value={pass}
            onChangeText={setPass}
            returnKeyType="go"
            onSubmitEditing={onSignUp}
          />
          <Text style={s.hint}>Minimum 6 characters</Text>
        </View>

        {err ? <Text style={s.err}>{err}</Text> : null}

        <TouchableOpacity onPress={onSignUp} style={[s.primary, loading && { opacity: 0.7 }]} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>Create my account</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace("/auth/login")} style={s.linkBtn}>
          <Text style={s.link}>Already rolling? Sign in</Text>
        </TouchableOpacity>
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
  hint: { color: C.muted, fontSize: 11, marginTop: 4 },
  err: { color: "#ff6b6b", fontWeight: "700" },
  primary: { backgroundColor: C.accent, borderRadius: 12, alignItems: "center", paddingVertical: 14, marginTop: 6 },
  primaryTxt: { color: "#fff", fontWeight: "900" },
  linkBtn: { alignItems: "center", marginTop: 8 },
  link: { color: C.text, fontWeight: "700" },
});
