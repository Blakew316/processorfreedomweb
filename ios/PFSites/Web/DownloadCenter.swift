import SafariServices
import UIKit
import WebKit

/// Saves files the website downloads (CSV and spreadsheet exports, recovery codes, attachments) to a temporary folder,
/// then offers the share sheet so they can go to Files, AirDrop, Mail and the rest. Nothing is kept longer than it is needed:
/// a file goes when its share sheet closes, and the whole folder goes when the dashboard closes (Log out, Switch User) and at
/// the next launch.
@MainActor
final class DownloadCenter: NSObject, WKDownloadDelegate {
    static let shared = DownloadCenter()

    private var files: [ObjectIdentifier: URL] = [:]

    private nonisolated static var folder: URL { FileManager.default.temporaryDirectory.appendingPathComponent("Downloads", isDirectory: true) }

    /// Files from an earlier run, or from whoever used the app before, are no longer needed.
    nonisolated static func clearOldFiles() {
        try? FileManager.default.removeItem(at: folder)
    }

    /// A new folder of its own for one file, so the file keeps its name and never overwrites another (the app's own exports use
    /// it too, so they are cleared with the downloads).
    nonisolated static func newFolder() throws -> URL {
        let place = folder.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: place, withIntermediateDirectories: true)
        return place
    }

    /// Removes a file that was made to be shared, with the folder made for it. A file anywhere else is left alone.
    nonisolated static func remove(_ file: URL) {
        let own = file.deletingLastPathComponent().standardizedFileURL
        guard own.deletingLastPathComponent().path == folder.standardizedFileURL.path else { return }
        try? FileManager.default.removeItem(at: own)
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping @MainActor @Sendable (URL?) -> Void) {
        // Each download gets its own folder, so the file keeps the website's name and never overwrites another.
        guard let place = try? Self.newFolder() else {
            completionHandler(nil)
            return
        }
        let file = place.appendingPathComponent(Self.safeName(suggestedFilename))
        files[ObjectIdentifier(download)] = file
        completionHandler(file)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = files.removeValue(forKey: ObjectIdentifier(download)) else { return }
        UIPresenter.share(file)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = files.removeValue(forKey: ObjectIdentifier(download)) { Self.remove(file) }
        UIPresenter.alert(title: "Download failed", message: "The file could not be saved. Please try again.")
    }

    static func safeName(_ name: String) -> String {
        let cleaned = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-").trimmed
        return cleaned.isEmpty ? "download" : String(cleaned.prefix(120))
    }
}

/// A small in-app browser for our own pages that need the signed-in session, such as the website preview. It shares the
/// web views' cookie store, so the preview opens signed in; other addresses it is sent to open in Safari.
@MainActor
final class BrowserController: UIViewController, WKNavigationDelegate {
    private let url: URL
    private let webView: WKWebView
    private let spinner = UIActivityIndicatorView(style: .large)

    init(url: URL) {
        self.url = url
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore.default()
        configuration.applicationNameForUserAgent = "PFSitesApp/\(Config.version)"
        configuration.allowsInlineMediaPlayback = true
        self.webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        return nil
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Preview"
        webView.frame = view.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        view.addSubview(webView)
        // A spinner until the page is up, so the sheet is never just blank while it loads.
        spinner.color = UIColor(named: "BrandBlue")
        spinner.hidesWhenStopped = true
        spinner.center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
        spinner.autoresizingMask = [.flexibleLeftMargin, .flexibleRightMargin, .flexibleTopMargin, .flexibleBottomMargin]
        view.addSubview(spinner)
        spinner.startAnimating()
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(done))
        webView.load(URLRequest(url: url))
    }

    @objc private func done() {
        dismiss(animated: true)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        spinner.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    /// The page could not be loaded: said in an alert whose Try again loads it once more (a navigation the browser itself
    /// replaced or handed to Safari is not a failure).
    private func failed(_ error: Error) {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        if (ns.domain == "WebKitErrorDomain" || ns.domain == WKErrorDomain) && (ns.code == 102 || ns.code == 204) { return }
        spinner.stopAnimating()
        guard presentedViewController == nil, webView.url == nil || webView.url?.absoluteString == "about:blank" else { return }
        let offline = ns.domain == NSURLErrorDomain && [NSURLErrorNotConnectedToInternet, NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff].contains(ns.code)
        let alert = UIAlertController(title: nil, message: offline ? APIError.offlineMessage : APIError.unreachableMessage, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Close", style: .cancel) { [weak self] _ in self?.dismiss(animated: true) })
        alert.addAction(UIAlertAction(title: "Try again", style: .default) { [weak self] _ in
            guard let self else { return }
            self.spinner.startAnimating()
            self.webView.load(URLRequest(url: self.url))
        })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        guard let target = navigationAction.request.url, let scheme = target.scheme?.lowercased() else {
            decisionHandler(.allow)
            return
        }
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        if mainFrame, scheme == "http" || scheme == "https", !Config.isOwn(target) {
            decisionHandler(.cancel)
            let safari = SFSafariViewController(url: target)
            present(safari, animated: true)
            return
        }
        if scheme == "mailto" || scheme == "tel" || scheme == "sms" {
            decisionHandler(.cancel)
            UIApplication.shared.open(target, options: [:], completionHandler: nil)
            return
        }
        decisionHandler(.allow)
    }
}
