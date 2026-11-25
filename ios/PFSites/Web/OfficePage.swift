import Observation
import SwiftUI
import UIKit
import WebKit

/// Why a page could not be shown.
enum WebFailure: Equatable {
    case offline       // the phone has no connection
    case unreachable   // the phone is online, but the server did not answer (a timeout, or it could not be found or reached)
    case restarting
    case server

    var title: String {
        switch self {
        case .offline: return "You're offline"
        case .unreachable: return "We could not reach the server"
        case .restarting: return "PF Sites is restarting"
        case .server: return "Something went wrong"
        }
    }

    var message: String {
        switch self {
        case .offline: return "Check your connection. This page comes back by itself when you're online again."
        case .unreachable: return "Check your connection and try again."
        case .restarting: return "It will be back in a moment. We'll keep trying."
        case .server: return "This page could not be loaded. Please try again."
        }
    }

    var symbol: String {
        switch self {
        case .offline: return "wifi.slash"
        case .unreachable: return "wifi.exclamationmark"
        case .restarting: return "arrow.triangle.2.circlepath"
        case .server: return "exclamationmark.triangle"
        }
    }
}

/// One back-office web page and its web view. What the page reports about itself (its section, title and sibling pages)
/// drives the native title, back button and page strip around it.
@Observable @MainActor
final class OfficePage: NSObject {
    enum Kind {
        case office    // a back-office page
        case sheet     // the Notifications page in its sheet
        case create    // the website's "create your business" page
        case kitchen   // the kitchen screen
    }

    var tab = ""
    var title = ""
    var group = ""
    var pages: [PageLink] = []
    var parent = ""
    var parentTitle = ""
    var loading = true
    var failure: WebFailure? = nil
    var lastLoaded: Date? = nil

    let siteID: String
    let startPath: String
    let kind: Kind
    /// The Virtual Terminal opened by the Sale screen's Check out (the only page opened with a hand-off script). When it says the
    /// sale was recorded, the Sale screen's order is done and is cleared, so it cannot be checked out, and charged, a second time.
    let carriesSaleOrder: Bool
    let webView: WKWebView
    let refresher = UIRefreshControl()

    @ObservationIgnored private var started = false
    @ObservationIgnored private var closed = false
    @ObservationIgnored private var overlay: UIView?
    /// How long the picture takes to fade: 0.22 s for a page turn, 0.25 s after pull to refresh.
    @ObservationIgnored private var overlayFade: TimeInterval = 0.25
    @ObservationIgnored private var overlayCap: Task<Void, Never>?
    @ObservationIgnored private var retryTask: Task<Void, Never>?
    @ObservationIgnored private var lastGoodURL: URL?
    /// A script run once, the first time the page reports in (the Sale screen's hand-off to the Virtual Terminal).
    @ObservationIgnored private var pendingScript: String?
    /// The hand-off is tried again once, on the next report, if the website answered false (its page was not ready for it).
    @ObservationIgnored private var scriptTries = 0
    /// The business the page last said it shows (the nav message's site), so another business's order count is never shown here.
    @ObservationIgnored private var reportedSite = ""
    /// Blank windows the page opened (window.open with no address yet), kept until we see where they go.
    @ObservationIgnored var catchers: [PopupCatcher] = []
    /// How many times in a row this page was sent to the website's log in page. When the session turns out to be fine, the page
    /// is loaded again with the cookie handed over afresh, but not for ever: after two tries it is left alone.
    @ObservationIgnored private(set) var loginBounces = 0

