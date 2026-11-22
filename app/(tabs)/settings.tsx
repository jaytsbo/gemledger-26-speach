import React, { useCallback, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Coins,
  Download,
  FolderKanban,
  RotateCcw,
  Upload,
  Wallet,
  X,
} from 'lucide-react-native';
import { AccountManagerModal } from '@/components/settings/AccountManagerModal';
import { AdvancedAiModal } from '@/components/settings/AdvancedAiModal';
import { CategoryManagerModal } from '@/components/settings/CategoryManagerModal';
import { ConfirmResetModal } from '@/components/settings/ConfirmResetModal';
import { CurrencyFxModal } from '@/components/settings/CurrencyFxModal';
import { ExportBackupModal } from '@/components/settings/ExportBackupModal';
import { ImportDataModal } from '@/components/settings/ImportDataModal';
import { FeedbackState } from '@/components/settings/settingsHelpers';
import { CyberNeuralBackground } from '@/components/ui/CyberNeuralBackground';
import { HudCard, MONO_FONT } from '@/components/ui/HudReticle';
import { ApiService } from '@/services/apiService';
import { useLedgerStore } from '@/store/useLedgerStore';
import { HUD_RADIUS } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';

type ActiveModal =
  | 'currency'
  | 'accounts'
  | 'categories'
  | 'import'
  | 'export'
  | 'ai'
  | 'reset'
  | null;

interface SettingRowProps {
  icon: React.ReactNode;
  iconBg: string;
  iconBorderColor: string;
  label: string;
  value?: string;
  valueColor?: string;
  valueBg?: string;
  valueBorderColor?: string;
  danger?: boolean;
  isLast?: boolean;
  onPress: () => void;
}

