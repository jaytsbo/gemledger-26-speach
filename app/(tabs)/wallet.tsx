import React, { useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { LedgerIcon } from '@/components/LedgerIcon';
import { useLedgerStore } from '@/store/useLedgerStore';
import { getAccountMeta } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { AccountStat } from '@/types/ledger';
import { computeAccountStats } from '@/utils/analytics';
import { formatMoney } from '@/utils/currency';

export default function WalletScreen() {
  const { colors, isDark } = useAppTheme();

  const transactions = useLedgerStore((s) => s.transactions);
  const settings = useLedgerStore((s) => s.settings);
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);
  const exchangeRates = useLedgerStore((s) => s.exchangeRates);
  const refreshAll = useLedgerStore((s) => s.refreshAll);

  const [refreshing, setRefreshing] = useState(false);

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
    () => accountStats.filter((item) => item.balance > 0 && item.sharePercentage > 0),
    [accountStats],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    console.log('[WalletScreen/refresh] Request - Refreshing wallet balances');
    try {
      await refreshAll(true);
    } catch (err) {
      console.warn('[WalletScreen/refresh] Error -', err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
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
          <Text style={[styles.pageTitle, { color: colors.text }]}>帳戶錢包</Text>
        </View>

        {/* Multi-account Distribution Bar Card (iPhone Storage Style) */}
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
          <View style={styles.distributionHeader}>
            <Text style={[styles.distributionTitle, { color: colors.text }]}>
              資產分佈
            </Text>
            <Text style={[styles.distributionSubtitle, { color: colors.textMuted }]}>
              {positiveAccounts.length} 個正資產帳戶 · {baseCurrency}
            </Text>
          </View>

          <View style={[styles.distributionTrack, { backgroundColor: colors.divider }]}>
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

        {/* Simplified Account Deck */}
        <View style={styles.deckContainer}>
          {accountStats.map((item, index) => (
            <AccountDeckCard
              key={item.account}
              item={item}
              index={index}
              baseCurrency={baseCurrency}
              customIcon={settings.accountIcons?.[item.account]}
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
}

function AccountDeckCard({
  item,
  index,
  baseCurrency,
  customIcon,
}: AccountDeckCardProps) {
  const { colors, isDark } = useAppTheme();
  const meta = getAccountMeta(item.account);

  const isNegative = item.balance < 0;
  const accentColor = isNegative ? colors.expense : colors.income;
  const accentBgColor = isNegative ? colors.expenseBg : colors.incomeBg;
  const barWidthPct = isNegative
    ? 100
    : Math.min(100, Math.max(item.sharePercentage, item.balance > 0 ? 4 : 0));

  const linearGradId = `walletCardLinear-${index}`;
  const radialGradId = `walletCardRadial-${index}`;

  return (
    <View
      style={[
        styles.walletCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          borderWidth: 1,
          shadowColor: colors.shadow,
          shadowOpacity: isDark ? 0.4 : 0.09,
          marginTop: index === 0 ? 0 : 12,
        },
      ]}
      accessibilityLabel={`${item.account} 餘額 ${formatMoney(item.balance, baseCurrency)}`}
    >
      {/* Subtle Account Brand Gradient & Top-Right Glow */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={linearGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={meta.color} stopOpacity={0.18} />
              <Stop offset="65%" stopColor={meta.color} stopOpacity={0} />
            </LinearGradient>
            <RadialGradient id={radialGradId} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={meta.color} stopOpacity={0.2} />
              <Stop offset="100%" stopColor={meta.color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${linearGradId})`} />
          <Circle cx="92%" cy="18%" r="96" fill={`url(#${radialGradId})`} />
        </Svg>
      </View>

      {/* Top Colored Card Accent Strip */}
      <View style={[styles.cardAccentStrip, { backgroundColor: meta.color }]} />

      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardIdentity}>
            <View style={[styles.accountIconBox, { backgroundColor: meta.bgColor }]}>
              <LedgerIcon
                name={customIcon || item.icon}
                size={18}
                color={meta.color}
                strokeWidth={2.2}
              />
            </View>
            <Text
              style={[styles.cardAccountName, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.account}
            </Text>
          </View>

          <View style={styles.cardBalanceCol}>
            <Text
              style={[styles.cardBalance, { color: accentColor }]}
              numberOfLines={1}
            >
              {formatMoney(item.balance, baseCurrency, true)}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: accentBgColor }]}>
              <Text style={[styles.statusPillText, { color: accentColor }]}>
                {isNegative ? '待付' : `${item.sharePercentage.toFixed(1)}%`}
              </Text>
            </View>
          </View>
        </View>

        {/* Asset Share Progress Bar */}
        <View style={[styles.shareTrack, { backgroundColor: colors.divider }]}>
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
    </View>
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
  distributionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  distributionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  distributionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  distributionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  distributionTrack: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
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
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  legendPct: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyDistributionText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  deckContainer: {
    paddingBottom: 6,
  },
  walletCard: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 4,
  },
  cardAccentStrip: {
    height: 5,
    width: '100%',
  },
  cardBody: {
    padding: 15,
    gap: 11,
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
    gap: 11,
    minWidth: 0,
  },
  accountIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAccountName: {
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 1,
  },
  cardBalanceCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  cardBalance: {
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  shareTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  shareFill: {
    height: '100%',
    borderRadius: 3,
  },
});
