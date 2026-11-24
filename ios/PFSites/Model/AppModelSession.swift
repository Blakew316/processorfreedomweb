import SwiftUI
import UIKit
import WebKit

/// Signing in, the passcode and Face ID, locking and signing out.
@MainActor
extension AppModel {
    // MARK: Signing in (D2, D3, D4)

    /// The email and password (and the two-step code when there is one). The server makes a key for this phone on success.
    func logIn(email: String, password: String, code: String? = nil, remember: Bool = false, sendText: Bool = false) async -> LogInOutcome {
        var body: [String: Any] = ["email": email, "password": password, "device": ["name": UIDevice.current.name]]
        if let trust = Keychain.trust(for: email) { body["trust"] = trust }
        if let code, !code.isEmpty {
            body["code"] = code
            if remember { body["remember"] = true }
        }
        if sendText { body["sendText"] = true }
        _ = await endingSession?.value
        do {
            let answer = try await API.post("/api/auth/login", body)
            await signedIn(answer, email: email)
            return .success
        } catch let error as APIError {
            return error.twoFactor ? .needsCode(error) : .failed(error.message)
        } catch {
            return .failed(APIError.unreachableMessage)
        }
    }

    private func signedIn(_ answer: JSON, email: String) async {
        Haptics.success()
        let person = User(answer["user"]) ?? user ?? User()
        user = person
        remember(person)
        let old = Keychain.device
        let id = answer["device"]["id"].string, secret = answer["device"]["secret"].string
        if !id.isEmpty, !secret.isEmpty {
            let fresh = DeviceKey(id: id, secret: secret)
            Keychain.saveDevice(fresh)
            // The phone's earlier key (an earlier sign-in, or another person) is given up without ending the new session,
            // and what belonged to it goes too: its Face ID secret and the business it opened.
            if let old, old.id != fresh.id {
                Task { _ = try? await API.send("POST", "/api/app/signout", body: ["device": old.id, "secret": old.secret], cookies: false) }
                Keychain.delete("bio")
                Keychain.delete("site")
                setFaceIDFlag(false)
            }
        }
        let trust = answer["trust"].string
        if !trust.isEmpty { Keychain.saveTrust(trust, for: email) }
        await loadConfig()
        await syncCookiesToWeb()
        do {
            let list = try await loadSites()
            switch list.count {
            case 0: setPhase(.creatingBusiness)
            case 1: await passcodeStep(for: list[0])
            default: setPhase(.choosingLocation)
            }
        } catch {
            showLaunchError(error)
        }
    }

    /// The passcode step for a business after a full sign-in: type the passcode they have there, or make one.
    func passcodeStep(for business: Site) async {
        guard Keychain.device != nil else {
            // Without a key for this phone (a very old server) there is nothing to set up: straight to the dashboard.
            await enterReady(business)
            return
        }
        let forgot = auth.forgotPasscode
        var has = false
        if !forgot {
            do {
                has = try await API.get("/api/app/passcode?site=\(Config.query(business.id))")["has"].bool
            } catch {
                showLaunchError(error)
                return
            }
        }
        setPhase(.passcode(PasscodeStep(purpose: .afterSignIn(has: has, forgot: forgot), site: business.ref)))
    }

    /// Choose your primary location (D5), after signing in with more than one business.
    func chooseLocation(_ business: Site) {
        Task { await passcodeStep(for: business) }
    }

    /// The passcode step finished after signing in: the dashboard.
    func passcodeFinished(for ref: SiteRef) async {
        auth.forgotPasscode = false
        let business = sites.first(where: { $0.id == ref.id })
        if let business {
            showLoading = true
            await enterReady(business)
        } else {
            do { try await continueSignedIn() } catch { showLaunchError(error) }
        }
    }

    // MARK: Passcodes

    /// Checks the passcode the person has at a business (and links this phone to it).
    func verifyPasscode(_ code: String, site ref: SiteRef) async -> PasscodeResult {
        await sendPasscode(code, site: ref, replace: false)
    }

    /// Saves a new passcode at a business (over the old one when there was one).
    func savePasscode(_ code: String, site ref: SiteRef) async -> PasscodeResult {
        await sendPasscode(code, site: ref, replace: true)
    }

    private func sendPasscode(_ code: String, site ref: SiteRef, replace: Bool) async -> PasscodeResult {
        guard let key = Keychain.device else { return .signIn("Sign in again on this device.") }
        var body: [String: Any] = ["device": key.id, "secret": key.secret, "site": ref.id, "passcode": code]
        if replace { body["replace"] = true }
        do {
            try await API.post("/api/app/passcode", body)
            Keychain.saveSiteID(ref.id)
            return .ok
        } catch let error as APIError {
            // A 401 without the device flags means the session itself ended (left too long on this screen): sign in again.
            if error.status == 401 && !error.signIn && error.left == nil { return .signIn("Your session ended. Please sign in again.") }
            return passcodeResult(error)
        } catch {
            return .failed(APIError.unreachableMessage)
        }
    }

