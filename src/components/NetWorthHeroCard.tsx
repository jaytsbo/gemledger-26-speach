import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { RefreshCw } from 'lucide-react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useLedgerStore } from '@/store/useLedgerStore';
import { useAppTheme } from '@/theme/ThemeContext';
import { KPIStats } from '@/types/ledger';
import { formatMoney } from '@/utils/currency';

interface NetWorthHeroCardProps {
  stats: KPIStats;
  periodLabel?: string;
}

export function NetWorthHeroCard({
  stats,
}: NetWorthHeroCardProps) {
  const { colors } = useAppTheme();
  const baseCurrency = useLedgerStore((s) => s.baseCurrency);
  const isSyncingFX = useLedgerStore((s) => s.isSyncingFX);
  const syncExchangeRates = useLedgerStore((s) => s.syncExchangeRates);

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
          shadowColor: colors.shadow,
        },
      ]}
    >
      {/* Deep Emerald / Slate SVG Gradient Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={colors.heroGradientStart} />
              <Stop offset="55%" stopColor="#0B3B36" />
              <Stop offset="100%" stopColor={colors.heroGradientEnd} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroGrad)" />
          <Circle cx="92%" cy="12%" r="110" fill="rgba(45, 212, 191, 0.10)" />
          <Circle cx="8%" cy="95%" r="85" fill="rgba(16, 185, 129, 0.08)" />
        </Svg>
      </View>

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
            <ActivityIndicator size="small" color="#A7F3D0" />
          ) : (
            <RefreshCw size={12} color="#A7F3D0" />
          )}
          <Text style={styles.fxButtonText}>
            {isSyncingFX ? '同步中' : '即時匯率'}
          </Text>
        </Pressable>
      </View>

      {/* Net Worth Figure */}
      <View style={styles.netWorthBlock}>
        <Text style={styles.netWorthValue} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(stats.netWorth, baseCurrency, true)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 8,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
  },
  fxButtonText: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '600',
  },
  netWorthBlock: {
    marginTop: 10,
  },
  netWorthLabel: {
    color: 'rgba(226, 232, 240, 0.78)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  netWorthValue: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.78,
  },
});
