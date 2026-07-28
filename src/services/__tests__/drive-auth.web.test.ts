import { isOAuthBridgeResponse } from '../drive-auth.web';

test('accepts only the matching Google OAuth bridge response', () => {
  expect(isOAuthBridgeResponse({ type: 'readler-google-oauth', nonce: 'right', access_token: 'token', expires_in: 3600 }, 'right')).toBe(true);
  expect(isOAuthBridgeResponse({ type: 'readler-google-oauth', nonce: 'wrong', access_token: 'token' }, 'right')).toBe(false);
  expect(isOAuthBridgeResponse({ type: 'readler-google-oauth', nonce: 'right' }, 'right')).toBe(false);
});
