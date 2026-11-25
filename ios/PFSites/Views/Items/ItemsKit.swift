import SwiftUI
import UIKit

/// The look of Items and services, measured from the owner's Clover photos (1125 x 2436 px screenshots of a 375 x 812 pt phone,
/// so 3 px = 1 pt), with Clover's greens rebranded to Processor Freedom's blue.
enum ItemsLook {
    /// #F9F9F9 behind everything below the bar.
    static let page = SettingsLook.page
    static let card = SettingsLook.card
    /// #2B2B2B: card titles and their fold chevrons.
    static let title = Color(light: UIColor(hex: 0x2B2B2B), dark: .label)
    /// #5C5C5C: card descriptions, grey headings and labels.
    static let grey = Color(light: UIColor(hex: 0x5C5C5C), dark: UIColor(hex: 0xAEAEB2))
    /// #4D4D4D: the notes under radio buttons and checkboxes, and checkbox borders (the app's muted text).
    static let soft = SettingsLook.muted
    /// #727272: the grey lines of a list row and its checkboxes.
    static let rowGrey = Color(light: UIColor(hex: 0x727272), dark: .secondaryLabel)
    /// Hairlines and card borders: the app's own (#E3E3E3; the photos' #E5E5E5 is two steps from it).
    static let line = SettingsLook.border
    /// The white line under each list hairline (nothing in dark mode).
    static let lineLight = Color(light: .white, dark: .clear)
    /// #E3E3E3: round buttons, grey pills, the Menus card and its table.
    static let control = Color(light: UIColor(hex: 0xE3E3E3), dark: UIColor(hex: 0x3A3A3C))
    /// #C4C4C4: the darker Cancel pill of Select, and a switch that is off.
    static let controlDark = Color(light: UIColor(hex: 0xC4C4C4), dark: UIColor(hex: 0x545458))
    /// #868686: field borders.
    static let field = Color(light: UIColor(hex: 0x868686), dark: UIColor(hex: 0x636366))
    /// The light blue of a "+" or the words on a brand-blue button (Clover's light green, rebranded).
    static let onBrand = Color(light: UIColor(hex: 0xE8F1FC), dark: .white)
    /// #FBFBFB inside the photo box.
    static let imageFill = Color(light: UIColor(hex: 0xFBFBFB), dark: UIColor(hex: 0x1C1C1E))
    /// Words in a field before anything is typed.
    static let placeholder = Color(.placeholderText)
    /// Things Processor Freedom does not do: shown, greyed, and not tappable.
    static let greyed = SettingsLook.greyed
    /// #E7E7E7: the fainter grey of a greyed field's placeholder ("$0.00" in the photo).
    static let greyedFaint = Color(light: UIColor(hex: 0xE7E7E7), dark: .quaternaryLabel)
    /// A checked box: Clover's dark green, so navy (brand blue in dark mode, where navy would sink into the black), as on
    /// Appointments.
    static let checked = Color(light: UIColor(hex: 0x0A1F44), dark: UIColor(hex: 0x1D4F9E))
    /// A chosen radio button and the rings of a panel's X: Clover's dark green lines, so navy (white in dark mode), as on the
    /// Items sales report.
    static let chosen = Theme.ink
    /// #696969: "Search items" before anything is typed.
    static let searchHint = Color(light: UIColor(hex: 0x696969), dark: .secondaryLabel)
    /// The knob of a greyed switch: white, and dimmer in dark mode so it does not look like one that can be turned on.
    static let greyedKnob = Color(light: .white, dark: UIColor(hex: 0x8E8E93))
    /// Where a radio button's label starts, from the card's edge: the radio's own 4 pt indent, the 16 pt radio and the 12.3 pt gap.
    static let radioLabelInset: CGFloat = 32.3
}

// MARK: - Lines

/// A 1 pt hairline.
struct ItemsHairline: View {
    var color: Color = ItemsLook.line

