import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

import { getDriveAccessToken, isGoogleConfigured, signOutDrive } from '../drive-auth';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    getCurrentUser: jest.fn(),
    getTokens: jest.fn(),
    hasPreviousSignIn: jest.fn(),
    revokeAccess: jest.fn(),
    signIn: jest.fn(),
    signInSilently: jest.fn(),
    signOut: jest.fn(),
  },
  isErrorWithCode: jest.fn((error) => Boolean(error && typeof error === 'object' && 'code' in error)),
  isSuccessResponse: jest.fn((response) => response?.type === 'success'),
  statusCodes: { SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED' },
}));

const mockGetTokens = GoogleSignin.getTokens as jest.Mock;

beforeEach(() => jest.clearAllMocks());

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

test('signs in before revoking when the local Google session was signed out', async () => {
  (GoogleSignin.getCurrentUser as jest.Mock).mockReturnValue(null);
  (GoogleSignin.hasPreviousSignIn as jest.Mock).mockReturnValue(false);
  (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ type: 'success', data: { user: { id: 'account' } } });

  await expect(signOutDrive(true)).resolves.toBe(true);

  expect(GoogleSignin.signIn).toHaveBeenCalledTimes(1);
  expect(GoogleSignin.revokeAccess).toHaveBeenCalledTimes(1);
});

test('reauthenticates and retries when Google reports SIGN_IN_REQUIRED during revoke', async () => {
  (GoogleSignin.getCurrentUser as jest.Mock).mockReturnValue({ user: { id: 'stale-account' } });
  (GoogleSignin.revokeAccess as jest.Mock)
    .mockRejectedValueOnce({ code: 'SIGN_IN_REQUIRED' })
    .mockResolvedValueOnce(null);
  (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ type: 'success', data: { user: { id: 'account' } } });

  await expect(signOutDrive(true)).resolves.toBe(true);

  expect(GoogleSignin.signIn).toHaveBeenCalledTimes(1);
  expect(GoogleSignin.revokeAccess).toHaveBeenCalledTimes(2);
});