    init(siteID: String, path: String, kind: Kind = .office, script: String? = nil) {
        self.siteID = siteID
        self.startPath = path
        self.kind = kind
        self.carriesSaleOrder = script != nil
        self.pendingScript = script
        self.webView = WKWebView(frame: .zero, configuration: WebStore.shared.makeConfiguration())
        super.init()
        let proxy = ScriptProxy(page: self)
        let content = webView.configuration.userContentController
        content.add(proxy, contentWorld: .page, name: "pf")
        content.addScriptMessageHandler(proxy, contentWorld: .page, name: "pfAsk")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        // The web view sits inside the safe area, below the bars, so nothing is hidden under them and nothing fogs over content.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.topEdgeEffect.style = .hard
        #if DEBUG
        webView.isInspectable = true
        #endif
        if kind != .create {
            refresher.tintColor = UIColor(named: "BrandBlue")
            refresher.addTarget(self, action: #selector(pulled), for: .valueChanged)
            webView.scrollView.refreshControl = refresher
        }
        WebStore.shared.register(self)
    }

    var isOnScreen: Bool { webView.window != nil }

    // MARK: Loading

    /// Loads the page the first time it is shown.
    func start() {
        guard !started, !closed else { return }
        started = true
        load(startPath)
    }

    func load(_ path: String) {
        load(url: Config.url(path))
    }

    private func load(url: URL) {
        guard !closed else { return }
        loading = true
        failure = nil
        webView.load(URLRequest(url: url))
    }

    /// Shown again: a page left for more than two minutes loads fresh data, unless something is being typed or saved on it.
    func appeared() {
        start()
        refreshIfStale()
    }

    func refreshIfStale() {
        guard let last = lastLoaded, Date().timeIntervalSince(last) > 120, failure == nil, !closed else { return }
        webView.evaluateJavaScript("!!(window.PF && window.PF.busy && window.PF.busy())") { [weak self] result, _ in
            guard let self, (result as? Bool) != true else { return }
            self.reload()
        }
    }

    /// Loads the page again, covered by a picture of it until the fresh one reports in, so it never flashes blank.
    func reload() {
        guard !closed else { return }
        if failure != nil || lastGoodURL == nil {
            retry()
            return
        }
        coverWithSnapshot(spinner: false)
        loading = true
        webView.reload()
    }

    /// Try again after a failure: the page that was last showing, or the page this one started on.
    func retry() {
        retryTask?.cancel()
        load(url: lastGoodURL ?? Config.url(startPath))
    }

    func networkCameBack() {
        if failure == .offline || failure == .unreachable { retry() }
    }

    /// The page tried to go to the website's log in page (the app has its own, so that page is never shown).
    func sentToLogin() {
        loginBounces += 1
    }

    /// The session is fine after all (see `AppModel.sessionEnded`): the page that was turned away loads again.
    func retryAfterLoginBounce() {
        guard loginBounces > 0, loginBounces <= 2, !closed else { return }
        retry()
    }

    // MARK: Moving around the page (the page strip, the back button)

    /// Asks the website to show another of its pages, with a soft cross-fade instead of an instant swap.
    func go(_ tabID: String) {
        guard !closed else { return }
        coverWithSnapshot(spinner: false)
        let script = "(window.PF && typeof window.PF.go === 'function') ? window.PF.go(\(Self.jsString(tabID))) : false"
        webView.evaluateJavaScript(script) { [weak self] result, _ in
            guard let self else { return }
            // The page did not know it (or the website has not started yet): load its address instead.
            if (result as? Bool) != true { self.load(Config.sitePath(self.siteID, tabID)) }
        }
    }

    func back() {
        guard !closed else { return }
        coverWithSnapshot(spinner: false)
        webView.evaluateJavaScript("window.PF && window.PF.back && window.PF.back()", completionHandler: nil)
    }

    // MARK: Pull to refresh

    @objc private func pulled() {
        webView.evaluateJavaScript("!!(window.PF && window.PF.busy && window.PF.busy())") { [weak self] result, _ in
            guard let self else { return }
            if (result as? Bool) == true {
                // Something is being typed or saved: reloading would lose it.
                self.refresher.endRefreshing()
                Haptics.light()
                return
            }
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 150_000_000)
                self?.refresher.endRefreshing()
                try? await Task.sleep(nanoseconds: 350_000_000)
                guard let self else { return }
                if self.failure != nil || self.lastGoodURL == nil {
                    self.retry()
                } else {
                    self.coverWithSnapshot(spinner: true)
                    self.loading = true
                    self.webView.reload()
                }
            }
        }
    }

    private func endRefreshing() {
        if refresher.isRefreshing { refresher.endRefreshing() }
    }

    // MARK: The picture laid over the page while it changes

    func coverWithSnapshot(spinner: Bool) {
        guard overlay == nil, let host = webView.superview, webView.window != nil, let picture = webView.snapshotView(afterScreenUpdates: false) else { return }
        picture.frame = webView.frame
        picture.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        picture.isUserInteractionEnabled = true
        if spinner {
            let indicator = UIActivityIndicatorView(style: .medium)
            indicator.color = UIColor(named: "BrandBlue")
            indicator.center = CGPoint(x: picture.bounds.midX, y: 30)
            indicator.autoresizingMask = [.flexibleLeftMargin, .flexibleRightMargin]
            indicator.startAnimating()
            picture.addSubview(indicator)
        }
        host.addSubview(picture)
        overlay = picture
        overlayFade = spinner ? 0.25 : 0.22
        overlayCap?.cancel()
        overlayCap = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            guard !Task.isCancelled else { return }
            self?.fadeOverlay()
            self?.endRefreshing()
        }
    }

    /// Hides the page's content at once (the app is locking): it stays hidden until the page has loaded again after unlocking.
    func blank() {
        overlayCap?.cancel()
        overlay?.removeFromSuperview()
        overlay = nil
        guard let host = webView.superview else { return }
        let cover = UIView(frame: webView.frame)
        cover.backgroundColor = .systemBackground
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addSubview(cover)
        overlay = cover
        overlayFade = 0.25
    }

    private func fadeOverlay() {
        overlayCap?.cancel()
        overlayCap = nil
        guard let view = overlay else { return }
        overlay = nil
        let duration = overlayFade
        UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseOut, .beginFromCurrentState]) { view.alpha = 0 }
        Task {
            try? await Task.sleep(nanoseconds: UInt64((duration + 0.05) * 1_000_000_000))
            view.removeFromSuperview()
        }
    }

    // MARK: Messages from the page

    /// Only the page itself (the main frame, on our own address: the same scheme, host and port) may talk to the app.
    private func trusted(_ message: WKScriptMessage) -> Bool {
        let origin = message.frameInfo.securityOrigin
        return message.frameInfo.isMainFrame && origin.`protocol`.lowercased() == (Config.baseURL.scheme?.lowercased() ?? "https")
            && origin.host.lowercased() == Config.host && origin.port == (Config.baseURL.port ?? 0)
    }

    func received(_ message: WKScriptMessage) {
        guard !closed, trusted(message), let body = message.body as? [String: Any] else { return }
        let json = JSON(body)
        switch json["type"].string {
        case "nav": applyNav(json)
        case "ready": reportedReady(path: json["path"].string)
        // The count of new orders, for the business this page belongs to (the kitchen screen and the create page have no say).
        case "badge": if (kind == .office || kind == .sheet) && (reportedSite.isEmpty || reportedSite == siteID) { AppModel.shared.setOrdersBadge(json["orders"].int) }
        case "signedOut":
            // The website says so with a message when it is running inside the app (it clears itself and does not move).
            sentToLogin()
            AppModel.shared.sessionEnded()
        case "activity": AppModel.shared.idle.touch()
        case "print": printPage(title: json["title"].string)
        // The Setup tasks and Notifications pages hand their choice to the app, which opens it natively.
        case "open": AppModel.shared.openFromWeb(tab: json["tab"].string)
        // The Virtual Terminal recorded the sale it was handed through PF.sale. The website does not send this yet (its Complete
        // Payment button cannot record a sale), so until it does the Sale order is only cleared with Clear order.
        case "saleDone": if carriesSaleOrder { AppModel.shared.shell.order.clear() }
        default: break
        }
    }

    /// Questions from the page that need an answer (the website's notification switch).
    func asked(_ message: WKScriptMessage, reply: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard !closed, trusted(message), let body = message.body as? [String: Any], let command = body["cmd"] as? String else {
            reply(nil, "That request is not allowed here.")
            return
        }
        Task {
            let model = AppModel.shared
            switch command {
            case "pushState":
                let state = await model.pushStateReply()
                reply(state, nil)
            case "pushEnable":
                _ = await model.requestPush()
                let state = await model.pushStateReply()
                reply(state, nil)
            case "pushDisable":
                // When the server could not be told, the website shows "Notifications could not be changed" for the refusal.
                guard await model.disablePush() else {
                    reply(nil, "Notifications could not be changed. Please try again.")
                    return
                }
                let state = await model.pushStateReply()
                reply(state, nil)
            case "scanBarcode":
                // The website's item editor asks for a product code: the camera opens for one read (E20).
                if let code = await BarcodeScan.scanOnce() { reply(["code": code], nil) } else { reply(["cancelled": true], nil) }
            default:
                reply(nil, "The app does not know that request.")
            }
        }
    }

    private func applyNav(_ json: JSON) {
        let site = json["site"].string
        if kind == .office || kind == .sheet, !site.isEmpty, !siteID.isEmpty, site != siteID {
            // The website moved this page into another business's back office by itself: the app changes business its own way
            // (with that business's passcode step), and this page goes back to where it started.
            reportedSite = ""
            load(startPath)
            AppModel.shared.openBusinessFromWeb(id: site, tab: json["tab"].string)
            return
        }
        reportedSite = site
        tab = json["tab"].string
        title = json["title"].string
        group = json["group"].string
        pages = json["pages"].array.compactMap { (item: JSON) -> PageLink? in
            let id = item["id"].string
            return id.isEmpty ? nil : PageLink(id: id, label: item["label"].string)
        }
        parent = json["parent"].string
        parentTitle = json["parentTitle"].string
        arrived()
    }

    private func reportedReady(path: String) {
        // The "create your business" page lands on the new business's page when it is done.
        if kind == .create, let id = Self.siteID(in: path) { AppModel.shared.businessCreated(id) }
        arrived()
    }

    /// The page is up: the picture fades, the refresh spinner stops, and any waiting hand-off runs.
    private func arrived() {
        loading = false
        failure = nil
        lastLoaded = Date()
        loginBounces = 0
        // The website moves between its pages without loading anew, so where it is now is noted each time it reports in: Try
        // again, and the reload after iOS took the page's memory back, return to this page and not to the first one opened.
        noteLoaded(webView.url)
        retryTask?.cancel()
        fadeOverlay()
        endRefreshing()
        AppModel.shared.webPageReported()
        runPendingScript()
    }

    /// Runs the hand-off once the page is up. PF.sale answers whether it filled the Virtual Terminal: when it says false (the page
    /// was not ready), the hand-off is tried once more on the page's next report, and never after that, so nothing typed since is
    /// ever overwritten.
    private func runPendingScript() {
        guard let script = pendingScript else { return }
        pendingScript = nil
        scriptTries += 1
        webView.evaluateJavaScript(script) { [weak self] result, _ in
            guard let self, (result as? Bool) == false, self.scriptTries < 2 else { return }
            self.pendingScript = script
        }
    }

    // MARK: Failures

    func fail(_ why: WebFailure) {
        loading = false
        failure = why
        fadeOverlay()
        endRefreshing()
        AppModel.shared.webPageReported()
        retryTask?.cancel()
        if why == .restarting {
            // While the server restarts, try again every 5 seconds.
            retryTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                guard !Task.isCancelled else { return }
                self?.retry()
            }
        }
    }

    /// Remembers where the page is, for Try again and the reload after iOS took its memory back. Only a back-office address is
    /// kept, and for a dashboard page only one of its own business: never a file's address (loading it again would start a
    /// download) and never another business's (loading it again would change business).
    func noteLoaded(_ url: URL?) {
        guard let url, Config.isOwn(url) else { return }
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.first == "app" else { return }
        if kind == .office || kind == .sheet {
            guard parts.count >= 3, parts[1] == "site", parts[2] == siteID else { return }
        }
        lastGoodURL = url
    }

    /// A page that finished loading but never reported in (a plain server page) still stops the spinner and the picture.
    func finishedWithoutReport() {
        guard loading else { return }
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            guard let self, self.loading, self.failure == nil else { return }
            self.loading = false
            self.fadeOverlay()
            self.endRefreshing()
        }
    }

    // MARK: Print and files

    /// The website hands printing to the app (window.print in app mode, and its tickets). When the print sheet closes, printed or
    /// not, the page is told with the browser's own afterprint event, so it puts back what it changed for the paper (its colours).
    private func printPage(title: String) {
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo.printInfo()
        info.jobName = title.isEmpty ? "PF Sites" : title
        info.outputType = .general
        controller.printInfo = info
        controller.printFormatter = webView.viewPrintFormatter()
        let shown = controller.present(animated: true) { [weak self] _, _, _ in
            guard let page = self else { return }
            Task { @MainActor in page.printSheetClosed() }
        }
        if !shown { printSheetClosed() }
    }

    private func printSheetClosed() {
        guard !closed else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new Event('afterprint'))", completionHandler: nil)
    }

    /// Downloads a file of ours (an attachment) and offers it to save or share.
    func download(_ url: URL) {
        webView.startDownload(using: URLRequest(url: url)) { download in
            download.delegate = DownloadCenter.shared
        }
    }

    // MARK: Closing

    /// The page is no longer needed (another business, signing out): stop it and let go of its message handlers.
    func close() {
        guard !closed else { return }
        closed = true
        retryTask?.cancel()
        overlayCap?.cancel()
        webView.stopLoading()
        webView.configuration.userContentController.removeAllScriptMessageHandlers()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        catchers.removeAll()
        WebStore.shared.unregister(self)
    }

    // MARK: Helpers

    static func jsString(_ text: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [text]), let array = String(data: data, encoding: .utf8) else { return "''" }
        return String(array.dropFirst().dropLast())
    }

    static func siteID(in path: String) -> String? {
        let parts = path.split(separator: "/").map(String.init)
        guard parts.count >= 3, parts[0] == "app", parts[1] == "site" else { return nil }
        return parts[2]
    }
}
