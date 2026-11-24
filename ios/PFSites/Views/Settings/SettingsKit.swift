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
}

/// Which full-screen Settings page to show (presented over everything with `ShellCover.settingsPage`).
enum SettingsPageID: String, Identifiable, CaseIterable {
    // Settings → About your business, and Services and appointments
    case businessInformation, closeoutSettings, appointmentBooking
    // Settings → Transactions
    case ordersOptions, orderReceipts, orderTypes, payments, paymentReceipts, invoiceNumber, invoicesEstimates, manualCardEntry
    // Settings → Transactions → PF Sites settings
    case paymentNote, quickSale, carbonCopyReceipts, tapToPay

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
        }
    }
}

/// The full-screen Settings page from the photos: an X at the top left and the page name bold in the middle of the bar,
/// then a light grey panel (only its top-left corner rounded, like Clover's) holding white cards.
/// Pages under Transactions also start with a "← Settings" link (it closes the page, like the X) and a large heading.
/// It has its own navigation stack, so a page can push a back-office web page inside it.
struct SettingsPage<Content: View>: View {
    let title: String
    var backLink = false
    var heading: String? = nil
    var intro: [SettingsTextPart] = []
    var refresh: (() async -> Void)? = nil
    @ViewBuilder let content: () -> Content

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if backLink {
                        Button { dismiss() } label: {
                            HStack(spacing: 18) {
                                Image(systemName: "arrow.left")
                                    .font(.system(size: 20, weight: .regular))
                                Text("Settings")
                                    .pfFont(17, .medium)
                            }
                            .foregroundStyle(Color.primary)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Back to Settings")
                        .padding(.top, 4)
                    }
                    if heading != nil || !intro.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            if let heading {
                                Text(heading)
                                    .pfFont(24, .bold, relativeTo: .title)
                                    .foregroundStyle(Color.primary)
                                    .accessibilityAddTraits(.isHeader)
                            }
                            if !intro.isEmpty {
                                SettingsLinkedText(parts: intro)
                            }
                        }
                        .padding(.top, backLink ? 14 : 0)
                        .padding(.bottom, 6)
                    }
                    content()
                }
                .padding(.horizontal, 16)
                .padding(.top, 24)
                .padding(.bottom, 80)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SettingsLook.page, in: UnevenRoundedRectangle(topLeadingRadius: 20, style: .continuous))
            }
            .background(Color(.systemBackground))
            .scrollEdgeEffectStyle(.hard, for: .top)
            .modifier(SettingsRefresh(action: refresh))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close")
                }
                ToolbarItem(placement: .principal) {
                    Text(title)
                        .pfFont(19, .bold, relativeTo: .headline)
                        .lineLimit(1)
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .steadyNavigationBar()
        }
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

/// The edit button at a card's top right: Clover's plain pencil (Appointment booking, Payments) or a pencil in a 48 pt grey circle
/// (Orders Options). Without an action it is drawn at 40% and does nothing: nothing there can be changed yet.
enum SettingsPencil {
    case none
    case plain(action: (() -> Void)?)
    case circle(action: (() -> Void)?)

    var shows: Bool {
        if case .none = self { return false }
        return true
    }
}

/// A white card with a 1 pt border and 20 pt corners. The title is 20 pt bold; the pencil sits at the top right.
struct SettingsCard<Content: View>: View {
    var title: String? = nil
    var pencil: SettingsPencil = .none
    var spacing: CGFloat = 24
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            if title != nil || pencil.shows {
                HStack(alignment: .top, spacing: 12) {
                    if let title {
                        Text(title)
                            .pfFont(20, .bold, relativeTo: .title3)
                            .foregroundStyle(Color.primary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                    }
                    Spacer(minLength: 8)
                    pencilButton
                }
            }
            content()
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(SettingsLook.border, lineWidth: 1)
        }
    }

    @ViewBuilder
    private var pencilButton: some View {
        switch pencil {
        case .none:
            EmptyView()
        case .plain(let action):
            Button { action?() } label: {
                Image(systemName: "pencil")
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(Color.primary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(action == nil)
            .opacity(action == nil ? 0.4 : 1)
            .padding(.top, -10)
            .padding(.trailing, -12)
            .accessibilityLabel(title.map { "Edit \($0)" } ?? "Edit")
            .accessibilityValue(action == nil ? "Not available yet" : "")
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
            .padding(.top, -12)
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

/// The On / Off capsule from the Orders Options photo.
struct OnOffPill: View {
    let on: Bool
    var greyed = false

    var body: some View {
        Text(on ? "On" : "Off")
            .pfFont(16, .medium)
            .foregroundStyle(greyed ? SettingsLook.greyed : (on ? SettingsLook.onText : SettingsLook.offText))
            .padding(.horizontal, 13)
            .padding(.vertical, 6)
            .background(greyed ? SettingsLook.offFill : (on ? SettingsLook.onFill : SettingsLook.offFill), in: Capsule())
            .accessibilityLabel(on ? "On" : "Off")
    }
}

/// A light blue tag (the Order types photo): the ways of ordering that are turned on.
struct SettingsTag: View {
    let text: String

    var body: some View {
        Text(text)
            .pfFont(16, .medium)
            .foregroundStyle(SettingsLook.onText)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(SettingsLook.onFill, in: Capsule())
    }
}

/// A piece of a description: plain text, or an underlined blue link that runs an action.
enum SettingsTextPart {
    case text(String)
    case link(String, () -> Void)
}

/// A muted paragraph with links in it, like "… in the Order Receipts page." in the photos.
struct SettingsLinkedText: View {
    let parts: [SettingsTextPart]
    var size: CGFloat = 16
    var color: Color = SettingsLook.muted

    var body: some View {
        Text(attributed)
            .pfFont(size)
            .foregroundStyle(color)
            .tint(Theme.blue)
            .lineSpacing(4)
            .fixedSize(horizontal: false, vertical: true)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == "pfsettings", let index = Int(url.host() ?? ""), parts.indices.contains(index),
                      case .link(_, let run) = parts[index] else { return .discarded }
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
            }
        }
        return out
    }
}
