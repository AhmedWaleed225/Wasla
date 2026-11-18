import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Small key-value store for the refresh token and language choice.
 * Phones: the Keychain / Keystore via expo-secure-store.
 * Web (development preview only — web is not a shipping target): the browser's
 * localStorage, because SecureStore doesn't exist there. Anything stored this way
 * is readable by scripts on the page, so the web build must not be used in production.
 */
const web = Platform.OS === 'web';

export async function getItemAsync(key: string): Promise<string | null> {
  if (!web) return SecureStore.getItemAsync(key);
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (!web) return SecureStore.setItemAsync(key, value);
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Private mode or storage disabled: the session just won't survive a reload.
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (!web) return SecureStore.deleteItemAsync(key);
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}
