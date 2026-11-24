import SwiftUI
import UIKit

/// Processor Freedom's colours. Bars keep the system Liquid Glass; the brand colour goes in content and the tint.
enum Theme {
    /// #1d4f9e, #5b8fe0 in dark mode: buttons, links, the selected tab.
    static let blue = Color("BrandBlue")
    /// The navy of the date card on Home (navy in dark mode too).
    static let navy = Color(uiColor: UIColor(hex: 0x0a1f44))
    /// Navy line art (the location flag, the tile icons), white in dark mode.
    static let ink = Color(light: UIColor(hex: 0x0a1f44), dark: .white)
    /// Error text, readable on white and on black.
    static let error = Color(light: UIColor(hex: 0xd1372f), dark: UIColor(hex: 0xff6b5f))
    /// The light blue behind the code boxes and a chosen location.
    static let lightBlue = Color(light: UIColor(hex: 0xe8f1fc), dark: UIColor(hex: 0x1d4f9e, alpha: 0.2))
    /// The light blue link on the navy date card.
    static let linkOnNavy = Color(uiColor: UIColor(hex: 0x9cc0ff))
    /// The fixed brand blue (the location flag's pennant).
    static let flagBlue = Color(uiColor: UIColor(hex: 0x1d4f9e))
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
    }
}

extension Color {
    /// A colour with its own dark-mode value.
    init(light: UIColor, dark: UIColor) {
        self.init(uiColor: UIColor { traits in traits.userInterfaceStyle == .dark ? dark : light })
    }
}

/// A font at the photos' point size that still grows and shrinks with the person's text size (Dynamic Type).
struct ScaledFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight

    init(size: CGFloat, weight: Font.Weight, relativeTo style: Font.TextStyle) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: style)
        self.weight = weight
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight))
    }
}

extension View {
    func pfFont(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> some View {
        modifier(ScaledFont(size: size, weight: weight, relativeTo: style))
    }

    /// Keeps the navigation bar full size while scrolling (iOS 27 and later; iOS 26 never shrinks it).
    @ViewBuilder
    func steadyNavigationBar() -> some View {
        if #available(iOS 27.0, *) {
            self.toolbarMinimizationBehavior(.never, for: .navigationBar)
        } else {
            self
        }
    }
}
