import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { HUD_RADIUS } from '../../theme/colors';
import { useAppTheme } from '../../theme/ThemeContext';
import { MONO_FONT } from './HudReticle';
import { SpringPressable } from './SpringPressable';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  activeColor?: string;
}

export interface SpringSegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function SpringSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  style,
  accessibilityLabel,
}: SpringSegmentedControlProps<T>): JSX.Element {
  const { colors, isDark } = useAppTheme();
  const [innerWidth, setInnerWidth] = useState(0);

  const translateX = useRef(new Animated.Value(0)).current;
  const hasPositionedRef = useRef(false);
  const prevSegmentWidthRef = useRef(0);
  const prevOptionCountRef = useRef(options.length);

  const optionCount = options.length;
  const activeIndex = options.findIndex((opt) => opt.value === value);
  const segmentWidth = optionCount > 0 && innerWidth > 0 ? innerWidth / optionCount : 0;

  useEffect(() => {
    return () => {
      translateX.stopAnimation();
    };
  }, [translateX]);

  useEffect(() => {
    if (segmentWidth <= 0 || activeIndex < 0) {
      hasPositionedRef.current = false;
      return;
    }

    const targetX = activeIndex * segmentWidth;
    const geometryChanged =
      prevSegmentWidthRef.current !== segmentWidth || prevOptionCountRef.current !== optionCount;

    if (!hasPositionedRef.current || geometryChanged) {
      translateX.stopAnimation();
      translateX.setValue(targetX);
      hasPositionedRef.current = true;
      prevSegmentWidthRef.current = segmentWidth;
      prevOptionCountRef.current = optionCount;
      return;
    }

    Animated.spring(translateX, {
      toValue: targetX,
      tension: 260,
      friction: 20,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [activeIndex, optionCount, segmentWidth, translateX]);

  const handleInnerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = event.nativeEvent.layout.width;
      if (nextWidth <= 0) return;
      if (!hasPositionedRef.current && optionCount > 0 && activeIndex >= 0) {
        const segW = nextWidth / optionCount;
        translateX.setValue(activeIndex * segW);
        hasPositionedRef.current = true;
        prevSegmentWidthRef.current = segW;
        prevOptionCountRef.current = optionCount;
      }
      setInnerWidth((prev) => (Math.abs(prev - nextWidth) > 0.5 ? nextWidth : prev));
    },
    [activeIndex, optionCount, translateX],
  );

  const isSmall = size === 'sm';
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;
  const thumbBorderColor = activeOption?.activeColor ?? colors.tabBarBorder;
  const thumbShadowColor = activeOption?.activeColor ?? colors.primary;

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        {
          backgroundColor: isDark ? colors.inputBg : colors.chipBg,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <View style={styles.inner} onLayout={handleInnerLayout}>
        {segmentWidth > 0 && activeIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                width: segmentWidth,
                backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
                borderColor: thumbBorderColor,
                shadowColor: thumbShadowColor,
                shadowOpacity: isDark ? 0.35 : 0.14,
                transform: [{ translateX }],
              },
            ]}
          />
        ) : null}

        {options.map((opt) => {
          const isSelected = opt.value === value;
          const textColor = isSelected
            ? (opt.activeColor ?? (isDark ? colors.primary : colors.primaryDark))
            : colors.textMuted;

          return (
            <SpringPressable
              key={opt.value}
              pressedScale={0.95}
              haptic="selection"
              accessibilityRole="tab"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                if (opt.value !== value) {
                  onChange(opt.value);
                }
              }}
              style={[styles.segmentBtn, isSmall ? styles.segmentBtnSm : styles.segmentBtnMd]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  isSmall ? styles.labelSm : styles.labelMd,
                  {
                    color: textColor,
                    fontWeight: isSelected ? '800' : '700',
                  },
                ]}
              >
                {opt.label}
              </Text>
            </SpringPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
    padding: 3,
  },
  inner: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 6,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 6,
    elevation: 2,
  },
  segmentBtn: {
    flex: 1,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentBtnSm: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  segmentBtnMd: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  label: {
    fontFamily: MONO_FONT,
    letterSpacing: 0.3,
  },
  labelSm: {
    fontSize: 12,
  },
  labelMd: {
    fontSize: 13,
  },
});
