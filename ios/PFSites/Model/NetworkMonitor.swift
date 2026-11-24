import Foundation
import Network

/// Watches the connection, so pages that failed while offline load again by themselves when it comes back.
@MainActor
final class NetworkMonitor {
    static let shared = NetworkMonitor()

    private let monitor = NWPathMonitor()
    private var started = false
    /// nil until the phone has said for the first time.
    private(set) var online: Bool?
    private var waiting: [@MainActor () -> Void] = []

    func start() {
        guard !started else { return }
        started = true
        monitor.pathUpdateHandler = { path in
            let ok = path.status == .satisfied
            Task { @MainActor in NetworkMonitor.shared.update(ok) }
        }
        monitor.start(queue: DispatchQueue(label: "com.processorfreedomsites.app.network"))
    }

    /// Runs `action` the next time the connection comes back. It never runs straight away, so a failure that is not about the
    /// connection cannot turn into a loop of retries.
    func whenBackOnline(_ action: @escaping @MainActor () -> Void) {
        waiting.append(action)
    }

    private func update(_ ok: Bool) {
        let cameBack = ok && online != true
        online = ok
        guard cameBack else { return }
        let actions = waiting
        waiting = []
        actions.forEach { $0() }
        WebStore.shared.networkCameBack()
    }
}
