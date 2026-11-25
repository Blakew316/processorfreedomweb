import Observation
import SwiftUI

// Settings B: the pages under Settings → Transactions (E12–E17), built from the owner's Clover photos (1125 x 2436 px screenshots of
// a 375 x 812 pt phone, so 3 px = 1 pt). This file holds what those pages share; each page lives in its own file next to this one.

// MARK: - The business's settings

/// The business's settings as the server has them (`GET /api/sites/<id>`). A Transactions page that shows them loads them each time it
/// appears and on pull to refresh, so a change made on the website or on another phone shows up here too (one synced system).
@Observable @MainActor
final class TransactionsSettings {
    enum SaveResult {
        case saved
        case stale(String)   // someone saved first: the latest settings are showing now
        case failed(String)
    }

    /// What the server's 412 means on these pages.
    static let staleMessage = "This was changed on another device. Showing the latest settings."

    private(set) var ordering = JSON(nil)
    /// The business email customers see (Business information), where order copies go when no order email is set.
    private(set) var businessEmail = ""
    private(set) var loaded = false
    /// Why the settings could not be loaded. It only shows while there is nothing to show: a failed refresh keeps the values on screen.
    private(set) var problem = ""
    /// Why the settings could not be loaded again while the page already shows them: said in one quiet line, so values that may
    /// be out of date are not taken for fresh ones. It goes when a load works.
    private(set) var reloadProblem = ""
    /// Each load and save takes a number, so an answer that comes back after a newer one never puts older values on screen.
    @ObservationIgnored private var round = 0

    func load(siteID: String) async {
        guard !siteID.isEmpty else { return }
        // Try again after a failed first load: the spinner shows while it runs, not the old message.
        if !loaded { problem = "" }
        round += 1
        let mine = round
        do {
            let answer = try await API.get("/api/sites/\(siteID)")
            guard mine == round else { return }
            // An answer without the business in it is not its settings: taking it would show every switch at its default as
            // if that were what the business has.
            guard answer["site"].isObject else {
                let words = "Something went wrong. Please try again."
                if loaded { reloadProblem = words } else { problem = words }
                return
            }
            apply(answer["site"])
            problem = ""
        } catch let error as APIError {
            guard mine == round else { return }
            // A 403 is only a message (a team passcode opens one business); a 401 means the session ended: check, then lock.
            if error.status == 401 { AppModel.shared.sessionEnded() }
            if loaded { reloadProblem = error.message } else { problem = error.message }
        } catch {
            // Cancelled: the page went away, or is loading again.
        }
    }

    private func apply(_ site: JSON) {
        ordering = site["ordering"]
        businessEmail = site["draft"]["business"]["email"].string.trimmed
        loaded = true
        reloadProblem = ""
    }

    /// Saves a change to the business's ordering settings the way the website does: the latest settings and their fingerprint are
    /// read first, the change is made to them, and the server refuses the save (412) if someone else saved in between. Then the
    /// latest settings are loaded and shown, so nothing anyone saved is lost. `change` writes only what the person changed.
    /// `unchanged` says whether the latest settings still hold what the page showed for that; when someone changed it since,
    /// nothing is saved and the latest settings show instead, as after a 412.
    func saveOrdering(siteID: String, unchanged: ((JSON) -> Bool)? = nil, change: (inout [String: Any]) -> Void) async -> SaveResult {
        do {
            let site = try await API.get("/api/sites/\(siteID)")["site"]
            // An answer without the business in it says nothing about its settings: nothing is saved over it and nothing is shown
            // from it (it is not "changed on another device" either).
            guard site.isObject else { return .failed("Something went wrong. Please try again.") }
            if let unchanged, !unchanged(site["ordering"]) {
                round += 1
                apply(site)
                return .stale(Self.staleMessage)
            }
            guard var settings = site["ordering"].raw as? [String: Any] else { return .failed("Something went wrong. Please try again.") }
            change(&settings)
            let saved = try await API.send("PUT", "/api/sites/\(siteID)/ordering", body: ["ordering": settings, "rev": site["orderingRev"].string])
            round += 1
            apply(site)
            ordering = saved["ordering"].isObject ? saved["ordering"] : JSON(settings)
            return .saved
        } catch let error as APIError {
            if error.status == 412 {
                await load(siteID: siteID)
                return .stale(Self.staleMessage)
            }
            if error.status == 401 { AppModel.shared.sessionEnded() }
            return .failed(error.message)
        } catch {
            return .failed(APIError.unreachableMessage)
        }
    }

