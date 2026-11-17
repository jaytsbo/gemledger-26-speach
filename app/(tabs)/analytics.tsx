import React, { useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronRight,
  Gamepad2,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  type LucideIcon,
  RotateCcw,
  Shirt,
  Tag,
  TrainFront,
  TrendingDown,
  TrendingUp,
  Utensils,
  Wallet,
  X,
} from 'lucide-react-native';
import { DonutChart } from '../../src/components/DonutChart';
import { TrendBarChart } from '../../src/components/TrendBarChart';
import { useLedgerStore } from '../../src/store/useLedgerStore';
import { getCategoryMeta } from '../../src/theme/colors';
import { useAppTheme } from '../../src/theme/ThemeContext';
import {
  computeCategoryStats,
  computeKPIStats,
  computeTrendStats,
  filterTransactions,
} from '../../src/utils/analytics';
import { formatMoney } from '../../src/utils/currency';

type TimeMode = 'all' | 'year' | 'month' | 'day';

const TIME_TABS: { key: TimeMode; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'year', label: '年' },
  { key: 'month', label: '月' },
  { key: 'day', label: '日' },
];

function getLocalDateOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  Utensils,
  Shirt,
  Home,
  TrainFront,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Wallet,
  TrendingUp,
  Landmark,
  HandCoins,
  RotateCcw,
  ArrowLeftRight,
  Tag,
};

