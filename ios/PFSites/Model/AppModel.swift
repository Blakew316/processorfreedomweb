import SwiftUI
import UIKit
import Observation
import UserNotifications

/// Where the app is. Welcome, Log in and Two-step are one stack under `.welcome`.
enum Phase: Equatable {
    case launching
    case welcome
    case choosingLocation
    case passcode(PasscodeStep)
    case creatingBusiness
    case ready
}

/// Why the passcode screen is showing.
enum PasscodePurpose: Hashable {
    case afterSignIn(has: Bool, forgot: Bool)   // right after the email and password: type the passcode, or make one
    case lock                                   // the app locked itself or was opened again: the passcode opens it
    case switchTo(has: Bool)                    // changing to another business: its passcode, or a new one there
    case change                                 // Change passcode: the current one, then a new one
}

struct PasscodeStep: Hashable {
    var purpose: PasscodePurpose
    var site: SiteRef
}

/// What the server said about a passcode (or Face ID) attempt.
enum PasscodeResult {
    case ok
    case wrong(String)
    case signIn(String)        // the server forgot this phone's key: the email and password are needed again
    case sessionEnded(String)  // the session ended while this screen was open; the phone's key is still good
    case failed(String)
}

/// How a Face ID attempt on the lock screen ended.
enum FaceIDAttempt {
    case unlocked                  // the server opened a session
    case stay                      // cancelled (by the person, the system or the app): the lock screen stays as it is
    case keypad                    // "Enter Passcode", a face not recognised, or Face ID locked: the number pad comes up
    case hidden                    // Face ID cannot be used on this iPhone now: its control goes away
    case refused(PasscodeResult)   // the server said no, or the faces enrolled changed: said under the dots
}

/// What came of turning Face ID on or off.
enum FaceIDChange {
    case done              // as asked, or there was nothing to change
    case cancelled         // the person turned the Face ID question away themselves: nothing went wrong
    case failed(String)    // it could not be turned on, in words for the person
    case left              // the server forgot this phone, or the session ended: the app is on its way to Log in or the lock
}

/// A sign-in the server has accepted, while the app is still on Log in or the code step reading the person's businesses (the
/// button shows its spinner, and Back is still there). Until the app leaves those screens the person can walk away, so nothing
/// that cannot be taken back is done before then: the phone's earlier key is still good, and nobody new is remembered.
struct PendingSignIn {
    /// The screen that asked, and the count of moves between the sign-in screens when it did.
    let asked: [AuthStep]
    let attempt: Int
    /// False when the request carried a two-step code: the server has spent the code by then (a recovery code is gone for
    /// good), so that sign-in is never thrown away.
    let mayLeave: Bool
    let person: User
    let email: String
    let trust: String
    let freshKey: DeviceKey?
    /// As things were before, to put back when the person walked away.
    let oldKey: DeviceKey?
    let previousUser: User?
    let previousLimited: Bool
    let previousSites: [Site]
}

enum LogInOutcome {
    case success
    case needsCode(APIError)
    case failed(String)
    /// The person left the screen (Cancel on the code step, or Back) while the answer was on its way: they are not signed in.
    case left
}

/// The app's single source of truth: who is signed in, which business is open, which screen shows, and everything that
/// survives the app locking itself (the dashboard and its pages stay as they were underneath the lock screen).
@Observable @MainActor
final class AppModel {
    static let shared = AppModel()

    var phase: Phase = .launching
    var launchError: String? = nil
    /// The loading screen (D9) over the main window: on launch, and after signing in or unlocking until the first page is ready.
    var showLoading = true
    var shellAlive = false
    var shellID = UUID()
    var shell = Shell()

    var user: User? = nil
    var sites: [Site] = []
    var site: Site? = nil
    /// The session was opened with a team member's passcode (or Face ID): the server lets it open only that business, so the
    /// location list shows just that one, with a way to sign in with email to see the others.
    var sessionLimited = false
    var config = AppConfig()
    var ordersBadge = 0
    var notesDot = false

