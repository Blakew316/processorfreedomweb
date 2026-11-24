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
/// The row last tapped keeps the photos' grey fill and focus ring. Only Order Types can change the report: the server cannot narrow
/// item sales by employee, and Processor Freedom has no point-of-sale devices, so those two show their true value, all of them, greyed.
struct ItemSalesFiltersPanel: View {
    let report: ItemSalesModel
    let siteID: String
    let close: () -> Void

    @State private var draft: ItemSalesOrderType
    @State private var open: ItemSalesFilterSection? = nil
    @State private var focused: ItemSalesFilterSection? = nil
    @State private var search = ""

    init(report: ItemSalesModel, siteID: String, close: @escaping () -> Void) {
        self.report = report
        self.siteID = siteID
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
                        if section != .orderTypes || open == section {
                            Rectangle().fill(SettingsLook.border).frame(height: 1)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)
            Rectangle().fill(SettingsLook.border).frame(height: 1)
            buttons
        }
        .background(Color(.systemBackground).ignoresSafeArea())
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { close() }
        .task {
            if !report.peopleLoaded { await report.loadPeople(siteID: siteID) }
        }
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
            .padding(.trailing, -9)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    /// "Show results" (brand blue) uses the chosen order type; "Reset filters" (grey) goes back to all of them.
    private var buttons: some View {
        VStack(spacing: 8) {
            Button("Show results") {
                report.chooseOrderType(draft)
                close()
            }
            .buttonStyle(SolidButtonStyle(fill: Theme.blue, text: ItemSalesLook.onBlue, radius: 24, height: 48, size: 16.5))
            Button("Reset filters") {
                withAnimation(.snappy(duration: 0.2)) { draft = .all }
            }
            .buttonStyle(SolidButtonStyle(fill: SettingsLook.border, text: .primary, radius: 24, height: 48, size: 16.5))
        }
        .padding(.horizontal, 12)
        .padding(.top, 17)
        .padding(.bottom, 11)
    }

    // MARK: A row and what it opens

    private func toggle(_ section: ItemSalesFilterSection) {
        withAnimation(.snappy(duration: 0.25)) {
            focused = section
            open = open == section ? nil : section
            search = ""
        }
    }

    @ViewBuilder
    private func sectionView(_ section: ItemSalesFilterSection) -> some View {
        let isOpen = open == section
        let isFocused = focused == section
        VStack(spacing: 0) {
            Button {
                toggle(section)
            } label: {
                HStack(spacing: 12) {
                    Text(section.title)
                        .pfFont(16.5, .semibold)
                        .foregroundStyle(Color.primary)
                    Spacer(minLength: 8)
                    ItemSalesChevron(up: isOpen)
                        .padding(.trailing, 4.3)
                }
                .padding(.horizontal, 14)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background {
                    if isFocused {
                        // The grey of the focused row, inside a white band that the focus ring is drawn on.
                        ZStack {
                            RoundedRectangle(cornerRadius: 16, style: .circular)
                                .fill(Color(.systemBackground))
                                .padding(-4)
                            RoundedRectangle(cornerRadius: 12, style: .circular)
                                .fill(SettingsLook.border)
                        }
                    }
                }
                .contentShape(Rectangle())
                .modifier(ItemSalesFocusRing(shown: isFocused, across: 4, down: 4))
            }
            .buttonStyle(.plain)
            .accessibilityValue(value(of: section))
            .accessibilityHint(isOpen ? "Closes the list" : "Opens the list")
            if isOpen {
                options(section)
                    .padding(.top, 8)
                    .padding(.bottom, 4)
                    .transition(.opacity)
            }
        }
        .zIndex(isFocused ? 1 : 0)
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
            let everyone = [ItemSalesFilterChoice(id: "all", label: "All Employees", chosen: true, type: nil)]
            return everyone + report.people.map { name in ItemSalesFilterChoice(id: "person-\(name)", label: name, chosen: false, type: nil) }
        case .devices:
            return [ItemSalesFilterChoice(id: "all", label: "All Devices", chosen: true, type: nil)]
        case .orderTypes:
            return ItemSalesOrderType.allCases.map { type in ItemSalesFilterChoice(id: type.rawValue, label: type.label, chosen: draft == type, type: type) }
        }
    }

    /// A section opened: a search field, then a radio row for each choice. Long lists scroll inside it.
    private func options(_ section: ItemSalesFilterSection) -> some View {
        let enabled = section == .orderTypes
        let words = search.trimmed.lowercased()
        let all = choices(section)
        // As on the website, the search narrows every row, the "All …" row too.
        let shown = words.isEmpty ? all : all.filter { $0.label.lowercased().contains(words) }
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
            .frame(height: min(CGFloat(shown.count) * 42, 281))
        }
    }
}

/// One radio row of an opened filter: its words, whether it is the chosen one, and the order type it stands for.
struct ItemSalesFilterChoice: Identifiable {
    let id: String
    let label: String
    let chosen: Bool
    let type: ItemSalesOrderType?
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
                .pfFont(16.5)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .disabled(!enabled)
                .accessibilityLabel(name)
                .accessibilityValue(enabled ? text : "Not available yet")
        }
        .padding(.horizontal, 17)
        .frame(minHeight: 48)
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .circular)
                .strokeBorder(enabled ? ItemSalesLook.fieldBorder : SettingsLook.border, lineWidth: 1)
        }
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
                    .pfFont(16.5)
                    .foregroundStyle(enabled ? Color.primary : SettingsLook.greyed)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            .padding(.leading, 17)
            .frame(maxWidth: .infinity, minHeight: 42)
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