    // The values these pages show, with the server's own defaults (shared/core.js defaultOrdering) for a field it left out.

    /// ordering.sale.groupItems: tapping an item already in the Sale order adds to its quantity.
    var groupItems: Bool { flag(ordering["sale"]["groupItems"], or: true) }
    /// ordering.sale.stayInCategory: the Sale list keeps the chosen category after an item is added.
    var stayInCategory: Bool { flag(ordering["sale"]["stayInCategory"], or: false) }
    /// ordering.allowNotes: customers can add notes to online orders.
    var allowNotes: Bool { flag(ordering["allowNotes"], or: true) }
    /// ordering.enabled: the website takes orders ("Take orders on my website"). New businesses start with it off, and while it
    /// is off there is no online checkout and no way of ordering online (the server refuses orders, the website hides them).
    var orderingOn: Bool { ordering["enabled"].bool }
    /// ordering.tips: customers are asked for a tip at online checkout, which only exists while online ordering is on.
    var tipsOnline: Bool { orderingOn && flag(ordering["tips"], or: true) }
    /// ordering.notifyEmail: where copies of new orders, booking requests and the daily summary go.
    var notifyEmail: String { ordering["notifyEmail"].string.trimmed }

    /// The ways of ordering that are turned on, by the website's names, in the website's order; none while online ordering is off.
    var methodsOn: [String] {
        guard orderingOn else { return [] }
        return [("pickup", "Pickup"), ("curbside", "Curbside"), ("delivery", "Delivery")].filter { ordering["methods"][$0.0].bool }.map { $0.1 }
    }

    private func flag(_ value: JSON, or fallback: Bool) -> Bool { value.exists ? value.bool : fallback }
}

// MARK: - Measured looks

/// How a setting is drawn on each kind of page, measured from the photos: Payments and Invoices and estimates use an 18 pt bold
/// name over a 16 pt note or value; Payment receipts a 15 pt semibold name over a 15 pt note; the Orders pages a 16 pt bold name.
/// Notes run 24 pt from line to line, as in the photos.
struct TxRowStyle {
    var labelSize: CGFloat
    var labelWeight: Font.Weight
    var labelLineSpacing: CGFloat
    var noteSize: CGFloat
    var noteColor: Color
    var noteLineSpacing: CGFloat
    /// Between the name, the note and what comes under them.
    var gap: CGFloat

    static let payments = TxRowStyle(labelSize: 18, labelWeight: .bold, labelLineSpacing: 2.5, noteSize: 16, noteColor: SettingsLook.muted, noteLineSpacing: 5, gap: 9)
    static let receipts = TxRowStyle(labelSize: 15, labelWeight: .semibold, labelLineSpacing: 6, noteSize: 15, noteColor: .primary, noteLineSpacing: 6, gap: 11)
    static let orders = TxRowStyle(labelSize: 16, labelWeight: .bold, labelLineSpacing: 5, noteSize: 16, noteColor: SettingsLook.muted, noteLineSpacing: 5, gap: 9)
}

enum TxLook {
    /// Between two settings in a card (Payments, Invoices and estimates).
    static let rowGap: CGFloat = 37
    /// Between two settings in a Payment receipts card.
    static let receiptRowGap: CGFloat = 19
    /// Between a card's heading and its first setting.
    static let headingGap: CGFloat = 30
    /// The Payments and receipts cards leave about 31 pt under their last setting, more than the kit's 20.
    static let extraBottom: CGFloat = 11
}

// MARK: - Card pieces

