import SwiftUI

/// The three rows of the Filters panel, in the photo's order.
enum ItemSalesFilterSection: String, CaseIterable, Identifiable {
    case employees, devices, orderTypes

    var id: String { rawValue }

    var title: String {
        switch self {
        case .employees: return "Employees"
        case .devices: return "Devices"
        case .orderTypes: return "Order Types"
        }
    }

    /// What the section's search field is for, for VoiceOver (the field itself shows no words, as in the photos).
    var searchName: String {
        switch self {
        case .employees: return "Search employees"
        case .devices: return "Search devices"
        case .orderTypes: return "Search order types"
        }
    }
}

/// The Filters panel (photo 4c9f3737), over the report under the bar: "Filters" with an X, the rows Employees, Devices and
/// Order Types that each open in place (photos 46785940, 87b176f1, 73a140ea), then "Show results" and "Reset filters".
/// Only Order Types can change the report: the server cannot narrow item sales by employee, and Processor Freedom has no
/// point-of-sale devices, so those two show their true value, all of them, greyed.
struct ItemSalesFiltersPanel: View {
    let report: ItemSalesModel
    let close: () -> Void

    @State private var draft: ItemSalesOrderType
    @State private var open: ItemSalesFilterSection? = nil
    @State private var search = ""

    init(report: ItemSalesModel, close: @escaping () -> Void) {
        self.report = report
        self.close = close
        _draft = State(initialValue: report.choices.orderType)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(SettingsLook.border).frame(height: 1)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(ItemSalesFilterSection.allCases) { section in
                        sectionView(section)
                        // Hairlines between the rows, and under the last one while it is open.
                        if section != ItemSalesFilterSection.allCases.last || open == section {
                            Rectangle().fill(SettingsLook.border).frame(height: 1)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 17)
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)
            Rectangle().fill(SettingsLook.border).frame(height: 1)
            VStack(spacing: 8) {
                Button("Show results") {
                    report.chooseOrderType(draft)
                    close()
                }
                .buttonStyle(SolidButtonStyle(fill: Theme.blue, text: .white, radius: 24, height: 48, size: 16))
                Button("Reset filters") {
                    withAnimation(.snappy) { draft = .all }
                }
                .buttonStyle(SolidButtonStyle(fill: SettingsLook.border, text: .primary, radius: 24, height: 48, size: 16))
            }
            .padding(.horizontal, 12)
            .padding(.top, 17)
            .padding(.bottom, 11)
        }
        .background(Color(.systemBackground))
        .accessibilityAction(.escape) { close() }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text("Filters")
                .pfFont(20, .bold, relativeTo: .title3)
                .foregroundStyle(Color.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(Color.primary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close filters")
            .padding(.trailing, -7)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    // MARK: A row and what it opens

    private func toggle(_ section: ItemSalesFilterSection) {
        withAnimation(.snappy(duration: 0.25)) {
            open = open == section ? nil : section
            search = ""
        }
    }

    @ViewBuilder
    private func sectionView(_ section: ItemSalesFilterSection) -> some View {
        let isOpen = open == section
        VStack(spacing: 0) {
            Button { toggle(section) } label: {
                HStack(spacing: 12) {
                    Text(section.title)
                        .pfFont(16, .semibold)
                        .foregroundStyle(Color.primary)
                    Spacer(minLength: 8)
                    ItemSalesChevron(up: isOpen)
                        .padding(.trailing, 4.7)
                }
                .padding(.horizontal, 14)
                .frame(maxWidth: .infinity, minHeight: 46)
                .background {
                    if isOpen {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(SettingsLook.border)
                            .padding(.horizontal, 1)
                    }
                }
                .overlay {
                    if isOpen {
                        // The photos' ring around the open row, in brand blue: a fine line at its edge and a wider one 2 pt out.
                        ZStack {
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .strokeBorder(Theme.blue, lineWidth: 1)
                                .padding(.vertical, -1)
                            RoundedRectangle(cornerRadius: 13, style: .continuous)
                                .strokeBorder(Theme.blue, lineWidth: 2)
                                .padding(.horizontal, -4)
                                .padding(.vertical, -5)
                        }
                        .allowsHitTesting(false)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(value(of: section))
            .accessibilityHint(isOpen ? "Closes the list" : "Opens the list")
            if isOpen {
                options(section)
                    .padding(.top, 9)
                    .padding(.bottom, 4)
                    .transition(.opacity)
            }
        }
        .zIndex(isOpen ? 1 : 0)
    }

    private func value(of section: ItemSalesFilterSection) -> String {
        switch section {
        case .employees: return "All Employees"
        case .devices: return "All Devices"
        case .orderTypes: return draft.label
        }
    }

    /// The choices of a section, starting with its "All …" row. Employees are the business's people; there are no devices.
    private func choices(_ section: ItemSalesFilterSection) -> [ItemSalesFilterChoice] {
        switch section {
        case .employees:
            return [ItemSalesFilterChoice(label: "All Employees", chosen: true, type: nil)]
                + report.people.map { ItemSalesFilterChoice(label: $0, chosen: false, type: nil) }
        case .devices:
            return [ItemSalesFilterChoice(label: "All Devices", chosen: true, type: nil)]
        case .orderTypes:
            return ItemSalesOrderType.allCases.map { ItemSalesFilterChoice(label: $0.label, chosen: draft == $0, type: $0) }
        }
    }

    /// A section opened: a search field, then a radio row for each choice. Long lists scroll inside it.
    private func options(_ section: ItemSalesFilterSection) -> some View {
        let enabled = section == .orderTypes
        let query = search.trimmed.lowercased()
        let all = choices(section)
        // As on the website, the search narrows every row, the "All …" row too.
        let shown = query.isEmpty ? all : all.filter { $0.label.lowercased().contains(query) }
        return VStack(spacing: 0) {
            ItemSalesSearchField(text: $search, enabled: enabled, name: section.searchName)
                .padding(.horizontal, 12)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(shown) { choice in
                        ItemSalesRadioRow(label: choice.label, chosen: choice.chosen, enabled: enabled) {
                            if let type = choice.type {
                                withAnimation(.snappy(duration: 0.2)) { draft = type }
                            }
                        }
                    }
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(height: min(CGFloat(shown.count) * 42, 280))
        }
    }
}

/// One radio row of an opened filter: its words, whether it is the chosen one, and the order type it stands for.
struct ItemSalesFilterChoice: Identifiable {
    let label: String
    let chosen: Bool
    let type: ItemSalesOrderType?

    var id: String { label }
}

/// The search field of an opened row: a 1 pt grey border, 12 pt corners and a magnifying glass, with no words (the photos').
struct ItemSalesSearchField: View {
    @Binding var text: String
    var enabled = true
    let name: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(enabled ? SettingsLook.muted : SettingsLook.greyed)
                .accessibilityHidden(true)
            TextField("", text: $text)
                .pfFont(16)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .disabled(!enabled)
                .accessibilityLabel(name)
        }
        .padding(.horizontal, 17)
        .frame(minHeight: 48)
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(enabled ? ItemSalesLook.fieldBorder : SettingsLook.border, lineWidth: 1)
        }
        .accessibilityValue(enabled ? "" : "Not available yet")
    }
}

/// A radio row of an opened filter (16 pt circle, 42 pt rows). Greyed and not tappable when that filter cannot change.
struct ItemSalesRadioRow: View {
    let label: String
    let chosen: Bool
    var enabled = true
    let pick: () -> Void

    var body: some View {
        Button(action: pick) {
            HStack(spacing: 13) {
                ZStack {
                    Circle()
                        .strokeBorder(ringColor, lineWidth: 1)
                    if chosen {
                        Circle()
                            .fill(enabled ? Theme.blue : SettingsLook.greyed)
                            .frame(width: 6, height: 6)
                    }
                }
                .frame(width: 16, height: 16)
                .accessibilityHidden(true)
                Text(label)
                    .pfFont(16)
                    .foregroundStyle(enabled ? Color.primary : SettingsLook.greyed)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            .padding(.leading, 17)
            .frame(maxWidth: .infinity, minHeight: 42, maxHeight: 42)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityAddTraits(chosen ? [.isSelected] : [])
        .accessibilityValue(enabled ? "" : "Not available yet")
    }

    private var ringColor: Color {
        guard enabled else { return SettingsLook.greyed }
        return chosen ? Theme.blue : SettingsLook.muted
    }
}
