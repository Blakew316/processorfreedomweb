import SwiftUI
import UIKit

/// The look of the full-screen Settings pages, measured from the owner's Clover photos
/// (1125 x 2436 px screenshots of a 375 x 812 pt phone, so 3 px = 1 pt), with Clover's green rebranded to Processor Freedom's blue and navy.
enum SettingsLook {
    /// #F9F9F9 behind the cards (black in dark mode).
    static let page = Color(light: UIColor(hex: 0xF9F9F9), dark: .systemGroupedBackground)
    /// White cards (the grouped card colour in dark mode).
    static let card = Color(light: .white, dark: .secondarySystemGroupedBackground)
    /// #E3E3E3: the 1 pt card border and the grey circle behind a pencil.
    static let border = Color(light: UIColor(hex: 0xE3E3E3), dark: UIColor(hex: 0x38383A))
    /// #4D4D4D: descriptions, values and notes.
    static let muted = Color(light: UIColor(hex: 0x4D4D4D), dark: UIColor(hex: 0xAEAEB2))
    /// An "On" pill: light blue with navy text (Clover's light green with dark green text, rebranded).
    static let onFill = Color(light: UIColor(hex: 0xE8F1FC), dark: UIColor(hex: 0x1D4F9E, alpha: 0.32))
    static let onText = Color(light: UIColor(hex: 0x0A1F44), dark: .white)
    /// An "Off" pill: #F9F9F9 with #2E2E2E text, as in the photos.
    static let offFill = Color(light: UIColor(hex: 0xF9F9F9), dark: UIColor(hex: 0x2C2C2E))
    static let offText = Color(light: UIColor(hex: 0x2E2E2E), dark: UIColor(hex: 0xD1D1D6))
    /// Rows and values for things Processor Freedom does not do yet.
    static let greyed = Color(.tertiaryLabel)
    /// Added between the lines of a card title that runs onto two: they are 28 pt apart in the photos, and the 20 pt bold
    /// title's own lines are 24.3 pt apart.
    static let titleLineSpacing: CGFloat = 3.67
}

/// A native Settings page: shown full screen over everything with `ShellCover.settingsPage`, or pushed onto the tab with
/// `Route.settingsPage`.
enum SettingsPageID: String, Identifiable, CaseIterable {
    // Settings → About your business, and Services and appointments
    case businessInformation, closeoutSettings, appointmentBooking
    // Settings → Transactions
    case ordersOptions, orderReceipts, orderTypes, payments, paymentReceipts, invoiceNumber, invoicesEstimates, manualCardEntry
    // Settings → Transactions → PF Sites settings
    case paymentNote, quickSale, carbonCopyReceipts, tapToPay
    // Settings → Business operations → Inventory, and its PF Sites settings
    case inventory, itemImages, customItemName

    var id: String { rawValue }
}

/// Shows the page for an id. The pages live in their own files.
struct SettingsPageHost: View {
    let id: SettingsPageID

    var body: some View {
        switch id {
        case .businessInformation: BusinessInformationPage()
        case .closeoutSettings: CloseoutSettingsPage()
        case .appointmentBooking: AppointmentBookingPage()
        case .ordersOptions: OrdersOptionsPage()
        case .orderReceipts: OrderReceiptsPage()
        case .orderTypes: OrderTypesPage()
        case .payments: PaymentsSettingsPage()
        case .paymentReceipts: PaymentReceiptsPage()
        case .invoiceNumber: InvoiceNumberPage()
        case .invoicesEstimates: InvoicesEstimatesPage()
        case .manualCardEntry: ManualCardEntryPage()
        case .paymentNote: PaymentNotePage()
        case .quickSale: QuickSalePage()
        case .carbonCopyReceipts: CarbonCopyReceiptsPage()
        case .tapToPay: TapToPayPage()
        case .inventory: InventorySettingsPage()
        case .itemImages: ItemImagesPage()
        case .customItemName: CustomItemNamePage()
        }
    }
}