/// A card's heading as these photos draw it: the 20 pt bold title, an optional muted note under it, and the pencil (or a chevron,
/// or an Enable button) at the right, centred on the title and note together.
struct TxCardHeading<Accessory: View>: View {
    let title: String
    var note: [SettingsTextPart] = []
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            // The note's first baseline is 28 pt under the title's, as in the photos.
            VStack(alignment: .leading, spacing: 7.67) {
                Text(title)
                    .pfFont(20, .bold, relativeTo: .title3)
                    .foregroundStyle(Color.primary)
                    .lineSpacing(SettingsLook.titleLineSpacing)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if !note.isEmpty {
                    SettingsLinkedText(parts: note)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            accessory()
        }
        // In the photos the heading sits on a 48 pt button row that starts 13 pt into the card (the card's padding is 20); a
        // heading with nothing beside it has its baseline 35 pt into the card.
        .padding(.top, Accessory.self == EmptyView.self ? -4 : -5)
    }
}

extension TxCardHeading where Accessory == EmptyView {
    init(title: String, note: [SettingsTextPart] = []) {
        self.init(title: title, note: note, accessory: { EmptyView() })
    }
}

/// Clover's plain pencil at a card's top right. Nothing on these pages can be changed from the app yet, so it is greyed (the
/// one grey of everything that is not available, as on the other Settings pages) and does nothing. The photos' pencil is
/// 19 to 20 pt across on Payments and Payment receipts, which is this symbol at 25.
struct TxPencil: View {
    let card: String
    var size: CGFloat = 25

    var body: some View {
        Button {} label: {
            Image(systemName: "pencil")
                .font(.system(size: size, weight: .regular))
                .foregroundStyle(SettingsLook.greyed)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(ItemsBareStyle())
        .disabled(true)
        .accessibilityLabel("Edit \(card)")
        .accessibilityValue("Not available yet")
    }
}

/// One setting: its name in bold, an optional note, then what is under them (a value, a pill, a list).
/// Greyed (name, note and value) for things Processor Freedom does not do yet.
struct TxSettingRow<Below: View>: View {
    let label: String
    var note: String? = nil
    var greyed = false
    var style: TxRowStyle = .payments
    @ViewBuilder var below: () -> Below

    var body: some View {
        VStack(alignment: .leading, spacing: style.gap) {
            Text(label)
                .pfFont(style.labelSize, style.labelWeight)
                .foregroundStyle(greyed ? SettingsLook.greyed : Color.primary)
                .lineSpacing(style.labelLineSpacing)
            if let note {
                Text(note)
                    .pfFont(style.noteSize)
                    .foregroundStyle(greyed ? SettingsLook.greyed : style.noteColor)
                    .lineSpacing(style.noteLineSpacing)
            }
            below()
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .modifier(TxUnavailableValue(greyed: greyed))
    }
}

/// VoiceOver says why a greyed setting reads as it does, like the greyed pencils and Settings rows; other rows keep what their
/// parts say.
private struct TxUnavailableValue: ViewModifier {
    let greyed: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if greyed {
            content.accessibilityValue("Not available yet")
        } else {
            content
        }
    }
}

extension TxSettingRow where Below == TxValue {
    init(label: String, note: String? = nil, value: String, muted: Bool = false, greyed: Bool = false, style: TxRowStyle = .payments) {
        self.init(label: label, note: note, greyed: greyed, style: style) { TxValue(text: value, muted: muted, greyed: greyed) }
    }
}

/// A setting's value. The Payments photos print values in black; Invoices and estimates and the Orders pages in the muted grey.
struct TxValue: View {
    let text: String
    var muted = false
    var greyed = false

