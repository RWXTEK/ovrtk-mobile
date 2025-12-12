// VinScanner.tsx - Complete VIN Scanner with OCR Text Recognition
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Modal,
    ActivityIndicator,
    ScrollView,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { functions, storage } from "../../../lib/firebase";
import * as FileSystem from 'expo-file-system';


// Colors (match your OVRTK theme)
const C = {
    bg: "#0A0A0F",
    surface: "#13131A",
    panel: "#1A1A24",
    line: "#2A2A35",
    text: "#FFFFFF",
    textSecondary: "#9CA3AF",
    muted: "#6B7280",
    accent: "#FF3B30",
    good: "#34C759",
};

const SPACING = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

const RADIUS = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
};

interface VinResult {
    vin: string;
    year?: string;
    make?: string;
    model?: string;
    trim?: string;
    engine?: string;
    transmission?: string;
    bodyStyle?: string;
    doors?: string;
    fuelType?: string;
    error?: string;
}

export default function VinScanner({ onClose, onVinDecoded, userId }: {
    onClose: () => void;
    onVinDecoded: (result: VinResult) => void;
    userId: string;
}) {
    const [method, setMethod] = useState<'menu' | 'camera' | 'photo' | 'manual'>('menu');
    const [manualVin, setManualVin] = useState('');
    const [loading, setLoading] = useState(false);
    const [scannedImage, setScannedImage] = useState<string | null>(null);
    const [extractingText, setExtractingText] = useState(false);
    const cameraRef = useRef<CameraView>(null);

    // Request camera permissions
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
        if (permission === null) {
            requestPermission();
        }
    }, [permission]);

    // Extract VIN from text using regex
    const extractVinFromText = (text: string): string | null => {
        // VIN regex: 17 alphanumeric characters, no I, O, or Q
        const vinRegex = /[A-HJ-NPR-Z0-9]{17}/g;
        const matches = text.toUpperCase().match(vinRegex);

        if (matches && matches.length > 0) {
            // Return the first valid VIN found
            return matches[0];
        }

        return null;
    };

    // OCR: Extract text from image
    const recognizeTextFromImage = async (imageUri: string) => {
        try {
            setExtractingText(true);

            // Upload image to Firebase Storage
            const filename = `vin_scan_${Date.now()}.jpg`;
            const storageRef = ref(storage, `vin-scans/${userId}/${filename}`);

            // Read file as base64 (works on real devices)
            const base64 = await FileSystem.readAsStringAsync(imageUri, {
                encoding: 'base64',
            });
            const blob = await fetch(`data:image/jpeg;base64,${base64}`).then(res => res.blob());

            await uploadBytes(storageRef, blob);
            const imageUrl = await getDownloadURL(storageRef);

            // Call GPT-4o Vision to extract VIN
            const callVinExtractFn = httpsCallable<{ messages: Array<{ role: string; content: string }>; imageUrl?: string }, { reply?: string }>(functions, "scottyChat");

            const result = await callVinExtractFn({
                messages: [
                    {
                        role: "user",
                        content: "Extract the VIN (Vehicle Identification Number) from this image. Only return the 17-character VIN, nothing else. If no VIN is found, respond with 'NO_VIN_FOUND'."
                    }
                ],
                imageUrl: imageUrl,
            });

            const extractedText = result.data?.reply?.trim() || "";
            console.log('GPT-4o Vision Result:', extractedText);

            // Try to extract VIN from the response
            const detectedVin = extractVinFromText(extractedText);

            if (detectedVin && detectedVin !== 'NO_VIN_FOUND') {
                setManualVin(detectedVin);
                setMethod('manual');
                Alert.alert(
                    '✅ VIN Detected!',
                    `Found VIN: ${detectedVin}\n\nPlease verify and tap "Decode VIN"`,
                    [{ text: 'OK' }]
                );
            } else {
                Alert.alert(
                    '⚠️ No VIN Found',
                    'Could not detect a VIN in the image. Please enter it manually.',
                    [
                        {
                            text: 'Enter Manually',
                            onPress: () => setMethod('manual'),
                        },
                    ]
                );
            }

            setExtractingText(false);
        } catch (error: any) {
            console.error('VIN extraction error:', error);
            console.error('Error details:', error?.message, error?.code, error?.details);
            setExtractingText(false);
            Alert.alert(
                'Extraction Failed',
                `Could not read VIN from image: ${error?.message || 'Unknown error'}\n\nPlease enter VIN manually.`,
                [
                    {
                        text: 'Enter Manually',
                        onPress: () => setMethod('manual'),
                    },
                ]
            );
        }
    };

    // Decode VIN using NHTSA API (free government database)
    const decodeVin = async (vin: string) => {
        try {
            setLoading(true);

            // Validate VIN format (17 characters, alphanumeric, no I, O, Q)
            const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
            if (!vinRegex.test(vin.toUpperCase())) {
                Alert.alert('Invalid VIN', 'VIN must be 17 characters (A-Z, 0-9, no I, O, or Q)');
                setLoading(false);
                return;
            }

            // Call NHTSA VIN Decoder API
            const response = await fetch(
                `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`
            );
            const data = await response.json();

            if (data.Results) {
                // Extract vehicle info from results
                const results: VinResult = { vin: vin.toUpperCase() };

                data.Results.forEach((item: any) => {
                    switch (item.Variable) {
                        case 'Model Year':
                            results.year = item.Value;
                            break;
                        case 'Make':
                            results.make = item.Value;
                            break;
                        case 'Model':
                            results.model = item.Value;
                            break;
                        case 'Trim':
                            results.trim = item.Value;
                            break;
                        case 'Engine Number of Cylinders':
                            results.engine = item.Value ? `${item.Value}-cylinder` : undefined;
                            break;
                        case 'Transmission Style':
                            results.transmission = item.Value;
                            break;
                        case 'Body Class':
                            results.bodyStyle = item.Value;
                            break;
                        case 'Doors':
                            results.doors = item.Value;
                            break;
                        case 'Fuel Type - Primary':
                            results.fuelType = item.Value;
                            break;
                    }
                });

                // Check if we got valid data
                if (!results.make || !results.model) {
                    results.error = 'VIN decoded but vehicle details not found';
                }

                setLoading(false);
                onVinDecoded(results);
                onClose();
            } else {
                setLoading(false);
                Alert.alert('Error', 'Failed to decode VIN');
            }
        } catch (error) {
            setLoading(false);
            Alert.alert('Error', 'Network error. Please try again.');
            console.error('VIN decode error:', error);
        }
    };

    // Take photo with camera
    const takePicture = async () => {
        if (cameraRef.current) {
            try {
                const photo = await cameraRef.current.takePictureAsync();
                if (photo?.uri) {
                    setScannedImage(photo.uri);
                    // Use OCR to extract VIN from image
                    await recognizeTextFromImage(photo.uri);
                }
            } catch (error) {
                Alert.alert('Error', 'Failed to take picture');
            }
        }
    };

    // Pick image from gallery
    const pickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 1,
            });

            if (!result.canceled && result.assets[0]) {
                setScannedImage(result.assets[0].uri);
                // Use OCR to extract VIN from image
                await recognizeTextFromImage(result.assets[0].uri);
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to pick image');
        }
    };

    // Render menu screen
    if (method === 'menu') {
        return (
            <SafeAreaView style={s.container} edges={['top']}>
                <View style={s.header}>
                    <View style={{ width: 40 }} />
                    <Text style={s.headerTitle}>Scan VIN</Text>
                    <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                        <Ionicons name="close" size={28} color={C.text} />
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={s.menuContent}>
                    <Text style={s.menuTitle}>Choose a method to scan your VIN</Text>
                    <Text style={s.menuSubtitle}>
                        VIN numbers are typically found on the driver's side dashboard or door jamb
                    </Text>

                    {/* Camera Scanner */}
                    <TouchableOpacity
                        style={s.methodCard}
                        onPress={() => setMethod('camera')}
                    >
                        <View style={s.methodIcon}>
                            <Ionicons name="camera" size={32} color={C.accent} />
                        </View>
                        <View style={s.methodText}>
                            <Text style={s.methodTitle}>Camera Scanner</Text>
                            <Text style={s.methodDesc}>Point camera at VIN plate</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color={C.textSecondary} />
                    </TouchableOpacity>

                    {/* Photo Upload */}
                    <TouchableOpacity
                        style={s.methodCard}
                        onPress={pickImage}
                    >
                        <View style={s.methodIcon}>
                            <Ionicons name="image" size={32} color={C.accent} />
                        </View>
                        <View style={s.methodText}>
                            <Text style={s.methodTitle}>Upload Photo</Text>
                            <Text style={s.methodDesc}>Select from gallery</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color={C.textSecondary} />
                    </TouchableOpacity>

                    {/* Manual Entry */}
                    <TouchableOpacity
                        style={s.methodCard}
                        onPress={() => setMethod('manual')}
                    >
                        <View style={s.methodIcon}>
                            <Ionicons name="create" size={32} color={C.accent} />
                        </View>
                        <View style={s.methodText}>
                            <Text style={s.methodTitle}>Enter Manually</Text>
                            <Text style={s.methodDesc}>Type the 17-digit VIN</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color={C.textSecondary} />
                    </TouchableOpacity>

                    {/* Info Card */}
                    <View style={s.infoCard}>
                        <Ionicons name="information-circle" size={20} color={C.accent} />
                        <Text style={s.infoTextSmall}>
                            AI-powered OCR detects VINs automatically. Decoding powered by NHTSA database.
                        </Text>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // Render camera scanner
    if (method === 'camera') {
        if (permission === null) {
            return <View style={s.container}><ActivityIndicator size="large" color={C.accent} /></View>;
        }
        if (permission && !permission.granted) {
            return (
                <SafeAreaView style={s.container}>
                    <View style={s.header}>
                        <TouchableOpacity onPress={() => setMethod('menu')} style={s.closeBtn}>
                            <Ionicons name="arrow-back" size={28} color={C.text} />
                        </TouchableOpacity>
                        <Text style={s.headerTitle}>Camera Access</Text>
                        <View style={{ width: 28 }} />
                    </View>
                    <View style={s.permissionDenied}>
                        <Ionicons name="camera-outline" size={64} color={C.muted} />
                        <Text style={s.permissionText}>Camera permission denied</Text>
                        <Text style={s.permissionSubtext}>Enable camera access in settings to use this feature</Text>
                    </View>
                </SafeAreaView>
            );
        }

        return (
            <View style={s.container}>
                <CameraView style={s.camera} ref={cameraRef}>
                    <SafeAreaView style={s.cameraOverlay} edges={['top']}>
                        <View style={s.header}>
                            <TouchableOpacity onPress={() => setMethod('menu')} style={s.closeBtn}>
                                <Ionicons name="arrow-back" size={28} color="#FFF" />
                            </TouchableOpacity>
                            <Text style={[s.headerTitle, { color: '#FFF' }]}>Scan VIN</Text>
                            <View style={{ width: 28 }} />
                        </View>

                        <View style={s.cameraGuide}>
                            <View style={s.scanFrame} />
                            <Text style={s.cameraText}>Position VIN within frame</Text>
                            <Text style={s.cameraSubtext}>AI will auto-detect the VIN</Text>
                        </View>

                        <View style={s.cameraControls}>
                            <TouchableOpacity style={s.captureBtn} onPress={takePicture}>
                                <View style={s.captureBtnInner} />
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </CameraView>

                {/* OCR Processing Overlay */}
                {extractingText && (
                    <View style={s.processingOverlay}>
                        <ActivityIndicator size="large" color={C.accent} />
                        <Text style={s.processingText}>Reading VIN...</Text>
                    </View>
                )}
            </View>
        );
    }

    // Render manual entry
    if (method === 'manual') {
        return (
            <SafeAreaView style={s.container} edges={['top']}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={0}
                >
                    <View style={s.header}>
                        <TouchableOpacity
                            onPress={() => {
                                setScannedImage(null);
                                setManualVin('');
                                setMethod('menu');
                            }}
                            style={s.closeBtn}
                        >
                            <Ionicons name="arrow-back" size={28} color={C.text} />
                        </TouchableOpacity>
                        <Text style={s.headerTitle}>Enter VIN</Text>
                        <View style={{ width: 28 }} />
                    </View>

                    <ScrollView contentContainerStyle={s.manualContent}>
                        {scannedImage && (
                            <View style={s.scannedImageContainer}>
                                <Image source={{ uri: scannedImage }} style={s.scannedImage} />
                                <TouchableOpacity
                                    style={s.retakeBtn}
                                    onPress={() => {
                                        setScannedImage(null);
                                        setMethod('camera');
                                    }}
                                >
                                    <Ionicons name="camera" size={20} color={C.accent} />
                                    <Text style={s.retakeBtnText}>Retake</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <Text style={s.manualTitle}>
                            {scannedImage ? 'Verify the VIN' : 'Enter the 17-digit VIN'}
                        </Text>
                        <Text style={s.manualSubtitle}>
                            VIN numbers contain only letters and numbers (no I, O, or Q)
                        </Text>

                        <TextInput
                            style={s.vinInput}
                            value={manualVin}
                            onChangeText={(text) => setManualVin(text.toUpperCase())}
                            placeholder="1HGBH41JXMN109186"
                            placeholderTextColor={C.muted}
                            maxLength={17}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            keyboardType="default"
                        />

                        <Text style={s.vinCounter}>{manualVin.length}/17</Text>

                        <TouchableOpacity
                            style={[s.decodeBtn, manualVin.length !== 17 && s.decodeBtnDisabled]}
                            onPress={() => decodeVin(manualVin)}
                            disabled={manualVin.length !== 17 || loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#111" />
                            ) : (
                                <Text style={s.decodeBtnText}>Decode VIN</Text>
                            )}
                        </TouchableOpacity>

                        <View style={s.infoCard}>
                            <Ionicons name="sparkles" size={24} color={C.accent} />
                            <Text style={s.infoText}>
                                AI-powered text recognition automatically detects VINs from photos. VIN decoding powered by NHTSA database.
                            </Text>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    return null;
}

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.bg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.md,
        paddingTop: 60,
        paddingBottom: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
    },
    closeBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: C.text,
    },

    /* Menu Screen */
    menuContent: {
        padding: SPACING.lg,
    },
    menuTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: C.text,
        marginBottom: SPACING.sm,
    },
    menuSubtitle: {
        fontSize: 15,
        color: C.textSecondary,
        marginBottom: SPACING.xl,
        lineHeight: 22,
    },
    methodCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.surface,
        padding: SPACING.lg,
        borderRadius: RADIUS.lg,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: C.line,
    },
    methodIcon: {
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.panel,
        borderRadius: RADIUS.md,
        marginRight: SPACING.md,
    },
    methodText: {
        flex: 1,
    },
    methodTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: C.text,
        marginBottom: 4,
    },
    methodDesc: {
        fontSize: 14,
        color: C.textSecondary,
    },
    infoCard: {
        flexDirection: 'row',
        backgroundColor: C.surface,
        padding: SPACING.md,
        borderRadius: RADIUS.md,
        marginTop: SPACING.lg,
        borderWidth: 1,
        borderColor: C.line,
        gap: SPACING.sm,
    },
    infoText: {
        flex: 1,
        fontSize: 14,
        color: C.textSecondary,
        lineHeight: 20,
    },
    infoTextSmall: {
        flex: 1,
        fontSize: 13,
        color: C.textSecondary,
        lineHeight: 18,
    },

    /* Camera Screen */
    camera: {
        flex: 1,
    },
    cameraOverlay: {
        flex: 1,
    },
    cameraGuide: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scanFrame: {
        width: 300,
        height: 80,
        borderWidth: 3,
        borderColor: '#FFF',
        borderRadius: RADIUS.md,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    cameraText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
        marginTop: SPACING.lg,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    cameraSubtext: {
        color: '#FFF',
        fontSize: 14,
        marginTop: SPACING.sm,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    cameraControls: {
        alignItems: 'center',
        paddingBottom: SPACING.xl,
    },
    captureBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    captureBtnInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FFF',
    },
    processingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    processingText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '600',
        marginTop: SPACING.md,
    },
    permissionDenied: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.xl,
    },
    permissionText: {
        fontSize: 20,
        fontWeight: '700',
        color: C.text,
        marginTop: SPACING.lg,
        marginBottom: SPACING.sm,
    },
    permissionSubtext: {
        fontSize: 15,
        color: C.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },

    /* Manual Entry */
    manualContent: {
        paddingHorizontal: SPACING.lg,
        paddingTop: 0,              // ← No top padding
        paddingBottom: SPACING.xl,
    },
    scannedImageContainer: {
        position: 'relative',
        marginBottom: SPACING.md,
        marginTop: SPACING.lg,    // ← Add space from header
    },
    scannedImage: {
        width: '100%',
        height: 10,
        borderRadius: RADIUS.lg,
    },
    retakeBtn: {
        position: 'absolute',
        top: SPACING.sm,
        right: SPACING.sm,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.surface,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderRadius: RADIUS.md,
        gap: 6,
    },
    retakeBtnText: {
        color: C.accent,
        fontSize: 14,
        fontWeight: '600',
    },
    manualTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: C.text,
        marginBottom: SPACING.sm,
        marginTop: SPACING.lg,    // ← Add space from header
    },
    manualSubtitle: {
        fontSize: 15,
        color: C.textSecondary,
        marginBottom: SPACING.xl,
        lineHeight: 22,
    },
    vinInput: {
        backgroundColor: C.surface,
        borderWidth: 2,
        borderColor: C.line,
        borderRadius: RADIUS.md,
        padding: SPACING.md,
        fontSize: 18,
        fontWeight: '600',
        color: C.text,
        letterSpacing: 2,
        fontFamily: 'monospace',
    },
    vinCounter: {
        fontSize: 14,
        color: C.textSecondary,
        textAlign: 'right',
        marginTop: SPACING.sm,
        marginBottom: SPACING.lg,
    },
    decodeBtn: {
        backgroundColor: C.accent,
        padding: SPACING.lg,
        borderRadius: RADIUS.md,
        alignItems: 'center',
    },
    decodeBtnDisabled: {
        opacity: 0.5,
    },
    decodeBtnText: {
        color: '#111',
        fontSize: 17,
        fontWeight: '700',
    },
});