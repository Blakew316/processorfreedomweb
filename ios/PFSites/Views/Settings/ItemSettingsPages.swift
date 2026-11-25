import SwiftUI
import UIKit

// Settings → Business operations → Inventory, and the "PF Sites settings" under it (Clover's "Clover Go settings"): Item images
// and Custom item name, from the owner's photos (1125 x 2436 px of a 375 x 812 pt phone, 3 px = 1 pt).

// MARK: - Inventory

/// Inventory → Item settings → Stock tracking. Processor Freedom always counts stock: every order takes it down, a refund or a
/// cancelled order puts it back, and an order can never take more than there is (the server answers "Only N of X left"), so an
/// item shows as sold out at zero. The card shows those true values; none of them can be switched off, so the edit sheet shows them
/// greyed.
struct InventorySettingsPage: View {
    @State private var editing = false

    var body: some View {
        SettingsPage(title: "Inventory", backLink: true, heading: "Item settings") {
            // As in the photo: the first name's baseline 103 pt into the card, and the card ends 13 pt under the last pill.
            SettingsCard(title: "Stock tracking", pencil: .circle(action: { editing = true }), spacing: 27) {
                VStack(alignment: .leading, spacing: 0) {
                    row("Track stock", on: StockTracking.trackStock)
                    hairline
                    row("Automatically update item counts", on: StockTracking.autoUpdate)
                    hairline
                    row("Allow negative stock counts", on: StockTracking.allowNegative)
                }
                .padding(.bottom, -7)
            }
        }
        .sheet(isPresented: $editing) {
            StockTrackingSheet()
        }
    }

    /// The line between two settings: 12 pt under a pill and 14 pt over the next name.
    private var hairline: some View {
        Rectangle()
            .fill(SettingsLook.border)
            .frame(height: 1)
            .padding(.top, 12)
            .padding(.bottom, 14.33)
            .accessibilityHidden(true)
    }

    /// A setting as the photo shows it: the name in bold over its On or Off pill (the photo's darker grey when off).
    private func row(_ label: String, on: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .pfFont(16, .bold)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
            TxPill(text: on ? "On" : "Off", on: on, solid: true)
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

/// The Stock tracking sheet from the photo: the title with the circled X, the three settings each under its bold heading with its
/// switch, name and note, and Cancel and Save at the foot. The switches show Processor Freedom's fixed behaviour and cannot be
/// changed, so they are drawn as the photo draws a switch that cannot be changed, and Save stays pale.
/// Measured from the photo: a 53 pt title row; each heading's baseline 55 pt under the line above the first and 53 pt under the
/// note before it; the switch 21 pt under the heading's baseline, its name beside it and the note under the name on 22 pt lines.
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
            .padding(.top, 5)
            .padding(.bottom, 4)

            line

            ScrollView {
                VStack(alignment: .leading, spacing: 31.67) {
                    setting("Track stock", on: StockTracking.trackStock,
                            note: "This allows you to set stock counts for your items. Each order takes the count down, and an item shows as sold out at zero.")
                    setting("Automatically update item counts", on: StockTracking.autoUpdate,
                            note: "Orders, refunds and cancelled orders update item counts automatically. Track stock must be active.")
                    setting("Allow negative stock counts", on: StockTracking.allowNegative,
                            note: "Stock counts never drop below zero: an order can't take more items than you have.")
                }
                .padding(.leading, 35)
                .padding(.trailing, 35)
                .padding(.top, 37.33)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            line
            HStack(spacing: 16) {
                Button("Cancel") { dismiss() }
                    .buttonStyle(StockSheetButtonStyle(kind: .cancel))
                Button("Save") {}
                    .buttonStyle(StockSheetButtonStyle(kind: .save))
                    .disabled(true)
                    .accessibilityValue("Nothing to save")
            }
            .padding(.top, 16)
            .padding(.bottom, 12)
        }
        .background(Color(.systemBackground))
        .presentationDetents([.large])
    }

    private var line: some View {
        Rectangle()
            .fill(SettingsLook.border)
            .frame(height: 1)
            .accessibilityHidden(true)
    }

