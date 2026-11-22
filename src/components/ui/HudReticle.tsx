import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { HUD_RADIUS, HUD_RETICLE_SIZE, HUD_RETICLE_WIDTH } from '../../theme/colors';
import { useAppTheme } from '../../theme/ThemeContext';

export const MONO_FONT: string =
  Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) ?? 'monospace';

export interface HudReticleProps {
  variant?: 'primary' | 'accent';
  color?: string;
  size?: number;
  thickness?: number;
  inset?: number;
}

export function HudReticle({
  variant = 'primary',
  color,
  size = HUD_RETICLE_SIZE,
  thickness = HUD_RETICLE_WIDTH,
  inset = 0,
}: HudReticleProps): JSX.Element {
  const { colors } = useAppTheme();
  const reticleColor = color ?? (variant === 'accent' ? colors.accent : colors.primary);

  const cornerBase: ViewStyle = {
    position: 'absolute',
    width: size,
    height: size,
    borderColor: reticleColor,
  };

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <View
        pointerEvents="none"
        style={[
          cornerBase,
          {
            top: inset,
            left: inset,
            borderTopWidth: thickness,
            borderLeftWidth: thickness,
            borderTopLeftRadius: 2,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          cornerBase,
          {
            top: inset,
            right: inset,
            borderTopWidth: thickness,
            borderRightWidth: thickness,
            borderTopRightRadius: 2,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          cornerBase,
          {
            bottom: inset,
            left: inset,
            borderBottomWidth: thickness,
            borderLeftWidth: thickness,
            borderBottomLeftRadius: 2,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          cornerBase,
          {
            bottom: inset,
            right: inset,
            borderBottomWidth: thickness,
            borderRightWidth: thickness,
            borderBottomRightRadius: 2,
          },
        ]}
      />
    </View>
  );
}

export interface HudCardProps {
  children: React.ReactNode;
  variant?: 'primary' | 'accent' | 'none';
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
  reticleSize?: number;
}

export function HudCard({
  children,
  variant = 'primary',
  glow = false,
  style,
  reticleSize = HUD_RETICLE_SIZE,
}: HudCardProps): JSX.Element {
  const { colors, isDark } = useAppTheme();

  const glowStyle: ViewStyle | undefined = glow
    ? {
        shadowColor: variant === 'accent' ? colors.accent : colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: isDark ? 0.35 : 0.2,
        shadowRadius: 10,
        elevation: 4,
      }
    : undefined;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: variant === 'accent' ? colors.accent : colors.cardBorder,
        },
        glowStyle,
        style,
      ]}
    >
      {variant !== 'none' ? <HudReticle variant={variant} size={reticleSize} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  card: {
    position: 'relative',
    borderRadius: HUD_RADIUS,
    borderWidth: 1,
  },
});
