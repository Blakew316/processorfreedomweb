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

/// A blue underlined link-style button (Apply now, Forgot passcode?, Switch User, Resend verification code). The words keep
/// their own size in the layout; the tap area reaches 12 pt further up and down, so a line of words is a finger-sized target
/// (`reach`: less where links are stacked closer than that, so their tap areas do not overlap).
struct LinkButton: View {
    let title: String
    var size: CGFloat = 18
    var underline = true
    var reach: CGFloat = 12
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .underline(underline)
                .pfFont(size)
                .foregroundStyle(Theme.blue)
                .multilineTextAlignment(.leading)
                .padding(.vertical, reach)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -reach)
    }
}