function SettingRow({
  icon,
  iconBg,
  iconBorderColor,
  label,
  value,
  valueColor,
  valueBg,
  valueBorderColor,
  danger,
  isLast,
  onPress,
}: SettingRowProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.rowItem,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.divider },
        pressed && { opacity: 0.72, backgroundColor: colors.surfaceElevated },
      ]}
    >
      <View
        style={[
          styles.rowIconBox,
          { backgroundColor: iconBg, borderColor: iconBorderColor },
        ]}
      >
        {icon}
      </View>
      <Text
        style={[
          styles.rowLabel,
          { color: danger ? colors.danger : colors.text },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {value ? (
        <View
          style={[
            styles.valueBadge,
            {
              backgroundColor: valueBg ?? colors.surfaceElevated,
              borderColor: valueBorderColor ?? colors.border,
            },
          ]}
        >
          <Text
            style={[styles.rowValue, { color: valueColor ?? colors.textSecondary }]}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      ) : null}
      <ChevronRight size={16} color={danger ? colors.danger : colors.textMuted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colors } = useAppTheme();
  const settings = useLedgerStore((s) => s.settings);
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [hasUserApiKey, setHasUserApiKey] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '2.0.4';

  const showFeedback = useCallback((fb: FeedbackState) => {
    setFeedback(fb);
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4500);
    return () => clearTimeout(timer);
  }, [feedback]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const userKey = await ApiService.getGeminiApiKey();
          console.log(`[Settings/SettingsScreen] FocusSyncUserApiKey - hasKey=${Boolean(userKey)}`);
          if (active) {
            setHasUserApiKey(Boolean(userKey));
          }
        } catch (err) {
          console.warn('[Settings/SettingsScreen] FocusSyncUserApiKeyFailed -', err);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const aiStatusLabel = settings.simulate503
    ? '503 離線模擬'
    : hasUserApiKey
      ? '個人金鑰已就緒'
      : '離線規則引擎';

  const aiStatusColor = settings.simulate503
    ? colors.warning
    : hasUserApiKey
      ? colors.income
      : colors.accent;

  const aiStatusBg = settings.simulate503
    ? colors.warningBg
    : hasUserApiKey
      ? colors.incomeBg
      : colors.accentBg;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <CyberNeuralBackground />
      <ScrollView
        style={styles.transparentBg}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <View style={[styles.titleAccent, { backgroundColor: colors.primary }]} />
            <Text style={[styles.pageTitle, { color: colors.text }]}>系統設定</Text>
          </View>
          <View
            style={[
              styles.versionBadge,
              {
                backgroundColor: colors.primaryBg,
                borderColor: colors.primary,
              },
            ]}
          >
            <Text style={[styles.versionText, { color: colors.primary }]}>
              v{appVersion}
            </Text>
          </View>
        </View>

        {/* Feedback Banner */}
        {feedback ? (
          <View
            style={[
              styles.feedbackBanner,
              {
                backgroundColor:
                  feedback.type === 'success' ? colors.incomeBg : colors.expenseBg,
                borderColor:
                  feedback.type === 'success' ? colors.income : colors.expense,
              },
            ]}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 size={16} color={colors.income} />
            ) : (
              <AlertTriangle size={16} color={colors.expense} />
            )}
            <Text
              style={[
                styles.feedbackText,
                {
                  color:
                    feedback.type === 'success' ? colors.income : colors.expense,
                },
              ]}
            >
              {feedback.message}
            </Text>
            <Pressable onPress={() => setFeedback(null)} hitSlop={8}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {/* Group 1: 帳務設定 */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeader, { color: colors.primary }]}>
            帳務設定
          </Text>
          <HudCard variant="primary" style={styles.groupCard}>
            <View style={styles.groupInner}>
              <SettingRow
                icon={<Coins size={17} color={colors.primary} />}
                iconBg={colors.primaryBg}
                iconBorderColor={colors.primary}
                label="預設本位幣別與匯率"
                value={baseCurrency}
                valueColor={colors.primary}
                valueBg={colors.primaryBg}
                valueBorderColor={colors.primary}
                onPress={() => setActiveModal('currency')}
              />
              <SettingRow
                icon={<Wallet size={17} color={colors.primary} />}
                iconBg={colors.primaryBg}
                iconBorderColor={colors.border}
                label="帳戶管理"
                value={`${settings.accounts.length} 個帳戶`}
                onPress={() => setActiveModal('accounts')}
              />
              <SettingRow
                icon={<FolderKanban size={17} color={colors.accent} />}
                iconBg={colors.accentBg}
                iconBorderColor={colors.border}
                label="分類管理"
                value={`${settings.categories.length} 個分類`}
                isLast
                onPress={() => setActiveModal('categories')}
              />
            </View>
          </HudCard>
        </View>

        {/* Group 2: 進階 AI 設定 (Nebula Violet) */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeader, { color: colors.accent }]}>
            進階 AI 設定
          </Text>
          <HudCard variant="accent" glow style={styles.groupCard}>
            <View style={styles.groupInner}>
              <SettingRow
                icon={<Bot size={17} color={colors.accent} />}
                iconBg={colors.accentBg}
                iconBorderColor={colors.accent}
                label="AI 與開發者設定"
                value={aiStatusLabel}
                valueColor={aiStatusColor}
                valueBg={aiStatusBg}
                valueBorderColor={aiStatusColor}
                isLast
                onPress={() => setActiveModal('ai')}
              />
            </View>
          </HudCard>
        </View>

        {/* Group 3: 資料與備份 */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeader, { color: colors.primary }]}>
            資料與備份
          </Text>
          <HudCard variant="primary" style={styles.groupCard}>
            <View style={styles.groupInner}>
              <SettingRow
                icon={<Upload size={17} color={colors.income} />}
                iconBg={colors.incomeBg}
                iconBorderColor={colors.income}
                label="匯入 CSV 資料"
                onPress={() => setActiveModal('import')}
              />
              <SettingRow
                icon={<Download size={17} color={colors.primary} />}
                iconBg={colors.primaryBg}
                iconBorderColor={colors.primary}
                label="匯出備份（CSV / JSON）"
                onPress={() => setActiveModal('export')}
              />
              <SettingRow
                icon={<RotateCcw size={17} color={colors.danger} />}
                iconBg={colors.expenseBg}
                iconBorderColor={colors.danger}
                label="重置為預設測試資料"
                danger
                isLast
                onPress={() => setActiveModal('reset')}
              />
            </View>
          </HudCard>
        </View>

        {/* Footer System Status */}
        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            本地優先架構 · 版本 v{appVersion}
          </Text>
        </View>
      </ScrollView>

      {/* Single-layer Modals */}
      <CurrencyFxModal
        visible={activeModal === 'currency'}
        onClose={() => setActiveModal(null)}
        onFeedback={showFeedback}
      />
      <AccountManagerModal
        visible={activeModal === 'accounts'}
        onClose={() => setActiveModal(null)}
        onFeedback={showFeedback}
      />
      <CategoryManagerModal
        visible={activeModal === 'categories'}
        onClose={() => setActiveModal(null)}
        onFeedback={showFeedback}
      />
      <ImportDataModal
        visible={activeModal === 'import'}
        onClose={() => setActiveModal(null)}
        onFeedback={showFeedback}
      />
      <ExportBackupModal
        visible={activeModal === 'export'}
        onClose={() => setActiveModal(null)}
        onFeedback={showFeedback}
      />
      <AdvancedAiModal
        visible={activeModal === 'ai'}
        onClose={() => setActiveModal(null)}
        onFeedback={showFeedback}
        onApiKeyChange={setHasUserApiKey}
      />
      <ConfirmResetModal
        visible={activeModal === 'reset'}
        onClose={() => setActiveModal(null)}
        onFeedback={showFeedback}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  transparentBg: {
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 118,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleAccent: {
    width: 4,
    height: 22,
    borderRadius: 2,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.6,
  },
  versionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  feedbackText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 2,
    letterSpacing: 0.6,
    fontFamily: MONO_FONT,
  },
  groupCard: {
    padding: 0,
  },
  groupInner: {
    borderRadius: HUD_RADIUS,
    overflow: 'hidden',
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowIconBox: {
    width: 34,
    height: 34,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  valueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 136,
  },
  rowValue: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
  },
  footerRow: {
    alignItems: 'center',
    paddingTop: 4,
  },
  footerText: {
    fontSize: 11,
    fontFamily: MONO_FONT,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
});
