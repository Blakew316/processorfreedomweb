import UIKit
import WebKit

/// Makes the web views and keeps a list of the live pages, so the app can blank them all when it locks and load them all
/// again after it unlocks. Every page shares the default website data store, so they all share the one session cookie.
@MainActor
final class WebStore {
    static let shared = WebStore()

    private let pages = NSHashTable<OfficePage>.weakObjects()

    /// Runs before the page's own scripts: marks it as running inside the app, so the website hides its own bars and talks to the app.
    static var appModeScript: String {
        "document.documentElement.classList.add('pf-app'); window.PF_APP = { version: '\(Config.version)' };"
    }

    func makeConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore.default()
        configuration.applicationNameForUserAgent = "PFSitesApp/\(Config.version)"
        configuration.allowsInlineMediaPlayback = true
        // New-order alert sounds play without a tap first, as they do on the website.
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let content = WKUserContentController()
        content.addUserScript(WKUserScript(source: Self.appModeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController = content
        return configuration
    }

    func register(_ page: OfficePage) { pages.add(page) }
    func unregister(_ page: OfficePage) { pages.remove(page) }

    var live: [OfficePage] { pages.allObjects }
    var hasLivePages: Bool { !live.isEmpty }

    func reloadAll() { live.forEach { $0.reload() } }
    func blankAll() { live.forEach { $0.blank() } }
    func closeAll() {
        live.forEach { $0.close() }
        leaving.removeAll()
    }
    func networkCameBack() { live.forEach { $0.networkCameBack() } }
    func refreshVisibleIfStale() { live.filter { $0.isOnScreen }.forEach { $0.refreshIfStale() } }
    /// The app is being put away: the pages on screen note the time, to know how long they were away when it comes back.
    func visibleLeft() { live.filter { $0.isOnScreen }.forEach { $0.left() } }

    /// Pages whose screen has just gone away are kept a few seconds more. A change made on a page is saved a moment after it
    /// is made; a page let go the instant Back is tapped took its unsaved change with it.
    private var leaving: [ObjectIdentifier: (page: OfficePage, stamp: UUID)] = [:]

    func holdBriefly(_ page: OfficePage) {
        let id = ObjectIdentifier(page)
        let stamp = UUID()
        leaving[id] = (page, stamp)
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if self?.leaving[id]?.stamp == stamp { self?.leaving.removeValue(forKey: id) }
        }
    }

    /// The page on screen that was opened on this website page shows it again, when its own page strip has moved on to another.
    func showAgain(_ tab: String) {
        guard let page = live.first(where: { $0.isOnScreen && $0.kind == .office && $0.startPath == Config.sitePath($0.siteID, tab) }) else { return }
        if page.tab != tab || page.failure != nil { page.go(tab) }
    }

    /// Pages that were turned away to the website's log in page and have not loaded since.
    var hasPagesSentToLogin: Bool { live.contains { $0.loginBounces > 0 } }
    func retryPagesSentToLogin() { live.forEach { $0.retryAfterLoginBounce() } }
}

/// Hands messages from a page to its OfficePage. The web view's content controller holds this proxy strongly and the proxy holds
/// the page weakly, so the page (which owns the web view) is never kept alive by its own web view.
@MainActor
final class ScriptProxy: NSObject, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
    weak var page: OfficePage?

    init(page: OfficePage) {
        self.page = page
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        page?.received(message)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard let page else {
            replyHandler(nil, "This page is closed.")
            return
        }
        page.asked(message, reply: replyHandler)
    }
}
