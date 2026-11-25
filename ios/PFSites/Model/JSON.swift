import Foundation

/// A forgiving view over the server's JSON. A missing or unexpected field reads as an empty value instead of failing,
/// so a field the server adds, renames or leaves out never crashes the app.
struct JSON {
    let raw: Any?

    init(_ raw: Any?) {
        self.raw = raw is NSNull ? nil : raw
    }

    /// Parses a response body; anything that is not JSON reads as empty.
    init(data: Data) {
        if data.isEmpty {
            self.init(nil)
        } else {
            self.init(try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
        }
    }

    subscript(key: String) -> JSON { JSON((raw as? [String: Any])?[key]) }

    var exists: Bool { raw != nil }
    var isObject: Bool { raw is [String: Any] }

    var string: String {
        let value: Any = raw ?? NSNull()
        if let text = value as? String { return text }
        if let number = value as? NSNumber { return number.stringValue }
        return ""
    }

    var int: Int {
        let value: Any = raw ?? NSNull()
        if let number = value as? NSNumber { return number.intValue }
        if let text = value as? String {
            if let whole = Int(text) { return whole }
            // "12.0" reads as 12. Text that is not a number at all ("nan", "infinity") or is too large to hold ("1e30") reads as 0:
            // converting it would stop the app, every time the answer that carries it is read.
            if let number = Double(text), number.isFinite, abs(number) < 9.0e18 { return Int(number) }
        }
        return 0
    }

    var bool: Bool {
        let value: Any = raw ?? NSNull()
        if let number = value as? NSNumber { return number.boolValue }
        if let text = value as? String { return text == "true" || text == "1" }
        return false
    }

    var array: [JSON] { (raw as? [Any])?.map { JSON($0) } ?? [] }
}
