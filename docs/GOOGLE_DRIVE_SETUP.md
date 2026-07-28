# Google Drive configuration

1. Create a Google Cloud project and enable Google Drive API.
2. Configure the OAuth consent screen as an external production application.
3. Add `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.readonly`, and `https://www.googleapis.com/auth/drive.appdata`.
4. Create Android OAuth clients for every debug, EAS, and Play App Signing SHA-1 certificate using package `com.nicolas.readler`.
5. Create an iOS OAuth client for bundle ID `com.nicolas.readler` and a Web application client ID.
6. Add every development and production web origin to the Web client's **Authorized JavaScript origins**. Do not add a client secret to Readler.
7. Put the Web and iOS client IDs in `.env.local` using `.env.example`.
8. Replace `REPLACE_WITH_IOS_CLIENT_ID` in `app.json` with the reversed iOS client ID, for example `com.googleusercontent.apps.123456789`.
9. Rebuild the native development clients whenever the native OAuth configuration changes.

The web build uses Google Identity Services in the browser. Access tokens remain in memory, expire automatically, and may require the user to sign in again after reloading the page. Progress and downloaded/imported files remain in browser storage.

`drive.readonly` is restricted. A public release must complete Google's OAuth verification and demonstrate that Readler reads only the folder selected by the user. If restricted-scope data is ever transmitted to a custom backend, an additional security assessment may be required; v1 has no backend.

No OAuth client secret belongs in this repository or the application bundle.