    var body: some View {
        Text(text)
            .pfFont(16)
            .foregroundStyle(greyed ? SettingsLook.greyed : (muted ? SettingsLook.muted : Color.primary))
            .lineSpacing(5)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A pill with any word in it ("On", "Off", "Disabled"), measured from the photos: 14 pt medium text, about 14 pt of space either
/// side of it and 32 pt tall. `solid` is the darker grey (#E3E3E3) of the Payments photos; the Orders and receipts photos use the
/// lighter #F9F9F9.
struct TxPill: View {
    let text: String
    var on = false
    var greyed = false
    var solid = false

    var body: some View {
        // Semibold, as the photos' pills are (their strokes are a step heavier than medium).
        Text(text)
            .pfFont(14, .semibold)
            .foregroundStyle(greyed ? SettingsLook.greyed : (on ? SettingsLook.onText : SettingsLook.offText))
            .padding(.horizontal, 13.5)
            .padding(.vertical, 7.5)
            .background(on && !greyed ? SettingsLook.onFill : (solid ? SettingsLook.border : SettingsLook.offFill), in: Capsule())
            .accessibilityLabel(text)
    }
}

extension TxPill {
    /// The On / Off pill of the Orders and receipts photos.
    init(on: Bool, greyed: Bool = false) {
        self.init(text: on ? "On" : "Off", on: on, greyed: greyed)
    }
}

/// A light blue tag (the Order types photo): a way of ordering that is turned on. Same size as the pills.
struct TxTag: View {
    let text: String

    var body: some View {
        Text(text)
            .pfFont(14, .semibold)
            .foregroundStyle(SettingsLook.onText)
            .padding(.horizontal, 13.5)
            .padding(.vertical, 7.5)
            .background(SettingsLook.onFill, in: Capsule())
    }
}

/// An indented item from the Payments photos: a dot 22 pt in, its text 40 pt in.
struct TxBullet<Content: View>: View {
    var greyed = false
    @ViewBuilder var content: () -> Content

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text("•")
                .pfFont(18, .bold)
                .foregroundStyle(greyed ? SettingsLook.greyed : Color.primary)
                .frame(width: 18, alignment: .leading)
                .accessibilityHidden(true)
            content()
        }
        .padding(.leading, 22)
    }
}

/// The 48 pt round buttons of the photos (search, add, more). Without an action they are greyed (40%) and do nothing.
struct TxCircleButton: View {
    let symbol: String
    var fill: Color = SettingsLook.border
    var tint: Color = .primary
    var size: CGFloat = 20
    let label: String
    var action: (() -> Void)? = nil

    var body: some View {
        Button { action?() } label: {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .regular))
                .foregroundStyle(tint)
                .frame(width: 48, height: 48)
                .background(fill, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
        .opacity(action == nil ? 0.4 : 1)
        .accessibilityLabel(label)
        .accessibilityValue(action == nil ? "Not available yet" : "")
    }
}

/// While the business's settings load: a spinner, or why they could not be loaded and Try again.
struct TxLoading: View {
    let problem: String
    let retry: () -> Void

