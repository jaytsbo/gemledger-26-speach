import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Animated,
  Easing,
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
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react-native';
import { DonutChart } from '../../src/components/DonutChart';
import { LedgerIcon } from '../../src/components/LedgerIcon';
import { TrendBarChart } from '../../src/components/TrendBarChart';
import { CyberNeuralBackground } from '../../src/components/ui/CyberNeuralBackground';
import { HudReticle, MONO_FONT } from '../../src/components/ui/HudReticle';
import { SpringPressable } from '../../src/components/ui/SpringPressable';
import { SpringSegmentedControl } from '../../src/components/ui/SpringSegmentedControl';
import { useLedgerStore } from '../../src/store/useLedgerStore';
import {
  HUD_RADIUS,
  HUD_RADIUS_LG,
  getAccountMeta,
  getCategoryMeta,
} from '../../src/theme/colors';
import { useAppTheme } from '../../src/theme/ThemeContext';
import {
  BreakdownDimension,
  FlowType,
  computeFlowBreakdown,
  computeKPIStats,
  computeTrendStats,
  extractAvailableTimeBuckets,
  filterTransactions,
} from '../../src/utils/analytics';
import { formatMoney } from '../../src/utils/currency';
import { getLocalDateOffset } from '../../src/utils/dateTime';

type TimeMode = 'all' | 'year' | 'month' | 'day';

type SelectedBreakdown = {
  flow: FlowType;
  dimension: BreakdownDimension;
  key: string;
} | null;

const BREAKDOWN_TITLES: Record<FlowType, Record<BreakdownDimension, string>> = {
  expense: {
    category: '支出結構 · 分類',
    account: '支出結構 · 帳戶',
  },
  income: {
    category: '收入結構 · 分類',
    account: '收入結構 · 帳戶',
  },
};

