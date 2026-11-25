import Foundation

/// Where the app talks to, and a few fixed facts about this build.
enum Config {
    static let liveURL = URL(string: "https://processorfreedomsites.com")!

    /// The live site. Debug builds can point at a local server for the simulator with the launch argument
    /// `-PFBaseURL http://localhost:8080` (the shared scheme has it, switched off).
    static let baseURL: URL = {
        #if DEBUG
        if let text = UserDefaults.standard.string(forKey: "PFBaseURL"), let url = URL(string: text), let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https", url.host != nil {
            return url
        }
        #endif
        return liveURL
    }()

    static var host: String { baseURL.host?.lowercased() ?? "" }

    /// A path on our server ("/api/me", "/app/site/x/orders") as a full address.
    static func url(_ path: String) -> URL { URL(string: path, relativeTo: baseURL)?.absoluteURL ?? baseURL }

    /// Whether an address is one of our own pages (same host and port), rather than a customer's site or anyone else's.
    static func isOwn(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return false }
        return url.host?.lowercased() == host && url.port == baseURL.port
    }

    /// The back-office page of a business: Home is /app/site/<id>, every other page /app/site/<id>/<page>.
    static func sitePath(_ siteID: String, _ tab: String) -> String {
        tab.isEmpty || tab == "start" ? "/app/site/\(siteID)" : "/app/site/\(siteID)/\(tab)"
    }

    static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0" }

    /// Which Apple push service this build's device token belongs to. It follows how the build was signed, not Debug or Release:
    /// a build installed from Xcode carries a development profile (sandbox tokens, even a Release build), TestFlight and the App
    /// Store carry no profile at all (production tokens), and an ad hoc profile says production. Telling the server the wrong one
    /// would make Apple refuse the token, and the server would then forget this phone's notifications without a word.
    static let pushEnvironment: String = {
        #if targetEnvironment(simulator)
        return "development"   // the simulator's tokens are always sandbox ones
        #else
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              // The profile is a signed file with its settings inside as a plain XML property list.
              let start = data.range(of: Data("<?xml".utf8)) ?? data.range(of: Data("<plist".utf8)),
              let end = data.range(of: Data("</plist>".utf8), options: [], in: start.lowerBound..<data.endIndex),
              let profile = try? PropertyListSerialization.propertyList(from: data.subdata(in: start.lowerBound..<end.upperBound), options: [], format: nil) as? [String: Any],
              let entitlements = profile["Entitlements"] as? [String: Any],
              let environment = entitlements["aps-environment"] as? String else { return "production" }
        return environment == "development" ? "development" : "production"
        #endif
    }()

    /// A value made safe to put after ?name= in an address.
    static func query(_ value: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+?#")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }
}

/// Names of the small things the app remembers on this phone between launches (nothing secret: secrets live in the Keychain).
enum Keys {
    static let name = "pf.name"
    static let email = "pf.email"
    /// The account last signed in on this phone (its id, which stays the same when the person changes their email).
    static let userID = "pf.userID"
    static let faceID = "pf.faceID"
    static let pushAsked = "pf.pushAsked"
    static let pushWanted = "pf.pushWanted"
    static func notesSeen(_ siteID: String) -> String { "pf.notesSeen.\(siteID)" }
    /// A business's time zone as last read (ordering.timezone), so its "today" is right from the first moment next time.
    static func zone(_ siteID: String) -> String { "pf.zone.\(siteID)" }
}
