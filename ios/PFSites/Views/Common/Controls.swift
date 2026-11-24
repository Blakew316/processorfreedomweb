import SwiftUI

/// The solid buttons of the sign-in screens and the Sale screen (the photos use solid buttons, not glass).
struct SolidButtonStyle: ButtonStyle {
    var fill: Color = Theme.blue
    var text: Color = .white
    var radius: CGFloat = 8
    var height: CGFloat = 48
    var size: CGFloat = 18

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .pfFont(size, .semibold)
            .foregroundStyle(text)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill))
            .contentShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// A boxed text field like the website's log in form: grey border, blue and thicker while typing in it.
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
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(focused ? Theme.blue : Color(.systemGray3), lineWidth: focused ? 2 : 1))
    }
}

/// A square checkbox with its label; the whole row toggles it.
struct CheckRow: View {
    @Binding var on: Bool
    let label: String

    var body: some View {
        Button {
            on.toggle()
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(on ? Theme.blue : Color.clear)
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .strokeBorder(on ? Theme.blue : Color(.systemGray2), lineWidth: 1.5)
                    if on {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 20, height: 20)
                Text(label)
                    .pfFont(18)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(on ? "Checked" : "Not checked")
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
                .padding(-12)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: height)
        .background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color(.systemGray6)))
    }
}

/// The bordered search field of the Settings screens.
struct BorderedSearchField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 20))
                .foregroundStyle(.primary)
                .accessibilityHidden(true)
            TextField(placeholder, text: $text)
                .pfFont(19)
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
                .padding(-12)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(.systemGray), lineWidth: 1))
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
