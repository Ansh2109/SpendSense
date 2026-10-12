import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { settingsRepository, SETTING_KEYS } from '../db/repositories/settingsRepository';

export function isAppLockEnabled(): boolean {
  return settingsRepository.get(SETTING_KEYS.appLockEnabled) === '1';
}

export function setAppLockEnabled(enabled: boolean): void {
  settingsRepository.set(SETTING_KEYS.appLockEnabled, enabled ? '1' : '0');
}

export async function canUseAppLock(): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'App lock works on a phone, not in the browser.' };
  }
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return { ok: false, reason: 'No Face ID or fingerprint sensor on this device.' };
    }
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      return { ok: false, reason: 'Set up Face ID or a fingerprint in your phone settings first.' };
    }
    return { ok: true };
  } catch (err) {
    console.error('App lock hardware check failed:', err);
    return { ok: false, reason: 'Could not check lock hardware.' };
  }
}

export async function authenticateAppLock(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock SpendSense',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch (err) {
    console.error('App lock authenticate failed:', err);
    return false;
  }
}
