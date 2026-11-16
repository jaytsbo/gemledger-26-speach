import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
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
import { useLedgerStore } from '@/store/useLedgerStore';
import { useAppTheme } from '@/theme/ThemeContext';
import { Transaction } from '@/types/ledger';
import {
  DateGroupedSection,
  computeKPIStats,
  groupTransactionsByDate,
} from '@/utils/analytics';
import { formatMoney } from '@/utils/currency';

type PickerType = 'time' | 'account' | 'category' | null;
type TimeMode = 'recent' | 'year' | 'month' | 'day';

const TIME_TABS: { key: TimeMode; label: string }[] = [
  { key: 'recent', label: '近兩日' },
  { key: 'year', label: '年' },
  { key: 'month', label: '月' },
  { key: 'day', label: '日' },
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function getLocalDateOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateHeader(dateStr: string): { title: string; badge?: string } {
  const today = getLocalDateOffset(0);
  const yesterday = getLocalDateOffset(-1);
  let badge: string | undefined;
  if (dateStr === today) badge = '今天';
  else if (dateStr === yesterday) badge = '昨天';

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

  const displayTransactions = useMemo(() => {
    const hasSearch = Boolean(filters.searchQuery.trim());
    const hasAccOrCat = filters.account !== 'ALL' || filters.category !== 'ALL';
    if (timeMode === 'recent' && !hasSearch && !hasAccOrCat) {
      const today = getLocalDateOffset(0);
      const yesterday = getLocalDateOffset(-1);
      return filteredTransactions.filter(
        (tx) => tx.date === today || tx.date === yesterday,
      );
    }
    return filteredTransactions;
  }, [filteredTransactions, timeMode, filters.searchQuery, filters.account, filters.category]);

  const kpiStats = useMemo(
    () => computeKPIStats(displayTransactions, baseCurrency, exchangeRates, transactions),
    [displayTransactions, baseCurrency, exchangeRates, transactions],
  );

  const sections = useMemo(
    () => groupTransactionsByDate(displayTransactions, baseCurrency, exchangeRates),
    [displayTransactions, baseCurrency, exchangeRates],
  );

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const tx of transactions) {
      if (tx.date && tx.date.length >= 4) {
        set.add(tx.date.slice(0, 4));
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const tx of transactions) {
      if (tx.date && tx.date.length >= 7) {
        set.add(tx.date.slice(0, 7));
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const availableDays = useMemo(() => {
    const set = new Set<string>();
    for (const tx of transactions) {
      if (tx.date && tx.date.length >= 10) {
        set.add(tx.date.slice(0, 10));
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const hasActiveFilters = useMemo(() => {
    return (
      timeMode !== 'recent' ||
      filters.account !== 'ALL' ||
      filters.category !== 'ALL' ||
      Boolean(filters.searchQuery.trim())
    );
  }, [timeMode, filters.account, filters.category, filters.searchQuery]);

  const periodLabel = useMemo(() => {
    if (timeMode === 'day' && selectedTimeValue) return selectedTimeValue;
    if (timeMode === 'month' && selectedTimeValue) return selectedTimeValue;
    if (timeMode === 'year' && selectedTimeValue) return `${selectedTimeValue}年`;
    if (filters.account !== 'ALL') return filters.account;
    if (filters.category !== 'ALL') return filters.category;
    if (Boolean(filters.searchQuery.trim())) return '全部期間';
    return '近兩日';
  }, [timeMode, selectedTimeValue, filters.account, filters.category, filters.searchQuery]);

  const timePillLabel = useMemo(() => {
    if (timeMode === 'recent') return '時間: 近兩日';
    return `時間: ${selectedTimeValue}`;
  }, [timeMode, selectedTimeValue]);

  const handleRefresh = async () => {
    setRefreshing(true);
    console.log('[HomeScreen/refresh] Request - Pull-to-refresh');
    try {
      await refreshAll(true);
    } catch (err) {
      console.warn('[HomeScreen/refresh] Error -', err);
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
      const today = getLocalDateOffset(0);
      const yesterday = getLocalDateOffset(-1);
      return {
        title: '篩選時間',
        selected: timeMode === 'day' ? selectedTimeValue : '',
        options: availableDays.map((d) => {
          const tag = d === today ? ' (今天)' : d === yesterday ? ' (昨天)' : '';
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
          <Text style={[styles.brandTitle, { color: colors.text }]}>GemLedger</Text>
          <View style={[styles.versionChip, { backgroundColor: colors.primaryLight }]}>
            <Sparkles size={11} color={colors.primary} />
            <Text style={[styles.versionChipText, { color: colors.primary }]}>AI 26</Text>
          </View>
        </View>

        <Pressable
          onPress={toggleTheme}
          style={({ pressed }) => [
            styles.themeBtn,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
            pressed && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="切換深淺色主題"
        >
          {isDark ? (
            <Sun size={18} color={colors.warning} />
          ) : (
            <Moon size={18} color={colors.textSecondary} />
          )}
        </Pressable>
      </View>

      {/* Net Worth Hero Card */}
      <NetWorthHeroCard stats={kpiStats} periodLabel={periodLabel} />

      {/* Search Bar */}
      <View
        style={[
          styles.searchContainer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Search size={17} color={colors.textMuted} />
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
                timeMode !== 'recent' ? colors.primaryLight : colors.surface,
              borderColor:
                timeMode !== 'recent' ? colors.primary : colors.border,
            },
          ]}
        >
          <Calendar
            size={13}
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
                filters.account !== 'ALL' ? colors.primaryLight : colors.surface,
              borderColor: filters.account !== 'ALL' ? colors.primary : colors.border,
            },
          ]}
        >
          <Landmark
            size={13}
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
            {filters.account === 'ALL' ? '帳戶: 全部' : filters.account}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActivePicker('category')}
          style={[
            styles.filterPill,
            {
              backgroundColor:
                filters.category !== 'ALL' ? colors.primaryLight : colors.surface,
              borderColor: filters.category !== 'ALL' ? colors.primary : colors.border,
            },
          ]}
        >
          <Tag
            size={13}
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
            {filters.category === 'ALL' ? '分類: 全部' : filters.category}
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
            <RotateCcw size={13} color={colors.expense} />
            <Text style={[styles.filterPillText, { color: colors.expense }]}>重置篩選</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Timeline Section Title */}
      <View style={styles.timelineTitleRow}>
        <View style={styles.timelineTitleLeft}>
          <Filter size={14} color={colors.textMuted} />
          <Text style={[styles.timelineTitle, { color: colors.textSecondary }]}>
            交易明細時間軸
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <SectionList<Transaction, DateGroupedSection>
        sections={sections}
        keyExtractor={(item, index) => String(item.id ?? item.rowNumber ?? index)}
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
        renderSectionHeader={({ section }) => {
          const { title, badge } = formatDateHeader(section.date);
          return (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={[styles.sectionDateText, { color: colors.textSecondary }]}>
                  {title}
                </Text>
                {Boolean(badge) && (
                  <View style={[styles.dayBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.dayBadgeText, { color: colors.primary }]}>
                      {badge}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
        renderItem={({ item }) => (
          <View style={styles.txItemWrapper}>
            <TransactionCard
              transaction={item}
              baseCurrency={baseCurrency}
              exchangeRates={exchangeRates}
            />
          </View>
        )}
        ListEmptyComponent={
          isLoading && !initialized ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                正在載入帳本資料...
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {hasActiveFilters ? '沒有符合篩選條件的交易' : '尚無記帳資料'}
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
                  <RotateCcw size={15} color="#FFFFFF" />
                  <Text style={styles.emptyActionText}>重置所有篩選</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => router.push('/quick-add')}
                  style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
                >
                  <Plus size={15} color="#FFFFFF" />
                  <Text style={styles.emptyActionText}>立即記一筆</Text>
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
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>
                {pickerConfig?.title || '選擇篩選'}
              </Text>
              <Pressable
                onPress={() => setActivePicker(null)}
                style={[styles.pickerCloseBtn, { backgroundColor: colors.chipBg }]}
              >
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {activePicker === 'time' && (
              <View
                style={[
                  styles.segmentedTabsRow,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
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
                          backgroundColor: colors.primaryLight,
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
                            ? colors.primaryLight
                            : colors.surfaceElevated,
                          borderColor: isSelected ? colors.primary : colors.border,
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
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 116,
  },
  headerContent: {
    paddingTop: 8,
    gap: 14,
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
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  versionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  versionChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  themeBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
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
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
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
    fontSize: 13,
    fontWeight: '700',
  },
  engelBadge: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
    gap: 6,
  },
  sectionDateText: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dayBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  dayBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  sectionSubtotals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayIncomeText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dayExpenseText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
    marginTop: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
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
    borderRadius: 14,
    marginTop: 8,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.56)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
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
    fontSize: 17,
    fontWeight: '700',
  },
  pickerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentedTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pickerScroll: {
    maxHeight: 360,
  },
  pickerEmptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  pickerOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
