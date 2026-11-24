import SwiftUI

// Settings → Transactions → Orders, Order receipts and Order types (E13), from the owner's photos.

/// Orders ("Orders Options" in the photo): the business's order settings. Two of them decide how the Sale screen builds an order
/// (ordering.sale on the server) and one is the website's "Let customers add notes" (ordering.allowNotes). They belong to the
/// business, so every phone and the website show and change the same values.
struct OrdersOptionsPage: View {
    @Environment(AppModel.self) private var model
    @State private var settings = TransactionsSettings()
    @State private var editing = false

    private var siteID: String { model.site?.id ?? "" }

    var body: some View {
        SettingsPage(title: "Orders", backLink: true, heading: "Orders Options", intro: [
            .text("Make order taking simple and efficient. Adjust order number and order receipt settings in the "),
            .link("Order Receipts", { model.shell.cover = .settingsPage(.orderReceipts) }),
            .text(" page."),
        ], refresh: { await settings.load(siteID: siteID) }) {
            // 32 pt from the heading row to the settings, as in the photo.
            SettingsCard(title: "Customize orders", pencil: .circle(action: settings.loaded ? openEditor : nil), spacing: 32) {
                if settings.loaded {
                    grid
                } else {
                    TxLoading(problem: settings.problem) { Task { await settings.load(siteID: siteID) } }
                }
            }
        }
        .task { await settings.load(siteID: siteID) }
        .sheet(isPresented: $editing) {
            CustomizeOrdersSheet(siteID: siteID, settings: settings) { group, stay in
                // The Sale screen of this business follows straight away; other phones pick it up when they next load.
                model.shell.order.groupItems = group
                model.shell.order.stayInCategory = stay
            }
        }
    }

    private func openEditor() {
        editing = true
    }

    /// Two columns, each setting a bold name over its pill, like the photo.
    private var grid: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 16) {
                cell("Automatically group similar items", on: settings.groupItems)
                cell("Allow notes on orders", on: settings.allowNotes)
            }
            HStack(alignment: .top, spacing: 16) {
                cell("Stay in category after adding an item to an order", on: settings.stayInCategory)
                Color.clear
                    .frame(height: 0)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private func cell(_ label: String, on: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .pfFont(16, .bold)
                .foregroundStyle(Color.primary)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
            TxPill(on: on)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// The "Customize orders" sheet: the three settings as switches. Saving reads the business's latest settings, changes only the
/// switches the person changed and sends them back with the fingerprint the server gave, so a setting changed elsewhere in the
/// meantime (on the website or another phone) keeps that change.
private struct CustomizeOrdersSheet: View {
    let siteID: String
    let settings: TransactionsSettings
    let saved: (Bool, Bool) -> Void

    /// The three values as the sheet showed them when it opened (or after it showed the latest ones): what Save compares against.
    private struct Values: Equatable {
        var group: Bool
        var notes: Bool
        var stay: Bool
    }

    @Environment(\.dismiss) private var dismiss
    @State private var start: Values
    @State private var groupItems: Bool
    @State private var allowNotes: Bool
    @State private var stayInCategory: Bool
    @State private var saving = false
    @State private var note = ""
    @State private var noteIsError = false

    init(siteID: String, settings: TransactionsSettings, saved: @escaping (Bool, Bool) -> Void) {
        self.siteID = siteID
        self.settings = settings
        self.saved = saved
        _start = State(initialValue: Values(group: settings.groupItems, notes: settings.allowNotes, stay: settings.stayInCategory))
        _groupItems = State(initialValue: settings.groupItems)
        _allowNotes = State(initialValue: settings.allowNotes)
        _stayInCategory = State(initialValue: settings.stayInCategory)
    }

    private var changed: Bool {
        Values(group: groupItems, notes: allowNotes, stay: stayInCategory) != start
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Automatically group similar items", isOn: $groupItems)
                    Toggle("Allow notes on orders", isOn: $allowNotes)
                    Toggle("Stay in category after adding an item to an order", isOn: $stayInCategory)
                } footer: {
                    if !note.isEmpty {
                        Text(note)
                            .foregroundStyle(noteIsError ? Theme.error : Color.secondary)
                    }
                }
            }
            .tint(Theme.blue)
            .disabled(saving)
            .navigationTitle("Customize orders")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Save") { save() }
                            .disabled(!changed)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(saving)
    }

    private func save() {
        let group = groupItems, notes = allowNotes, stay = stayInCategory, was = start
        saving = true
        note = ""
        Task {
            // Only what changed here is written: the others keep whatever the business has now. (A switch changed both here and
            // elsewhere already holds the value chosen here: each has only two.)
            let result = await settings.saveOrdering(siteID: siteID) { ordering in
                if notes != was.notes { ordering["allowNotes"] = notes }
                if group != was.group || stay != was.stay {
                    var sale = ordering["sale"] as? [String: Any] ?? [:]
                    if group != was.group { sale["groupItems"] = group }
                    if stay != was.stay { sale["stayInCategory"] = stay }
                    ordering["sale"] = sale
                }
            }
            saving = false
            switch result {
            case .saved:
                Haptics.success()
                saved(settings.groupItems, settings.stayInCategory)
                dismiss()
            case .stale(let message):
                // Someone saved first: the switches show the latest settings, and Save is there to apply the change again.
                groupItems = settings.groupItems
                allowNotes = settings.allowNotes
                stayInCategory = settings.stayInCategory
                start = Values(group: settings.groupItems, notes: settings.allowNotes, stay: settings.stayInCategory)
                note = message
                noteIsError = false
            case .failed(let message):
                Haptics.error()
                note = message
                noteIsError = true
            }
        }
    }
}

