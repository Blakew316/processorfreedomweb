import SwiftUI

/// Home (photos 1 and 2): the date and time on a navy card with today's sales on request, then tiles for the main pages.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var sales: TodaySales?
    @State private var loadingSales = false
    @State private var salesProblem = ""

    private struct TodaySales {
        let net: Int
        let orders: Int
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
        .task {
            if model.shell.salesShown && sales == nil { await loadSales() }
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
                    // Today's sales take the time's place while they are shown, in the same size, as in the photos.
                    if showing, let sales {
                        Text(Money.format(sales.net))
                            .pfFont(26, .light, relativeTo: .largeTitle)
                            .accessibilityLabel("Net sales today, \(Money.format(sales.net)), \(sales.orders) \(sales.orders == 1 ? "order" : "orders")")
                    } else if showing && loadingSales {
                        ProgressView()
                            .tint(.white)
                            .frame(minHeight: 31, alignment: .leading)
                    } else {
                        Text(context.date, format: .dateTime.hour().minute())
                            .pfFont(26, .light, relativeTo: .largeTitle)
                    }
                }
                .foregroundStyle(.white)
            }
            salesPart
                .padding(.top, 15)
        }
        .padding(.top, 11)
        .padding(.bottom, 16)
        .padding(.horizontal, 17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.navy))
    }

    @ViewBuilder
    private var salesPart: some View {
        let shell = model.shell
        if shell.salesAllowed {
            if shell.salesShown {
                if sales != nil || loadingSales {
                    cardButton("Hide today's sales") { shell.salesShown = false }
                } else if !salesProblem.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(salesProblem)
                            .pfFont(15)
                            .foregroundStyle(.white.opacity(0.8))
                        cardButton("Try again") { Task { await loadSales() } }
                    }
                }
            } else {
                cardButton("Show today's sales") {
                    shell.salesShown = true
                    Task { await loadSales() }
                }
            }
        }
    }

    private func cardButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .pfFont(14, .semibold)
                .foregroundStyle(Theme.linkOnNavy)
        }
        .buttonStyle(.plain)
    }

    private func loadSales() async {
        guard let business = model.site else { return }
        loadingSales = true
        salesProblem = ""
        do {
            let answer = try await API.get("/api/sites/\(business.id)/stats?range=today")
            sales = TodaySales(net: answer["totals"]["net"].int, orders: answer["totals"]["orders"].int)
        } catch let error as APIError {
            if error.status == 403 {
                // This login is not allowed to see sales: the button goes away.
                model.shell.salesAllowed = false
                model.shell.salesShown = false
            } else if error.status == 401 {
                model.sessionEnded()
            } else {
                salesProblem = error.message
            }
        } catch {
            // Cancelled: the screen went away.
        }
        loadingSales = false
    }

    private func refresh() async {
        await model.refreshNow()
        if model.shell.salesShown { await loadSales() }
    }

    // MARK: Tiles

    @ViewBuilder
    private func tile(_ tile: HomeTile) -> some View {
        if model.site?.isOwner == true || !OfficeCatalog.ownerOnly.contains(tile.tab) {
            Button {
                // The tiles with native screens (the owner's Clover photos) open them; the rest open the website's page.
                switch tile.tab {
                case "sales": model.shell.home.append(.salesOverview)
                case "calendar": model.shell.home.append(.appointments)
                case "insights": model.shell.cover = .insights
                case "items": model.shell.cover = .items
                case "close": model.shell.cover = .closeout
                case "r-items": model.shell.cover = .itemSales
                case "tasks": model.shell.cover = .tasks
                default: model.shell.home.append(.page(tile.tab))
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
                    Text(tile.title)
                        .pfFont(17.5, .medium)
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.center)
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
