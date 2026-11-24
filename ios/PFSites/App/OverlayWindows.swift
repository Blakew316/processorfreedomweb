import SwiftUI
import UIKit

/// Two windows that sit above everything the app shows, sheets and Safari pages included:
/// the lock screen (so the dashboard stays exactly where it was underneath it) and the privacy cover for the app switcher.
@MainActor
final class OverlayWindows {
    static let shared = OverlayWindows()

    private(set) weak var mainWindow: UIWindow?
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
        let host = UIHostingController(rootView: LockScreen().environment(AppModel.shared).tint(Theme.blue))
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
        let host = UIHostingController(rootView: PrivacyCover())
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
}
