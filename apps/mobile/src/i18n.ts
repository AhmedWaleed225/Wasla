import { ar, en, type Locale } from '@wasla/shared';
import { getLocales } from 'expo-localization';
import * as Updates from 'expo-updates';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DevSettings, I18nManager, Platform } from 'react-native';
import * as SecureStore from './secure-storage';

/** Browser preview: direction comes from the page's dir attribute, no reload needed. */
function setWebDirection(rtl: boolean) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = rtl ? 'ar' : 'en';
}

const LANGUAGE_KEY = 'wasla.language';

export async function getStoredLanguage(): Promise<Locale | null> {
  const v = await SecureStore.getItemAsync(LANGUAGE_KEY);
  return v === 'ar' || v === 'en' ? v : null;
}

function deviceLanguage(): Locale {
  return getLocales()[0]?.languageCode === 'en' ? 'en' : 'ar';
}

/** Initialises translations and makes sure the native layout direction matches. */
export async function initI18n(): Promise<Locale> {
  const lang = (await getStoredLanguage()) ?? deviceLanguage();
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  I18nManager.allowRTL(true);
  const wantRTL = lang === 'ar';
  if (Platform.OS === 'web') {
    I18nManager.forceRTL(wantRTL);
    setWebDirection(wantRTL);
  } else if (I18nManager.isRTL !== wantRTL) {
    I18nManager.forceRTL(wantRTL);
    await reloadApp();
  }
  return lang;
}

/**
 * Switches language. React Native only changes layout direction on a fresh
 * start, so switching between Arabic and English reloads the app.
 */
export async function setLanguage(lang: Locale): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, lang);
  await i18n.changeLanguage(lang);
  const wantRTL = lang === 'ar';
  if (Platform.OS === 'web') {
    I18nManager.forceRTL(wantRTL);
    setWebDirection(wantRTL);
    // Re-render everything in the new direction.
    if (typeof window !== 'undefined') window.location.reload();
  } else if (I18nManager.isRTL !== wantRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(wantRTL);
    await reloadApp();
  }
}

export async function hasChosenLanguage(): Promise<boolean> {
  return (await getStoredLanguage()) !== null;
}

async function reloadApp() {
  try {
    await Updates.reloadAsync();
  } catch {
    // In a development build without expo-updates enabled.
    DevSettings.reload();
  }
}

export const isRTL = () => I18nManager.isRTL;
export default i18n;
