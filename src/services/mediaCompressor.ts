export const MAX_RECEIPT_EDGE_PX = 1024;
export const RECEIPT_JPEG_COMPRESS = 0.65;

export interface CompressedImage {
  uri: string;
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

export type ImageResizeAction = {
  resize: { width: number } | { height: number };
};

export interface ManipulateSaveOptions {
  compress?: number;
  format?: string;
  base64?: boolean;
}

export interface ManipulateImageResult {
  uri: string;
  width: number;
  height: number;
  base64?: string;
}

export interface ImageManipulatorLike {
  manipulateAsync: (
    uri: string,
    actions: ImageResizeAction[],
    saveOptions?: ManipulateSaveOptions,
  ) => Promise<ManipulateImageResult>;
  SaveFormat?: {
    JPEG: string;
  };
}

export interface CompressReceiptImageOptions {
  manipulator?: ImageManipulatorLike;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Compute resize actions so the long edge is at most MAX_RECEIPT_EDGE_PX without upscaling.
 * When source dimensions are unknown, falls back to resizing width to MAX_RECEIPT_EDGE_PX.
 */
export function buildReceiptResizeActions(
  width?: number,
  height?: number,
): ImageResizeAction[] {
  if (isPositiveFinite(width) && isPositiveFinite(height)) {
    if (width <= MAX_RECEIPT_EDGE_PX && height <= MAX_RECEIPT_EDGE_PX) {
      return [];
    }
    if (width >= height) {
      return [{ resize: { width: MAX_RECEIPT_EDGE_PX } }];
    }
    return [{ resize: { height: MAX_RECEIPT_EDGE_PX } }];
  }

  return [{ resize: { width: MAX_RECEIPT_EDGE_PX } }];
}

function loadExpoImageManipulator(): ImageManipulatorLike {
  try {
    // Lazy require avoids importing native Expo modules at top-level in Node test environments.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-image-manipulator') as ImageManipulatorLike;
    if (!mod || typeof mod.manipulateAsync !== 'function') {
      throw new Error('expo-image-manipulator 模組未提供 manipulateAsync');
    }
    return mod;
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown';
    console.error(`[MediaCompressor/loadExpoImageManipulator] Error - Failed to load module (${detail})`);
    throw new Error('目前環境無法載入圖片壓縮模組，請稍後再試。');
  }
}

function stripDataUrlPrefix(rawBase64: string): string {
  const trimmed = rawBase64.trim();
  const match = /^data:[^;]+;base64,/i.exec(trimmed);
  return match ? trimmed.slice(match[0].length).trim() : trimmed;
}

/**
 * Resize and JPEG-compress a receipt image before sending to Gemini AI.
 */
export async function compressReceiptImage(
  input: { uri: string; width?: number; height?: number },
  options?: CompressReceiptImageOptions,
): Promise<CompressedImage> {
  const uri = typeof input?.uri === 'string' ? input.uri.trim() : '';
  if (!uri) {
    console.warn('[MediaCompressor/compressReceiptImage] InvalidInput - Empty image URI');
    throw new Error('圖片路徑無效，請重新選擇收據圖片。');
  }

  const actions = buildReceiptResizeActions(input.width, input.height);
  const inSizeLabel =
    isPositiveFinite(input.width) && isPositiveFinite(input.height)
      ? `${input.width}x${input.height}`
      : 'unknown';

  console.log(
    `[MediaCompressor/compressReceiptImage] Start - Input:${inSizeLabel}, Actions:${JSON.stringify(actions)}`,
  );

  const manipulator = options?.manipulator ?? loadExpoImageManipulator();
  const jpegFormat = manipulator.SaveFormat?.JPEG ?? 'jpeg';

  try {
    const result = await manipulator.manipulateAsync(uri, actions, {
      compress: RECEIPT_JPEG_COMPRESS,
      format: jpegFormat,
      base64: true,
    });

    const cleanBase64 = typeof result?.base64 === 'string' ? stripDataUrlPrefix(result.base64) : '';
    if (!cleanBase64) {
      console.error(
        `[MediaCompressor/compressReceiptImage] Error - Input:${inSizeLabel}, Missing base64 output`,
      );
      throw new Error('圖片壓縮失敗：無法取得圖片編碼資料，請重新選擇圖片。');
    }

    const outWidth = isPositiveFinite(result.width)
      ? result.width
      : isPositiveFinite(input.width)
        ? input.width
        : MAX_RECEIPT_EDGE_PX;
    const outHeight = isPositiveFinite(result.height)
      ? result.height
      : isPositiveFinite(input.height)
        ? input.height
        : MAX_RECEIPT_EDGE_PX;
    const outUri = typeof result.uri === 'string' && result.uri.trim() ? result.uri : uri;

    console.log(
      `[MediaCompressor/compressReceiptImage] Done - Input:${inSizeLabel} -> Output:${outWidth}x${outHeight}, Base64Len:${cleanBase64.length}`,
    );

    return {
      uri: outUri,
      base64: cleanBase64,
      mimeType: 'image/jpeg',
      width: outWidth,
      height: outHeight,
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('圖片壓縮失敗')) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : '未知錯誤';
    console.error(
      `[MediaCompressor/compressReceiptImage] Failed - Input:${inSizeLabel}, Error:${detail}`,
    );
    throw new Error(`圖片壓縮失敗，請重新選擇圖片後再試（${detail}）。`);
  }
}
