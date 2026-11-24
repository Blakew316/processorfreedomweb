import SwiftUI
import UIKit

/// The look of Create appointment, measured from the owner's Clover photos (1125 x 2436 px screenshots of a 375 x 812 pt iPhone,
/// so 3 px = 1 pt; font sizes from cap heights, SF Pro's being about 0.705 of the size), with Clover's green rebranded to
/// Processor Freedom's blue and its dark green to navy. The grey page, the white cards and their #E3E3E3 border are SettingsLook's.
enum CreateAppointmentLook {
    /// #868686: the 1 pt border of the fields and of the search pill.
    static let field = Color(light: UIColor(hex: 0x868686), dark: .systemGray)
    /// #C4C4C4: the lines across Appointment details.
    static let hairline = Color(light: UIColor(hex: 0xC4C4C4), dark: .systemGray4)
    /// #696969: placeholders and the notes counter.
    static let placeholder = Color(light: UIColor(hex: 0x696969), dark: .secondaryLabel)
    /// #727272: the magnifier, calendar and clock drawings.
    static let icon = Color(light: UIColor(hex: 0x727272), dark: .systemGray)
    /// #F9F9F9: the box behind the calendar drawing.
    static let iconBox = Color(light: UIColor(hex: 0xF9F9F9), dark: .tertiarySystemBackground)
    /// #E3E3E3: the grey pills (Add another service, Add inventory item, Cancel) and the quantity buttons.
    static let pill = Color(light: UIColor(hex: 0xE3E3E3), dark: .systemGray5)
    /// Save while the form is not ready: #F9F9F9 with #C4C4C4 words.
    static let waitingFill = Color(light: UIColor(hex: 0xF9F9F9), dark: .secondarySystemBackground)
    static let waitingText = Color(light: UIColor(hex: 0xC4C4C4), dark: .tertiaryLabel)
    /// Clover's dark green Save, as navy (brand blue in dark mode, where navy would sink into the black).
    static let navy = Color(light: UIColor(hex: 0x0A1F44), dark: UIColor(hex: 0x1D4F9E))
    /// #BE2E31: the order discount and Remove service.
    static let red = Color(light: UIColor(hex: 0xBE2E31), dark: UIColor(hex: 0xFF6B5F))
}

// MARK: - Drawings (traced from the photos in their own boxes, in points, and scaled to the frame they get)

/// The chevron of the cards and the drop-downs: a 13.33 x 7.33 pt box, pointing down (turned over, it points up).
struct CreateAppointmentChevron: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0.8, y: 0.8))
        path.addLine(to: CGPoint(x: 6.67, y: 6.53))
        path.addLine(to: CGPoint(x: 12.53, y: 0.8))
        return path.applying(CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / 13.33, y: rect.height / 7.33))
    }
}

/// The search field's magnifier: a ring with its handle to the lower right, in a 17.5 pt box.
struct CreateAppointmentMagnifier: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addEllipse(in: CGRect(x: 0.75, y: 0.75, width: 12.9, height: 12.9))
        path.move(to: CGPoint(x: 11.76, y: 11.76))
        path.addLine(to: CGPoint(x: 16.75, y: 16.75))
        return path.applying(CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / 17.5, y: rect.height / 17.5))
    }
}

/// The date field's calendar: a rounded box with a line under its top and two rings standing above it, in a 20 pt box.
struct CreateAppointmentCalendarGlyph: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addRoundedRect(in: CGRect(x: 0.83, y: 3.5, width: 18.17, height: 15.33), cornerSize: CGSize(width: 2.2, height: 2.2))
        path.move(to: CGPoint(x: 0.83, y: 8))
        path.addLine(to: CGPoint(x: 19, y: 8))
        path.move(to: CGPoint(x: 5.83, y: 1))
        path.addLine(to: CGPoint(x: 5.83, y: 4.85))
        path.move(to: CGPoint(x: 14.17, y: 1))
        path.addLine(to: CGPoint(x: 14.17, y: 4.85))
        return path.applying(CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / 20, y: rect.height / 20))
    }
}

/// The time field's clock: a ring with a hand up to twelve and one down towards four, in a 19 pt box.
struct CreateAppointmentClockGlyph: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addEllipse(in: CGRect(x: 0.83, y: 0.83, width: 17.34, height: 17.34))
        path.move(to: CGPoint(x: 9.5, y: 5.6))
        path.addLine(to: CGPoint(x: 9.5, y: 9.5))
        path.addLine(to: CGPoint(x: 13.9, y: 13.4))
        return path.applying(CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / 19, y: rect.height / 19))
    }
}

/// Add custom item's plus in a ring, in a 19.33 pt box.
struct CreateAppointmentPlusRing: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addEllipse(in: CGRect(x: 0.75, y: 0.75, width: 17.83, height: 17.83))
        path.move(to: CGPoint(x: 5.33, y: 9.67))
        path.addLine(to: CGPoint(x: 14, y: 9.67))
        path.move(to: CGPoint(x: 9.67, y: 5.33))
        path.addLine(to: CGPoint(x: 9.67, y: 14))
        return path.applying(CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / 19.33, y: rect.height / 19.33))
    }
}

