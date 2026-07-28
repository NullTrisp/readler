import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
];

export interface DriveUser {
  user: { id: string; email: string; name: string | null; photo?: string | null };
}

let configured = false;

function configureGoogle() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: DRIVE_SCOPES,
    offlineAccess: false,
  });
  configured = true;
}

export function isGoogleConfigured() {
  return Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
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
  if (revoke) await GoogleSignin.revokeAccess();
  else await GoogleSignin.signOut();
}

export async function getDriveAccessToken() {
  configureGoogle();
  return (await GoogleSignin.getTokens()).accessToken;
}
