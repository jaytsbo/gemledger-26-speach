import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  AlertTriangle,
  Calendar,
  Check,
  Filter,
  Landmark,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  Tag,
  X,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NetWorthHeroCard } from '@/components/NetWorthHeroCard';
import { TransactionCard } from '@/components/TransactionCard';
import { CyberNeuralBackground } from '@/components/ui/CyberNeuralBackground';
import { HudReticle, MONO_FONT } from '@/components/ui/HudReticle';
import { useLedgerStore } from '@/store/useLedgerStore';
import { HUD_RADIUS, HUD_RADIUS_LG } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { Transaction } from '@/types/ledger';
import {
  DateGroupedSection,
  computeKPIStats,
  extractAvailableTimeBuckets,
  groupTransactionsByDate,
} from '@/utils/analytics';
import { getLocalDateOffset } from '@/utils/dateTime';

type PickerType = 'time' | 'account' | 'category' | null;
type TimeMode = 'recent' | 'year' | 'month' | 'day';

const TIME_TABS: { key: TimeMode; label: string }[] = [
  { key: 'recent', label: '近兩日' },
  { key: 'year', label: '年' },
  { key: 'month', label: '月' },
  { key: 'day', label: '日' },
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function formatDateHeader(
  dateStr: string,
  todayStr: string,
  yesterdayStr: string,
): { title: string; badge?: string } {
  let badge: string | undefined;
  if (dateStr === todayStr) badge = '今天';
  else if (dateStr === yesterdayStr) badge = '昨天';

  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    const wd = WEEKDAYS[dt.getDay()];
    return { title: `${dateStr} (${wd})`, badge };
  }
  return { title: dateStr, badge };
}

