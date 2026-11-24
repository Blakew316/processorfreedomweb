import UIKit
import WebKit

/// Where each address the page tries to open belongs: our back office stays in the web view, the log in pages are never
/// shown (the app has its own), and everything else opens outside it.
@MainActor
enum WebRouter {
    enum Place {
        case here
        case signedOut
        case outside
    }

    static func place(for url: URL) -> Place {
        guard Config.isOwn(url) else { return .outside }
        let path = url.path
        if ["/login", "/signup", "/forgot", "/reset"].contains(path) { return .signedOut }
        if path == "/app" || path.hasPrefix("/app/") { return .here }
        // Our files (attachments, PDFs): the response turns into a download.
        if path.hasPrefix("/u/") { return .here }
        return .outside
    }

    /// Where a back-office address leads that the app itself takes care of, instead of the page: the website's list of businesses
    /// (the app has its own location list), or another business's back office (the app changes business its own way).
    enum Takeover {
        case locations
        case business(id: String, tab: String)
    }

    static func takeover(for url: URL, from page: OfficePage) -> Takeover? {
        // Only the dashboard's own pages: the kitchen screen and the "create your business" page move around freely.
        guard page.kind == .office || page.kind == .sheet else { return nil }
        let parts = url.path.split(separator: "/").map(String.init)
        if parts == ["app"] { return .locations }
        guard parts.count >= 3, parts[0] == "app", parts[1] == "site", parts[2] != page.siteID, !page.siteID.isEmpty else { return nil }
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        let tab = query?.first(where: { $0.name == "tab" })?.value ?? (parts.count > 3 ? parts[3] : "")
        return .business(id: parts[2], tab: tab)
    }

    static func hand(_ takeover: Takeover) {
        switch takeover {
        case .locations: AppModel.shared.openLocationsFromWeb()
        case .business(let id, let tab): AppModel.shared.openBusinessFromWeb(id: id, tab: tab)
        }
    }

    /// Opens an address outside the page: our own back-office pages in the page, the website preview in the in-app browser
    /// (it needs the session), our files as downloads, other web addresses in Safari, and mail, phone and text links in their apps.
    static func open(_ url: URL, from page: OfficePage?) {
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "http" || scheme == "https" {
            if Config.isOwn(url) {
                if url.path == "/app" || url.path.hasPrefix("/app/") {
                    if let page, let takeover = takeover(for: url, from: page) {
                        hand(takeover)
                        return
                    }
                    page?.load(url.path + (url.query.map { "?\($0)" } ?? ""))
                    return
                }
                if url.path.hasPrefix("/preview/") {
                    UIPresenter.browser(url)
                    return
                }
                if url.path.hasPrefix("/u/"), let page {
                    page.download(url)
                    return
                }
            }
            UIPresenter.safari(url)
            return
        }
        guard !scheme.isEmpty, scheme != "about", scheme != "javascript" else { return }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
}

extension OfficePage: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "about" || scheme == "blob" || scheme == "data" {
            decisionHandler(.allow)
            return
        }
        // Frames inside the page (the website preview on the design pages) load where they are.
        if let frame = navigationAction.targetFrame, !frame.isMainFrame {
            decisionHandler(.allow)
            return
        }
        // Links that open a new window (target=_blank).
        if navigationAction.targetFrame == nil {
            decisionHandler(.cancel)
            WebRouter.open(url, from: self)
            return
        }
        switch WebRouter.place(for: url) {
        case .here:
            if let takeover = WebRouter.takeover(for: url, from: self) {
                decisionHandler(.cancel)
                WebRouter.hand(takeover)
            } else {
                decisionHandler(.allow)
            }
        case .signedOut:
            decisionHandler(.cancel)
            AppModel.shared.sessionEnded()
        case .outside:
            decisionHandler(.cancel)
            WebRouter.open(url, from: self)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void) {
        if let http = navigationResponse.response as? HTTPURLResponse {
            let disposition = (http.value(forHTTPHeaderField: "Content-Disposition") ?? "").lowercased()
            if disposition.hasPrefix("attachment") {
                decisionHandler(.download)
                return
            }
            if navigationResponse.isForMainFrame {
                if http.statusCode == 502 || http.statusCode == 503 || http.statusCode == 504 {
                    decisionHandler(.cancel)
                    fail(.restarting)
                    return
                }
                if http.statusCode >= 500 {
                    decisionHandler(.cancel)
                    fail(.server)
                    return
                }
            }
        }
        if !navigationResponse.canShowMIMEType {
            decisionHandler(.download)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = DownloadCenter.shared
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = DownloadCenter.shared
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if !loading { loading = true }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        noteLoaded(webView.url)
        finishedWithoutReport()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handle(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handle(error)
    }

    /// The page's process ended (memory pressure, a crash): load it again.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        retry()
    }

    /// window.open: an address we can see is opened outside the page; a blank window the page fills in a moment later
    /// (the website's Preview buttons) is caught, and wherever it is sent is opened instead.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, !url.absoluteString.isEmpty, url.absoluteString != "about:blank" {
            WebRouter.open(url, from: self)
            return nil
        }
        let catcher = PopupCatcher(configuration: configuration) { [weak self] url in
            WebRouter.open(url, from: self)
        }
        catcher.onDone = { [weak self, weak catcher] in
            guard let self, let catcher else { return }
            self.catchers.removeAll { $0 === catcher }
        }
        catchers.append(catcher)
        return catcher.webView
    }

    private func handle(_ error: Error) {
        let ns = error as NSError
        // A navigation replaced by another one, or one we cancelled ourselves or turned into a download, is not a failure.
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        if (ns.domain == "WebKitErrorDomain" || ns.domain == WKErrorDomain) && (ns.code == 102 || ns.code == 204) { return }
        if failure != nil { return }
        guard ns.domain == NSURLErrorDomain else {
            fail(.server)
            return
        }
        // "You're offline" is only said when the phone has no connection. A connection that dropped part-way, a timeout or a
        // server that could not be found or reached while the phone is online is said as that.
        let offline: Set<Int> = [NSURLErrorNotConnectedToInternet, NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff]
        let unreachable: Set<Int> = [NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed]
        if offline.contains(ns.code) || (unreachable.contains(ns.code) && NetworkMonitor.shared.online == false) {
            fail(.offline)
        } else if unreachable.contains(ns.code) {
            fail(.unreachable)
        } else {
            fail(.server)
        }
    }
}

/// Catches a blank window a page opened and then sends somewhere (window.open('') followed by w.location = ...).
@MainActor
final class PopupCatcher: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    var onDone: (@MainActor () -> Void)?
    private let opened: @MainActor (URL) -> Void
    private var done = false

    init(configuration: WKWebViewConfiguration, opened: @escaping @MainActor (URL) -> Void) {
        self.webView = WKWebView(frame: .zero, configuration: configuration)
        self.opened = opened
        super.init()
        webView.navigationDelegate = self
        // A window that is never sent anywhere is let go after a while.
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 15_000_000_000)
            self?.finish()
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased(), scheme != "about" else {
            decisionHandler(.allow)
            return
        }
        decisionHandler(.cancel)
        if !done { opened(url) }
        finish()
    }

    private func finish() {
        guard !done else { return }
        done = true
        webView.navigationDelegate = nil
        onDone?()
        onDone = nil
    }
}
