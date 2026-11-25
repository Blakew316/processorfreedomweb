import SwiftUI
import UIKit

/// The Items sales report's look, measured from the owner's Clover photos (1125 x 2436 px of a 375 x 812 pt phone, so 3 px = 1 pt).
/// Clover's dark green (#0D4109: the focus rings, the chosen tab's words, the chosen radio) is navy here, its light green fills are
/// light blue, and the tab's underline and "Show results" are the brand blue.
enum ItemSalesLook {
    /// #868686: the 1 pt border of the date field and of the search fields.
    static let fieldBorder = Color(light: UIColor(hex: 0x868686), dark: UIColor(hex: 0x636366))
    /// #253338: the line with the period's dates.
    static let dateText = Color(light: UIColor(hex: 0x253338), dark: .label)
    /// A hairline around the drop-down cards in dark mode, where their shadow does not show.
    static let popupEdge = Color(light: .clear, dark: UIColor(hex: 0x38383A))
    /// The ring around the focused row of a list, a menu or the Filters panel: Clover's dark green focus outline, so navy (white in
    /// dark mode).
    static let focus = Theme.ink
    /// The words on "Show results": Clover's light green on its dark green button, so light blue on brand blue here.
    static let onBlue = Color(light: UIColor(hex: 0xE8F1FC), dark: .white)
    /// The Filters count badge, navy like the website's (`.fbtn em`), brand blue in dark mode.
    static let badge = Color(light: UIColor(hex: 0x0A1F44), dark: UIColor(hex: 0x1D4F9E))
    /// #C4C4C4: the round ⋮ button while its menu is open (photo 63e1e3b0), darker than its usual #E3E3E3.
    static let pressed = Color(light: UIColor(hex: 0xC4C4C4), dark: UIColor(hex: 0x48484A))
}

// MARK: Line icons, drawn on the grid they were measured on

/// Maps a drawing made on a w x h point grid into any rect, keeping its proportions and centring it.
struct ItemSalesGrid {
    let rect: CGRect
    let width: CGFloat
    let height: CGFloat

    var scale: CGFloat { min(rect.width / width, rect.height / height) }

    func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: rect.midX + (x - width / 2) * scale, y: rect.midY + (y - height / 2) * scale)
    }

    func circle(_ x: CGFloat, _ y: CGFloat, _ radius: CGFloat) -> CGRect {
        let center = point(x, y)
        return CGRect(x: center.x - radius * scale, y: center.y - radius * scale, width: radius * 2 * scale, height: radius * 2 * scale)
    }
}

/// The date field's calendar (20 x 20 pt): a page with two rings and a header line. Its dots are `ItemSalesCalendarDots`.
/// The page's corners are as tight as the photo's (1.5 pt along the middle of the line).
struct ItemSalesCalendarShape: Shape {
    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 20, height: 20)
        var path = Path()
        let corner = grid.point(1, 3.2)
        path.addRoundedRect(in: CGRect(x: corner.x, y: corner.y, width: 18 * grid.scale, height: 15.6 * grid.scale),
                            cornerSize: CGSize(width: 1.5 * grid.scale, height: 1.5 * grid.scale), style: .circular)
        path.move(to: grid.point(1, 8))
        path.addLine(to: grid.point(19, 8))
        path.move(to: grid.point(5.8, 0.8))
        path.addLine(to: grid.point(5.8, 5))
        path.move(to: grid.point(14.2, 0.8))
        path.addLine(to: grid.point(14.2, 5))
        return path
    }
}

struct ItemSalesCalendarDots: Shape {
    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 20, height: 20)
        var path = Path()
        for y in [11.9, 15.3] as [CGFloat] {
            for x in [5, 10, 15] as [CGFloat] {
                path.addEllipse(in: grid.circle(x, y, 0.7))
            }
        }
        return path
    }
}

struct ItemSalesCalendarIcon: View {
    var body: some View {
        ZStack {
            ItemSalesCalendarShape()
                .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            ItemSalesCalendarDots()
                .fill(Color.primary)
        }
        .frame(width: 20, height: 20)
        .accessibilityHidden(true)
    }
}

