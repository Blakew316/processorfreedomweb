import SwiftUI
import UIKit

/// What Create appointment asks an amount for, on the app's price keypad.
enum CreateAppointmentAmountKind: Hashable {
    /// A variable-price item from the menu: its price for this appointment.
    case itemPrice(CreateAppointmentItem)
    /// Add custom item: a name and a price.
    case customItem
    case discount
    case charge

    var id: String {
        switch self {
        case .itemPrice(let item): return "item-\(item.id)"
        case .customItem: return "custom"
        case .discount: return "discount"
        case .charge: return "charge"
        }
    }
}

/// The sheets Create appointment shows, one at a time.
enum CreateAppointmentSheet: Identifiable, Hashable {
    case inventory
    case amount(CreateAppointmentAmountKind)

    var id: String {
        switch self {
        case .inventory: return "inventory"
        case .amount(let kind): return "amount-\(kind.id)"
        }
    }
}

/// The price keypad of the Sale screen, for the amounts the website asks for in its small windows: a variable-price item's price,
/// a custom item's name and price, the order discount (Amount off) and the service charge (Amount). Typing fills from the right
/// like a register ($0.00, $0.05, $0.52, $5.25); 00 adds two zeros, delete takes the last digit off, and the most is $100,000.00,
/// the most the website takes. A price must be more than $0.00; the discount and the charge can go back to $0.00.
struct CreateAppointmentAmountSheet: View {
    let title: String
    let question: String
    let asksName: Bool
    let allowsZero: Bool
    let done: (Int, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var cents: Int
    @State private var name = ""
    @FocusState private var nameFocused: Bool

    /// $100,000.00 (parsePrice in shared/core.js).
    private static let most = 10_000_000
    private let keys: [[String]] = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["0", "00", "delete"]]

    init(title: String, question: String, asksName: Bool = false, allowsZero: Bool = false, start: Int = 0, done: @escaping (Int, String) -> Void) {
        self.title = title
        self.question = question
        self.asksName = asksName
        self.allowsZero = allowsZero
        self.done = done
        _cents = State(initialValue: min(max(0, start), 10_000_000))
    }

    var body: some View {
        // The keys give way on smaller iPhones so Done always shows; when even the smallest keys do not fit, the sheet scrolls.
        ViewThatFits(in: .vertical) {
            keypad
            ScrollView { keypad }
                .scrollBounceBehavior(.basedOnSize)
        }
        // The keyboard for the name covers the keypad instead of squeezing the sheet; Return puts it away.
        .ignoresSafeArea(.keyboard)
        .presentationDetents([.large])
        .background(Color(.systemBackground))
    }

    private var canFinish: Bool {
        (allowsZero || cents > 0) && (!asksName || !name.trimmed.isEmpty)
    }

    private var keypad: some View {
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
                            .foregroundStyle(Color.primary)
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

            if asksName {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Item name")
                        .pfFont(15, .medium)
                        .foregroundStyle(.secondary)
                    BoxField(focused: nameFocused) {
                        TextField("", text: $name)
                            .focused($nameFocused)
                            .submitLabel(.done)
                            .textInputAutocapitalization(.sentences)
                            .accessibilityLabel("Item name")
                    }
                }
                .padding(.horizontal, 17)
                .padding(.top, 16)
            }

            Text(question)
                .pfFont(15)
                .padding(.top, asksName ? 24 : 44)
            Text(Money.format(cents))
                .pfFont(48, .light, relativeTo: .largeTitle)
                .foregroundStyle(cents == 0 ? CreateAppointmentLook.placeholder : Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 24)
                .contentTransition(.numericText())
                .accessibilityLabel("\(question) \(Money.format(cents))")
                .padding(.top, 1)
                .padding(.bottom, asksName ? 32 : 49)

            CreateAppointmentKeypadLine()
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
            CreateAppointmentKeypadLine()

            Spacer(minLength: 16)
            Button("Done") { finish() }
                .buttonStyle(CreateAppointmentDoneStyle(on: canFinish))
                .disabled(!canFinish)
                .padding(.horizontal, 28)
                .padding(.bottom, 15)
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
            .foregroundStyle(Color.primary)
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
        // A key that would go past $100,000.00 does nothing.
        guard value <= Self.most else { return }
        withAnimation(.snappy(duration: 0.15)) { cents = value }
    }

    private func finish() {
        guard canFinish else { return }
        done(cents, name.trimmed)
        dismiss()
    }
}

/// A 1 pt line across the keypad.
private struct CreateAppointmentKeypadLine: View {
    var body: some View {
        Color(light: UIColor(hex: 0xE5E5E5), dark: .systemGray4)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

/// The keypad's Done button: 44 pt, small corners, grey until there is an amount, then blue (as on the Sale screen's keypad).
private struct CreateAppointmentDoneStyle: ButtonStyle {
    let on: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .pfFont(14, .medium)
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(on ? Theme.blue : Color(.systemGray3)))
            .contentShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// Add inventory item: the business's items (the website's list of its menu), found by name. An item with its own price is added
/// at once; a variable-price item has its price asked for next.
struct CreateAppointmentInventorySheet: View {
    let items: [CreateAppointmentItem]
    let loaded: Bool
    let problem: String
    let pick: (CreateAppointmentItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var shown: [CreateAppointmentItem] {
        let typed = query.trimmed.lowercased()
        guard !typed.isEmpty else { return items }
        return items.filter { $0.name.lowercased().contains(typed) }
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                Text("Add inventory item")
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
                            .foregroundStyle(Color.primary)
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
            FilledSearchField(placeholder: "Search items", text: $query)
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 8)
            list
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color(.systemBackground))
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private var list: some View {
        if !loaded {
            ProgressView()
                .controlSize(.large)
                .tint(Theme.blue)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if items.isEmpty && !problem.isEmpty {
            Text(problem)
                .pfFont(16)
                .foregroundStyle(SettingsLook.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(shown) { item in
                        Button {
                            pick(item)
                        } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(item.name)
                                    .pfFont(16)
                                    .foregroundStyle(Color.primary)
                                    .multilineTextAlignment(.leading)
                                    .lineLimit(2)
                                Spacer(minLength: 8)
                                Text(item.variable ? "Variable" : Money.format(item.price))
                                    .pfFont(16, .bold)
                                    .foregroundStyle(Color.primary)
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        CreateAppointmentKeypadLine()
                            .padding(.leading, 20)
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.immediately)
        }
    }
}
