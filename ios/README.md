# PF Sites for iPhone

The PF Sites app is the Processor Freedom back office on iPhone. It signs in like the website (email, password and two-step codes), then opens with a 4-digit passcode or Face ID, and locks itself after 15 minutes without activity, like the website. Every time it is opened fresh (not just brought back from the background) it starts on the passcode screen, and any session left from before is ended. Home, Sale and More are native screens; the pages behind them are the website's own back-office pages, shown inside the app without the website's bars. New orders arrive as iPhone notifications.

- Bundle id `com.processorfreedomsites.app`, display name **PF Sites**, version 1.0 (1).
- iPhone only, portrait, iOS 26 or later, built with Xcode 27.2 and the iOS 27.2 SDK (Liquid Glass throughout).
- No third-party packages.

## Open and run it

1. On the Mac, open `ios/PFSites.xcodeproj` in Xcode 27.2.
2. Signing is already set: team **D8D94SXAG6**, automatic signing. If Xcode asks, sign in to that Apple developer account under Xcode › Settings › Accounts. The app asks for two capabilities, Push Notifications and Associated Domains (`webcredentials:processorfreedomsites.com`, so iOS offers texted sign-in codes and saved passwords in the Log in and Two-step screens); automatic signing adds both to the app id the first time it builds.
3. Choose your iPhone (or a simulator) at the top of the window and press **Run**.

The app talks to the live site, https://processorfreedomsites.com. To try it in the simulator against a local server, edit the scheme (Product › Scheme › Edit Scheme › Run › Arguments) and turn on the argument `-PFBaseURL http://localhost:8080` (debug builds only; use the port your local server prints).

## Images the project expects

The asset catalog already has the colours. These image files go into `ios/PFSites/Assets.xcassets`:

- `AppIcon.appiconset/AppIcon-1024.png`, `AppIcon-1024-dark.png`, `AppIcon-1024-tinted.png` (1024 x 1024, no transparency in the light one).
- `LaunchLockup.imageset/LaunchLockup.png`, `LaunchLockup@2x.png`, `LaunchLockup@3x.png`, and the dark versions `LaunchLockup-dark.png`, `LaunchLockup-dark@2x.png`, `LaunchLockup-dark@3x.png` (308 x 270 pt: the tile and "Processor Freedom" at the top, transparent below, so it sits 113 pt above the middle of the screen when centred).
- `LogoTile.imageset/LogoTile.pdf` (the navy PF tile, rounded, as a vector PDF).

## What the server needs

The app uses the routes under `/api/app/` (device keys, passcodes, Face ID, unlock, Apple push, the light businesses list) and `/api/auth/login` with the `device`, `trust` and `remember` fields. Two features also need keys on the server. They go in **Render › the service › Environment**, never in the code:

- **New-order notifications (Apple push):** `APNS_KEY_ID`, `APNS_TEAM_ID` (D8D94SXAG6), `APNS_KEY` (the contents of the .p8 key from developer.apple.com › Certificates, Identifiers & Profiles › Keys, with Apple Push Notifications enabled) and, if the bundle id ever changes, `APNS_BUNDLE_ID`. A key made for one environment only goes in `APNS_KEY_ID` / `APNS_KEY` when it is the production key, and in `APNS_SANDBOX_KEY_ID` / `APNS_SANDBOX_KEY` when it is the sandbox key; a key made for both environments goes in `APNS_KEY_ID` / `APNS_KEY` alone and is used for both. Without them the app shows notifications as "Not available yet".
- **Two-step codes by text message:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, either `TWILIO_FROM` (the sending number, like +15551234567) or `TWILIO_MESSAGING_SERVICE_SID`, and `APP_URL` (https://processorfreedomsites.com: each texted code names that address, which is how iPhones offer it to fill in). Without them only authenticator-app codes work.

Texted codes and saved passwords in the app need nothing more: the server already serves `/.well-known/apple-app-site-association` for `D8D94SXAG6.com.processorfreedomsites.app`, which the app's Associated Domains entitlement points to.

Builds installed from Xcode get sandbox device tokens (even a Release build, or Product › Profile), and TestFlight and App Store builds get production ones. The app reads which from how it was signed (its provisioning profile) and tells the server, so the server sends each phone's notifications to the right Apple service.

## How it is put together

- `PFSites/App`: the app entry, the app delegate (notifications), the server address, the lock and privacy windows, and the touch recorder for the 15-minute rule.
- `PFSites/Model`: talking to the server, the Keychain, the app model (sign-in, passcode, Face ID, lock, sign out, push), the Sale order, the idle timer and the website's page lists.
- `PFSites/Web`: the web views that show the website's pages, how links, downloads and printing are handled, and the bridge the website talks to (`window.webkit.messageHandlers.pf` and `pfAsk`).
- `PFSites/Views`: the screens: loading, sign-in (Welcome, Log in, Two-step), choose a location, passcode and lock, the four tabs (Home, Sale, Orders, More), Settings and the pages pushed from them.
