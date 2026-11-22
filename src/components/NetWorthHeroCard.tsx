import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { RefreshCw } from 'lucide-react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { HudReticle, MONO_FONT } from '@/components/ui/HudReticle';
import { useLedgerStore } from '@/store/useLedgerStore';
import { HUD_RADIUS_LG, HUD_RETICLE_SIZE } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';
import { KPIStats } from '@/types/ledger';
import { formatMoney } from '@/utils/currency';

interface NetWorthHeroCardProps {
  stats: KPIStats;
}

function useCountUpNumber(targetValue: number, durationMs = 480): number {
  const [displayValue, setDisplayValue] = useState<number>(targetValue);
  const currentRef = useRef<number>(0);

  useEffect(() => {
    const startVal = currentRef.current;
    const endVal = Number.isFinite(targetValue) ? targetValue : 0;
    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }
    if (typeof requestAnimationFrame !== 'function') {
      currentRef.current = endVal;
      setDisplayValue(endVal);
      return;
    }

    let rafId: number | null = null;
    const startTime = Date.now();

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = startVal + (endVal - startVal) * eased;

      if (progress < 1) {
        currentRef.current = nextVal;
        setDisplayValue(nextVal);
        rafId = requestAnimationFrame(step);
      } else {
        currentRef.current = endVal;
        setDisplayValue(endVal);
      }
    };

    rafId = requestAnimationFrame(step);

    return () => {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
    };
  }, [targetValue, durationMs]);

  return displayValue;
}

export function NetWorthHeroCard({
  stats,
}: NetWorthHeroCardProps) {
  const { colors } = useAppTheme();
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);
  const isSyncingFX = useLedgerStore((s) => s.isSyncingFX);
  const syncExchangeRates = useLedgerStore((s) => s.syncExchangeRates);

  const displayNetWorth = useCountUpNumber(stats.netWorth, 480);
  const breatheAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(breatheAnim, {
          toValue: 0,
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
  }, [breatheAnim]);

  const haloOpacity = breatheAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.85],
  });

  const haloScale = breatheAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.06],
  });

  const handleSyncFX = async () => {
    if (isSyncingFX) return;
    console.log('[NetWorthHeroCard/syncFX] Request - Manual FX refresh');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    try {
      await syncExchangeRates();
    } catch (err) {
      console.warn('[NetWorthHeroCard/syncFX] Error -', err);
    }
  };

  return (
    <View
      style={[
        styles.cardContainer,
        {
          shadowColor: '#00F0FF',
        },
      ]}
    >
      {/* Neural AI HUD 3-Stop Gradient + Tactical Grid */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={colors.heroGradientStart} stopOpacity="0.66" />
              <Stop offset="52%" stopColor={colors.heroGradientMid} stopOpacity="0.66" />
              <Stop offset="100%" stopColor={colors.heroGradientEnd} stopOpacity="0.66" />
            </LinearGradient>
            <Pattern
              id="hudGrid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <Line
                x1="20"
                y1="0"
                x2="20"
                y2="20"
                stroke={colors.gridLine}
                strokeWidth="1"
              />
              <Line
                x1="0"
                y1="20"
                x2="20"
                y2="20"
                stroke={colors.gridLine}
                strokeWidth="1"
              />
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroGrad)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#hudGrid)" />
        </Svg>
      </View>

      {/* Breathing Nebula Dual-Core Halo Overlay */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          },
        ]}
      >
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="cyanOrb" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#00F0FF" stopOpacity="0.34" />
              <Stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="violetOrb" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.32" />
              <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="88%" cy="16%" r="135" fill="url(#cyanOrb)" />
          <Circle cx="12%" cy="92%" r="120" fill="url(#violetOrb)" />
        </Svg>
      </Animated.View>

      {/* Top Cyan-to-Violet Energy Accent Line */}
      <Animated.View
        pointerEvents="none"
        style={[styles.topEnergyBar, { opacity: haloOpacity }]}
      >
        <Svg width="100%" height="2" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="heroTopAccent" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#00F0FF" stopOpacity="0.95" />
              <Stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.85" />
              <Stop offset="100%" stopColor="#00F0FF" stopOpacity="0.95" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="2" fill="url(#heroTopAccent)" />
        </Svg>
      </Animated.View>

      <HudReticle variant="primary" color="#00F0FF" size={HUD_RETICLE_SIZE} />

      {/* Top Header Row: Net Worth Label & Live FX Sync */}
      <View style={styles.topRow}>
        <Text style={styles.netWorthLabel}>總資產淨值 ({baseCurrency})</Text>

        <Pressable
          onPress={handleSyncFX}
          disabled={isSyncingFX}
          style={({ pressed }) => [styles.fxButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="同步即時匯率"
        >
          {isSyncingFX ? (
            <ActivityIndicator size="small" color="#00F0FF" />
          ) : (
            <RefreshCw size={11} color="#00F0FF" />
          )}
          <Text style={styles.fxButtonText}>
            {isSyncingFX ? '同步中' : '即時匯率'}
          </Text>
        </Pressable>
      </View>

      {/* Net Worth Figure */}
      <View style={styles.netWorthBlock}>
        <Text style={styles.netWorthValue} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(displayNetWorth, baseCurrency, true)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    position: 'relative',
    backgroundColor: 'rgba(7, 25, 47, 0.55)',
    borderRadius: HUD_RADIUS_LG,
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.55)',
    overflow: 'hidden',
    padding: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 8,
  },
  topEnergyBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fxButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 240, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.36)',
  },
  fxButtonText: {
    color: '#00F0FF',
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  netWorthBlock: {
    marginTop: 10,
  },
  netWorthLabel: {
    color: '#00F0FF',
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  netWorthValue: {
    color: '#F0F9FF',
    fontFamily: MONO_FONT,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 240, 255, 0.42)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  pressed: {
    opacity: 0.78,
  },
});
