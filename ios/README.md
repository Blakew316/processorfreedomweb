# PF Sites for iPhone

The PF Sites app is the Processor Freedom back office on iPhone. It signs in like the website (email, password and two-step codes), then opens with a 4-digit passcode or Face ID, and locks itself after 15 minutes without activity, like the website. Every time it is opened fresh (not just brought back from the background) it starts on the passcode screen, and any session left from before is ended. Home, Sale, Orders and More are native screens; the pages behind them are the website's own back-office pages, shown inside the app without the website's bars. New orders arrive as iPhone notifications.

- Bundle id `com.processorfreedomsites.app`, display name **PF Sites**, version 1.0 (1).
- iPhone only, portrait, iOS 26 or later, built with Xcode 27.2 and the iOS 27.2 SDK (Liquid Glass throughout).
- No third-party packages.

## Open and run it

1. On the Mac, open `ios/PFSites.xcodeproj` in Xcode 27.2.
2. Signing is already set in the project: team **D8D94SXAG6** (`DEVELOPMENT_TEAM` in the PFSites target, shown under Signing & Capabilities) with automatic signing. If Xcode asks, sign in to that Apple developer account under Xcode › Settings › Accounts; if it shows no team, choose that account's team there and Xcode keeps D8D94SXAG6. The app asks for two capabilities, Push Notifications and Associated Domains (`webcredentials:processorfreedomsites.com`, so iOS offers texted sign-in codes and saved passwords in the Log in and Two-step screens); automatic signing adds both to the app id the first time it builds.
3. Choose your iPhone (or a simulator) at the top of the window and press **Run**.

The app talks to the live site, https://processorfreedomsites.com. To try it in the simulator against a local server, edit the scheme (Product › Scheme › Edit Scheme › Run › Arguments) and turn on the argument `-PFBaseURL http://localhost:8080` (debug builds only; use the port your local server prints).

## Images

The asset catalog has the colours and these images (to change one, replace the file of the same name in `ios/PFSites/Assets.xcassets`):

- `AppIcon.appiconset/AppIcon-1024.png`, `AppIcon-1024-dark.png`, `AppIcon-1024-tinted.png` (1024 x 1024, no transparency in the light one).
- `LaunchLockup.imageset/LaunchLockup.png`, `LaunchLockup@2x.png`, `LaunchLockup@3x.png`, and the dark versions `LaunchLockup-dark.png`, `LaunchLockup-dark@2x.png`, `LaunchLockup-dark@3x.png` (308 x 270 pt: the tile and "Processor Freedom" at the top, transparent below, so it sits 113 pt above the middle of the screen when centred).
- `LogoTile.imageset/LogoTile.pdf` (the navy PF tile, rounded, as a vector PDF).

## What the server needs

The app uses the routes under `/api/app/` (device keys, passcodes, Face ID, unlock, Apple push, the light businesses list) and `/api/auth/login` with the `device`, `trust` and `remember` fields. Two features also need keys on the server. They go in **Render › the service › Environment**, never in the code:

- **New-order notifications (Apple push):** `APNS_KEY_ID`, `APNS_TEAM_ID` (D8D94SXAG6), `APNS_KEY` (the contents of the .p8 key from developer.apple.com › Certificates, Identifiers & Profiles › Keys, with Apple Push Notifications enabled) and, if the bundle id ever changes, `APNS_BUNDLE_ID`. A key made for one environment only goes in `APNS_KEY_ID` / `APNS_KEY` when it is the production key, and in `APNS_SANDBOX_KEY_ID` / `APNS_SANDBOX_KEY` when it is the sandbox key; a key made for both environments goes in `APNS_KEY_ID` / `APNS_KEY` alone and is used for both. Without them the app shows notifications as "Not available yet".
- **Two-step codes by text message:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, either `TWILIO_FROM` (the sending number, like +15551234567) or `TWILIO_MESSAGING_SERVICE_SID`, and `APP_URL` (https://processorfreedomsites.com: each texted code names that address, which is how iPhones offer it to fill in). Without all of them only authenticator-app codes work. Texts go only to the country calling codes in `SMS_COUNTRIES` (1, the US and Canada, unless it says otherwise).

Texted codes and saved passwords in the app need nothing more: the server already serves `/.well-known/apple-app-site-association` for `D8D94SXAG6.com.processorfreedomsites.app`, which the app's Associated Domains entitlement points to.

Builds installed from Xcode get sandbox device tokens (even a Release build, or Product › Profile), and TestFlight and App Store builds get production ones. The app reads which from how it was signed (its provisioning profile) and tells the server, so the server sends each phone's notifications to the right Apple service.

## Signing in on the iPhone

- The first sign-in is the email and password (and the two-step code when it is on). The server then gives the phone its own key, and the person types their 4-digit passcode for the business (or makes one). From then on the passcode or Face ID opens the app.
- At a business the person owns, the passcode opens everything they have. A team member's passcode is one the business gave them, so it opens only that business; "Change location" then offers "Sign in with email to see all your businesses".
- Turning on two-step sign-in, signing out everywhere, or changing or resetting the password makes every phone sign in with the email and password again.
- Deleting the app signs the phone out: installed again, it starts at Welcome, and its old key is given up on the server.

## How it is put together

- `PFSites/App`: the app entry, the app delegate (notifications), the server address, the lock and privacy windows, and the touch recorder for the 15-minute rule.
- `PFSites/Model`: talking to the server, the Keychain, the app model (sign-in, passcode, Face ID, lock, sign out, push), the Sale order, the Orders tab's orders, the idle timer and the website's page lists.
- `PFSites/Web`: the web views that show the website's pages, how links, downloads and printing are handled, and the bridge the website talks to (`window.webkit.messageHandlers.pf` and `pfAsk`).
- `PFSites/Views`: the screens: loading, sign-in (Welcome, Log in, Two-step), choose a location, passcode and lock, the four tabs (Home, Sale, Orders, More), the barcode scanner, Settings and the pages pushed from them.
