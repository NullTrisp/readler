import { Platform } from 'react-native';

import { isGoogleConfigured } from '../drive-auth';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {},
  isSuccessResponse: jest.fn(),
}));

test('uses the Android client ID instead of the web client ID on Android', () => {
  const platform = Platform.OS;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = 'android-client';
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    expect(isGoogleConfigured()).toBe(true);

    delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
    expect(isGoogleConfigured()).toBe(false);
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    if (androidClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = androidClientId;
    if (webClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = webClientId;
  }
});