    /// Face ID or Touch ID as it can be used right now (none when it is not set up or is turned off for the app in Settings).
    var biometry: Biometry
    var faceIDOn: Bool
    var pushAuthorized = false
    var pushDenied = false
    /// Whether the server has this phone's address for notifications, as far as this run knows: it is sent each time the dashboard
    /// opens and whenever iOS hands over a new one. Notifications only show as on once the server has it.
    var pushSent = false

    let auth = AuthFlow()
    let idle = IdleMonitor()

    /// Set while Face ID or a permission alert is up: the app goes inactive for those, and the privacy cover should not flash.
    @ObservationIgnored var suppressCover = false
    @ObservationIgnored var pushToken: String?
    /// Whether the last device token reached the server (nil while waiting for iOS).
    @ObservationIgnored var tokenSent: Bool?
    /// Device-token uploads on their way to the server, so an answer about notifications can wait for them.
    @ObservationIgnored var pushUploads = 0
    /// What the server said when it last refused this phone's address (asked too often, say); empty when the address went through
    /// or the server could not be reached at all. The Notifications switch says it in place of "check your connection".
    @ObservationIgnored var pushRefusal = ""
    @ObservationIgnored var unlockedSiteID: String?
    /// When the app last went to the background, for the Log in form's own two-minute rule (see `scenePhaseChanged`).
    @ObservationIgnored var leftAt: Date?
    /// A sign-in the server has accepted while the sign-in screens still show (see `PendingSignIn`).
    @ObservationIgnored var pendingSignIn: PendingSignIn?
    /// The last accepted sign-in was undone because the person had walked away from it.
    @ObservationIgnored var signInUndone = false
    /// Words kept for the dashboard (see `showReadyNotice(after:)`).
    @ObservationIgnored var readyNotice: String?
    /// The logout that runs when the app locks. Unlocking and signing in wait for it, so it can never clear the new session's cookie.
    @ObservationIgnored var endingSession: Task<Void, Never>?
    @ObservationIgnored var checkingSession = false
    @ObservationIgnored private var started = false
    @ObservationIgnored private var waitingForWeb = false
    @ObservationIgnored private var loadingCap: Task<Void, Never>?
    @ObservationIgnored private var poller: Task<Void, Never>?
    @ObservationIgnored private var pendingNotification: String?
    @ObservationIgnored private var iconBadge = -1
    /// What Try again on the loading screen runs: the step after signing in or unlocking that could not reach the server.
    @ObservationIgnored private var retryStep: (() async -> Void)?
    /// Whether the server's flags (`config`) have been read in this run. They are asked for at sign-in and at unlock; when that
    /// one request fails they are asked for again with the next refresh, instead of staying at their defaults until the next lock.
    @ObservationIgnored private var configLoaded = false

    /// The server's words when a session opened with a team passcode tries another business.
    static let elsewhere = "Sign in with your email and password to open this business."

    init() {
        biometry = Biometry.current()
        faceIDOn = UserDefaults.standard.bool(forKey: Keys.faceID) && Keychain.device != nil
    }

    // MARK: Phase

    var isLocked: Bool { lockStepShowing != nil }

    /// Whether the location list has anything to offer: another business, or (after a team passcode) signing in to see them all.
    var canChangeLocation: Bool { sites.count > 1 || sessionLimited }

    /// Face ID can be turned off for the app, set up or removed in Settings while the app is away.
    func refreshBiometry() {
        let now = Biometry.current()
        if biometry != now { biometry = now }
    }

    var lockStepShowing: PasscodeStep? {
        if case .passcode(let step) = phase, step.purpose == .lock { return step }
        return nil
    }

    /// "Blake": the signed-in person's first name, or the last one this phone saw (the lock screen shows it before anyone signs in).
    var firstName: String {
        let defaults = UserDefaults.standard
        return User.firstName(name: user?.name ?? defaults.string(forKey: Keys.name) ?? "", email: user?.email ?? defaults.string(forKey: Keys.email) ?? "")
    }

