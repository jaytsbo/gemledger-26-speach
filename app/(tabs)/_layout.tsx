import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BarChart3, Home, Plus, Settings, Wallet } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { HudReticle, MONO_FONT } from '@/components/ui/HudReticle';
import { SpringPressable } from '@/components/ui/SpringPressable';
import { HUD_RADIUS_LG } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeContext';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const FAB_LONG_PRESS_DELAY_MS = 500;

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

interface TabMeta {
  label: string;
  renderIcon: (color: string, focused: boolean) => React.ReactNode;
}

const TAB_META: Record<string, TabMeta> = {
  index: {
    label: '總覽',
    renderIcon: (color, focused) => (
      <Home size={20} color={color} strokeWidth={focused ? 2.4 : 1.9} />
    ),
  },
  analytics: {
    label: '分析',
    renderIcon: (color, focused) => (
      <BarChart3 size={20} color={color} strokeWidth={focused ? 2.4 : 1.9} />
    ),
  },
  wallet: {
    label: '錢包',
    renderIcon: (color, focused) => (
      <Wallet size={20} color={color} strokeWidth={focused ? 2.4 : 1.9} />
    ),
  },
  settings: {
    label: '設定',
    renderIcon: (color, focused) => (
      <Settings size={20} color={color} strokeWidth={focused ? 2.4 : 1.9} />
    ),
  },
};