/// The Filters button's two sliders (17.5 x 19.5 pt with their 1.5 pt line), the left knob low and the right knob high, as in
/// the photo: the left line stops 1.5 pt above its knob and goes on from under it; the right line runs onto its knob and starts
/// again 1.5 pt under it.
struct ItemSalesSlidersShape: Shape {
    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 17.5, height: 19.5)
        var path = Path()
        path.move(to: grid.point(3.75, 0.75))
        path.addLine(to: grid.point(3.75, 6.75))
        path.addEllipse(in: grid.circle(3.75, 12.75, 3))
        path.move(to: grid.point(3.75, 15.75))
        path.addLine(to: grid.point(3.75, 18.75))
        path.move(to: grid.point(13.75, 0.75))
        path.addLine(to: grid.point(13.75, 3.75))
        path.addEllipse(in: grid.circle(13.75, 6.75, 3))
        path.move(to: grid.point(13.75, 12.75))
        path.addLine(to: grid.point(13.75, 18.75))
        return path
    }
}

/// A chevron pointing down, or up while its list is open (13.3 x 7.3 pt).
struct ItemSalesChevronShape: Shape {
    var up = false

    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 13.3, height: 7.3)
        var path = Path()
        if up {
            path.move(to: grid.point(0.8, 6.5))
            path.addLine(to: grid.point(6.65, 0.8))
            path.addLine(to: grid.point(12.5, 6.5))
        } else {
            path.move(to: grid.point(0.8, 0.8))
            path.addLine(to: grid.point(6.65, 6.5))
            path.addLine(to: grid.point(12.5, 0.8))
        }
        return path
    }
}

struct ItemSalesChevron: View {
    var up = false
    var color: Color = .primary

    var body: some View {
        ItemSalesChevronShape(up: up)
            .stroke(color, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            .frame(width: 13.3, height: 7.3)
            .accessibilityHidden(true)
    }
}

/// ‹ or › beside the dates (7.3 x 14 pt).
struct ItemSalesStepShape: Shape {
    var later = false

    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 7.3, height: 14)
        var path = Path()
        if later {
            path.move(to: grid.point(0.8, 0.8))
            path.addLine(to: grid.point(6.5, 7))
            path.addLine(to: grid.point(0.8, 13.2))
        } else {
            path.move(to: grid.point(6.5, 0.8))
            path.addLine(to: grid.point(0.8, 7))
            path.addLine(to: grid.point(6.5, 13.2))
        }
        return path
    }
}

/// The tick beside the chosen period (15 x 15 pt).
struct ItemSalesCheckShape: Shape {
    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 15, height: 15)
        var path = Path()
        path.move(to: grid.point(0.8, 10.4))
        path.addLine(to: grid.point(4.6, 14.2))
        path.addLine(to: grid.point(14.2, 0.8))
        return path
    }
}

/// The ⋮ menu's line icons (20 x 20 pt with their 1.5 pt line): Print, Export, Accounting sync and Learn about this report,
/// each drawn on the measures of photo 63e1e3b0.
enum ItemSalesMenuIcon {
    case print, export, sync, info
}

