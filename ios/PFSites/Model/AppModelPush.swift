import UIKit
import UserNotifications

/// New-order notifications through Apple push. They are only offered when the server has Apple push set up (config.appPush).
@MainActor
extension AppModel {
    /// Whether the person turned notifications on in the app (they can turn them off again without going to iOS Settings).
    var pushWanted: Bool { UserDefaults.standard.bool(forKey: Keys.pushWanted) }

    /// On when the server can send them, iOS allows them, the person wants them and the server has this phone's address.
    var pushOn: Bool { config.appPush && pushAuthorized && pushWanted && pushSent }

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

    /// Turns notifications off for this phone (the server forgets its address). False when the server could not be told: then
    /// nothing changes here, since the server still has the address and keeps sending.
    @discardableResult
    func disablePush() async -> Bool {
        let wanted = pushWanted
        // Off first, so no address is sent again while the server is being told.
        UserDefaults.standard.set(false, forKey: Keys.pushWanted)
        if let key = Keychain.device {
            do {
                try await API.delete("/api/app/push", ["device": key.id, "secret": key.secret])
            } catch let error as APIError where error.signIn {
                // The server already forgot this phone, and its address went with it.
            } catch {
                UserDefaults.standard.set(wanted, forKey: Keys.pushWanted)
                // A plain 401: the session ended (signed out everywhere); check, then lock.
                if let failure = error as? APIError, failure.sessionEnded { sessionEnded() }
                return false
            }
        }
        pushSent = false
        return true
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
        tokenSent = await uploadToken(token)
    }

    /// As the dashboard opens: this phone's address for notifications goes to the server again (it is tied to the phone's key,
    /// which every sign-in replaces). After Log out iOS was told to stop, so there is no address yet: iOS is asked for one, and
    /// it is sent when it arrives (`pushTokenArrived`).
    func sendPushAddress() async {
        if pushToken == nil {
            await refreshPushRegistration()
        } else {
            await uploadPushTokenIfWanted()
        }
    }

    /// Log out, or the server forgot this phone: notifications stop here whatever the server knows. The server drops the
    /// phone's address when it is told, but a phone logged out with no connection cannot tell it, and must not go on showing
    /// new orders to whoever holds it. So iOS itself is told to stop; the next sign-in asks for the address again.
    func stopPushOnThisPhone() {
        UIApplication.shared.unregisterForRemoteNotifications()
        pushToken = nil
        tokenSent = nil
        pushSent = false
    }

    /// The answer to the website's "Notifications on this device" switch (pfAsk pushState / pushEnable / pushDisable).
    func pushStateReply() async -> [String: Any] {
        await refreshPushStatus()
        // A token on its way to the server (it is sent as the dashboard opens) is waited for, up to 10 seconds, so the answer is
        // what the server has.
        for _ in 0..<40 where pushUploads > 0 {
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        return ["supported": config.appPush, "on": pushOn, "denied": pushDenied]
    }

    /// Sends this phone's address to the server, only while signed in on this phone (the server ties the address to the person and to
    /// this phone's key). When the server cannot be reached, what it has stays as it was, and so does `pushSent`.
    private func uploadToken(_ token: String) async -> Bool {
        guard pushWanted, user != nil, let key = Keychain.device else { return false }
        pushUploads += 1
        defer { pushUploads -= 1 }
        do {
            try await API.post("/api/app/push", ["device": key.id, "secret": key.secret, "token": token, "env": Config.pushEnvironment])
            pushSent = true
            return true
        } catch let error as APIError where error.status == 400 || error.signIn {
            // Refused (an address the server cannot use), or the server forgot this phone and its address with it.
            pushSent = false
            return false
        } catch {
            return false
        }
    }

}
