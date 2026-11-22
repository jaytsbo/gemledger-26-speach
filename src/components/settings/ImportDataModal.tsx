import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { AlertTriangle, FileUp } from 'lucide-react-native';
import { MONO_FONT } from '@/components/ui/HudReticle';
import { useLedgerStore } from '@/store/useLedgerStore';
import { HUD_RADIUS } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { decodeCsvBytes, parseCsvTransactions, TransactionDraft } from '@/utils/csvImport';
import { SettingsModalFrame } from './SettingsModalFrame';
import { FeedbackState } from './settingsHelpers';

interface ImportDataModalProps {
  visible: boolean;
  onClose: () => void;
  onFeedback: (fb: FeedbackState) => void;
}

type ImportMode = 'append' | 'overwrite';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(b64: string): Uint8Array {
  const sanitized = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!sanitized) return new Uint8Array(0);
  const padLen = sanitized.length % 4 === 0 ? 0 : 4 - (sanitized.length % 4);
  const normalized = sanitized + '='.repeat(padLen);

  if (typeof atob === 'function') {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const clean = normalized.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = BASE64_CHARS.indexOf(clean[i]);
    const c2 = BASE64_CHARS.indexOf(clean[i + 1]);
    const c3 = i + 2 < clean.length ? BASE64_CHARS.indexOf(clean[i + 2]) : -1;
    const c4 = i + 3 < clean.length ? BASE64_CHARS.indexOf(clean[i + 3]) : -1;
    if (c1 < 0 || c2 < 0) {
      throw new Error('Base64 資料格式無效');
    }
    out[p++] = (c1 << 2) | (c2 >> 4);
    if (c3 >= 0) out[p++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (c4 >= 0) out[p++] = ((c3 & 3) << 6) | c4;
  }
  return out.subarray(0, p);
}