struct ItemSalesMenuIconShape: Shape {
    let icon: ItemSalesMenuIcon

    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 20, height: 20)
        let s = grid.scale
        var path = Path()
        switch icon {
        case .print:
            // The paper going in, the body (its bottom edge hidden behind the paper coming out), the paper out and a light.
            path.move(to: grid.point(4.6, 5.8))
            path.addLine(to: grid.point(4.6, 2.3))
            path.addQuadCurve(to: grid.point(5.9, 1), control: grid.point(4.6, 1))
            path.addLine(to: grid.point(14.1, 1))
            path.addQuadCurve(to: grid.point(15.4, 2.3), control: grid.point(15.4, 1))
            path.addLine(to: grid.point(15.4, 5.8))
            path.move(to: grid.point(4.6, 14.2))
            path.addLine(to: grid.point(2.5, 14.2))
            path.addQuadCurve(to: grid.point(1, 12.7), control: grid.point(1, 14.2))
            path.addLine(to: grid.point(1, 7.3))
            path.addQuadCurve(to: grid.point(2.5, 5.8), control: grid.point(1, 5.8))
            path.addLine(to: grid.point(17.5, 5.8))
            path.addQuadCurve(to: grid.point(19, 7.3), control: grid.point(19, 5.8))
            path.addLine(to: grid.point(19, 12.7))
            path.addQuadCurve(to: grid.point(17.5, 14.2), control: grid.point(19, 14.2))
            path.addLine(to: grid.point(15.4, 14.2))
            let paper = grid.point(4.6, 10.6)
            path.addRoundedRect(in: CGRect(x: paper.x, y: paper.y, width: 10.8 * s, height: 8.4 * s),
                                cornerSize: CGSize(width: 0.3 * s, height: 0.3 * s), style: .circular)
            path.move(to: grid.point(3.4, 8.2))
            path.addLine(to: grid.point(4.55, 8.2))
        case .export:
            // An arrow down into a shallow tray, the whole of it a little above the middle of the row, as in the photo.
            path.move(to: grid.point(10, 3))
            path.addLine(to: grid.point(10, 12.6))
            path.move(to: grid.point(6.4, 9))
            path.addLine(to: grid.point(10, 12.6))
            path.addLine(to: grid.point(13.6, 9))
            path.move(to: grid.point(1, 12.6))
            path.addLine(to: grid.point(1, 13.7))
            path.addQuadCurve(to: grid.point(3.5, 16.2), control: grid.point(1, 16.2))
            path.addLine(to: grid.point(16.5, 16.2))
            path.addQuadCurve(to: grid.point(19, 13.7), control: grid.point(19, 16.2))
            path.addLine(to: grid.point(19, 12.6))
        case .sync:
            // Two arrows: back along the top, forward along the bottom.
            path.move(to: grid.point(17.95, 5.1))
            path.addLine(to: grid.point(2.05, 5.1))
            path.move(to: grid.point(5.05, 2.1))
            path.addLine(to: grid.point(2.05, 5.1))
            path.addLine(to: grid.point(5.05, 8.1))
            path.move(to: grid.point(2.05, 15))
            path.addLine(to: grid.point(17.95, 15))
            path.move(to: grid.point(14.95, 12))
            path.addLine(to: grid.point(17.95, 15))
            path.addLine(to: grid.point(14.95, 18))
        case .info:
            // A circle with an "i": a stem with a small serif at its top and a foot to the right, and its dot. The dot is a line
            // too short to see, which the round line ends make a full dot (a stroked circle that small draws as a ring).
            path.addEllipse(in: grid.circle(10, 10, 9))
            path.move(to: grid.point(8.8, 8.8))
            path.addLine(to: grid.point(10, 8.8))
            path.addLine(to: grid.point(10, 12.5))
            path.addQuadCurve(to: grid.point(11.1, 13.6), control: grid.point(10, 13.6))
            path.addLine(to: grid.point(11.75, 13.6))
            path.move(to: grid.point(9.69, 6.4))
            path.addLine(to: grid.point(9.71, 6.4))
        }
        return path
    }
}

/// The empty state's drawing: the website's own 'look' tile (clArt in public/js/editor.js: a magnifying glass on a 56 px rounded
/// square tinted with 9% of the brand blue, with a 1 px ring of 14%), redrawn at twice its size in the brand colours.
struct ItemSalesLookTileShape: Shape {
    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 24, height: 24)
        var path = Path()
        path.addEllipse(in: grid.circle(11, 11, 6.5))
        path.move(to: grid.point(16, 16))
        path.addLine(to: grid.point(20, 20))
        return path
    }
}

struct ItemSalesLookTile: View {
    static let size: CGFloat = 112

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .fill(SettingsLook.card)
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .fill(Theme.blue.opacity(0.09))
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .strokeBorder(Theme.blue.opacity(0.14), lineWidth: 2)
            ItemSalesLookTileShape()
                .stroke(Theme.blue, style: StrokeStyle(lineWidth: 3.9, lineCap: .round, lineJoin: .round))
                .frame(width: 52, height: 52)
        }
        .frame(width: Self.size, height: Self.size)
        .accessibilityHidden(true)
    }
}

// MARK: Pieces of the page

/// The ring the photos draw around the focused row (Clover's focus outline, in navy): a 2 pt line, a 2 pt gap, then a 1 pt
/// line. `across` and `down` say how far the outer line reaches past the row's sides and above and below it; the inner line is
/// 4 pt inside the outer one.
struct ItemSalesFocusRing: ViewModifier {
    let shown: Bool
    var across: CGFloat = 0
    var down: CGFloat = 2

    func body(content: Content) -> some View {
        content.overlay {
            if shown {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .circular)
                        .strokeBorder(ItemSalesLook.focus, lineWidth: 2)
                        .padding(.horizontal, -across)
                        .padding(.vertical, -down)
                    RoundedRectangle(cornerRadius: 12, style: .circular)
                        .strokeBorder(ItemSalesLook.focus, lineWidth: 1)
                        .padding(.horizontal, 4 - across)
                        .padding(.vertical, 4 - down)
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
        }
    }
}

