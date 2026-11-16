import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BarChart3, Home, Plus, Settings, Wallet } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeContext';

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

  const handleQuickAddPress = async () => {
    console.log('[FloatingTabBar/QuickAdd] Tap - Opening /quick-add modal');
    if (Platform.OS !== 'web') {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {
        // Ignore haptics errors on unsupported devices
      }
    }
    router.push('/quick-add');
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
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={meta.label}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tabItem,
          isFocused && {
            backgroundColor: isDark ? 'rgba(20, 184, 166, 0.14)' : 'rgba(15, 118, 110, 0.1)',
          },
          pressed && styles.tabPressed,
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
      </Pressable>
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
            shadowColor: colors.shadow,
            shadowOpacity: isDark ? 0.45 : 0.12,
          },
        ]}
      >
        <View style={styles.sideGroup}>{leftRoutes.map(renderTabButton)}</View>

        <View style={styles.fabSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="快速記帳"
            onPress={handleQuickAddPress}
            style={({ pressed }) => [
              styles.fabButton,
              {
                backgroundColor: colors.primary,
                borderColor: isDark ? '#0F172A' : '#FFFFFF',
                shadowColor: colors.primary,
              },
              pressed && styles.fabPressed,
            ]}
          >
            <Plus size={26} color="#FFFFFF" strokeWidth={2.7} />
          </Pressable>
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
    width: '100%',
    maxWidth: 540,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 28,
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
    borderRadius: 18,
    gap: 3,
  },
  tabPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  fabSlot: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -24,
    borderWidth: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.92,
  },
});