// MARK: - Cards, labels and fields

/// A white card of the form (1 pt #E3E3E3 border, 20 pt corners, 17 pt inside), with its title (18 pt bold) and a chevron that
/// opens and closes it; the whole title row is the button. Closed it is the photos' 76 pt. `gap` is the space the photo has
/// between the title and the first line under it, and `bottom` the space under the last line.
struct CreateAppointmentCard<Content: View>: View {
    let title: String
    let open: Bool
    var gap: CGFloat = 40
    var bottom: CGFloat = 15
    let toggle: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: toggle) {
                HStack(alignment: .center, spacing: 12) {
                    Text(title)
                        .pfFont(18, .bold, relativeTo: .title3)
                        .foregroundStyle(Color.primary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    // In the photos the chevron sits 1.7 pt above the middle of the title's capitals, 17 pt in from the card's text.
                    CreateAppointmentChevron()
                        .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                        .frame(width: 13.33, height: 7.33)
                        .rotationEffect(.degrees(open ? 180 : 0))
                        .offset(y: -1.67)
                        .padding(.trailing, 17.33)
                        .accessibilityHidden(true)
                }
                .padding(.top, 28)
                .padding(.bottom, open ? 12 : 26.5)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(title)
            .accessibilityValue(open ? "Expanded" : "Collapsed")
            .accessibilityAddTraits(.isHeader)
            if open {
                content()
                    .padding(.top, max(0, gap - 12))
                    .padding(.bottom, bottom)
            }
        }
        .padding(.horizontal, 17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(SettingsLook.border, lineWidth: 1)
        }
    }
}

/// A field's name above it (14 pt).
struct CreateAppointmentLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .pfFont(14)
            .foregroundStyle(Color.primary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityHidden(true)
    }
}

/// A 1 pt #C4C4C4 line across Appointment details.
struct CreateAppointmentRule: View {
    var body: some View {
        CreateAppointmentLook.hairline
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

/// The 48 pt box of a field: white, 1 pt #868686 border and 10 pt corners; blue and thicker while typing in it.
struct CreateAppointmentFieldBox: ViewModifier {
    var focused = false

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(focused ? Theme.blue : CreateAppointmentLook.field, lineWidth: focused ? 2 : 1)
            }
    }
}

/// What a drop-down shows: its value (16 pt, 14 pt in) and the chevron 18 pt from the right, in the field box.
struct CreateAppointmentDropdownLabel: View {
    let value: String
    var placeholder = false

    var body: some View {
        HStack(spacing: 8) {
            Text(value)
                .pfFont(16)
                .foregroundStyle(placeholder ? CreateAppointmentLook.placeholder : Color.primary)
                .lineLimit(1)
            Spacer(minLength: 8)
            CreateAppointmentChevron()
                .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                .frame(width: 13.33, height: 7.33)
                .accessibilityHidden(true)
        }
        .padding(.leading, 14)
        .padding(.trailing, 18.33)
        .modifier(CreateAppointmentFieldBox())
        .contentShape(Rectangle())
    }
}

/// The 48 pt capsules: grey with black words (Cancel, Add another service, Add inventory item), navy with white words (Save),
/// and #F9F9F9 with #C4C4C4 words while one cannot be pressed yet. The words are 16 pt semibold, as in the photos. The grey
/// pills inside the form fit their words (17.5 pt each side); the bar's fill its width.
struct CreateAppointmentPillStyle: ButtonStyle {
    enum Kind {
        case primary, soft
    }

    var kind: Kind = .soft
    var fullWidth = true

    func makeBody(configuration: Configuration) -> some View {
        CreateAppointmentPill(kind: kind, fullWidth: fullWidth, pressed: configuration.isPressed, label: configuration.label)
    }
}

private struct CreateAppointmentPill<Label: View>: View {
    let kind: CreateAppointmentPillStyle.Kind
    let fullWidth: Bool
    let pressed: Bool
    let label: Label
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        label
            .pfFont(16, .semibold)
            .foregroundStyle(text)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, fullWidth ? 16 : 17.5)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 48)
            .background(Capsule().fill(fill))
            .contentShape(Capsule())
            .opacity(pressed ? 0.8 : 1)
    }

    private var fill: Color {
        if !isEnabled { return CreateAppointmentLook.waitingFill }
        return kind == .primary ? CreateAppointmentLook.navy : CreateAppointmentLook.pill
    }

    private var text: Color {
        if !isEnabled { return CreateAppointmentLook.waitingText }
        return kind == .primary ? .white : .primary
    }
}

/// An underlined blue link (16 pt) whose tap area reaches 10 pt above and below the words without moving them.
struct CreateAppointmentLink: View {
    let title: String
    var underlined = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .underline(underlined)
                .pfFont(16)
                .foregroundStyle(Theme.blue)
                .multilineTextAlignment(.trailing)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -10)
    }
}
