import React, { useCallback, useEffect, useState } from 'react';
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
import { loadUserGeminiApiKey } from '@/services/geminiDirectService';
import { useLedgerStore } from '@/store/useLedgerStore';
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
  label: string;
  value?: string;
  danger?: boolean;
  isLast?: boolean;
  onPress: () => void;
}

function SettingRow({
  icon,
  iconBg,
  label,
  value,
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
        pressed && { opacity: 0.72 },
      ]}
    >
      <View style={[styles.rowIconBox, { backgroundColor: iconBg }]}>{icon}</View>
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
        <Text style={[styles.rowValue, { color: colors.textMuted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <ChevronRight size={17} color={danger ? colors.danger : colors.textMuted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colors, isDark } = useAppTheme();
  const settings = useLedgerStore((s) => s.settings);
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [hasUserApiKey, setHasUserApiKey] = useState(false);

  const showFeedback = useCallback((fb: FeedbackState) => {
    setFeedback(fb);
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4500);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const userKey = await loadUserGeminiApiKey();
      if (mounted) {
        setHasUserApiKey(Boolean(userKey));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const aiStatusLabel = settings.simulate503
    ? '503 離線模擬'
    : hasUserApiKey
      ? '個人 API Key 已就緒'
      : '離線規則引擎';

  const cardSurfaceStyle = {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    shadowColor: colors.shadow,
    shadowOpacity: isDark ? 0.32 : 0.07,
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header matching wallet.tsx */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>系統設定</Text>
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
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
            帳務設定
          </Text>
          <View style={[styles.groupCard, cardSurfaceStyle]}>
            <SettingRow
              icon={<Coins size={18} color={colors.primary} />}
              iconBg={colors.primaryLight}
              label="預設本位幣別與匯率"
              value={baseCurrency}
              onPress={() => setActiveModal('currency')}
            />
            <SettingRow
              icon={<Wallet size={18} color="#0EA5E9" />}
              iconBg="rgba(14, 165, 233, 0.14)"
              label="管理帳戶"
              value={`${settings.accounts.length} 個帳戶`}
              onPress={() => setActiveModal('accounts')}
            />
            <SettingRow
              icon={<FolderKanban size={18} color="#8B5CF6" />}
              iconBg="rgba(139, 92, 246, 0.14)"
              label="管理分類"
              value={`${settings.categories.length} 個分類`}
              isLast
              onPress={() => setActiveModal('categories')}
            />
          </View>
        </View>

        {/* Group 2: 資料與進階 */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
            資料與進階
          </Text>
          <View style={[styles.groupCard, cardSurfaceStyle]}>
            <SettingRow
              icon={<Upload size={18} color={colors.income} />}
              iconBg={colors.incomeBg}
              label="匯入 CSV 資料"
              onPress={() => setActiveModal('import')}
            />
            <SettingRow
              icon={<Download size={18} color={colors.primary} />}
              iconBg={colors.primaryLight}
              label="匯出備份（CSV / JSON）"
              onPress={() => setActiveModal('export')}
            />
            <SettingRow
              icon={<Bot size={18} color={colors.warning} />}
              iconBg={colors.warningBg}
              label="AI 與開發者設定"
              value={aiStatusLabel}
              onPress={() => setActiveModal('ai')}
            />
            <SettingRow
              icon={<RotateCcw size={18} color={colors.danger} />}
              iconBg={colors.expenseBg}
              label="重置為預設測試資料"
              danger
              isLast
              onPress={() => setActiveModal('reset')}
            />
          </View>
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
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
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
    paddingHorizontal: 4,
    letterSpacing: 0.4,
  },
  groupCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
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
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  rowValue: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120,
  },
});
