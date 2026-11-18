import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { ReadexPro_500Medium, ReadexPro_600SemiBold, ReadexPro_700Bold } from '@expo-google-fonts/readex-pro';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../src/api/client';
import i18n, { initI18n } from '../src/i18n';
import { useAuth } from '../src/stores/auth';
import { colors } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't hammer the API with retries for errors that won't change.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export default function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);
  const bootstrap = useAuth((s) => s.bootstrap);
  const status = useAuth((s) => s.status);
  const [fontsLoaded] = useFonts({
    ReadexPro_500Medium,
    ReadexPro_600SemiBold,
    ReadexPro_700Bold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  useEffect(() => {
    void initI18n().then(() => {
      setI18nReady(true);
      void bootstrap();
    });
  }, [bootstrap]);

  const ready = fontsLoaded && i18nReady && status !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!fontsLoaded || !i18nReady) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
            <Stack.Screen name="location-search" options={{ presentation: 'modal' }} />
          </Stack>
        </SafeAreaProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
