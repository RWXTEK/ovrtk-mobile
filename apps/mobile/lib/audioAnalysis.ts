// lib/audioAnalysis.ts
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import * as FileSystem from 'expo-file-system';

/**
 * Upload audio file to Firebase Storage
 * @param userId - User ID
 * @param audioUri - Local audio file URI
 * @param userTier - User subscription tier (for logging/analytics)
 * @returns Download URL of uploaded audio
 */
export async function uploadAudioToStorage(
  userId: string,
  audioUri: string,
  userTier?: 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB'
): Promise<string> {
  try {
    console.log('[AudioAnalysis] Starting upload:', audioUri, 'Tier:', userTier);

    // Read the audio file
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (!fileInfo.exists) {
      throw new Error('Audio file not found');
    }

    // Read file as base64 (works on real devices)
    const base64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: 'base64',
    });
    const blob = await fetch(`data:audio/m4a;base64,${base64}`).then(res => res.blob());

    // Create Firebase Storage reference
    const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.m4a`;
    const storageRef = ref(storage, `sound-analysis/${userId}/${filename}`);

    // Upload
    await uploadBytesResumable(storageRef, blob, {
      contentType: 'audio/m4a',
    });

    // Get download URL
    const downloadUrl = await getDownloadURL(storageRef);
    console.log('[AudioAnalysis] Upload complete:', downloadUrl);

    return downloadUrl;
  } catch (error) {
    console.error('[AudioAnalysis] Upload failed:', error);
    throw error;
  }
}

/**
 * Analyze audio using OpenAI Whisper + GPT-4o via Cloud Function
 */
export async function analyzeSoundWithAI(
  audioUrl: string,
  carInfo: {
    make?: string;
    model?: string;
    year?: number;
    mileage?: number;
  }
): Promise<string> {
  try {
    console.log('[AudioAnalysis] Analyzing sound:', audioUrl);

    // Import functions dynamically to avoid circular dependencies
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('./firebase');

    // Call the Cloud Function
    const analyzeFn = httpsCallable(functions, 'analyzeSoundWithWhisper');
    const result = await analyzeFn({ audioUrl, carInfo });

    const data = result.data as { success: boolean; diagnosis: string };

    console.log('[AudioAnalysis] Analysis complete');
    return data.diagnosis || 'Unable to analyze sound. Please try again.';
  } catch (error: any) {
    console.error('[AudioAnalysis] Analysis failed:', error);

    // Handle specific error messages
    if (error.code === 'functions/unauthenticated') {
      throw new Error('You must be signed in to analyze sounds');
    }
    if (error.code === 'functions/resource-exhausted') {
      throw new Error('API quota exceeded. Please try again later.');
    }
    if (error.code === 'functions/invalid-argument') {
      throw new Error('Audio file is too large. Please record a shorter clip.');
    }

    throw new Error('Failed to analyze sound. Please try again.');
  }
}

/**
 * Get file size in MB
 */
export async function getAudioFileSize(uri: string): Promise<number> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists && 'size' in fileInfo) {
      return fileInfo.size / (1024 * 1024); // Convert to MB
    }
    return 0;
  } catch (error) {
    console.error('[AudioAnalysis] Failed to get file size:', error);
    return 0;
  }
}