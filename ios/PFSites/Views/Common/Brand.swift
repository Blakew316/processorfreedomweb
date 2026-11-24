import SwiftUI

/// The navy PF tile (the LogoTile image, already rounded), clipped to the radius the photos show at each size.
struct LogoTile: View {
    var size: CGFloat
    var radius: CGFloat

    var body: some View {
        Image("LogoTile")
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// The tile and "Processor Freedom", where the photos show the wordmark.
struct BrandRow: View {
    var body: some View {
        HStack(spacing: 10) {
            LogoTile(size: 30, radius: 7)
            Text("Processor Freedom")
                .pfFont(19, .bold)
                .foregroundStyle(.primary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Processor Freedom")
    }
}

/// A small US flag, drawn like the website's.
struct USFlag: View {
    var body: some View {
        Canvas { context, size in
            let stripe = size.height / 13
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white))
            var row = 0
            while row <= 12 {
                context.fill(Path(CGRect(x: 0, y: CGFloat(row) * stripe, width: size.width, height: stripe)), with: .color(Color(red: 0.698, green: 0.133, blue: 0.204)))
                row += 2
            }
            context.fill(Path(CGRect(x: 0, y: 0, width: size.width * 7.6 / 19, height: stripe * 7)), with: .color(Color(red: 0.235, green: 0.231, blue: 0.431)))
        }
        .frame(width: 19, height: 13)
        .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 2, style: .continuous).strokeBorder(Color(.separator), lineWidth: 0.5))
        .accessibilityHidden(true)
    }
}

/// "By using Processor Freedom you agree to our Terms of Service and Privacy Policy.", both as links (the website's line).
struct LegalLine: View {
    var body: some View {
        Text(Self.text)
            .pfFont(13)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .lineSpacing(3)
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

/// The foot of the sign-in screens: the legal line (Log in only), then the region and Help Center.
struct AuthFooter: View {
    var showsLegal: Bool

    var body: some View {
        VStack(spacing: 0) {
            if showsLegal {
                Divider()
                LegalLine()
                    .padding(.top, 18)
                    .padding(.horizontal, 17)
                    .padding(.bottom, 22)
            }
            HStack(spacing: 28) {
                HStack(spacing: 7) {
                    USFlag()
                    Text("United States (English)")
                        .pfFont(14)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                Button {
                    UIPresenter.safari(Config.url("/contact"))
                } label: {
                    Text("Help Center")
                        .pfFont(14)
                        .foregroundStyle(Theme.blue)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.bottom, 20)
    }
}

/// A blue underlined link-style button (Apply now, Forgot passcode?, Switch User, Resend verification code). The words keep
/// their own size in the layout; the tap area reaches 12 pt further up and down, so a line of words is a finger-sized target.
struct LinkButton: View {
    let title: String
    var size: CGFloat = 18
    var underline = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .underline(underline)
                .pfFont(size)
                .foregroundStyle(Theme.blue)
                .multilineTextAlignment(.leading)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -12)
    }
}
