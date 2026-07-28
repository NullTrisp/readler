export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
];

export interface DriveUser {
  user: { id: string; email: string; name: string | null; photo?: string | null };
}

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken(options?: { prompt?: string }): void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: { client_id: string; scope: string; callback(response: TokenResponse): void }): TokenClient;
          revoke(token: string, callback: () => void): void;
        };
      };
    };
  }
}

let accessToken: string | null = null;
let expiresAt = 0;
let tokenClient: TokenClient | null = null;
let pendingToken: { resolve(token: string): void; reject(error: Error): void } | null = null;

export function isGoogleConfigured() {
  return Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
}

async function loadGoogleIdentity() {
  if (window.google?.accounts.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-readler-google]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity Services could not be loaded.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.readlerGoogle = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Services could not be loaded.'));
    document.head.appendChild(script);
  });
}

async function requestToken(prompt: '' | 'consent' = '') {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!clientId) throw new Error('Google OAuth is not configured for web.');
  await loadGoogleIdentity();
  if (!tokenClient) {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: [...DRIVE_SCOPES, 'openid', 'email', 'profile'].join(' '),
      callback(response) {
        const pending = pendingToken;
        pendingToken = null;
        if (!pending) return;
        if (!response.access_token || response.error) {
          pending.reject(new Error(response.error ?? 'Google did not return an access token.'));
          return;
        }
        accessToken = response.access_token;
        expiresAt = Date.now() + Math.max(30, (response.expires_in ?? 3600) - 60) * 1000;
        pending.resolve(accessToken);
      },
    });
  }
  return new Promise<string>((resolve, reject) => {
    pendingToken = { resolve, reject };
    tokenClient!.requestAccessToken({ prompt });
  });
}

export async function signInToDrive(): Promise<DriveUser | null> {
  const token = await requestToken('consent');
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Could not load the Google profile (${response.status}).`);
  const profile = await response.json() as { sub: string; email: string; name: string; picture?: string };
  return { user: { id: profile.sub, email: profile.email, name: profile.name, photo: profile.picture } };
}

export async function restoreDriveSession(): Promise<DriveUser | null> {
  return null;
}

export async function signOutDrive(revoke = false) {
  const token = accessToken;
  accessToken = null;
  expiresAt = 0;
  if (revoke && token && window.google?.accounts.oauth2) {
    await new Promise<void>((resolve) => window.google!.accounts.oauth2.revoke(token, resolve));
  }
}

export async function getDriveAccessToken() {
  if (accessToken && Date.now() < expiresAt) return accessToken;
  return requestToken('');
}
