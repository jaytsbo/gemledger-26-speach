import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useAppTheme } from '../theme/ThemeContext';
import { CategoryStat } from '../types/ledger';
import { formatMoney } from '../utils/currency';

export interface DonutChartProps {
  data: CategoryStat[];
  totalAmount: number;
  baseCurrency: string;
  selectedCategory?: string | null;
  onSelectCategory?: (category: string | null) => void;
  size?: number;
  strokeWidth?: number;
}

interface SliceGeometry {
  item: CategoryStat;
  startAngle: number;
  endAngle: number;
  isFullCircle: boolean;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArcFlag} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function DonutChart({
  data,
  totalAmount,
  baseCurrency,
  selectedCategory = null,
  onSelectCategory,
  size = 224,
  strokeWidth = 28,
}: DonutChartProps) {
  const { colors } = useAppTheme();

  const positiveData = useMemo(
    () => data.filter((item) => item.amount > 0),
    [data],
  );

  const slices = useMemo<SliceGeometry[]>(() => {
    const sum = positiveData.reduce((acc, item) => acc + item.amount, 0);
    if (sum <= 0) return [];

    if (positiveData.length === 1) {
      return [
        {
          item: positiveData[0],
          startAngle: -90,
          endAngle: 270,
          isFullCircle: true,
        },
      ];
    }

    let cursor = -90;
    return positiveData.map((item) => {
      const rawDeg = (item.amount / sum) * 360;
      const gap = Math.min(2.2, rawDeg * 0.22);
      const startAngle = cursor + gap / 2;
      const endAngle = cursor + Math.max(rawDeg - gap / 2, 1.2);
      cursor += rawDeg;
      return {
        item,
        startAngle,
        endAngle: Math.min(endAngle, startAngle + 359.2),
        isFullCircle: false,
      };
    });
  }, [positiveData]);

  const selectedItem = useMemo(
    () => positiveData.find((d) => d.category === selectedCategory) ?? null,
    [positiveData, selectedCategory],
  );

  const center = size / 2;
  const baseRadius = (size - strokeWidth - 18) / 2;
  const innerDiameter = Math.max(88, baseRadius * 2 - strokeWidth - 10);

  const handleToggleSlice = (category: string) => {
    if (!onSelectCategory) return;
    onSelectCategory(selectedCategory === category ? null : category);
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G>
          {/* Track ring */}
          <Circle
            cx={center}
            cy={center}
            r={baseRadius}
            fill="none"
            stroke={colors.divider}
            strokeWidth={strokeWidth}
          />

          {slices.map(({ item, startAngle, endAngle, isFullCircle }) => {
            const isSelected = selectedCategory === item.category;
            const isDimmed = Boolean(selectedCategory) && !isSelected;
            const activeStroke = isSelected ? strokeWidth + 6 : strokeWidth;
            const activeRadius = isSelected ? baseRadius + 2 : baseRadius;

            if (isFullCircle) {
              return (
                <Circle
                  key={item.category}
                  cx={center}
                  cy={center}
                  r={activeRadius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={activeStroke}
                  strokeOpacity={isDimmed ? 0.35 : 1}
                  onPress={() => handleToggleSlice(item.category)}
                />
              );
            }

            return (
              <Path
                key={item.category}
                d={describeArc(center, center, activeRadius, startAngle, endAngle)}
                fill="none"
                stroke={item.color}
                strokeWidth={activeStroke}
                strokeLinecap="butt"
                strokeOpacity={isDimmed ? 0.35 : 1}
                onPress={() => handleToggleSlice(item.category)}
              />
            );
          })}
        </G>
      </Svg>

      {/* Center summary readout */}
      <Pressable
        onPress={() => {
          if (selectedCategory && onSelectCategory) {
            onSelectCategory(null);
          }
        }}
        style={[
          styles.centerOverlay,
          {
            width: innerDiameter,
            height: innerDiameter,
            borderRadius: innerDiameter / 2,
          },
        ]}
      >
        {selectedItem ? (
          <>
            <View style={styles.selectedTitleRow}>
              <View style={[styles.colorDot, { backgroundColor: selectedItem.color }]} />
              <Text
                numberOfLines={1}
                style={[styles.centerLabel, { color: colors.textSecondary }]}
              >
                {selectedItem.category}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.centerValue, { color: colors.text }]}
            >
              {formatMoney(selectedItem.amount, baseCurrency)}
            </Text>
            <Text style={[styles.centerSub, { color: selectedItem.color }]}>
              {selectedItem.percentage}% · {selectedItem.count} 筆
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.centerLabel, { color: colors.textSecondary }]}>
              {positiveData.length > 0 ? '實質總支出' : '尚無支出'}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.centerValue, { color: colors.text }]}
            >
              {formatMoney(totalAmount, baseCurrency)}
            </Text>
            <Text style={[styles.centerSub, { color: colors.textMuted }]}>
              {positiveData.length > 0 ? `${positiveData.length} 項分類 · 點擊可篩選` : '切換時間區間查看'}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    position: 'relative',
  },
  centerOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  selectedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '92%',
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  centerLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  centerValue: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  centerSub: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
});