    var body: some View {
        Rectangle()
            .fill(color)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

/// The list's separator: a grey line with a white one under it, as in the photos.
struct ItemsListLine: View {
    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(ItemsLook.line).frame(height: 1)
            Rectangle().fill(ItemsLook.lineLight).frame(height: 1)
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Buttons

/// The photos' round grey buttons (50 x 48 pt) and the brand-blue "+": a filled capsule around the icon.
struct ItemsCapsuleStyle: ButtonStyle {
    var fill: Color = ItemsLook.control
    var width: CGFloat? = 50
    var height: CGFloat = 48
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: width, height: height)
            .background(isEnabled ? fill : ItemsLook.control, in: Capsule())
            .contentShape(Capsule())
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

/// A pill with words: grey (Select, Cancel, Reset filters), darker grey (Cancel while selecting) or brand blue (Show results, Save).
struct ItemsPillStyle: ButtonStyle {
    enum Kind {
        case grey, darkGrey, brand, plain
    }

    var kind: Kind = .grey
    var width: CGFloat? = nil
    var height: CGFloat = 48
    /// 16 pt, as the photos' "Select" and "Cancel" are.
    var size: CGFloat = 16
    var weight: Font.Weight = .regular
    /// What a brand-blue pill shows behind its greyed words while it cannot be used (nothing for Save, as in the photos).
    var disabledFill: Color = .clear
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .pfFont(size, weight)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(text)
            .padding(.horizontal, width == nil ? 18 : 6)
            .frame(width: width)
            .frame(minHeight: height)
            .background(fill, in: Capsule())
            .contentShape(Capsule())
            .opacity(configuration.isPressed ? 0.75 : 1)
    }

    private var text: Color {
        guard isEnabled else { return ItemsLook.greyed }
        return kind == .brand ? ItemsLook.onBrand : Color.primary
    }

    private var fill: Color {
        switch kind {
        case .grey: return ItemsLook.control
        case .darkGrey: return ItemsLook.controlDark
        case .brand: return isEnabled ? Theme.blue : disabledFill
        case .plain: return Color.clear
        }
    }
}

/// The "+" of the brand-blue round buttons: 14 pt across with 1.5 pt lines, as in the photos.
struct ItemsPlus: View {
    var color: Color = ItemsLook.onBrand

    var body: some View {
        Image(systemName: "plus")
            .font(.system(size: 17.4, weight: .regular))
            .foregroundStyle(color)
    }
}

/// The three dots of a ⋮ button (4 pt dots, 7 pt apart).
struct ItemsDots: View {
    var color: Color = .primary

    var body: some View {
        VStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { _ in
                Circle().fill(color).frame(width: 4, height: 4)
            }
        }
        .accessibilityHidden(true)
    }
}

/// The two sliders of the Filters button, drawn as in the photo: one knob low on the left, one high on the right.
struct ItemsSlidersIcon: View {
    var color: Color = .primary

    var body: some View {
        Canvas { context, _ in
            var lines = Path()
            lines.move(to: CGPoint(x: 3.7, y: 0.75))
            lines.addLine(to: CGPoint(x: 3.7, y: 9.4))
            lines.move(to: CGPoint(x: 3.7, y: 16))
            lines.addLine(to: CGPoint(x: 3.7, y: 18.25))
            lines.move(to: CGPoint(x: 14.3, y: 0.75))
            lines.addLine(to: CGPoint(x: 14.3, y: 2.7))
            lines.move(to: CGPoint(x: 14.3, y: 9.3))
            lines.addLine(to: CGPoint(x: 14.3, y: 18.25))
            let style = StrokeStyle(lineWidth: 1.5, lineCap: .round)
            context.stroke(lines, with: .color(color), style: style)
            context.stroke(Path(ellipseIn: CGRect(x: 0.6, y: 9.6, width: 6.2, height: 6.2)), with: .color(color), style: style)
            context.stroke(Path(ellipseIn: CGRect(x: 11.2, y: 2.9, width: 6.2, height: 6.2)), with: .color(color), style: style)
        }
        .frame(width: 18, height: 19)
        .accessibilityHidden(true)
    }
}

/// The round grey ⋮ button (48 pt) that opens a menu.
struct ItemsKebab<Items: View>: View {
    var label = "More actions"
    var disabled = false
    @ViewBuilder let items: () -> Items

