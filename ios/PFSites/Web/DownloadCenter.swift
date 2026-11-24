import SafariServices
import UIKit
import WebKit

/// Saves files the website downloads (CSV and spreadsheet exports, recovery codes, attachments) to a temporary folder,
/// then offers the share sheet so they can go to Files, AirDrop, Mail and the rest.
@MainActor
final class DownloadCenter: NSObject, WKDownloadDelegate {
    static let shared = DownloadCenter()

    private var files: [ObjectIdentifier: URL] = [:]

    private static var folder: URL { FileManager.default.temporaryDirectory.appendingPathComponent("Downloads", isDirectory: true) }

    /// Files from an earlier run are no longer needed.
    static func clearOldFiles() {
        try? FileManager.default.removeItem(at: folder)
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping @MainActor @Sendable (URL?) -> Void) {
        // Each download gets its own folder, so the file keeps the website's name and never overwrites another.
        let place = Self.folder.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: place, withIntermediateDirectories: true)
        } catch {
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
        if let file = files.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
        }
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
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(done))
        webView.load(URLRequest(url: url))
    }

    @objc private func done() {
        dismiss(animated: true)
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
            safari.preferredControlTintColor = UIColor(named: "BrandBlue")
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
