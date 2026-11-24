import SwiftUI
import UIKit

/// The Items sales report's look, measured from the owner's Clover photos (1125 x 2436 px of a 375 x 812 pt phone, so 3 px = 1 pt).
/// Clover's green is Processor Freedom's blue here, and its light green fills are light blue.
enum ItemSalesLook {
    /// #868686: the 1 pt border of the date field and of the search fields.
    static let fieldBorder = Color(light: UIColor(hex: 0x868686), dark: UIColor(hex: 0x636366))
    /// #253338: the line with the period's dates.
    static let dateText = Color(light: UIColor(hex: 0x253338), dark: .label)
    /// A hairline around the drop-down cards in dark mode, where their shadow does not show.
    static let popupEdge = Color(light: .clear, dark: UIColor(hex: 0x38383A))
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
struct ItemSalesCalendarShape: Shape {
    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 20, height: 20)
        var path = Path()
        let corner = grid.point(1, 3.2)
        path.addRoundedRect(in: CGRect(x: corner.x, y: corner.y, width: 18 * grid.scale, height: 15.6 * grid.scale),
                            cornerSize: CGSize(width: 3 * grid.scale, height: 3 * grid.scale), style: .continuous)
        path.move(to: grid.point(1, 7.9))
        path.addLine(to: grid.point(19, 7.9))
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
            for x in [4.9, 10, 15.1] as [CGFloat] {
                path.addEllipse(in: grid.circle(x, y, 0.95))
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

/// The Filters button's two sliders (17.3 x 19.3 pt), the left knob low and the right knob high, as in the photo.
struct ItemSalesSlidersShape: Shape {
    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 17.3, height: 19.3)
        var path = Path()
        path.move(to: grid.point(3.6, 0.8))
        path.addLine(to: grid.point(3.6, 9.8))
        path.addEllipse(in: grid.circle(3.6, 12.6, 2.8))
        path.move(to: grid.point(3.6, 15.4))
        path.addLine(to: grid.point(3.6, 18.5))
        path.move(to: grid.point(13.7, 0.8))
        path.addLine(to: grid.point(13.7, 3.9))
        path.addEllipse(in: grid.circle(13.7, 6.7, 2.8))
        path.move(to: grid.point(13.7, 9.5))
        path.addLine(to: grid.point(13.7, 18.5))
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

/// ‹ or › beside the dates (7.7 x 14 pt).
struct ItemSalesStepShape: Shape {
    var later = false

    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 7.7, height: 14)
        var path = Path()
        if later {
            path.move(to: grid.point(0.8, 0.8))
            path.addLine(to: grid.point(6.9, 7))
            path.addLine(to: grid.point(0.8, 13.2))
        } else {
            path.move(to: grid.point(6.9, 0.8))
            path.addLine(to: grid.point(0.8, 7))
            path.addLine(to: grid.point(6.9, 13.2))
        }
        return path
    }
}

/// The tick beside the chosen period (15.3 x 15 pt).
struct ItemSalesCheckShape: Shape {
    func path(in rect: CGRect) -> Path {
        let grid = ItemSalesGrid(rect: rect, width: 15.3, height: 15)
        var path = Path()
        path.move(to: grid.point(0.8, 10.4))
        path.addLine(to: grid.point(4.6, 14.2))
        path.addLine(to: grid.point(14.5, 0.8))
        return path
    }
}