function FloatingTabBar({ state, navigation }: TabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  const fabScale = useRef(new Animated.Value(1)).current;
  const plusRotate = useRef(new Animated.Value(0)).current;
  const haloScale = useRef(new Animated.Value(0.82)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;
  const haloAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const longPressTriggeredRef = useRef(false);
  const clearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetRotateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      haloAnimRef.current?.stop();
      haloAnimRef.current = null;
      fabScale.stopAnimation();
      plusRotate.stopAnimation();
      haloScale.stopAnimation();
      haloOpacity.stopAnimation();
      if (resetRotateTimerRef.current) {
        clearTimeout(resetRotateTimerRef.current);
        resetRotateTimerRef.current = null;
      }
      if (clearLongPressTimerRef.current) {
        clearTimeout(clearLongPressTimerRef.current);
        clearLongPressTimerRef.current = null;
      }
    };
  }, [fabScale, haloOpacity, haloScale, plusRotate]);

  const stopHaloAndRestoreFab = useCallback(() => {
    haloAnimRef.current?.stop();
    haloAnimRef.current = null;
    Animated.parallel([
      Animated.spring(fabScale, {
        toValue: 1,
        tension: 260,
        friction: 20,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(haloOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.spring(haloScale, {
        toValue: 0.82,
        tension: 260,
        friction: 20,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [fabScale, haloOpacity, haloScale]);

  const triggerPlusSpin = useCallback(() => {
    if (resetRotateTimerRef.current) {
      clearTimeout(resetRotateTimerRef.current);
      resetRotateTimerRef.current = null;
    }
    plusRotate.stopAnimation();
    Animated.spring(plusRotate, {
      toValue: 1,
      tension: 260,
      friction: 18,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
    resetRotateTimerRef.current = setTimeout(() => {
      Animated.spring(plusRotate, {
        toValue: 0,
        tension: 260,
        friction: 20,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      resetRotateTimerRef.current = null;
    }, 320);
  }, [plusRotate]);

  const handleFabPressIn = useCallback(() => {
    if (clearLongPressTimerRef.current) {
      clearTimeout(clearLongPressTimerRef.current);
      clearLongPressTimerRef.current = null;
    }
    longPressTriggeredRef.current = false;
    Animated.spring(fabScale, {
      toValue: 0.89,
      speed: 42,
      bounciness: 0,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();

    haloAnimRef.current?.stop();
    haloScale.setValue(0.82);
    haloOpacity.setValue(0);
    const holdHaloAnim = Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(haloScale, {
          toValue: 1.18,
          duration: 380,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(haloOpacity, {
          toValue: 0.9,
          duration: 240,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(haloScale, {
              toValue: 1.28,
              duration: 420,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(haloOpacity, {
              toValue: 0.45,
              duration: 420,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]),
          Animated.parallel([
            Animated.timing(haloScale, {
              toValue: 1.14,
              duration: 420,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(haloOpacity, {
              toValue: 0.9,
              duration: 420,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]),
        ]),
      ),
    ]);
    haloAnimRef.current = holdHaloAnim;
    holdHaloAnim.start();
  }, [fabScale, haloOpacity, haloScale]);

  const handleFabPressOut = useCallback(() => {
    stopHaloAndRestoreFab();
    if (longPressTriggeredRef.current) {
      if (clearLongPressTimerRef.current) {
        clearTimeout(clearLongPressTimerRef.current);
      }
      clearLongPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = false;
        clearLongPressTimerRef.current = null;
      }, 60);
    }
  }, [stopHaloAndRestoreFab]);

  const handleQuickAddLongPress = useCallback(() => {
    longPressTriggeredRef.current = true;
    console.log('[FloatingTabBar/QuickAdd] LongPress - Opening /quick-add in AI mode');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    triggerPlusSpin();
    stopHaloAndRestoreFab();
    router.push({ pathname: '/quick-add', params: { mode: 'ai' } });
  }, [router, stopHaloAndRestoreFab, triggerPlusSpin]);

  const handleQuickAddPress = useCallback(() => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    console.log('[FloatingTabBar/QuickAdd] Tap - Opening /quick-add modal');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    triggerPlusSpin();
    router.push('/quick-add');
  }, [router, triggerPlusSpin]);

  const plusRotationStyle = {
    transform: [
      {
        rotate: plusRotate.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '90deg'],
        }),
      },
    ],
  };

  const orderedNames = ['index', 'analytics', 'wallet', 'settings'];
  const visibleRoutes = orderedNames
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is (typeof state.routes)[number] => Boolean(r));

  const leftRoutes = visibleRoutes.slice(0, 2);
  const rightRoutes = visibleRoutes.slice(2, 4);

  const renderTabButton = (route: (typeof state.routes)[number]) => {
    const routeIndex = state.routes.findIndex((r) => r.key === route.key);
    const isFocused = state.index === routeIndex;
    const meta = TAB_META[route.name] ?? {
      label: route.name,
      renderIcon: (color: string) => <Home size={20} color={color} />,
    };

    const tint = isFocused ? colors.primary : colors.textMuted;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        if (Platform.OS !== 'web') {
          Haptics.selectionAsync().catch(() => {});
        }
        navigation.navigate(route.name);
      }
    };

    return (
      <SpringPressable
        key={route.key}
        pressedScale={0.94}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={meta.label}
        onPress={onPress}
        style={[
          styles.tabItem,
          isFocused && {
            backgroundColor: colors.primaryBg,
            borderColor: colors.primaryGlow,
          },
        ]}
      >
        {meta.renderIcon(tint, isFocused)}
        <Text
          style={[
            styles.tabLabel,
            {
              color: tint,
              fontWeight: isFocused ? '700' : '500',
            },
          ]}
          numberOfLines={1}
        >
          {meta.label}
        </Text>
      </SpringPressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.tabBarBg,
            borderColor: colors.tabBarBorder,
            shadowColor: isDark ? colors.primary : colors.shadow,
            shadowOpacity: isDark ? 0.22 : 0.12,
          },
        ]}
      >
        <HudReticle variant="primary" />
        <View style={styles.sideGroup}>{leftRoutes.map(renderTabButton)}</View>

        <View style={styles.fabSlot}>
          <View style={styles.fabWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.fabHalo,
                {
                  borderColor: colors.accent,
                  backgroundColor: colors.accentBg,
                  opacity: haloOpacity,
                  transform: [{ scale: haloScale }],
                },
              ]}
            />
            <Animated.View style={{ transform: [{ scale: fabScale }] }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="快速記帳"
                accessibilityHint="短按開啟極速記帳，長按 0.5 秒直接開啟 AI 智慧記帳"
                delayLongPress={FAB_LONG_PRESS_DELAY_MS}
                onPressIn={handleFabPressIn}
                onPressOut={handleFabPressOut}
                onPress={handleQuickAddPress}
                onLongPress={handleQuickAddLongPress}
                style={[
                  styles.fabButton,
                  {
                    backgroundColor: colors.primary,
                    borderColor: isDark ? 'rgba(0, 240, 255, 0.72)' : '#FFFFFF',
                    shadowColor: colors.primary,
                  },
                ]}
              >
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Svg width="100%" height="100%" preserveAspectRatio="none">
                    <Defs>
                      <LinearGradient id="fabHudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor={colors.primary} />
                        <Stop offset="58%" stopColor={isDark ? '#22D3EE' : '#0284C7'} />
                        <Stop offset="100%" stopColor={colors.accent} />
                      </LinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" fill="url(#fabHudGrad)" />
                  </Svg>
                </View>
                <Animated.View style={plusRotationStyle}>
                  <Plus size={25} color={colors.onPrimary} strokeWidth={2.7} />
                </Animated.View>
              </Pressable>
            </Animated.View>
          </View>
        </View>

        <View style={styles.sideGroup}>{rightRoutes.map(renderTabButton)}</View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: '首頁總覽' }} />
      <Tabs.Screen name="analytics" options={{ title: '統計分析' }} />
      <Tabs.Screen name="wallet" options={{ title: '帳戶錢包' }} />
      <Tabs.Screen name="settings" options={{ title: '系統設定' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    alignItems: 'center',
  },
  bar: {
    position: 'relative',
    width: '100%',
    maxWidth: 540,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: HUD_RADIUS_LG,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 12,
  },
  sideGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 3,
  },
  tabLabel: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  fabSlot: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWrap: {
    width: 54,
    height: 54,
    marginTop: -24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabHalo: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 2,
  },
  fabButton: {
    width: 54,
    height: 54,
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 10,
  },
});