    var body: some View {
        Menu {
            items()
        } label: {
            ItemsDots(color: disabled ? ItemsLook.greyed : .primary)
                .frame(width: 48, height: 48)
                .background(ItemsLook.control, in: Circle())
                .contentShape(Circle())
        }
        .disabled(disabled)
        .accessibilityLabel(label)
    }
}

/// A button drawn exactly as its label, a little lighter while pressed. (The plain style also fades a button that cannot be
/// used, which made greyed things fainter than the greyed things around them.)
struct ItemsBareStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

/// The X of a panel or a sheet, as in the photo of "Filter item results" and on Appointments: a navy ring (2 pt) around a thin
/// one (1 pt, 2 pt inside it) with the X in the middle (12 pt, 1.6 pt lines). 34 pt across, in a 44 pt tap area that takes no
/// more room than the ring.
struct ItemsCloseButton: View {
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .strokeBorder(ring, lineWidth: 2)
                Circle()
                    .strokeBorder(ring, lineWidth: 1)
                    .padding(4)
                ItemsCross()
                    .stroke(disabled ? ItemsLook.greyed : Color.primary, style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
                    .frame(width: 10.4, height: 10.4)
            }
            .frame(width: 34, height: 34)
            .frame(width: 44, height: 44)
            .contentShape(Circle())
        }
        .buttonStyle(ItemsBareStyle())
        .disabled(disabled)
        .padding(-5)
        .accessibilityLabel("Close")
    }

    private var ring: Color { disabled ? ItemsLook.greyed : ItemsLook.chosen }
}

private struct ItemsCross: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        return path
    }
}

// MARK: - Checkboxes, radios and switches

/// A 16 pt square checkbox: white with a grey border, navy with a white tick when checked, light grey when greyed.
struct ItemsCheckbox: View {
    let on: Bool
    var greyed = false
    var border: Color = ItemsLook.rowGrey

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(greyed ? ItemsLook.control : (on ? ItemsLook.checked : ItemsLook.card))
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .strokeBorder(greyed ? ItemsLook.greyed : (on ? ItemsLook.checked : border), lineWidth: 1.33)
            if on {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(greyed ? ItemsLook.greyed : Color.white)
            }
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

/// A 16 pt radio button: a grey ring, or a navy ring with a 6 pt dot when chosen.
struct ItemsRadio: View {
    let on: Bool
    var greyed = false

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(greyed ? ItemsLook.greyed : (on ? ItemsLook.chosen : ItemsLook.soft), lineWidth: 1.2)
            if on {
                Circle()
                    .fill(greyed ? ItemsLook.greyed : ItemsLook.chosen)
                    .frame(width: 6, height: 6)
            }
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

/// The photos' switch (40 x 24 pt): a brand-blue track with a white 20 pt knob holding a tick when on, grey when off, pale when
/// greyed. The knob slides across when it is turned on or off.
struct ItemsSwitchMark: View {
    let on: Bool
    var greyed = false

    var body: some View {
        ZStack(alignment: on ? .trailing : .leading) {
            Capsule()
                .fill(track)
            Circle()
                .fill(greyed ? ItemsLook.greyedKnob : Color.white)
                .frame(width: 20, height: 20)
                .overlay {
                    if on {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(greyed ? ItemsLook.greyed : Theme.blue)
                    }
                }
                .padding(2)
        }
        .frame(width: 40, height: 24)
        .animation(.snappy(duration: 0.2), value: on)
        .accessibilityHidden(true)
    }

    private var track: Color {
        if greyed { return ItemsLook.control }
        return on ? Theme.blue : ItemsLook.controlDark
    }
}

/// A switch with its label ("Show on POS", "Available", "Charge sales tax"); greyed ones say "Not available yet" and do nothing.
/// `inset` is how far in from the card's edge the photo has the switch (2 pt for "Show on POS"); the label stays where it is.
struct ItemsSwitchRow: View {
    let label: String
    @Binding var on: Bool
    var greyed = false
    var dotted = false
    var size: CGFloat = 16
    var inset: CGFloat = 0

    var body: some View {
        if greyed {
            // Drawn as it is, never as a button that cannot be pressed: that would fade it more than the greyed things around it.
            row
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .accessibilityValue("Not available yet")
        } else {
            Button {
                on.toggle()
            } label: {
                // A taller place to tap than the switch itself, without moving anything.
                row
                    .padding(.vertical, 9)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.vertical, -9)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityValue(on ? "On" : "Off")
            .accessibilityAddTraits([.isButton, .isToggle])
            .accessibilityAction { on.toggle() }
        }
    }

