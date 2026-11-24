import SwiftUI
import UIKit

/// How the app looks on this iPhone (Settings → App security and privacy → Appearance): the iPhone's own light or dark setting, or
/// always light, or always dark.
enum AppearanceChoice: String, CaseIterable, Identifiable {
    case system, light, dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: return "Match this iPhone"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    var style: UIUserInterfaceStyle {
        switch self {
        case .system: return .unspecified
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// The choice is this phone's own, kept on the phone. Every window of the app follows it, so the native screens, the lock and
/// privacy windows and the website's pages inside the app (they follow their window's light or dark) all change together.
@MainActor
enum Appearance {
    private static let key = "pf.appearance"

    static var choice: AppearanceChoice {
        AppearanceChoice(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .system
    }

    static func set(_ choice: AppearanceChoice) {
        UserDefaults.standard.set(choice.rawValue, forKey: key)
        applyToAllWindows()
    }

    /// Gives one window the chosen look; the lock, privacy and idle windows call this as they are made.
    static func apply(to window: UIWindow) {
        window.overrideUserInterfaceStyle = choice.style
    }

    static func applyToAllWindows() {
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            for window in windowScene.windows {
                apply(to: window)
            }
        }
    }
}
