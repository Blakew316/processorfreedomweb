import Foundation
import Observation
import UIKit

/// The 15-minute rule, like the website: after 14 minutes without a touch or typing a banner warns, at 15 the app locks
/// and the session ends. Time is measured with the phone's continuous clock, which keeps counting while the phone sleeps and
/// cannot be wound back by changing the date and time in Settings. Nothing is kept between runs: a cold start always opens locked.
/// It only runs while the dashboard is showing, and never for a kitchen login (that screen stays on all day, as on the website).
@Observable @MainActor
final class IdleMonitor {
    static let limit: Duration = .seconds(15 * 60)
    static let warnAfter: Duration = .seconds(14 * 60)

    var warning = false
    var secondsLeft = 60

    /// Not observed: every touch sets it, and no view should redraw for that.
    @ObservationIgnored private var last = ContinuousClock.now
    @ObservationIgnored private var running = false
    @ObservationIgnored private var ticker: Task<Void, Never>?

    /// Whether the last activity was 15 minutes ago or more (the app may have been in the background, or the phone asleep, since).
    var expired: Bool { ContinuousClock.now - last >= Self.limit }

    init() {
        // Two kinds of activity never reach the app's window as touches: typing in the app's own fields (the keyboard is not
        // in the window) and moving around with VoiceOver. Both count, as typing does on the website.
        for name in [UITextField.textDidChangeNotification, UITextView.textDidChangeNotification, UIAccessibility.elementFocusedNotification] {
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.touch() }
            }
        }
    }

    /// Every touch anywhere in the app and every keystroke (in the app's own fields and in a web page) lands here.
    func touch() {
        last = ContinuousClock.now
        if warning { setWarning(false) }
    }

    func stayLoggedIn() { touch() }

    /// Starts counting (a kitchen login is exempt).
    func start(kitchen: Bool) {
        running = !kitchen
        touch()
        if running { startTicker() } else { stopTicker() }
    }

    /// Stops counting while the app is locked or signed out.
    func stop() {
        running = false
        setWarning(false)
        stopTicker()
    }

    func wentToBackground() {
        stopTicker()
    }

    func cameToForeground() {
        if running { startTicker() }
    }

    private func startTicker() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                self?.tick()
            }
        }
    }

    private func stopTicker() {
        ticker?.cancel()
        ticker = nil
    }

    private func tick() {
        guard running else { return }
        let idle = ContinuousClock.now - last
        if idle >= Self.limit {
            setWarning(false)
            AppModel.shared.lock()
        } else if idle >= Self.warnAfter {
            // Whole seconds left, rounded up, so the banner never shows 0:00 before the lock.
            let left = (Self.limit - idle).components
            let shown = max(1, Int(left.seconds) + (left.attoseconds > 0 ? 1 : 0))
            if secondsLeft != shown { secondsLeft = shown }
            if !warning { setWarning(true) }
        } else if warning {
            setWarning(false)
        }
    }

    /// The banner has its own window above sheets and full-screen pages, so the warning shows whatever is open.
    private func setWarning(_ on: Bool) {
        guard warning != on else { return }
        warning = on
        if on { OverlayWindows.shared.showIdleWarning() } else { OverlayWindows.shared.hideIdleWarning() }
    }
}
