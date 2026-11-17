import React, { useEffect, useState } from 'react';
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
import { useLedgerStore } from '@/store/useLedgerStore';
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

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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
    const buf = await res.arrayBuffer();
    return decodeCsvBytes(new Uint8Array(buf));
  }

  try {
    const b64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return decodeCsvBytes(base64ToBytes(b64));
  } catch {
    return FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
}

export function ImportDataModal({
  visible,
  onClose,
  onFeedback,
}: ImportDataModalProps) {
  const { colors } = useAppTheme();
  const importTransactions = useLedgerStore((s) => s.importTransactions);

  const [importMode, setImportMode] = useState<ImportMode>('overwrite');
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<TransactionDraft[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setImportMode('overwrite');
      setInlineError(null);
      setParsedItems([]);
      setPickedFileName(null);
      setIsParsing(false);
      setIsImporting(false);
    }
  }, [visible]);

  const handlePickCsv = async () => {
    setInlineError(null);
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
      setIsParsing(true);
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
      setIsParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedItems.length === 0) return;
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
      setIsImporting(false);
    }
  };

  return (
    <SettingsModalFrame
      visible={visible}
      title="匯入 CSV 資料"
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
          disabled={isParsing}
          style={[
            styles.filePickerBtn,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.primary,
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
        <Text style={[styles.fieldLabel, { color: colors.text }]}>匯入模式</Text>
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => setImportMode('append')}
            style={[
              styles.modeCard,
              {
                backgroundColor:
                  importMode === 'append' ? colors.primaryLight : colors.surfaceElevated,
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
        disabled={parsedItems.length === 0 || isImporting}
        style={[
          styles.confirmBtn,
          {
            backgroundColor:
              importMode === 'overwrite' ? colors.danger : colors.primary,
            opacity: parsedItems.length === 0 || isImporting ? 0.5 : 1,
          },
        ]}
      >
        {isImporting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.confirmBtnText}>
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
    borderRadius: 12,
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
    fontSize: 13,
    fontWeight: '800',
  },
  filePickerBtn: {
    borderRadius: 16,
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
  },
  filePickerHint: {
    fontSize: 11,
    textAlign: 'center',
  },
  previewBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  previewRow: {
    fontSize: 12,
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
    borderRadius: 12,
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
