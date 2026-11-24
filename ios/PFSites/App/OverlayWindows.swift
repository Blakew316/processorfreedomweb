import SwiftUI
import UIKit

/// Windows that sit above everything the app shows, sheets and Safari pages included: the 15-minute warning (so no sheet or
/// full-screen page can hide it), the lock screen (so the dashboard stays exactly where it was underneath it) and the privacy cover
/// for the app switcher.
@MainActor
final class OverlayWindows {
    static let shared = OverlayWindows()

    private(set) weak var mainWindow: UIWindow?
    private var warningWindow: BannerWindow?
    private var lockWindow: UIWindow?
    private var coverWindow: UIWindow?

    func attach(_ window: UIWindow) {
        if mainWindow !== window { mainWindow = window }
    }

    private var scene: UIWindowScene? {
        mainWindow?.windowScene ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    }

    /// The lock screen, on at once (the web pages under it are blanked too).
    func showLock() {
        guard lockWindow == nil, let scene else { return }
        let window = UIWindow(windowScene: scene)
        window.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + 1)
        Appearance.apply(to: window)
        let host = UIHostingController(rootView: LockScreen().environment(AppModel.shared).tint(Theme.blue).dynamicTypeSize(...DynamicTypeSize.large))
        host.view.backgroundColor = .systemBackground
        window.rootViewController = host
        window.makeKeyAndVisible()
        lockWindow = window
    }

    /// After a right passcode the lock screen fades and grows a little as it goes (just fades with Reduce Motion).
    func hideLock(animated: Bool) {
        guard let window = lockWindow else { return }
        lockWindow = nil
        guard animated, let view = window.rootViewController?.view else {
            close(window)
            return
        }
        let grow = !UIAccessibility.isReduceMotionEnabled
        UIView.animate(withDuration: 0.3, delay: 0, options: [.curveEaseOut]) {
            view.alpha = 0
            if grow { view.transform = CGAffineTransform(scaleX: 1.04, y: 1.04) }
        }
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 320_000_000)
            self?.close(window)
        }
    }

    private func close(_ window: UIWindow) {
        window.isHidden = true
        window.rootViewController = nil
        mainWindow?.makeKey()
    }

    /// The privacy cover while the app is in the app switcher or the background, so no sales data shows there.
    func showCover() {
        guard coverWindow == nil, let scene else { return }
        let window = UIWindow(windowScene: scene)
        window.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + 2)
        Appearance.apply(to: window)
        let host = UIHostingController(rootView: PrivacyCover().dynamicTypeSize(...DynamicTypeSize.large))
        host.view.backgroundColor = .systemBackground
        window.rootViewController = host
        window.isHidden = false
        coverWindow = window
    }

    func hideCover() {
        guard let window = coverWindow else { return }
        coverWindow = nil
        window.isHidden = true
        window.rootViewController = nil
    }

    /// The 15-minute warning at the top, above the app and anything open in it (sheets, full-screen pages, Safari) and below the
    /// lock screen. It never becomes the key window, so typing goes on where it was, and only the banner itself takes touches.
    func showIdleWarning() {
        guard warningWindow == nil, let scene else { return }
        let window = BannerWindow(windowScene: scene)
        window.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue - 1)
        Appearance.apply(to: window)
        let host = UIHostingController(rootView: IdleWarningBanner().environment(AppModel.shared).tint(Theme.blue).dynamicTypeSize(...DynamicTypeSize.large))
        host.view.backgroundColor = .clear
        window.rootViewController = host
        // It comes down from the top as it appears (just fades in with Reduce Motion).
        host.view.alpha = 0
        if !UIAccessibility.isReduceMotionEnabled { host.view.transform = CGAffineTransform(translationX: 0, y: -24) }
        window.isHidden = false
        warningWindow = window
        UIView.animate(withDuration: 0.3, delay: 0, options: [.curveEaseOut, .allowUserInteraction]) {
            host.view.alpha = 1
            host.view.transform = .identity
        }
    }

    func hideIdleWarning() {
        guard let window = warningWindow else { return }
        warningWindow = nil
        window.touchArea = .zero
        UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseIn]) {
            window.rootViewController?.view.alpha = 0
        }
        Task {
            try? await Task.sleep(nanoseconds: 270_000_000)
            window.isHidden = true
            window.rootViewController = nil
        }
    }

    /// Where the banner is, in screen points (the banner reports it as it lays out).
    func setWarningArea(_ area: CGRect) {
        warningWindow?.touchArea = area
    }
}

/// The warning's window: touches on the banner go to it, every other touch goes to the app underneath as if it were not there.
final class BannerWindow: UIWindow {
    var touchArea: CGRect = .zero

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        touchArea.contains(point)
    }
}
