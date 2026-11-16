import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLedgerStore } from '@/store/useLedgerStore';
import { ThemeProvider, useAppTheme } from '@/theme/ThemeContext';

function RootNavigator() {
  const initialize = useLedgerStore((state) => state.initialize);
  const { isDark, colors } = useAppTheme();

  useEffect(() => {
    console.log('[RootLayout/mount] Initialize - Calling useLedgerStore().initialize()');
    initialize().catch((err) => {
      console.warn('[RootLayout/mount] InitializeFailed -', err);
    });
  }, [initialize]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="quick-add"
          options={{
            presentation: 'modal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
