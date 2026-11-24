import SwiftUI
import UIKit

/// The look of Items and services, measured from the owner's Clover photos (1125 x 2436 px screenshots of a 375 x 812 pt phone,
/// so 3 px = 1 pt), with Clover's greens rebranded to Processor Freedom's blue.
enum ItemsLook {
    /// #F9F9F9 behind everything below the bar.
    static let page = SettingsLook.page
    static let card = SettingsLook.card
    /// #2B2B2B: card titles.
    static let title = Color(light: UIColor(hex: 0x2B2B2B), dark: .label)
    /// #5C5C5C: card descriptions, grey headings and labels.
    static let grey = Color(light: UIColor(hex: 0x5C5C5C), dark: UIColor(hex: 0xAEAEB2))
    /// #4D4D4D: the notes under radio buttons and checkboxes.
    static let soft = Color(light: UIColor(hex: 0x4D4D4D), dark: UIColor(hex: 0xAEAEB2))
    /// #727272: the grey lines of a list row.
    static let rowGrey = Color(light: UIColor(hex: 0x727272), dark: .secondaryLabel)
    /// #E5E5E5: hairlines and card borders.
    static let line = Color(light: UIColor(hex: 0xE5E5E5), dark: UIColor(hex: 0x38383A))
    /// The white line under each list hairline (nothing in dark mode).
    static let lineLight = Color(light: .white, dark: .clear)
    /// #E3E3E3: round buttons and grey pills.
    static let control = Color(light: UIColor(hex: 0xE3E3E3), dark: UIColor(hex: 0x3A3A3C))
    /// #C4C4C4: the darker Cancel pill of Select.
    static let controlDark = Color(light: UIColor(hex: 0xC4C4C4), dark: UIColor(hex: 0x545458))
    /// #868686: field borders.
    static let field = Color(light: UIColor(hex: 0x868686), dark: UIColor(hex: 0x636366))
    /// The light blue of a "+" or a label on a brand-blue button (Clover's light green, rebranded).
    static let onBrand = Color(light: UIColor(hex: 0xE8F1FC), dark: .white)
    /// #FBFBFB inside the photo box.
    static let imageFill = Color(light: UIColor(hex: 0xFBFBFB), dark: UIColor(hex: 0x1C1C1E))
    /// Things Processor Freedom does not do: shown, greyed, and not tappable.
    static let greyed = SettingsLook.greyed
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

/// The photos' round grey buttons (50 x 48 pt), the brand-blue "+" and the pills: a filled capsule around the label.
struct ItemsCapsuleStyle: ButtonStyle {
    var fill: Color = ItemsLook.control
    var width: CGFloat? = 50
    var height: CGFloat = 48

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: width, height: height)
            .background(fill, in: Capsule())
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
    var size: CGFloat = 16.5
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

// MARK: - Checkboxes, radios and switches

/// A 16 pt square checkbox: white with a grey border, brand blue with a white tick when checked, light grey when greyed.
struct ItemsCheckbox: View {
    let on: Bool
    var greyed = false
    var border: Color = ItemsLook.rowGrey

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(greyed ? ItemsLook.control : (on ? Theme.blue : ItemsLook.card))
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .strokeBorder(greyed ? ItemsLook.greyed : (on ? Theme.blue : border), lineWidth: 1.33)
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

/// A 16 pt radio button: a grey ring, or a brand-blue ring with a dot when chosen.
struct ItemsRadio: View {
    let on: Bool
    var greyed = false

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(greyed ? ItemsLook.greyed : (on ? Theme.blue : ItemsLook.soft), lineWidth: 1.33)
            if on {
                Circle()
                    .fill(greyed ? ItemsLook.greyed : Theme.blue)
                    .frame(width: 8, height: 8)
            }
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

/// The photos' small switch: a brand-blue track with a white knob holding a tick when on, grey when off, pale when greyed.
struct ItemsSwitchMark: View {
    let on: Bool
    var greyed = false

    var body: some View {
        ZStack(alignment: on ? .trailing : .leading) {
            Capsule()
                .fill(track)
            Circle()
                .fill(Color.white)
                .frame(width: 18, height: 18)
                .overlay {
                    if on {
                        Image(systemName: "checkmark")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(greyed ? ItemsLook.greyed : Theme.blue)
                    }
                }
                .padding(2)
        }
        .frame(width: 40, height: 22)
        .accessibilityHidden(true)
    }

