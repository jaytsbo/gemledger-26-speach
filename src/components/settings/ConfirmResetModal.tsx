import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { MONO_FONT } from '@/components/ui/HudReticle';
import { useLedgerStore } from '@/store/useLedgerStore';
import { HUD_RADIUS } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { SettingsModalFrame } from './SettingsModalFrame';
import { FeedbackState } from './settingsHelpers';

interface ConfirmResetModalProps {
  visible: boolean;
  onClose: () => void;
  onFeedback: (fb: FeedbackState) => void;
}

export function ConfirmResetModal({
  visible,
  onClose,
  onFeedback,
}: ConfirmResetModalProps) {
  const { colors } = useAppTheme();
  const resetToSeedData = useLedgerStore((s) => s.resetToSeedData);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const isBusyRef = useRef(false);

  useEffect(() => {
    setConfirmText('');
    setInlineError(null);
    if (!visible) {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  }, [visible]);

  const normalizedConfirm = confirmText.trim();
  const isConfirmed =
    normalizedConfirm.toUpperCase() === 'RESET' || normalizedConfirm === '重置';

  const handleConfirmReset = async () => {
    if (!isConfirmed || isBusyRef.current || isBusy) return;
    isBusyRef.current = true;
    setInlineError(null);
    console.log('[Settings/ConfirmResetModal] Reset - Resetting to default seed data');
    setIsBusy(true);
    try {
      const res = await resetToSeedData();
      onFeedback({
        type: 'success',
        message: `已重置為預設範例資料（共 ${res.count ?? 0} 筆交易）`,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '重置失敗';
      setInlineError(msg);
      onFeedback({
        type: 'error',
        message: msg,
      });
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  return (
    <SettingsModalFrame
      visible={visible}
      title="重置預設資料"
      subtitle="高風險操作 · 執行後無法復原"
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

      <View
        style={[
          styles.warningBox,
          {
            backgroundColor: colors.expenseBg,
            borderColor: colors.expense,
          },
        ]}
      >
        <AlertTriangle size={22} color={colors.expense} />
        <Text style={[styles.warningText, { color: colors.text }]}>
          此操作將清空目前所有本地交易紀錄、自訂帳戶與分類設定，並還原為系統內建的初始範例資料。建議先匯出備份再執行。
        </Text>
      </View>

      <View style={styles.confirmGroup}>
        <Text style={[styles.confirmPrompt, { color: colors.textSecondary }]}>
          為防止誤觸，請輸入「重置」或「RESET」以解鎖按鈕
        </Text>
        <TextInput
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder="輸入 重置 或 RESET"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isBusy}
          style={[
            styles.confirmInput,
            {
              backgroundColor: colors.inputBg,
              borderColor: isConfirmed ? colors.danger : colors.border,
              color: colors.text,
            },
          ]}
        />
      </View>

      <View style={styles.btnRow}>
        <Pressable
          onPress={onClose}
          disabled={isBusy}
          style={[
            styles.btn,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.btnText, { color: colors.text }]}>取消</Text>
        </Pressable>
        <Pressable
          onPress={handleConfirmReset}
          disabled={!isConfirmed || isBusy}
          style={[
            styles.btn,
            {
              backgroundColor: colors.danger,
              borderColor: colors.danger,
              opacity: !isConfirmed ? 0.45 : isBusy ? 0.7 : 1,
            },
          ]}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.btnText, { color: '#FFFFFF' }]}>確認重置</Text>
          )}
        </Pressable>
      </View>
    </SettingsModalFrame>
  );
}

const styles = StyleSheet.create({
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  confirmGroup: {
    gap: 8,
  },
  confirmPrompt: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  confirmInput: {
    height: 42,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: MONO_FONT,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.4,
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
