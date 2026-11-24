import SwiftUI
import UIKit

/// The look of the Appointments day view and its two panels, measured from the owner's Clover photos (1125 x 2436 px screenshots
/// of a 375 x 812 pt iPhone, so 3 px = 1 pt; font sizes from cap heights, SF Pro's being about 0.705 of the size), with Clover's
/// green rebranded to Processor Freedom's blue and its dark green to navy.
enum AppointmentDayLook {
    /// #E3E3E3: the round buttons, the hairlines and the Cancel pill.
    static let grey = Color(light: UIColor(hex: 0xE3E3E3), dark: .systemGray5)
    static let hairline = Color(light: UIColor(hex: 0xE3E3E3), dark: .systemGray4)
    /// #F9F9F9: the grey bands of Appointment attributes.
    static let band = Color(light: UIColor(hex: 0xF9F9F9), dark: .secondarySystemBackground)
    /// Show results before the choice has changed: #F9F9F9 with #C4C4C4 words.
    static let waitingFill = Color(light: UIColor(hex: 0xF9F9F9), dark: .secondarySystemBackground)
    static let waitingText = Color(light: UIColor(hex: 0xC4C4C4), dark: .tertiaryLabel)
    /// Clover's dark green (the checkboxes, Show results) as navy; brand blue in dark mode, where navy would sink into the black.
    static let navy = Color(light: UIColor(hex: 0x0A1F44), dark: UIColor(hex: 0x1D4F9E))
    /// #727272: the border of an empty checkbox.
    static let boxBorder = Color(light: UIColor(hex: 0x727272), dark: .systemGray)
    /// #5C5C5C: the status icons.
    static let icon = Color(light: UIColor(hex: 0x5C5C5C), dark: UIColor(hex: 0xAEAEB2))
    /// #C60000: the No show icon.
    static let noShow = Color(light: UIColor(hex: 0xC60000), dark: UIColor(hex: 0xFF6B5F))
}

/// The line drawings of the day view, traced from the photos in their own boxes (in points) and scaled to the frame they get.
struct AppointmentDayGlyph: Shape {
    enum Kind {
        case calendar, people, sliders, plus, chevronDown, tick, cross

        /// The drawing's box in the photos.
        var size: CGSize {
            switch self {
            case .calendar: return CGSize(width: 16.67, height: 16.67)
            case .people: return CGSize(width: 16.67, height: 12.67)
            case .sliders: return CGSize(width: 14.67, height: 16.67)
            case .plus: return CGSize(width: 11.33, height: 11.33)
            case .chevronDown: return CGSize(width: 13.33, height: 7.33)
            case .tick: return CGSize(width: 16, height: 16)
            case .cross: return CGSize(width: 11, height: 11)
            }
        }
    }

