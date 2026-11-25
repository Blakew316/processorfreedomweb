import SwiftUI

/// The solid buttons of the sign-in screens and the Sale screen (the photos use solid buttons, not glass).
struct SolidButtonStyle: ButtonStyle {
    var fill: Color = Theme.blue
    var text: Color = .white
    var radius: CGFloat = 8
    var height: CGFloat = 48
    var size: CGFloat = 18

    func makeBody(configuration: Configuration) -> some View {
        // A pill (corners half the height) ends in exact half circles, as the photos' pills do; the smoothed corner keeps the
        // top and bottom edges flat for longer and makes its shoulders squarer.
        let corner: RoundedCornerStyle = radius * 2 >= height ? .circular : .continuous
        return configuration.label
            .pfFont(size, .semibold)
            .foregroundStyle(text)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(RoundedRectangle(cornerRadius: radius, style: corner).fill(fill))
            .contentShape(RoundedRectangle(cornerRadius: radius, style: corner))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// A boxed text field: grey border, and while typing in it a thicker one in the navy (white in dark mode) that stands for
/// Clover's dark green focus ring, as in the owner's photos.
struct BoxField<Content: View>: View {
    var focused: Bool
    var height: CGFloat = 49
    @ViewBuilder var content: Content

    var body: some View {
        content
            .pfFont(17)
            .padding(.horizontal, 16)
            .frame(minHeight: height)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color(.systemBackground)))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(focused ? Theme.ink : Color(.systemGray3), lineWidth: focused ? 2 : 1))
    }
}

/// The grey search field of the location list and the Sale screen.
struct FilledSearchField: View {
    let placeholder: String
    @Binding var text: String
    var height: CGFloat = 49
    var radius: CGFloat = 8
    var size: CGFloat = 17

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 19))
                .foregroundStyle(.primary)
                .accessibilityHidden(true)
            TextField(placeholder, text: $text)
                .pfFont(size)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !text.isEmpty {
                // The small grey X keeps its size; the tap area around it is finger-sized.
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        .padding(12)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(-12)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: height)
        .background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color(.systemGray6)))
    }
}

/// The side-to-side shake of the passcode dots after a wrong code.
struct Shake: GeometryEffect {
    var amount: CGFloat

    var animatableData: CGFloat {
        get { amount }
        set { amount = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 10 * sin(amount * .pi * 6), y: 0))
    }
}
