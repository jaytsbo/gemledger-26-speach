import type { Audio as ExpoAudioNamespace } from 'expo-av';
import type * as ExpoFileSystemNamespace from 'expo-file-system';

export interface VoiceRecordingResult {
  base64: string;
  mimeType: string;
  durationSec: number;
}

/**
 * Lightweight speech-optimized recording preset:
 * - Android / iOS: AAC (.m4a), 16kHz mono, 32kbps (~4KB/sec)
 * - Web: audio/webm, 32kbps
 *
 * Uses raw expo-av enum values (MPEG_4=2, AAC=3, MPEG4AAC='aac ', MEDIUM=64) so
 * this constant can be imported and verified in Node test environments without loading
 * native React Native / Expo modules at module evaluation time.
 */
export const VOICE_RECORDING_OPTIONS: ExpoAudioNamespace.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension: '.m4a',
    outputFormat: 2, // Audio.AndroidOutputFormat.MPEG_4
    audioEncoder: 3, // Audio.AndroidAudioEncoder.AAC
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'aac ', // Audio.IOSOutputFormat.MPEG4AAC
    audioQuality: 64, // Audio.IOSAudioQuality.MEDIUM
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32000,
  },
};

function getAudioModule(): typeof ExpoAudioNamespace {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('expo-av') as { Audio: typeof ExpoAudioNamespace }).Audio;
}

function getFileSystemModule(): typeof ExpoFileSystemNamespace {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-file-system') as typeof ExpoFileSystemNamespace;
}

function getPlatformOS(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as { Platform?: { OS?: string } };
    return Platform?.OS ?? 'web';
  } catch {
    return 'web';
  }
}

let activeRecording: ExpoAudioNamespace.Recording | null = null;
let recordingStartedAt = 0;
let recordingSessionId = 0;

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
  const Audio = getAudioModule();
  const FileSystem = getFileSystemModule();
  const platformOS = getPlatformOS();

  const mySession = ++recordingSessionId;
  if (activeRecording) {
    console.log('[VoiceRecorder/startRecording] Cleanup - Stopping stale recording');
    await activeRecording.stopAndUnloadAsync().catch(() => {});
    activeRecording = null;
  }

  const permission = await Audio.requestPermissionsAsync();
  if (recordingSessionId !== mySession) {
    console.log('[VoiceRecorder/startRecording] Cancelled - Aborted during permission prompt');
    throw new Error('錄音已取消');
  }
  if (!permission.granted) {
    console.warn('[VoiceRecorder/startRecording] Denied - Microphone permission not granted');
    throw new Error('未取得麥克風權限，請允許存取麥克風後再試。');
  }

  let audioModeEnabled = false;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    audioModeEnabled = true;

    if (recordingSessionId !== mySession) {
      console.log('[VoiceRecorder/startRecording] Cancelled - Aborted before createAsync');
      throw new Error('錄音已取消');
    }

    const { recording } = await Audio.Recording.createAsync(VOICE_RECORDING_OPTIONS);

    if (recordingSessionId !== mySession) {
      console.log(
        '[VoiceRecorder/startRecording] Cancelled - Cleaning up recording created mid-cancel',
      );
      let orphanUri = recording.getURI();
      await recording.stopAndUnloadAsync().catch(() => {});
      orphanUri = recording.getURI() || orphanUri;
      if (platformOS === 'web') {
        revokeWebBlobUrl(orphanUri, 'startRecordingCancelled', platformOS);
      } else if (orphanUri) {
        await FileSystem.deleteAsync(orphanUri, { idempotent: true }).catch(() => {});
      }
      throw new Error('錄音已取消');
    }

    activeRecording = recording;
    recordingStartedAt = Date.now();
    console.log(
      `[VoiceRecorder/startRecording] Started - Platform:${platformOS}, SampleRate:${VOICE_RECORDING_OPTIONS.android.sampleRate}, Channels:${VOICE_RECORDING_OPTIONS.android.numberOfChannels}, BitRate:${VOICE_RECORDING_OPTIONS.android.bitRate}`,
    );
  } catch (err) {
    if (audioModeEnabled) {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    }
    throw err;
  }
}

function revokeWebBlobUrl(
  uri: string | null | undefined,
  caller: string,
  platformOS: string,
): void {
  if (
    platformOS === 'web' &&
    uri &&
    uri.startsWith('blob:') &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    try {
      URL.revokeObjectURL(uri);
      console.log(`[VoiceRecorder/${caller}] Cleanup - Revoked web blob URL`);
    } catch {
      // Ignore revoke errors on unsupported environments
    }
  }
}

export async function stopRecording(): Promise<VoiceRecordingResult> {
  if (!activeRecording) {
    throw new Error('目前沒有進行中的錄音');
  }

  const Audio = getAudioModule();
  const FileSystem = getFileSystemModule();
  const platformOS = getPlatformOS();

  const recording = activeRecording;
  activeRecording = null;

  let uri = recording.getURI();
  let base64 = '';
  let mimeType = 'audio/mp4';
  let durationSec = 1;

  try {
    const status = await recording.getStatusAsync().catch(() => null);
    await recording.stopAndUnloadAsync();
    uri = recording.getURI() || uri;
    if (!uri) {
      throw new Error('錄音檔案路徑無效');
    }

    const elapsedMs = status?.durationMillis ?? Date.now() - recordingStartedAt;
    durationSec = Math.max(1, Math.round(elapsedMs / 1000));

    if (platformOS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      mimeType = normalizeAudioMimeType(blob.type, 'audio/webm');
      base64 = await readBlobAsBase64(blob);
    } else {
      mimeType = inferNativeMimeType(uri);
      base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  } finally {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    if (platformOS === 'web') {
      revokeWebBlobUrl(uri, 'stopRecording', platformOS);
    } else if (uri) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
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
  recordingSessionId += 1;
  if (!activeRecording) return;

  const Audio = getAudioModule();
  const FileSystem = getFileSystemModule();
  const platformOS = getPlatformOS();

  const recording = activeRecording;
  activeRecording = null;

  let uri = recording.getURI();
  try {
    await recording.stopAndUnloadAsync().catch(() => {});
    uri = recording.getURI() || uri;
  } finally {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    if (platformOS === 'web') {
      revokeWebBlobUrl(uri, 'cancelRecording', platformOS);
    } else if (uri) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }

  console.log('[VoiceRecorder/cancelRecording] Cancelled - Active recording discarded');
}
