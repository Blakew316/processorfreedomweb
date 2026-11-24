import SwiftUI

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
                        .font(.system(size: 22))
                        .foregroundStyle(.primary)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Close")
            }
            .padding(.top, 12)
            .padding(.trailing, 8)
            Text("Select category")
                .pfFont(24, .bold, relativeTo: .title2)
                .padding(.horizontal, 17)
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
                .padding(.top, 40)
            }
        }
        .presentationDetents([.large])
        .background(Color(.systemBackground))
    }

    private func row(title: String, selected: Bool, choose: @escaping () -> Void) -> some View {
        Button {
            choose()
            dismiss()
        } label: {
            Text(title)
                .pfFont(20, selected ? .semibold : .medium)
                .foregroundStyle(selected ? Theme.blue : Color.primary)
                .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
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
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.name)
                                .pfFont(17, .medium)
                            Text(Money.format(line.price))
                                .pfFont(15)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        HStack(spacing: 4) {
                            Button {
                                order.change(line, by: -1)
                            } label: {
                                Image(systemName: "minus.circle")
                                    .font(.system(size: 24))
                            }
                            .accessibilityLabel("One less \(line.name)")
                            Text("\(line.qty)")
                                .pfFont(17, .semibold)
                                .frame(minWidth: 28)
                                .accessibilityLabel("\(line.qty)")
                            Button {
                                order.change(line, by: 1)
                            } label: {
                                Image(systemName: "plus.circle")
                                    .font(.system(size: 24))
                            }
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
    }
}

/// The price keypad (the owner's photo): for a variable-price item, the amount for this sale; for a custom item,
/// an optional name and the amount. Typing fills from the right like a register ($0.00, $0.05, $0.52, $5.25).
struct PriceKeypadSheet: View {
    let target: KeypadTarget
    let order: SaleModel
    @Environment(\.dismiss) private var dismiss
    @State private var cents = 0
    @State private var name = ""

    private let keys: [[String]] = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["0", "00", "delete"]]

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Text(title)
                    .pfFont(19, .bold)
                    .lineLimit(1)
                    .padding(.horizontal, 60)
                    .accessibilityAddTraits(.isHeader)
                HStack {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 22))
                            .foregroundStyle(.primary)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Close")
                    Spacer()
                }
                .padding(.leading, 8)
            }
            .padding(.top, 12)

            if case .custom = target {
                TextField("Custom item", text: $name)
                    .pfFont(18)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 46)
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(.systemGray3), lineWidth: 1))
                    .padding(.horizontal, 17)
                    .padding(.top, 24)
                    .accessibilityLabel("Name")
            }

            Text("What is the price?")
                .pfFont(17)
                .padding(.top, isCustom ? 28 : 70)
            Text(Money.format(cents))
                .pfFont(48, .light, relativeTo: .largeTitle)
                .foregroundStyle(cents == 0 ? Color.secondary : Color.primary)
                .padding(.top, 4)
                .padding(.bottom, 40)
                .accessibilityLabel("Price \(Money.format(cents))")

            Divider()
            VStack(spacing: 0) {
                ForEach(keys, id: \.self) { row in
                    HStack(spacing: 0) {
                        ForEach(row, id: \.self) { key in
                            keyButton(key)
                        }
                    }
                }
            }
            Divider()

            Spacer(minLength: 16)
            Button("Done") { done() }
                .buttonStyle(SolidButtonStyle(fill: cents > 0 ? Theme.blue : Color(.systemGray3), text: .white, radius: 6, height: 48, size: 18))
                .disabled(cents == 0)
                .padding(.horizontal, 34)
                .padding(.bottom, 20)
        }
        .presentationDetents([.large])
        .background(Color(.systemBackground))
    }

    private var isCustom: Bool {
        if case .custom = target { return true }
        return false
    }

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
                        .font(.system(size: 28))
                } else {
                    Text(key)
                        .font(.system(size: 32, weight: .medium))
                }
            }
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity, minHeight: 90)
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
        cents = min(Money.most, value)
    }

    private func done() {
        guard cents > 0 else { return }
        switch target {
        case .item(let item): order.add(item, price: cents)
        case .custom: order.addCustom(name: name, cents: cents)
        }
        Haptics.light()
        dismiss()
    }
}
