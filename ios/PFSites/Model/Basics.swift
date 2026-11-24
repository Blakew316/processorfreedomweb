import Foundation
import LocalAuthentication
import UIKit

/// Which kind of biometrics this phone has, so the screens can say "Face ID" or "Touch ID" (or offer neither).
enum Biometry: Equatable {
    case none, faceID, touchID

    static func current() -> Biometry {
        let context = LAContext()
        var error: NSError?
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        switch context.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        default: return .none
        }
    }

    var name: String { self == .touchID ? "Touch ID" : "Face ID" }
    var symbol: String { self == .touchID ? "touchid" : "faceid" }
}

/// The small taps the phone gives at key moments.
@MainActor
enum Haptics {
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func error() { UINotificationFeedbackGenerator().notificationOccurred(.error) }
    static func light() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
}

/// Money in cents, written the way the website writes it ("$1,234.50").
enum Money {
    static let most = 99_999_999   // $999,999.99, the most one payment can be

    static func format(_ cents: Int) -> String {
        let value = abs(cents)
        var whole = String(value / 100)
        var grouped = ""
        while whole.count > 3 {
            grouped = "," + String(whole.suffix(3)) + grouped
            whole = String(whole.dropLast(3))
        }
        grouped = whole + grouped
        let rest = value % 100
        return (cents < 0 ? "−" : "") + "$" + grouped + "." + (rest < 10 ? "0" : "") + String(rest)
    }

    /// "12.34", the way the Virtual Terminal's subtotal box takes an amount.
    static func decimal(_ cents: Int) -> String {
        let value = max(0, cents)
        let rest = value % 100
        return String(value / 100) + "." + (rest < 10 ? "0" : "") + String(rest)
    }
}

/// Passcode rules, the same as the Employees page and the server: 4 digits, not one digit four times, not a run up or down.
enum Passcode {
    static let rule = "The passcode must be 4 digits with no sequence or repeat."

    static func problem(_ code: String) -> String? {
        guard code.count == 4, code.allSatisfy({ $0.isASCII && $0.isNumber }) else { return rule }
        if Set(code).count == 1 || "0123456789".contains(code) || "9876543210".contains(code) { return rule }
        return nil
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Only the digits, at most `limit` of them.
    func digits(limit: Int) -> String { String(filter { $0.isASCII && $0.isNumber }.prefix(limit)) }
}
