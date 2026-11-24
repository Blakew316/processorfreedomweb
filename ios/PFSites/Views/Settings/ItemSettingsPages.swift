import SwiftUI

// Settings → Business operations → Inventory, and the "PF Sites settings" under it (Clover's "Clover Go settings"): Item images
// and Custom item name, from the owner's photos.

// MARK: - Inventory

/// Inventory → Item settings → Stock tracking. Processor Freedom always counts stock: every order takes it down, a refund or a
/// cancelled order puts it back, and an order can never take more than there is (the server answers "Only N of X left"), so an
/// item shows as sold out at zero. The card shows those true values; none of them can be switched off, so the edit sheet shows them
/// greyed.
struct InventorySettingsPage: View {
    @State private var editing = false

    var body: some View {
        SettingsPage(title: "Inventory", backLink: true, heading: "Item settings") {
            SettingsCard(title: "Stock tracking", pencil: .circle(action: { editing = true }), spacing: 32) {
                VStack(alignment: .leading, spacing: 0) {
                    row("Track stock", on: StockTracking.trackStock)
                    hairline
                    row("Automatically update item counts", on: StockTracking.autoUpdate)
                    hairline
                    row("Allow negative stock counts", on: StockTracking.allowNegative)
                }
            }
        }
        .sheet(isPresented: $editing) {
            StockTrackingSheet()
        }
    }

    private var hairline: some View {
        Rectangle()
            .fill(SettingsLook.border)
            .frame(height: 1)
            .padding(.vertical, 14)
            .accessibilityHidden(true)
    }

    /// A setting as the photo shows it: the name in bold over its On or Off pill.
    private func row(_ label: String, on: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(label)
                .pfFont(16, .bold)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
            TxPill(on: on)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// How Processor Freedom handles stock, for every business: fixed, so the pages show them as they are.
private enum StockTracking {
    static let trackStock = true
    static let autoUpdate = true
    static let allowNegative = false
}

/// The Stock tracking sheet from the photo: the title with the circled X, the three settings with their notes, and Cancel and Save
/// at the foot. The switches show Processor Freedom's fixed behaviour and cannot be changed, so Save stays pale.
private struct StockTrackingSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text("Stock tracking")
                    .pfFont(20, .bold, relativeTo: .title3)
                    .foregroundStyle(Color.primary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.primary)
                        .frame(width: 30, height: 30)
                        .overlay(Circle().strokeBorder(Theme.ink, lineWidth: 1.5))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.leading, 17)
            .padding(.trailing, 8)
            .padding(.vertical, 8)

            Rectangle()
                .fill(SettingsLook.border)
                .frame(height: 1)
                .accessibilityHidden(true)

            ScrollView {
                VStack(alignment: .leading, spacing: 34) {
                    setting("Track stock", on: StockTracking.trackStock,
                            note: "This allows you to set stock counts for your items. Each order takes the count down, and an item shows as sold out at zero.")
                    setting("Automatically update item counts", on: StockTracking.autoUpdate,
                            note: "Orders, refunds and cancelled orders update item counts automatically. Track stock must be active.")
                    setting("Allow negative stock counts", on: StockTracking.allowNegative,
                            note: "Stock counts never drop below zero: an order can't take more items than you have.")
                }
                .padding(.horizontal, 29)
                .padding(.top, 34)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Rectangle()
                .fill(SettingsLook.border)
                .frame(height: 1)
                .accessibilityHidden(true)
            HStack(spacing: 14) {
                Button("Cancel") { dismiss() }
                    .buttonStyle(StockSheetButtonStyle(kind: .cancel))
                Button("Save") {}
                    .buttonStyle(StockSheetButtonStyle(kind: .save))
                    .disabled(true)
            }
            .padding(.vertical, 14)
        }
        .background(Color(.systemBackground))
        .presentationDetents([.large])
    }

    /// One setting: its bold heading, then the switch with the setting's name and its note beside it, greyed because it is fixed.
    private func setting(_ title: String, on: Bool, note: String) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(title)
                .pfFont(20, .bold)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            HStack(alignment: .top, spacing: 16) {
                Toggle(title, isOn: .constant(on))
                    .labelsHidden()
                    .tint(Theme.blue)
                    .disabled(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .pfFont(17)
                        .foregroundStyle(SettingsLook.greyed)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(note)
                        .pfFont(16)
                        .foregroundStyle(SettingsLook.greyed)
                        .lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 4)
            }
            .accessibilityElement(children: .combine)
            .accessibilityValue(on ? "On" : "Off")
        }
    }
}