export default function HomeScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useAppTheme();

  const transactions = useLedgerStore((s) => s.transactions);
  const filteredTransactions = useLedgerStore((s) => s.filteredTransactions);
  const settings = useLedgerStore((s) => s.settings);
  const exchangeRates = useLedgerStore((s) => s.exchangeRates);
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);
  const filters = useLedgerStore((s) => s.filters);
  const isLoading = useLedgerStore((s) => s.isLoading);
  const initialized = useLedgerStore((s) => s.initialized);
  const setFilter = useLedgerStore((s) => s.setFilter);
  const resetFilters = useLedgerStore((s) => s.resetFilters);
  const refreshAll = useLedgerStore((s) => s.refreshAll);

  const [activePicker, setActivePicker] = useState<PickerType>(null);
  const [timeMode, setTimeMode] = useState<TimeMode>('recent');
  const [selectedTimeValue, setSelectedTimeValue] = useState<string>('RECENT');
  const [pickerTimeTab, setPickerTimeTab] = useState<TimeMode>('recent');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(() => getLocalDateOffset(0));
  const [yesterdayKey, setYesterdayKey] = useState(() => getLocalDateOffset(-1));
  const chipPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(chipPulse, {
          toValue: 0.75,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(chipPulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [chipPulse]);

  useFocusEffect(
    useCallback(() => {
      const nextToday = getLocalDateOffset(0);
      const nextYesterday = getLocalDateOffset(-1);
      setTodayKey((prev) => (prev !== nextToday ? nextToday : prev));
      setYesterdayKey((prev) => (prev !== nextYesterday ? nextYesterday : prev));
    }, []),
  );

  useEffect(() => {
    const isDefaultTimeFilters =
      filters.year === 'ALL' &&
      filters.month === 'ALL' &&
      !filters.date;
    if (isDefaultTimeFilters && (timeMode !== 'recent' || selectedTimeValue !== 'RECENT')) {
      console.log(
        '[HomeScreen/filterSync] Reset - Restoring timeMode to recent due to cleared time filters',
      );
      setTimeMode('recent');
      setSelectedTimeValue('RECENT');
    }
  }, [filters.year, filters.month, filters.date, timeMode, selectedTimeValue]);

  const expandToAllPeriod = useMemo(
    () =>
      Boolean(filters.searchQuery.trim()) ||
      filters.account !== 'ALL' ||
      filters.category !== 'ALL',
    [filters.searchQuery, filters.account, filters.category],
  );

  const displayTransactions = useMemo(() => {
    if (timeMode === 'recent' && !expandToAllPeriod) {
      return filteredTransactions.filter(
        (tx) => tx.date === todayKey || tx.date === yesterdayKey,
      );
    }
    return filteredTransactions;
  }, [filteredTransactions, timeMode, expandToAllPeriod, todayKey, yesterdayKey]);

  const kpiStats = useMemo(
    () => computeKPIStats(displayTransactions, baseCurrency, exchangeRates, transactions),
    [displayTransactions, baseCurrency, exchangeRates, transactions],
  );

  const sections = useMemo(
    () => groupTransactionsByDate(displayTransactions),
    [displayTransactions],
  );

  const {
    years: availableYears,
    months: availableMonths,
    days: availableDays,
  } = useMemo(() => extractAvailableTimeBuckets(transactions), [transactions]);

  const hasActiveFilters = useMemo(() => {
    return (
      timeMode !== 'recent' ||
      filters.account !== 'ALL' ||
      filters.category !== 'ALL' ||
      Boolean(filters.searchQuery.trim())
    );
  }, [timeMode, filters.account, filters.category, filters.searchQuery]);

  const timePillLabel = useMemo(() => {
    if (timeMode === 'recent') {
      return expandToAllPeriod ? '時間: 全部期間' : '時間: 近兩日';
    }
    return `時間: ${selectedTimeValue}`;
  }, [timeMode, selectedTimeValue, expandToAllPeriod]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    const nextToday = getLocalDateOffset(0);
    const nextYesterday = getLocalDateOffset(-1);
    setTodayKey(nextToday);
    setYesterdayKey(nextYesterday);
    console.log('[HomeScreen/refresh] Request - Pull-to-refresh');
    try {
      await refreshAll(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '重新整理失敗，請稍後再試';
      console.warn('[HomeScreen/refresh] Error -', msg);
      setRefreshError(msg);
    } finally {
      setRefreshing(false);
    }
  };

  const handleReset = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    console.log('[HomeScreen/reset] Action - Resetting timeMode and store filters');
    setTimeMode('recent');
    setSelectedTimeValue('RECENT');
    resetFilters();
  };

  const handleOpenTimePicker = () => {
    setPickerTimeTab(timeMode);
    setActivePicker('time');
  };

  const handleSelectPickerOption = (value: string) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    if (activePicker === 'time') {
      console.log(`[HomeScreen/selectTime] Update - Mode:${pickerTimeTab}, Value:${value}`);
      setTimeMode(pickerTimeTab);
      setSelectedTimeValue(value);
      if (pickerTimeTab === 'recent') {
        setFilter({ year: 'ALL', month: 'ALL', date: '' });
      } else if (pickerTimeTab === 'year') {
        setFilter({ year: value, month: 'ALL', date: '' });
      } else if (pickerTimeTab === 'month') {
        const [year, month] = value.split('-');
        setFilter({ year: year || 'ALL', month: month || 'ALL', date: '' });
      } else if (pickerTimeTab === 'day') {
        setFilter({ date: value });
      }
    } else if (activePicker === 'account') {
      setFilter({ account: value });
    } else if (activePicker === 'category') {
      setFilter({ category: value });
    }
    setActivePicker(null);
  };

  const pickerConfig = useMemo(() => {
    if (activePicker === 'time') {
      if (pickerTimeTab === 'recent') {
        return {
          title: '篩選時間',
          selected: timeMode === 'recent' ? 'RECENT' : '',
          options: [{ value: 'RECENT', label: '近兩日（今天與昨天）' }],
        };
      }
      if (pickerTimeTab === 'year') {
        return {
          title: '篩選時間',
          selected: timeMode === 'year' ? selectedTimeValue : '',
          options: availableYears.map((y) => ({ value: y, label: `${y} 年` })),
        };
      }
      if (pickerTimeTab === 'month') {
        return {
          title: '篩選時間',
          selected: timeMode === 'month' ? selectedTimeValue : '',
          options: availableMonths.map((ym) => ({ value: ym, label: ym })),
        };
      }
      return {
        title: '篩選時間',
        selected: timeMode === 'day' ? selectedTimeValue : '',
        options: availableDays.map((d) => {
          const tag = d === todayKey ? ' (今天)' : d === yesterdayKey ? ' (昨天)' : '';
          return { value: d, label: `${d}${tag}` };
        }),
      };
    }
    if (activePicker === 'account') {
      return {
        title: '篩選帳戶',
        selected: filters.account,
        options: [
          { value: 'ALL', label: '全部帳戶' },
          ...settings.accounts.map((acc) => ({ value: acc, label: acc })),
        ],
      };
    }
    if (activePicker === 'category') {
      return {
        title: '篩選分類',
        selected: filters.category,
        options: [
          { value: 'ALL', label: '全部分類' },
          ...settings.categories.map((cat) => ({ value: cat, label: cat })),
        ],
      };
    }
    return null;
  }, [
    activePicker,
    pickerTimeTab,
    timeMode,
    selectedTimeValue,
    availableYears,
    availableMonths,
    availableDays,
    todayKey,
    yesterdayKey,
    filters.account,
    filters.category,
    settings.accounts,
    settings.categories,
  ]);

  const listHeader = (
    <View style={styles.headerContent}>
      {/* Top App Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View
            style={[
              styles.titleAccent,
              { backgroundColor: colors.primary, shadowColor: colors.primary },
            ]}
          />
          <Text style={[styles.brandTitle, { color: colors.text }]}>GemLedger</Text>
          <Animated.View
            style={[
              styles.versionChip,
              {
                backgroundColor: colors.accentBg,
                borderColor: colors.accent,
                opacity: chipPulse,
              },
            ]}
          >
            <Sparkles size={10} color={colors.accent} />
            <Text style={[styles.versionChipText, { color: colors.accent }]}>
              AI 26
            </Text>
          </Animated.View>
        </View>

        <Pressable
          onPress={toggleTheme}
          style={({ pressed }) => [
            styles.themeBtn,
            {
              backgroundColor: colors.primaryBg,
              borderColor: colors.primaryGlow,
            },
            pressed && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="切換深淺色主題"
        >
          {isDark ? (
            <Sun size={18} color={colors.primary} />
          ) : (
            <Moon size={18} color={colors.primary} />
          )}
        </Pressable>
      </View>

      {/* Net Worth Hero Card */}
      <NetWorthHeroCard stats={kpiStats} />

      {refreshError ? (
        <View
          style={[
            styles.refreshErrorBanner,
            { backgroundColor: colors.expenseBg, borderColor: colors.expense },
          ]}
        >
          <AlertTriangle size={15} color={colors.expense} />
          <Text style={[styles.refreshErrorText, { color: colors.expense }]}>
            {refreshError}
          </Text>
          <Pressable onPress={() => setRefreshError(null)} hitSlop={8}>
            <X size={15} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* Search Bar */}
      <View
        style={[
          styles.searchContainer,
          {
            backgroundColor: colors.inputBg,
            borderColor: filters.searchQuery ? colors.primary : colors.cardBorder,
          },
        ]}
      >
        <Search
          size={16}
          color={filters.searchQuery ? colors.primary : colors.textMuted}
        />
        <TextInput
          value={filters.searchQuery}
          onChangeText={(text) => setFilter({ searchQuery: text })}
          placeholder="搜尋品項、備註、帳戶或金額..."
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
        />
        {Boolean(filters.searchQuery) && (
          <Pressable
            onPress={() => setFilter({ searchQuery: '' })}
            hitSlop={8}
            accessibilityLabel="清除搜尋"
          >
            <X size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Horizontal Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterPillsRow}
      >
        <Pressable
          onPress={handleOpenTimePicker}
          style={[
            styles.filterPill,
            {
              backgroundColor:
                timeMode !== 'recent' ? colors.primaryBg : colors.surface,
              borderColor:
                timeMode !== 'recent' ? colors.primary : colors.cardBorder,
            },
          ]}
        >
          <Calendar
            size={12}
            color={timeMode !== 'recent' ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.filterPillText,
              {
                color: timeMode !== 'recent' ? colors.primary : colors.textSecondary,
              },
            ]}
          >
            {timePillLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActivePicker('account')}
          style={[
            styles.filterPill,
            {
              backgroundColor:
                filters.account !== 'ALL' ? colors.primaryBg : colors.surface,
              borderColor:
                filters.account !== 'ALL' ? colors.primary : colors.cardBorder,
            },
          ]}
        >
          <Landmark
            size={12}
            color={filters.account !== 'ALL' ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.filterPillText,
              {
                color: filters.account !== 'ALL' ? colors.primary : colors.textSecondary,
              },
            ]}
          >
            {filters.account === 'ALL'
              ? '帳戶: 全部'
              : `${filters.account}`}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActivePicker('category')}
          style={[
            styles.filterPill,
            {
              backgroundColor:
                filters.category !== 'ALL' ? colors.primaryBg : colors.surface,
              borderColor:
                filters.category !== 'ALL' ? colors.primary : colors.cardBorder,
            },
          ]}
        >
          <Tag
            size={12}
            color={filters.category !== 'ALL' ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.filterPillText,
              {
                color: filters.category !== 'ALL' ? colors.primary : colors.textSecondary,
              },
            ]}
          >
            {filters.category === 'ALL'
              ? '分類: 全部'
              : `${filters.category}`}
          </Text>
        </Pressable>

        {hasActiveFilters && (
          <Pressable
            onPress={handleReset}
            style={[
              styles.filterPill,
              {
                backgroundColor: colors.expenseBg,
                borderColor: colors.expense,
              },
            ]}
          >
            <RotateCcw size={12} color={colors.expense} />
            <Text style={[styles.filterPillText, { color: colors.expense }]}>
              重置篩選
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Timeline Section Title */}
      <View style={styles.timelineTitleRow}>
        <View style={styles.timelineTitleLeft}>
          <Filter size={13} color={colors.accent} />
          <Text style={[styles.timelineTitle, { color: colors.textSecondary }]}>
            交易明細時間軸
          </Text>
        </View>
      </View>
    </View>
  );

  const keyExtractor = useCallback((item: Transaction, index: number) => {
    if (item.id !== undefined && item.id !== null && String(item.id).trim() !== '') {
      return `tx-id-${item.id}`;
    }
    if (item.rowNumber !== undefined && item.rowNumber !== null) {
      return `tx-row-${item.rowNumber}`;
    }
    return `tx-fallback-${item.date}-${item.time}-${index}`;
  }, []);

  const renderSectionHeader = useCallback(
    ({ section }: { section: DateGroupedSection }) => {
      const { title, badge } = formatDateHeader(section.date, todayKey, yesterdayKey);
      return (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={[styles.sectionDateText, { color: colors.textSecondary }]}>
              {title}
            </Text>
            {Boolean(badge) && (
              <View
                style={[
                  styles.dayBadge,
                  {
                    backgroundColor: colors.primaryBg,
                    borderColor: colors.primaryGlow,
                  },
                ]}
              >
                <Text style={[styles.dayBadgeText, { color: colors.primary }]}>
                  {badge}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    },
    [
      todayKey,
      yesterdayKey,
      colors.textSecondary,
      colors.primaryBg,
      colors.primaryGlow,
      colors.primary,
    ],
  );

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => (
      <View style={styles.txItemWrapper}>
        <TransactionCard
          transaction={item}
          baseCurrency={baseCurrency}
          exchangeRates={exchangeRates}
        />
      </View>
    ),
    [baseCurrency, exchangeRates],
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <CyberNeuralBackground />
      <SectionList<Transaction, DateGroupedSection>
        style={styles.transparentBg}
        sections={sections}
        keyExtractor={keyExtractor}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        ListEmptyComponent={
          isLoading && !initialized ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                載入帳務資料中...
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.accent,
                },
              ]}
            >
              <HudReticle variant="accent" />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {hasActiveFilters ? '查無符合條件的交易' : '尚無記帳資料'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                {hasActiveFilters
                  ? '試著調整關鍵字或重置篩選條件。'
                  : '點擊下方「+」按鈕快速記一筆或使用 AI 智慧記帳！'}
              </Text>
              {hasActiveFilters ? (
                <Pressable
                  onPress={handleReset}
                  style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
                >
                  <RotateCcw size={14} color={colors.onPrimary} />
                  <Text style={[styles.emptyActionText, { color: colors.onPrimary }]}>
                    清除所有篩選
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => router.push('/quick-add')}
                  style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
                >
                  <Plus size={14} color={colors.onPrimary} />
                  <Text style={[styles.emptyActionText, { color: colors.onPrimary }]}>
                    立即記一筆
                  </Text>
                </Pressable>
              )}
            </View>
          )
        }
      />

      {/* Filter Selection Modal */}
      <Modal
        visible={activePicker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActivePicker(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setActivePicker(null)}
        >
          <Pressable
            style={[
              styles.pickerSheet,
              {
                backgroundColor: isDark
                  ? 'rgba(10, 15, 30, 0.94)'
                  : 'rgba(255, 255, 255, 0.96)',
                borderColor: colors.primaryGlow,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <HudReticle variant="primary" />
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>
                {pickerConfig?.title || '選擇篩選'}
              </Text>
              <Pressable
                onPress={() => setActivePicker(null)}
                style={[
                  styles.pickerCloseBtn,
                  {
                    backgroundColor: colors.chipBg,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <X size={16} color={colors.textSecondary} />
              </Pressable>
            </View>

            {activePicker === 'time' && (
              <View
                style={[
                  styles.segmentedTabsRow,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                {TIME_TABS.map((tab) => {
                  const isActive = pickerTimeTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => setPickerTimeTab(tab.key)}
                      style={[
                        styles.segmentedTab,
                        isActive && {
                          backgroundColor: colors.primaryBg,
                          borderColor: colors.primary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentedTabText,
                          {
                            color: isActive ? colors.primary : colors.textSecondary,
                          },
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <ScrollView
              style={styles.pickerScroll}
              showsVerticalScrollIndicator={false}
            >
              {pickerConfig?.options.length === 0 ? (
                <Text style={[styles.pickerEmptyText, { color: colors.textMuted }]}>
                  目前沒有可選擇的資料
                </Text>
              ) : (
                pickerConfig?.options.map((opt) => {
                  const isSelected = opt.value === pickerConfig.selected;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => handleSelectPickerOption(opt.value)}
                      style={({ pressed }) => [
                        styles.pickerOption,
                        {
                          backgroundColor: isSelected
                            ? colors.primaryBg
                            : colors.surfaceElevated,
                          borderColor: isSelected ? colors.primary : colors.cardBorder,
                        },
                        pressed && { opacity: 0.78 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          { color: isSelected ? colors.primary : colors.text },
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {isSelected && (
                        <Check size={16} color={colors.primary} strokeWidth={2.5} />
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 116,
  },
  headerContent: {
    paddingTop: 8,
    gap: 14,
  },
  refreshErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  refreshErrorText: {
    flex: 1,
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '700',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleAccent: {
    width: 4,
    height: 22,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  versionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  versionChipText: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  themeBtn: {
    width: 38,
    height: 38,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
  },
  filterPillText: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 2,
  },
  timelineTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timelineTitle: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDateText: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dayBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  dayBadgeText: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '800',
  },
  txItemWrapper: {
    marginBottom: 8,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyCard: {
    position: 'relative',
    marginTop: 20,
    borderRadius: HUD_RADIUS_LG,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontFamily: MONO_FONT,
    fontSize: 15,
    fontWeight: '800',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: HUD_RADIUS,
    marginTop: 8,
  },
  emptyActionText: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.68)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    position: 'relative',
    borderTopLeftRadius: HUD_RADIUS_LG,
    borderTopRightRadius: HUD_RADIUS_LG,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    maxHeight: '70%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pickerTitle: {
    fontFamily: MONO_FONT,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pickerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginBottom: 14,
  },
  segmentedTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentedTabText: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '700',
  },
  pickerScroll: {
    maxHeight: 360,
  },
  pickerEmptyText: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    marginBottom: 8,
  },
  pickerOptionText: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
