import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useAppTheme } from '../theme/ThemeContext';
import { TrendPoint } from '../types/ledger';
import { formatMoney } from '../utils/currency';

export interface TrendBarChartProps {
  data: TrendPoint[];
  granularity: 'day' | 'month';
  baseCurrency: string;
  isSingleDay?: boolean;
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
  onScrubbingChange,
  onSwipePrev,
}: TrendBarChartProps) {
  const { colors } = useAppTheme();
  const [containerWidth, setContainerWidth] = useState(320);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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
  const plotPadX = 12;
  const innerWidth = Math.max(plotWidth - plotPadX * 2, 1);

  const maxValue = useMemo(() => {
    let m = 0;
    for (const item of data) {
      if (item.income > m) m = item.income;
      if (item.expense > m) m = item.expense;
    }
    return m > 0 ? m * 1.12 : 100;
  }, [data]);

  const yTicks = useMemo(() => {
    return [1, 0.5, 0].map((ratio) => ({
      ratio,
      value: maxValue * ratio,
      y: paddingTop + plotHeight * (1 - ratio),
    }));
  }, [maxValue, paddingTop, plotHeight]);

  const plotPoints = useMemo(() => {
    if (data.length === 0) return [];
    return data.map((point, index) => {
      const x =
        data.length === 1
          ? plotWidth / 2
          : plotPadX + (index / (data.length - 1)) * innerWidth;
      const incomeRatio = Math.min(Math.max(point.income, 0) / maxValue, 1);
      const expenseRatio = Math.min(Math.max(point.expense, 0) / maxValue, 1);
      return {
        point,
        index,
        x,
        incomeY: paddingTop + plotHeight * (1 - incomeRatio),
        expenseY: paddingTop + plotHeight * (1 - expenseRatio),
      };
    });
  }, [data, plotWidth, plotPadX, innerWidth, maxValue, paddingTop, plotHeight]);

  const { incomeLinePath, incomeAreaPath, expenseLinePath, expenseAreaPath } =
    useMemo(() => {
      if (plotPoints.length < 2) {
        return {
          incomeLinePath: '',
          incomeAreaPath: '',
          expenseLinePath: '',
          expenseAreaPath: '',
        };
      }
      const incLine = plotPoints
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.incomeY.toFixed(1)}`,
        )
        .join(' ');
      const expLine = plotPoints
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.expenseY.toFixed(1)}`,
        )
        .join(' ');

      const firstX = plotPoints[0].x.toFixed(1);
      const lastX = plotPoints[plotPoints.length - 1].x.toFixed(1);
      const baseY = baseLineY.toFixed(1);

      return {
        incomeLinePath: incLine,
        incomeAreaPath: `${incLine} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`,
        expenseLinePath: expLine,
        expenseAreaPath: `${expLine} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`,
      };
    }, [plotPoints, baseLineY]);

  const xLabelIndices = useMemo(() => {
    const n = data.length;
    if (n === 0) return new Set<number>();
    if (n === 1) return new Set<number>([0]);

    const maxLabels = Math.max(2, Math.floor(innerWidth / 52));
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
    if (pts.length === 0) return;
    if (pts.length === 1) {
      setSelectedKey(pts[0].key);
      return;
    }
    const clamped = Math.max(0, Math.min(span, locationX - padX));
    const idx = Math.round((clamped / span) * (pts.length - 1));
    const target = pts[idx];
    if (target) {
      setSelectedKey(target.key);
    }
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
        selectAtLocationX(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        selectAtLocationX(evt.nativeEvent.locationX);
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

  const titleText = `收支趨勢（${
    isSingleDay ? '當日' : granularity === 'day' ? '按日' : '按月'
  }）`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
        },
      ]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width - 32;
        if (w > 120) setContainerWidth(w);
      }}
    >
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
                backgroundColor: colors.chipBg,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            accessibilityLabel="切換至支出分類結構"
          >
            <ChevronLeft size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

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
          <Text style={[styles.activePeriodBadge, { color: colors.primary }]}>
            {activePoint.key}
          </Text>
        ) : null}
      </View>

      {/* Inspector Strip */}
      {activePoint ? (
        <View
          style={[
            styles.inspectorStrip,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
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
            style={[styles.inspectorDivider, { backgroundColor: colors.border }]}
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
            style={[styles.inspectorDivider, { backgroundColor: colors.border }]}
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
            此區間尚無可繪製的收支趨勢資料
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
                <LinearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.income} stopOpacity={0.28} />
                  <Stop offset="1" stopColor={colors.income} stopOpacity={0.02} />
                </LinearGradient>
                <LinearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.expense} stopOpacity={0.28} />
                  <Stop offset="1" stopColor={colors.expense} stopOpacity={0.02} />
                </LinearGradient>
              </Defs>

              {/* Grid lines */}
              {yTicks.map((tick) => (
                <Line
                  key={tick.ratio}
                  x1={0}
                  y1={tick.y}
                  x2={plotWidth}
                  y2={tick.y}
                  stroke={colors.divider}
                  strokeWidth={1}
                  strokeDasharray={tick.ratio === 0 ? undefined : '4,4'}
                />
              ))}

              {/* Area Fills & Line Strokes (multi-point) */}
              {plotPoints.length >= 2 ? (
                <>
                  <Path d={incomeAreaPath} fill="url(#incomeGrad)" />
                  <Path d={expenseAreaPath} fill="url(#expenseGrad)" />
                  <Path
                    d={incomeLinePath}
                    fill="none"
                    stroke={colors.income}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Path
                    d={expenseLinePath}
                    fill="none"
                    stroke={colors.expense}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              ) : null}

              {/* Vertical Crosshair & Highlighted Dots */}
              {activePlotPoint ? (
                <>
                  <Line
                    x1={activePlotPoint.x}
                    y1={paddingTop}
                    x2={activePlotPoint.x}
                    y2={baseLineY}
                    stroke={colors.primary}
                    strokeWidth={1.2}
                    strokeDasharray="4,4"
                    opacity={0.75}
                  />
                  <Circle
                    cx={activePlotPoint.x}
                    cy={activePlotPoint.incomeY}
                    r={5}
                    fill={colors.income}
                    stroke={colors.card}
                    strokeWidth={2}
                  />
                  <Circle
                    cx={activePlotPoint.x}
                    cy={activePlotPoint.expenseY}
                    r={5}
                    fill={colors.expense}
                    stroke={colors.card}
                    strokeWidth={2}
                  />
                </>
              ) : null}

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
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  activePeriodBadge: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  inspectorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
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
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  inspectorVal: {
    fontSize: 12,
    fontWeight: '700',
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
    fontSize: 13,
    fontWeight: '500',
  },
});
