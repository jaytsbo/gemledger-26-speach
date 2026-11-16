import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Coins,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  FolderKanban,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Smartphone,
  Sun,
  Trash2,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react-native';
import { ApiService } from '../../src/services/apiService';
import { useLedgerStore } from '../../src/store/useLedgerStore';
import { getAccountMeta, getCategoryMeta, ThemeMode } from '../../src/theme/colors';
import { useAppTheme } from '../../src/theme/ThemeContext';
import { CurrencyCode, SUPPORTED_CURRENCIES } from '../../src/types/ledger';
import {
  convertCurrency,
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
} from '../../src/utils/currency';

type ConfirmActionState =
  | {
      kind: 'deleteAccount';
      target: string;
      linkedCount: number;
    }
  | {
      kind: 'deleteCategory';
      target: string;
      linkedCount: number;
    }
  | {
      kind: 'resetSeed';
    }
  | null;

interface FeedbackBanner {
  type: 'success' | 'error';
  message: string;
}

function formatFxTimestamp(raw?: string): string {
  if (!raw) return '尚未同步';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

async function deliverExportFile(
  content: string,
  filename: string,
  mimeType: string,
): Promise<'downloaded' | 'shared'> {
  if (Platform.OS === 'web') {
    const g = globalThis as any;
    if (g?.document && g?.Blob && g?.URL?.createObjectURL) {
      const blob = new g.Blob([content], { type: mimeType });
      const url = g.URL.createObjectURL(blob);
      const anchor = g.document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      g.document.body.appendChild(anchor);
      anchor.click();
      g.document.body.removeChild(anchor);
      setTimeout(() => g.URL.revokeObjectURL(url), 1000);
      return 'downloaded';
    }
  }

  await Share.share({
    title: filename,
    message: content,
  });
  return 'shared';
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { mode, setMode, colors } = useAppTheme();

  const transactions = useLedgerStore((s) => s.transactions);
  const settings = useLedgerStore((s) => s.settings);
  const exchangeRates = useLedgerStore((s) => s.exchangeRates);
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);
  const isSyncingFX = useLedgerStore((s) => s.isSyncingFX);

  const setBaseCurrency = useLedgerStore((s) => s.setBaseCurrency);
  const syncExchangeRates = useLedgerStore((s) => s.syncExchangeRates);
  const addAccount = useLedgerStore((s) => s.addAccount);
  const removeAccountCascade = useLedgerStore((s) => s.removeAccountCascade);
  const addCategory = useLedgerStore((s) => s.addCategory);
  const removeCategoryCascade = useLedgerStore((s) => s.removeCategoryCascade);
  const updateSettings = useLedgerStore((s) => s.updateSettings);
  const resetToSeedData = useLedgerStore((s) => s.resetToSeedData);

  const [newAccountInput, setNewAccountInput] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [proxyUrlInput, setProxyUrlInput] = useState(settings.aiProxyUrl || '');
  const [confirmState, setConfirmState] = useState<ConfirmActionState>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);

  useEffect(() => {
    setProxyUrlInput(settings.aiProxyUrl || '');
  }, [settings.aiProxyUrl]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
  };

  const accountCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of transactions) {
      const key = (tx.account || '').trim();
      if (key) map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [transactions]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of transactions) {
      const key = (tx.category || '').trim();
      if (key) map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [transactions]);

  const fxPreviewList = useMemo(() => {
    const targets: CurrencyCode[] = (['USD', 'JPY', 'EUR'] as CurrencyCode[]).filter(
      (c) => c !== baseCurrency,
    );
    return targets.slice(0, 3).map((cur) => {
      const rate = convertCurrency(1, cur, baseCurrency, exchangeRates);
      return `1 ${cur} ≈ ${rate >= 10 ? rate.toFixed(2) : rate.toFixed(3)} ${baseCurrency}`;
    });
  }, [baseCurrency, exchangeRates]);

  const handleThemeSelect = async (nextMode: ThemeMode) => {
    console.log(`[SettingsScreen/handleThemeSelect] Mode - ${nextMode}`);
    setMode(nextMode);
    try {
      await updateSettings({ themeMode: nextMode });
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '主題儲存失敗');
    }
  };

  const handleSelectBaseCurrency = async (cur: CurrencyCode) => {
    console.log(`[SettingsScreen/handleSelectBaseCurrency] Base - ${cur}`);
    try {
      await setBaseCurrency(cur);
      showFeedback('success', `已將預設本位幣切換為 ${cur}（${CURRENCY_LABELS[cur]}）`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '切換幣別失敗');
    }
  };

  const handleSyncFX = async () => {
    console.log('[SettingsScreen/handleSyncFX] Request - Syncing live exchange rates');
    try {
      const res = await syncExchangeRates();
      showFeedback('success', `即時匯率已更新（${formatFxTimestamp(res.updated)}）`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '匯率同步失敗');
    }
  };

  const handleAddAccount = async () => {
    const clean = newAccountInput.trim();
    if (!clean) {
      showFeedback('error', '請先輸入帳戶名稱');
      return;
    }
    try {
      console.log(`[SettingsScreen/handleAddAccount] Add - ${clean}`);
      await addAccount(clean);
      setNewAccountInput('');
      showFeedback('success', `已新增帳戶「${clean}」`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '新增帳戶失敗');
    }
  };

  const handleAddCategory = async () => {
    const clean = newCategoryInput.trim();
    if (!clean) {
      showFeedback('error', '請先輸入分類名稱');
      return;
    }
    try {
      console.log(`[SettingsScreen/handleAddCategory] Add - ${clean}`);
      await addCategory(clean);
      setNewCategoryInput('');
      showFeedback('success', `已新增分類「${clean}」`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '新增分類失敗');
    }
  };

  const requestDeleteAccount = (acc: string) => {
    if (settings.accounts.length <= 1) {
      showFeedback('error', '至少需保留 1 個帳戶，無法全部刪除');
      return;
    }
    setConfirmState({
      kind: 'deleteAccount',
      target: acc,
      linkedCount: accountCounts[acc] || 0,
    });
  };

  const requestDeleteCategory = (cat: string) => {
    if (settings.categories.length <= 1) {
      showFeedback('error', '至少需保留 1 個分類，無法全部刪除');
      return;
    }
    setConfirmState({
      kind: 'deleteCategory',
      target: cat,
      linkedCount: categoryCounts[cat] || 0,
    });
  };

  const handleExecuteConfirm = async () => {
    if (!confirmState) return;
    setIsBusy(true);
    try {
      if (confirmState.kind === 'deleteAccount') {
        console.log(
          `[SettingsScreen/handleCascadeDelete] Account:${confirmState.target}, Linked:${confirmState.linkedCount}`,
        );
        const res = await removeAccountCascade(confirmState.target);
        showFeedback(
          'success',
          `已刪除帳戶「${confirmState.target}」及 ${res.deletedCount ?? confirmState.linkedCount} 筆關聯交易`,
        );
      } else if (confirmState.kind === 'deleteCategory') {
        console.log(
          `[SettingsScreen/handleCascadeDelete] Category:${confirmState.target}, Linked:${confirmState.linkedCount}`,
        );
        const res = await removeCategoryCascade(confirmState.target);
        showFeedback(
          'success',
          `已刪除分類「${confirmState.target}」及 ${res.deletedCount ?? confirmState.linkedCount} 筆關聯交易`,
        );
      } else if (confirmState.kind === 'resetSeed') {
        console.log('[SettingsScreen/handleResetSeed] Request - Resetting to default seed data');
        const res = await resetToSeedData();
        showFeedback(
          'success',
          `已重置為預設範例資料（共 ${res.count ?? 0} 筆交易）`,
        );
      }
      setConfirmState(null);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '操作失敗');
      setConfirmState(null);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveProxyUrl = async () => {
    const cleanUrl = proxyUrlInput.trim();
    console.log(`[SettingsScreen/handleSaveProxyUrl] Save - HasUrl:${Boolean(cleanUrl)}`);
    try {
      await updateSettings({ aiProxyUrl: cleanUrl });
      showFeedback(
        'success',
        cleanUrl ? '已儲存 AI Proxy 端點設定' : '已清除 AI Proxy，將使用本地離線規則引擎',
      );
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '儲存 AI Proxy 設定失敗');
    }
  };

  const handleToggleSimulate503 = async (nextVal: boolean) => {
    console.log(`[SettingsScreen/handleToggleSimulate503] Toggle - ${nextVal}`);
    try {
      await updateSettings({ simulate503: nextVal });
      showFeedback(
        'success',
        nextVal
          ? '已開啟 503 離線模擬：AI 記帳將強制啟用本地規則引擎'
          : '已關閉 503 離線模擬',
      );
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '更新開關失敗');
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    console.log(`[SettingsScreen/handleExport] Format:${format}, Count:${transactions.length}`);
    setIsBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        const csv = await ApiService.exportTransactionsCSV(transactions);
        const modeUsed = await deliverExportFile(
          csv,
          `gemledger-backup-${today}.csv`,
          'text/csv;charset=utf-8;',
        );
        showFeedback(
          'success',
          `CSV 備份已${modeUsed === 'downloaded' ? '下載' : '開啟分享'}（${transactions.length} 筆）`,
        );
      } else {
        const json = await ApiService.exportTransactionsJSON(transactions);
        const modeUsed = await deliverExportFile(
          json,
          `gemledger-backup-${today}.json`,
          'application/json;charset=utf-8;',
        );
        showFeedback(
          'success',
          `JSON 備份已${modeUsed === 'downloaded' ? '下載' : '開啟分享'}（${transactions.length} 筆）`,
        );
      }
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '匯出失敗');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top + 12, 20),
            paddingBottom: Math.max(insets.bottom + 104, 120),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>系統設定</Text>
          <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
            主題外觀、多幣別匯率、自訂項目、AI Proxy 與資料備份
          </Text>
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

        {/* 1. Appearance Theme Switcher */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.sectionTitleRow}>
            <Sun size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              外觀主題模式
            </Text>
          </View>
          <View style={styles.themeRow}>
            {(
              [
                { key: 'system', label: '跟隨系統', Icon: Smartphone },
                { key: 'light', label: '淺色模式', Icon: Sun },
                { key: 'dark', label: '深色模式', Icon: Moon },
              ] as const
            ).map(({ key, label, Icon }) => {
              const active = mode === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => handleThemeSelect(key)}
                  style={[
                    styles.themeBtn,
                    {
                      backgroundColor: active ? colors.primary : colors.chipBg,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Icon size={16} color={active ? '#FFFFFF' : colors.textSecondary} />
                  <Text
                    style={[
                      styles.themeBtnText,
                      { color: active ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 2. Base Currency & Live FX Sync */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionTitleRow}>
              <Coins size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                預設本位幣別與匯率
              </Text>
            </View>
            <Pressable
              onPress={handleSyncFX}
              disabled={isSyncingFX}
              style={[
                styles.syncBtn,
                {
                  backgroundColor: colors.primaryLight,
                  borderColor: colors.primary,
                  opacity: isSyncingFX ? 0.65 : 1,
                },
              ]}
            >
              {isSyncingFX ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <RefreshCw size={14} color={colors.primary} />
              )}
              <Text style={[styles.syncBtnText, { color: colors.primary }]}>
                {isSyncingFX ? '同步中...' : '同步即時匯率'}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.metaNote, { color: colors.textMuted }]}>
            最後更新時間：{formatFxTimestamp(exchangeRates.updated)}
          </Text>

          <View style={styles.fxPreviewRow}>
            {fxPreviewList.map((txt) => (
              <View
                key={txt}
                style={[styles.fxPreviewChip, { backgroundColor: colors.surfaceElevated }]}
              >
                <Text style={[styles.fxPreviewText, { color: colors.textSecondary }]}>
                  {txt}
                </Text>
              </View>
            ))}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.currencyStrip}
          >
            {SUPPORTED_CURRENCIES.map((cur) => {
              const active = cur === baseCurrency;
              return (
                <Pressable
                  key={cur}
                  onPress={() => handleSelectBaseCurrency(cur)}
                  style={[
                    styles.currencyChip,
                    {
                      backgroundColor: active ? colors.primary : colors.chipBg,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.currencyChipCode,
                      { color: active ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {CURRENCY_SYMBOLS[cur]} {cur}
                  </Text>
                  <Text
                    style={[
                      styles.currencyChipLabel,
                      {
                        color: active
                          ? 'rgba(255,255,255,0.85)'
                          : colors.textMuted,
                      },
                    ]}
                  >
                    {CURRENCY_LABELS[cur]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 3. Custom Accounts Manager */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionTitleRow}>
              <Wallet size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                自訂帳戶管理 ({settings.accounts.length})
              </Text>
            </View>
          </View>
          <Text style={[styles.metaNote, { color: colors.textMuted }]}>
            刪除帳戶將級聯清除該帳戶底下的所有交易紀錄
          </Text>

          <View style={styles.addRow}>
            <TextInput
              value={newAccountInput}
              onChangeText={setNewAccountInput}
              placeholder="輸入新帳戶名稱（例：將來銀行）"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleAddAccount}
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />
            <Pressable
              onPress={handleAddAccount}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.addBtnText}>新增</Text>
            </Pressable>
          </View>

          <View style={styles.chipWrap}>
            {settings.accounts.map((acc) => {
              const meta = getAccountMeta(acc);
              const count = accountCounts[acc] || 0;
              return (
                <View
                  key={acc}
                  style={[
                    styles.itemChip,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.itemDot, { backgroundColor: meta.color }]} />
                  <Text style={[styles.itemChipText, { color: colors.text }]}>
                    {acc}
                  </Text>
                  <Text style={[styles.itemCountText, { color: colors.textMuted }]}>
                    {count}
                  </Text>
                  <Pressable
                    onPress={() => requestDeleteAccount(acc)}
                    hitSlop={8}
                    style={styles.itemDeleteBtn}
                  >
                    <Trash2 size={13} color={colors.expense} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>

        {/* 4. Custom Categories Manager */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionTitleRow}>
              <FolderKanban size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                自訂分類管理 ({settings.categories.length})
              </Text>
            </View>
          </View>
          <Text style={[styles.metaNote, { color: colors.textMuted }]}>
            刪除分類將級聯清除該分類底下的所有交易紀錄
          </Text>

          <View style={styles.addRow}>
            <TextInput
              value={newCategoryInput}
              onChangeText={setNewCategoryInput}
              placeholder="輸入新分類名稱（例：寵物、交際）"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleAddCategory}
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />
            <Pressable
              onPress={handleAddCategory}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.addBtnText}>新增</Text>
            </Pressable>
          </View>

          <View style={styles.chipWrap}>
            {settings.categories.map((cat) => {
              const meta = getCategoryMeta(cat);
              const count = categoryCounts[cat] || 0;
              return (
                <View
                  key={cat}
                  style={[
                    styles.itemChip,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.itemDot, { backgroundColor: meta.color }]} />
                  <Text style={[styles.itemChipText, { color: colors.text }]}>
                    {cat}
                  </Text>
                  <Text style={[styles.itemCountText, { color: colors.textMuted }]}>
                    {count}
                  </Text>
                  <Pressable
                    onPress={() => requestDeleteCategory(cat)}
                    hitSlop={8}
                    style={styles.itemDeleteBtn}
                  >
                    <Trash2 size={13} color={colors.expense} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>

        {/* 5. AI Proxy & Offline 503 Simulation */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.sectionTitleRow}>
            <Bot size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Gemini AI Proxy 與容錯引擎
            </Text>
          </View>

          <View
            style={[
              styles.aiStatusPill,
              {
                backgroundColor: settings.simulate503
                  ? colors.warningBg
                  : settings.aiProxyUrl
                    ? colors.incomeBg
                    : colors.chipBg,
              },
            ]}
          >
            <Server
              size={14}
              color={
                settings.simulate503
                  ? colors.warning
                  : settings.aiProxyUrl
                    ? colors.income
                    : colors.textSecondary
              }
            />
            <Text
              style={[
                styles.aiStatusText,
                {
                  color: settings.simulate503
                    ? colors.warning
                    : settings.aiProxyUrl
                      ? colors.income
                      : colors.textSecondary,
                },
              ]}
            >
              {settings.simulate503
                ? '503 離線模擬啟用中（強制使用本地規則引擎）'
                : settings.aiProxyUrl
                  ? '已設定 Serverless AI Proxy 端點'
                  : '未設定 Proxy（將自動使用本地規則引擎）'}
            </Text>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            AI Proxy Endpoint URL
          </Text>
          <View style={styles.addRow}>
            <TextInput
              value={proxyUrlInput}
              onChangeText={setProxyUrlInput}
              placeholder="https://gemledger-ai-proxy.workers.dev"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />
            <Pressable
              onPress={handleSaveProxyUrl}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.addBtnText}>儲存</Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.switchRow,
              { borderTopColor: colors.divider },
            ]}
          >
            <View style={styles.switchInfo}>
              <View style={styles.switchTitleRow}>
                <WifiOff size={15} color={colors.warning} />
                <Text style={[styles.switchTitle, { color: colors.text }]}>
                  模擬 503 離線降級 (simulate503)
                </Text>
              </View>
              <Text style={[styles.switchDesc, { color: colors.textMuted }]}>
                開啟後跳過雲端 AI Proxy，直接測試內建離線規則解析引擎
              </Text>
            </View>
            <Switch
              value={Boolean(settings.simulate503)}
              onValueChange={handleToggleSimulate503}
              trackColor={{ false: colors.border, true: colors.warning }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* 6. Data Backup & Portability */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.sectionTitleRow}>
            <Database size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              資料備份與可攜性
            </Text>
          </View>
          <Text style={[styles.metaNote, { color: colors.textMuted }]}>
            目前本機資料庫共有 {transactions.length} 筆交易紀錄，可隨時匯出備份
          </Text>

          <View style={styles.exportRow}>
            <Pressable
              onPress={() => handleExport('csv')}
              disabled={isBusy}
              style={[
                styles.exportBtn,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <FileSpreadsheet size={18} color={colors.income} />
              <View style={styles.exportBtnTextCol}>
                <Text style={[styles.exportBtnTitle, { color: colors.text }]}>
                  匯出 CSV
                </Text>
                <Text style={[styles.exportBtnSub, { color: colors.textMuted }]}>
                  Excel 相容格式
                </Text>
              </View>
              <Download size={15} color={colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => handleExport('json')}
              disabled={isBusy}
              style={[
                styles.exportBtn,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <FileJson size={18} color={colors.primary} />
              <View style={styles.exportBtnTextCol}>
                <Text style={[styles.exportBtnTitle, { color: colors.text }]}>
                  匯出 JSON
                </Text>
                <Text style={[styles.exportBtnSub, { color: colors.textMuted }]}>
                  完整結構備份
                </Text>
              </View>
              <Download size={15} color={colors.textMuted} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => setConfirmState({ kind: 'resetSeed' })}
            disabled={isBusy}
            style={[
              styles.resetBtn,
              {
                backgroundColor: colors.expenseBg,
                borderColor: colors.expense,
              },
            ]}
          >
            <RotateCcw size={16} color={colors.expense} />
            <Text style={[styles.resetBtnText, { color: colors.expense }]}>
              重置為預設範例資料 (Reset Seed Data)
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Cross-Platform Cascade Delete / Reset Confirmation Modal */}
      <Modal
        visible={confirmState !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !isBusy && setConfirmState(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !isBusy && setConfirmState(null)}
        >
          <Pressable
            onPress={() => {}}
            style={[
              styles.confirmCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={[styles.confirmIconWrap, { backgroundColor: colors.expenseBg }]}>
              <AlertTriangle size={24} color={colors.expense} />
            </View>

            <Text style={[styles.confirmTitle, { color: colors.text }]}>
              {confirmState?.kind === 'deleteAccount'
                ? `刪除帳戶「${confirmState.target}」？`
                : confirmState?.kind === 'deleteCategory'
                  ? `刪除分類「${confirmState.target}」？`
                  : '重置為預設範例資料？'}
            </Text>

            <Text style={[styles.confirmDesc, { color: colors.textSecondary }]}>
              {confirmState?.kind === 'deleteAccount'
                ? `此操作將執行級聯刪除，同時永久移除屬於「${confirmState.target}」的 ${confirmState.linkedCount} 筆關聯交易紀錄，且無法復原。`
                : confirmState?.kind === 'deleteCategory'
                  ? `此操作將執行級聯刪除，同時永久移除分類為「${confirmState.target}」的 ${confirmState.linkedCount} 筆關聯交易紀錄，且無法復原。`
                  : '此操作將清空目前所有本地交易紀錄與自訂項目，並重新寫入預設範例資料，無法復原。'}
            </Text>

            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setConfirmState(null)}
                disabled={isBusy}
                style={[
                  styles.confirmCancelBtn,
                  { backgroundColor: colors.chipBg },
                ]}
              >
                <Text style={[styles.confirmCancelText, { color: colors.text }]}>
                  取消
                </Text>
              </Pressable>
              <Pressable
                onPress={handleExecuteConfirm}
                disabled={isBusy}
                style={[
                  styles.confirmDangerBtn,
                  { backgroundColor: colors.expense, opacity: isBusy ? 0.65 : 1 },
                ]}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmDangerText}>確認執行</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  header: {
    marginBottom: 2,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedbackText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  metaNote: {
    fontSize: 12,
    marginBottom: 10,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  themeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 10,
  },
  syncBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  fxPreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  fxPreviewChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  fxPreviewText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  currencyStrip: {
    gap: 8,
    paddingRight: 8,
  },
  currencyChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 84,
  },
  currencyChipCode: {
    fontSize: 13,
    fontWeight: '800',
  },
  currencyChipLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemCountText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  itemDeleteBtn: {
    paddingLeft: 2,
    paddingVertical: 2,
  },
  aiStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    marginBottom: 12,
  },
  aiStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  switchInfo: {
    flex: 1,
  },
  switchTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  switchDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  exportRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  exportBtnTextCol: {
    flex: 1,
  },
  exportBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  exportBtnSub: {
    fontSize: 11,
    marginTop: 1,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  confirmCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  confirmIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmDesc: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmDangerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmDangerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
