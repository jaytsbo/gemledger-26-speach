import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FileJson, FileSpreadsheet } from 'lucide-react-native';
import { MONO_FONT } from '@/components/ui/HudReticle';
import { ApiService } from '@/services/apiService';
import { useLedgerStore } from '@/store/useLedgerStore';
import { HUD_RADIUS } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { SettingsModalFrame } from './SettingsModalFrame';
import { deliverExportFile, FeedbackState } from './settingsHelpers';

interface ExportBackupModalProps {
  visible: boolean;
  onClose: () => void;
  onFeedback: (fb: FeedbackState) => void;
}

function getLocalDateStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function ExportBackupModal({
  visible,
  onClose,
  onFeedback,
}: ExportBackupModalProps) {
  const { colors } = useAppTheme();
  const transactions = useLedgerStore((s) => s.transactions);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'json' | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const isExportingRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setInlineError(null);
      isExportingRef.current = false;
      setExportingFormat(null);
    }
  }, [visible]);

  const handleExport = async (format: 'csv' | 'json') => {
    if (isExportingRef.current) return;
    isExportingRef.current = true;
    setInlineError(null);
    console.log(
      `[Settings/ExportBackupModal] Export - format=${format}, count=${transactions.length}`,
    );
    setExportingFormat(format);
    try {
      const today = getLocalDateStr();
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
      const msg = err instanceof Error ? err.message : '匯出備份失敗';
      setInlineError(msg);
      onFeedback({
        type: 'error',
        message: msg,
      });
    } finally {
      isExportingRef.current = false;
      setExportingFormat(null);
    }
  };

  return (
    <SettingsModalFrame
      visible={visible}
      title="備份匯出"
      subtitle={`目前共有 ${transactions.length} 筆交易紀錄`}
      onClose={onClose}
      scrollable={false}
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
          <View
            style={[
              styles.iconBox,
              { backgroundColor: colors.incomeBg, borderColor: colors.income },
            ]}
          >
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
          <View
            style={[
              styles.formatBadge,
              { backgroundColor: colors.incomeBg, borderColor: colors.income },
            ]}
          >
            <Text style={[styles.formatBadgeText, { color: colors.income }]}>
              .CSV
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
          <View
            style={[
              styles.iconBox,
              { backgroundColor: colors.primaryBg, borderColor: colors.primary },
            ]}
          >
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
          <View
            style={[
              styles.formatBadge,
              { backgroundColor: colors.primaryBg, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.formatBadgeText, { color: colors.primary }]}>
              .JSON
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
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.3,
  },
  optionDesc: {
    fontSize: 12,
  },
  formatBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  formatBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  errorBox: {
    padding: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