    private var track: Color {
        if greyed { return ItemsLook.control }
        return on ? Theme.blue : ItemsLook.controlDark
    }
}

/// A switch with its label; greyed ones say "Not available yet" and do nothing.
struct ItemsSwitchRow: View {
    let label: String
    @Binding var on: Bool
    var greyed = false
    var dotted = false
    var size: CGFloat = 16.5

    var body: some View {
        Button {
            guard !greyed else { return }
            on.toggle()
        } label: {
            HStack(spacing: 12) {
                ItemsSwitchMark(on: on, greyed: greyed)
                Text(label)
                    .pfFont(size)
                    .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                    .modifier(ItemsDotted(show: dotted, color: greyed ? ItemsLook.greyed : Color.primary))
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(greyed)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(greyed ? "Not available yet" : (on ? "On" : "Off"))
        .accessibilityAddTraits(.isToggle)
    }
}

/// A checkbox with its bold label and grey note (the age-restricted and non-revenue rows).
struct ItemsCheckRow: View {
    let label: String
    var note: String? = nil
    let on: Bool
    var greyed = false
    var bold = true
    var dotted = false
    var gap: CGFloat = 22
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
        HStack(alignment: .top, spacing: gap) {
            ItemsCheckbox(on: on, greyed: greyed, border: ItemsLook.soft)
                .padding(.top, 3)
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .pfFont(16.5, bold ? .bold : .regular)
                    .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .modifier(ItemsDotted(show: dotted, color: greyed ? ItemsLook.greyed : Color.primary))
                if let note {
                    Text(note)
                        .pfFont(16)
                        .foregroundStyle(greyed ? ItemsLook.greyed : ItemsLook.soft)
                        .lineSpacing(1)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }
}

/// A radio button with its bold label and the note under it ("Service" and "Item", the two ways of managing stock).
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
                .padding(.leading, 38)
        }
    }

    private var row: some View {
        HStack(alignment: .top, spacing: 22) {
            ItemsRadio(on: on, greyed: greyed)
                .padding(.top, 3)
            VStack(alignment: .leading, spacing: 6) {
                Text(label)
                    .pfFont(16.5, .bold)
                    .foregroundStyle(greyed ? ItemsLook.greyed : ItemsLook.grey)
                    .fixedSize(horizontal: false, vertical: true)
                if let note {
                    Text(note)
                        .pfFont(16)
                        .foregroundStyle(greyed ? ItemsLook.greyed : ItemsLook.soft)
                        .lineSpacing(1)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }
}

extension ItemsRadioRow where Extra == EmptyView {
    init(label: String, note: String? = nil, on: Bool, greyed: Bool = false, action: (() -> Void)? = nil) {
        self.init(label: label, note: note, on: on, greyed: greyed, action: action, extra: { EmptyView() })
    }
}

// MARK: - Text

/// The dotted underline Clover puts under words that explain something.
struct ItemsDotted: ViewModifier {
    var show = true
    var color: Color = .primary

    func body(content: Content) -> some View {
        if show {
            content
                .padding(.bottom, 7)
                .overlay(alignment: .bottom) {
                    ItemsDotLine()
                        .stroke(color, style: StrokeStyle(lineWidth: 1.8, lineCap: .round, dash: [0.1, 2.9]))
                        .frame(height: 2)
                        .padding(.horizontal, -3)
                }
        } else {
            content
        }
    }
}

private struct ItemsDotLine: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + 1, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX - 1, y: rect.midY))
        return path
    }
}

/// A grey bold heading inside a card ("On device", "Stock", "Availability").
struct ItemsHeading: View {
    let text: String
    var color: Color = ItemsLook.grey
    var size: CGFloat = 18.5

