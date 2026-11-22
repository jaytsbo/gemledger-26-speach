import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, X } from 'lucide-react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { LedgerIcon } from '@/components/LedgerIcon';
import { CyberNeuralBackground } from '@/components/ui/CyberNeuralBackground';
import { HudReticle, MONO_FONT } from '@/components/ui/HudReticle';
import { SpringPressable } from '@/components/ui/SpringPressable';
import { useLedgerStore } from '@/store/useLedgerStore';
import { HUD_RADIUS, HUD_RADIUS_LG, getAccountMeta } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { AccountStat } from '@/types/ledger';
import { computeAccountStats } from '@/utils/analytics';
import { formatMoney } from '@/utils/currency';

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'TWD']);

function normalizeDisplayBalance(balance: number, currency: string): number {
  if (!Number.isFinite(balance)) return 0;
  const threshold = ZERO_DECIMAL_CURRENCIES.has((currency || 'TWD').trim().toUpperCase())
    ? 0.5
    : 0.005;
  return Math.abs(balance) < threshold ? 0 : balance;
}

export default function WalletScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();

  const transactions = useLedgerStore((s) => s.transactions);
  const settings = useLedgerStore((s) => s.settings);
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);
  const exchangeRates = useLedgerStore((s) => s.exchangeRates);
  const setFilter = useLedgerStore((s) => s.setFilter);
  const refreshAll = useLedgerStore((s) => s.refreshAll);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const accountStats = useMemo(
    () =>
      computeAccountStats(
        transactions,
        settings.accounts,
        baseCurrency,
        exchangeRates,
      ),
    [transactions, settings.accounts, baseCurrency, exchangeRates],
  );

  const positiveAccounts = useMemo(
    () =>
      accountStats.filter(
        (item) => normalizeDisplayBalance(item.balance, baseCurrency) > 0 && item.sharePercentage > 0,
      ),
    [accountStats, baseCurrency],
  );

  const handlePressAccount = useCallback(
    (account: string) => {
      console.log(`[WalletScreen/selectAccount] Navigate - Account:${account}`);
      setFilter({
        account,
        year: 'ALL',
        month: 'ALL',
        date: '',
        category: 'ALL',
        currency: 'ALL',
        searchQuery: '',
      });
      router.navigate('/(tabs)');
    },
    [setFilter, router],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    console.log('[WalletScreen/refresh] Request - Refreshing wallet balances');
    try {
      await refreshAll(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '重新整理失敗，請稍後再試';
      console.warn('[WalletScreen/refresh] Error -', msg);
      setRefreshError(msg);
    } finally {
      setRefreshing(false);
    }
  };

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>
            帳戶錢包
          </Text>
        </View>

        {refreshError ? (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: colors.expenseBg, borderColor: colors.expense },
            ]}
          >
            <AlertTriangle size={15} color={colors.expense} />
            <Text style={[styles.errorBannerText, { color: colors.expense }]}>
              {refreshError}
            </Text>
            <Pressable onPress={() => setRefreshError(null)} hitSlop={8}>
              <X size={15} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {/* Total Asset Summary & Distribution Tactical Panel */}
        <View
          style={[
            styles.distributionCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.cardBorder,
              shadowColor: colors.shadow,
              shadowOpacity: isDark ? 0.35 : 0.08,
            },
          ]}
        >
          <HudReticle variant="primary" />

          <View style={styles.summaryTopRow}>
            <Text style={[styles.distributionTitle, { color: colors.text }]}>
              資產分佈
            </Text>
            <Text style={[styles.distributionSubtitle, { color: colors.textSecondary }]}>
              {positiveAccounts.length} 個正資產帳戶 · {baseCurrency}
            </Text>
          </View>

          <View
            style={[
              styles.distributionTrack,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            {positiveAccounts.length > 0 ? (
              positiveAccounts.map((item) => {
                const segColor = getAccountMeta(item.account).color;
                return (
                  <View
                    key={item.account}
                    style={[
                      styles.distributionSegment,
                      {
                        flexGrow: item.sharePercentage,
                        flexShrink: 1,
                        flexBasis: 0,
                        backgroundColor: segColor,
                      },
                    ]}
                  />
                );
              })
            ) : null}
          </View>

          {positiveAccounts.length > 0 ? (
            <View style={styles.legendWrap}>
              {positiveAccounts.map((item) => {
                const segColor = getAccountMeta(item.account).color;
                return (
                  <View key={item.account} style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: segColor }]}
                    />
                    <Text
                      style={[styles.legendLabel, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {item.account}
                    </Text>
                    <Text style={[styles.legendPct, { color: colors.textMuted }]}>
                      {item.sharePercentage.toFixed(1)}%
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.emptyDistributionText, { color: colors.textMuted }]}>
              尚無正資產分佈紀錄
            </Text>
          )}
        </View>

        {/* Account Asset Pods Deck */}
        <View style={styles.deckContainer}>
          {accountStats.map((item, index) => (
            <AccountDeckCard
              key={item.account}
              item={item}
              index={index}
              baseCurrency={baseCurrency}
              customIcon={settings.accountIcons?.[item.account]}
              onPressAccount={handlePressAccount}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface AccountDeckCardProps {
  item: AccountStat;
  index: number;
  baseCurrency: string;
  customIcon?: string;
  onPressAccount: (account: string) => void;
}

function AccountDeckCard({
  item,
  index,
  baseCurrency,
  customIcon,
  onPressAccount,
}: AccountDeckCardProps) {
  const { colors, isDark } = useAppTheme();
  const meta = getAccountMeta(item.account);

  const displayBalance = normalizeDisplayBalance(item.balance, baseCurrency);
  const isNegative = displayBalance < 0;
  const accentColor = isNegative ? colors.expense : colors.income;
  const accentBgColor = isNegative ? colors.expenseBg : colors.incomeBg;
  const barWidthPct = isNegative
    ? 100
    : Math.min(100, Math.max(item.sharePercentage, displayBalance > 0 ? 4 : 0));

  const linearGradId = `walletCardLinear-${index}`;
  const radialGradId = `walletCardRadial-${index}`;

  return (
    <SpringPressable
      onPress={() => onPressAccount(item.account)}
      pressedScale={0.98}
      haptic="selection"
      accessibilityRole="button"
      style={[
        styles.walletCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          borderWidth: 1,
          shadowColor: colors.shadow,
          shadowOpacity: isDark ? 0.36 : 0.08,
          marginTop: index === 0 ? 0 : 12,
        },
      ]}
      accessibilityLabel={`檢視 ${item.account} 交易明細，餘額 ${formatMoney(displayBalance, baseCurrency)}`}
    >
      {/* Clipped Subtle Account Gradient & Top Neon Accent Strip */}
      <View style={[StyleSheet.absoluteFill, styles.cardBgClip]} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={linearGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={meta.color} stopOpacity={0.14} />
              <Stop offset="65%" stopColor={meta.color} stopOpacity={0} />
            </LinearGradient>
            <RadialGradient id={radialGradId} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={meta.color} stopOpacity={0.16} />
              <Stop offset="100%" stopColor={meta.color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${linearGradId})`} />
          <Circle cx="92%" cy="18%" r="92" fill={`url(#${radialGradId})`} />
        </Svg>
        <View style={[styles.cardAccentStrip, { backgroundColor: meta.color }]} />
      </View>

      <HudReticle color={isNegative ? colors.expense : colors.primary} />

      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardIdentity}>
            <View
              style={[
                styles.accountIconBox,
                {
                  backgroundColor: meta.bgColor,
                  borderColor: `${meta.color}55`,
                },
              ]}
            >
              <LedgerIcon
                name={customIcon || item.icon}
                size={18}
                color={meta.color}
                strokeWidth={2.2}
              />
            </View>
            <View style={styles.accountNameCol}>
              <Text
                style={[styles.cardAccountName, { color: colors.text }]}
                numberOfLines={1}
              >
                {item.account}
              </Text>
            </View>
          </View>

          <View style={styles.cardBalanceCol}>
            <Text
              style={[styles.cardBalance, { color: accentColor }]}
              numberOfLines={1}
            >
              {formatMoney(displayBalance, baseCurrency, true)}
            </Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: accentBgColor,
                  borderColor: `${accentColor}55`,
                },
              ]}
            >
              <Text style={[styles.statusPillText, { color: accentColor }]}>
                {isNegative ? '待付' : `${item.sharePercentage.toFixed(1)}%`}
              </Text>
            </View>
          </View>
        </View>

        {/* Sharp Linear Asset Share Progress Bar */}
        <View
          style={[
            styles.shareTrack,
            { backgroundColor: colors.surfaceElevated },
          ]}
        >
          <View
            style={[
              styles.shareFill,
              {
                width: `${barWidthPct}%`,
                backgroundColor: accentColor,
              },
            ]}
          />
        </View>
      </View>
    </SpringPressable>
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
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  pageTitle: {
    fontFamily: MONO_FONT,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  errorBannerText: {
    flex: 1,
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '700',
  },
  distributionCard: {
    position: 'relative',
    borderRadius: HUD_RADIUS_LG,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  distributionTitle: {
    fontFamily: MONO_FONT,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  distributionSubtitle: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  distributionTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 3,
    borderWidth: 1,
    overflow: 'hidden',
    gap: 2,
  },
  distributionSegment: {
    height: '100%',
  },
  legendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 1.5,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  legendPct: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyDistributionText: {
    fontFamily: MONO_FONT,
    fontSize: 12,
  },
  deckContainer: {
    paddingBottom: 6,
  },
  walletCard: {
    position: 'relative',
    borderRadius: HUD_RADIUS_LG,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  cardBgClip: {
    borderRadius: HUD_RADIUS_LG,
    overflow: 'hidden',
  },
  cardAccentStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  cardBody: {
    padding: 14,
    paddingTop: 15,
    gap: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  accountIconBox: {
    width: 38,
    height: 38,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountNameCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardAccountName: {
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  cardBalanceCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  cardBalance: {
    fontFamily: MONO_FONT,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusPillText: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  shareTrack: {
    height: 5,
    borderRadius: 2,
    overflow: 'hidden',
    width: '100%',
  },
  shareFill: {
    height: '100%',
    borderRadius: 2,
  },
});