    func passcodeResult(_ error: APIError) -> PasscodeResult {
        if error.signIn { return .signIn(error.message) }
        if let left = error.left, left > 0 { return .wrong("\(error.message) \(left) \(left == 1 ? "try" : "tries") left.") }
        if error.status == 400 || error.status == 401 { return .wrong(error.message) }
        return .failed(error.message)
    }

    /// The server forgot this phone (five wrong passcodes, removed from the team, signed out everywhere): sign in again.
    func deviceForgotten(_ message: String) {
        Keychain.forgetDevice()
        setFaceIDFlag(false)
        closeShell()
        goWelcome(atLogin: true, message: message)
    }

    // MARK: Unlocking (D6 lock)

    func unlock(passcode: String) async -> PasscodeResult {
        guard let key = Keychain.device else { return .signIn("Sign in again on this device.") }
        _ = await endingSession?.value
        do {
            let answer = try await API.post("/api/app/unlock", ["device": key.id, "secret": key.secret, "passcode": passcode])
            unlocked(answer)
            return .ok
        } catch let error as APIError {
            return passcodeResult(error)
        } catch {
            return .failed(APIError.unreachableMessage)
        }
    }

    /// Face ID in place of the passcode. nil when nothing happened (cancelled), so the keypad simply stays.
    func unlockWithFaceID() async -> PasscodeResult? {
        guard faceIDOn, let key = Keychain.device else { return nil }
        suppressCover = true
        let read = await Keychain.readBio()
        suppressCover = false
        switch read {
        case .ok(let bio):
            _ = await endingSession?.value
            do {
                let answer = try await API.post("/api/app/unlock", ["device": key.id, "secret": key.secret, "bio": bio])
                unlocked(answer)
                return .ok
            } catch let error as APIError {
                if error.bioOff { forgetFaceIDHere() }
                return passcodeResult(error)
            } catch {
                return .failed(APIError.unreachableMessage)
            }
        case .cancelled:
            return nil
        case .unavailable:
            forgetFaceIDHere()
            return .wrong("\(biometry.name) changed on this iPhone. Use your passcode.")
        case .failed:
            return nil
        }
    }

    private func unlocked(_ answer: JSON) {
        if let person = User(answer["user"]) {
            user = person
            remember(person)
        }
        let id = answer["site"].string
        unlockedSiteID = id.isEmpty ? nil : id
    }

    /// After a right passcode or Face ID on the lock screen: cookies to the web views, the pages load again behind the
    /// loading screen, and the dashboard comes back where it was.
    func finishUnlock() async {
        Haptics.light()
        showLoading = true
        let id = unlockedSiteID ?? Keychain.siteID ?? site?.id
        unlockedSiteID = nil
        let list = (try? await loadSites()) ?? sites
        guard let business = list.first(where: { $0.id == id }) ?? site ?? list.first else {
            setPhase(.creatingBusiness)
            return
        }
        await enterReady(business, reloadPages: true)
    }

    // MARK: Face ID

    /// Turns Face ID on or off for opening the app. Turning it on reads the secret once, so iOS asks permission now.
    func applyFaceID(_ wanted: Bool) async {
        guard biometry != .none, wanted != faceIDOn, let key = Keychain.device else { return }
        let proof: [String: Any] = ["device": key.id, "secret": key.secret]
        if wanted {
            guard let answer = try? await API.post("/api/app/biometric", proof) else { return }
            let bio = answer["bio"].string
            guard !bio.isEmpty, Keychain.saveBio(bio) else { return }
            suppressCover = true
            let check = await Keychain.readBio()
            suppressCover = false
            if case .ok = check {
                setFaceIDFlag(true)
            } else {
                _ = try? await API.delete("/api/app/biometric", proof)
                Keychain.delete("bio")
                setFaceIDFlag(false)
            }
        } else {
            _ = try? await API.delete("/api/app/biometric", proof)
            Keychain.delete("bio")
            setFaceIDFlag(false)
        }
    }

    private func forgetFaceIDHere() {
        Keychain.delete("bio")
        setFaceIDFlag(false)
    }

    func setFaceIDFlag(_ on: Bool) {
        faceIDOn = on
        UserDefaults.standard.set(on, forKey: Keys.faceID)
    }

    // MARK: Locking (15 minutes idle, the web says the session ended, Lock screen)

    /// The passcode lock for this phone, when it is set up with a business.
    func lockStep() -> PasscodeStep? {
        guard Keychain.device != nil, let id = Keychain.siteID else { return nil }
        let name = sites.first(where: { $0.id == id })?.name ?? (site?.id == id ? site?.name : nil) ?? ""
        return PasscodeStep(purpose: .lock, site: SiteRef(id: id, name: name))
    }