/// The round grey button of the photos (⋮ at 48 x 48 pt, the sliders at 50 x 48 pt), with the website's count when filters are on.
/// `active` darkens it while what it opened is showing, as ⋮ is while its menu is open.
struct ItemSalesRoundButton<Label: View>: View {
    var width: CGFloat = 48
    var badge = 0
    var active = false
    let action: () -> Void
    @ViewBuilder let label: () -> Label

    var body: some View {
        Button(action: action) {
            label()
                .frame(width: width, height: 48)
                .background(active ? ItemSalesLook.pressed : SettingsLook.border, in: Capsule())
                .overlay(alignment: .topTrailing) {
                    if badge > 0 {
                        Text(String(badge))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, 6)
                            .frame(minWidth: 20, minHeight: 20)
                            .background(ItemSalesLook.badge, in: Capsule())
                            .offset(x: 4, y: -4)
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// ⋮: three 4 pt dots, 3 pt apart.
struct ItemSalesDots: View {
    var body: some View {
        VStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { _ in
                Circle().fill(Color.primary).frame(width: 4, height: 4)
            }
        }
        .accessibilityHidden(true)
    }
}

/// The tabs under the dates: "Revenue items" chosen (navy words on light blue, with a brand-blue underline), and "Non revenue items"
/// greyed and not tappable, because Processor Freedom has no non-revenue items (the website's tab is greyed too).
struct ItemSalesTabs: View {
    var body: some View {
        // They fit the photo's width; with larger text they scroll sideways instead of running off the page.
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 8) {
                tab("Revenue items", chosen: true)
                tab("Non revenue items", chosen: false)
                    .disabled(true)
                    .accessibilityValue("Not available yet")
            }
            .padding(.leading, 4)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .background(alignment: .bottom) {
            Rectangle().fill(SettingsLook.border).frame(height: 1)
        }
    }

    private func tab(_ title: String, chosen: Bool) -> some View {
        Button {} label: {
            VStack(spacing: 8) {
                // The photo's 16.5 pt (11.7 pt capitals). The words are a little wider than the photo's, so 17 pt either side of
                // them (the photo's 18.3 pt would make the two tabs a little wider than a 375 pt page, and the row would slide
                // sideways under a finger). Larger text scrolls sideways.
                Text(title)
                    .pfFont(16.5, .semibold)
                    .foregroundStyle(chosen ? Theme.ink : SettingsLook.greyed)
                    .lineLimit(1)
                    .padding(.horizontal, 17)
                    .frame(minHeight: 34)
                    .background(chosen ? Theme.lightBlue : Color.clear, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                Rectangle()
                    .fill(chosen ? Theme.blue : Color.clear)
                    .frame(height: 2)
            }
            .fixedSize()
            .contentShape(Rectangle())
        }
        // Not the plain style: it fades a button that cannot be used, and the greyed tab's words are grey already.
        .buttonStyle(ItemsBareStyle())
        .accessibilityAddTraits(chosen ? .isSelected : [])
    }
}

/// No items in the period: the website's drawing and words (cEmpty with 'look' and NORES in public/js/editor.js), at the photo's
/// sizes and gaps: the drawing in the middle of the photo's 226 pt drawing area (which starts 24 pt under the tabs), the title 33 pt
/// under that area and the sentence 27 pt under the title.
struct ItemSalesEmptyState: View {
    /// The height of the photo's drawing area.
    static let artHeight: CGFloat = 226

    var body: some View {
        VStack(spacing: 0) {
            ItemSalesLookTile()
                .frame(maxWidth: .infinity)
                .frame(height: Self.artHeight)
            Text("No results found")
                .pfFont(24.5, .bold, relativeTo: .title)
                .foregroundStyle(Color.primary)
                .padding(.top, 33)
            Text(ItemSalesModel.noResults)
                .pfFont(16.5)
                .foregroundStyle(Color.primary)
                .lineSpacing(4)
                .frame(maxWidth: 300)
                .padding(.top, 27)
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

/// The items of the period in a white card, best sellers first: each item's name over its category, its net sales, how many sold
/// and its share of all item sales (the website's columns Item, Category, Sold, Net sales and % of sales).
struct ItemSalesRowsCard: View {
    let rows: [ItemSalesRow]

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Text("Item")
                Spacer(minLength: 8)
                Text("Net sales")
            }
            .pfFont(14, .semibold)
            .foregroundStyle(SettingsLook.muted)
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 10)
            .accessibilityHidden(true)
            ForEach(rows) { row in
                Rectangle().fill(SettingsLook.border).frame(height: 1)
                ItemSalesRowView(row: row)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
            }
        }
        .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(SettingsLook.border, lineWidth: 1)
        }
    }
}

struct ItemSalesRowView: View {
    let row: ItemSalesRow