/// Order receipts: every new order gets the next number on its own, and there is nothing else to customise yet.
struct OrderReceiptsPage: View {
    var body: some View {
        SettingsPage(title: "Order receipts", backLink: true, heading: "Order receipts") {
            SettingsCard(title: "Customize order receipts", pencil: .circle(action: nil), spacing: 32) {
                TxSettingRow(label: "Order numbers", value: "Automatic", muted: true, style: .orders)
            }
        }
    }
}

/// Order types: Processor Freedom has no custom order types; it tags each online order by how it was placed (pickup, curbside or
/// delivery), and the business turns those ways of ordering on or off on the website's Online ordering page.
struct OrderTypesPage: View {
    @Environment(AppModel.self) private var model
    @State private var settings = TransactionsSettings()
    @State private var web: String?

    private var siteID: String { model.site?.id ?? "" }

    var body: some View {
        SettingsPage(title: "Order types", backLink: true, heading: "Order types", intro: [
            .text("Order types help your team prepare orders such as pickup, curbside and delivery the right way. Processor Freedom creates "),
            .link("sales reports by order type.", { web = "r-types" }),
        ], refresh: { await settings.load(siteID: siteID) }) {
            // 20 pt between the cards, as in the photos.
            VStack(alignment: .leading, spacing: 20) {
                customTypes
                autoAssigned
            }
            // The ways of ordering are turned on or off on the Online ordering web page: load them again on the way back.
            .txWebPages($web) { Task { await settings.load(siteID: siteID) } }
        }
        .task { await settings.load(siteID: siteID) }
    }

    private var customTypes: some View {
        SettingsCard(title: "Custom order types", spacing: 28) {
            // Search and add, greyed: custom order types are not available yet. They stop 18 pt short of the edge, as in the photo.
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                TxCircleButton(symbol: "magnifyingglass", label: "Search custom order types")
                TxCircleButton(symbol: "plus", fill: Theme.blue, tint: .white, size: 22, label: "Add a custom order type")
            }
            .padding(.trailing, 18)
            VStack(spacing: 16) {
                Text("No custom order types found.")
                    .pfFont(16, .bold)
                Text("Custom order types aren't available yet.")
                    .pfFont(16)
            }
            .foregroundStyle(Color.primary)
            .multilineTextAlignment(.center)
            .lineSpacing(5)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .padding(.vertical, 19)
            .background(SettingsLook.page)
        }
    }

    private var autoAssigned: some View {
        SettingsCard(spacing: 30) {
            TxCardHeading(title: "Auto-assigned order types", note: [
                .text("Processor Freedom assigns these automatically from how customers order online. Turn them on or off in "),
                .link("Online ordering", { web = "ordering" }),
                .text("."),
            ])
            VStack(alignment: .leading, spacing: 7) {
                Text("Order types")
                    .pfFont(16, .bold)
                    .foregroundStyle(Color.primary)
                if !settings.loaded {
                    TxLoading(problem: settings.problem) { Task { await settings.load(siteID: siteID) } }
                } else if settings.methodsOn.isEmpty {
                    Text("None turned on")
                        .pfFont(16)
                        .foregroundStyle(SettingsLook.muted)
                } else {
                    TxFlowLayout(spacing: 8, lineSpacing: 8) {
                        ForEach(settings.methodsOn, id: \.self) { method in
                            TxTag(text: method)
                        }
                    }
                }
            }
        }
    }
}
