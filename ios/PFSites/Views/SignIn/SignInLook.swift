import SwiftUI
import UIKit

/// The look of the sign-in screens (Welcome, Log in, Two-step, the location list and the passcode screen), measured from the
/// owner's Clover Go photos (1125 x 2436 px screenshots of a 375 x 812 pt iPhone, so 3 px = 1 pt; font sizes from the cap heights,
/// SF Pro's cap height being about 0.705 of its size), with Clover's greens rebranded to Processor Freedom's blue and navy.
enum SignInLook {
    /// #253338, the slate of Clover's text on these screens (the system's label colour in dark mode).
    static let text = Color(light: UIColor(hex: 0x253338), dark: .label)
    /// #344146, the slate of the two-step title.
    static let title = Color(light: UIColor(hex: 0x344146), dark: .label)
    /// #727272, the legal line under Log in.
    static let legal = Color(light: UIColor(hex: 0x727272), dark: .secondaryLabel)
    /// #5C5C5C, the second line of a location, the "OPEN" band and the search prompt.
    static let muted = Color(light: UIColor(hex: 0x5C5C5C), dark: .secondaryLabel)
    /// #868686, the 1 pt border of the email and password fields.
    static let fieldBorder = Color(light: UIColor(hex: 0x868686), dark: .systemGray)
    /// #727272, the 1 pt border of the code boxes and the checkbox.
    static let boxBorder = Color(light: UIColor(hex: 0x727272), dark: .systemGray)
    /// #EEEEEE, the location search field.
    static let searchFill = Color(light: UIColor(hex: 0xEEEEEE), dark: .tertiarySystemFill)
    /// Clover's dark green Log in button with its light green words, rebranded: navy with light blue words (blue in dark mode,
    /// where navy would sink into the black).
    static let navyButton = Color(light: UIColor(hex: 0x0A1F44), dark: UIColor(hex: 0x1D4F9E))
    static let navyButtonText = Color(light: UIColor(hex: 0xE8F1FC), dark: .white)
    /// The two-step Log in button before six digits are in: #F9F9F9 with #C4C4C4 words.
    static let waitingFill = Color(light: UIColor(hex: 0xF9F9F9), dark: .secondarySystemBackground)
    static let waitingText = Color(light: UIColor(hex: 0xC4C4C4), dark: .tertiaryLabel)
    /// #E3E3E3, the Cancel button.
    static let cancelFill = Color(light: UIColor(hex: 0xE3E3E3), dark: .systemGray5)
}

/// The footer of Log in and Two-step: a round US flag and "United States (English)" (plain words, not a link: it is the only
/// choice), then Help Center (the website's contact page) 44 pt further on. Both 12.3 pt (an 8.7 pt cap height in the photos).
struct SignInRegionRow: View {
    var body: some View {
        HStack(spacing: 44) {
            HStack(spacing: 10) {
                RoundUSFlag()
                Text("United States (English)")
                    .pfFont(12.3)
                    .foregroundStyle(SignInLook.legal)
            }
            .accessibilityElement(children: .combine)
            Button {
                UIPresenter.safari(Config.url("/contact"))
            } label: {
                Text("Help Center")
                    .pfFont(12.3)
                    .foregroundStyle(Theme.blue)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
    }
}

/// "By using Processor Freedom you agree to our Terms of Service and Privacy Policy.", the website's line, both as links,
/// at the size and colour of the legal line in the photo (12.3 pt, #727272, two lines 20 pt apart).
struct SignInLegalLine: View {
    var body: some View {
        Text(Self.text)
            .pfFont(12.3)
            .foregroundStyle(SignInLook.legal)
            .multilineTextAlignment(.center)
            .lineSpacing(5.3)
            .frame(maxWidth: .infinity)
            .tint(Theme.blue)
            .environment(\.openURL, OpenURLAction { url in
                Task { @MainActor in UIPresenter.safari(url) }
                return .handled
            })
    }

    private static var text: AttributedString {
        var line = AttributedString("By using Processor Freedom you agree to our ")
        var terms = AttributedString("Terms of Service")
        terms.link = Config.url("/terms")
        // Named in full: with UIKit imported too, `underlineStyle` could be SwiftUI's or UIKit's.
        terms[AttributeScopes.SwiftUIAttributes.UnderlineStyleAttribute.self] = .single
        var privacy = AttributedString("Privacy Policy")
        privacy.link = Config.url("/privacy")
        privacy[AttributeScopes.SwiftUIAttributes.UnderlineStyleAttribute.self] = .single
        line.append(terms)
        line.append(AttributedString(" and "))
        line.append(privacy)
        line.append(AttributedString("."))
        return line
    }
}

/// A small round US flag, like the photo's: red and white stripes with the blue corner, in a 13 pt circle.
struct RoundUSFlag: View {
    var body: some View {
        Canvas { context, size in
            let stripe = size.height / 13
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white))
            var row = 0
            while row <= 12 {
                context.fill(Path(CGRect(x: 0, y: CGFloat(row) * stripe, width: size.width, height: stripe)), with: .color(Color(red: 0.847, green: 0.0, blue: 0.153)))
                row += 2
            }
            context.fill(Path(CGRect(x: 0, y: 0, width: size.width * 0.5, height: stripe * 7)), with: .color(Color(red: 0.0, green: 0.322, blue: 0.706)))
        }
        .frame(width: 13, height: 13)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color(.separator), lineWidth: 0.5))
        .accessibilityHidden(true)
    }
}

/// The pill buttons of Log in and Two-step: 48 pt tall, fully rounded, 16.5 pt semibold.
struct SignInPillStyle: ButtonStyle {
    var fill: Color
    var text: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .pfFont(16.5, .semibold)
            .foregroundStyle(text)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(Capsule().fill(fill))
            .contentShape(Capsule())
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// A boxed text field like the photo's: 48 pt tall, 12 pt corners, a 1 pt grey border that turns blue while typing in it.
struct SignInField<Content: View>: View {
    var focused: Bool
    @ViewBuilder var content: Content

    var body: some View {
        content
            .pfFont(16.5)
            .foregroundStyle(Color.primary)
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(.systemBackground)))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(focused ? Theme.blue : SignInLook.fieldBorder, lineWidth: focused ? 2 : 1))
    }
}

/// The tile and "Processor Freedom", where the photos show Clover's wordmark: a 21 pt tile and the name in 18 pt bold.
struct SignInBrandRow: View {
    var body: some View {
        HStack(spacing: 7) {
            LogoTile(size: 21, radius: 5)
            Text("Processor Freedom")
                .pfFont(18, .bold)
                .foregroundStyle(.primary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Processor Freedom")
    }
}

/// The bold "Login" in the middle of the system navigation bar of Log in and Two-step (19 pt in the photo).
struct SignInBarTitle: ToolbarContent {
    var body: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            Text("Login")
                .pfFont(19, .bold)
                .accessibilityAddTraits(.isHeader)
        }
    }
}
