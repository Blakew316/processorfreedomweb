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
            // Asked for a code although this phone sent its "remember this device" token: the token has run out, so it is not
            // kept (a new one comes with the next code when "remember" is ticked).
            if error.twoFactor, body["trust"] != nil { Keychain.forgetTrust(for: email) }
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
        // The email and password open every business the person has.
        sessionLimited = false
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
                // The old key's notification address goes with it; the new key's is sent when the dashboard opens.
                pushSent = false
            }
        }
        let trust = answer["trust"].string
        if !trust.isEmpty { Keychain.saveTrust(trust, for: email) }
        await loadConfig()
        await syncCookiesToWeb()
        await routeAfterSignIn()
    }

    /// Where a full sign-in leads (D4): no business yet → make the first one; one → its passcode step straight away;
    /// several → Choose your primary location, then the passcode step.
    func routeAfterSignIn() async {
        do {
            let list = try await loadSites()
            switch list.count {
            case 0: setPhase(.creatingBusiness)
            case 1: await passcodeStep(for: list[0])
            default: setPhase(.choosingLocation)
            }
        } catch let error as APIError where error.sessionEnded {
            sessionEndedBeforeReady()
        } catch {
            showLaunchError(error) { [weak self] in await self?.routeAfterSignIn() }
        }
    }

    static let sessionEndedMessage = "Your session ended. Please sign in again."

    /// The session ended before the dashboard opened (a step was left open longer than the server's 16 minutes): sign in again.
    /// This phone's key stays; the next sign-in replaces it and gives the old one up on the server.
    func sessionEndedBeforeReady(_ message: String? = nil) {
        user = nil
        goWelcome(atLogin: true, message: message ?? AppModel.sessionEndedMessage)
    }

    /// The passcode step for a business after a full sign-in: type the passcode they have there, or make one.
    func passcodeStep(for business: Site) async {
        guard Keychain.device != nil else {
            // Without a key for this phone (a very old server) there is nothing to set up, so right after the email and password
            // the dashboard opens; the next lock or cold start asks for the email and password again.
            await enterReady(business)
            return
        }
        let forgot = auth.forgotPasscode
        var has = false
        if !forgot {
            do {
                has = try await API.get("/api/app/passcode?site=\(Config.query(business.id))")["has"].bool
            } catch let error as APIError where error.sessionEnded {
                sessionEndedBeforeReady()
                return
            } catch let error as APIError where (400..<500).contains(error.status) && error.status != 429 && error.status != 408 {
                // The server answered, and said no (this sign-in may not open that business, or the business is gone). Asking
                // again would be refused again, so Log in says why, instead of a Try again that can never work. (Asked too
                // often, or too slow, is not a no: those keep Try again.)
                sessionEndedBeforeReady(error.message)
                // The session the sign-in just opened is still open on the server: it ends too, as on every other way back to
                // Log in from a live session.
                endSessionInBackground()
                return
            } catch {
                showLaunchError(error) { [weak self] in await self?.passcodeStep(for: business) }
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
            do {
                try await continueSignedIn()
            } catch let error as APIError where error.sessionEnded {
                sessionEndedBeforeReady()
            } catch {
                showLaunchError(error) { [weak self] in await self?.passcodeFinished(for: ref) }
            }
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
            // A 401 without the device flags means the session itself ended (left too long on this screen); the key is still good.
            if error.sessionEnded { return .sessionEnded(AppModel.sessionEndedMessage) }
            return passcodeResult(error)
        } catch {
            return .failed(APIError.unreachableMessage)
        }
    }

    /// A 403 (this session may not open that business) is the server's message, said under the dots like any other.
    func passcodeResult(_ error: APIError) -> PasscodeResult {
        if error.signIn { return .signIn(error.message) }
        if let left = error.left, left > 0 { return .wrong("\(error.message) \(left) \(left == 1 ? "try" : "tries") left.") }
        if error.status == 400 || error.status == 401 { return .wrong(error.message) }
        return .failed(error.message)
    }

    /// The server forgot this phone (five wrong passcodes, removed from the team, two-step sign-in turned on, signed out everywhere):
    /// like Log out, everything signed in here goes (the app icon's count too), any session still open ends (Change passcode and a
    /// switch of business run inside one), and the Log in screen says why.
    func deviceForgotten(_ message: String) {
        Keychain.forgetDevice()
        setFaceIDFlag(false)
        closeShell()
        user = nil
        sites = []
        site = nil
        sessionLimited = false
        stopPushOnThisPhone()
        setOrdersBadge(0)
        goWelcome(atLogin: true, message: message)
        endSessionInBackground()
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

    /// Face ID in place of the passcode, with a fresh LAContext each time. Cancelling (the person, the system, the app) leaves the
    /// lock screen as it is; "Enter Passcode", a face not recognised or Face ID locked brings up the number pad; Face ID that is
    /// not set up or not allowed hides its control.
    func unlockWithFaceID() async -> FaceIDAttempt {
        guard faceIDOn, biometry != .none, let key = Keychain.device else { return .keypad }
        suppressCover = true
        let read = await Keychain.readBio()
        suppressCover = false
        switch read {
        case .ok(let bio):
            _ = await endingSession?.value
            do {
                let answer = try await API.post("/api/app/unlock", ["device": key.id, "secret": key.secret, "bio": bio])
                unlocked(answer)
                return .unlocked
            } catch let error as APIError {
                if error.bioOff { forgetFaceIDHere() }
                return .refused(passcodeResult(error))
            } catch {
                return .refused(.failed(APIError.unreachableMessage))
            }
        case .cancelled:
            return .stay
        case .fallback, .failed:
            return .keypad
        case .unavailable:
            biometry = .none
            return .hidden
        case .changed:
            let name = biometry.name
            forgetFaceIDHere()
            return .refused(.wrong("\(name) changed on this iPhone. Use your passcode."))
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
    /// loading screen, and the dashboard comes back where it was. (The passcode screen gave the tap for the right passcode.)
    func finishUnlock() async {
        showLoading = true
        let id = unlockedSiteID ?? Keychain.siteID ?? site?.id
        // The server's flags (Apple push, text codes) for the dashboard: a cold start opens locked without asking for them.
        await loadConfig()
        let list: [Site]
        do {
            list = try await loadSites()
        } catch let error as APIError where error.sessionEnded {
            // The new session already ended (signed out everywhere meanwhile): a fresh lock screen (the one showing has finished).
            unlockedSiteID = nil
            setPhase(.launching)
            if let step = lockStep() {
                setPhase(.passcode(step))
            } else {
                // No key on this phone any more: the dashboard that was under the lock screen goes before Log in shows.
                closeShell()
                sessionEndedBeforeReady()
            }
            return
        } catch {
            // After a cold start nothing is known yet about the businesses (a guess could open the wrong screen), so the
            // loading screen says what went wrong, and Try again carries on from here: the passcode was right.
            if sites.isEmpty || site == nil {
                showLaunchError(error) { [weak self] in await self?.finishUnlock() }
                return
            }
            list = sites
        }
        unlockedSiteID = nil
        guard let business = list.first(where: { $0.id == id }) ?? site ?? list.first else {
            setPhase(.creatingBusiness)
            return
        }
        // At a business the person owns, the passcode opens everything they have; a team member's passcode opens only that business.
        sessionLimited = !business.isOwner
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
        // A step that was waiting for a full-screen page to be closed does not outlast the lock: it would come up long after
        // the tap that asked for it, to whoever unlocks the phone.
        if shell.afterCover != nil {
            shell.afterCover = nil
            shell.pendingTab = nil
        }
        if let step = lockStep() {
            setPhase(.passcode(step))
        } else {
            // Without a passcode on this phone, locking means signing in again.
            closeShell()
            goWelcome(atLogin: true)
        }
        endSessionInBackground()
    }

    /// A web page found that the session ended (signed out everywhere, or the server dropped it): check, then lock. On the
    /// "create your business" page (left open longer than the server's 16 minutes) there is no dashboard to lock yet, so the
    /// Log in screen says the session ended, as the other steps before the dashboard do.
    func sessionEnded() {
        guard phase == .ready || phase == .creatingBusiness, !checkingSession else { return }
        checkingSession = true
        Task {
            let me = try? await API.get("/api/me")
            checkingSession = false
            guard let me else { return }
            if me["user"].isObject {
                // Still signed in. A page that was sent to the website's log in page all the same only lacked the web views' own
                // copy of the session cookie (it can arrive late, see `syncCookiesToWeb`): the cookie is handed over again and
                // that page loads once more.
                if WebStore.shared.hasPagesSentToLogin {
                    await syncCookiesToWeb()
                    WebStore.shared.retryPagesSentToLogin()
                }
                return
            }
            if phase == .ready { lock() } else if phase == .creatingBusiness { sessionEndedBeforeReady() }
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

    /// "Sign in with email to see all your businesses": a session opened with a team passcode covers only that business, so the
    /// Log in screen opens with the email filled in. That session ends first (in order, before the sign-in), and the full sign-in
    /// that follows lists every business again; this phone's key stays until then.
    func signInForAllBusinesses() {
        closeShell()
        sessionLimited = false
        goWelcome(atLogin: true)
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
        sessionLimited = false
        stopPushOnThisPhone()
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

    /// Closes the dashboard and its pages (signing out, someone else signing in), and everything that was open over it.
    func closeShell() {
        idle.stop()
        stopPolling()
        // Whatever is still presented goes at once, without a slide: a share sheet holding an exported file, a Safari page, the
        // website preview, an alert, the scanner, a full-screen page. The lock screen only covers these, so without this they
        // would still be there, over Log in, for whoever uses the phone next.
        BarcodeScan.finish(nil)
        OverlayWindows.shared.mainWindow?.rootViewController?.dismiss(animated: false)
        WebStore.shared.closeAll()
        // Files made to be shared (reports, item lists, recovery codes) do not outlast the person who made them, and a download
        // still on its way is stopped first.
        DownloadCenter.shared.cancelAll()
        DownloadCenter.clearOldFiles()
        // Neither does a notification they tapped before the dashboard was showing, nor the count on the app's icon, nor the
        // sales reports read for them.
        forgetPendingNotification()
        setOrdersBadge(0)
        StatsChoices.shared.reset()
        AppointmentsModel.forget()
        shellAlive = false
        shell = Shell()
        shellID = UUID()
        if notesDot { notesDot = false }
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
        Task { await continueAfterCreating(id) }
    }

    private func continueAfterCreating(_ id: String) async {
        do {
            let list = try await loadSites()
            if let business = list.first(where: { $0.id == id }) ?? list.first { await passcodeStep(for: business) }
        } catch let error as APIError where error.sessionEnded {
            sessionEndedBeforeReady()
        } catch {
            showLaunchError(error) { [weak self] in await self?.continueAfterCreating(id) }
        }
    }

    // MARK: The session cookie

    var hasSessionCookie: Bool {
        (HTTPCookieStorage.shared.cookies(for: Config.baseURL) ?? []).contains { $0.name == "pf_session" }
    }

    /// Copies the session cookie from the app's requests into the web views' cookie store, before any page loads or reloads.
    /// WebKit's answer is waited for, but never for long (`webKitAnswer`). With no page open, iOS puts WebKit's network process to
    /// sleep, and then the answer only comes when the next page wakes it: 35 seconds later in one test run, when the first page
    /// opened. The dashboard is what opens that page, so waiting for the answer before showing the dashboard waited for ever (the
    /// loading screen never went away after signing in, 3 times in 8). The cookie is handed over before the wait starts, so it is
    /// in WebKit's queue ahead of anything a page asks for later.
    func syncCookiesToWeb() async {
        let cookies = HTTPCookieStorage.shared.cookies(for: Config.baseURL) ?? []
        guard !cookies.isEmpty else { return }
        let store = WKWebsiteDataStore.default().httpCookieStore
        await Self.webKitAnswer { done in
            let all = DispatchGroup()
            for cookie in cookies {
                all.enter()
                store.setCookie(cookie) { all.leave() }
            }
            all.notify(queue: .main) { done() }
        }
    }

    /// Clears the session's cookies: from the app's own requests at once, and from the web views, whose answer is waited for no
    /// longer than in `syncCookiesToWeb` and for the same reason (the next log in or unlock waits for this to finish).
    func clearCookies() async {
        let storage = HTTPCookieStorage.shared
        for cookie in storage.cookies(for: Config.baseURL) ?? [] { storage.deleteCookie(cookie) }
        let types: Set<String> = [WKWebsiteDataTypeCookies]
        await Self.webKitAnswer { done in
            WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: Date.distantPast) { done() }
        }
    }

    /// Starts `work` and comes back when it calls `done`, or after `seconds` when WebKit has not answered by then (it usually
    /// answers within half a second). The work itself is not cancelled: only the waiting ends. True when WebKit answered in time.
    @discardableResult
    static func webKitAnswer(within seconds: TimeInterval = 1, _ work: (@escaping @Sendable () -> Void) -> Void) async -> Bool {
        await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            let first = FirstCaller()
            work { DispatchQueue.main.async { if first.take() { continuation.resume(returning: true) } } }
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { if first.take() { continuation.resume(returning: false) } }
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

/// Lets the first caller through and nobody after it, so a wait that can end two ways (an answer, or time running out) ends once.
/// Only ever used on the main queue.
final class FirstCaller: @unchecked Sendable {
    private var open = true

    func take() -> Bool {
        guard open else { return false }
        open = false
        return true
    }
}
