import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowRight,
  Layers,
  Receipt,
  Sparkles,
  Wallet as WalletIcon,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LedgerIcon } from '@/components/LedgerIcon';
import { useLedgerStore } from '@/store/useLedgerStore';
import { getAccountMeta } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { AccountStat } from '@/types/ledger';
import { computeAccountStats } from '@/utils/analytics';
import { formatMoney } from '@/utils/currency';

export default function WalletScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();

  const transactions = useLedgerStore((s) => s.transactions);
  const settings = useLedgerStore((s) => s.settings);
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);
  const exchangeRates = useLedgerStore((s) => s.exchangeRates);
  const activeAccountFilter = useLedgerStore((s) => s.filters.account);
  const setFilter = useLedgerStore((s) => s.setFilter);
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

  const summary = useMemo(() => {
    let totalPositive = 0;
    let totalDebt = 0;
    for (const acc of accountStats) {
      if (acc.balance >= 0) totalPositive += acc.balance;
      else totalDebt += Math.abs(acc.balance);
    }
    return {
      totalPositive,
      totalDebt,
      netTotal: totalPositive - totalDebt,
      activeCount: accountStats.filter((a) => a.transactionCount > 0).length,
    };
  }, [accountStats]);

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

  const handleSelectAccount = (account: string) => {
    console.log(`[WalletScreen/selectAccount] Tap - Account:${account}`);
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setFilter({ account });
    router.navigate('/');
  };

  const handleViewAllTransactions = () => {
    console.log('[WalletScreen/viewAll] Tap - Clearing account filter');
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setFilter({ account: 'ALL' });
    router.navigate('/');
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
          <View>
            <Text style={[styles.pageTitle, { color: colors.text }]}>帳戶錢包</Text>
            <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
              點擊任一帳戶卡片即可篩選首頁明細
            </Text>
          </View>
          <Pressable
            onPress={handleViewAllTransactions}
            style={({ pressed }) => [
              styles.allTxBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Layers size={14} color={colors.primary} />
            <Text style={[styles.allTxBtnText, { color: colors.primary }]}>全部明細</Text>
          </Pressable>
        </View>

        {/* Wallet Overview Summary Strip */}
        <View
          style={[
            styles.summaryBanner,
            {
              backgroundColor: isDark ? '#0B2E2B' : '#064E3B',
              shadowColor: colors.shadow,
            },
          ]}
        >
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryBadge}>
              <WalletIcon size={13} color="#A7F3D0" />
              <Text style={styles.summaryBadgeText}>
                {accountStats.length} 個帳戶 · {summary.activeCount} 個活躍
              </Text>
            </View>
            <View style={styles.summaryCurrencyPill}>
              <Sparkles size={11} color="#6EE7B7" />
              <Text style={styles.summaryCurrencyText}>{baseCurrency}</Text>
            </View>
          </View>

          <Text style={styles.summaryLabel}>帳戶淨資產總額</Text>
          <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(summary.netTotal, baseCurrency, true)}
          </Text>

          <View style={styles.summarySubRow}>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryMetricLabel}>正資產總計</Text>
              <Text style={styles.summaryMetricPos}>
                {formatMoney(summary.totalPositive, baseCurrency, true)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryMetricLabel}>負債 / 待付</Text>
              <Text style={styles.summaryMetricNeg}>
                {formatMoney(summary.totalDebt, baseCurrency, true)}
              </Text>
            </View>
          </View>
        </View>

        {/* Apple Wallet / Revolut Style Stacked Account Deck */}
        <View style={styles.deckContainer}>
          {accountStats.map((item, index) => (
            <AccountDeckCard
              key={item.account}
              item={item}
              index={index}
              baseCurrency={baseCurrency}
              isSelected={activeAccountFilter === item.account}
              onPress={() => handleSelectAccount(item.account)}
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
  isSelected: boolean;
  onPress: () => void;
}

function AccountDeckCard({
  item,
  index,
  baseCurrency,
  isSelected,
  onPress,
}: AccountDeckCardProps) {
  const { colors, isDark } = useAppTheme();
  const meta = getAccountMeta(item.account);

  const currencyEntries = useMemo(
    () =>
      Object.entries(item.currencyBreakdown)
        .filter(([, amt]) => Math.abs(amt) > 0.0001)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])),
    [item.currencyBreakdown],
  );

  const isNegative = item.balance < 0;
  const barWidthPct = Math.min(100, Math.max(item.sharePercentage, item.balance > 0 ? 4 : 0));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.walletCard,
        {
          backgroundColor: colors.card,
          borderColor: isSelected ? colors.primary : colors.cardBorder,
          borderWidth: isSelected ? 1.8 : 1,
          shadowColor: colors.shadow,
          shadowOpacity: isDark ? 0.4 : 0.09,
          marginTop: index === 0 ? 0 : 12,
        },
        pressed && { transform: [{ scale: 0.985 }], opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.account} 餘額 ${formatMoney(item.balance, baseCurrency)}`}
    >
      {/* Top Colored Card Accent Strip (Apple Wallet / Revolut signature edge) */}
      <View style={[styles.cardAccentStrip, { backgroundColor: meta.color }]} />

      <View style={styles.cardBody}>
        {/* Card Header */}
        <View style={styles.cardTopRow}>
          <View style={styles.cardIdentity}>
            <View style={[styles.accountIconBox, { backgroundColor: meta.bgColor }]}>
              <LedgerIcon name={meta.icon} size={18} color={meta.color} strokeWidth={2.2} />
            </View>
            <View style={styles.cardTitleGroup}>
              <View style={styles.cardNameRow}>
                <Text style={[styles.cardAccountName, { color: colors.text }]} numberOfLines={1}>
                  {item.account}
                </Text>
                {isSelected && (
                  <View style={[styles.activeFilterTag, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.activeFilterTagText, { color: colors.primary }]}>
                      已篩選
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.txCountRow}>
                <Receipt size={11} color={colors.textMuted} />
                <Text style={[styles.txCountText, { color: colors.textMuted }]}>
                  {item.transactionCount} 筆交易
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.cardBalanceCol}>
            <Text
              style={[
                styles.cardBalance,
                { color: isNegative ? colors.expense : colors.text },
              ]}
              numberOfLines={1}
            >
              {formatMoney(item.balance, baseCurrency, true)}
            </Text>
            <View style={styles.goDetailRow}>
              <Text style={[styles.shareText, { color: meta.color }]}>
                資產佔比 {item.sharePercentage.toFixed(1)}%
              </Text>
              <ArrowRight size={12} color={colors.textMuted} />
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
                backgroundColor: isNegative ? colors.expense : meta.color,
              },
            ]}
          />
        </View>

        {/* Original Currency Breakdown Pills */}
        {currencyEntries.length > 0 ? (
          <View style={styles.breakdownRow}>
            {currencyEntries.map(([cur, amt]) => (
              <View
                key={cur}
                style={[
                  styles.currencyBreakPill,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.currencyBreakCode, { color: colors.textMuted }]}>
                  {cur}
                </Text>
                <Text
                  style={[
                    styles.currencyBreakAmt,
                    { color: amt < 0 ? colors.expense : colors.textSecondary },
                  ]}
                >
                  {formatMoney(amt, cur, true)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.emptyBreakdownText, { color: colors.textMuted }]}>
            尚無原幣別餘額紀錄
          </Text>
        )}
      </View>
    </Pressable>
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
    gap: 12,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  allTxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  allTxBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryBanner: {
    borderRadius: 24,
    padding: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 7,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  summaryBadgeText: {
    color: '#ECFDF5',
    fontSize: 11,
    fontWeight: '600',
  },
  summaryCurrencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  summaryCurrencyText: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '800',
  },
  summaryLabel: {
    color: 'rgba(226, 232, 240, 0.78)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 14,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  summarySubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.14)',
  },
  summaryMetric: {
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    marginHorizontal: 12,
  },
  summaryMetricLabel: {
    color: 'rgba(226, 232, 240, 0.72)',
    fontSize: 11,
    fontWeight: '600',
  },
  summaryMetricPos: {
    color: '#6EE7B7',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  summaryMetricNeg: {
    color: '#FDA4AF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
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
  cardTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardAccountName: {
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 1,
  },
  activeFilterTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  activeFilterTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  txCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  txCountText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  cardBalanceCol: {
    alignItems: 'flex-end',
    gap: 3,
  },
  cardBalance: {
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  goDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shareText: {
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
  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  currencyBreakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  currencyBreakCode: {
    fontSize: 10,
    fontWeight: '700',
  },
  currencyBreakAmt: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyBreakdownText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
});
