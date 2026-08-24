import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
];

export interface DriveUser {
  user: { id: string; email: string; name: string | null; photo?: string | null };
}

let configured = false;
let pendingToken: Promise<string> | null = null;

function configureGoogle() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: Platform.OS === 'android' ? undefined : process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: DRIVE_SCOPES,
    offlineAccess: false,
  });
  configured = true;
}

export function isGoogleConfigured() {
  return Boolean(Platform.OS === 'android'
    ? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    : process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
}

export async function signInToDrive(): Promise<DriveUser | null> {
  configureGoogle();
  const response = await GoogleSignin.signIn();
  return isSuccessResponse(response) ? response.data : null;
}

export async function restoreDriveSession(): Promise<DriveUser | null> {
  configureGoogle();
  if (!GoogleSignin.hasPreviousSignIn()) return null;
  const response = await GoogleSignin.signInSilently();
  return response.type === 'success' ? response.data : null;
}

export async function signOutDrive(revoke = false) {
  configureGoogle();
  await pendingToken?.catch(() => undefined);
  if (!revoke) {
    await GoogleSignin.signOut();
    return true;
  }

  if (!GoogleSignin.getCurrentUser()) {
    const response = GoogleSignin.hasPreviousSignIn()
      ? await GoogleSignin.signInSilently()
      : await GoogleSignin.signIn();
    if (response.type !== 'success') return false;
  }
  try {
    await GoogleSignin.revokeAccess();
  } catch (caught) {
    if (!isErrorWithCode(caught) || caught.code !== statusCodes.SIGN_IN_REQUIRED) throw caught;
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return false;
    await GoogleSignin.revokeAccess();
  }
  return true;
}

export async function getDriveAccessToken() {
  configureGoogle();
  if (pendingToken) return pendingToken;

  const tokenPromise = GoogleSignin.getTokens()
    .then(({ accessToken }) => accessToken)
    .finally(() => {
      pendingToken = null;
    });
  pendingToken = tokenPromise;
  return tokenPromise;
}
