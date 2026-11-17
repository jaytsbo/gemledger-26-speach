import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FileJson, FileSpreadsheet } from 'lucide-react-native';
import { ApiService } from '@/services/apiService';
import { useLedgerStore } from '@/store/useLedgerStore';
import { useAppTheme } from '@/theme/ThemeContext';
import { SettingsModalFrame } from './SettingsModalFrame';
import { deliverExportFile, FeedbackState } from './settingsHelpers';

interface ExportBackupModalProps {
  visible: boolean;
  onClose: () => void;
  onFeedback: (fb: FeedbackState) => void;
}

export function ExportBackupModal({
  visible,
  onClose,
  onFeedback,
}: ExportBackupModalProps) {
  const { colors } = useAppTheme();
  const transactions = useLedgerStore((s) => s.transactions);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'json' | null>(null);

  const handleExport = async (format: 'csv' | 'json') => {
    console.log(
      `[Settings/ExportBackupModal] Export - format=${format}, count=${transactions.length}`,
    );
    setExportingFormat(format);
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        const csv = await ApiService.exportTransactionsCSV(transactions);
        const modeUsed = await deliverExportFile(
          csv,
          `gemledger-backup-${today}.csv`,
          'text/csv;charset=utf-8;',
        );
        onFeedback({
          type: 'success',
          message: `CSV 備份已${modeUsed === 'downloaded' ? '下載' : '開啟分享'}（${transactions.length} 筆）`,
        });
      } else {
        const json = await ApiService.exportTransactionsJSON(transactions);
        const modeUsed = await deliverExportFile(
          json,
          `gemledger-backup-${today}.json`,
          'application/json;charset=utf-8;',
        );
        onFeedback({
          type: 'success',
          message: `JSON 備份已${modeUsed === 'downloaded' ? '下載' : '開啟分享'}（${transactions.length} 筆）`,
        });
      }
      onClose();
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : '匯出備份失敗',
      });
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <SettingsModalFrame
      visible={visible}
      title="匯出備份"
      subtitle={`目前共有 ${transactions.length} 筆交易紀錄`}
      onClose={onClose}
      scrollable={false}
    >
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        選擇匯出格式。CSV 適合試算表檢視或重新匯入；JSON 保留完整欄位結構。
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={() => handleExport('csv')}
          disabled={exportingFormat !== null}
          style={[
            styles.optionCard,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              opacity: exportingFormat ? 0.7 : 1,
            },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.incomeBg }]}>
            {exportingFormat === 'csv' ? (
              <ActivityIndicator size="small" color={colors.income} />
            ) : (
              <FileSpreadsheet size={20} color={colors.income} />
            )}
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>
              匯出 CSV 備份
            </Text>
            <Text style={[styles.optionDesc, { color: colors.textMuted }]}>
              相容 Excel 與 Google Sheets（含 UTF-8 BOM）
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => handleExport('json')}
          disabled={exportingFormat !== null}
          style={[
            styles.optionCard,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              opacity: exportingFormat ? 0.7 : 1,
            },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.primaryLight }]}>
            {exportingFormat === 'json' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <FileJson size={20} color={colors.primary} />
            )}
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>
              匯出 JSON 備份
            </Text>
            <Text style={[styles.optionDesc, { color: colors.textMuted }]}>
              完整結構化備份檔案（.json）
            </Text>
          </View>
        </Pressable>
      </View>
    </SettingsModalFrame>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  optionDesc: {
    fontSize: 12,
  },
});
