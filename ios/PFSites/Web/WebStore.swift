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
    func closeAll() { live.forEach { $0.close() } }
    func networkCameBack() { live.forEach { $0.networkCameBack() } }
    func refreshVisibleIfStale() { live.filter { $0.isOnScreen }.forEach { $0.refreshIfStale() } }
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