/// The ⋮ menu's line icons (20 x 20 pt): Print, Export, Accounting sync and Learn about this report.
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
            // The paper in, the body (its bottom edge hidden behind the paper coming out), the paper out and a light.
            path.move(to: grid.point(5.5, 6))
            path.addLine(to: grid.point(5.5, 3.3))
            path.addQuadCurve(to: grid.point(6.7, 2), control: grid.point(5.5, 2))
            path.addLine(to: grid.point(13.3, 2))
            path.addQuadCurve(to: grid.point(14.5, 3.3), control: grid.point(14.5, 2))
            path.addLine(to: grid.point(14.5, 6))
            path.move(to: grid.point(5.5, 14.5))
            path.addLine(to: grid.point(3.5, 14.5))
            path.addQuadCurve(to: grid.point(1.5, 12.5), control: grid.point(1.5, 14.5))
            path.addLine(to: grid.point(1.5, 8))
            path.addQuadCurve(to: grid.point(3.5, 6), control: grid.point(1.5, 6))
            path.addLine(to: grid.point(16.5, 6))
            path.addQuadCurve(to: grid.point(18.5, 8), control: grid.point(18.5, 6))
            path.addLine(to: grid.point(18.5, 12.5))
            path.addQuadCurve(to: grid.point(16.5, 14.5), control: grid.point(18.5, 14.5))
            path.addLine(to: grid.point(14.5, 14.5))
            let paper = grid.point(5.5, 10.8)
            path.addRoundedRect(in: CGRect(x: paper.x, y: paper.y, width: 9 * s, height: 7.7 * s), cornerSize: CGSize(width: 0.8 * s, height: 0.8 * s))
            path.move(to: grid.point(4.2, 9))
            path.addLine(to: grid.point(5.2, 9))
        case .export:
            // An arrow down into a tray.
            path.move(to: grid.point(10, 2))
            path.addLine(to: grid.point(10, 12.6))
            path.move(to: grid.point(6.4, 9))
            path.addLine(to: grid.point(10, 12.6))
            path.addLine(to: grid.point(13.6, 9))
            path.move(to: grid.point(2, 13))
            path.addLine(to: grid.point(2, 16))
            path.addQuadCurve(to: grid.point(4.5, 18.5), control: grid.point(2, 18.5))
            path.addLine(to: grid.point(15.5, 18.5))
            path.addQuadCurve(to: grid.point(18, 16), control: grid.point(18, 18.5))
            path.addLine(to: grid.point(18, 13))
        case .sync:
            // Two arrows: back along the top, forward along the bottom.
            path.move(to: grid.point(17.5, 6))
            path.addLine(to: grid.point(2.5, 6))
            path.move(to: grid.point(6, 2.5))
            path.addLine(to: grid.point(2.5, 6))
            path.addLine(to: grid.point(6, 9.5))
            path.move(to: grid.point(2.5, 14))
            path.addLine(to: grid.point(17.5, 14))
            path.move(to: grid.point(14, 10.5))
            path.addLine(to: grid.point(17.5, 14))
            path.addLine(to: grid.point(14, 17.5))
        case .info:
            path.addEllipse(in: grid.circle(10, 10, 8.6))
            path.move(to: grid.point(8.9, 9.2))
            path.addLine(to: grid.point(10, 9.2))
            path.addLine(to: grid.point(10, 13.2))
            path.addQuadCurve(to: grid.point(11.3, 14.4), control: grid.point(10, 14.4))
            path.addEllipse(in: grid.circle(10, 6.1, 0.35))
        }
        return path
    }
}

/// The empty state's drawing: the website's own 'look' tile (clArt in public/js/editor.js), a magnifying glass on a light blue
/// rounded square, redrawn in the brand colours.
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
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 27, style: .continuous)
                .fill(Theme.lightBlue)
            RoundedRectangle(cornerRadius: 27, style: .continuous)
                .strokeBorder(Theme.blue.opacity(0.14), lineWidth: 1.5)
            ItemSalesLookTileShape()
                .stroke(Theme.blue, style: StrokeStyle(lineWidth: 3.2, lineCap: .round, lineJoin: .round))
                .frame(width: 45, height: 45)
        }
        .frame(width: 96, height: 96)
        .accessibilityHidden(true)
    }
}

// MARK: Pieces of the page

/// The round grey button of the photos (⋮ at 48 x 48 pt, the sliders at 50 x 48 pt).
struct ItemSalesRoundButton<Label: View>: View {
    var width: CGFloat = 48
    var badge = 0
    let action: () -> Void
    @ViewBuilder let label: () -> Label