/// The full-screen Settings page from the photos: a bare X at the top left and the page name bold in the middle of the bar,
/// then a light grey panel (only its top-left corner rounded, like Clover's) holding white cards.
/// Some pages (Orders, Order receipts, Order types, Inventory) also start with a "← Settings" link (it closes the page, like
/// the X) and a large heading.
/// It has its own navigation stack, so a page can push a back-office web page inside it.
/// Measured from the photos, from the bar's lower edge: the link's middle 33 pt down; a heading's baseline 42 pt down (96 when
/// the link is above it); a description's first baseline 28 pt under the heading's, on 24 pt lines; and the first card 26 pt
/// under the last baseline before it.
struct SettingsPage<Content: View>: View {
    let title: String
    var backLink = false
    var heading: String? = nil
    var intro: [SettingsTextPart] = []
    /// The description's size: 16 pt, or 17.5 pt for the business name under Business information's heading.
    var introSize: CGFloat = 16
    var refresh: (() async -> Void)? = nil
    @ViewBuilder let content: () -> Content

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if backLink {
                        SettingsBackLink(title: "Settings", label: "Back to Settings") { dismiss() }
                            .padding(.top, 4)
                    }
                    if heading != nil || !intro.isEmpty {
                        VStack(alignment: .leading, spacing: 7) {
                            if let heading {
                                Text(heading)
                                    .pfFont(24, .bold, relativeTo: .title)
                                    .foregroundStyle(Color.primary)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .accessibilityAddTraits(.isHeader)
                            }
                            if !intro.isEmpty {
                                SettingsLinkedText(parts: intro, size: introSize)
                            }
                        }
                        .padding(.top, backLink ? 7.5 : 0)
                        .padding(.bottom, intro.isEmpty ? -1.5 : 0)
                    }
                    content()
                }
                .padding(.horizontal, 16)
                .padding(.top, 19)
                .padding(.bottom, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .modifier(SettingsPanel())
            }
            .background(Color(.systemBackground))
            .scrollEdgeEffectStyle(.hard, for: .top)
            .modifier(SettingsRefresh(action: refresh))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { SettingsCloseBar(title: title) { dismiss() } }
            .steadyNavigationBar()
        }
    }
}

/// The bar of a full-screen Settings page, as on the app's other full-screen pages (Closeout, Insights, Items): the photos' bare
/// X, its centre 28 pt from the edge with no glass circle behind it, and the page name bold in the middle.
struct SettingsCloseBar: ToolbarContent {
    let title: String
    let close: () -> Void

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(Color.primary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .offset(x: -10)
            .accessibilityLabel("Close")
        }
        .sharedBackgroundVisibility(.hidden)
        ToolbarItem(placement: .principal) {
            Text(title)
                .pfFont(19, .bold, relativeTo: .headline)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
        }
    }
}

/// The grey panel behind a full-screen page's cards: only its top-left corner is rounded (a 24 pt quarter circle, measured on
/// the photos), and on a short page it still reaches down to 60 pt above the home indicator's strip, as in the photos (white
/// below it).
struct SettingsPanel: ViewModifier {
    func body(content: Content) -> some View {
        ZStack(alignment: .top) {
            Color.clear
                .containerRelativeFrame(.vertical) { length, _ in max(0, length - 60) }
            content
        }
        .background(SettingsLook.page, in: UnevenRoundedRectangle(topLeadingRadius: 24, style: .circular))
    }
}

/// The "← Settings" link at the top of a page: the arrow 24.7 pt from the screen's edge and the words 53.7 pt, as in the photos.
/// The place to tap is taller than the words, without moving anything.
struct SettingsBackLink: View {
    let title: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Image(systemName: "arrow.left")
                    .font(.system(size: 20, weight: .regular))
                    .frame(width: 20)
                Text(title)
                    .pfFont(17, .medium)
            }
            .foregroundStyle(Color.primary)
            .padding(.leading, 8)
            .padding(.trailing, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -12)
        .accessibilityLabel(label)
    }
}

/// Loads a page's values when it appears, and again each time the app comes back to the front or is unlocked, so a change made
/// on the website or on another phone meanwhile shows here too (one synced system). Nothing loads while the app is locked or away.
struct SettingsLoads: ViewModifier {
    let action: () async -> Void
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    private struct Key: Hashable {
        let active: Bool
        let ready: Bool
        let site: String
    }

    func body(content: Content) -> some View {
        content.task(id: Key(active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            guard scenePhase == .active, model.phase == .ready else { return }
            await action()
        }
    }
}

extension View {
    /// Runs `action` when the page appears and whenever the app returns to the front or is unlocked.
    func settingsLoads(_ action: @escaping () async -> Void) -> some View {
        modifier(SettingsLoads(action: action))
    }
}

/// Pull to refresh only for pages that load something.
private struct SettingsRefresh: ViewModifier {
    let action: (() async -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let action {
            content.refreshable { await action() }
        } else {
            content
        }
    }
}

/// The edit button at a card's top right: a pencil in a 48 pt grey circle (Orders Options, Order receipts, Inventory). Without an
/// action it is drawn at 40% and does nothing: nothing there can be changed yet.
enum SettingsPencil {
    case none
    case circle(action: (() -> Void)?)

    var shows: Bool {
        if case .none = self { return false }
        return true
    }

