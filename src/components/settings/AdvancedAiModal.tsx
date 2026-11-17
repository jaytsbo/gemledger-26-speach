import React, { useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ExternalLink, KeyRound, WifiOff } from 'lucide-react-native';
import { ApiService } from '@/services/apiService';
import { useLedgerStore } from '@/store/useLedgerStore';
import { useAppTheme } from '@/theme/ThemeContext';
import { SettingsModalFrame } from './SettingsModalFrame';
import { FeedbackState } from './settingsHelpers';

interface AdvancedAiModalProps {
  visible: boolean;
  onClose: () => void;
  onFeedback: (fb: FeedbackState) => void;
  onApiKeyChange?: (hasKey: boolean) => void;
}

export function AdvancedAiModal({
  visible,
  onClose,
  onFeedback,
  onApiKeyChange,
}: AdvancedAiModalProps) {
  const { colors } = useAppTheme();
  const settings = useLedgerStore((s) => s.settings);
  const updateSettings = useLedgerStore((s) => s.updateSettings);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);

  useEffect(() => {
    if (!visible) return;
    ApiService.getGeminiApiKey()
      .then((k) => {
        console.log(`[Settings/AdvancedAiModal] LoadUserApiKey - hasKey=${Boolean(k)}`);
        setHasStoredKey(Boolean(k));
        setApiKeyInput(k);
      })
      .catch((err) => {
        console.warn('[Settings/AdvancedAiModal] LoadUserApiKeyFailed -', err);
      });
  }, [visible]);

  const handleSaveApiKey = async () => {
    const clean = apiKeyInput.trim();
    console.log(`[Settings/AdvancedAiModal] SaveUserApiKey - hasKey=${Boolean(clean)}`);
    try {
      await ApiService.saveGeminiApiKey(clean);
      setHasStoredKey(Boolean(clean));
      onApiKeyChange?.(Boolean(clean));
      onFeedback({
        type: 'success',
        message: clean
          ? '已安全儲存您的 Gemini API Key，將使用您自己的額度'
          : '已清除個人 API Key，將使用離線規則引擎',
      });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : '儲存 API Key 失敗',
      });
    }
  };

  const handleClearApiKey = async () => {
    console.log('[Settings/AdvancedAiModal] ClearUserApiKey - Clearing via ApiService');
    try {
      await ApiService.clearGeminiApiKey();
      setApiKeyInput('');
      setHasStoredKey(false);
      onApiKeyChange?.(false);
      onFeedback({ type: 'success', message: '已清除個人 Gemini API Key' });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : '清除 API Key 失敗',
      });
    }
  };

  const handleToggle503 = async (nextVal: boolean) => {
    console.log(`[Settings/AdvancedAiModal] ToggleSimulate503 - next=${nextVal}`);
    try {
      await updateSettings({ simulate503: nextVal });
      onFeedback({
        type: 'success',
        message: nextVal
          ? '已開啟 503 離線模擬：AI 記帳將強制使用本地規則引擎'
          : '已關閉 503 離線模擬',
      });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : '更新開關失敗',
      });
    }
  };

  const statusText = settings.simulate503
    ? '已開啟 503 離線模擬（強制本地規則引擎）'
    : hasStoredKey
      ? '已啟用您的個人 Gemini API Key（直連 Google，不經第三方）'
      : '目前使用內建離線規則引擎（可貼上個人免費 Gemini Key 升級 AI）';

  return (
    <SettingsModalFrame
      visible={visible}
      title="AI 與開發者設定"
      onClose={onClose}
    >
      {/* User BYOK Gemini API Key */}
      <View
        style={[
          styles.proxyBox,
          {
            backgroundColor: hasStoredKey ? colors.incomeBg : colors.surfaceElevated,
            borderColor: hasStoredKey ? colors.income : colors.border,
          },
        ]}
      >
        <View style={styles.proxyHeader}>
          <KeyRound size={16} color={hasStoredKey ? colors.income : colors.primary} />
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            個人 Gemini API Key（自帶額度）
          </Text>
        </View>
        <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>
          {statusText}
        </Text>
        <TextInput
          value={apiKeyInput}
          onChangeText={setApiKeyInput}
          placeholder="AIzaSy..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
        />
        <View style={styles.proxyActions}>
          <Pressable
            onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}
            style={[
              styles.actionBtn,
              { backgroundColor: colors.chipBg, borderColor: colors.border },
            ]}
          >
            <ExternalLink size={13} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>
              免費取得 Key
            </Text>
          </Pressable>
          {hasStoredKey ? (
            <Pressable
              onPress={handleClearApiKey}
              style={[
                styles.actionBtn,
                { backgroundColor: colors.chipBg, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.actionBtnText, { color: colors.expense }]}>
                清除 Key
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleSaveApiKey}
            style={[
              styles.actionBtn,
              { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
              儲存 Key
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Simulate 503 switch */}
      <View
        style={[
          styles.switchRow,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.switchLeft}>
          <WifiOff size={18} color={colors.warning} />
          <View style={styles.switchTextWrap}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              503 離線模擬
            </Text>
            <Text style={[styles.rowDesc, { color: colors.textMuted }]}>
              強制 AI 記帳改用本地關鍵字規則引擎測試
            </Text>
          </View>
        </View>
        <Switch
          value={Boolean(settings.simulate503)}
          onValueChange={handleToggle503}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>
    </SettingsModalFrame>
  );
}

const styles = StyleSheet.create({
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  infoTextWrap: {
    flex: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  infoDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  infoSub: {
    fontSize: 11,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  switchLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchTextWrap: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  rowDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  proxyBox: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  proxyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  proxyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
