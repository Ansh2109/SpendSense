import React, { useEffect, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useAppTheme } from '../src/context/ThemeContext';
import { initDatabase } from '../src/db/seed';
import { authenticateAppLock, isAppLockEnabled } from '../src/services/appLockService';

// Database setup must finish before any tab can query it.
initDatabase();

function RootNavigation() {
  const { isDark, colors } = useAppTheme();
  const [isUnlocked, setIsUnlocked] = useState(() => !isAppLockEnabled());

  const unlock = async () => {
    if (!isAppLockEnabled()) {
      setIsUnlocked(true);
      return;
    }
    setIsUnlocked(await authenticateAppLock());
  };

  useEffect(() => {
    void unlock();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAppLockEnabled()) void unlock();
      if (state !== 'active' && isAppLockEnabled()) setIsUnlocked(false);
    });
    return () => subscription.remove();
  }, []);

  if (!isUnlocked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background, padding: 24 }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>SpendSense is locked</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Use your device authentication to continue.</Text>
        <TouchableOpacity onPress={unlock} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Unlock</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerTitleAlign: 'center',
            presentation: 'modal',
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
        <RootNavigation />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