const TIME_TABS: { key: TimeMode; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'year', label: '年' },
  { key: 'month', label: '月' },
  { key: 'day', label: '日' },
];

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = Math.max(windowWidth - 32, 280);

  const transactions = useLedgerStore((s) => s.transactions);
  const settings = useLedgerStore((s) => s.settings);
  const exchangeRates = useLedgerStore((s) => s.exchangeRates);
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);

  const [todayStr, setTodayStr] = useState(() => getLocalDateOffset(0));
  const [yesterdayStr, setYesterdayStr] = useState(() => getLocalDateOffset(-1));

  useFocusEffect(
    useCallback(() => {
      const nextToday = getLocalDateOffset(0);
      const nextYesterday = getLocalDateOffset(-1);
      setTodayStr((prev) => (prev !== nextToday ? nextToday : prev));
      setYesterdayStr((prev) => (prev !== nextYesterday ? nextYesterday : prev));
    }, []),
  );

  const currentYear = todayStr.slice(0, 4);
  const currentMonth = todayStr.slice(5, 7);
  const currentYearMonth = todayStr.slice(0, 7);

  const [timeMode, setTimeMode] = useState<TimeMode>('month');
  const [selectedTimeValue, setSelectedTimeValue] = useState<string>(() => getLocalDateOffset(0).slice(0, 7));
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [pickerTimeTab, setPickerTimeTab] = useState<TimeMode>('month');

  const [flow, setFlow] = useState<FlowType>('expense');
  const [dimension, setDimension] = useState<BreakdownDimension>('category');
  const [selectedSlice, setSelectedSlice] = useState<SelectedBreakdown>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isScrubbingChart, setIsScrubbingChart] = useState(false);
  const carouselRef = useRef<ScrollView>(null);
  const scrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scrollSettleTimerRef.current) {
        clearTimeout(scrollSettleTimerRef.current);
      }
    };
  }, []);

  const {
    years: availableYears,
    months: availableMonths,
    days: availableDays,
  } = useMemo(
    () =>
      extractAvailableTimeBuckets(transactions, {
        year: currentYear,
        month: currentYearMonth,
        day: todayStr,
      }),
    [transactions, currentYear, currentYearMonth, todayStr],
  );

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

  const breakdownStats = useMemo(
    () =>
      computeFlowBreakdown(
        scopedTransactions,
        flow,
        dimension,
        baseCurrency,
        exchangeRates,
      ),
    [scopedTransactions, flow, dimension, baseCurrency, exchangeRates],
  );

  const orbOpacityAnim = useRef(new Animated.Value(0.35)).current;
  const rankingBarAnim = useRef(new Animated.Value(0)).current;
  const prevKpiRef = useRef({
    netCashflow: 0,
    realIncome: 0,
    realExpense: 0,
  });
  const [displayKpi, setDisplayKpi] = useState(() => ({
    netCashflow: kpi.netCashflow,
    realIncome: kpi.realIncome,
    realExpense: kpi.realExpense,
  }));

  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    orbOpacityAnim.setValue(0.35);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbOpacityAnim, {
          toValue: 0.85,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(orbOpacityAnim, {
          toValue: 0.35,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [orbOpacityAnim]);

  useEffect(() => {
    let rafId: number | null = null;
    const duration = 480;
    const startTime = Date.now();
    const fromNet = prevKpiRef.current.netCashflow;
    const fromInc = prevKpiRef.current.realIncome;
    const fromExp = prevKpiRef.current.realExpense;
    const toNet = kpi.netCashflow;
    const toInc = kpi.realIncome;
    const toExp = kpi.realExpense;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const curNet = fromNet + (toNet - fromNet) * eased;
      const curInc = fromInc + (toInc - fromInc) * eased;
      const curExp = fromExp + (toExp - fromExp) * eased;
      prevKpiRef.current = {
        netCashflow: curNet,
        realIncome: curInc,
        realExpense: curExp,
      };
      setDisplayKpi({
        netCashflow: curNet,
        realIncome: curInc,
        realExpense: curExp,
      });
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        prevKpiRef.current = {
          netCashflow: toNet,
          realIncome: toInc,
          realExpense: toExp,
        };
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [kpi.netCashflow, kpi.realIncome, kpi.realExpense]);

  useEffect(() => {
    rankingBarAnim.setValue(0);
    const barTiming = Animated.timing(rankingBarAnim, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    barTiming.start();
    return () => {
      barTiming.stop();
    };
  }, [breakdownStats, flow, dimension, rankingBarAnim]);

  useEffect(() => {
    if (!selectedSlice) return;
    if (
      selectedSlice.flow !== flow ||
      selectedSlice.dimension !== dimension ||
      !breakdownStats.some((item) => item.key === selectedSlice.key)
    ) {
      console.log(
        `[AnalyticsScreen/sliceSync] Reset - Stale selection cleared:${selectedSlice.flow}/${selectedSlice.dimension}/${selectedSlice.key}`,
      );
      setSelectedSlice(null);
    }
  }, [breakdownStats, selectedSlice, flow, dimension]);

  const activeSelectedKey =
    selectedSlice &&
    selectedSlice.flow === flow &&
    selectedSlice.dimension === dimension
      ? selectedSlice.key
      : null;

  const trendStats = useMemo(() => {
    const filtered = selectedSlice
      ? scopedTransactions.filter((tx) => {
          const txKey =
            selectedSlice.dimension === 'category'
              ? (tx.category || '').trim() || '未分類'
              : (tx.account || '').trim() || '現金';
          return txKey === selectedSlice.key;
        })
      : scopedTransactions;
    console.log(
      `[AnalyticsScreen/trendStats] Compute - Filter:${selectedSlice ? `${selectedSlice.dimension}:${selectedSlice.key}` : 'ALL'}, Count:${filtered.length}`,
    );
    return computeTrendStats(
      filtered,
      baseCurrency,
      exchangeRates,
      trendGranularity,
    );
  }, [scopedTransactions, selectedSlice, baseCurrency, exchangeRates, trendGranularity]);

  const flowOptions = useMemo(
    () => [
      { value: 'expense' as FlowType, label: '支出 (−)', activeColor: colors.expense },
      { value: 'income' as FlowType, label: '收入 (+)', activeColor: colors.income },
    ],
    [colors.expense, colors.income],
  );

  const dimensionOptions = useMemo(
    () => [
      { value: 'category' as BreakdownDimension, label: '按分類', activeColor: colors.primary },
      { value: 'account' as BreakdownDimension, label: '按帳戶', activeColor: colors.primary },
    ],
    [colors.primary],
  );

  const timePillLabel = useMemo(() => {
    if (timeMode === 'all') return '全部期間';
    if (timeMode === 'year') return `年 · ${selectedTimeValue}`;
    if (timeMode === 'month') return `月 · ${selectedTimeValue}`;
    const shortDay =
      selectedTimeValue.length >= 10 ? selectedTimeValue.slice(5) : selectedTimeValue;
    return `日 · ${shortDay}`;
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
    setSelectedSlice(null);
    setTimeModalOpen(false);
  };

  const handleChangeFlow = useCallback((nextFlow: FlowType) => {
    console.log(`[AnalyticsScreen/switchFlow] Update - Flow:${nextFlow}`);
    setFlow(nextFlow);
    setSelectedSlice(null);
  }, []);

  const handleChangeDimension = useCallback((nextDim: BreakdownDimension) => {
    console.log(`[AnalyticsScreen/switchDimension] Update - Dimension:${nextDim}`);
    setDimension(nextDim);
    setSelectedSlice(null);
  }, []);

  const handleToggleSlice = useCallback(
    (key: string | null) => {
      console.log(
        `[AnalyticsScreen/selectSlice] Toggle - Flow:${flow}, Dim:${dimension}, Key:${key ?? 'RESET'}`,
      );
      if (!key) {
        setSelectedSlice(null);
        return;
      }
      setSelectedSlice({ flow, dimension, key });
    },
    [flow, dimension],
  );

  const handleJumpToSlide = (slideIndex: number) => {
    console.log(`[AnalyticsScreen/carousel] Jump - Slide:${slideIndex}`);
    carouselRef.current?.scrollTo({ x: slideIndex * containerWidth, animated: true });
    setActiveSlide(slideIndex);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <CyberNeuralBackground />
      <ScrollView
        style={styles.transparentBg}
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
          <View style={styles.headerTitleWrap}>
            <View
              style={[
                styles.titleAccent,
                {
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: isDark ? 0.65 : 0.3,
                  shadowRadius: 8,
                },
              ]}
            />
            <Text style={[styles.pageTitle, { color: colors.text }]}>
              統計分析
            </Text>
          </View>

          <Pressable
            onPress={handleOpenTimeModal}
            style={[
              styles.timeFilterPill,
              {
                backgroundColor:
                  timeMode !== 'all' ? colors.primaryBg : colors.surfaceElevated,
                borderColor:
                  timeMode !== 'all' ? colors.primary : colors.cardBorder,
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

        {/* Net Cashflow + Income/Expense Summary Card (Upper Electric Cyan Core) */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? 'rgba(0, 240, 255, 0.48)' : colors.primary,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: isDark ? 0.28 : 0.1,
              shadowRadius: 16,
              elevation: 5,
            },
          ]}
        >
          {/* Clipped Diagonal Cyan-to-Violet Wash + Breathing Radial Cyan Orb + 2px Top Cyan Accent Strip */}
          <View style={[StyleSheet.absoluteFill, styles.cardBgClip]} pointerEvents="none">
            <Svg width="100%" height="100%" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="analyticsCyanVioletWash" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={colors.primary} stopOpacity={isDark ? 0.14 : 0.08} />
                  <Stop offset="58%" stopColor={colors.accent} stopOpacity={isDark ? 0.08 : 0.04} />
                  <Stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#analyticsCyanVioletWash)" />
            </Svg>
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { opacity: orbOpacityAnim }]}
            >
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <RadialGradient id="analyticsCyanOrb" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor={colors.primary} stopOpacity={isDark ? 0.24 : 0.14} />
                    <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx="88%" cy="22%" r="105" fill="url(#analyticsCyanOrb)" />
              </Svg>
            </Animated.View>
            <View style={[styles.topAccentStrip, { backgroundColor: colors.primary }]} />
          </View>

          <HudReticle variant="primary" />

          <View style={styles.cashflowHeader}>
            <View style={styles.cashflowValueBlock}>
              <Wallet
                size={18}
                color={colors.primary}
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
                {formatMoney(displayKpi.netCashflow, baseCurrency)}
              </Text>
            </View>
            <View
              style={[
                styles.cashflowIconBadge,
                {
                  backgroundColor:
                    kpi.netCashflow >= 0 ? colors.incomeBg : colors.expenseBg,
                  borderColor:
                    kpi.netCashflow >= 0
                      ? `${colors.income}55`
                      : `${colors.expense}55`,
                },
              ]}
            >
              {kpi.netCashflow >= 0 ? (
                <TrendingUp size={18} color={colors.income} />
              ) : (
                <TrendingDown size={18} color={colors.expense} />
              )}
            </View>
          </View>

          <View style={styles.kpiSplitRow}>
            <View
              style={[
                styles.kpiPill,
                {
                  backgroundColor: colors.incomeBg,
                  borderColor: `${colors.income}45`,
                },
              ]}
            >
              <ArrowUpRight
                size={16}
                color={colors.income}
                accessibilityLabel="實質總收入"
              />
              <Text style={[styles.kpiPillValue, { color: colors.income }]}>
                +{formatMoney(displayKpi.realIncome, baseCurrency)}
              </Text>
            </View>
            <View
              style={[
                styles.kpiPill,
                {
                  backgroundColor: colors.expenseBg,
                  borderColor: `${colors.expense}45`,
                },
              ]}
            >
              <ArrowDownRight
                size={16}
                color={colors.expense}
                accessibilityLabel="實質總支出"
              />
              <Text style={[styles.kpiPillValue, { color: colors.expense }]}>
                -{formatMoney(displayKpi.realExpense, baseCurrency)}
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
            scrollEventThrottle={32}
            onScroll={(e) => {
              const offsetX = e.nativeEvent.contentOffset.x;
              if (scrollSettleTimerRef.current) clearTimeout(scrollSettleTimerRef.current);
              scrollSettleTimerRef.current = setTimeout(() => {
                if (containerWidth <= 0) return;
                const page = Math.max(0, Math.min(1, Math.round(offsetX / containerWidth)));
                setActiveSlide((prev) => {
                  if (prev !== page) {
                    console.log(`[AnalyticsScreen/carousel] ScrollSync - Slide:${page}`);
                  }
                  return page;
                });
              }, 90);
            }}
            onMomentumScrollEnd={(e) => {
              if (scrollSettleTimerRef.current) {
                clearTimeout(scrollSettleTimerRef.current);
                scrollSettleTimerRef.current = null;
              }
              const page = Math.max(
                0,
                Math.min(1, Math.round(e.nativeEvent.contentOffset.x / containerWidth)),
              );
              if (page !== activeSlide) {
                console.log(`[AnalyticsScreen/carousel] Swipe - Slide:${page}`);
                setActiveSlide(page);
              }
            }}
          >
            {/* Slide 0: Donut Chart + Breakdown Ranking Card (Lower Nebula Violet Core) */}
            <View style={{ width: containerWidth }}>
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: isDark ? 'rgba(139, 92, 246, 0.50)' : colors.accent,
                    shadowColor: colors.accent,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: isDark ? 0.28 : 0.1,
                    shadowRadius: 16,
                    elevation: 4,
                  },
                ]}
              >
                {/* Clipped Nebula Violet Top-Right Radial Glow & 2px Top Violet Accent Strip */}
                <View style={[StyleSheet.absoluteFill, styles.cardBgClip]} pointerEvents="none">
                  <Svg width="100%" height="100%" preserveAspectRatio="none">
                    <Defs>
                      <RadialGradient id="analyticsBreakdownVioletGlow" cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.15} />
                        <Stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                      </RadialGradient>
                    </Defs>
                    <Circle cx="90%" cy="14%" r="125" fill="url(#analyticsBreakdownVioletGlow)" />
                  </Svg>
                  <View style={[styles.topAccentStrip, { backgroundColor: colors.accent }]} />
                </View>

                <HudReticle variant="accent" />

                <View style={styles.sectionHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {BREAKDOWN_TITLES[flow][dimension]}
                  </Text>
                  <View style={styles.sectionHeaderRight}>
                    {activeSelectedKey ? (
                      <SpringPressable
                        onPress={() => handleToggleSlice(null)}
                        pressedScale={0.95}
                        haptic="selection"
                        style={[
                          styles.clearChip,
                          {
                            backgroundColor: colors.primaryBg,
                            borderColor: colors.primary,
                          },
                        ]}
                      >
                        <Text style={[styles.clearChipText, { color: colors.primary }]}>
                          重設焦點
                        </Text>
                      </SpringPressable>
                    ) : null}
                    <Pressable
                      onPress={() => handleJumpToSlide(1)}
                      hitSlop={8}
                      accessibilityLabel="前往收支趨勢"
                      style={[
                        styles.carouselJumpBtn,
                        {
                          backgroundColor: colors.surfaceElevated,
                          borderColor: colors.cardBorder,
                        },
                      ]}
                    >
                      <ChevronRight size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>

                {/* Dual Segmented Controls: Expense/Income × Category/Account */}
                <View
                  style={[
                    styles.dualControlsWrap,
                    containerWidth >= 420 && styles.dualControlsRow,
                  ]}
                >
                  <SpringSegmentedControl
                    options={flowOptions}
                    value={flow}
                    onChange={handleChangeFlow}
                    size="sm"
                    accessibilityLabel="收支類型切換"
                    style={containerWidth >= 420 ? styles.controlHalf : undefined}
                  />
                  <SpringSegmentedControl
                    options={dimensionOptions}
                    value={dimension}
                    onChange={handleChangeDimension}
                    size="sm"
                    accessibilityLabel="統計維度切換"
                    style={containerWidth >= 420 ? styles.controlHalf : undefined}
                  />
                </View>

                <View style={styles.donutWrap}>
                  <DonutChart
                    data={breakdownStats}
                    totalAmount={flow === 'expense' ? kpi.realExpense : kpi.realIncome}
                    baseCurrency={baseCurrency}
                    centerLabel={flow === 'expense' ? '總支出' : '總收入'}
                    unitLabel={dimension === 'category' ? '項分類' : '個帳戶'}
                    emptyLabel={flow === 'expense' ? '尚無支出' : '尚無收入'}
                    selectedAmountColor={flow === 'expense' ? colors.expense : colors.income}
                    selectedKey={activeSelectedKey}
                    onSelectKey={handleToggleSlice}
                  />
                </View>

                {/* Slide 1 Sync Hint Banner */}
                <SpringPressable
                  onPress={() => handleJumpToSlide(1)}
                  pressedScale={0.98}
                  haptic="selection"
                  accessibilityRole="button"
                  accessibilityLabel="切換至趨勢圖檢視聯動結果"
                  style={[
                    styles.trendSyncBanner,
                    {
                      backgroundColor: selectedSlice
                        ? colors.primaryBg
                        : colors.surfaceElevated,
                      borderColor: selectedSlice ? colors.primary : colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.trendSyncText, { color: colors.textSecondary }]}
                  >
                    {selectedSlice
                      ? `趨勢聯動：僅顯示「${selectedSlice.key}」走勢`
                      : '趨勢聯動：顯示期間內全部實質收支'}
                  </Text>
                  <Text style={[styles.trendSyncAction, { color: colors.primary }]}>
                    趨勢圖 ›
                  </Text>
                </SpringPressable>

                {/* Breakdown Ranking List */}
                {breakdownStats.length === 0 ? (
                  <View style={styles.emptyCategoryBox}>
                    <Text style={[styles.emptyCategoryText, { color: colors.textMuted }]}>
                      {`此期間內尚無實質${flow === 'expense' ? '支出' : '收入'}${dimension === 'category' ? '分類' : '帳戶'}資料`}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.rankingList}>
                    {breakdownStats.map((item, idx) => {
                      const isSelected = activeSelectedKey === item.key;
                      const isDimmed = Boolean(activeSelectedKey) && !isSelected;
                      const badgeBg =
                        dimension === 'category'
                          ? getCategoryMeta(item.key).bgColor
                          : getAccountMeta(item.key).bgColor;
                      const resolvedAccountIcon =
                        dimension === 'account'
                          ? settings.accountIcons?.[item.key] || item.icon
                          : item.icon;

                      return (
                        <SpringPressable
                          key={`${dimension}-${item.key}`}
                          pressedScale={0.98}
                          haptic="selection"
                          onPress={() => handleToggleSlice(isSelected ? null : item.key)}
                          style={[
                            styles.rankingRow,
                            {
                              backgroundColor: isSelected
                                ? colors.surfaceElevated
                                : colors.surface,
                              borderColor: isSelected ? item.color : colors.cardBorder,
                              opacity: isDimmed ? 0.48 : 1,
                            },
                          ]}
                        >
                          <View style={styles.rankingTop}>
                            <View style={styles.rankingLeft}>
                              <Text style={[styles.rankIndex, { color: colors.textMuted }]}>
                                {String(idx + 1).padStart(2, '0')}
                              </Text>
                              <View
                                style={[
                                  styles.catIconBadge,
                                  {
                                    backgroundColor: badgeBg,
                                    borderColor: `${item.color}45`,
                                  },
                                ]}
                              >
                                <LedgerIcon
                                  name={dimension === 'category' ? item.icon : resolvedAccountIcon}
                                  size={16}
                                  color={item.color}
                                />
                              </View>
                              <View style={styles.rankingNameCol}>
                                <Text
                                  numberOfLines={1}
                                  style={[styles.catName, { color: colors.text }]}
                                >
                                  {item.key}
                                </Text>
                                <Text style={[styles.catCount, { color: colors.textMuted }]}>
                                  {item.count} 筆交易
                                </Text>
                              </View>
                            </View>

                            <View style={styles.rankingRight}>
                              <Text style={[styles.catAmount, { color: colors.text }]}>
                                {formatMoney(item.amount, baseCurrency)}
                              </Text>
                              <View
                                style={[
                                  styles.pctPill,
                                  {
                                    backgroundColor: `${item.color}1F`,
                                    borderColor: `${item.color}55`,
                                  },
                                ]}
                              >
                                <Text style={[styles.pctText, { color: item.color }]}>
                                  {item.percentage.toFixed(1)}%
                                </Text>
                              </View>
                            </View>
                          </View>

                          <View
                            style={[
                              styles.catBarTrack,
                              { backgroundColor: colors.surfaceElevated },
                            ]}
                          >
                            <Animated.View
                              style={[
                                styles.catBarFill,
                                {
                                  width: rankingBarAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [
                                      '0%',
                                      `${Math.min(100, Math.max(2, item.percentage))}%`,
                                    ],
                                  }),
                                  backgroundColor: item.color,
                                },
                              ]}
                            />
                          </View>
                        </SpringPressable>
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
                filterLabel={selectedSlice ? selectedSlice.key : null}
                onClearFilter={() => handleToggleSlice(null)}
                onScrubbingChange={setIsScrubbingChart}
                onSwipePrev={() => {
                  handleJumpToSlide(0);
                }}
              />
            </View>
          </ScrollView>

          {/* Tactical Pagination Indicators */}
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
                      width: active ? 22 : 8,
                      backgroundColor: active ? colors.primary : colors.cardBorder,
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Tactical Time Filter Modal */}
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
                backgroundColor: isDark
                  ? 'rgba(10, 15, 30, 0.94)'
                  : 'rgba(255, 255, 255, 0.96)',
                borderColor: colors.primary,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <HudReticle variant="primary" />

            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>
                篩選時間
              </Text>
              <Pressable
                onPress={() => setTimeModalOpen(false)}
                style={[
                  styles.pickerCloseBtn,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <X size={16} color={colors.textSecondary} />
              </Pressable>
            </View>

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

            <ScrollView
              style={styles.pickerScroll}
              showsVerticalScrollIndicator={false}
            >
              {pickerOptions.options.length === 0 ? (
                <Text style={[styles.pickerEmptyText, { color: colors.textMuted }]}>
                  目前沒有可選擇的時間區間
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  transparentBg: {
    backgroundColor: 'transparent',
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
    fontFamily: MONO_FONT,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  timeFilterPillText: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  card: {
    position: 'relative',
    borderRadius: HUD_RADIUS_LG,
    borderWidth: 1,
    padding: 16,
  },
  cardBgClip: {
    borderRadius: HUD_RADIUS_LG,
    overflow: 'hidden',
  },
  topAccentStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  cashflowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cashflowValueBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 10,
  },
  netCashflowValue: {
    fontFamily: MONO_FONT,
    fontSize: 26,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  cashflowIconBadge: {
    width: 38,
    height: 38,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiSplitRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    padding: 11,
    gap: 8,
  },
  kpiPillValue: {
    fontFamily: MONO_FONT,
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  cardTitle: {
    fontFamily: MONO_FONT,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
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
    borderRadius: HUD_RADIUS,
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
    height: 4,
    borderRadius: 2,
  },
  clearChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
  clearChipText: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
  },
  donutWrap: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dualControlsWrap: {
    gap: 8,
    marginBottom: 8,
  },
  dualControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlHalf: {
    flex: 1,
  },
  trendSyncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    marginTop: 4,
  },
  trendSyncText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  trendSyncAction: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '800',
  },
  rankingNameCol: {
    flex: 1,
    minWidth: 0,
  },
  emptyCategoryBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyCategoryText: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '600',
  },
  rankingList: {
    marginTop: 12,
    gap: 8,
  },
  rankingRow: {
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    padding: 11,
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
    gap: 9,
    flex: 1,
  },
  rankIndex: {
    width: 20,
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  catIconBadge: {
    width: 32,
    height: 32,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: {
    fontSize: 14,
    fontWeight: '700',
  },
  catCount: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  rankingRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  catAmount: {
    fontFamily: MONO_FONT,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pctPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  pctText: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  catBarTrack: {
    height: 5,
    borderRadius: 2,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
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
    width: 30,
    height: 30,
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
    padding: 3,
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
    fontSize: 12,
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
