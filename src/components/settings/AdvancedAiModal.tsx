import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Wifi,
  WifiOff,
} from 'lucide-react-native';
import { HudReticle, MONO_FONT } from '@/components/ui/HudReticle';
import { ApiService } from '@/services/apiService';
import { useLedgerStore } from '@/store/useLedgerStore';
import { HUD_RADIUS } from '@/theme/colors';
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
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [inlineFeedback, setInlineFeedback] = useState<FeedbackState | null>(null);

  const loadSessionRef = useRef(0);
  const mutationSessionRef = useRef(0);
  const hasUserEditedRef = useRef(false);
  const isVisibleRef = useRef(visible);
  const isTestingRef = useRef(false);
  const isMutatingRef = useRef(false);
  const isOpeningLinkRef = useRef(false);
  const isToggling503Ref = useRef(false);
  const onApiKeyChangeRef = useRef(onApiKeyChange);
  onApiKeyChangeRef.current = onApiKeyChange;

  useEffect(() => {
    isVisibleRef.current = visible;
    loadSessionRef.current += 1;
    mutationSessionRef.current += 1;
    const sessionId = loadSessionRef.current;

    if (!visible) {
      hasUserEditedRef.current = false;
      isTestingRef.current = false;
      isMutatingRef.current = false;
      isToggling503Ref.current = false;
      setIsTesting(false);
      setIsSaving(false);
      setInlineFeedback(null);
      return;
    }

    hasUserEditedRef.current = false;
    setInlineFeedback(null);
    ApiService.getGeminiApiKey()
      .then((k) => {
        if (!isVisibleRef.current || loadSessionRef.current !== sessionId) return;
        console.log(`[Settings/AdvancedAiModal] LoadUserApiKey - hasKey=${Boolean(k)}`);
        setHasStoredKey(Boolean(k));
        onApiKeyChangeRef.current?.(Boolean(k));
        if (!hasUserEditedRef.current) {
          setApiKeyInput(k);
        }
      })
      .catch((err) => {
        if (!isVisibleRef.current || loadSessionRef.current !== sessionId) return;
        const msg = err instanceof Error ? err.message : '讀取 API Key 失敗';
        console.warn('[Settings/AdvancedAiModal] LoadUserApiKeyFailed -', msg);
        setInlineFeedback({ type: 'error', message: msg });
      });
  }, [visible]);

  const handleApiKeyInputChange = (nextText: string) => {
    hasUserEditedRef.current = true;
    setApiKeyInput(nextText);
    setInlineFeedback(null);
  };

  const handleTestConnection = async () => {
    if (isTestingRef.current || isMutatingRef.current) return;
    isTestingRef.current = true;
    setIsTesting(true);
    setInlineFeedback(null);
    const sessionId = loadSessionRef.current;
    console.log(
      `[Settings/AdvancedAiModal] TestConnection - InputLen=${apiKeyInput.trim().length}`,
    );

    try {
      const res = await ApiService.testGeminiApiKey(apiKeyInput);
      if (!isVisibleRef.current || loadSessionRef.current !== sessionId) return;
      console.log(
        `[Settings/AdvancedAiModal] TestConnectionResult - Ok:${res.ok}, Code:${res.code}, Status:${res.status ?? 'none'}`,
      );
      const fb: FeedbackState = {
        type: res.ok ? 'success' : 'error',
        message: res.message,
      };
      setInlineFeedback(fb);
      onFeedback(fb);
    } catch (err) {
      if (!isVisibleRef.current || loadSessionRef.current !== sessionId) return;
      const msg = err instanceof Error ? err.message : '測試連線失敗，請稍後再試';
      console.warn('[Settings/AdvancedAiModal] TestConnectionFailed -', msg);
      const fb: FeedbackState = { type: 'error', message: msg };
      setInlineFeedback(fb);
      onFeedback(fb);
    } finally {
      if (loadSessionRef.current === sessionId) {
        isTestingRef.current = false;
        setIsTesting(false);
      }
    }
  };

  const handleSaveApiKey = async () => {
    if (isMutatingRef.current || isTestingRef.current) return;
    isMutatingRef.current = true;
    setIsSaving(true);
    const myMutationId = ++mutationSessionRef.current;
    const clean = apiKeyInput.trim();
    console.log(`[Settings/AdvancedAiModal] SaveUserApiKey - hasKey=${Boolean(clean)}`);
    try {
      await ApiService.saveGeminiApiKey(clean);
      if (!isVisibleRef.current || mutationSessionRef.current !== myMutationId) return;
      loadSessionRef.current += 1;
      hasUserEditedRef.current = true;
      setApiKeyInput(clean);
      setHasStoredKey(Boolean(clean));
      onApiKeyChangeRef.current?.(Boolean(clean));
      const fb: FeedbackState = {
        type: 'success',
        message: clean
          ? '已安全儲存您的 Gemini API Key，將使用您自己的額度'
          : '已清除個人 API Key，將使用離線規則引擎',
      };
      setInlineFeedback(fb);
      onFeedback(fb);
    } catch (err) {
      if (!isVisibleRef.current || mutationSessionRef.current !== myMutationId) return;
      const msg = err instanceof Error ? err.message : '儲存 API Key 失敗';
      console.warn('[Settings/AdvancedAiModal] SaveUserApiKeyFailed -', msg);
      const fb: FeedbackState = { type: 'error', message: msg };
      setInlineFeedback(fb);
      onFeedback(fb);
    } finally {
      if (mutationSessionRef.current === myMutationId) {
        isMutatingRef.current = false;
        setIsSaving(false);
      }
    }
  };

  const handleClearApiKey = async () => {
    if (isMutatingRef.current || isTestingRef.current) return;
    isMutatingRef.current = true;
    setIsSaving(true);
    const myMutationId = ++mutationSessionRef.current;
    console.log('[Settings/AdvancedAiModal] ClearUserApiKey - Clearing via ApiService');
    try {
      await ApiService.clearGeminiApiKey();
      if (!isVisibleRef.current || mutationSessionRef.current !== myMutationId) return;
      loadSessionRef.current += 1;
      hasUserEditedRef.current = true;
      setApiKeyInput('');
      setHasStoredKey(false);
      onApiKeyChangeRef.current?.(false);
      const fb: FeedbackState = { type: 'success', message: '已清除個人 Gemini API Key' };
      setInlineFeedback(fb);
      onFeedback(fb);
    } catch (err) {
      if (!isVisibleRef.current || mutationSessionRef.current !== myMutationId) return;
      const msg = err instanceof Error ? err.message : '清除 API Key 失敗';
      console.warn('[Settings/AdvancedAiModal] ClearUserApiKeyFailed -', msg);
      const fb: FeedbackState = { type: 'error', message: msg };
      setInlineFeedback(fb);
      onFeedback(fb);
    } finally {
      if (mutationSessionRef.current === myMutationId) {
        isMutatingRef.current = false;
        setIsSaving(false);
      }
    }
  };

  const handleOpenKeyPortal = async () => {
    if (isOpeningLinkRef.current) return;
    isOpeningLinkRef.current = true;
    try {
      await Linking.openURL('https://aistudio.google.com/apikey');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '無法開啟外部連結，請手動前往 aistudio.google.com/apikey';
      console.warn('[Settings/AdvancedAiModal] OpenKeyPortalFailed -', msg);
      const fb: FeedbackState = { type: 'error', message: msg };
      if (isVisibleRef.current) {
        setInlineFeedback(fb);
      }
      onFeedback(fb);
    } finally {
      isOpeningLinkRef.current = false;
    }
  };

  const handleToggle503 = async (nextVal: boolean) => {
    if (isToggling503Ref.current) return;
    isToggling503Ref.current = true;
    console.log(`[Settings/AdvancedAiModal] ToggleSimulate503 - next=${nextVal}`);
    try {
      await updateSettings({ simulate503: nextVal });
      const fb: FeedbackState = {
        type: 'success',
        message: nextVal
          ? '已開啟 503 離線模擬：AI 記帳將強制使用本地規則引擎'
          : '已關閉 503 離線模擬',
      };
      if (isVisibleRef.current) {
        setInlineFeedback(fb);
      }
      onFeedback(fb);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '更新開關失敗';
      const fb: FeedbackState = { type: 'error', message: msg };
      if (isVisibleRef.current) {
        setInlineFeedback(fb);
      }
      onFeedback(fb);
    } finally {
      isToggling503Ref.current = false;
    }
  };

  const isBusy = isTesting || isSaving;

  const statusText = settings.simulate503
    ? '已開啟 503 離線模擬（強制本地規則引擎）'
    : hasStoredKey
      ? '已啟用您的個人 Gemini API Key（直連 Google，不經第三方）'
      : '目前使用內建離線規則引擎（可貼上個人免費 Gemini Key 升級 AI）';

  const statusBadgeText = settings.simulate503
    ? '503 模擬中'
    : hasStoredKey
      ? '金鑰已就緒'
      : '離線引擎';

  const statusBadgeColor = settings.simulate503
    ? colors.warning
    : hasStoredKey
      ? colors.income
      : colors.accent;

  return (
    <SettingsModalFrame
      visible={visible}
      title="進階 AI 設定"
      subtitle={`目前狀態：${statusBadgeText}`}
      accentVariant="accent"
      onClose={onClose}
    >
      {/* User BYOK Gemini API Key */}
      <View
        style={[
          styles.apiKeyBox,
          {
            backgroundColor: hasStoredKey ? colors.incomeBg : colors.accentBg,
            borderColor: hasStoredKey ? colors.income : colors.accent,
          },
        ]}
      >
        <HudReticle variant="accent" size={7} inset={1} />
        <View style={styles.apiKeyHeader}>
          <View style={styles.apiKeyTitleWrap}>
            <KeyRound size={16} color={hasStoredKey ? colors.income : colors.accent} />
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              個人 Gemini API Key
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: colors.surface,
                borderColor: statusBadgeColor,
              },
            ]}
          >
            <Text style={[styles.statusBadgeText, { color: statusBadgeColor }]}>
              {statusBadgeText}
            </Text>
          </View>
        </View>
        <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>
          {statusText}
        </Text>
        <TextInput
          value={apiKeyInput}
          onChangeText={handleApiKeyInputChange}
          editable={!isBusy}
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
        {inlineFeedback ? (
          <View
            style={[
              styles.inlineFeedback,
              {
                backgroundColor:
                  inlineFeedback.type === 'success' ? colors.incomeBg : colors.expenseBg,
                borderColor:
                  inlineFeedback.type === 'success' ? colors.income : colors.expense,
              },
            ]}
          >
            {inlineFeedback.type === 'success' ? (
              <CheckCircle2 size={15} color={colors.income} />
            ) : (
              <AlertTriangle size={15} color={colors.expense} />
            )}
            <Text
              style={[
                styles.inlineFeedbackText,
                {
                  color:
                    inlineFeedback.type === 'success' ? colors.income : colors.expense,
                },
              ]}
            >
              {inlineFeedback.message}
            </Text>
          </View>
        ) : null}
        <View style={styles.apiKeyActions}>
          <Pressable
            onPress={handleOpenKeyPortal}
            style={[
              styles.actionBtn,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.accent,
              },
            ]}
          >
            <ExternalLink size={13} color={colors.accent} />
            <Text style={[styles.actionBtnText, { color: colors.accent }]}>
              免費取得 Key
            </Text>
          </Pressable>
          <Pressable
            disabled={isBusy}
            onPress={handleTestConnection}
            style={[
              styles.actionBtn,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.accent,
                opacity: isBusy ? 0.6 : 1,
              },
            ]}
          >
            {isTesting ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Wifi size={13} color={colors.accent} />
            )}
            <Text style={[styles.actionBtnText, { color: colors.accent }]}>
              {isTesting ? '測試中...' : '測試連線'}
            </Text>
          </Pressable>
          {hasStoredKey ? (
            <Pressable
              disabled={isBusy}
              onPress={handleClearApiKey}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: colors.expenseBg,
                  borderColor: colors.expense,
                  opacity: isBusy ? 0.6 : 1,
                },
              ]}
            >
              <Text style={[styles.actionBtnText, { color: colors.expense }]}>
                清除 Key
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            disabled={isBusy}
            onPress={handleSaveApiKey}
            style={[
              styles.actionBtn,
              {
                backgroundColor: colors.accent,
                borderColor: colors.accent,
                opacity: isBusy ? 0.6 : 1,
              },
            ]}
          >
            <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
              {isSaving ? '儲存中...' : '儲存 Key'}
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
            borderColor: settings.simulate503 ? colors.warning : colors.border,
          },
        ]}
      >
        <View style={styles.switchLeft}>
          <View
            style={[
              styles.switchIconBox,
              { backgroundColor: colors.warningBg, borderColor: colors.warning },
            ]}
          >
            <WifiOff size={16} color={colors.warning} />
          </View>
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
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor="#FFFFFF"
        />
      </View>
    </SettingsModalFrame>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  switchLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchIconBox: {
    width: 34,
    height: 34,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTextWrap: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.3,
  },
  rowDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  apiKeyBox: {
    position: 'relative',
    padding: 14,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    gap: 10,
  },
  apiKeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  apiKeyTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  input: {
    height: 42,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: MONO_FONT,
  },
  apiKeyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: MONO_FONT,
  },
  inlineFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  inlineFeedbackText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
});
