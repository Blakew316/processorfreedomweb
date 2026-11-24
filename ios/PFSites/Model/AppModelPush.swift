import UIKit
import UserNotifications

/// New-order notifications through Apple push. They are only offered when the server has Apple push set up (config.appPush).
@MainActor
extension AppModel {
    /// Whether the person turned notifications on in the app (they can turn them off again without going to iOS Settings).
    var pushWanted: Bool { UserDefaults.standard.bool(forKey: Keys.pushWanted) }

    /// On when the server can send them, iOS allows them and the person wants them.
    var pushOn: Bool { config.appPush && pushAuthorized && pushWanted }

    func refreshPushStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        let status = settings.authorizationStatus
        pushAuthorized = status == .authorized || status == .provisional || status == .ephemeral
        pushDenied = status == .denied
    }

    /// At launch: when notifications are on, ask iOS for the current device token (it can change), which is then sent again.
    func refreshPushRegistration() async {
        await refreshPushStatus()
        if pushAuthorized && pushWanted { UIApplication.shared.registerForRemoteNotifications() }
    }

    /// Asks once, after the first time the dashboard opens, and only when the server can send them.
    func maybeAskForPush() {
        guard config.appPush, !UserDefaults.standard.bool(forKey: Keys.pushAsked) else { return }
        Task {
            // Only the first-time question; never a trip to iOS Settings that the person did not ask for.
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            if settings.authorizationStatus == .notDetermined {
                _ = await requestPush()
            } else {
                UserDefaults.standard.set(true, forKey: Keys.pushAsked)
            }
        }
    }

    /// Turns notifications on: asks iOS (or opens Settings when they were refused there), registers, and sends the token.
    @discardableResult
    func requestPush() async -> Bool {
        guard config.appPush else { return false }
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            UserDefaults.standard.set(true, forKey: Keys.pushAsked)
            suppressCover = true
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            suppressCover = false
            guard granted else {
                pushDenied = true
                return false
            }
        case .denied:
            pushDenied = true
            UIPresenter.openNotificationSettings()
            return false
        default:
            break
        }
        UserDefaults.standard.set(true, forKey: Keys.pushAsked)
        UserDefaults.standard.set(true, forKey: Keys.pushWanted)
        pushAuthorized = true
        pushDenied = false
        if let token = pushToken, await uploadToken(token) { return true }
        tokenSent = nil
        UIApplication.shared.registerForRemoteNotifications()
        // iOS answers with the token in a moment (didRegisterForRemoteNotifications); wait up to 10 seconds for it to be sent.
        for _ in 0..<40 {
            if let sent = tokenSent { return sent }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        return false
    }

    /// Turns notifications off for this phone (the server forgets its address).
    func disablePush() async {
        UserDefaults.standard.set(false, forKey: Keys.pushWanted)
        guard let key = Keychain.device else { return }
        _ = try? await API.delete("/api/app/push", ["device": key.id, "secret": key.secret])
    }

    /// iOS handed over the device token.
    func pushTokenArrived(_ token: String) {
        pushToken = token
        Task { tokenSent = await uploadToken(token) }
    }

    func pushTokenFailed() {
        tokenSent = false
    }

    func uploadPushTokenIfWanted() async {
        guard let token = pushToken else { return }
        _ = await uploadToken(token)
    }

    /// The answer to the website's "Notifications on this device" switch (pfAsk pushState / pushEnable / pushDisable).
    func pushStateReply() async -> [String: Any] {
        await refreshPushStatus()
        return ["supported": config.appPush, "on": pushOn, "denied": pushDenied]
    }

    private func uploadToken(_ token: String) async -> Bool {
        // Only while signed in on this phone (the server ties the address to the person and to this phone's key).
        guard pushWanted, user != nil, let key = Keychain.device else { return false }
        do {
            try await API.post("/api/app/push", ["device": key.id, "secret": key.secret, "token": token, "env": Config.pushEnvironment])
            return true
        } catch {
            return false
        }
    }

}
