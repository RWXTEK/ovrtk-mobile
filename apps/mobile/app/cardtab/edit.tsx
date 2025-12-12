// apps/mobile/app/cardtab/edit.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ScrollView, Switch, Image, ActivityIndicator
} from "react-native";
import { Stack, useLocalSearchParams, router, useNavigation } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, db, storage } from "../../lib/firebase";
import { doc, getDoc, addDoc, updateDoc, collection, serverTimestamp } from "firebase/firestore";

const C = {
  bg: "#0C0D11", panel: "#121318", line: "#1E2127", text: "#E7EAF0",
  muted: "#A6ADBB", accent: "#E11D48", dim: "#0f1218", success: "#10b981"
};

export default function EditCar() {
  const { id, vehicleType: paramVehicleType } = useLocalSearchParams<{
    id?: string;
    vehicleType?: string;
  }>();
  const isEdit = useMemo(() => Boolean(id), [id]);

  const navigation = useNavigation();
  const [me, setMe] = useState<User | null>(null);

  // Universal fields
  const [vehicleType, setVehicleType] = useState<"car" | "motorcycle" | "truck" | "offroad" | "marine" | "other">(
    (paramVehicleType as any) || "car"
  );
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<string>("");
  const [nickname, setNickname] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [vin, setVin] = useState("");
  const [color, setColor] = useState("");
  const [mileage, setMileage] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [isModified, setIsModified] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  // Car/Truck specific
  const [trim, setTrim] = useState("");
  const [engine, setEngine] = useState("");
  const [transmission, setTransmission] = useState("");
  const [drivetrain, setDrivetrain] = useState("");

  // Motorcycle/Off-Road specific
  const [bikeType, setBikeType] = useState(""); // Sport, Cruiser, Touring, Dirt
  const [engineSize, setEngineSize] = useState(""); // CC

  // Truck specific
  const [bedLength, setBedLength] = useState("");
  const [towingCapacity, setTowingCapacity] = useState("");
  const [payloadCapacity, setPayloadCapacity] = useState("");

  // Marine specific
  const [length, setLength] = useState(""); // feet
  const [hullType, setHullType] = useState(""); // Fiberglass, Aluminum
  const [marineEngineType, setMarineEngineType] = useState(""); // Outboard, Inboard

  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const modelRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const trimRef = useRef<TextInput>(null);
  const nicknameRef = useRef<TextInput>(null);
  const vinRef = useRef<TextInput>(null);
  const engineRef = useRef<TextInput>(null);
  const transRef = useRef<TextInput>(null);
  const driveRef = useRef<TextInput>(null);
  const colorRef = useRef<TextInput>(null);
  const mileageRef = useRef<TextInput>(null);
  const purchasePriceRef = useRef<TextInput>(null);
  const currentValueRef = useRef<TextInput>(null);

  useEffect(() => onAuthStateChanged(auth, setMe), []);

  useEffect(() => {
    (async () => {
      if (!me || !id) return;
      try {
        const snap = await getDoc(doc(db, "garages", me.uid, "cars", id));
        if (snap.exists()) {
          const d = snap.data() as any;
          setVehicleType(d.vehicleType || "car");
          setMake(d.make ?? "");
          setModel(d.model ?? "");
          setYear(d.year != null ? String(d.year) : "");
          setNickname(d.nickname ?? "");
          setPhotoURL(d.photoURL ?? "");
          setVin(d.vin ?? "");
          setColor(d.color ?? "");
          setMileage(d.mileage != null ? String(d.mileage) : "");
          setPurchasePrice(d.purchasePrice != null ? String(d.purchasePrice) : "");
          setCurrentValue(d.currentValue != null ? String(d.currentValue) : "");
          setIsModified(Boolean(d.isModified));
          setPinned(Boolean(d.pinned));

          // Car/Truck fields
          setTrim(d.trim ?? "");
          setEngine(d.engine ?? "");
          setTransmission(d.transmission ?? "");
          setDrivetrain(d.drivetrain ?? "");

          // Motorcycle fields
          setBikeType(d.bikeType ?? "");
          setEngineSize(d.engineSize ?? "");

          // Truck fields
          setBedLength(d.bedLength ?? "");
          setTowingCapacity(d.towingCapacity ?? "");
          setPayloadCapacity(d.payloadCapacity ?? "");

          // Marine fields
          setLength(d.length ?? "");
          setHullType(d.hullType ?? "");
          setMarineEngineType(d.marineEngineType ?? "");
        }
      } catch (e) {
        console.warn("load car failed:", e);
      }
    })();
  }, [me, id]);

  const animatedBack = () => {
    if ((navigation as any)?.canGoBack?.()) {
      (navigation as any).goBack();
    } else {
      router.push("/(tabs)/garage");
    }
  };

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission Required", "Please allow access to your photos");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      setUploadingPhoto(true);

      try {
        const uri = result.assets[0].uri;
        const response = await fetch(uri);
        const blob = await response.blob();

        const filename = `users/${me?.uid}/cars/${id || Date.now()}.jpg`;
        const storageRef = ref(storage, filename);

        await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        const url = await getDownloadURL(storageRef);

        setPhotoURL(url);

        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch { }

      } catch (error) {
        console.error("Upload error:", error);
        Alert.alert("Error", "Failed to upload photo");
      } finally {
        setUploadingPhoto(false);
      }
    } catch (error) {
      console.error("Photo picker error:", error);
    }
  };

  const save = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    if (!me) return Alert.alert("Sign in required", "Please sign in first.");
    if (!make.trim() || !model.trim()) return Alert.alert("Missing info", "Make and model are required.");
    if (year && isNaN(Number(year))) return Alert.alert("Invalid year", "Use a 4-digit year like 1999.");
    if (mileage && isNaN(Number(mileage))) return Alert.alert("Invalid mileage", "Use numbers only.");
    if (purchasePrice && isNaN(Number(purchasePrice))) return Alert.alert("Invalid price", "Use numbers only for purchase price.");
    if (currentValue && isNaN(Number(currentValue))) return Alert.alert("Invalid value", "Use numbers only for current value.");

    const userId = me.uid;

    const payload: any = {
      vehicleType,
      make: make.trim(),
      model: model.trim(),
      year: year ? Number(year) : null,
      nickname: nickname.trim() || null,
      photoURL: photoURL || null,
      vin: vin.trim().toUpperCase() || null,
      color: color.trim() || null,
      mileage: mileage ? Number(mileage) : null,
      purchasePrice: purchasePrice ? Number(purchasePrice) : null,
      currentValue: currentValue ? Number(currentValue) : null,
      isModified,
      pinned,
    };

    // Add vehicle-specific fields
    if (vehicleType === "car" || vehicleType === "truck" || vehicleType === "other") {
      payload.trim = trim.trim() || null;
      payload.engine = engine.trim() || null;
      payload.transmission = transmission.trim() || null;
      payload.drivetrain = drivetrain.trim() || null;
    }

    if (vehicleType === "motorcycle" || vehicleType === "offroad") {
      payload.bikeType = bikeType.trim() || null;
      payload.engineSize = engineSize.trim() || null;
      payload.transmission = transmission.trim() || null;
    }

    if (vehicleType === "truck") {
      payload.bedLength = bedLength.trim() || null;
      payload.towingCapacity = towingCapacity.trim() || null;
      payload.payloadCapacity = payloadCapacity.trim() || null;
    }

    if (vehicleType === "marine") {
      payload.length = length.trim() || null;
      payload.hullType = hullType.trim() || null;
      payload.marineEngineType = marineEngineType.trim() || null;
    }

    try {
      setSaving(true);

      if (isEdit && id) {
        await updateDoc(doc(db, "garages", userId, "cars", id), {
          ...payload,
          updatedAt: serverTimestamp()
        });

        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch { }

        Alert.alert("Success", "Vehicle updated successfully!", [
          { text: "OK", onPress: () => router.replace(`/car/${id}`) }
        ]);
      } else {
        const refDoc = await addDoc(collection(db, "garages", userId, "cars"), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch { }

        Alert.alert("Success", "Vehicle added to garage!", [
          { text: "OK", onPress: () => router.replace(`/car/${refDoc.id}`) }
        ]);
      }
    } catch (e: any) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch { }

      console.error("save failed:", e);
      Alert.alert("Save failed", String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const isValidMake = make.trim().length > 0;
  const isValidModel = model.trim().length > 0;
  const isValidYear = !year || (year.length === 4 && !isNaN(Number(year)));

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ paddingTop: insets.top }}>
        <TouchableOpacity onPress={animatedBack} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
          <Text style={s.backTxt}>Garage</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
      >
        <ScrollView
          contentContainerStyle={[s.centerWrap, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={s.garageHeader}>
            <View style={s.badge}>
              <Ionicons name="car-sport-outline" size={14} color="#111" />
              <Text style={s.badgeTxt}>{isEdit ? "Edit Garage Entry" : "New Garage Entry"}</Text>
            </View>
            {isEdit && id ? (
              <View style={s.badgeGhost}>
                <Ionicons name="id-card-outline" size={14} color={C.muted} />
                <Text style={s.badgeGhostTxt}>ID: {String(id).slice(0, 8)}…</Text>
              </View>
            ) : null}
          </View>

          {/* Photo Upload Section */}
          <TouchableOpacity
            onPress={pickPhoto}
            style={s.photoUploadCard}
            activeOpacity={0.8}
            disabled={uploadingPhoto}
          >
            {photoURL ? (
              <>
                <Image source={{ uri: photoURL }} style={s.carPhoto} />
                <View style={s.photoOverlay}>
                  {uploadingPhoto ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="camera" size={24} color="#fff" />
                      <Text style={s.photoOverlayText}>Change Photo</Text>
                    </>
                  )}
                </View>
              </>
            ) : (
              <View style={s.photoPlaceholder}>
                {uploadingPhoto ? (
                  <>
                    <ActivityIndicator size="large" color={C.accent} />
                    <Text style={s.photoPlaceholderText}>Uploading...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={48} color={C.muted} />
                    <Text style={s.photoPlaceholderText}>Add Photo</Text>
                    <Text style={s.photoPlaceholderHint}>Tap to upload</Text>
                  </>
                )}
              </View>
            )}
          </TouchableOpacity>

          <View style={s.card}>
            <Text style={s.sectionTitle}>Identity</Text>
            <View style={s.divider} />

            <View style={s.group}>
              <FieldLabel label="Nickname" hint="What do you call it?" />
              <TextInput
                ref={nicknameRef}
                style={s.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder="The Beast"
                placeholderTextColor={C.muted}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => vinRef.current?.focus()}
              />
            </View>

            <View style={s.group}>
              <FieldLabel label="Make" required valid={isValidMake} />
              <TextInput
                style={s.input}
                value={make}
                onChangeText={setMake}
                placeholder={vehicleType === "marine" ? "Boat brand" : vehicleType === "motorcycle" ? "Motorcycle brand" : "Vehicle brand"}
                placeholderTextColor={C.muted}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => modelRef.current?.focus()}
              />
            </View>

            <View style={s.group}>
              <FieldLabel label="Model" required valid={isValidModel} />
              <TextInput
                ref={modelRef}
                style={s.input}
                value={model}
                onChangeText={setModel}
                placeholder="Enter model"
                placeholderTextColor={C.muted}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => yearRef.current?.focus()}
              />
            </View>

            <View style={s.row}>
              <View style={[s.group, { flex: 1 }]}>
                <FieldLabel label="Year" hint="YYYY" valid={isValidYear} />
                <TextInput
                  ref={yearRef}
                  style={s.input}
                  value={year}
                  onChangeText={setYear}
                  placeholder="2006"
                  placeholderTextColor={C.muted}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  maxLength={4}
                  onSubmitEditing={() => trimRef.current?.focus()}
                />
              </View>
              <View style={{ width: 10 }} />

              {/* CONDITIONAL: Show Trim for Car/Truck/Other */}
              {(vehicleType === "car" || vehicleType === "truck" || vehicleType === "other") && (
                <View style={[s.group, { flex: 1 }]}>
                  <FieldLabel label="Trim" hint="Optional" />
                  <TextInput
                    ref={trimRef}
                    style={s.input}
                    value={trim}
                    onChangeText={setTrim}
                    placeholder="Sport"
                    placeholderTextColor={C.muted}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => nicknameRef.current?.focus()}
                  />
                </View>
              )}

              {/* CONDITIONAL: Show Type for Motorcycle/Off-Road */}
              {(vehicleType === "motorcycle" || vehicleType === "offroad") && (
                <View style={[s.group, { flex: 1 }]}>
                  <FieldLabel label="Type" hint="Optional" />
                  <TextInput
                    style={s.input}
                    value={bikeType}
                    onChangeText={setBikeType}
                    placeholder={vehicleType === "motorcycle" ? "Sport/Cruiser" : "ATV/UTV"}
                    placeholderTextColor={C.muted}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />
                </View>
              )}

              {/* CONDITIONAL: Show Hull Type for Marine */}
              {vehicleType === "marine" && (
                <View style={[s.group, { flex: 1 }]}>
                  <FieldLabel label="Type" hint="Optional" />
                  <TextInput
                    style={s.input}
                    value={hullType}
                    onChangeText={setHullType}
                    placeholder="Boat/Jet Ski"
                    placeholderTextColor={C.muted}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />
                </View>
              )}
            </View>

            <View style={s.group}>
              <FieldLabel label={vehicleType === "marine" ? "HIN" : "VIN"} hint="Optional" />
              <TextInput
                ref={vinRef}
                style={[s.input, { textTransform: "uppercase" }]}
                value={vin}
                onChangeText={(text) => setVin(text.toUpperCase())}
                placeholder={vehicleType === "marine" ? "ABC12345D404" : "WDBFA68E6YA123456"}
                placeholderTextColor={C.muted}
                autoCapitalize="characters"
                returnKeyType="next"
                maxLength={17}
                blurOnSubmit={false}
                onSubmitEditing={() => engineRef.current?.focus()}
              />
            </View>

            <View style={{ height: 18 }} />
            <Text style={s.sectionTitle}>Specifications</Text>
            <View style={s.divider} />

            {/* CONDITIONAL: Engine for Car/Truck/Other */}
            {(vehicleType === "car" || vehicleType === "truck" || vehicleType === "other") && (
              <View style={s.group}>
                <FieldLabel label="Engine" hint="Optional" />
                <TextInput
                  ref={engineRef}
                  style={s.input}
                  value={engine}
                  onChangeText={setEngine}
                  placeholder="5.0L V8"
                  placeholderTextColor={C.muted}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => transRef.current?.focus()}
                />
              </View>
            )}

            {/* CONDITIONAL: Engine Size (CC) for Motorcycle/Off-Road */}
            {(vehicleType === "motorcycle" || vehicleType === "offroad") && (
              <View style={s.group}>
                <FieldLabel label="Engine Size (cc)" hint="Optional" />
                <TextInput
                  style={s.input}
                  value={engineSize}
                  onChangeText={setEngineSize}
                  placeholder="750"
                  placeholderTextColor={C.muted}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  blurOnSubmit={false}
                />
              </View>
            )}

            {/* CONDITIONAL: Marine Engine Type */}
            {vehicleType === "marine" && (
              <>
                <View style={s.group}>
                  <FieldLabel label="Length (ft)" hint="Optional" />
                  <TextInput
                    style={s.input}
                    value={length}
                    onChangeText={setLength}
                    placeholder="24"
                    placeholderTextColor={C.muted}
                    keyboardType="number-pad"
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />
                </View>
                <View style={s.group}>
                  <FieldLabel label="Engine Type" hint="Optional" />
                  <TextInput
                    style={s.input}
                    value={marineEngineType}
                    onChangeText={setMarineEngineType}
                    placeholder="Outboard/Inboard"
                    placeholderTextColor={C.muted}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />
                </View>
              </>
            )}

            {/* CONDITIONAL: Transmission & Drivetrain for Car/Truck/Motorcycle/Off-Road */}
            {vehicleType !== "marine" && (
              <View style={s.row}>
                <View style={[s.group, { flex: 1 }]}>
                  <FieldLabel label="Transmission" hint="Optional" />
                  <TextInput
                    ref={transRef}
                    style={s.input}
                    value={transmission}
                    onChangeText={setTransmission}
                    placeholder={vehicleType === "motorcycle" || vehicleType === "offroad" ? "6-Speed" : "Auto"}
                    placeholderTextColor={C.muted}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => driveRef.current?.focus()}
                  />
                </View>

                {/* Show Drivetrain only for Car/Truck/Off-Road */}
                {(vehicleType === "car" || vehicleType === "truck" || vehicleType === "offroad" || vehicleType === "other") && (
                  <>
                    <View style={{ width: 10 }} />
                    <View style={[s.group, { flex: 1 }]}>
                      <FieldLabel label="Drivetrain" hint="Optional" />
                      <TextInput
                        ref={driveRef}
                        style={s.input}
                        value={drivetrain}
                        onChangeText={setDrivetrain}
                        placeholder={vehicleType === "offroad" ? "4WD" : "RWD"}
                        placeholderTextColor={C.muted}
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={() => colorRef.current?.focus()}
                      />
                    </View>
                  </>
                )}
              </View>
            )}

            {/* CONDITIONAL: Truck-Specific Fields */}
            {vehicleType === "truck" && (
              <>
                <View style={s.group}>
                  <FieldLabel label="Bed Length" hint="Optional" />
                  <TextInput
                    style={s.input}
                    value={bedLength}
                    onChangeText={setBedLength}
                    placeholder="6.5 ft"
                    placeholderTextColor={C.muted}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />
                </View>
                <View style={s.row}>
                  <View style={[s.group, { flex: 1 }]}>
                    <FieldLabel label="Towing Capacity" hint="Optional" />
                    <TextInput
                      style={s.input}
                      value={towingCapacity}
                      onChangeText={setTowingCapacity}
                      placeholder="10,000 lbs"
                      placeholderTextColor={C.muted}
                      returnKeyType="next"
                      blurOnSubmit={false}
                    />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={[s.group, { flex: 1 }]}>
                    <FieldLabel label="Payload" hint="Optional" />
                    <TextInput
                      style={s.input}
                      value={payloadCapacity}
                      onChangeText={setPayloadCapacity}
                      placeholder="2,000 lbs"
                      placeholderTextColor={C.muted}
                      returnKeyType="next"
                      blurOnSubmit={false}
                    />
                  </View>
                </View>
              </>
            )}

            <View style={s.group}>
              <FieldLabel label="Color" hint="Optional" />
              <TextInput
                ref={colorRef}
                style={s.input}
                value={color}
                onChangeText={setColor}
                placeholder="Black"
                placeholderTextColor={C.muted}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => mileageRef.current?.focus()}
              />
            </View>

            <View style={{ height: 18 }} />
            <Text style={s.sectionTitle}>Value & Investment</Text>
            <View style={s.divider} />

            <View style={s.group}>
              <FieldLabel label="Purchase Price" hint="Optional" />
              <View style={s.currencyInput}>
                <Text style={s.currencySymbol}>$</Text>
                <TextInput
                  ref={purchasePriceRef}
                  style={[s.input, { flex: 1, borderWidth: 0, paddingLeft: 0, backgroundColor: 'transparent' }]}
                  value={purchasePrice}
                  onChangeText={setPurchasePrice}
                  placeholder="25000"
                  placeholderTextColor={C.muted}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => currentValueRef.current?.focus()}
                />
              </View>
            </View>

            <View style={s.group}>
              <FieldLabel label="Current Value" hint="Optional" />
              <View style={s.currencyInput}>
                <Text style={s.currencySymbol}>$</Text>
                <TextInput
                  ref={currentValueRef}
                  style={[s.input, { flex: 1, borderWidth: 0, paddingLeft: 0, backgroundColor: 'transparent' }]}
                  value={currentValue}
                  onChangeText={setCurrentValue}
                  placeholder="28000"
                  placeholderTextColor={C.muted}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => mileageRef.current?.focus()}
                />
              </View>
            </View>

            <View style={{ height: 18 }} />
            <Text style={s.sectionTitle}>Status</Text>
            <View style={s.divider} />

            <View style={s.group}>
              <FieldLabel label={vehicleType === "marine" ? "Hours" : "Current Mileage"} hint="Optional" />
              <TextInput
                ref={mileageRef}
                style={s.input}
                value={mileage}
                onChangeText={setMileage}
                placeholder={vehicleType === "marine" ? "500" : "45000"}
                placeholderTextColor={C.muted}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>

            <ToggleRow
              label="Modified"
              hint={`This ${vehicleType === "marine" ? "vessel" : "vehicle"} has aftermarket modifications.`}
              value={isModified}
              onValueChange={setIsModified}
              icon="build-outline"
            />

            <ToggleRow
              label="Pin to Top"
              hint={`Keep this ${vehicleType === "marine" ? "vessel" : "vehicle"} at the front of your garage.`}
              value={pinned}
              onValueChange={setPinned}
              icon="pin-outline"
            />

            <View style={{ height: 20 }} />
            <TouchableOpacity
              onPress={save}
              style={[s.primary, saving && { opacity: 0.6 }]}
              activeOpacity={0.9}
              disabled={saving}
            >
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={s.primaryTxt}>{isEdit ? "Save changes" : `Add ${vehicleType}`}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={animatedBack} style={s.secondary} activeOpacity={0.9}>
              <Ionicons name="arrow-undo-outline" size={18} color={C.text} />
              <Text style={s.secondaryTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.footerNote}>Powered by RWX-TEK INC.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({ label, hint, required, valid }: {
  label: string;
  hint?: string;
  required?: boolean;
  valid?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={s.label}>{label}{required ? " *" : ""}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      {valid && <Ionicons name="checkmark-circle" size={14} color={C.success} />}
    </View>
  );
}

