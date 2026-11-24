import Foundation

/// Why a request did not work, in words a person can read, with the extra flags the server sends next to some errors
/// (two-step sign-in, a device that has to sign in again, Face ID switched off, passcode tries left).
struct APIError: Error, LocalizedError {
    var status: Int
    var message: String
    var data = JSON(nil)

    var errorDescription: String? { message }
    var offline: Bool { status == 0 }
    var twoFactor: Bool { data["twoFactor"].bool }
    var methods: [String] { data["methods"].array.map { $0.string }.filter { !$0.isEmpty } }
    var phone: String { data["phone"].string }
    var sent: Bool { data["sent"].bool }
    var signIn: Bool { data["signIn"].bool }
    var bioOff: Bool { data["bioOff"].bool }
    var left: Int? { data["left"].exists ? data["left"].int : nil }

    /// The session itself has ended (signed out everywhere, or left longer than the server's 16 minutes): a plain 401, without the
    /// flags the sign-in, passcode and Face ID answers carry. The app checks and locks; a 401 with those flags means something else.
    var sessionEnded: Bool { status == 401 && !signIn && !twoFactor && !bioOff && left == nil }
    /// Signed in, but this login may not do that, or this session may not open that business: a message to show, never a sign-out.
    var forbidden: Bool { status == 403 }

    static let offlineMessage = "You're offline. Check your connection and try again."
    static let unreachableMessage = "We could not reach the server. Check your connection and try again."
    static let restartingMessage = "PF Sites is restarting. Give it a moment and try again."
}

/// Talks to the server in JSON. It uses the shared cookie store, so the session cookie that signing in sets is sent with every
/// later request, and copied into the web views before they load.
enum API {
    static func get(_ path: String) async throws -> JSON { try await send("GET", path) }

    @discardableResult
    static func post(_ path: String, _ body: [String: Any] = [:]) async throws -> JSON { try await send("POST", path, body: body) }

    @discardableResult
    static func delete(_ path: String, _ body: [String: Any] = [:]) async throws -> JSON { try await send("DELETE", path, body: body) }

    /// `cookies: false` sends the request without the session, for giving up an old device key without ending the new session.
    static func send(_ method: String, _ path: String, body: [String: Any]? = nil, cookies: Bool = true) async throws -> JSON {
        var request = URLRequest(url: Config.url(path))
        request.httpMethod = method
        request.timeoutInterval = 20
        request.httpShouldHandleCookies = cookies
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        // The service restarts for a few seconds when it is updated: wait that out quietly, as the website does.
        let waits: [UInt64] = method == "GET" ? [600, 1500, 3000] : [1000, 2500]
        var attempt = 0
        while true {
            let result: (Data, URLResponse)
            do {
                result = try await URLSession.shared.data(for: request)
            } catch {
                if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw CancellationError() }
                // Only reads are tried again after a dropped connection: a write may already have happened. And not when the
                // phone has no connection at all, or the server took the whole 20 seconds: trying again would only keep the
                // person waiting to be told.
                if method == "GET", attempt < waits.count, worthAnotherTry(error) {
                    try? await Task.sleep(nanoseconds: waits[attempt] * 1_000_000)
                    attempt += 1
                    continue
                }
                throw APIError(status: 0, message: words(for: error))
            }
            let status = (result.1 as? HTTPURLResponse)?.statusCode ?? 0
            let restarting = status == 502 || status == 503 || status == 504
            if restarting, attempt < waits.count {
                try? await Task.sleep(nanoseconds: waits[attempt] * 1_000_000)
                attempt += 1
                continue
            }
            let json = JSON(data: result.0)
            if (200..<300).contains(status) { return json }
            if restarting { throw APIError(status: status, message: APIError.restartingMessage) }
            let text = json["error"].string
            throw APIError(status: status, message: text.isEmpty ? "Something went wrong. Please try again." : text, data: json)
        }
    }

    /// A connection that dropped or was refused (the service restarting) is worth trying again in a moment; no connection at all,
    /// or a request that ran out of time, is not.
    private static func worthAnotherTry(_ error: Error) -> Bool {
        if let code = (error as? URLError)?.code {
            switch code {
            case .notConnectedToInternet, .dataNotAllowed, .internationalRoamingOff, .timedOut:
                return false
            default:
                break
            }
        }
        return true
    }

    private static func words(for error: Error) -> String {
        if let code = (error as? URLError)?.code {
            switch code {
            // "You're offline" only when the phone has no connection. A connection that dropped part-way may be the server's
            // doing, so it is said as not reaching the server.
            case .notConnectedToInternet, .dataNotAllowed, .internationalRoamingOff:
                return APIError.offlineMessage
            default:
                break
            }
        }
        return APIError.unreachableMessage
    }
}