    let kind: Kind

    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch kind {
        case .calendar:
            // A rounded box with a line under its top, and two rings standing above it.
            path.addRoundedRect(in: CGRect(x: 0.6, y: 2.6, width: 15.47, height: 13.47), cornerSize: CGSize(width: 1.6, height: 1.6))
            Self.line(&path, 0.6, 6.67, 16.07, 6.67)
            Self.line(&path, 4.67, 0.6, 4.67, 4.4)
            Self.line(&path, 12.0, 0.6, 12.0, 4.4)
        case .people:
            // The person in front, whole; the one behind on the right, only where the front one does not hide it.
            path.addEllipse(in: CGRect(x: 2.42, y: 0.58, width: 5.5, height: 5.5))
            Self.arc(&path, center: CGPoint(x: 5.17, y: 12.07), radius: 4.5, from: 180, delta: 180)
            Self.arc(&path, center: CGPoint(x: 11.84, y: 3.33), radius: 2.75, from: 209, delta: 302)
            Self.arc(&path, center: CGPoint(x: 11.17, y: 12.07), radius: 4.5, from: 250, delta: 110)
        case .sliders:
            // Two sliders: the left knob low, the right one high.
            Self.line(&path, 3.1, 0.6, 3.1, 5.8)
            path.addEllipse(in: CGRect(x: 3.1 - 2.73, y: 10.9 - 2.73, width: 5.46, height: 5.46))
            Self.line(&path, 3.1, 13.63, 3.1, 16.07)
            Self.line(&path, 11.45, 0.6, 11.45, 2.71)
            path.addEllipse(in: CGRect(x: 11.45 - 2.73, y: 5.44 - 2.73, width: 5.46, height: 5.46))
            Self.line(&path, 11.45, 10.6, 11.45, 16.07)
        case .plus:
            Self.line(&path, 5.67, 0.67, 5.67, 10.67)
            Self.line(&path, 0.67, 5.67, 10.67, 5.67)
        case .chevronDown:
            path.move(to: CGPoint(x: 0.8, y: 0.8))
            path.addLine(to: CGPoint(x: 6.67, y: 6.53))
            path.addLine(to: CGPoint(x: 12.53, y: 0.8))
        case .tick:
            path.move(to: CGPoint(x: 3.8, y: 8.9))
            path.addLine(to: CGPoint(x: 6.3, y: 11.5))
            path.addLine(to: CGPoint(x: 12.0, y: 4.8))
        case .cross:
            Self.line(&path, 0.6, 0.6, 10.4, 10.4)
            Self.line(&path, 10.4, 0.6, 0.6, 10.4)
        }
        let box = kind.size
        let fit = CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / box.width, y: rect.height / box.height)
        return path.applying(fit)
    }

    nonisolated static func line(_ path: inout Path, _ x1: CGFloat, _ y1: CGFloat, _ x2: CGFloat, _ y2: CGFloat) {
        path.move(to: CGPoint(x: x1, y: y1))
        path.addLine(to: CGPoint(x: x2, y: y2))
    }

    /// An arc from an angle (0 is to the right, 90 straight down) over `delta` degrees, as its own stroke.
    nonisolated static func arc(_ path: inout Path, center: CGPoint, radius: CGFloat, from start: Double, delta: Double) {
        let angle = start * .pi / 180
        path.move(to: CGPoint(x: center.x + radius * CGFloat(cos(angle)), y: center.y + radius * CGFloat(sin(angle))))
        path.addRelativeArc(center: center, radius: radius, startAngle: .degrees(start), delta: .degrees(delta))
    }
}

/// The status icons of the Appointment attributes photo and the website's A_ICON: a 24 pt grey ring with a clock (Pending), a
/// check (Confirmed), a double check (Completed), a slash (Canceled) or a red exclamation mark (No show); and the website's two
/// Order status icons (Open, Partially paid), which only ever show greyed.
struct AppointmentDayStatusIcon: View {
    enum Kind {
        case pending, confirmed, completed, canceled, noShow, open, partlyPaid

        init(_ status: AppointmentStatus) {
            switch status {
            case .pending: self = .pending
            case .confirmed: self = .confirmed
            case .completed: self = .completed
            case .cancelled: self = .canceled
            case .noshow: self = .noShow
            }
        }
    }

    let kind: Kind
    var size: CGFloat = 24
    var greyed = false