    var isCircle: Bool {
        if case .circle = self { return true }
        return false
    }
}

/// A white card with a 1 pt border and 24 pt corners (plain quarter circles: the photos' corners fit one within a pixel).
/// The title is 20 pt bold; the pencil sits at the top right.
/// Beside the pencil in its grey circle the title is centred on the circle, which starts 13 pt into the card (the photos).
struct SettingsCard<Content: View>: View {
    var title: String? = nil
    var pencil: SettingsPencil = .none
    var spacing: CGFloat = 24
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            if title != nil || pencil.shows {
                // The title may run to within 12 pt of the pencil, as in the photo (13 pt there). A gap on each side of the
                // spacer as well made that 32 pt, and "Customize order receipts" broke onto two lines where the photo has one.
                HStack(alignment: .top, spacing: 0) {
                    if let title {
                        Text(title)
                            .pfFont(20, .bold, relativeTo: .title3)
                            .foregroundStyle(Color.primary)
                            .lineSpacing(SettingsLook.titleLineSpacing)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                            .padding(.top, pencil.isCircle ? 6 : 0)
                    }
                    Spacer(minLength: 12)
                    pencilButton
                }
            }
            content()
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 24, style: .circular))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .circular)
                .strokeBorder(SettingsLook.border, lineWidth: 1)
        }
    }

    @ViewBuilder
    private var pencilButton: some View {
        switch pencil {
        case .none:
            EmptyView()
        case .circle(let action):
            Button { action?() } label: {
                Image(systemName: "pencil")
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(Color.primary)
                    .frame(width: 48, height: 48)
                    .background(SettingsLook.border, in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(action == nil)
            .opacity(action == nil ? 0.4 : 1)
            .padding(.top, -7)
            .accessibilityLabel(title.map { "Edit \($0)" } ?? "Edit")
            .accessibilityValue(action == nil ? "Not available yet" : "")
        }
    }
}

/// A setting: its name in bold over its value, with an optional muted note between them (the Payments photos).
/// Greyed for things Processor Freedom does not do yet; then the value is usually "Not available yet".
struct SettingsValueRow: View {
    let label: String
    var value: String? = nil
    var note: String? = nil
    var greyed = false
    var labelSize: CGFloat = 18

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .pfFont(labelSize, .bold)
                .foregroundStyle(greyed ? SettingsLook.greyed : Color.primary)
            if let note {
                Text(note)
                    .pfFont(16)
                    .foregroundStyle(greyed ? SettingsLook.greyed : SettingsLook.muted)
            }
            if let value {
                Text(value)
                    .pfFont(16)
                    .foregroundStyle(greyed ? SettingsLook.greyed : SettingsLook.muted)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// A piece of a description: plain text, or a blue link that runs an action. Most links are underlined in the photos; two on
/// Business information ("payment receipts" and the privacy act) are blue without a line, which is `plainLink`.
enum SettingsTextPart {
    case text(String)
    case link(String, () -> Void)
    case plainLink(String, () -> Void)

    /// What a link runs when it is tapped (nil for plain text).
    var action: (() -> Void)? {
        switch self {
        case .text: return nil
        case .link(_, let run), .plainLink(_, let run): return run
        }
    }
}

/// A muted paragraph with links in it, like "… in the Order Receipts page." in the photos: 16 pt on 24 pt lines.
struct SettingsLinkedText: View {
    let parts: [SettingsTextPart]
    var size: CGFloat = 16
    var color: Color = SettingsLook.muted
    /// Added to the font's own 19 pt line: 5 makes the photos' 24 pt lines.
    var lineSpacing: CGFloat = 5

    var body: some View {
        Text(attributed)
            .pfFont(size)
            .foregroundStyle(color)
            .tint(Theme.blue)
            .lineSpacing(lineSpacing)
            .fixedSize(horizontal: false, vertical: true)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == "pfsettings", let index = Int(url.host() ?? ""), parts.indices.contains(index),
                      let run = parts[index].action else { return .discarded }
                run()
                return .handled
            })
    }

    private var attributed: AttributedString {
        var out = AttributedString()
        for (index, part) in parts.enumerated() {
            switch part {
            case .text(let words):
                out += AttributedString(words)
            case .link(let words, _):
                var link = AttributedString(words)
                link.link = URL(string: "pfsettings://\(index)")
                // Named in full: with UIKit imported too, `underlineStyle` could be SwiftUI's or UIKit's, and would not compile.
                link[AttributeScopes.SwiftUIAttributes.UnderlineStyleAttribute.self] = .single
                link.foregroundColor = Theme.blue
                out += link
            case .plainLink(let words, _):
                var link = AttributedString(words)
                link.link = URL(string: "pfsettings://\(index)")
                link.foregroundColor = Theme.blue
                out += link
            }
        }
        return out
    }
}
