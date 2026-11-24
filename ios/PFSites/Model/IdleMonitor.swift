import Foundation
import Observation

/// The 15-minute rule, like the website: after 14 minutes without a touch or typing a banner warns, at 15 the app locks
/// and the session ends. The last activity is kept on the phone, so the rule also holds across the app being closed or killed.
/// It only runs while the dashboard is showing, and never for a kitchen login (that screen stays on all day, as on the website).
@Observable @MainActor
final class IdleMonitor {
    static let limit: TimeInterval = 15 * 60
    static let warnAfter: TimeInterval = 14 * 60

    var warning = false
    var secondsLeft = 60

    @ObservationIgnored private var last: Date
    @ObservationIgnored private var lastSaved = Date.distantPast
    @ObservationIgnored private var running = false
    @ObservationIgnored private var ticker: Task<Void, Never>?

    init() {
        let saved = UserDefaults.standard.double(forKey: Keys.lastActive)
        last = saved > 0 ? Date(timeIntervalSince1970: saved) : Date()
    }

    /// Whether the last activity, even from an earlier run of the app, was more than 15 minutes ago.
    var expired: Bool { Date().timeIntervalSince(last) >= Self.limit }

    /// Every touch anywhere in the app and every keystroke in a web page lands here.
    func touch() {
        last = Date()
        if warning { warning = false }
        if last.timeIntervalSince(lastSaved) > 10 { save() }
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
        warning = false
        stopTicker()
    }

    func wentToBackground() {
        save()
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
        let idle = Date().timeIntervalSince(last)
        if idle >= Self.limit {
            warning = false
            AppModel.shared.lock()
        } else if idle >= Self.warnAfter {
            let left = max(1, Int((Self.limit - idle).rounded(.up)))
            if secondsLeft != left { secondsLeft = left }
            if !warning { warning = true }
        } else if warning {
            warning = false
        }
    }

    private func save() {
        lastSaved = Date()
        UserDefaults.standard.set(last.timeIntervalSince1970, forKey: Keys.lastActive)
    }
}
