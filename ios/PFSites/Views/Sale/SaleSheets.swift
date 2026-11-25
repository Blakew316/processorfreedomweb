import SwiftUI
import UIKit

/// The look of the Sale screen and its sheets, measured from the owner's Clover photos (1125 x 2436 px of a 375 x 812 pt phone,
/// so 3 px = 1 pt), with Clover's green rebranded to Processor Freedom's blue.
enum SaleLook {
    /// #EEEEEE: the search field.
    static let field = Color(light: UIColor(hex: 0xEEEEEE), dark: .systemGray6)
    /// #5C5C5C: the search placeholder and an item's price line.
    static let muted = Color(light: UIColor(hex: 0x5C5C5C), dark: .secondaryLabel)
    /// #727272: an item card's border.
    static let cardBorder = Color(light: UIColor(hex: 0x727272), dark: .systemGray)
    /// The hairlines: the app's one hairline colour (#E3E3E3; the photo's measure #E5E5E5).
    static let hairline = SettingsLook.border
    /// #FBFBFB: the order panel at the bottom.
    static let panel = Color(light: UIColor(hex: 0xFBFBFB), dark: .secondarySystemBackground)
    /// #C7C7C7: disabled buttons and the options button's border.
    static let disabled = Color(light: UIColor(hex: 0xC7C7C7), dark: .systemGray3)
    /// #78787D: the options button's dots.
    static let dots = Color(light: UIColor(hex: 0x78787D), dark: .systemGray)
    /// #373737: the price while it is still $0.00.
    static let zeroAmount = Color(light: UIColor(hex: 0x373737), dark: .secondaryLabel)
}

/// A 1 pt line across the screen.
struct SaleHairline: View {
    var body: some View {
        SaleLook.hairline.frame(height: 1)
    }
}

/// The small flat triangle after "All items".
struct DropCaret: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

/// The circled plus before "Custom item", drawn as in the owner's photo on an 18 pt grid: a ring and a 10 pt plus, both 2 pt
/// thick (stroke it 2 pt wide with round ends).
struct PlusRing: Shape {
    func path(in rect: CGRect) -> Path {
        let unit = min(rect.width, rect.height) / 18
        let middle = CGPoint(x: rect.midX, y: rect.midY)
        var path = Path()
        path.addEllipse(in: CGRect(x: middle.x - 8 * unit, y: middle.y - 8 * unit, width: 16 * unit, height: 16 * unit))
        path.move(to: CGPoint(x: middle.x - 4 * unit, y: middle.y))
        path.addLine(to: CGPoint(x: middle.x + 4 * unit, y: middle.y))
        path.move(to: CGPoint(x: middle.x, y: middle.y - 4 * unit))
        path.addLine(to: CGPoint(x: middle.x, y: middle.y + 4 * unit))
        return path
    }
}

