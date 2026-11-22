import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { MONO_FONT } from './ui/HudReticle';
import { useAppTheme } from '../theme/ThemeContext';
import { BreakdownStat } from '../utils/analytics';
import { formatMoney } from '../utils/currency';

export interface DonutChartProps {
  data: BreakdownStat[];
  totalAmount: number;
  baseCurrency: string;
  centerLabel?: string;
  unitLabel?: string;
  emptyLabel?: string;
  selectedAmountColor?: string;
  selectedKey?: string | null;
  onSelectKey?: (key: string | null) => void;
  size?: number;
  strokeWidth?: number;
}

interface SliceGeometry {
  item: BreakdownStat;
  startAngle: number;
  endAngle: number;
  isFullCircle: boolean;
}

function formatCenterLabel(label: string): string {
  const trimmed = label.trim().replace(/^\[|\]$/g, '');
  return trimmed || '總計';
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
  centerLabel = '總計',
  unitLabel = '項分類',
  emptyLabel = '尚無資料',
  selectedAmountColor,
  selectedKey = null,
  onSelectKey,
  size = 224,
  strokeWidth = 26,
}: DonutChartProps) {
  const { colors } = useAppTheme();
  const useNative = Platform.OS !== 'web';

  const outerSpinAnim = useRef(new Animated.Value(0)).current;
  const innerSpinAnim = useRef(new Animated.Value(0)).current;
  const sliceEntryAnim = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    outerSpinAnim.setValue(0);
    innerSpinAnim.setValue(0);

    const outerLoop = Animated.loop(
      Animated.timing(outerSpinAnim, {
        toValue: 1,
        duration: 16000,
        easing: Easing.linear,
        useNativeDriver: useNative,
      }),
    );
    const innerLoop = Animated.loop(
      Animated.timing(innerSpinAnim, {
        toValue: 1,
        duration: 16000,
        easing: Easing.linear,
        useNativeDriver: useNative,
      }),
    );

    outerLoop.start();
    innerLoop.start();

    return () => {
      outerLoop.stop();
      innerLoop.stop();
    };
  }, [outerSpinAnim, innerSpinAnim, useNative]);

  useEffect(() => {
    sliceEntryAnim.setValue(0.88);
    const springAnim = Animated.spring(sliceEntryAnim, {
      toValue: 1,
      friction: 7,
      tension: 76,
      useNativeDriver: useNative,
    });
    springAnim.start();

    return () => {
      springAnim.stop();
    };
  }, [data, totalAmount, sliceEntryAnim, useNative]);

  const outerRotate = outerSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const innerRotate = innerSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  const positiveData = useMemo(
    () => data.filter((item) => Number.isFinite(item.amount) && item.amount > 0),
    [data],
  );

  const slices = useMemo<SliceGeometry[]>(() => {
    const sum = positiveData.reduce((acc, item) => acc + item.amount, 0);
    if (!Number.isFinite(sum) || sum <= 0) return [];

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
      const gap = Math.min(2.6, rawDeg * 0.24);
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
    () => positiveData.find((d) => d.key === selectedKey) ?? null,
    [positiveData, selectedKey],
  );

  const center = size / 2;
  const baseRadius = (size - strokeWidth - 22) / 2;
  const outerTelemetryRadius = baseRadius + strokeWidth / 2 + 7;
  const innerTelemetryRadius = Math.max(44, baseRadius - strokeWidth / 2 - 4);
  const innerDiameter = Math.max(88, innerTelemetryRadius * 2 - 8);

  const handleToggleSlice = (key: string) => {
    if (!onSelectKey) return;
    onSelectKey(selectedKey === key ? null : key);
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer rotating radar telemetry ring (0deg -> 360deg) */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ rotate: outerRotate }] },
        ]}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={center}
            cy={center}
            r={outerTelemetryRadius}
            fill="none"
            stroke={colors.accent}
            strokeWidth={1.25}
            strokeDasharray="6,4"
            opacity={0.55}
          />
        </Svg>
      </Animated.View>

      {/* Inner counter-rotating radar telemetry ring (360deg -> 0deg) */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ rotate: innerRotate }] },
        ]}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={center}
            cy={center}
            r={innerTelemetryRadius}
            fill="none"
            stroke={colors.primary}
            strokeWidth={1.2}
            strokeDasharray="6,4"
            opacity={0.45}
          />
        </Svg>
      </Animated.View>

      {/* Animated Donut Slices & Track */}
      <Animated.View
        style={{
          width: size,
          height: size,
          opacity: sliceEntryAnim,
          transform: [{ scale: sliceEntryAnim }],
        }}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <G>
            {/* Recessed tactical track ring */}
            <Circle
              cx={center}
              cy={center}
              r={baseRadius}
              fill="none"
              stroke={colors.surfaceElevated}
              strokeWidth={strokeWidth}
            />

            {slices.map(({ item, startAngle, endAngle, isFullCircle }) => {
              const isSelected = selectedItem?.key === item.key;
              const isDimmed = Boolean(selectedItem) && !isSelected;
              const activeStroke = isSelected ? strokeWidth + 5 : strokeWidth;
              const activeRadius = isSelected ? baseRadius + 1.5 : baseRadius;

              if (isFullCircle) {
                return (
                  <Circle
                    key={item.key}
                    cx={center}
                    cy={center}
                    r={activeRadius}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={activeStroke}
                    strokeOpacity={isDimmed ? 0.28 : 1}
                    onPress={() => handleToggleSlice(item.key)}
                  />
                );
              }

              return (
                <Path
                  key={item.key}
                  d={describeArc(center, center, activeRadius, startAngle, endAngle)}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={activeStroke}
                  strokeLinecap="butt"
                  strokeOpacity={isDimmed ? 0.28 : 1}
                  onPress={() => handleToggleSlice(item.key)}
                />
              );
            })}
          </G>
        </Svg>
      </Animated.View>

      {/* Center telemetry readout */}
      <Pressable
        onPress={() => {
          if (selectedKey && onSelectKey) {
            onSelectKey(null);
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
                {formatCenterLabel(selectedItem.key)}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.centerValue, { color: selectedAmountColor ?? colors.text }]}
            >
              {formatMoney(selectedItem.amount, baseCurrency)}
            </Text>
            <Text style={[styles.centerSub, { color: selectedItem.color }]}>
              {(Number.isFinite(selectedItem.percentage) ? selectedItem.percentage : 0).toFixed(1)}% · {selectedItem.count} 筆
            </Text>
          </>
        ) : (
          <>
            <Text
              numberOfLines={1}
              style={[
                styles.centerLabel,
                { color: positiveData.length > 0 ? colors.primary : colors.textMuted },
              ]}
            >
              {formatCenterLabel(positiveData.length > 0 ? centerLabel : emptyLabel)}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.centerValue, { color: colors.text }]}
            >
              {formatMoney(totalAmount, baseCurrency)}
            </Text>
            <Text style={[styles.centerSub, { color: colors.textMuted }]}>
              {positiveData.length > 0
                ? `${positiveData.length} ${unitLabel} · 點擊篩選`
                : '切換區間檢視'}
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
    marginBottom: 2,
  },
  colorDot: {
    width: 7,
    height: 7,
    borderRadius: 1.5,
  },
  centerLabel: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  centerValue: {
    fontFamily: MONO_FONT,
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  centerSub: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 3,
    textAlign: 'center',
  },
});
