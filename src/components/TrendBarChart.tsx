import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeft, X } from 'lucide-react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { HudReticle, MONO_FONT } from './ui/HudReticle';
import { SpringPressable } from './ui/SpringPressable';
import { HUD_RADIUS, HUD_RADIUS_LG } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { TrendPoint } from '../types/ledger';
import { formatMoney } from '../utils/currency';

export interface TrendBarChartProps {
  data: TrendPoint[];
  granularity: 'day' | 'month';
  baseCurrency: string;
  isSingleDay?: boolean;
  filterLabel?: string | null;
  onClearFilter?: () => void;
  onScrubbingChange?: (scrubbing: boolean) => void;
  onSwipePrev?: () => void;
}

function formatCompactAxis(value: number): string {
  if (value <= 0) return '0';
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(Math.round(value));
}

export function TrendBarChart({
  data,
  granularity,
  baseCurrency,
  isSingleDay = false,
  filterLabel = null,
  onClearFilter,
  onScrubbingChange,
  onSwipePrev,
}: TrendBarChartProps) {
  const { colors, isDark } = useAppTheme();
  const [containerWidth, setContainerWidth] = useState(320);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [animProgress, setAnimProgress] = useState(1);

  useEffect(() => {
    let rafId: number | null = null;
    const duration = 420;
    const startTime = Date.now();
    setAnimProgress(0);

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimProgress(eased);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [data, granularity]);

  useEffect(() => {
    if (data.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (selectedKey && !data.some((d) => d.key === selectedKey)) {
      setSelectedKey(null);
    }
  }, [data, selectedKey]);

  const activeIndex = useMemo(() => {
    if (data.length === 0) return -1;
    if (selectedKey) {
      const idx = data.findIndex((d) => d.key === selectedKey);
      if (idx >= 0) return idx;
    }
    return data.length - 1;
  }, [data, selectedKey]);

  const activePoint = activeIndex >= 0 ? data[activeIndex] : null;

  const chartHeight = 196;
  const paddingTop = 16;
  const paddingBottom = 32;
  const plotHeight = chartHeight - paddingTop - paddingBottom;
  const baseLineY = paddingTop + plotHeight;
  const yAxisWidth = 44;
  const plotWidth = Math.max(containerWidth - yAxisWidth, 180);
  const plotPadX = 10;
  const innerWidth = Math.max(plotWidth - plotPadX * 2, 1);

  const maxValue = useMemo(() => {
    let m = 0;
    for (const item of data) {
      const inc = Number.isFinite(item.income) ? item.income : 0;
      const exp = Number.isFinite(item.expense) ? item.expense : 0;
      if (inc > m) m = inc;
      if (exp > m) m = exp;
    }
    return m > 0 && Number.isFinite(m) ? m * 1.12 : 100;
  }, [data]);

  const yTicks = useMemo(() => {
    return [1, 0.5, 0].map((ratio) => ({
      ratio,
      value: maxValue * ratio,
      y: paddingTop + plotHeight * (1 - ratio),
    }));
  }, [maxValue, paddingTop, plotHeight]);

  const slotWidth = innerWidth / Math.max(data.length, 1);
  const barGap = slotWidth < 12 ? 1 : slotWidth < 22 ? 2 : 3;
  const barWidth =
    data.length === 1
      ? 16
      : Math.max(2, Math.min(12, (slotWidth * 0.78 - barGap) / 2));

  const plotPoints = useMemo(() => {
    if (data.length === 0) return [];
    const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 100;
    return data.map((point, index) => {
      const x =
        data.length === 1
          ? plotWidth / 2
          : plotPadX + (index + 0.5) * slotWidth;
      const rawIncome = Number.isFinite(point.income) ? Math.max(0, point.income) : 0;
      const rawExpense = Number.isFinite(point.expense) ? Math.max(0, point.expense) : 0;
      const incomeRatio = Math.min(rawIncome / safeMax, 1);
      const expenseRatio = Math.min(rawExpense / safeMax, 1);
      const incomeY =
        paddingTop + plotHeight * (1 - (Number.isFinite(incomeRatio) ? incomeRatio : 0));
      const expenseY =
        paddingTop + plotHeight * (1 - (Number.isFinite(expenseRatio) ? expenseRatio : 0));
      const incomeHeight = rawIncome > 0 ? Math.max(2, baseLineY - incomeY) : 0;
      const expenseHeight = rawExpense > 0 ? Math.max(2, baseLineY - expenseY) : 0;
      return {
        point,
        index,
        x: Number.isFinite(x) ? x : plotWidth / 2,
        incomeY: baseLineY - incomeHeight,
        incomeHeight,
        expenseY: baseLineY - expenseHeight,
        expenseHeight,
      };
    });
  }, [data, plotWidth, plotPadX, slotWidth, maxValue, paddingTop, plotHeight, baseLineY]);

  const xLabelIndices = useMemo(() => {
    const n = data.length;
    if (n === 0) return new Set<number>();
    if (n === 1) return new Set<number>([0]);

    const maxLabels = Math.max(2, Math.floor(innerWidth / 54));
    if (n <= maxLabels) {
      return new Set<number>(data.map((_, i) => i));
    }

    const step = Math.ceil((n - 1) / (maxLabels - 1));
    const set = new Set<number>([0, n - 1]);
    for (let i = step; i < n - 1; i += step) {
      if (n - 1 - i >= Math.ceil(step * 0.5)) {
        set.add(i);
      }
    }
    return set;
  }, [data, innerWidth]);

  const scrubContextRef = useRef({
    data,
    plotPadX,
    innerWidth,
    onScrubbingChange,
  });
  scrubContextRef.current = {
    data,
    plotPadX,
    innerWidth,
    onScrubbingChange,
  };

  const selectAtLocationX = (locationX: number) => {
    const { data: pts, plotPadX: padX, innerWidth: span } = scrubContextRef.current;
    if (!Number.isFinite(locationX) || !Number.isFinite(span) || span <= 0) return;
    if (pts.length === 0) return;
    if (pts.length === 1) {
      setSelectedKey(pts[0].key);
      return;
    }
    const clamped = Math.max(0, Math.min(span - 0.0001, locationX - padX));
    const idx = Math.max(
      0,
      Math.min(pts.length - 1, Math.floor((clamped / span) * pts.length)),
    );
    if (!Number.isFinite(idx)) return;
    const target = pts[idx];
    if (target) {
      setSelectedKey(target.key);
    }
  };

  const resolveEventLocationX = (evt: GestureResponderEvent): number => {
    const native = evt.nativeEvent as unknown as { locationX?: number; offsetX?: number };
    if (Number.isFinite(native.locationX)) return native.locationX as number;
    if (Number.isFinite(native.offsetX)) return native.offsetX as number;
    return Number.NaN;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => scrubContextRef.current.data.length > 0,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        scrubContextRef.current.data.length > 0 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 0.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        scrubContextRef.current.onScrubbingChange?.(true);
        selectAtLocationX(resolveEventLocationX(evt));
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        selectAtLocationX(resolveEventLocationX(evt));
      },
      onPanResponderRelease: () => {
        scrubContextRef.current.onScrubbingChange?.(false);
      },
      onPanResponderTerminate: () => {
        scrubContextRef.current.onScrubbingChange?.(false);
      },
    }),
  ).current;

  const activePlotPoint =
    activeIndex >= 0 && activeIndex < plotPoints.length
      ? plotPoints[activeIndex]
      : null;

  const activeBucketWidth = Math.max(
    barWidth * 2 + barGap + 6,
    Math.min(slotWidth * 0.92, 42),
  );

  const titleText = `收支趨勢 · ${
    isSingleDay ? '當日' : granularity === 'day' ? '按日' : '按月'
  }`;

  return (
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
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width - 32;
        if (w > 120) setContainerWidth(w);
      }}
    >
      {/* Clipped Nebula Violet Background Radial Glow & Top 2px Violet Accent Strip */}
      <View style={[StyleSheet.absoluteFill, styles.cardBgClip]} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="trendVioletGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.15} />
              <Stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="90%" cy="16%" r="120" fill="url(#trendVioletGlow)" />
        </Svg>
        <View style={[styles.topAccentStrip, { backgroundColor: colors.accent }]} />
      </View>

      <HudReticle variant="accent" />

      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>{titleText}</Text>

        {onSwipePrev ? (
          <Pressable
            onPress={onSwipePrev}
            hitSlop={8}
            style={({ pressed }) => [
              styles.navBtn,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.cardBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            accessibilityLabel="切換至結構分析"
          >
            <ChevronLeft size={16} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {filterLabel ? (
        <View style={styles.filterBannerRow}>
          <SpringPressable
            onPress={onClearFilter}
            pressedScale={0.95}
            haptic="selection"
            accessibilityRole="button"
            accessibilityLabel={`清除篩選 ${filterLabel}`}
            style={[
              styles.filterChip,
              {
                backgroundColor: colors.primaryBg,
                borderColor: colors.primary,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.filterChipText, { color: colors.primary }]}
            >
              篩選 · {filterLabel}
            </Text>
            <X size={13} color={colors.primary} strokeWidth={2.4} />
          </SpringPressable>
        </View>
      ) : null}

      {/* Legend + Active Point Badge */}
      <View style={styles.legendBar}>
        <View style={styles.legendGroup}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.income }]} />
            <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>
              收入
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.expense }]} />
            <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>
              支出
            </Text>
          </View>
        </View>
        {activePoint ? (
          <View
            style={[
              styles.activePeriodPill,
              {
                backgroundColor: colors.primaryBg,
                borderColor: colors.primary,
              },
            ]}
          >
            <Text style={[styles.activePeriodBadge, { color: colors.primary }]}>
              {activePoint.key}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Inspector Strip */}
      {activePoint ? (
        <View
          style={[
            styles.inspectorStrip,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.inspectorCol}>
            <Text style={[styles.inspectorLabel, { color: colors.textMuted }]}>
              收入
            </Text>
            <Text style={[styles.inspectorVal, { color: colors.income }]}>
              +{formatMoney(activePoint.income, baseCurrency)}
            </Text>
          </View>
          <View
            style={[styles.inspectorDivider, { backgroundColor: colors.cardBorder }]}
          />
          <View style={styles.inspectorCol}>
            <Text style={[styles.inspectorLabel, { color: colors.textMuted }]}>
              支出
            </Text>
            <Text style={[styles.inspectorVal, { color: colors.expense }]}>
              -{formatMoney(activePoint.expense, baseCurrency)}
            </Text>
          </View>
          <View
            style={[styles.inspectorDivider, { backgroundColor: colors.cardBorder }]}
          />
          <View style={styles.inspectorCol}>
            <Text style={[styles.inspectorLabel, { color: colors.textMuted }]}>
              淨流
            </Text>
            <Text
              style={[
                styles.inspectorVal,
                { color: activePoint.net >= 0 ? colors.income : colors.expense },
              ]}
            >
              {activePoint.net >= 0 ? '+' : ''}
              {formatMoney(activePoint.net, baseCurrency)}
            </Text>
          </View>
        </View>
      ) : null}

      {data.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            此區間尚無可繪製的收支趨勢紀錄
          </Text>
        </View>
      ) : (
        <View style={styles.chartBody}>
          {/* Fixed Y-Axis */}
          <Svg width={yAxisWidth} height={chartHeight}>
            {yTicks.map((tick) => (
              <SvgText
                key={tick.ratio}
                x={yAxisWidth - 6}
                y={tick.y + 4}
                fontSize={10}
                fontWeight="600"
                fontFamily={MONO_FONT}
                fill={colors.textMuted}
                textAnchor="end"
              >
                {formatCompactAxis(tick.value)}
              </SvgText>
            ))}
          </Svg>

          {/* Non-scrolling Interactive SVG Plot */}
          <View
            style={{ width: plotWidth, height: chartHeight }}
            pointerEvents="box-only"
            {...panResponder.panHandlers}
          >
            <Svg width={plotWidth} height={chartHeight}>
              <Defs>
                <LinearGradient id="incomeBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.income} stopOpacity={1} />
                  <Stop offset="1" stopColor={colors.income} stopOpacity={0.55} />
                </LinearGradient>
                <LinearGradient id="expenseBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.expense} stopOpacity={1} />
                  <Stop offset="1" stopColor={colors.expense} stopOpacity={0.55} />
                </LinearGradient>
              </Defs>

              {/* Tactical Grid Lines */}
              {yTicks.map((tick) => (
                <Line
                  key={tick.ratio}
                  x1={0}
                  y1={tick.y}
                  x2={plotWidth}
                  y2={tick.y}
                  stroke={
                    tick.ratio === 0
                      ? colors.cardBorder
                      : isDark
                        ? colors.gridLine
                        : colors.divider
                  }
                  strokeWidth={1}
                  strokeDasharray={tick.ratio === 0 ? undefined : '3,3'}
                />
              ))}

              {/* Active Bucket Highlight Column */}
              {activePlotPoint ? (
                <>
                  <Rect
                    x={Math.max(0, activePlotPoint.x - activeBucketWidth / 2)}
                    y={paddingTop}
                    width={Math.min(activeBucketWidth, plotWidth)}
                    height={plotHeight}
                    rx={3}
                    ry={3}
                    fill={colors.primaryBg}
                    stroke={colors.primary}
                    strokeWidth={1}
                    strokeOpacity={0.45}
                  />
                  <Rect
                    x={Math.max(0, activePlotPoint.x - activeBucketWidth / 2)}
                    y={paddingTop}
                    width={Math.min(activeBucketWidth, plotWidth)}
                    height={2.5}
                    rx={1}
                    ry={1}
                    fill={colors.primary}
                  />
                </>
              ) : null}

              {/* Tactical Dual Bars (Income & Expense) */}
              {plotPoints.map((p) => {
                const isSelected = activePlotPoint?.index === p.index;
                const barOpacity = isSelected ? 1 : 0.72;
                const incomeX = p.x - barGap / 2 - barWidth;
                const expenseX = p.x + barGap / 2;
                const scaledIncomeHeight = p.incomeHeight * animProgress;
                const scaledIncomeY = baseLineY - scaledIncomeHeight;
                const scaledExpenseHeight = p.expenseHeight * animProgress;
                const scaledExpenseY = baseLineY - scaledExpenseHeight;

                return (
                  <React.Fragment key={p.point.key}>
                    {scaledIncomeHeight > 0 ? (
                      <Rect
                        x={incomeX}
                        y={scaledIncomeY}
                        width={barWidth}
                        height={scaledIncomeHeight}
                        rx={2}
                        ry={2}
                        fill="url(#incomeBarGrad)"
                        opacity={barOpacity}
                      />
                    ) : null}
                    {scaledExpenseHeight > 0 ? (
                      <Rect
                        x={expenseX}
                        y={scaledExpenseY}
                        width={barWidth}
                        height={scaledExpenseHeight}
                        rx={2}
                        ry={2}
                        fill="url(#expenseBarGrad)"
                        opacity={barOpacity}
                      />
                    ) : null}
                  </React.Fragment>
                );
              })}

              {/* Sparse X-axis labels */}
              {plotPoints.map((p) => {
                if (!xLabelIndices.has(p.index)) return null;
                const isSelected = activePlotPoint?.index === p.index;
                const isFirst = plotPoints.length > 1 && p.index === 0;
                const isLast =
                  plotPoints.length > 1 && p.index === plotPoints.length - 1;
                const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
                const labelX = isFirst
                  ? Math.max(0, p.x - 4)
                  : isLast
                    ? Math.min(plotWidth, p.x + 4)
                    : p.x;

                return (
                  <SvgText
                    key={p.point.key}
                    x={labelX}
                    y={chartHeight - 10}
                    fontSize={10}
                    fontWeight={isSelected ? '700' : '500'}
                    fontFamily={MONO_FONT}
                    fill={isSelected ? colors.primary : colors.textMuted}
                    textAnchor={anchor}
                  >
                    {p.point.label}
                  </SvgText>
                );
              })}
            </Svg>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontFamily: MONO_FONT,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  navBtn: {
    width: 30,
    height: 30,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    maxWidth: '100%',
  },
  filterChipText: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  legendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  legendGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendLabel: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
  },
  activePeriodPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  activePeriodBadge: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  inspectorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  inspectorCol: {
    flex: 1,
    alignItems: 'center',
  },
  inspectorDivider: {
    width: 1,
    height: 24,
  },
  inspectorLabel: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  inspectorVal: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  chartBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  emptyBox: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '600',
  },
});