    /// One setting: its bold heading, then the switch with the setting's name beside it and its note under the name, greyed
    /// because it is fixed.
    private func setting(_ title: String, on: Bool, note: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .pfFont(18.5, .bold)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .center, spacing: 12) {
                    StockSwitchMark(on: on)
                    Text(title)
                        .pfFont(15)
                        .foregroundStyle(SettingsLook.greyed)
                        .lineSpacing(7)
                        .fixedSize(horizontal: false, vertical: true)
                }
                // A size down from the name above it, as in the photo (capitals 10 pt tall there against the name's 11).
                Text(note)
                    .pfFont(13.6)
                    .foregroundStyle(SettingsLook.greyed)
                    .lineSpacing(4.4)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, StockSwitchMark.width + 12)
            }
            .padding(.leading, 12)
            .padding(.top, 16.33)
            .accessibilityElement(children: .combine)
            .accessibilityValue(on ? "On" : "Off")
            .accessibilityHint("This cannot be changed.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The photo's small switch (40 x 24 pt) as it is drawn when it cannot be changed: a pale track and a dark 20 pt knob, with a tick
/// in the knob when it is on.
private struct StockSwitchMark: View {
    static let width: CGFloat = 40
    let on: Bool

    private static let track = Color(light: UIColor(hex: 0xC4C4C4), dark: UIColor(hex: 0x48484A))
    private static let knob = Color(light: UIColor(hex: 0x2E2E2E), dark: UIColor(hex: 0xAEAEB2))
    private static let tick = Color(light: .white, dark: UIColor(hex: 0x1C1C1E))

    var body: some View {
        ZStack(alignment: on ? .trailing : .leading) {
            Capsule()
                .fill(Self.track)
            Circle()
                .fill(Self.knob)
                .frame(width: 20, height: 20)
                .overlay {
                    if on {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Self.tick)
                    }
                }
                .padding(2)
        }
        .frame(width: Self.width, height: 24)
        .accessibilityHidden(true)
    }
}

/// The sheet's Cancel (grey) and Save (pale until there is something to save) buttons: 50 pt tall with 8 pt corners, as wide as
/// their words and 17 pt either side.
private struct StockSheetButtonStyle: ButtonStyle {
    enum Kind { case cancel, save }
    let kind: Kind
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .pfFont(17, .semibold)
            .foregroundStyle(kind == .cancel ? Color.primary : (isEnabled ? Color.white : SettingsLook.greyed))
            .padding(.horizontal, 17)
            .frame(minHeight: 50)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(kind == .cancel ? SettingsLook.border : (isEnabled ? Theme.blue : SettingsLook.offFill)))
            .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

// MARK: - PF Sites settings

/// Item images: when on, the Sale screen shows each item's photo (ordering.sale.images on the server, so every phone of the
/// business shows the same).
struct ItemImagesPage: View {
    var body: some View {
        // The photo: the grey line's first baseline 21 pt under the bar, the switch 54 pt under it and 22 pt from the edge.
        SaleSwitchPage(title: "Item images", key: "images", label: "Enable item images", boldLabel: true,
                       intro: "Item images are used to easily identify an item in your inventory.", note: nil,
                       top: 7.33, switchInset: 6) { order, on in
            order.showImages = on
        }
    }
}

/// Custom item name: when on, a custom item on the Sale screen needs a name before it can be added (ordering.sale.customName on
/// the server, so every phone of the business does the same).
struct CustomItemNamePage: View {
    var body: some View {
        // The photo: the switch 16 pt under the bar and 13 pt from the edge, the grey line's first baseline 24 pt under the name's.
        SaleSwitchPage(title: "Custom item name", key: "customName", label: "Custom item name", boldLabel: false,
                       intro: nil, note: "Require an item name when creating a custom item.",
                       top: 16, switchInset: -3) { order, on in
            order.customNameRequired = on
        }
    }
}

