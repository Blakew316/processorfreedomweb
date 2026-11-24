import SwiftUI
import UIKit

// MARK: - Import

/// An item list chosen to import, read the way the server will read it.
struct ItemsImportPlan: Identifiable {
    let id = UUID()
    let fileName: String
    let csv: String
    let reading: ImportReading
}

/// The website's import sheet (importCsv): how many items were found and in how many categories, the first few, the rows that will
/// be skipped and why, the starting quantity for items without one, and its choices: add to the items, replace them, or build the
/// first list.
struct ItemsImportSheet: View {
    let plan: ItemsImportPlan
    let items: ItemsModel

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var quantity = "100"
    /// The choice being sent (true: replace), and the one that failed and offers Try again.
    @State private var running: Bool?
    @State private var failed: Bool?
    @State private var problem: String?
    @FocusState private var quantityFocused: Bool

    private var found: [ImportedRow] { plan.reading.items }
    private var hasItems: Bool { !items.items.isEmpty }

    var body: some View {
        let count = found.count
        let categories = Set(found.map(\.category)).count
        let missing = found.filter { $0.stock == nil }.count
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                Text(count > 0 ? "\(count) item\(count == 1 ? "" : "s") found" : "We could not read that file")
                    .pfFont(20, .bold, relativeTo: .title3)
                    .foregroundStyle(ItemsLook.title)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.primary)
                        .frame(width: 34, height: 34)
                        .overlay { Circle().strokeBorder(Theme.blue, lineWidth: 2) }
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(running != nil)
                .accessibilityLabel("Close")
            }
            .padding(.horizontal, 20)
            .padding(.top, 22)
            .padding(.bottom, 16)
            ItemsHairline()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(count > 0 ? "From \(plan.fileName), in \(categories) categor\(categories == 1 ? "y" : "ies")." : (plan.reading.errors.first?.reason ?? "No items were found."))
                        .pfFont(16)
                        .foregroundStyle(ItemsLook.grey)
                        .fixedSize(horizontal: false, vertical: true)
                    if count > 0 {
                        preview
                    }
                    if count > 6 {
                        Text("and \(count - 6) more")
                            .pfFont(14)
                            .foregroundStyle(ItemsLook.grey)
                    }
                    if count > 0 && !plan.reading.errors.isEmpty {
                        skipped
                    }
                    if missing > 0 {
                        ItemsField(label: missing == count ? "How many of each item do you have?" : "Starting quantity for the \(missing) item\(missing == 1 ? "" : "s") without one",
                                   focused: quantityFocused) {
                            TextField("", text: $quantity)
                                .keyboardType(.numberPad)
                                .focused($quantityFocused)
                                .onChange(of: quantity) { _, typed in
                                    let digits = typed.digits(limit: 6)
                                    if digits != typed { quantity = digits }
                                }
                        }
                        .frame(maxWidth: 220, alignment: .leading)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            ItemsHairline()
            VStack(spacing: 10) {
                if count > 0 {
                    Button {
                        run(replace: hasItems)
                    } label: {
                        Text(label(for: hasItems, normal: hasItems ? "Replace my menu" : "Build my menu"))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(ItemsPillStyle(kind: .brand, height: 48, size: 16.5, weight: .semibold))
                    if hasItems {
                        Button {
                            run(replace: false)
                        } label: {
                            Text(label(for: false, normal: "Add to my menu"))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ItemsPillStyle(kind: .grey, height: 48, size: 16.5, weight: .semibold))
                    }
                }
                Button {
                    dismiss()
                } label: {
                    Text("Cancel")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(ItemsPillStyle(kind: .grey, height: 48, size: 16.5, weight: .semibold))
            }
            .disabled(running != nil)
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 10)
        }
        .background(Color(.systemBackground))
        .presentationDetents([.large])
        .interactiveDismissDisabled(running != nil)
        .alert(problem ?? "", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    /// The first six rows the file would add.
    private var preview: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text("Item").frame(maxWidth: .infinity, alignment: .leading)
                Text("Category").frame(maxWidth: .infinity, alignment: .leading)
                Text("Price").frame(width: 84, alignment: .trailing)
            }
            .pfFont(14, .bold)
            .foregroundStyle(Color.primary)
            .padding(.vertical, 10)
            ItemsHairline()
            ForEach(Array(found.prefix(6).enumerated()), id: \.offset) { _, row in
                HStack(alignment: .top, spacing: 10) {
                    Text(row.name)
                        .foregroundStyle(Color.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(row.category)
                        .foregroundStyle(ItemsLook.grey)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(row.variable ? "Variable" : Money.format(row.price))
                        .foregroundStyle(Color.primary)
                        .frame(width: 84, alignment: .trailing)
                }
                .pfFont(14)
                .lineLimit(2)
                .padding(.vertical, 10)
                ItemsHairline()
            }
        }
    }

    /// The rows that will be skipped, the first three with their reasons.
    private var skipped: some View {
        let errors = plan.reading.errors
        return VStack(alignment: .leading, spacing: 6) {
            Text("\(errors.count) row\(errors.count == 1 ? "" : "s") will be skipped.")
                .pfFont(15, .bold)
                .foregroundStyle(Color.primary)
            ForEach(Array(errors.prefix(3).enumerated()), id: \.offset) { _, error in
                Text("\(error.row > 0 ? "Row \(error.row): " : "")\(error.reason)")
                    .pfFont(14)
                    .foregroundStyle(ItemsLook.soft)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ItemsLook.page, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(ItemsLook.line, lineWidth: 1)
        }
    }

    /// A button's words: "Building your menu…" while it runs, "Try again" after it failed.
    private func label(for replace: Bool, normal: String) -> String {
        if running == replace { return "Building your menu…" }
        if failed == replace { return "Try again" }
        return normal
    }

    private func run(replace: Bool) {
        guard running == nil else { return }
        quantityFocused = false
        running = replace
        let start = max(0, Int(quantity.trimmed) ?? 0)
        Task {
            let result = await items.importList(model, csv: plan.csv, replace: replace, startStock: start)
            running = nil
            switch result {
            case .success(let added):
                items.showToast("\(added) item\(added == 1 ? "" : "s") added to your menu")
                dismiss()
            case .failure(let error):
                failed = replace
                problem = error.message
            }
        }
    }
}