async function readPickedAssetText(
  asset: DocumentPicker.DocumentPickerAsset,
): Promise<string> {
  if (Platform.OS === 'web') {
    const webFile = (asset as { file?: File }).file;
    if (webFile && typeof FileReader !== 'undefined') {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(new Error('無法讀取選擇的 CSV 檔案'));
        reader.readAsArrayBuffer(webFile);
      });
      return decodeCsvBytes(new Uint8Array(buffer));
    }
    const res = await fetch(asset.uri);
    if (!res.ok) {
      throw new Error('無法讀取選擇的 CSV 檔案');
    }
    const buf = await res.arrayBuffer();
    return decodeCsvBytes(new Uint8Array(buf));
  }

  let base64Content: string | null = null;
  try {
    base64Content = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (readErr) {
    console.warn('[Settings/ImportDataModal] ReadBase64Failed - Falling back to UTF-8 read', readErr);
  }

  if (base64Content !== null) {
    return decodeCsvBytes(base64ToBytes(base64Content));
  }

  return FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export function ImportDataModal({
  visible,
  onClose,
  onFeedback,
}: ImportDataModalProps) {
  const { colors } = useAppTheme();
  const importTransactions = useLedgerStore((s) => s.importTransactions);

  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<TransactionDraft[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const isParsingRef = useRef(false);
  const isImportingRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setImportMode('append');
      setInlineError(null);
      setParsedItems([]);
      setPickedFileName(null);
      isParsingRef.current = false;
      isImportingRef.current = false;
      setIsParsing(false);
      setIsImporting(false);
    }
  }, [visible]);

  const handlePickCsv = async () => {
    if (isParsingRef.current || isImportingRef.current) return;
    isParsingRef.current = true;
    setInlineError(null);
    setIsParsing(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) {
        return;
      }
      const asset = result.assets[0];
      setPickedFileName(asset.name || 'selected.csv');
      console.log(`[Settings/ImportDataModal] PickCsv - name=${asset.name}`);
      const text = await readPickedAssetText(asset);
      const rows = parseCsvTransactions(text);
      if (rows.length === 0) {
        setInlineError('CSV 檔案中沒有解析出有效交易資料');
        setParsedItems([]);
      } else {
        setParsedItems(rows);
      }
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : '解析 CSV 檔案失敗');
      setParsedItems([]);
    } finally {
      isParsingRef.current = false;
      setIsParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedItems.length === 0 || isParsingRef.current || isImportingRef.current) return;
    isImportingRef.current = true;
    setInlineError(null);
    setIsImporting(true);
    try {
      console.log(
        `[Settings/ImportDataModal] ConfirmImport - mode=${importMode}, count=${parsedItems.length}`,
      );
      await importTransactions(parsedItems, importMode);
      onFeedback({
        type: 'success',
        message:
          importMode === 'overwrite'
            ? `已覆蓋匯入 ${parsedItems.length} 筆交易紀錄`
            : `已追加匯入 ${parsedItems.length} 筆交易紀錄`,
      });
      onClose();
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : '匯入交易失敗');
    } finally {
      isImportingRef.current = false;
      setIsImporting(false);
    }
  };

  const confirmFgColor = importMode === 'overwrite' ? '#FFFFFF' : colors.onPrimary;

  return (
    <SettingsModalFrame
      visible={visible}
      title="資料匯入"
      subtitle="選擇本地 CSV 檔案匯入交易紀錄"
      onClose={onClose}
    >
      {inlineError ? (
        <View
          style={[
            styles.errorBox,
            { backgroundColor: colors.expenseBg, borderColor: colors.expense },
          ]}
        >
          <Text style={[styles.errorText, { color: colors.expense }]}>{inlineError}</Text>
        </View>
      ) : null}

      <View style={styles.sourceBox}>
        <Pressable
          onPress={handlePickCsv}
          disabled={isParsing || isImporting}
          style={[
            styles.filePickerBtn,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.primary,
              opacity: isParsing || isImporting ? 0.65 : 1,
            },
          ]}
        >
          {isParsing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <FileUp size={20} color={colors.primary} />
          )}
          <Text style={[styles.filePickerTitle, { color: colors.primary }]}>
            {pickedFileName ? `已選擇：${pickedFileName}` : '選擇 CSV 檔案'}
          </Text>
          <Text style={[styles.filePickerHint, { color: colors.textMuted }]}>
            支援欄位：日期、時間、帳戶、項目名稱、分類、幣別、金額、備註
          </Text>
        </Pressable>
      </View>

      {/* Preview */}
      {parsedItems.length > 0 ? (
        <View
          style={[
            styles.previewBox,
            { backgroundColor: colors.incomeBg, borderColor: colors.income },
          ]}
        >
          <Text style={[styles.previewTitle, { color: colors.income }]}>
            已解析 {parsedItems.length} 筆交易（預覽前 3 筆）
          </Text>
          {parsedItems.slice(0, 3).map((item, idx) => (
            <Text
              key={`${item.date}-${item.name}-${idx}`}
              style={[styles.previewRow, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.date} · {item.account} · {item.category} · {item.name} · {item.currency} {item.amount}
            </Text>
          ))}
        </View>
      ) : null}

      {/* Import Mode */}
      <View style={styles.modeSection}>
        <Text style={[styles.fieldLabel, { color: colors.primary }]}>匯入模式</Text>
        <View style={styles.modeRow}>
          <Pressable
            disabled={isParsing || isImporting}
            onPress={() => setImportMode('append')}
            style={[
              styles.modeCard,
              {
                backgroundColor:
                  importMode === 'append' ? colors.primaryBg : colors.surfaceElevated,
                borderColor: importMode === 'append' ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.modeTitle,
                { color: importMode === 'append' ? colors.primary : colors.text },
              ]}
            >
              僅追加新交易
            </Text>
            <Text style={[styles.modeDesc, { color: colors.textMuted }]}>
              保留現有紀錄並新增
            </Text>
          </Pressable>

          <Pressable
            disabled={isParsing || isImporting}
            onPress={() => setImportMode('overwrite')}
            style={[
              styles.modeCard,
              {
                backgroundColor:
                  importMode === 'overwrite' ? colors.expenseBg : colors.surfaceElevated,
                borderColor: importMode === 'overwrite' ? colors.expense : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.modeTitle,
                { color: importMode === 'overwrite' ? colors.expense : colors.text },
              ]}
            >
              清空並完全覆蓋
            </Text>
            <Text style={[styles.modeDesc, { color: colors.textMuted }]}>
              取代現有全部交易
            </Text>
          </Pressable>
        </View>

        {importMode === 'overwrite' ? (
          <View style={styles.overwriteWarn}>
            <AlertTriangle size={14} color={colors.expense} />
            <Text style={[styles.overwriteWarnText, { color: colors.expense }]}>
              注意：覆蓋模式將清空現有交易與預設帳戶/分類，僅保留本次 CSV 資料（保留本位幣別）。
            </Text>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={handleConfirmImport}
        disabled={parsedItems.length === 0 || isImporting || isParsing}
        style={[
          styles.confirmBtn,
          {
            backgroundColor:
              importMode === 'overwrite' ? colors.danger : colors.primary,
            borderColor:
              importMode === 'overwrite' ? colors.danger : colors.primary,
            opacity: parsedItems.length === 0 || isImporting || isParsing ? 0.5 : 1,
          },
        ]}
      >
        {isImporting ? (
          <ActivityIndicator size="small" color={confirmFgColor} />
        ) : (
          <Text style={[styles.confirmBtnText, { color: confirmFgColor }]}>
            {parsedItems.length > 0
              ? `確認匯入（${parsedItems.length} 筆）`
              : '請先選擇 CSV 檔案'}
          </Text>
        )}
      </Pressable>
    </SettingsModalFrame>
  );
}

const styles = StyleSheet.create({
  errorBox: {
    padding: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sourceBox: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.5,
  },
  filePickerBtn: {
    borderRadius: HUD_RADIUS,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
  },
  filePickerTitle: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: MONO_FONT,
  },
  filePickerHint: {
    fontSize: 11,
    textAlign: 'center',
  },
  previewBox: {
    padding: 12,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    gap: 4,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  previewRow: {
    fontSize: 11,
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  modeSection: {
    gap: 8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeCard: {
    flex: 1,
    padding: 11,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    gap: 2,
  },
  modeTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  modeDesc: {
    fontSize: 11,
  },
  overwriteWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overwriteWarnText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  confirmBtn: {
    height: 46,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
});