function ToggleRow({
  label, hint, value, onValueChange, icon,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch { }
        onValueChange(!value);
      }}
      style={s.toggleRow}
    >
      <View style={s.toggleLeft}>
        <View style={[s.iconCircle, value && s.iconCircleActive]}>
          <Ionicons name={icon} size={20} color={value ? "#111" : C.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.switchLabel}>{label}</Text>
          <Text style={s.switchHint}>{hint}</Text>
        </View>
      </View>
      <View style={s.switchLane}>
        <Switch
          value={value}
          onValueChange={(val) => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch { }
            onValueChange(val);
          }}
          thumbColor="#fff"
          trackColor={{ false: C.line, true: C.accent }}
          ios_backgroundColor={C.line}
        />
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  backTxt: { color: "#fff", fontWeight: "800" },
  centerWrap: { flexGrow: 1, padding: 16 },
  garageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: C.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeTxt: { color: "#111", fontWeight: "900", fontSize: 12, textTransform: "uppercase" },
  badgeGhost: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeGhostTxt: { color: C.muted, fontWeight: "800", fontSize: 12 },

  photoUploadCard: {
    width: "100%",
    height: 200,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  carPhoto: {
    width: "100%",
    height: "100%",
  },
  photoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  photoOverlayText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.dim,
  },
  photoPlaceholderText: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
  },
  photoPlaceholderHint: {
    color: C.muted,
    fontSize: 12,
  },

  card: {
    width: "100%",
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { color: C.text, fontWeight: "900", fontSize: 14 },
  divider: { height: 1, backgroundColor: C.line, opacity: 0.9, marginVertical: 4 },
  group: { gap: 6 },
  row: { flexDirection: "row" },
  label: { color: C.muted, fontSize: 12, fontWeight: "700" },
  hint: { color: C.muted, fontSize: 11, opacity: 0.8 },
  input: {
    color: C.text,
    backgroundColor: C.dim,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  currencyInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.dim,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  currencySymbol: {
    color: C.muted,
    fontSize: 16,
    fontWeight: "700",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    minHeight: 68,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingRight: 16,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  switchLabel: {
    color: C.text,
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  switchHint: {
    color: C.muted,
    fontSize: 12,
    flexShrink: 1,
    marginTop: 2,
  },
  switchLane: {
    width: 51,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  primary: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  primaryTxt: { color: "#fff", fontWeight: "900" },
  secondary: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.dim,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  secondaryTxt: { color: C.text, fontWeight: "800" },
  footerNote: {
    textAlign: "center",
    color: C.muted,
    marginTop: 20,
    fontSize: 12,
  },
});