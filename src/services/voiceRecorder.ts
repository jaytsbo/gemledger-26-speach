import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface VoiceRecordingResult {
  base64: string;
  mimeType: string;
  durationSec: number;
}

let activeRecording: Audio.Recording | null = null;
let recordingStartedAt = 0;

function normalizeAudioMimeType(rawMimeType: string | undefined, fallback: string): string {
  if (!rawMimeType) return fallback;
  const baseType = rawMimeType.split(';')[0]?.trim().toLowerCase();
  if (!baseType || !baseType.startsWith('audio/')) return fallback;
  return baseType;
}

function inferNativeMimeType(uri: string): string {
  const cleanUri = uri.split('?')[0]?.toLowerCase() ?? '';
  if (cleanUri.endsWith('.webm')) return 'audio/webm';
  if (cleanUri.endsWith('.wav')) return 'audio/wav';
  if (cleanUri.endsWith('.mp3')) return 'audio/mpeg';
  if (cleanUri.endsWith('.ogg')) return 'audio/ogg';
  if (cleanUri.endsWith('.aac')) return 'audio/aac';
  if (cleanUri.endsWith('.3gp')) return 'audio/3gpp';
  return 'audio/mp4';
}

function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('無法讀取錄音資料'));
        return;
      }
      resolve(result.slice(commaIdx + 1));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('讀取錄音檔案失敗'));
    };
    reader.readAsDataURL(blob);
  });
}

export async function startRecording(): Promise<void> {
  if (activeRecording) {
    console.log('[VoiceRecorder/startRecording] Cleanup - Stopping stale recording');
    await activeRecording.stopAndUnloadAsync().catch(() => {});
    activeRecording = null;
  }

  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) {
    console.warn('[VoiceRecorder/startRecording] Denied - Microphone permission not granted');
    throw new Error('未取得麥克風權限，請允許存取麥克風後再試。');
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
  );

  activeRecording = recording;
  recordingStartedAt = Date.now();
  console.log(`[VoiceRecorder/startRecording] Started - Platform:${Platform.OS}`);
}

export async function stopRecording(): Promise<VoiceRecordingResult> {
  if (!activeRecording) {
    throw new Error('目前沒有進行中的錄音');
  }

  const recording = activeRecording;
  activeRecording = null;

  const status = await recording.getStatusAsync().catch(() => null);
  await recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});

  const uri = recording.getURI();
  if (!uri) {
    throw new Error('錄音檔案路徑無效');
  }

  const elapsedMs = status?.durationMillis ?? Date.now() - recordingStartedAt;
  const durationSec = Math.max(1, Math.round(elapsedMs / 1000));

  let base64 = '';
  let mimeType = 'audio/mp4';

  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    mimeType = normalizeAudioMimeType(blob.type, 'audio/webm');
    base64 = await readBlobAsBase64(blob);
  } else {
    mimeType = inferNativeMimeType(uri);
    base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }

  if (!base64) {
    throw new Error('錄音內容為空，請再試一次');
  }

  console.log(
    `[VoiceRecorder/stopRecording] Stopped - DurationSec:${durationSec}, MimeType:${mimeType}, Base64Len:${base64.length}`,
  );

  return {
    base64,
    mimeType,
    durationSec,
  };
}

export async function cancelRecording(): Promise<void> {
  if (!activeRecording) return;

  const recording = activeRecording;
  activeRecording = null;

  const uri = recording.getURI();
  await recording.stopAndUnloadAsync().catch(() => {});
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});

  if (Platform.OS !== 'web' && uri) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }

  console.log('[VoiceRecorder/cancelRecording] Cancelled - Active recording discarded');
}