/// Select category (photo 5): All items and each category with its item count; choosing one closes the sheet and filters the list.
struct CategorySheet: View {
    let order: SaleModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 21))
                        .foregroundStyle(.primary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.top, 13)
            .padding(.trailing, 8)
            Text("Select category")
                .pfFont(21, .bold, relativeTo: .title2)
                .padding(.horizontal, 17)
                .padding(.top, 3)
                .accessibilityAddTraits(.isHeader)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    row(title: "All items", selected: order.category == nil) { order.category = nil }
                    ForEach(order.categories) { category in
                        row(title: "\(category.name) (\(category.count))", selected: order.category == category.name) {
                            order.category = category.name
                        }
                    }
                }
                .padding(.top, 49)
            }
        }
        .presentationDetents([.large])
        .background(Color(.systemBackground))
    }

    private func row(title: String, selected: Bool, choose: @escaping () -> Void) -> some View {
        Button {
            // The light tap the app gives when another choice in a list is taken.
            if !selected { Haptics.light() }
            choose()
            dismiss()
        } label: {
            // The size of the Sale screen's "All items" link: in the photos both are 65 pt wide.
            Text(title)
                .pfFont(16.25, selected ? .semibold : .medium)
                .foregroundStyle(selected ? Theme.blue : Color.primary)
                .frame(maxWidth: .infinity, minHeight: 56.5, alignment: .leading)
                .padding(.horizontal, 21)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// View order: the lines with their quantities and totals, swipe to remove, and the total.
struct OrderSheet: View {
    let order: SaleModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if order.lines.isEmpty {
                    Text("The order is empty.")
                        .foregroundStyle(.secondary)
                }
                ForEach(order.lines) { line in
                    HStack(spacing: 12) {
                        // The name takes all the room the quantity and the amount leave, so a long name wraps as little as it can.
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.name)
                                .pfFont(17, .medium)
                            Text(Money.format(line.price))
                                .pfFont(15)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                        // Each circle is 44 pt to press; the room is taken back outside it, so the row keeps its layout.
                        HStack(spacing: 4) {
                            Button {
                                Haptics.light()
                                withAnimation(.snappy) { order.change(line, by: -1) }
                            } label: {
                                Image(systemName: "minus.circle")
                                    .font(.system(size: 24))
                                    .padding(8)
                                    .contentShape(Rectangle())
                            }
                            .padding(-8)
                            .accessibilityLabel("One less \(line.name)")
                            Text("\(line.qty)")
                                .pfFont(17, .semibold)
                                .monospacedDigit()
                                .frame(minWidth: 28)
                                .accessibilityLabel("Quantity \(line.qty)")
                            Button {
                                Haptics.light()
                                order.change(line, by: 1)
                            } label: {
                                Image(systemName: "plus.circle")
                                    .font(.system(size: 24))
                                    .padding(8)
                                    .contentShape(Rectangle())
                            }
                            .padding(-8)
                            .accessibilityLabel("One more \(line.name)")
                        }
                        .buttonStyle(.borderless)
                        .foregroundStyle(Theme.blue)
                        Text(Money.format(line.total))
                            .pfFont(17, .semibold)
                            .frame(minWidth: 80, alignment: .trailing)
                    }
                    .padding(.vertical, 4)
                }
                .onDelete { offsets in order.remove(at: offsets) }
                if !order.lines.isEmpty {
                    HStack {
                        Text("Total").pfFont(20, .bold)
                        Spacer()
                        Text(Money.format(order.total)).pfFont(20, .bold)
                    }
                    .padding(.vertical, 6)
                    .accessibilityElement(children: .combine)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Order")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        // Solid, like the app's other sheets: at half height the system's sheet is see-through, and the blue Check out button
        // and the Orders badge behind it showed as coloured bands across the rows.
        .presentationBackground(Color(.systemGroupedBackground))
    }
}

/// The price keypad (the owner's photo): for a variable-price item, the amount for this sale; for a custom item, an optional name
/// and the amount. Typing fills from the right like a register ($0.00, $0.05, $0.52, $5.25); 00 adds two zeros, delete takes the
/// last digit off, and the most is $999,999.99.
struct PriceKeypadSheet: View {
    let target: KeypadTarget
    let order: SaleModel
    /// Told the name of what was added (the scanner shows "Added <name>").
    var onAdded: ((String) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var cents = 0
    @State private var name = ""
    /// Done was pressed: the item is in the order and the sheet is closing, so a second press adds nothing.
    @State private var finished = false
    @FocusState private var nameFocused: Bool

    private let keys: [[String]] = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["0", "00", "delete"]]

    var body: some View {
        // The keys grow to the photo's 87 pt when there is room and give way on smaller iPhones, so Done always shows. When even
        // the smallest keys do not fit (the zoomed display of a small iPhone, very large text), the sheet scrolls instead.
        ViewThatFits(in: .vertical) {
            form
            ScrollView { form }
                .scrollBounceBehavior(.basedOnSize)
        }
        // The keyboard for the name covers the keypad instead of squeezing the sheet; Return puts it away.
        .ignoresSafeArea(.keyboard)
        .presentationDetents([.large])
        .background(Color(.systemBackground))
    }

    private var form: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                Text(title)
                    .pfFont(17, .bold)
                    .lineLimit(1)
                    .padding(.horizontal, 56)
                    .padding(.top, 12)
                    .accessibilityAddTraits(.isHeader)
                HStack {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 20))
                            .foregroundStyle(.primary)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close")
                    Spacer()
                }
                .padding(.leading, 2)
                .padding(.top, 5)
            }

            if isCustom {
                VStack(alignment: .leading, spacing: 6) {
                    Text(needsName ? "Name*" : "Name")
                        .pfFont(15, .medium)
                        .foregroundStyle(.secondary)
                    BoxField(focused: nameFocused) {
                        TextField("Custom item", text: $name)
                            .accessibilityLabel(needsName ? "Name, required" : "Name")
                            .focused($nameFocused)
                            .submitLabel(.done)
                            .textInputAutocapitalization(.sentences)
                    }
                }
                .padding(.horizontal, 17)
                .padding(.top, 16)
            }

            Text("What is the price?")
                .pfFont(15)
                .padding(.top, isCustom ? 24 : 44)
            // Regular weight: the photo's figures have full strokes and wide zeros (light drew them thin and fainter).
            Text(Money.format(cents))
                .pfFont(48, .regular, relativeTo: .largeTitle)
                .foregroundStyle(cents == 0 ? SaleLook.zeroAmount : Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 24)
                .contentTransition(.numericText())
                .accessibilityLabel("Price \(Money.format(cents))")
                // The photo's baselines: the amount's sits 50 pt under the question's, and 60.5 pt above the hairline.
                .padding(.top, 1)
                .padding(.bottom, isCustom ? 32 : 49)

            SaleHairline()
            VStack(spacing: 0) {
                ForEach(keys, id: \.self) { row in
                    HStack(spacing: 0) {
                        ForEach(row, id: \.self) { key in
                            keyButton(key)
                        }
                    }
                }
            }
            // Offered the room before the space above Done, so the keys only shrink when the screen is really short.
            .layoutPriority(1)
            SaleHairline()

            Spacer(minLength: 16)
            Button("Done") { done() }
                .buttonStyle(KeypadDoneStyle(on: canAdd))
                .disabled(!canAdd)
                .padding(.horizontal, 28)
                .padding(.bottom, 15)
        }
    }

    private var isCustom: Bool {
        if case .custom = target { return true }
        return false
    }

    /// The business asks for a name on every custom item (Settings → Custom item name).
    private var needsName: Bool { isCustom && order.customNameRequired }

    /// An amount, and a name when one is needed.
    private var canAdd: Bool { cents > 0 && (!needsName || !name.trimmed.isEmpty) }

    private var title: String {
        switch target {
        case .item(let item): return item.name
        case .custom: return "Custom item"
        }
    }

    private func keyButton(_ key: String) -> some View {
        Button {
            press(key)
        } label: {
            Group {
                if key == "delete" {
                    Image(systemName: "delete.left")
                        .font(.system(size: 26, weight: .semibold))
                        .imageScale(.large)
                } else {
                    Text(key)
                        .font(.system(size: 29, weight: .semibold))
                }
            }
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity, minHeight: 48, maxHeight: 87)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(key == "delete" ? "Delete" : key == "00" ? "Double zero" : key)
    }

    private func press(_ key: String) {
        Haptics.light()
        var digits = cents == 0 ? "" : String(cents)
        if key == "delete" {
            digits = String(digits.dropLast())
        } else {
            digits += key
        }
        let value = Int(digits) ?? 0
        // A key that would go past $999,999.99 does nothing.
        guard value <= Money.most else { return }
        withAnimation(.snappy(duration: 0.15)) { cents = value }
    }

    private func done() {
        guard canAdd, !finished else { return }
        finished = true
        let added: String
        switch target {
        case .item(let item):
            order.add(item, price: cents)
            added = item.name
        case .custom:
            order.addCustom(name: name, cents: cents)
            added = name.trimmed.isEmpty ? "Custom item" : name.trimmed
        }
        // The scanner gives its own success tap with its "Added" message.
        if let onAdded { onAdded(added) } else { Haptics.light() }
        dismiss()
    }
}

/// The keypad's Done button: 44 pt, small corners, grey until there is an amount, then blue.
private struct KeypadDoneStyle: ButtonStyle {
    let on: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .pfFont(14, .medium)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(on ? Theme.blue : SaleLook.disabled))
            .contentShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}
