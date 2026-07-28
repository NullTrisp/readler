import i18n from '@/i18n';

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
];

export interface DriveUser {
  user: { id: string; email: string; name: string | null; photo?: string | null };
}

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken(options?: { prompt?: string }): void };
type OAuthBridgeResponse = TokenResponse & { type: 'readler-google-oauth'; nonce: string };

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
let pendingToken: Promise<string> | null = null;

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
  if (pendingToken) return pendingToken;

  const nonce = crypto.randomUUID();
  const channel = new BroadcastChannel(`readler-google-oauth:${nonce}`);
  const url = new URL('/google-oauth.html', window.location.origin);
  url.search = new URLSearchParams({
    client_id: clientId,
    scope: [...DRIVE_SCOPES, 'openid', 'email', 'profile'].join(' '),
    prompt,
    nonce,
    body: i18n.t('googleOauthBody'),
    continue: i18n.t('googleOauthContinue'),
    invalid: i18n.t('googleOauthInvalid'),
    close: i18n.t('googleOauthClose'),
  }).toString();

  pendingToken = new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Google OAuth timed out.')), 120_000);
    channel.onmessage = ({ data }) => {
      if (!isOAuthBridgeResponse(data, nonce)) return;
      window.clearTimeout(timeout);
      if (!data.access_token || data.error) {
        reject(new Error(data.error ?? 'Google did not return an access token.'));
        return;
      }
      accessToken = data.access_token;
      expiresAt = Date.now() + Math.max(30, (data.expires_in ?? 3600) - 60) * 1000;
      resolve(accessToken);
    };
    if (!window.open(url, 'readler-google-oauth', 'popup,width=520,height=680')) {
      window.clearTimeout(timeout);
      reject(new Error('Google OAuth popup was blocked.'));
    }
  }).finally(() => {
    channel.close();
    pendingToken = null;
  });
  return pendingToken;
}

export function isOAuthBridgeResponse(value: unknown, nonce: string): value is OAuthBridgeResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  const expiresIn = response.expires_in;
  return response.type === 'readler-google-oauth'
    && response.nonce === nonce
    && (typeof response.access_token === 'string' || typeof response.error === 'string')
    && (expiresIn === undefined || (typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0));
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
  if (revoke && token) {
    await loadGoogleIdentity();
    await new Promise<void>((resolve) => window.google!.accounts.oauth2.revoke(token, resolve));
  }
}

export async function getDriveAccessToken() {
  if (accessToken && Date.now() < expiresAt) return accessToken;
  return requestToken('');
}
