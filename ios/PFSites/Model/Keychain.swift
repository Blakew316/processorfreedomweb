import Foundation
import LocalAuthentication
import Security

/// This phone's own key for the account, made when the person signs in with their email and password. With it and their passcode
/// (or Face ID) the app opens again later without the password. Only the server's hash of the secret exists anywhere else.
struct DeviceKey: Codable, Equatable {
    var id: String
    var secret: String
}

/// What reading the Face ID item gave back.
enum BioRead {
    case ok(String)
    case cancelled
    case unavailable   // the item is gone, for example because the faces enrolled on the phone changed
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

    /// Reads the Face ID secret, which makes iOS show Face ID. Reading blocks while Face ID is up, so it runs off the main thread.
    static func readBio() async -> BioRead {
        await withCheckedContinuation { (continuation: CheckedContinuation<BioRead, Never>) in
            DispatchQueue.global(qos: .userInitiated).async {
                let context = LAContext()
                context.localizedReason = "Open PF Sites"
                var search = Keychain.query("bio")
                search[kSecReturnData as String] = true
                search[kSecMatchLimit as String] = kSecMatchLimitOne
                search[kSecUseAuthenticationContext as String] = context
                var out: CFTypeRef?
                let status = SecItemCopyMatching(search as CFDictionary, &out)
                let result: BioRead
                if status == errSecSuccess, let data = out as? Data, let secret = String(data: data, encoding: .utf8), !secret.isEmpty {
                    result = .ok(secret)
                } else if status == errSecUserCanceled {
                    result = .cancelled
                } else if status == errSecItemNotFound {
                    result = .unavailable
                } else {
                    result = .failed
                }
                continuation.resume(returning: result)
            }
        }
    }

    /// Forgets everything that ties this phone to an account (the "remember this device" tokens stay: they belong to the email).
    static func forgetDevice() {
        delete("device")
        delete("site")
        delete("bio")
    }
}