    var body: some View {
        Button(action: action) {
            label()
                .frame(width: width, height: 48)
                .background(SettingsLook.border, in: Capsule())
                .overlay(alignment: .topTrailing) {
                    if badge > 0 {
                        // The website's Filters count (.fbtn em): a small brand-blue badge.
                        Text(String(badge))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .frame(minWidth: 20, minHeight: 20)
                            .background(Theme.blue, in: Capsule())
                            .offset(x: 4, y: -4)
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// ⋮: three 4 pt dots, 7 pt apart.
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

/// The tabs under the dates: "Revenue items" chosen (light blue with a brand-blue underline), "Non revenue items" greyed,
/// because Processor Freedom has no non-revenue items (the website's tab is greyed too).
struct ItemSalesTabs: View {
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            tab("Revenue items", chosen: true)
            tab("Non revenue items", chosen: false)
                .accessibilityValue("Not available yet")
        }
        .padding(.leading, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .bottom) {
            Rectangle().fill(SettingsLook.border).frame(height: 1)
        }
    }

    private func tab(_ title: String, chosen: Bool) -> some View {
        VStack(spacing: 8) {
            Text(title)
                .pfFont(16, .semibold)
                .foregroundStyle(chosen ? Theme.blue : SettingsLook.greyed)
                .lineLimit(1)
                .padding(.horizontal, 18.5)
                .frame(minHeight: 34)
                .background(chosen ? Theme.lightBlue : Color.clear, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            Rectangle()
                .fill(chosen ? Theme.blue : Color.clear)
                .frame(height: 2)
        }
        .fixedSize()
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(chosen ? [.isSelected] : [])
    }
}

/// No items in the period: the website's drawing and words (cEmpty with 'look' and NORES in public/js/editor.js).
struct ItemSalesEmptyState: View {
    var body: some View {
        VStack(spacing: 0) {
            ItemSalesLookTile()
            Text("No results found")
                .pfFont(24, .bold, relativeTo: .title)
                .foregroundStyle(Color.primary)
                .padding(.top, 33)
            Text(ItemSalesModel.noResults)
                .pfFont(16)
                .foregroundStyle(Color.primary)
                .lineSpacing(4)
                .frame(maxWidth: 290)
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
                    .pfFont(16, .bold)
                    .foregroundStyle(Color.primary)
                    .lineLimit(2)
                Spacer(minLength: 0)
                Text(Money.format(row.sales))
                    .pfFont(16, .bold)
                    .monospacedDigit()
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
            .pfFont(15)
            .foregroundStyle(SettingsLook.muted)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }
}

// MARK: The cards that open under the date field and under ⋮

/// The white card the drop-down list and the ⋮ menu sit on: 12 pt corners and a soft shadow, as in the photos.
struct ItemSalesPopupCard: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(ItemSalesLook.popupEdge, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: 2)
    }
}

/// The date drop-down opened (photo 19dbb6e0): the periods, the chosen one ticked inside a brand-blue ring. Long, so it scrolls.
struct ItemSalesRangeList: View {
    let chosen: ItemSalesPeriod
    let pick: (ItemSalesPeriod) -> Void

    var body: some View {
        ScrollViewReader { reader in
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(ItemSalesPeriod.allCases) { period in
                        Button { pick(period) } label: {
                            row(period)
                        }
                        .buttonStyle(.plain)
                        .id(period)
                        .accessibilityAddTraits(period == chosen ? [.isSelected] : [])
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
                .pfFont(16)
                .foregroundStyle(Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            if period == chosen {
                ItemSalesCheckShape()
                    .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                    .frame(width: 15.3, height: 15)
                    .accessibilityHidden(true)
            }
        }
        .padding(.leading, 17)
        .padding(.trailing, 21)
        .frame(maxWidth: .infinity, minHeight: 46)
        .contentShape(Rectangle())
        .overlay {
            if period == chosen {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(Theme.blue, lineWidth: 2)
                        .padding(.vertical, -2)
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(Theme.blue, lineWidth: 1)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                }
                .allowsHitTesting(false)
            }
        }
    }
}

/// One line of the ⋮ menu (photo 63e1e3b0): its line icon and its name. Greyed when it cannot be used right now.
struct ItemSalesMenuRow: View {
    let icon: ItemSalesMenuIcon
    let title: String
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                ItemSalesMenuIconShape(icon: icon)
                    .stroke(enabled ? Color.primary : SettingsLook.greyed, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                    .frame(width: 20, height: 20)
                    .accessibilityHidden(true)
                Text(title)
                    .pfFont(16)
                    .foregroundStyle(enabled ? Color.primary : SettingsLook.greyed)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.leading, 19)
            .padding(.trailing, 18)
            .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}