    var body: some View {
        if problem.isEmpty {
            ProgressView()
                .tint(Theme.blue)
                .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text(problem)
                    .pfFont(16)
                    .foregroundStyle(Theme.error)
                    .fixedSize(horizontal: false, vertical: true)
                Button(action: retry) {
                    Text("Try again")
                        .pfFont(16, .semibold)
                        .foregroundStyle(Theme.blue)
                        // A taller place to tap than the words themselves, without moving anything.
                        .padding(.vertical, 12.5)
                        .padding(.trailing, 16)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, -12.5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Tags in rows that wrap, like the Order types photo.
struct TxFlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let available = proposal.width ?? .infinity
        let rows = arrange(width: available, subviews: subviews)
        let height = rows.last.map { $0.y + $0.height } ?? 0
        let used = rows.map { $0.width }.max() ?? 0
        return CGSize(width: available.isFinite ? available : used, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
        }
    }

    private struct Row {
        var indices: [Int] = []
        var y: CGFloat = 0
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if !current.indices.isEmpty && needed > width {
                rows.append(current)
                current = Row(y: current.y + current.height + lineSpacing)
            }
            current.width = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            current.height = max(current.height, size.height)
            current.indices.append(index)
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}

// MARK: - Pages

extension View {
    /// Pushes a back-office web page inside a Settings page's own navigation stack (the links in the descriptions), and runs `closed`
    /// when the person comes back from it, so the page can load what was changed there. With `keepsBack` the system back button
    /// always shows and comes straight back here, even on a website page that has a parent list of its own (a new estimate's is
    /// Estimates).
    func txWebPages(_ tab: Binding<String?>, keepsBack: Bool = false, closed: (() -> Void)? = nil) -> some View {
        navigationDestination(item: tab) { tab in
            WebScreen(tab: tab, keepsBack: keepsBack)
        }
        .onChange(of: tab.wrappedValue) { old, new in
            if old != nil, new == nil { closed?() }
        }
    }

    /// Text set on an exact line height, as the photos' paragraphs are (an 18 pt font on 18 pt lines, for example).
    func txLineHeight(_ points: CGFloat) -> some View {
        lineHeight(.exact(points: points))
    }
}

/// The white pages Clover pushes (Manual card entry, Invoice number, Payment note, Quick sale, Carbon copy receipts, Tap to Pay):
/// pushed onto the tab like any page, so the tab bar stays and the system back button (and the edge swipe) go back to the list;
/// the page name in the bar (with the business name under it where the photo has one), the page's own margins, and a Save button
/// pinned at the bottom, just above the tab bar, when the page has one.
struct TxPlainPage<Content: View, Bottom: View>: View {
    var title: String? = nil
    var subtitle: String? = nil
    var margin: CGFloat = 17
    var top: CGFloat = 12
    /// Under the Save button, down to the tab bar: 19 pt puts the button where the photos have it (44 pt tall, ending 102 pt
    /// above the bottom of the screen).
    var barBottom: CGFloat = 19
    @ViewBuilder let content: () -> Content
    @ViewBuilder let bottom: () -> Bottom

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content()
            }
            .padding(.horizontal, margin)
            .padding(.top, top)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemBackground))
        .modifier(TxBottomBar(show: Bottom.self != EmptyView.self, margin: margin, below: barBottom, bar: bottom))
        .modifier(TxTitles(title: title, subtitle: subtitle))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if subtitle == nil, let title {
                ToolbarItem(placement: .principal) {
                    Text(title)
                        .pfFont(19, .bold, relativeTo: .headline)
                        .lineLimit(1)
                        .accessibilityAddTraits(.isHeader)
                }
            }
        }
        .steadyNavigationBar()
    }
}

extension TxPlainPage where Bottom == EmptyView {
    init(title: String? = nil, subtitle: String? = nil, margin: CGFloat = 17, top: CGFloat = 12, @ViewBuilder content: @escaping () -> Content) {
        self.init(title: title, subtitle: subtitle, margin: margin, top: top, content: content, bottom: { EmptyView() })
    }
}

/// The two-line title (the page name over the business name) where the photo has one; one line or none otherwise.
private struct TxTitles: ViewModifier {
    let title: String?
    let subtitle: String?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let title, let subtitle {
            content.navigationTitle(title).navigationSubtitle(subtitle)
        } else {
            content.navigationTitle(title ?? "")
        }
    }
}

/// Pins a page's Save button at the bottom, over the content, with the system's edge effect under it.
private struct TxBottomBar<Bar: View>: ViewModifier {
    let show: Bool
    let margin: CGFloat
    let below: CGFloat
    let bar: () -> Bar

    @ViewBuilder
    func body(content: Content) -> some View {
        if show {
            content.safeAreaBar(edge: .bottom) {
                bar()
                    .padding(.horizontal, margin)
                    .padding(.top, 8)
                    .padding(.bottom, below)
            }
        } else {
            content
        }
    }
}

/// The full-width Save button of the pushed pages: grey (#C7C7C7 with white text) while there is nothing to save, blue when there is.
/// 44 pt tall with 6 pt corners; the photos letter it at 18 pt on Invoice number, 15 pt on Payment note and 13.5 pt elsewhere.
struct TxSaveButton: View {
    var title = "Save"
    let enabled: Bool
    var busy = false
    var size: CGFloat = 18
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            if busy {
                ProgressView().tint(.white)
            } else {
                Text(title)
            }
        }
        .buttonStyle(SolidButtonStyle(fill: enabled || busy ? Theme.blue : Color(.systemGray3), text: .white, radius: 6, height: 44, size: size))
        .disabled(!enabled || busy)
        .accessibilityLabel(title)
        .accessibilityValue(busy ? "Saving" : (enabled ? "" : "Nothing to save"))
    }
}