    /// Covers the app with the lock screen straight away, then ends the session on the server and clears its cookies.
    func lock() {
        guard phase == .ready else { return }
        idle.stop()
        stopPolling()
        WebStore.shared.blankAll()
        if let step = lockStep() {
            setPhase(.passcode(step))
        } else {
            // Without a passcode on this phone, locking means signing in again.
            closeShell()
            goWelcome(atLogin: true)
        }
        endSessionInBackground()
    }

    /// A web page found that the session ended (signed out everywhere, or the server dropped it): check, then lock.
    func sessionEnded() {
        guard phase == .ready, !checkingSession else { return }
        checkingSession = true
        Task {
            let me = try? await API.get("/api/me")
            checkingSession = false
            if let me, !me["user"].isObject, phase == .ready { lock() }
        }
    }

    /// "Forgot passcode?" on the lock screen: sign in with the email and password, then make a new passcode.
    func forgotPasscode() {
        closeShell()
        goWelcome(atLogin: true, note: "After you sign in, you'll make a new passcode.")
        auth.forgotPasscode = true
        endSessionInBackground()
    }

    /// "Switch User": the Log in screen for someone else. This phone's key stays until they sign in.
    func switchUser() {
        closeShell()
        goWelcome(atLogin: true)
        auth.email = ""
        endSessionInBackground()
    }

    // MARK: Logging out

    /// Log out for good on this phone: its key, Face ID and notifications go, and the session ends.
    func signOut() async {
        let key = Keychain.device
        closeShell()
        user = nil
        sites = []
        site = nil
        setOrdersBadge(0)
        Keychain.forgetDevice()
        setFaceIDFlag(false)
        goWelcome()
        // Like locking, the server part runs in order with the next sign-in, so it can never end that new session.
        let previous = endingSession
        let ending = Task {
            _ = await previous?.value
            if let key {
                _ = try? await API.post("/api/app/signout", ["device": key.id, "secret": key.secret])
            } else {
                _ = try? await API.post("/api/auth/logout")
            }
            await clearCookies()
        }
        endingSession = ending
        await ending.value
    }

    func goWelcome(atLogin: Bool = false, message: String = "", note: String = "") {
        auth.reset(email: UserDefaults.standard.string(forKey: Keys.email) ?? "")
        auth.error = message
        auth.note = note
        auth.path = atLogin ? [.login] : []
        setPhase(.welcome)
    }

    /// Closes the dashboard and its pages (signing out, someone else signing in).
    func closeShell() {
        idle.stop()
        stopPolling()
        WebStore.shared.closeAll()
        shellAlive = false
        shell = Shell()
        shellID = UUID()
    }

    // MARK: Changing business (D5 / E11 from the dashboard)

    func switchSite(to business: Site) {
        guard business.id != site?.id else { return }
        let tab = shell.pendingTab
        WebStore.shared.closeAll()
        site = business
        Keychain.saveSiteID(business.id)
        shell = Shell()
        shellID = UUID()
        setOrdersBadge(business.newOrders)
        notesDot = false
        idle.start(kitchen: business.isKitchen)
        startPolling()
        if let tab { shell.open(tab: tab) }
    }

    /// The website's "create your business" page finished: the new business is set up like any other.
    func businessCreated(_ id: String) {
        guard phase == .creatingBusiness else { return }
        Task {
            let list = (try? await loadSites()) ?? []
            if let business = list.first(where: { $0.id == id }) ?? list.first { await passcodeStep(for: business) }
        }
    }

    // MARK: The session cookie

    var hasSessionCookie: Bool {
        (HTTPCookieStorage.shared.cookies(for: Config.baseURL) ?? []).contains { $0.name == "pf_session" }
    }

    /// Copies the session cookie from the app's requests into the web views' cookie store, and waits until it is there,
    /// before any page loads or reloads.
    func syncCookiesToWeb() async {
        let store = WKWebsiteDataStore.default().httpCookieStore
        for cookie in HTTPCookieStorage.shared.cookies(for: Config.baseURL) ?? [] {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                store.setCookie(cookie) { continuation.resume() }
            }
        }
    }

    func clearCookies() async {
        let storage = HTTPCookieStorage.shared
        for cookie in storage.cookies(for: Config.baseURL) ?? [] { storage.deleteCookie(cookie) }
        let types: Set<String> = [WKWebsiteDataTypeCookies]
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: Date.distantPast) { continuation.resume() }
        }
    }

    /// Ends the session without waiting; the next unlock or sign-in waits for it to finish first.
    func endSessionInBackground() {
        let previous = endingSession
        endingSession = Task {
            _ = await previous?.value
            await endServerSession()
        }
    }

    /// Ends the session on the server (the device key stays, so the passcode can open the app again) and clears its cookies.
    func endServerSession() async {
        _ = try? await API.post("/api/auth/logout")
        await clearCookies()
    }
}
