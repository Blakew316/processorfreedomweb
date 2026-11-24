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

    /// Every tile is as tall as the tallest one (a two-line name like "Items and services"), so the grid stays even at any text size.
    @State private var tileHeights: [String: CGFloat] = [:]
    private var tileHeight: CGFloat { max(118, tileHeights.values.max() ?? 0) }

    private struct HomeTile {
        let tab: String
        let title: String
        let icon: String
    }

    private let setup = HomeTile(tab: "tasks", title: "Setup tasks", icon: "checklist")
    private let overview = HomeTile(tab: "sales", title: "Sales overview", icon: "chart.line.uptrend.xyaxis")
    private let insights = HomeTile(tab: "insights", title: "Insights", icon: "sparkles")
    private let calendar = HomeTile(tab: "calendar", title: "Calendar", icon: "calendar")
    private let items = HomeTile(tab: "items", title: "Items and services", icon: "tag")
    private let closeout = HomeTile(tab: "close", title: "Closeout", icon: "banknote")
    private let itemSales = HomeTile(tab: "r-items", title: "Items sales report", icon: "chart.pie")

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
            .padding(.horizontal, 17)
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
        VStack(alignment: .leading, spacing: 0) {
            TimelineView(.everyMinute) { context in
                VStack(alignment: .leading, spacing: 10) {
                    Text(context.date, format: .dateTime.weekday(.wide).month(.wide).day())
                        .pfFont(26, .bold, relativeTo: .title)
                    Text(context.date, format: .dateTime.hour().minute())
                        .pfFont(32, .light, relativeTo: .largeTitle)
                }
                .foregroundStyle(.white)
            }
            salesPart
                .padding(.top, 18)
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 138, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.navy))
    }

    @ViewBuilder
    private var salesPart: some View {
        let shell = model.shell
        if shell.salesAllowed {
            if shell.salesShown {
                if let sales {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(Money.format(sales.net))
                            .pfFont(28, .semibold)
                            .foregroundStyle(.white)
                        Text("Net sales today · \(sales.orders) \(sales.orders == 1 ? "order" : "orders")")
                            .pfFont(15)
                            .foregroundStyle(.white.opacity(0.8))
                        cardButton("Hide today's sales") { shell.salesShown = false }
                            .padding(.top, 10)
                    }
                    .accessibilityElement(children: .contain)
                } else if loadingSales {
                    ProgressView().tint(.white)
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
                .pfFont(18, .semibold)
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
                model.shell.home.append(.page(tile.tab))
            } label: {
                VStack(spacing: 0) {
                    Image(systemName: tile.icon)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(Theme.ink, Theme.blue)
                        .font(.system(size: 32, weight: .regular))
                        .frame(height: 40)
                        .accessibilityHidden(true)
                    Text(tile.title)
                        .pfFont(20, .medium)
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 14)
                }
                .padding(.vertical, 22)
                .padding(.horizontal, 12)
                .onGeometryChange(for: CGFloat.self) { proxy in
                    ceil(proxy.size.height)
                } action: { height in
                    tileHeights[tile.tab] = height
                }
                .frame(maxWidth: .infinity, minHeight: tileHeight)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color(light: .white, dark: .secondarySystemBackground)))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(.systemGray5), lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }
}
