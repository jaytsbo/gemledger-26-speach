import { Platform, Share } from 'react-native';

export interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

export function formatFxTimestamp(raw?: string): string {
  if (!raw) return '尚未同步';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export async function deliverExportFile(
  content: string,
  filename: string,
  mimeType: string,
): Promise<'downloaded' | 'shared'> {
  if (Platform.OS === 'web') {
    const g = globalThis as any;
    if (g?.document && g?.Blob && g?.URL?.createObjectURL) {
      const blob = new g.Blob([content], { type: mimeType });
      const url = g.URL.createObjectURL(blob);
      const anchor = g.document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      g.document.body.appendChild(anchor);
      anchor.click();
      g.document.body.removeChild(anchor);
      setTimeout(() => g.URL.revokeObjectURL(url), 1000);
      return 'downloaded';
    }
  }

  await Share.share({
    title: filename,
    message: content,
  });
  return 'shared';
}