    func setPhase(_ next: Phase) {
        let wasLocked = isLocked
        // A cold start: nothing but the loading screen is in the app's window yet, so the lock screen may fade in over it.
        let coldStart = phase == .launching && !shellAlive
        // Once the sign-in screens are left, the typed password is not kept any longer than it was needed.
        if phase == .welcome, next != .welcome {
            if !auth.password.isEmpty { auth.password = "" }
            if !auth.sentPassword.isEmpty { auth.sentPassword = "" }
        }
        phase = next
        if isLocked && !wasLocked {
            OverlayWindows.shared.showLock(fadeIn: coldStart)
        } else if !isLocked && wasLocked {
            OverlayWindows.shared.hideLock(grow: next == .ready)
        }
        switch next {
        case .ready, .launching: break
        default: hideLoading()
        }
    }

    // MARK: Launch

    func start() async {
        guard !started else { return }
        started = true
        launch()
    }

    /// Every cold start opens locked, like Clover Go (and as Apple advises for apps that show business data): a phone set up
    /// with a business shows the passcode screen, any other phone shows Welcome. A session left from an earlier run is ended on the
    /// server and its cookies cleared, in order before the unlock or sign-in that follows, so nothing ever opens on an old session.
    private func launch() {
        setPhase(.launching)
        showLoading = true
        launchError = nil
        forgetEarlierInstall()
        if hasSessionCookie { endSessionInBackground() }
        if let step = lockStep() { setPhase(.passcode(step)) } else { goWelcome() }
    }

    /// The Keychain keeps this phone's key when the app is deleted, but everything else the app remembers goes with it, and the name
    /// and email are always remembered when someone signs in. A key found without them belongs to an earlier install: deleting the
    /// app signed it out, so the key is given up on the server (without a session, so nothing else ends) and forgotten here.
    private func forgetEarlierInstall() {
        let defaults = UserDefaults.standard
        guard let key = Keychain.device, defaults.object(forKey: Keys.name) == nil, defaults.object(forKey: Keys.email) == nil else { return }
        Keychain.forgetDevice()
        setFaceIDFlag(false)
        Task { _ = try? await API.send("POST", "/api/app/signout", body: ["device": key.id, "secret": key.secret], cookies: false) }
    }

    /// Try again on the loading screen. Problems only show there after a full sign-in or an unlock (loading the businesses or the
    /// passcode step failed), so the step that failed runs again, and the passcode step is never skipped.
    func retryLaunch() {
        launchError = nil
        let step = retryStep
        retryStep = nil
        Task {
            if let step { await step() } else { launch() }
        }
    }

    /// The loading screen says what went wrong and offers Try again (which runs `retry`); it also tries again by itself when the
    /// connection returns.
    func showLaunchError(_ error: Error, retry: @escaping () async -> Void) {
        setPhase(.launching)
        showLoading = true
        launchError = (error as? APIError)?.message ?? APIError.unreachableMessage
        retryStep = retry
        NetworkMonitor.shared.whenBackOnline { [weak self] in
            guard let self, self.phase == .launching, self.launchError != nil else { return }
            self.retryLaunch()
        }
    }

    /// Right after the passcode step that follows a full sign-in: the business this phone now opens (the passcode was just typed
    /// for it), or the location list again if it is no longer there.
    func continueSignedIn() async throws {
        let list = try await loadSites()
        if list.isEmpty {
            setPhase(.creatingBusiness)
        } else if let saved = Keychain.siteID, let match = list.first(where: { $0.id == saved }) {
            await enterReady(match)
        } else if list.count == 1 {
            await passcodeStep(for: list[0])
        } else {
            setPhase(.choosingLocation)
        }
    }

    // MARK: Loading screen

    func hideLoading() {
        loadingCap?.cancel()
        loadingCap = nil
        waitingForWeb = false
        if showLoading { showLoading = false }
    }