/// The sheet's Cancel (grey) and Save (pale until there is something to save) buttons.
private struct StockSheetButtonStyle: ButtonStyle {
    enum Kind { case cancel, save }
    let kind: Kind
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .pfFont(17, .semibold)
            .foregroundStyle(kind == .cancel ? Color.primary : (isEnabled ? Color.white : SettingsLook.greyed))
            .padding(.horizontal, 28)
            .frame(minHeight: 50)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(kind == .cancel ? Color(.systemGray5) : (isEnabled ? Theme.blue : Color(.systemGray6))))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

// MARK: - PF Sites settings

/// Item images: when on, the Sale screen shows each item's photo (ordering.sale.images on the server, so every phone of the
/// business shows the same).
struct ItemImagesPage: View {
    var body: some View {
        SaleSwitchPage(title: "Item images", key: "images", label: "Enable item images", boldLabel: true,
                       intro: "Item images are used to easily identify an item in your inventory.", note: nil) { order, on in
            order.showImages = on
        }
    }
}

/// Custom item name: when on, a custom item on the Sale screen needs a name before it can be added (ordering.sale.customName on
/// the server, so every phone of the business does the same).
struct CustomItemNamePage: View {
    var body: some View {
        SaleSwitchPage(title: "Custom item name", key: "customName", label: "Custom item name", boldLabel: false,
                       intro: nil, note: "Require an item name when creating a custom item.") { order, on in
            order.customNameRequired = on
        }
    }
}

/// A white page pushed onto the tab, as in the photos: the page name over the business name, one switch for one of the business's
/// Sale settings (ordering.sale.<key>), and Save at the foot. Saving reads the business's latest settings, changes only this one and
/// sends them back with the server's fingerprint, so anything changed elsewhere meanwhile is kept.
private struct SaleSwitchPage: View {
    let title: String
    let key: String
    let label: String
    let boldLabel: Bool
    let intro: String?
    let note: String?
    /// Brings this business's Sale screen in line straight away; other phones pick it up when they next load.
    let apply: (SaleModel, Bool) -> Void

    @Environment(AppModel.self) private var model
    @State private var settings = TransactionsSettings()
    @State private var on = false
    @State private var shown = false
    @State private var saving = false
    @State private var savedNote = false
    @State private var problem = ""
    @State private var problemIsError = true

    private var siteID: String { model.site?.id ?? "" }

    var body: some View {
        TxPlainPage(title: title, subtitle: (model.site?.name ?? "").uppercased(), margin: 16, top: 14) {
            if let intro {
                Text(intro)
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 26)
            }
            if settings.loaded {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        Text(label)
                            .pfFont(17, boldLabel ? .semibold : .regular)
                            .foregroundStyle(Color.primary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        Toggle(label, isOn: $on)
                            .labelsHidden()
                            .tint(Theme.blue)
                            .disabled(saving)
                    }
                    if let note {
                        Text(note)
                            .pfFont(16)
                            .foregroundStyle(SettingsLook.muted)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.trailing, 64)
                    }
                }
                .accessibilityElement(children: .combine)
            } else {
                TxLoading(problem: settings.problem) { Task { await load() } }
            }
            if !problem.isEmpty {
                Text(problem)
                    .pfFont(15)
                    .foregroundStyle(problemIsError ? Theme.error : SettingsLook.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 16)
            }
        } bottom: {
            TxSaveButton(title: savedNote ? "Saved" : "Save", enabled: settings.loaded && on != shown && !saving, busy: saving) { save() }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    /// The business's value for this setting; off when it has never been set.
    private func value(in ordering: JSON) -> Bool { ordering["sale"][key].bool }

    private func load() async {
        let before = shown
        let wasLoaded = settings.loaded
        await settings.load(siteID: siteID)
        guard settings.loaded else { return }
        let latest = value(in: settings.ordering)
        // What the person switched stays while it differs from what was saved; otherwise the switch follows the server.
        if !wasLoaded || on == before { on = latest }
        shown = latest
    }

    private func save() {
        let wanted = on
        let was = shown
        let key = key
        saving = true
        problem = ""
        Task {
            let result = await settings.saveOrdering(siteID: siteID, unchanged: { $0["sale"][key].bool == was }) { ordering in
                var sale = ordering["sale"] as? [String: Any] ?? [:]
                sale[key] = wanted
                ordering["sale"] = sale
            }
            saving = false
            switch result {
            case .saved:
                Haptics.success()
                let now = value(in: settings.ordering)
                shown = now
                on = now
                apply(model.shell.order, now)
                savedNote = true
                try? await Task.sleep(nanoseconds: 1_600_000_000)
                savedNote = false
            case .stale(let message):
                let now = value(in: settings.ordering)
                shown = now
                on = now
                problem = message
                problemIsError = false
            case .failed(let message):
                Haptics.error()
                problem = message
                problemIsError = true
            }
        }
    }
}