    // Plain strings, never format keys: a "%" in a localized key would be read as a format sign.
    private var soldLine: String { "\(row.qty) sold · \(row.percent)% of sales" }
    private var spoken: String { "\(row.name), \(row.category), \(row.qty) sold, \(Money.format(row.sales)) net sales, \(row.percent)% of sales" }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(row.name)
                    .pfFont(16.5, .bold)
                    .foregroundStyle(Color.primary)
                    .lineLimit(2)
                Spacer(minLength: 0)
                Text(Money.format(row.sales))
                    .monospacedDigit()
                    .pfFont(16.5, .bold)
                    .foregroundStyle(Color.primary)
                    .layoutPriority(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(row.category)
                    .lineLimit(2)
                Spacer(minLength: 0)
                Text(soldLine)
                    .monospacedDigit()
                    .lineLimit(1)
                    .layoutPriority(1)
            }
            .pfFont(16)
            .foregroundStyle(SettingsLook.muted)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }
}

/// The first load of the report did not work: the server's words, and Try again unless this login may not see reports.
struct ItemSalesProblem: View {
    let problem: String
    let canRetry: Bool
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text(problem)
                .pfFont(17)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if canRetry {
                Button("Try again", action: retry)
                    .buttonStyle(SolidButtonStyle(radius: 24, height: 48, size: 17))
                    .frame(maxWidth: 220)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }
}

// MARK: The cards that open under the date field and under ⋮

/// The white card the drop-down list and the ⋮ menu sit on: 12 pt corners and a soft shadow, as in the photos.
struct ItemSalesPopupCard: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 12, style: .circular))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .circular)
                    .strokeBorder(ItemSalesLook.popupEdge, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .circular))
            .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: 3)
    }
}

/// The date drop-down opened (photo 19dbb6e0): the periods, the chosen one ticked inside the focus ring. Taller than the card,
/// so it scrolls.
struct ItemSalesRangeList: View {
    let chosen: ItemSalesPeriod
    let pick: (ItemSalesPeriod) -> Void

    var body: some View {
        ScrollViewReader { reader in
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(ItemSalesPeriod.allCases) { period in
                        Button {
                            pick(period)
                        } label: {
                            row(period)
                        }
                        .buttonStyle(.plain)
                        .id(period)
                        .accessibilityAddTraits(period == chosen ? .isSelected : [])
                    }
                }
                .padding(.vertical, 6)
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(maxHeight: 272)
            .onAppear { reader.scrollTo(chosen, anchor: .center) }
        }
        .modifier(ItemSalesPopupCard())
    }

    private func row(_ period: ItemSalesPeriod) -> some View {
        HStack(spacing: 8) {
            Text(period.label)
                .pfFont(16.5)
                .foregroundStyle(Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            if period == chosen {
                ItemSalesCheckShape()
                    .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                    .frame(width: 15, height: 15)
                    .accessibilityHidden(true)
            }
        }
        .padding(.leading, 17)
        .padding(.trailing, 21)
        .frame(maxWidth: .infinity, minHeight: 46)
        .contentShape(Rectangle())
        .modifier(ItemSalesFocusRing(shown: period == chosen))
    }
}

/// One line of the ⋮ menu (photo 63e1e3b0): its line icon and its name. Greyed when it cannot be used right now.
struct ItemSalesMenuRow: View {
    let icon: ItemSalesMenuIcon
    let title: String
    var enabled = true
    var focused = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            // The photo's places: the icon 18.7 pt in from the card's edge and the words 10 pt after it. Nothing follows the
            // words (the row's own frame keeps them at its left), so "Learn about this report" has the card's width to itself
            // and stays on one line, as in the photo.
            HStack(spacing: 10) {
                ItemSalesMenuIconShape(icon: icon)
                    .stroke(enabled ? Color.primary : SettingsLook.greyed, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                    .frame(width: 20, height: 20)
                    .accessibilityHidden(true)
                Text(title)
                    .pfFont(16.5)
                    .foregroundStyle(enabled ? Color.primary : SettingsLook.greyed)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.leading, 18.7)
            .padding(.trailing, 18)
            .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
            .contentShape(Rectangle())
            .modifier(ItemSalesFocusRing(shown: focused && enabled))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}