    var body: some View {
        Text(text)
            .pfFont(size, .bold, relativeTo: .headline)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - Fields

/// A boxed field with its label above (48 pt tall, a 1 pt grey border, 8 pt corners), the server's words under it when it refused
/// what was typed there, and greyed when it cannot be used.
struct ItemsField<Field: View, Trailing: View>: View {
    let label: String
    var problem = ""
    var note: String? = nil
    var greyed = false
    var focused = false
    @ViewBuilder let field: () -> Field
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .pfFont(15)
                .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
            HStack(spacing: 10) {
                field()
                    .pfFont(17)
                    .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                    .disabled(greyed)
                trailing()
            }
            .padding(.leading, 14)
            .padding(.trailing, 10)
            .frame(minHeight: 48)
            .background(ItemsLook.card, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: focused && problem.isEmpty ? 1.5 : 1)
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
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var borderColor: Color {
        if !problem.isEmpty { return Theme.error }
        if greyed { return ItemsLook.line }
        return focused ? Theme.blue : ItemsLook.field
    }
}

extension ItemsField where Trailing == EmptyView {
    init(label: String, problem: String = "", note: String? = nil, greyed: Bool = false, focused: Bool = false, @ViewBuilder field: @escaping () -> Field) {
        self.init(label: label, problem: problem, note: note, greyed: greyed, focused: focused, field: field, trailing: { EmptyView() })
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
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .pfFont(15)
                .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
            Menu {
                choices()
            } label: {
                HStack(spacing: 10) {
                    leading()
                    Text(value)
                        .pfFont(17)
                        .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(greyed ? ItemsLook.greyed : Color.primary)
                }
                .padding(.leading, 14)
                .padding(.trailing, 18)
                .frame(minHeight: 48)
                .background(ItemsLook.card, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(greyed ? ItemsLook.line : ItemsLook.field, lineWidth: 1)
                }
                .contentShape(Rectangle())
            }
            .disabled(greyed)
            .accessibilityLabel(label)
            .accessibilityValue(value)
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
/// card's fields. `ruled` puts the hairline right under the title (the Cost card); `side` puts the chevron beside the description
/// (the Menus card).
struct ItemsCard<Content: View>: View {
    enum Kind {
        case standard, ruled, side
    }

    let title: String
    var note: String? = nil
    var kind: Kind = .standard
    var radius: CGFloat = 8
    var titleColor: Color = ItemsLook.title
    var noteColor: Color = ItemsLook.grey
    @ViewBuilder let content: () -> Content

    @State private var open = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch kind {
            case .standard:
                VStack(alignment: .leading, spacing: 4) {
                    titleRow(chevron: true)
                    if let note { noteText(note) }
                }
                if open {
                    ItemsHairline()
                        .padding(.top, 15)
                }
            case .ruled:
                titleRow(chevron: true)
                    .padding(.bottom, 4)
                ItemsHairline()
                if let note {
                    noteText(note)
                        .padding(.top, 26)
                }
            case .side:
                titleRow(chevron: false)
                if let note {
                    HStack(alignment: .top, spacing: 16) {
                        noteText(note)
                            .padding(.top, 2)
                        Spacer(minLength: 0)
                        chevron
                    }
                    .padding(.top, 22)
                }
            }
            if open {
                content()
            }
        }
        .padding(.horizontal, 17)
        .padding(.top, 20)
        .padding(.bottom, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ItemsLook.card, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(ItemsLook.line, lineWidth: 1)
        }
    }

    private func titleRow(chevron show: Bool) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(title)
                .pfFont(18.5, .bold, relativeTo: .title3)
                .foregroundStyle(titleColor)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            if show { chevron }
        }
    }

    private var chevron: some View {
        Button {
            withAnimation(.snappy) { open.toggle() }
        } label: {
            Image(systemName: open ? "chevron.up" : "chevron.down")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(titleColor)
                .frame(width: 36, height: 30)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.trailing, -6)
        .accessibilityLabel(open ? "Fold \(title)" : "Open \(title)")
    }

    private func noteText(_ text: String) -> some View {
        Text(text)
            .pfFont(16)
            .foregroundStyle(noteColor)
            .lineSpacing(7)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Messages

/// A short message that comes and goes at the bottom (what a bulk change or an import did).
struct ItemsToast: View {
    let text: String
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        Text(text)
            .pfFont(16, .medium)
            .foregroundStyle(Color.primary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 20)
            .padding(.vertical, 13)
            .modifier(ToastSurface(reduceTransparency: reduceTransparency))
            .padding(.horizontal, 24)
            .accessibilityAddTraits(.updatesFrequently)
    }

    private struct ToastSurface: ViewModifier {
        let reduceTransparency: Bool

        @ViewBuilder
        func body(content: Content) -> some View {
            if reduceTransparency {
                content.background(Capsule().fill(Color(.secondarySystemBackground)))
            } else {
                content.glassEffect(.regular, in: .capsule)
            }
        }
    }
}