// MARK: - Categories

/// "Assign categories" from the item editor's Categories card: the business's categories (an item has exactly one, so choosing one
/// replaces the one it had), or a new name.
struct ItemsCategoryPicker: View {
    let names: [String]
    let current: String
    let choose: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var newName = ""
    @FocusState private var typing: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text("Assign categories")
                    .pfFont(18, .bold, relativeTo: .headline)
                    .foregroundStyle(Color.primary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 12)
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.primary)
                        .frame(width: 34, height: 34)
                        .overlay { Circle().strokeBorder(Theme.blue, lineWidth: 2) }
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.leading, 26)
            .padding(.trailing, 21)
            .frame(minHeight: 61)
            ItemsHairline()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(names, id: \.self) { name in
                        Button {
                            choose(name)
                            dismiss()
                        } label: {
                            HStack(spacing: 13) {
                                ItemsRadio(on: name == current)
                                Text(name)
                                    .pfFont(16.5)
                                    .foregroundStyle(Color.primary)
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 12)
                            .frame(minHeight: 60)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(name == current ? [.isButton, .isSelected] : .isButton)
                        ItemsHairline()
                    }
                    ItemsField(label: "Category name", focused: typing) {
                        TextField("", text: $newName)
                            .focused($typing)
                            .submitLabel(.done)
                            .onSubmit { addNew() }
                            .onChange(of: newName) { _, typed in
                                if typed.count > 60 { newName = String(typed.prefix(60)) }
                            }
                    }
                    .padding(.top, names.isEmpty ? 4 : 26)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            ItemsHairline(color: ItemsLook.control)
            // The pills of Filter item results: 48 pt, 16 pt under the rule and 12 pt above the bottom.
            HStack(spacing: 16) {
                Button("Cancel") { dismiss() }
                    .buttonStyle(ItemsPillStyle(kind: .grey, height: 48, size: 16, weight: .medium))
                Button("Assign") { addNew() }
                    .buttonStyle(ItemsPillStyle(kind: .brand, height: 48, size: 16, weight: .medium))
                    .disabled(newName.trimmed.isEmpty)
            }
            .padding(.top, 16)
            .padding(.bottom, 12)
        }
        .background(Color(.systemBackground))
        .presentationDetents([.medium, .large])
    }

    private func addNew() {
        let name = newName.trimmed
        guard !name.isEmpty else { return }
        choose(String(name.prefix(60)))
        dismiss()
    }
}