    private var row: some View {
        HStack(spacing: (dotted ? 12.7 : 13) - inset) {
            ItemsSwitchMark(on: on, greyed: greyed)
            Text(label)
                .pfFont(size)
                .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .modifier(ItemsDotted(show: dotted, color: greyed ? ItemsLook.greyed : Color.primary))
            Spacer(minLength: 0)
        }
        .padding(.leading, inset)
    }
}

/// A checkbox with its label and grey note (the age-restricted and non-revenue rows).
struct ItemsCheckRow: View {
    let label: String
    var note: String? = nil
    let on: Bool
    var greyed = false
    var bold = true
    var dotted = false
    var gap: CGFloat = 12
    var action: (() -> Void)? = nil

    var body: some View {
        Group {
            if let action, !greyed {
                Button(action: action) { row }
                    .buttonStyle(.plain)
            } else {
                row
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue(greyed ? "Not available yet" : (on ? "Checked" : "Not checked"))
    }

    private var row: some View {
        // The box's top is 14 pt above the label's baseline in the photos, with or without the dots under the label.
        HStack(alignment: .top, spacing: gap) {
            ItemsCheckbox(on: on, greyed: greyed, border: ItemsLook.soft)
                .padding(.top, dotted ? 1 : 1.3)
            VStack(alignment: .leading, spacing: 6) {
                Text(label)
                    .pfFont(16, bold ? .bold : .regular)
                    .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .modifier(ItemsDotted(show: dotted, color: greyed ? ItemsLook.greyed : Color.primary))
                if let note {
                    Text(note)
                        .pfFont(14)
                        .foregroundStyle(greyed ? ItemsLook.greyed : ItemsLook.soft)
                        .lineSpacing(3.3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        // The box is 4 pt in from the card's edge (x = 41 pt in the photos).
        .padding(.leading, 4)
        .contentShape(Rectangle())
    }
}

/// A radio button with its bold label and the note under it ("Service" and "Item", the two ways of managing stock). Anything
/// under the chosen one (the stock fields) lines up with the label.
struct ItemsRadioRow<Extra: View>: View {
    let label: String
    var note: String? = nil
    let on: Bool
    var greyed = false
    var action: (() -> Void)? = nil
    @ViewBuilder var extra: () -> Extra

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Group {
                if let action, !greyed {
                    Button(action: action) { row }
                        .buttonStyle(.plain)
                } else {
                    row
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(on ? .isSelected : [])
            .accessibilityValue(greyed ? "Not available yet" : "")
            extra()
                .padding(.leading, ItemsLook.radioLabelInset)
        }
    }

    private var row: some View {
        HStack(alignment: .top, spacing: 12.3) {
            // Its top 14 pt above the label's baseline, as in the photos.
            ItemsRadio(on: on, greyed: greyed)
                .padding(.top, 1.2)
            VStack(alignment: .leading, spacing: 6) {
                // A label on two lines has them 24 pt apart, as in the photo.
                Text(label)
                    .pfFont(16, .bold)
                    .foregroundStyle(greyed ? ItemsLook.greyed : ItemsLook.grey)
                    .lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
                if let note {
                    Text(note)
                        .pfFont(14)
                        .foregroundStyle(greyed ? ItemsLook.greyed : ItemsLook.soft)
                        .lineSpacing(3.3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        // The radio is 4 pt in from the card's edge (x = 41 pt in the photos).
        .padding(.leading, 4)
        .contentShape(Rectangle())
    }
}

extension ItemsRadioRow where Extra == EmptyView {
    init(label: String, note: String? = nil, on: Bool, greyed: Bool = false, action: (() -> Void)? = nil) {
        self.init(label: label, note: note, on: on, greyed: greyed, action: action, extra: { EmptyView() })
    }
}

// MARK: - Text

/// The dotted underline Clover puts under words that explain something: 2.2 pt dots every 3 pt, starting 3.3 pt before the words
/// and ending 3.3 pt after them.
struct ItemsDotted: ViewModifier {
    var show = true
    var color: Color = .primary

    @ViewBuilder
    func body(content: Content) -> some View {
        if show {
            content
                .padding(.horizontal, 3.3)
                .padding(.bottom, 5.8)
                .overlay(alignment: .bottom) {
                    ItemsDotLine()
                        .stroke(color, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, dash: [0.01, 2.99]))
                        .frame(height: 2.2)
                        .accessibilityHidden(true)
                }
        } else {
            content
        }
    }
}

private struct ItemsDotLine: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + 1.1, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX - 1.1, y: rect.midY))
        return path
    }
}

/// A bold heading inside a card: grey ("On device", "Stock", "Availability") or black with the dotted underline ("Online
/// ordering", "Revenue class").
struct ItemsHeading: View {
    let text: String
    var color: Color = ItemsLook.grey
    var dotted = false

    var body: some View {
        Text(text)
            .pfFont(19, .bold, relativeTo: .headline)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
            .modifier(ItemsDotted(show: dotted, color: color))
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - Fields

/// A boxed field with its label above (48 pt tall, a 1 pt grey border, 9 pt corners), the server's words under it when it refused
/// what was typed there, and greyed when it cannot be used. `tap` puts the keyboard in the field from anywhere in the box (the
/// text itself is only one line tall).
struct ItemsField<Field: View, Trailing: View>: View {
    let label: String
    var problem = ""
    var note: String? = nil
    var greyed = false
    var focused = false
    var tap: (() -> Void)? = nil
    @ViewBuilder let field: () -> Field
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        // The label's baseline 11 pt above the box, as in the photos.
        VStack(alignment: .leading, spacing: 7.33) {
            Text(label)
                .pfFont(14)
                .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                field()
                    .pfFont(16)
                    .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                    .disabled(greyed)
                    .frame(maxWidth: .infinity, alignment: .leading)
                trailing()
            }
            .padding(.leading, 13)
            .padding(.trailing, 10)
            .padding(.vertical, 6)
            .frame(minHeight: 48)
            .background(ItemsLook.card, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: focused && problem.isEmpty ? 1.5 : 1)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if !greyed { tap?() }
            }
            if !problem.isEmpty {
                Text(problem)
                    .pfFont(14)
                    .foregroundStyle(Theme.error)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let note {
                Text(note)
                    .pfFont(14)
                    .foregroundStyle(greyed ? ItemsLook.greyed : ItemsLook.soft)
                    .lineSpacing(3.3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        // The server's words come and go under the box without a jump.
        .animation(.snappy(duration: 0.2), value: problem)
    }

    private var borderColor: Color {
        if !problem.isEmpty { return Theme.error }
        if greyed { return ItemsLook.greyed }
        return focused ? Theme.blue : ItemsLook.field
    }
}

extension ItemsField where Trailing == EmptyView {
    init(label: String, problem: String = "", note: String? = nil, greyed: Bool = false, focused: Bool = false, tap: (() -> Void)? = nil,
         @ViewBuilder field: @escaping () -> Field) {
        self.init(label: label, problem: problem, note: note, greyed: greyed, focused: focused, tap: tap, field: field, trailing: { EmptyView() })
    }
}

/// A drop-down like the photos' "Price type" and "Item color": the chosen value in a boxed field with a chevron, opening a menu.
struct ItemsDropdown<Choices: View, Leading: View>: View {
    let label: String
    let value: String
    var greyed = false
    @ViewBuilder let choices: () -> Choices
    @ViewBuilder var leading: () -> Leading

    var body: some View {
        VStack(alignment: .leading, spacing: 7.33) {
            Text(label)
                .pfFont(14)
                .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
            Menu {
                choices()
            } label: {
                HStack(spacing: 10) {
                    leading()
                    Text(value)
                        .pfFont(16)
                        .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                }
                .padding(.leading, 13)
                // The chevron ends 18 pt from the box's edge, as in the photos (the symbol has 1.7 pt of air beside it).
                .padding(.trailing, 16.3)
                .frame(minHeight: 48)
                .background(ItemsLook.card, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(greyed ? ItemsLook.greyed : ItemsLook.field, lineWidth: 1)
                }
                .contentShape(Rectangle())
            }
            .disabled(greyed)
            .accessibilityLabel(label)
            .accessibilityValue(greyed ? "\(value), not available yet" : value)
        }
    }
}

extension ItemsDropdown where Leading == EmptyView {
    init(label: String, value: String, greyed: Bool = false, @ViewBuilder choices: @escaping () -> Choices) {
        self.init(label: label, value: value, greyed: greyed, choices: choices, leading: { EmptyView() })
    }
}

// MARK: - Cards

/// A white card of the item editor, as in the photos: the title with its fold chevron, the grey description, a hairline, then the
/// card's fields. `ruled` puts the hairline right under the title (the Cost card); `side` is the rounder Menus card, with the
/// chevron beside the description and no hairline.
struct ItemsCard<Content: View>: View {
    enum Kind {
        case standard, ruled, side
    }

    let title: String
    var note: String? = nil
    var kind: Kind = .standard
    /// The space under the card's last field.
    var bottom: CGFloat = 22
    /// The space between the description and the hairline under it: the hairline is 105 pt under the card's top edge with two
    /// lines of description in the Item tracking photo (131 pt with three in Categories), and 109 pt in the Details photo.
    var ruleGap: CGFloat = 10.9
    @ViewBuilder let content: () -> Content

    @State private var open = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch kind {
            case .standard:
                titleRow(chevron: true)
                if let note {
                    // Its first baseline 25 pt under the title's, as in the photos.
                    noteText(note)
                        .padding(.top, 5)
                }
                if open {
                    ItemsHairline()
                        .padding(.top, ruleGap)
                }
            case .ruled:
                titleRow(chevron: true)
                ItemsHairline()
                    .padding(.top, 1.2)
                if let note {
                    noteText(note)
                        .padding(.top, 27.7)
                }
            case .side:
                titleRow(chevron: false)
                if let note {
                    HStack(alignment: .top, spacing: 16) {
                        noteText(note)
                        Spacer(minLength: 0)
                        // Centred at x = 306 pt, as in the Menus photo.
                        chevron
                            .padding(.top, -8.5)
                            .padding(.trailing, 13)
                    }
                    .padding(.top, 19.3)
                }
            }
            if open {
                content()
            }
        }
        // 17 pt from the card's edge to its hairlines, fields and tables on both sides, as in the photos.
        .padding(.horizontal, 17)
        // The title's baseline 39 pt under the card's top edge (21.4 + the 17.6 pt ascender); the Menus card's 44 pt.
        .padding(.top, kind == .side ? 26.4 : 21.4)
        .padding(.bottom, open ? bottom : 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ItemsLook.card, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(ItemsLook.line, lineWidth: 1)
        }
    }

    private var radius: CGFloat { kind == .side ? 24 : 8 }
    private var titleColor: Color { kind == .side ? Color.primary : ItemsLook.title }

    /// The title alone sets the row's height, so the description follows 25 pt under its baseline as in the photos; the chevron
    /// sits over the row's end, centred on the title, with its 44 pt tap area making nothing taller.
    private func titleRow(chevron show: Bool) -> some View {
        Text(title)
            .pfFont(18.5, .semibold, relativeTo: .title3)
            .foregroundStyle(titleColor)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.trailing, show ? 40 : 0)
            .overlay(alignment: .trailing) {
                if show { chevron }
            }
    }

    /// The fold chevron, its glyph centred 11 pt in from the content's edge (x = 319 pt in the photos). It is laid out as
    /// 36 x 30 pt and takes taps on 44 x 44 pt.
    private var chevron: some View {
        Button {
            withAnimation(.snappy) { open.toggle() }
        } label: {
            Image(systemName: open ? "chevron.up" : "chevron.down")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(titleColor)
                .frame(width: 36, height: 30)
                .padding(.horizontal, 4)
                .padding(.vertical, 7)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, -4)
        .padding(.vertical, -7)
        .padding(.trailing, -7)
        .accessibilityLabel(open ? "Fold \(title)" : "Open \(title)")
    }

    private func noteText(_ text: String) -> some View {
        Text(text)
            .pfFont(16)
            .foregroundStyle(kind == .side ? ItemsLook.soft : ItemsLook.grey)
            // Lines 26 pt apart (24 pt in the Menus card), as in the photos.
            .lineSpacing(kind == .side ? 4.9 : 6.9)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Messages

/// Two alerts cannot be up at once, and nothing can come up while a picker is still closing: a message or a sheet that follows
/// an alert's button or a picker waits until that has gone, as the Orders tab and Closeout wait.
enum ItemsAlerts {
    static func settled(since asked: Date?, wait: Double = 0.45) async {
        guard let asked else { return }
        // Never longer than the wait itself, whatever the clock did meanwhile.
        let left = min(wait, wait - Date().timeIntervalSince(asked))
        if left > 0 {
            try? await Task.sleep(nanoseconds: UInt64(left * 1_000_000_000))
        }
    }
}

/// A short message that comes and goes at the bottom (what a bulk change, an import or a save did): the app's own toast, which
/// also reads itself out with VoiceOver.
struct ItemsToast: View {
    let text: String

    var body: some View {
        GlassToast(text: text)
            .padding(.horizontal, 24)
    }
}
