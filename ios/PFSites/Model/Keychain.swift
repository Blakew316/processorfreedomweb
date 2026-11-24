import Foundation
import LocalAuthentication
import Security

/// This phone's own key for the account, made when the person signs in with their email and password. With it and their passcode
/// (or Face ID) the app opens again later without the password. Only the server's hash of the secret exists anywhere else.
struct DeviceKey: Codable, Equatable {
    var id: String
    var secret: String
}

/// What asking for Face ID (or Touch ID) and reading the key behind it gave back.
enum BioRead {
    case ok(String)
    case cancelled     // the person, the system or the app cancelled: nothing else happens
    case fallback      // "Enter Passcode", a face not recognised, or Face ID locked after too many tries: the passcode is used
    case unavailable   // not set up, turned off for PF Sites in Settings, or no iPhone passcode: Face ID cannot be used here now
    case changed       // the faces enrolled on the phone changed since it was turned on, so the key behind it is gone
    case failed
}

/// Secrets kept in the Keychain on this iPhone only (never synced to iCloud or restored to another phone).
enum Keychain {
    static let service = "com.processorfreedomsites.app"

    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    @discardableResult
    static func set(_ data: Data, for account: String) -> Bool {
        delete(account)
        var item = query(account)
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    static func data(_ account: String) -> Data? {
        var search = query(account)
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(search as CFDictionary, &out) == errSecSuccess else { return nil }
        return out as? Data
    }

    static func delete(_ account: String) {
        SecItemDelete(query(account) as CFDictionary)
    }

    static func string(_ account: String) -> String? {
        data(account).flatMap { String(data: $0, encoding: .utf8) }
    }

    // MARK: The device key and the business it opens

    static var device: DeviceKey? {
        data("device").flatMap { try? JSONDecoder().decode(DeviceKey.self, from: $0) }
    }

    static func saveDevice(_ key: DeviceKey) {
        if let data = try? JSONEncoder().encode(key) { set(data, for: "device") }
    }

    /// The business this phone is set up to open with the passcode (the "primary location").
    static var siteID: String? {
        guard let id = string("site"), !id.isEmpty else { return nil }
        return id
    }

    static func saveSiteID(_ id: String) { set(Data(id.utf8), for: "site") }

    // MARK: "Remember this device for 14 days", one token per email address

    static func trust(for email: String) -> String? { string("trust:\(email.lowercased())") }

    static func saveTrust(_ token: String, for email: String) { set(Data(token.utf8), for: "trust:\(email.lowercased())") }

    // MARK: Face ID

    /// Stores the Face ID secret so that only a successful Face ID (with the faces enrolled now) can read it back.
    static func saveBio(_ secret: String) -> Bool {
        delete("bio")
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, nil) else { return false }
        var item = query("bio")
        item[kSecValueData as String] = Data(secret.utf8)
        item[kSecAttrAccessControl as String] = access
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    /// Asks for Face ID, then reads the secret behind it. Each attempt uses a fresh LAContext, so an earlier answer is never reused;
    /// Face ID is asked first (its answer says exactly why it did not work), and the secret is then read with that same context,
    /// which iOS accepts without asking again. It runs off the main actor (it is not isolated to it), so nothing waits on screen.
    static func readBio(reason: String = "Open PF Sites") async -> BioRead {
        let context = LAContext()
        // The button after a face is not recognised goes back to the app's own passcode.
        context.localizedFallbackTitle = "Enter Passcode"
        var problem: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &problem) else {
            return bioOutcome(problem)
        }
        do {
            guard try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) else { return .failed }
        } catch {
            return bioOutcome(error as NSError)
        }
        var search = query("bio")
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        search[kSecUseAuthenticationContext as String] = context
        var out: CFTypeRef?
        let status = SecItemCopyMatching(search as CFDictionary, &out)
        if status == errSecSuccess, let data = out as? Data, let secret = String(data: data, encoding: .utf8), !secret.isEmpty { return .ok(secret) }
        switch status {
        case errSecUserCanceled: return .cancelled
        case errSecAuthFailed: return .fallback
        // The key only opens for the faces enrolled when it was made; when they change, iOS removes it.
        case errSecItemNotFound: return .changed
        default: return .failed
        }
    }

    /// Why Face ID did not answer yes, in the three ways the lock screen treats it.
    private static func bioOutcome(_ error: NSError?) -> BioRead {
        guard let error, error.domain == LAErrorDomain, let code = LAError.Code(rawValue: error.code) else { return .failed }
        switch code {
        case .userCancel, .systemCancel, .appCancel: return .cancelled
        case .userFallback, .authenticationFailed, .biometryLockout: return .fallback
        case .biometryNotEnrolled, .biometryNotAvailable, .passcodeNotSet: return .unavailable
        default: return .failed
        }
    }

    /// Forgets everything that ties this phone to an account (the "remember this device" tokens stay: they belong to the email).
    static func forgetDevice() {
        delete("device")
        delete("site")
        delete("bio")
    }
}