/// A white page pushed onto the tab, as in the photos: the page name over the business name, one switch for one of the business's
/// Sale settings (ordering.sale.<key>), and Save at the foot. Saving reads the business's latest settings, changes only this one and
/// sends them back with the server's fingerprint, so anything changed elsewhere meanwhile is kept.
/// The grey lines are 14 pt #727272 on lines as tall as the type, as the photos set them.
private struct SaleSwitchPage: View {
    let title: String
    let key: String
    let label: String
    let boldLabel: Bool
    let intro: String?
    let note: String?
    /// From the bar to the first line of the page.
    let top: CGFloat
    /// How far the switch stands in from the page's 16 pt margin.
    let switchInset: CGFloat
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

    /// #727272, the photos' grey for these lines.
    private static let grey = Color(light: UIColor(hex: 0x727272), dark: UIColor(hex: 0x98989D))

    private var siteID: String { model.site?.id ?? "" }

    var body: some View {
        TxPlainPage(title: title, subtitle: (model.site?.name ?? "").uppercased(), margin: 16, top: top) {
            if let intro {
                Text(intro)
                    .pfFont(14)
                    .foregroundStyle(Self.grey)
                    .txLineHeight(14)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 18.67)
            }
            if settings.loaded {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 12) {
                        // The switch carries the name for VoiceOver.
                        Text(label)
                            .pfFont(boldLabel ? 15 : 16, boldLabel ? .semibold : .regular)
                            .foregroundStyle(Color.primary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityHidden(true)
                        Spacer(minLength: 8)
                        Toggle(label, isOn: $on)
                            .labelsHidden()
                            .tint(Theme.blue)
                            .disabled(saving)
                            .padding(.trailing, switchInset)
                    }
                    .frame(minHeight: 31)
                    if let note {
                        Text(note)
                            .pfFont(14)
                            .foregroundStyle(Self.grey)
                            .txLineHeight(14)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.trailing, 76)
                    }
                }
                .accessibilityElement(children: .combine)
            } else {
                TxLoading(problem: settings.problem) { Task { await load() } }
                    .frame(minHeight: 31)
            }
            // What went wrong with a save; or, quietly, that the latest values could not be fetched.
            let message = problem.isEmpty ? settings.reloadProblem : problem
            if !message.isEmpty {
                Text(message)
                    .pfFont(15)
                    .foregroundStyle(!problem.isEmpty && problemIsError ? Theme.error : SettingsLook.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 16)
                    .transition(.opacity)
            }
        } bottom: {
            // "Saved" only while nothing has been changed since: with a new change waiting, the button says what it will do.
            TxSaveButton(title: savedNote && on == shown ? "Saved" : "Save", enabled: settings.loaded && on != shown && !saving, busy: saving, size: 13.5) { save() }
        }
        .animation(.snappy, value: problem)
        .animation(.snappy, value: settings.reloadProblem)
        // Put back to what is saved, there is nothing left to save and nothing left to say about a save.
        .onChange(of: on) { _, now in
            if now == shown, !saving { problem = "" }
        }
        .settingsLoads { await load() }
        .refreshable { await load() }
    }

    /// The business's value for this setting; off when it has never been set.
    private func value(in ordering: JSON) -> Bool { ordering["sale"][key].bool }

    private func load() async {
        let before = shown
        let wasLoaded = settings.loaded
        await settings.load(siteID: siteID)
        guard settings.loaded, !saving else { return }
        // A save's message does not outlive a load that worked (the connection is back, or the app was unlocked again).
        if settings.reloadProblem.isEmpty { problem = "" }
        let latest = value(in: settings.ordering)
        // What the person switched stays while it differs from what was saved; otherwise the switch follows the server.
        if !wasLoaded || on == before { on = latest }
        shown = latest
    }

    private func save() {
        guard !saving else { return }
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
                AccessibilityNotification.Announcement("Saved").post()
                try? await Task.sleep(nanoseconds: 1_600_000_000)
                savedNote = false
            case .stale(let message):
                let now = value(in: settings.ordering)
                shown = now
                on = now
                problem = message
                problemIsError = false
                AccessibilityNotification.Announcement(message).post()
            case .failed(let message):
                Haptics.error()
                problem = message
                problemIsError = true
                AccessibilityNotification.Announcement(message).post()
            }
        }
    }
}
