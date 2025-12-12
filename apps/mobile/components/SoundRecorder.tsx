import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Alert,
    ActivityIndicator,
    Animated,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';

const C = {
    bg: "#0C0D11",
    panel: "#121318",
    line: "#1E2127",
    text: "#E7EAF0",
    muted: "#A6ADBB",
    accent: "#E11D48",
    good: "#22c55e",
};

interface SoundRecorderProps {
    visible: boolean;
    onClose: () => void;
    onRecordingComplete: (uri: string) => void;
    maxDuration: number;
    userTier: 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB';
}

type AnalysisStep = 'idle' | 'uploading' | 'transcribing' | 'analyzing';

export default function SoundRecorder({
    visible,
    onClose,
    onRecordingComplete,
    maxDuration,
    userTier,
}: SoundRecorderProps) {
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [analysisStep, setAnalysisStep] = useState<AnalysisStep>('idle');
    const [elapsedTime, setElapsedTime] = useState(0);

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const processingTimerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    // 🔥 FIX #1: Reset everything when modal closes
    useEffect(() => {
        if (!visible) {
            // Clean up when modal closes
            resetRecorder();
        }
    }, [visible]);

    // 🔥 FIX #2: Clean up audio session on unmount
    useEffect(() => {
        return () => {
            if (recording) {
                recording.stopAndUnloadAsync().catch(() => { });
            }
            Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
            }).catch(() => { });
        };
    }, []);

    // Reset function
    const resetRecorder = () => {
        if (timerInterval.current) {
            clearInterval(timerInterval.current);
            timerInterval.current = null;
        }
        if (processingTimerInterval.current) {
            clearInterval(processingTimerInterval.current);
            processingTimerInterval.current = null;
        }
        pulseAnim.stopAnimation();
        pulseAnim.setValue(1);
        setRecording(null);
        setIsRecording(false);
        setRecordingTime(0);
        setAnalysisStep('idle');
        setElapsedTime(0);
    };

    // Start recording
    const startRecording = async () => {
        try {
            console.log('[SoundRecorder] Requesting permissions...');

            // Request permissions
            const permission = await Audio.requestPermissionsAsync();
            if (!permission.granted) {
                Alert.alert(
                    'Permission Required',
                    'Please allow microphone access to record sounds.'
                );
                return;
            }

            console.log('[SoundRecorder] Setting audio mode...');

            // 🔥 FIX #3: Properly configure audio session
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
            });

            console.log('[SoundRecorder] Starting recording...');

            // Start recording
            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY,
                undefined,
                100
            );

            setRecording(newRecording);
            setIsRecording(true);
            setRecordingTime(0);

            // Start pulse animation
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.3,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();

            // Start timer
            timerInterval.current = setInterval(() => {
                setRecordingTime((prev) => {
                    const next = prev + 1;
                    if (next >= maxDuration) {
                        stopRecording();
                        return maxDuration;
                    }
                    return next;
                });
            }, 1000);

            console.log('[SoundRecorder] Recording started successfully');
        } catch (error) {
            console.error('[SoundRecorder] Failed to start recording:', error);
            Alert.alert('Error', 'Failed to start recording. Please try again.');
            resetRecorder();
        }
    };

    // Stop recording
    const stopRecording = async () => {
        try {
            if (!recording) return;

            console.log('[SoundRecorder] Stopping recording...');
            setIsRecording(false);
            pulseAnim.stopAnimation();

            if (timerInterval.current) {
                clearInterval(timerInterval.current);
                timerInterval.current = null;
            }

            await recording.stopAndUnloadAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
            });

            const uri = recording.getURI();
            console.log('[SoundRecorder] Recording stopped, URI:', uri);

            if (uri) {
                // Start processing with step progression
                setAnalysisStep('uploading');
                setElapsedTime(0);

                // Start elapsed time counter
                processingTimerInterval.current = setInterval(() => {
                    setElapsedTime(prev => prev + 1);
                }, 1000);

                // Simulate step progression
                setTimeout(() => setAnalysisStep('transcribing'), 2000);
                setTimeout(() => setAnalysisStep('analyzing'), 4000);

                onRecordingComplete(uri);
            } else {
                Alert.alert('Error', 'Failed to save recording.');
                resetRecorder();
            }

            setRecording(null);
        } catch (error) {
            console.error('[SoundRecorder] Failed to stop recording:', error);
            Alert.alert('Error', 'Failed to stop recording.');
            resetRecorder();
        }
    };

    // Cancel recording
    const cancelRecording = async () => {
        try {
            if (recording) {
                await recording.stopAndUnloadAsync();
            }
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
            });

            // 🔥 CRITICAL FIX: Reset ALL states
            resetRecorder();

            // Small delay to ensure state cleanup
            await new Promise(resolve => setTimeout(resolve, 100));

            onClose();
        } catch (error) {
            console.error('[SoundRecorder] Failed to cancel:', error);
            resetRecorder();
            onClose();
        }
    };

    // Format time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Get step info
    const getStepInfo = () => {
        switch (analysisStep) {
            case 'uploading':
                return {
                    icon: 'cloud-upload-outline' as const,
                    title: 'Uploading audio...',
                    subtitle: 'Sending to Scotty',
                };
            case 'transcribing':
                return {
                    icon: 'headset-outline' as const,
                    title: 'Transcribing...',
                    subtitle: 'Whisper AI is listening',
                };
            case 'analyzing':
                return {
                    icon: 'analytics-outline' as const,
                    title: 'Diagnosing...',
                    subtitle: 'Scotty is analyzing the sound',
                };
            default:
                return {
                    icon: 'mic' as const,
                    title: 'Processing...',
                    subtitle: 'Please wait',
                };
        }
    };

    const isProcessing = analysisStep !== 'idle';
    const stepInfo = getStepInfo();

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.overlay}>
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Ionicons name="mic" size={24} color={C.accent} />
                        <Text style={styles.title}>Sound Analysis</Text>
                        <TouchableOpacity onPress={cancelRecording} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color={C.muted} />
                        </TouchableOpacity>
                    </View>

                    {/* Instructions */}
                    {!isRecording && !isProcessing && (
                        <View style={styles.instructions}>
                            <Text style={styles.instructionText}>
                                Record the sound your car is making:
                            </Text>
                            <Text style={styles.bulletText}>• Start your engine</Text>
                            <Text style={styles.bulletText}>• Hold phone near the issue</Text>
                            <Text style={styles.bulletText}>
                                • Record for at least 5 seconds
                            </Text>
                            <Text style={styles.maxDuration}>
                                Max duration: {formatTime(maxDuration)}
                            </Text>
                        </View>
                    )}

                    {/* Recording State */}
                    {isRecording && (
                        <View style={styles.recordingContainer}>
                            <Animated.View
                                style={[
                                    styles.microphoneIcon,
                                    { transform: [{ scale: pulseAnim }] },
                                ]}
                            >
                                <Ionicons name="mic" size={64} color={C.accent} />
                            </Animated.View>

                            <Text style={styles.recordingText}>Recording...</Text>
                            <Text style={styles.timer}>
                                {formatTime(recordingTime)} / {formatTime(maxDuration)}
                            </Text>

                            {/* Waveform visualization (simple bars) */}
                            <View style={styles.waveform}>
                                {[...Array(20)].map((_, i) => (
                                    <View
                                        key={i}
                                        style={[
                                            styles.waveBar,
                                            {
                                                height: Math.random() * 40 + 10,
                                                opacity: 0.3 + Math.random() * 0.7,
                                            },
                                        ]}
                                    />
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Processing State with Steps */}
                    {isProcessing && (
                        <View style={styles.processingContainer}>
                            <View style={styles.processingIconContainer}>
                                <Ionicons name={stepInfo.icon} size={48} color={C.accent} />
                                <ActivityIndicator
                                    size="small"
                                    color={C.accent}
                                    style={styles.processingSpinner}
                                />
                            </View>

                            <Text style={styles.processingText}>
                                {stepInfo.title}
                            </Text>
                            <Text style={styles.processingSubtext}>
                                {stepInfo.subtitle}
                            </Text>

                            {/* 🔥 HELPER TEXT */}
                            <Text style={styles.dismissHint}>
                                Tap ✕ to dismiss and check chat
                            </Text>

                            {/* Progress Steps */}
                            <View style={styles.progressSteps}>
                                <View style={styles.progressStep}>
                                    <View style={[
                                        styles.progressDot,
                                        analysisStep === 'uploading' && styles.progressDotActive,
                                        (analysisStep === 'transcribing' || analysisStep === 'analyzing') && styles.progressDotComplete
                                    ]}>
                                        <Ionicons
                                            name={analysisStep === 'uploading' ? 'ellipsis-horizontal' : 'checkmark'}
                                            size={12}
                                            color="#fff"
                                        />
                                    </View>
                                    <Text style={styles.progressLabel}>Upload</Text>
                                </View>

                                <View style={[
                                    styles.progressLine,
                                    (analysisStep === 'transcribing' || analysisStep === 'analyzing') && styles.progressLineComplete
                                ]} />

                                <View style={styles.progressStep}>
                                    <View style={[
                                        styles.progressDot,
                                        analysisStep === 'transcribing' && styles.progressDotActive,
                                        analysisStep === 'analyzing' && styles.progressDotComplete
                                    ]}>
                                        <Ionicons
                                            name={analysisStep === 'transcribing' ? 'ellipsis-horizontal' : analysisStep === 'analyzing' ? 'checkmark' : 'ellipse'}
                                            size={12}
                                            color={analysisStep === 'uploading' ? C.muted : '#fff'}
                                        />
                                    </View>
                                    <Text style={styles.progressLabel}>Transcribe</Text>
                                </View>

                                <View style={[
                                    styles.progressLine,
                                    analysisStep === 'analyzing' && styles.progressLineComplete
                                ]} />

                                <View style={styles.progressStep}>
                                    <View style={[
                                        styles.progressDot,
                                        analysisStep === 'analyzing' && styles.progressDotActive,
                                    ]}>
                                        <Ionicons
                                            name={analysisStep === 'analyzing' ? 'ellipsis-horizontal' : 'ellipse'}
                                            size={12}
                                            color={analysisStep === 'uploading' || analysisStep === 'transcribing' ? C.muted : '#fff'}
                                        />
                                    </View>
                                    <Text style={styles.progressLabel}>Analyze</Text>
                                </View>
                            </View>

                            {/* Elapsed Time */}
                            <Text style={styles.elapsedTime}>
                                {elapsedTime}s elapsed
                            </Text>
                            <Text style={styles.estimatedTime}>
                                Usually takes 5-10 seconds
                            </Text>
                        </View>
                    )}

                    {/* Action Buttons */}
                    {!isProcessing && (
                        <View style={styles.actions}>
                            {!isRecording ? (
                                <TouchableOpacity
                                    style={styles.recordBtn}
                                    onPress={startRecording}
                                >
                                    <Ionicons name="mic" size={24} color="#fff" />
                                    <Text style={styles.recordBtnText}>Start Recording</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={styles.stopBtn}
                                    onPress={stopRecording}
                                >
                                    <Ionicons name="stop" size={24} color="#111" />
                                    <Text style={styles.stopBtnText}>Stop & Analyze</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Tier Badge */}
                    <View style={styles.tierBadge}>
                        <Text style={styles.tierText}>
                            {userTier === 'CLUB' ? '👑 Club' : userTier === 'TRACK_MODE' ? '🏁 Track Mode' : '⚡ Plus'} - {maxDuration}s max
                        </Text>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: C.panel,
        borderRadius: 24,
        padding: 24,
        borderWidth: 2,
        borderColor: C.line,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 12,
    },
    title: {
        color: C.text,
        fontSize: 20,
        fontWeight: '900',
        flex: 1,
    },
    closeBtn: {
        padding: 4,
    },
    instructions: {
        marginBottom: 24,
    },
    instructionText: {
        color: C.text,
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 12,
    },
    bulletText: {
        color: C.muted,
        fontSize: 14,
        marginBottom: 6,
        paddingLeft: 8,
    },
    maxDuration: {
        color: C.accent,
        fontSize: 13,
        fontWeight: '700',
        marginTop: 12,
    },
    recordingContainer: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    microphoneIcon: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: `${C.accent}20`,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    recordingText: {
        color: C.accent,
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 8,
    },
    timer: {
        color: C.text,
        fontSize: 24,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    waveform: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        height: 60,
        marginTop: 20,
    },
    waveBar: {
        width: 3,
        backgroundColor: C.accent,
        borderRadius: 2,
    },
    processingContainer: {
        alignItems: 'center',
        paddingVertical: 30,
    },
    processingIconContainer: {
        position: 'relative',
        marginBottom: 20,
    },
    processingSpinner: {
        position: 'absolute',
        bottom: -10,
        right: -10,
    },
    processingText: {
        color: C.text,
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 6,
    },
    processingSubtext: {
        color: C.muted,
        fontSize: 14,
        marginBottom: 12,
    },
    dismissHint: {
        color: C.muted,
        fontSize: 12,
        marginBottom: 20,
        fontStyle: 'italic',
    },
    progressSteps: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        width: '100%',
        paddingHorizontal: 20,
    },
    progressStep: {
        alignItems: 'center',
        gap: 8,
    },
    progressDot: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: C.line,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: C.line,
    },
    progressDotActive: {
        backgroundColor: C.accent,
        borderColor: C.accent,
    },
    progressDotComplete: {
        backgroundColor: C.good,
        borderColor: C.good,
    },
    progressLine: {
        flex: 1,
        height: 2,
        backgroundColor: C.line,
        marginHorizontal: 8,
    },
    progressLineComplete: {
        backgroundColor: C.good,
    },
    progressLabel: {
        color: C.muted,
        fontSize: 11,
        fontWeight: '700',
    },
    elapsedTime: {
        color: C.text,
        fontSize: 16,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    estimatedTime: {
        color: C.muted,
        fontSize: 12,
        marginTop: 4,
    },
    actions: {
        marginTop: 20,
    },
    recordBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: C.accent,
        paddingVertical: 16,
        borderRadius: 16,
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 4,
    },
    recordBtnText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '900',
    },
    stopBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: C.good,
        paddingVertical: 16,
        borderRadius: 16,
        shadowColor: C.good,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 4,
    },
    stopBtnText: {
        color: '#111',
        fontSize: 17,
        fontWeight: '900',
    },
    tierBadge: {
        marginTop: 16,
        alignItems: 'center',
    },
    tierText: {
        color: C.muted,
        fontSize: 12,
        fontWeight: '700',
    },
});