    /// Keeps the loading screen up until a page reports in, for at most 8 seconds (then the page or its offline card shows).
    private func waitForWeb() {
        waitingForWeb = true
        showLoading = true
        loadingCap?.cancel()
        loadingCap = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            guard !Task.isCancelled else { return }
            self?.hideLoading()
        }
    }

    /// A web page said where it is (or that it could not load).
    func webPageReported() {
        if waitingForWeb { hideLoading() }
    }

    // MARK: The dashboard

    /// Opens the dashboard for a business. `reloadPages` is for after unlocking: the pages left under the lock screen load again
    /// with the new session, behind the loading screen.
    func enterReady(_ business: Site, reloadPages: Bool = false) async {
        let changed = site?.id != business.id
        site = business
        Keychain.saveSiteID(business.id)
        await syncCookiesToWeb()
        if changed || !shellAlive {
            WebStore.shared.closeAll()
            shell = Shell()
            shellID = UUID()
            // The bell's dot belongs to the business that was open; this one's own check sets it.
            if notesDot { notesDot = false }
        }
        shellAlive = true
        setOrdersBadge(business.newOrders)
        setPhase(.ready)
        idle.start(kitchen: business.isKitchen)
        startPolling()
        if reloadPages && WebStore.shared.hasLivePages {
            waitForWeb()
            WebStore.shared.reloadAll()
        } else {
            hideLoading()
        }
        showReadyNotice()
        // A notification tapped while the app was locked opens its page now, before anything that waits on the server.
        if let path = pendingNotification {
            pendingNotification = nil
            openNotification(path: path)
        }
        await sendPushAddress()
        // Only while this dashboard is still the one showing: the app may have locked or gone back to Log in while the address
        // was on its way (the server may just have said it no longer knows this phone).
        if phase == .ready, site?.id == business.id { maybeAskForPush() }
    }

    // MARK: Server data

    func loadConfig() async {
        guard let answer = try? await API.get("/api/config") else { return }
        config = AppConfig(appPush: answer["appPush"].bool)
        configLoaded = true
    }

    /// The person's businesses, newest first. Falls back to the full list when the server has no light list yet.
    @discardableResult
    func loadSites() async throws -> [Site] {
        let answer: JSON
        do {
            answer = try await API.get("/api/app/sites")
        } catch let error as APIError where error.status == 404 {
            answer = try await API.get("/api/sites")
        }
        let list = answer["sites"].array.compactMap { Site($0) }
        sites = list
        if let current = site, let fresh = list.first(where: { $0.id == current.id }) { site = fresh }
        return list
    }

    // MARK: Badge and notifications, kept fresh while the dashboard shows

    func startPolling() {
        poller?.cancel()
        guard let business = site, !business.isKitchen else { return }
        poller = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshNow()
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
    }

    func stopPolling() {
        poller?.cancel()
        poller = nil
    }

    /// New orders for the tab badge and anything new behind the bell (also used by pull to refresh on Home).
    func refreshNow() async {
        guard phase == .ready, let business = site, !business.isKitchen else { return }
        // The server's flags could not be read as the dashboard opened: once they can, notifications are offered as they
        // would have been then.
        if !configLoaded {
            await loadConfig()
            // Only while the dashboard is still showing: the app may have locked or logged out while that was read.
            guard phase == .ready, site?.id == business.id else { return }
            if configLoaded { maybeAskForPush() }
        }
        do {
            let list = try await loadSites()
            // The business on screen now: an answer that comes back after a change of business must not set the old one's count.
            guard site?.id == business.id else { return }
            if let fresh = list.first(where: { $0.id == business.id }) { setOrdersBadge(fresh.newOrders) }
        } catch let error as APIError where error.sessionEnded {
            // Signed out everywhere, or the server ended the session: check, then lock.
            sessionEnded()
            return
        } catch {
            // Offline for a moment: the next round tries again.
        }
        await refreshNotesDot()
    }

    func refreshNotesDot() async {
        guard let business = site, let answer = try? await API.get("/api/sites/\(business.id)/notifications") else { return }
        // Another business was opened while this was on its way: its own check sets the dot.
        guard site?.id == business.id else { return }
        let seen = UserDefaults.standard.double(forKey: Keys.notesSeen(business.id))
        let fresh = answer["notifications"].array.contains { Double($0["at"].int) > seen }
        if notesDot != fresh { notesDot = fresh }
    }

    func markNotesSeen() {
        guard let business = site else { return }
        UserDefaults.standard.set(Date().timeIntervalSince1970 * 1000, forKey: Keys.notesSeen(business.id))
        notesDot = false
    }

    /// A notification tapped before the dashboard was showing is opened as it opens. When the dashboard closes for someone else
    /// (Switch User, Log out) it is forgotten: it was not theirs.
    func forgetPendingNotification() {
        pendingNotification = nil
    }

    /// iOS only shows the app icon's count once notifications are allowed, and ignores a count sent before that. So when they
    /// become allowed the count is sent again (otherwise the icon would stay empty until the number of new orders changed):
    /// now when the dashboard is showing, or else as it next opens. Never from the lock screen, where the count is not known
    /// and sending one would wipe the icon's.
    func sendIconBadgeAgain() {
        iconBadge = -1
        if phase == .ready { setOrdersBadge(ordersBadge) }
    }

    /// The Orders tab badge and the app icon badge: the count of new orders (the same count the website's menu badge uses).
    func setOrdersBadge(_ count: Int) {
        let value = max(0, count)
        if ordersBadge != value { ordersBadge = value }
        if iconBadge != value {
            iconBadge = value
            UNUserNotificationCenter.current().setBadgeCount(value, withCompletionHandler: nil)
        }
    }

    // MARK: Coming and going

    func scenePhaseChanged(_ newPhase: ScenePhase) {
        switch newPhase {
        case .active:
            // Fifteen minutes away locks before anything is shown again.
            if phase == .ready, idle.expired, site?.isKitchen != true { lock() }
            // A password typed on Log in and left there (a try that failed, a call that interrupted) does not wait in the form
            // for whoever picks the phone up later, one tap on the eye away: after two minutes out of the app the field is
            // empty again. (The dashboard has its own fifteen-minute lock; the sign-in screens had no limit at all.)
            if phase == .welcome, !auth.busy, !auth.password.isEmpty, let leftAt, Date().timeIntervalSince(leftAt) > 120 {
                auth.password = ""
            }
            leftAt = nil
            OverlayWindows.shared.hideCover()
            // Not while Face ID is up: its own sheet makes the app inactive and active again.
            if !suppressCover { refreshBiometry() }
            if phase == .ready {
                idle.cameToForeground()
                startPolling()
                WebStore.shared.refreshVisibleIfStale()
            }
            Task { await refreshPushStatus() }
        case .inactive:
            // Only the dashboard has anything to hide (Welcome, Log in, Two-step and the passcode screens have nothing, and the
            // lock screen already covers the dashboard). Face ID, Password AutoFill or a permission alert make the app inactive for
            // a moment too, and the cover should not flash over them.
            if !suppressCover && phase == .ready { OverlayWindows.shared.showCover() }
        case .background:
            if leftAt == nil { leftAt = Date() }
            OverlayWindows.shared.showCover()
            idle.wentToBackground()
            stopPolling()
            WebStore.shared.visibleLeft()
        @unknown default:
            break
        }
    }

    // MARK: Opening things from notifications and web pages

    /// A tap on a notification: /app/site/<id>?tab=orders opens that business (switching to it first) and that page.
    func openNotification(path: String) {
        guard let url = URL(string: path, relativeTo: Config.baseURL) else { return }
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.count >= 3, parts[0] == "app", parts[1] == "site" else { return }
        let siteID = parts[2]
        let query = URLComponents(url: url.absoluteURL, resolvingAgainstBaseURL: false)?.queryItems
        let tab = query?.first(where: { $0.name == "tab" })?.value ?? (parts.count > 3 ? parts[3] : "orders")
        guard phase == .ready, let current = site else {
            pendingNotification = path
            return
        }
        if siteID != current.id {
            guard let target = sites.first(where: { $0.id == siteID }) else {
                // A session opened with a team passcode only lists its own business; the server would refuse the other one too.
                if sessionLimited { UIPresenter.message(Self.elsewhere) }
                return
            }
            shell.pendingTab = tab
            present(.switchTo(target))
            return
        }
        open(tab: tab)
    }

    /// The Setup tasks and Notifications web pages ask the app to open a page natively ({ type: 'open', tab }). A page asked for
    /// from the Notifications sheet opens once the sheet has gone, on the tab underneath it.
    func openFromWeb(tab: String) {
        guard phase == .ready, !tab.isEmpty else { return }
        open(tab: tab)
    }

    /// Opens a page on the current tab, closing the sheet first when one is up.
    private func open(tab: String) {
        if shell.sheet != nil {
            shell.afterSheetTab = tab
            shell.sheet = nil
        } else {
            shell.open(tab: tab)
        }
    }

    /// A full-screen step over the dashboard; one presentation at a time, so a sheet that is up closes first. A full-screen
    /// page that is already open (the item editor, a Settings page) is never swapped out from under the person: the step waits
    /// until they have closed it themselves, with its own "discard changes?" where it has one.
    private func present(_ cover: ShellCover) {
        if shell.sheet != nil {
            shell.afterSheet = cover
            shell.sheet = nil
        } else if let showing = shell.cover, !showing.isSwitch {
            shell.afterCover = cover
        } else {
            shell.cover = cover
        }
    }

    /// A page of this business tried to go to another business's back office (a link, or the website's own list): the app changes
    /// business its own way, with that business's passcode step, so the bars, badge and lock always belong to the business on screen.
    func openBusinessFromWeb(id: String, tab: String) {
        guard phase == .ready, let current = site else { return }
        if id == current.id {
            open(tab: tab.isEmpty ? "start" : tab)
            return
        }
        if let target = sites.first(where: { $0.id == id }) {
            shell.pendingTab = tab.isEmpty ? nil : tab
            present(.switchTo(target))
        } else if sessionLimited {
            UIPresenter.message(Self.elsewhere)
        } else {
            // Perhaps a business made a moment ago on the website: look again once.
            Task {
                guard let list = try? await loadSites(), let target = list.first(where: { $0.id == id }), phase == .ready else { return }
                shell.pendingTab = tab.isEmpty ? nil : tab
                present(.switchTo(target))
            }
        }
    }

    /// A page went to the website's list of businesses (/app): the app's own location list instead.
    func openLocationsFromWeb() {
        guard phase == .ready, shell.cover == nil, shell.sheet == nil else { return }
        shell.sheet = .locations
    }

    /// Words for the person that belong on the dashboard (a ticked "Enable Face ID" that could not be turned on) are kept in
    /// `readyNotice` before the step that opens it goes on, so a return to the sign-in screens on the way clears them and they
    /// never reach someone else. They are said as the dashboard opens (`enterReady`), or by this after `wait` seconds when a
    /// step over the dashboard is still sliding away.
    func showReadyNotice(after wait: Double) {
        Task {
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            showReadyNotice()
        }
    }

    func showReadyNotice() {
        guard phase == .ready, let words = readyNotice else { return }
        readyNotice = nil
        UIPresenter.message(words)
    }

    /// The person's name and email for the greeting and to fill in the Log in form next time.
    func remember(_ person: User) {
        let defaults = UserDefaults.standard
        defaults.set(person.name, forKey: Keys.name)
        if !person.email.isEmpty { defaults.set(person.email, forKey: Keys.email) }
        if !person.id.isEmpty { defaults.set(person.id, forKey: Keys.userID) }
    }
}