    var body: some View {
        let scale = size / 24
        ZStack {
            Circle()
                .strokeBorder(color, lineWidth: 1.33 * scale)
            AppointmentDayStatusMarks(kind: kind)
                .stroke(color, style: StrokeStyle(lineWidth: (kind == .noShow ? 1.9 : 1.4) * scale, lineCap: .round, lineJoin: .round))
            if kind == .noShow {
                Circle()
                    .fill(color)
                    .frame(width: 2.7 * scale, height: 2.7 * scale)
                    .offset(y: 5.6 * scale)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var color: Color {
        if greyed { return SettingsLook.greyed }
        switch kind {
        case .noShow: return AppointmentDayLook.noShow
        case .partlyPaid: return Theme.blue
        default: return AppointmentDayLook.icon
        }
    }
}

/// What is drawn inside each status ring, in a 24 pt box (the ring itself is 24 pt across).
struct AppointmentDayStatusMarks: Shape {
    let kind: AppointmentDayStatusIcon.Kind

    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch kind {
        case .pending:
            path.move(to: CGPoint(x: 12, y: 7.4))
            path.addLine(to: CGPoint(x: 12, y: 12))
            path.addLine(to: CGPoint(x: 18.1, y: 16.3))
        case .confirmed:
            path.move(to: CGPoint(x: 6.0, y: 12.9))
            path.addLine(to: CGPoint(x: 9.0, y: 16.0))
            path.addLine(to: CGPoint(x: 17.6, y: 7.5))
        case .completed:
            // The check behind shows only where the one in front leaves room.
            AppointmentDayGlyph.line(&path, 6.0, 12.5, 8.0, 15.3)
            AppointmentDayGlyph.line(&path, 11.9, 11.8, 14.6, 8.5)
            path.move(to: CGPoint(x: 8.9, y: 12.5))
            path.addLine(to: CGPoint(x: 12.0, y: 16.0))
            path.addLine(to: CGPoint(x: 17.7, y: 8.9))
        case .canceled:
            AppointmentDayGlyph.line(&path, 4.0, 20.0, 20.0, 4.0)
        case .noShow:
            AppointmentDayGlyph.line(&path, 12, 5.7, 12, 14.0)
        case .open:
            // The website's hourglass, sized to this ring.
            AppointmentDayGlyph.line(&path, 8.22, 5.7, 15.78, 5.7)
            AppointmentDayGlyph.line(&path, 8.22, 18.3, 15.78, 18.3)
            path.move(to: CGPoint(x: 8.85, y: 5.7))
            path.addCurve(to: CGPoint(x: 15.15, y: 12), control1: CGPoint(x: 8.85, y: 9.48), control2: CGPoint(x: 15.15, y: 9.48))
            path.addCurve(to: CGPoint(x: 8.85, y: 18.3), control1: CGPoint(x: 15.15, y: 14.52), control2: CGPoint(x: 8.85, y: 14.52))
        case .partlyPaid:
            // The website's dollar sign, sized to this ring.
            AppointmentDayGlyph.line(&path, 12, 4.44, 12, 19.56)
            path.move(to: CGPoint(x: 15.15, y: 7.59))
            path.addCurve(to: CGPoint(x: 8.85, y: 8.22), control1: CGPoint(x: 13.89, y: 5.7), control2: CGPoint(x: 8.85, y: 5.7))
            path.addCurve(to: CGPoint(x: 15.15, y: 12.63), control1: CGPoint(x: 8.85, y: 10.74), control2: CGPoint(x: 15.15, y: 10.11))
            path.addCurve(to: CGPoint(x: 8.85, y: 13.26), control1: CGPoint(x: 15.15, y: 15.15), control2: CGPoint(x: 10.11, y: 15.15))
        }
        return path.applying(CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / 24, y: rect.height / 24))
    }
}

/// Clover's square checkbox from the photos: 16 pt with 2.5 pt corners, navy with a white tick when checked.
struct AppointmentDayCheckbox: View {
    let on: Bool
    var greyed = false

    var body: some View {
        ZStack {
            if on {
                RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                    .fill(greyed ? SettingsLook.greyed : AppointmentDayLook.navy)
                AppointmentDayGlyph(kind: .tick)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            } else {
                RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                    .strokeBorder(greyed ? SettingsLook.greyed : AppointmentDayLook.boxBorder, lineWidth: 1)
            }
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

/// The panels' close button from the photos: an X in a thin ring, inside a thicker navy ring (34 pt across, in a 44 pt tap area).
struct AppointmentDayCloseButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .strokeBorder(Theme.ink, lineWidth: 2)
                Circle()
                    .strokeBorder(Theme.ink, lineWidth: 1.2)
                    .padding(4)
                AppointmentDayGlyph(kind: .cross)
                    .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.25, lineCap: .round))
                    .frame(width: 11, height: 11)
            }
            .frame(width: 34, height: 34)
            .frame(width: 44, height: 44)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close")
    }
}

/// The 48 pt pills at the foot of the panels and the appointment sheet: grey (Cancel), navy (Show results and the sheet's main
/// action), and #F9F9F9 with #C4C4C4 words while one cannot be pressed yet.
struct AppointmentDayPillStyle: ButtonStyle {
    enum Kind {
        case primary, soft
    }

    var kind: Kind = .primary

    func makeBody(configuration: Configuration) -> some View {
        AppointmentDayPill(kind: kind, pressed: configuration.isPressed, label: configuration.label)
    }
}

private struct AppointmentDayPill<Label: View>: View {
    let kind: AppointmentDayPillStyle.Kind
    let pressed: Bool
    let label: Label
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        label
            .pfFont(17, .medium)
            .foregroundStyle(text)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(Capsule().fill(fill))
            .contentShape(Capsule())
            .opacity(pressed ? 0.8 : 1)
    }

    private var fill: Color {
        if !isEnabled { return AppointmentDayLook.waitingFill }
        return kind == .primary ? AppointmentDayLook.navy : AppointmentDayLook.grey
    }

    private var text: Color {
        if !isEnabled { return AppointmentDayLook.waitingText }
        return kind == .primary ? .white : .primary
    }
}

/// A 1 pt #E3E3E3 line.
struct AppointmentDayHairline: View {
    var body: some View {
        AppointmentDayLook.hairline
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}
