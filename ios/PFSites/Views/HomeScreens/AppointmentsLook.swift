import SwiftUI
import UIKit

/// The look of the Appointments day view and its two panels, measured from the owner's Clover photos (1125 x 2436 px screenshots
/// of a 375 x 812 pt iPhone, so 3 px = 1 pt; font sizes from cap heights, SF Pro's being about 0.705 of the size), with Clover's
/// green rebranded to Processor Freedom's blue and its dark green to navy.
enum AppointmentDayLook {
    /// #E3E3E3: the round buttons and the Cancel pill.
    static let grey = Color(light: UIColor(hex: 0xE3E3E3), dark: .systemGray5)
    /// #E3E3E3: the hairlines, the app's own line colour.
    static let hairline = SettingsLook.border
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
/// The numbers are the ones that put a 1.25 pt pen (1.5 pt for the chevron, the tick and the X) on the photos' own pixels.
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
            path.addRoundedRect(in: CGRect(x: 0.8, y: 2.8, width: 15.07, height: 13.07), cornerSize: CGSize(width: 1.2, height: 1.2), style: .circular)
            Self.line(&path, 0.8, 6.82, 15.87, 6.82)
            Self.line(&path, 4.82, 0.85, 4.82, 4.3)
            Self.line(&path, 11.85, 0.85, 11.85, 4.3)
        case .people:
            // The person in front, whole; the one behind on the right, only where the front one does not hide it.
            path.addEllipse(in: CGRect(x: 2.59, y: 0.83, width: 5.5, height: 5.5))
            Self.arc(&path, center: CGPoint(x: 5.34, y: 11.82), radius: 4.5, from: 180, delta: 180)
            Self.arc(&path, center: CGPoint(x: 11.32, y: 3.58), radius: 2.75, from: 237, delta: 245.5)
            Self.arc(&path, center: CGPoint(x: 11.32, y: 11.82), radius: 4.5, from: 257.7, delta: 102.1)
        case .sliders:
            // Two sliders: the left knob low, the right one high (5 pt rings, each touching the longer part of its line).
            Self.line(&path, 3.17, 0.85, 3.17, 5.8)
            path.addEllipse(in: CGRect(x: 3.17 - 2.5, y: 10.83 - 2.5, width: 5, height: 5))
            Self.line(&path, 3.17, 13.33, 3.17, 15.82)
            Self.line(&path, 11.5, 0.85, 11.5, 3.01)
            path.addEllipse(in: CGRect(x: 11.5 - 2.5, y: 5.84 - 2.5, width: 5, height: 5))
            Self.line(&path, 11.5, 10.85, 11.5, 15.82)
        case .plus:
            Self.line(&path, 5.67, 0.67, 5.67, 10.67)
            Self.line(&path, 0.67, 5.67, 10.67, 5.67)
        case .chevronDown:
            path.move(to: CGPoint(x: 0.8, y: 0.8))
            path.addLine(to: CGPoint(x: 6.67, y: 6.53))
            path.addLine(to: CGPoint(x: 12.53, y: 0.8))
        case .tick:
            // The checkbox's tick, traced from the photos' 16 pt box.
            path.move(to: CGPoint(x: 3.95, y: 9.3))
            path.addLine(to: CGPoint(x: 6.3, y: 12.1))
            path.addLine(to: CGPoint(x: 12.0, y: 5.1))
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
            // The photo's ring and marks are 1.5 pt lines; its exclamation mark is a solid shape.
            Circle()
                .strokeBorder(color, lineWidth: 1.5 * scale)
            if kind == .noShow {
                AppointmentDayStatusMarks(kind: kind)
                    .fill(color)
            } else {
                AppointmentDayStatusMarks(kind: kind)
                    .stroke(color, style: StrokeStyle(lineWidth: 1.5 * scale, lineCap: .round, lineJoin: .round))
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

/// What is drawn inside each status ring, in a 24 pt box (the ring itself is 24 pt across), traced from the photo's own pixels.
/// All are lines for a 1.5 pt pen, except the No show mark, which is filled.
struct AppointmentDayStatusMarks: Shape {
    let kind: AppointmentDayStatusIcon.Kind

    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch kind {
        case .pending:
            path.move(to: CGPoint(x: 12, y: 7.5))
            path.addLine(to: CGPoint(x: 12, y: 12))
            path.addLine(to: CGPoint(x: 18.0, y: 16.5))
        case .confirmed:
            // The photo's check turns its corner in a small curve.
            path.move(to: CGPoint(x: 6.0, y: 13.1))
            path.addArc(tangent1End: CGPoint(x: 9.3, y: 17.05), tangent2End: CGPoint(x: 18.0, y: 7.5), radius: 1.05)
            path.addLine(to: CGPoint(x: 18.0, y: 7.5))
        case .completed:
            // The check behind shows only where the one in front leaves room.
            AppointmentDayGlyph.line(&path, 6.05, 12.8, 8.2, 15.7)
            AppointmentDayGlyph.line(&path, 12.0, 12.0, 14.95, 8.3)
            path.move(to: CGPoint(x: 9.0, y: 12.75))
            path.addLine(to: CGPoint(x: 12.0, y: 16.55))
            path.addLine(to: CGPoint(x: 18.0, y: 9.0))
        case .canceled:
            AppointmentDayGlyph.line(&path, 4.0, 20.0, 20.0, 4.0)
        case .noShow:
            // A flat-ended stem that narrows from 2.1 pt to 1.5 pt, over a 2.9 pt dot.
            path.move(to: CGPoint(x: 10.95, y: 4.5))
            path.addLine(to: CGPoint(x: 13.05, y: 4.5))
            path.addLine(to: CGPoint(x: 12.74, y: 15.15))
            path.addLine(to: CGPoint(x: 11.26, y: 15.15))
            path.closeSubpath()
            path.addEllipse(in: CGRect(x: 12 - 1.45, y: 18.0 - 1.45, width: 2.9, height: 2.9))
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

/// Clover's square checkbox from the photos: 16 pt with 3 pt round corners, navy with a white tick when checked.
struct AppointmentDayCheckbox: View {
    let on: Bool
    var greyed = false

    var body: some View {
        ZStack {
            if on {
                RoundedRectangle(cornerRadius: 3, style: .circular)
                    .fill(greyed ? SettingsLook.greyed : AppointmentDayLook.navy)
                AppointmentDayGlyph(kind: .tick)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            } else {
                RoundedRectangle(cornerRadius: 3, style: .circular)
                    .strokeBorder(greyed ? SettingsLook.greyed : AppointmentDayLook.boxBorder, lineWidth: 1)
            }
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

/// The panels' close button from the photos: a navy ring (2 pt) around a thin one (1 pt, 2 pt inside it) with the X in the
/// middle (11 pt, 1.5 pt lines); 34 pt across, in a 44 pt tap area.
struct AppointmentDayCloseButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .strokeBorder(Theme.ink, lineWidth: 2)
                Circle()
                    .strokeBorder(Theme.ink, lineWidth: 1)
                    .padding(4)
                AppointmentDayGlyph(kind: .cross)
                    .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
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
/// action), and #F9F9F9 with #C4C4C4 words while one cannot be pressed yet. The words are 16 pt semibold, as in the photos (their
/// stems are 0.119 of the size, between the photos' regular 0.082 and bold 0.143).
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
            .pfFont(16, .semibold)
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
