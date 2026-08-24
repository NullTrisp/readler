import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

import { getDriveAccessToken, isGoogleConfigured } from '../drive-auth';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    getTokens: jest.fn(),
  },
  isSuccessResponse: jest.fn(),
}));

const mockGetTokens = GoogleSignin.getTokens as jest.Mock;

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

test('shares an in-flight token request', async () => {
  let resolve!: (value: { accessToken: string }) => void;
  mockGetTokens.mockReturnValueOnce(new Promise((nextResolve) => {
    resolve = nextResolve;
  }));

  const first = getDriveAccessToken();
  const second = getDriveAccessToken();

  expect(mockGetTokens).toHaveBeenCalledTimes(1);
  resolve({ accessToken: 'token' });

  await expect(first).resolves.toBe('token');
  await expect(second).resolves.toBe('token');
});
