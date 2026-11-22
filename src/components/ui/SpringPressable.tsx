import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

export interface SpringPressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  haptic?: 'none' | 'light' | 'selection';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

function triggerPressHaptic(kind: 'none' | 'light' | 'selection'): void {
  if (Platform.OS === 'web' || kind === 'none') return;
  if (kind === 'selection') {
    Haptics.selectionAsync().catch(() => {});
    return;
  }
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export const SpringPressable: React.FC<SpringPressableProps> = ({
  style,
  pressedScale = 0.95,
  haptic = 'none',
  disabled = false,
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...rest
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isPressedRef = useRef(false);

  // Guard against getting stuck scaled down if disabled flips to true mid-press
  useEffect(() => {
    if (disabled && isPressedRef.current) {
      isPressedRef.current = false;
      scaleAnim.stopAnimation();
      scaleAnim.setValue(1);
    }
  }, [disabled, scaleAnim]);

  useEffect(() => {
    return () => {
      scaleAnim.stopAnimation();
    };
  }, [scaleAnim]);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (!disabled) {
        isPressedRef.current = true;
        Animated.spring(scaleAnim, {
          toValue: pressedScale,
          speed: 45,
          bounciness: 0,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      }
      onPressIn?.(event);
    },
    [disabled, onPressIn, pressedScale, scaleAnim],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      if (isPressedRef.current) {
        isPressedRef.current = false;
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 260,
          friction: 20,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      }
      onPressOut?.(event);
    },
    [onPressOut, scaleAnim],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (disabled) return;
      triggerPressHaptic(haptic);
      onPress?.(event);
    },
    [disabled, haptic, onPress],
  );

  const animatedStyle = useMemo(() => {
    const flat = StyleSheet.flatten(style);
    const existingTransform = flat?.transform;
    if (Array.isArray(existingTransform)) {
      return [style, { transform: [...existingTransform, { scale: scaleAnim }] }];
    }
    return [style, { transform: [{ scale: scaleAnim }] }];
  }, [scaleAnim, style]);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress ? handlePress : undefined}
      style={animatedStyle}
    >
      {children}
    </AnimatedPressable>
  );
};