function renderCategoryIcon(iconName: string, color: string, size = 18) {
  const IconComp = CATEGORY_ICON_MAP[iconName] || Tag;
  return <IconComp size={size} color={color} />;
}

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = Math.max(windowWidth - 32, 280);

  const transactions = useLedgerStore((s) => s.transactions);
  const exchangeRates = useLedgerStore((s) => s.exchangeRates);
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);

  const now = useMemo(() => new Date(), []);
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentYearMonth = `${currentYear}-${currentMonth}`;
  const todayStr = useMemo(() => getLocalDateOffset(0), []);
  const yesterdayStr = useMemo(() => getLocalDateOffset(-1), []);

  const [timeMode, setTimeMode] = useState<TimeMode>('month');
  const [selectedTimeValue, setSelectedTimeValue] = useState<string>(currentYearMonth);
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [pickerTimeTab, setPickerTimeTab] = useState<TimeMode>('month');

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isScrubbingChart, setIsScrubbingChart] = useState(false);
  const carouselRef = useRef<ScrollView>(null);

  const availableYears = useMemo(() => {
    const yearSet = new Set<string>([currentYear]);
    for (const tx of transactions) {
      const y = (tx.date || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) yearSet.add(y);
    }
    return Array.from(yearSet).sort((a, b) => b.localeCompare(a));
  }, [transactions, currentYear]);

  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>([currentYearMonth]);
    for (const tx of transactions) {
      const ym = (tx.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) monthSet.add(ym);
    }
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  }, [transactions, currentYearMonth]);

  const availableDays = useMemo(() => {
    const daySet = new Set<string>([todayStr]);
    for (const tx of transactions) {
      const d = (tx.date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) daySet.add(d);
    }
    return Array.from(daySet).sort((a, b) => b.localeCompare(a));
  }, [transactions, todayStr]);

  const trendGranularity: 'day' | 'month' =
    timeMode === 'month' || timeMode === 'day' ? 'day' : 'month';

  const scopedTransactions = useMemo(() => {
    if (timeMode === 'all') {
      return transactions;
    }
    if (timeMode === 'year') {
      return filterTransactions(transactions, {
        year: selectedTimeValue,
        month: 'ALL',
        date: '',
        account: 'ALL',
        category: 'ALL',
        currency: 'ALL',
        searchQuery: '',
      });
    }
    if (timeMode === 'month') {
      const [y, m] = selectedTimeValue.split('-');
      return filterTransactions(transactions, {
        year: y || currentYear,
        month: m || currentMonth,
        date: '',
        account: 'ALL',
        category: 'ALL',
        currency: 'ALL',
        searchQuery: '',
      });
    }
    return filterTransactions(transactions, {
      year: 'ALL',
      month: 'ALL',
      date: selectedTimeValue,
      account: 'ALL',
      category: 'ALL',
      currency: 'ALL',
      searchQuery: '',
    });
  }, [transactions, timeMode, selectedTimeValue, currentYear, currentMonth]);

  const kpi = useMemo(
    () =>
      computeKPIStats(
        scopedTransactions,
        baseCurrency,
        exchangeRates,
        transactions,
      ),
    [scopedTransactions, baseCurrency, exchangeRates, transactions],
  );

  const categoryStats = useMemo(
    () => computeCategoryStats(scopedTransactions, baseCurrency, exchangeRates),
    [scopedTransactions, baseCurrency, exchangeRates],
  );

  const trendStats = useMemo(() => {
    const filtered = selectedCategory
      ? scopedTransactions.filter((tx) => (tx.category || '').trim() === selectedCategory)
      : scopedTransactions;
    console.log(
      `[AnalyticsScreen/trendStats] Compute - Category:${selectedCategory ?? 'ALL'}, Count:${filtered.length}`,
    );
    return computeTrendStats(
      filtered,
      baseCurrency,
      exchangeRates,
      trendGranularity,
    );
  }, [scopedTransactions, selectedCategory, baseCurrency, exchangeRates, trendGranularity]);

  const timePillLabel = useMemo(() => {
    if (timeMode === 'all') return '全部';
    if (timeMode === 'year') return `年: ${selectedTimeValue}`;
    if (timeMode === 'month') return `月: ${selectedTimeValue}`;
    const shortDay =
      selectedTimeValue.length >= 10 ? selectedTimeValue.slice(5) : selectedTimeValue;
    return `日: ${shortDay}`;
  }, [timeMode, selectedTimeValue]);

  const pickerOptions = useMemo(() => {
    if (pickerTimeTab === 'all') {
      return {
        selected: timeMode === 'all' ? 'ALL' : '',
        options: [{ value: 'ALL', label: '全部歷史紀錄' }],
      };
    }
    if (pickerTimeTab === 'year') {
      return {
        selected: timeMode === 'year' ? selectedTimeValue : '',
        options: availableYears.map((y) => ({ value: y, label: `${y} 年` })),
      };
    }
    if (pickerTimeTab === 'month') {
      return {
        selected: timeMode === 'month' ? selectedTimeValue : '',
        options: availableMonths.map((ym) => ({
          value: ym,
          label: ym === currentYearMonth ? `${ym} (本月)` : ym,
        })),
      };
    }
    return {
      selected: timeMode === 'day' ? selectedTimeValue : '',
      options: availableDays.map((d) => {
        const tag = d === todayStr ? ' (今天)' : d === yesterdayStr ? ' (昨天)' : '';
        return { value: d, label: `${d}${tag}` };
      }),
    };
  }, [
    pickerTimeTab,
    timeMode,
    selectedTimeValue,
    availableYears,
    availableMonths,
    availableDays,
    currentYearMonth,
    todayStr,
    yesterdayStr,
  ]);

  const handleOpenTimeModal = () => {
    console.log(`[AnalyticsScreen/openTimeModal] Open - CurrentMode:${timeMode}, Value:${selectedTimeValue}`);
    setPickerTimeTab(timeMode);
    setTimeModalOpen(true);
  };

  const handleSelectTimeOption = (value: string) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    console.log(`[AnalyticsScreen/selectTime] Update - Mode:${pickerTimeTab}, Value:${value}`);
    setTimeMode(pickerTimeTab);
    setSelectedTimeValue(value);
    setSelectedCategory(null);
    setTimeModalOpen(false);
  };

  const handleToggleCategory = (catName: string | null) => {
    console.log(`[AnalyticsScreen/selectCategory] Toggle - Category:${catName ?? 'RESET'}`);
    setSelectedCategory(catName);
  };

  const handleJumpToSlide = (slideIndex: number) => {
    console.log(`[AnalyticsScreen/carousel] Jump - Slide:${slideIndex}`);
    carouselRef.current?.scrollTo({ x: slideIndex * containerWidth, animated: true });
    setActiveSlide(slideIndex);
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
      >
        {/* Top Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>統計分析</Text>

          <Pressable
            onPress={handleOpenTimeModal}
            style={[
              styles.timeFilterPill,
              {
                backgroundColor:
                  timeMode !== 'all' ? colors.primaryLight : colors.surface,
                borderColor:
                  timeMode !== 'all' ? colors.primary : colors.border,
              },
            ]}
          >
            <Calendar
              size={14}
              color={timeMode !== 'all' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.timeFilterPillText,
                {
                  color: timeMode !== 'all' ? colors.primary : colors.textSecondary,
                },
              ]}
            >
              {timePillLabel}
            </Text>
          </Pressable>
        </View>

        {/* Net Cashflow + Income/Expense Summary Card */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.cashflowHeader}>
            <View style={styles.cashflowValueGroup}>
              <Wallet
                size={18}
                color={colors.textMuted}
                accessibilityLabel="期間淨現金流"
              />
              <Text
                style={[
                  styles.netCashflowValue,
                  {
                    color: kpi.netCashflow >= 0 ? colors.income : colors.expense,
                  },
                ]}
              >
                {kpi.netCashflow >= 0 ? '+' : ''}
                {formatMoney(kpi.netCashflow, baseCurrency)}
              </Text>
            </View>
            <View
              style={[
                styles.cashflowIconBadge,
                {
                  backgroundColor:
                    kpi.netCashflow >= 0 ? colors.incomeBg : colors.expenseBg,
                },
              ]}
            >
              {kpi.netCashflow >= 0 ? (
                <TrendingUp size={20} color={colors.income} />
              ) : (
                <TrendingDown size={20} color={colors.expense} />
              )}
            </View>
          </View>

          <View style={styles.kpiSplitRow}>
            <View
              style={[
                styles.kpiPill,
                { backgroundColor: colors.incomeBg },
              ]}
            >
              <ArrowUpRight
                size={16}
                color={colors.income}
                accessibilityLabel="實質總收入"
              />
              <Text style={[styles.kpiPillValue, { color: colors.income }]}>
                +{formatMoney(kpi.realIncome, baseCurrency)}
              </Text>
            </View>
            <View
              style={[
                styles.kpiPill,
                { backgroundColor: colors.expenseBg },
              ]}
            >
              <ArrowDownRight
                size={16}
                color={colors.expense}
                accessibilityLabel="實質總支出"
              />
              <Text style={[styles.kpiPillValue, { color: colors.expense }]}>
                -{formatMoney(kpi.realExpense, baseCurrency)}
              </Text>
            </View>
          </View>
        </View>

        {/* Swipeable Chart Carousel */}
        <View style={styles.carouselContainer}>
          <ScrollView
            ref={carouselRef}
            horizontal
            pagingEnabled
            scrollEnabled={!isScrubbingChart}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
              if (page !== activeSlide) {
                console.log(`[AnalyticsScreen/carousel] Swipe - Slide:${page}`);
                setActiveSlide(page);
              }
            }}
          >
            {/* Slide 0: Donut Chart + Category Ranking Card */}
            <View style={{ width: containerWidth }}>
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    支出分類結構
                  </Text>
                  <View style={styles.sectionHeaderRight}>
                    {selectedCategory ? (
                      <Pressable
                        onPress={() => handleToggleCategory(null)}
                        style={[styles.clearChip, { backgroundColor: colors.chipBg }]}
                      >
                        <Text style={[styles.clearChipText, { color: colors.primary }]}>
                          重設焦點
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => handleJumpToSlide(1)}
                      hitSlop={8}
                      accessibilityLabel="前往收支趨勢"
                      style={[
                        styles.carouselJumpBtn,
                        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                      ]}
                    >
                      <ChevronRight size={16} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.donutWrap}>
                  <DonutChart
                    data={categoryStats}
                    totalAmount={kpi.realExpense}
                    baseCurrency={baseCurrency}
                    selectedCategory={selectedCategory}
                    onSelectCategory={handleToggleCategory}
                  />
                </View>

                {/* Category Ranking List */}
                {categoryStats.length === 0 ? (
                  <View style={styles.emptyCategoryBox}>
                    <Text style={[styles.emptyCategoryText, { color: colors.textMuted }]}>
                      此期間內尚無實質支出分類紀錄
                    </Text>
                  </View>
                ) : (
                  <View style={styles.rankingList}>
                    {categoryStats.map((cat, idx) => {
                      const isSelected = selectedCategory === cat.category;
                      const isDimmed = Boolean(selectedCategory) && !isSelected;
                      const meta = getCategoryMeta(cat.category);

                      return (
                        <Pressable
                          key={cat.category}
                          onPress={() =>
                            handleToggleCategory(isSelected ? null : cat.category)
                          }
                          style={[
                            styles.rankingRow,
                            {
                              backgroundColor: isSelected
                                ? colors.surfaceElevated
                                : 'transparent',
                              borderColor: isSelected ? cat.color : colors.divider,
                              opacity: isDimmed ? 0.5 : 1,
                            },
                          ]}
                        >
                          <View style={styles.rankingTop}>
                            <View style={styles.rankingLeft}>
                              <Text style={[styles.rankIndex, { color: colors.textMuted }]}>
                                {idx + 1}
                              </Text>
                              <View
                                style={[
                                  styles.catIconBadge,
                                  { backgroundColor: meta.bgColor },
                                ]}
                              >
                                {renderCategoryIcon(cat.icon, cat.color, 16)}
                              </View>
                              <View>
                                <Text style={[styles.catName, { color: colors.text }]}>
                                  {cat.category}
                                </Text>
                                <Text style={[styles.catCount, { color: colors.textMuted }]}>
                                  {cat.count} 筆交易
                                </Text>
                              </View>
                            </View>

                            <View style={styles.rankingRight}>
                              <Text style={[styles.catAmount, { color: colors.text }]}>
                                {formatMoney(cat.amount, baseCurrency)}
                              </Text>
                              <View
                                style={[
                                  styles.pctPill,
                                  { backgroundColor: `${cat.color}20` },
                                ]}
                              >
                                <Text style={[styles.pctText, { color: cat.color }]}>
                                  {cat.percentage.toFixed(1)}%
                                </Text>
                              </View>
                            </View>
                          </View>

                          <View
                            style={[
                              styles.catBarTrack,
                              { backgroundColor: colors.divider },
                            ]}
                          >
                            <View
                              style={[
                                styles.catBarFill,
                                {
                                  width: `${Math.min(100, Math.max(2, cat.percentage))}%`,
                                  backgroundColor: cat.color,
                                },
                              ]}
                            />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            {/* Slide 1: Trend Bar Chart */}
            <View style={{ width: containerWidth }}>
              <TrendBarChart
                data={trendStats}
                granularity={trendGranularity}
                baseCurrency={baseCurrency}
                isSingleDay={timeMode === 'day'}
                onScrubbingChange={setIsScrubbingChart}
                onSwipePrev={() => {
                  handleJumpToSlide(0);
                }}
              />
            </View>
          </ScrollView>

          {/* Pagination Dots */}
          <View style={styles.paginationDotsRow}>
            {[0, 1].map((idx) => {
              const active = activeSlide === idx;
              return (
                <Pressable
                  key={idx}
                  onPress={() => handleJumpToSlide(idx)}
                  hitSlop={8}
                  style={[
                    styles.paginationDot,
                    {
                      width: active ? 18 : 7,
                      backgroundColor: active ? colors.primary : colors.border,
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Home-style Time Filter Modal */}
      <Modal
        visible={timeModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTimeModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setTimeModalOpen(false)}
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
                篩選時間
              </Text>
              <Pressable
                onPress={() => setTimeModalOpen(false)}
                style={[styles.pickerCloseBtn, { backgroundColor: colors.chipBg }]}
              >
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

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

            <ScrollView
              style={styles.pickerScroll}
              showsVerticalScrollIndicator={false}
            >
              {pickerOptions.options.length === 0 ? (
                <Text style={[styles.pickerEmptyText, { color: colors.textMuted }]}>
                  目前沒有可選擇的資料
                </Text>
              ) : (
                pickerOptions.options.map((opt) => {
                  const isSelected = opt.value === pickerOptions.selected;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => handleSelectTimeOption(opt.value)}
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
  timeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  timeFilterPillText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  cashflowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cashflowValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  netCashflowValue: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  cashflowIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiSplitRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiPill: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  kpiPillValue: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  carouselContainer: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  carouselJumpBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  paginationDot: {
    height: 7,
    borderRadius: 999,
  },
  clearChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  clearChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  donutWrap: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCategoryBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyCategoryText: {
    fontSize: 13,
    fontWeight: '500',
  },
  rankingList: {
    marginTop: 12,
    gap: 10,
  },
  rankingRow: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  rankingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rankingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rankIndex: {
    width: 16,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  catIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: {
    fontSize: 14,
    fontWeight: '700',
  },
  catCount: {
    fontSize: 11,
    marginTop: 1,
  },
  rankingRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  catAmount: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pctPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pctText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  catBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: 3,
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
