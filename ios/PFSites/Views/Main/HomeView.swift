import SwiftUI

/// Home (photos 1 and 2): the date and time on a navy card with today's sales on request, then tiles for the main pages.
/// Today's sales are the server's number: read when they are asked for, again whenever Home comes back (from a page, another tab,
/// the lock screen or the background), on pull, and every minute while they show.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var sales: TodaySales?
    @State private var salesProblem = ""

    private struct TodaySales {
        let net: Int
        let orders: Int
    }

    private struct SalesKey: Hashable {
        let shown: Bool
        let active: Bool
        let ready: Bool
        let site: String
    }

    /// Tiles side by side are as tall as each other (a two-line name like "Items and services" makes its whole row taller), and a
    /// tile on a row of its own is as tall as it needs, as in Clover's photo.
    @State private var tileHeights: [String: CGFloat] = [:]
    private static let tileRows: [[String]] = [["insights", "calendar"], ["items", "close"]]
    private func tileHeight(_ tab: String) -> CGFloat {
        let row = Self.tileRows.first { $0.contains(tab) } ?? [tab]
        return row.compactMap { tileHeights[$0] }.max() ?? 0
    }

    private struct HomeTile {
        let tab: String
        let title: String
        /// The tile's drawing in the asset catalog, as two template layers: `<art>Ink` (lines) and `<art>Accent` (the brand-blue parts).
        let art: String
    }

    private let setup = HomeTile(tab: "tasks", title: "Setup tasks", art: "HomeSetup")
    private let overview = HomeTile(tab: "sales", title: "Sales overview", art: "HomeSales")
    private let insights = HomeTile(tab: "insights", title: "Insights", art: "HomeInsights")
    private let calendar = HomeTile(tab: "calendar", title: "Calendar", art: "HomeCalendar")
    private let items = HomeTile(tab: "items", title: "Items and services", art: "HomeItems")
    private let closeout = HomeTile(tab: "close", title: "Closeout", art: "HomeCloseout")
    private let itemSales = HomeTile(tab: "r-items", title: "Items sales report", art: "HomeItemSales")

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                dateCard
                tile(setup)
                tile(overview)
                HStack(alignment: .top, spacing: 8) {
                    tile(insights)
                    tile(calendar)
                }
                HStack(alignment: .top, spacing: 8) {
                    tile(items)
                    tile(closeout)
                }
                tile(itemSales)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 20)
        }
        .refreshable { await refresh() }
        .background(Color(.systemBackground))
        .tabHeader("Home")
        .task(id: SalesKey(shown: model.shell.salesAllowed && model.shell.salesShown, active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            await keepSalesFresh()
        }
    }

    // MARK: Date card

    private var dateCard: some View {
        let shell = model.shell
        let showing = shell.salesAllowed && shell.salesShown
        return VStack(alignment: .leading, spacing: 0) {
            TimelineView(.everyMinute) { context in
                VStack(alignment: .leading, spacing: 15) {
                    Text(context.date, format: .dateTime.weekday(.wide).month(.wide).day())
                        .pfFont(23, .bold, relativeTo: .title)
                    // Today's sales take the time's place while they are shown, in the same size, as in the photos. (The photo's
                    // time and amount have strokes 2.2 pt thick at this size: the regular weight, not a light one.)
                    if showing, let sales {
                        Text(Money.format(sales.net))
                            .pfFont(26, .regular, relativeTo: .largeTitle)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .accessibilityLabel("Net sales today, \(Money.format(sales.net)), \(sales.orders) \(sales.orders == 1 ? "order" : "orders")")
                    } else if showing && salesProblem.isEmpty {
                        // Being read: a spinner where the amount will be, as tall as the amount, so nothing moves when it arrives.
                        ProgressView()
                            .tint(.white)
                            .frame(minHeight: 31, alignment: .leading)
                            .accessibilityLabel("Loading today's sales")
                    } else {
                        Text(context.date, format: .dateTime.hour().minute())
                            .pfFont(26, .regular, relativeTo: .largeTitle)
                    }
                }
                .foregroundStyle(.white)
            }
            salesPart
                .padding(.top, 15)
        }
        .padding(.top, 11)
        .padding(.bottom, 16)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.navy))
    }

    @ViewBuilder
    private var salesPart: some View {
        let shell = model.shell
        if shell.salesAllowed {
            if shell.salesShown {
                if sales != nil || salesProblem.isEmpty {
                    cardButton("Hide today's sales") {
                        shell.salesShown = false
                        // Shown again later, they are read afresh: an old amount is never put back up as today's.
                        sales = nil
                        salesProblem = ""
                    }
                } else {
                    // The amount could not be read: why, and a way to try again.
                    VStack(alignment: .leading, spacing: 8) {
                        Text(salesProblem)
                            .pfFont(15)
                            .foregroundStyle(.white.opacity(0.8))
                            .fixedSize(horizontal: false, vertical: true)
                        cardButton("Try again") { Task { await loadSales() } }
                    }
                }
            } else {
                // Showing them starts the reading (the task that keeps them fresh follows this choice).
                cardButton("Show today's sales") { shell.salesShown = true }
            }
        }
    }

    /// The light blue link on the card. Its words are 14 pt, so the tap area reaches 15 pt further up and down (and a little to
    /// the sides) without moving anything.
    private func cardButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .pfFont(14, .semibold)
                .foregroundStyle(Theme.linkOnNavy)
                .padding(.vertical, 15)
                .padding(.horizontal, 12)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -15)
        .padding(.horizontal, -12)
    }

    /// Reads today's sales now and then every minute, while they are shown and Home is on screen in an open, unlocked app: a sale
    /// taken on the website or another phone shows up here, and after midnight the amount is the new day's. It stops on a failure
    /// with nothing to show (the card then says why and offers Try again).
    private func keepSalesFresh() async {
        let shell = model.shell
        guard shell.salesAllowed, shell.salesShown, scenePhase == .active, model.phase == .ready else { return }
        while !Task.isCancelled {
            let read = await loadSales()
            if !read && sales == nil { return }
            try? await Task.sleep(nanoseconds: 60_000_000_000)
        }
    }

    /// True when the amount was read. While it is being read for the first time the card shows a spinner (no amount and no
    /// problem yet); a reading that fails while an amount is up leaves that amount (the next reading replaces it).
    @discardableResult
    private func loadSales() async -> Bool {
        guard let business = model.site else { return false }
        salesProblem = ""
        do {
            let answer = try await API.get("/api/sites/\(business.id)/stats?range=today")
            // Hidden while the answer was on its way: it is not kept.
            guard model.shell.salesShown else { return false }
            sales = TodaySales(net: answer["totals"]["net"].int, orders: answer["totals"]["orders"].int)
            return true
        } catch let error as APIError {
            if error.forbidden {
                // This login is not allowed to see sales: the button goes away.
                model.shell.salesAllowed = false
                model.shell.salesShown = false
                sales = nil
            } else {
                // A plain 401 means the session ended (signed out everywhere, or the server dropped it): check, then lock. Once
                // the app is open again the amount is read afresh; until then the card keeps a way to try again.
                if error.sessionEnded { model.sessionEnded() }
                if sales == nil { salesProblem = error.message }
            }
        } catch {
            // Cancelled: Home went off screen, or the sales were hidden.
        }
        return false
    }

    private func refresh() async {
        await model.refreshNow()
        if model.shell.salesAllowed && model.shell.salesShown { await loadSales() }
    }

    // MARK: Tiles

    @ViewBuilder
    private func tile(_ tile: HomeTile) -> some View {
        if model.site?.isOwner == true || !OfficeCatalog.ownerOnly.contains(tile.tab) {
            Button {
                // The tiles with native screens (the owner's Clover photos) open them; the rest open the website's page.
                switch tile.tab {
                case "sales": model.shell.push(.salesOverview)
                case "calendar": model.shell.push(.appointments)
                case "insights": model.shell.cover = .insights
                case "items": model.shell.cover = .items
                case "close": model.shell.cover = .closeout
                case "r-items": model.shell.cover = .itemSales
                case "tasks": model.shell.cover = .tasks
                default: model.shell.push(.page(tile.tab))
                }
            } label: {
                VStack(spacing: 0) {
                    // Thin line drawings like the owner's Clover photo: navy lines (white in dark mode) with brand-blue accents.
                    ZStack {
                        Image("\(tile.art)Ink")
                            .renderingMode(.template)
                            .foregroundStyle(Theme.ink)
                        Image("\(tile.art)Accent")
                            .renderingMode(.template)
                            .foregroundStyle(Theme.blue)
                    }
                    .frame(width: 48, height: 48)
                    .accessibilityHidden(true)
                    HomeTileTitle(title: tile.title)
                        .padding(.top, 6)
                }
                .padding(.top, 22)
                .padding(.bottom, 16)
                .padding(.horizontal, 12)
                .onGeometryChange(for: CGFloat.self) { proxy in
                    ceil(proxy.size.height)
                } action: { height in
                    tileHeights[tile.tab] = height
                }
                .frame(maxWidth: .infinity, minHeight: tileHeight(tile.tab))
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color(light: .white, dark: .secondarySystemBackground)))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(.systemGray5), lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }
}

