import SwiftUI
import UIKit
import WebKit

/// Puts a page's web view into SwiftUI. The web view stays inside the safe area (below the navigation bar and the page strip,
/// above the tab bar), so no content is ever under a bar, and only the keyboard's area is ignored (the web view handles
/// the keyboard itself).
struct OfficeWebView: UIViewRepresentable {
    let page: OfficePage

    func makeUIView(context: Context) -> WebHostView {
        let host = WebHostView()
        host.show(page)
        return host
    }

    func updateUIView(_ host: WebHostView, context: Context) {
        host.show(page)
    }
}

/// Holds the web view and, above it, the picture shown while a page changes or reloads.
final class WebHostView: UIView {
    private weak var shown: OfficePage?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Theme.webGroundUI
        clipsToBounds = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    func show(_ page: OfficePage) {
        let web = page.webView
        guard shown !== page || web.superview !== self else { return }
        shown = page
        web.removeFromSuperview()
        web.frame = bounds
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        insertSubview(web, at: 0)
    }
}

/// A page with its loading spinner and, when it cannot load, the offline card over it.
struct WebPageView: View {
    let page: OfficePage

    var body: some View {
        OfficeWebView(page: page)
            .ignoresSafeArea(.keyboard)
            // The page's own ground runs on under it, down to the bottom of the screen (the web view stops at the safe area).
            .background(Theme.webGround)
            .overlay {
                if let failure = page.failure {
                    OfflineView(failure: failure) { page.retry() }
                } else if page.loading && page.lastLoaded == nil {
                    ProgressView()
                        .controlSize(.large)
                        .tint(Theme.blue)
                }
            }
            .onAppear { page.appeared() }
            .onDisappear { page.left() }
    }
}