/// A Home tile's name: 17.5 pt semibold (its strokes are 2.2 pt thick in the photo). A name too long for one line ("Items and
/// services" on most iPhones) is set the way the photo sets it: two lines with their left edges together and their baselines
/// 17 pt apart, which makes that row of tiles 130 pt tall (plain wrapping would centre each line and set them 21 pt apart).
private struct HomeTileTitle: View {
    let title: String
    /// Two 21 pt lines drawn 4 pt closer, scaled with the text size.
    @ScaledMetric(relativeTo: .body) private var closer: CGFloat = -4

    var body: some View {
        let words = title.split(separator: " ").map(String.init)
        // The first that fits is used: the whole name; "Items and" over "services"; "Items" over "and services"; and, for a
        // word wider than the tile, ordinary wrapping.
        ViewThatFits(in: .horizontal) {
            line(title)
            stacked(words, after: max(1, words.count - 1))
            stacked(words, after: 1)
            Text(title)
                .pfFont(17.5, .semibold)
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
    }

    private func stacked(_ words: [String], after count: Int) -> some View {
        VStack(alignment: .leading, spacing: closer) {
            line(words.prefix(count).joined(separator: " "))
            line(words.dropFirst(count).joined(separator: " "))
        }
    }

    private func line(_ text: String) -> some View {
        Text(text)
            .pfFont(17.5, .semibold)
            .foregroundStyle(.primary)
            .lineLimit(1)
    }
}
