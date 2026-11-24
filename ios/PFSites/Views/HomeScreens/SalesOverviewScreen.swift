import SwiftUI

/// Home → Sales overview (the owner's Clover photos, rebranded): the time frame row, net sales with its transactions and the
/// change against the previous period, the chart, the cards that scroll sideways, then the top employees and the top items.
/// Everything is the server's numbers (GET /api/sites/<id>/stats). It refreshes when it appears, when the app comes back, when
/// the time frame changes, and on pull.
struct SalesOverviewScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var choosingFrame = false

    /// This screen's time frame and numbers, kept while the business is open.
    private var stats: StatsModel { StatsChoices.shared.model(.salesOverview, shellID: model.shellID) }

    private struct LoadKey: Hashable {
        let frame: String
        let active: Bool
        let ready: Bool
        let site: String
    }

    var body: some View {
        let stats = self.stats
        VStack(spacing: 0) {
            StatsHairline()
            StatsTimeFrameRow(stats: stats) { choosingFrame = true }
            StatsHairline()
            content(stats)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color(.systemBackground))
        .navigationTitle("Sales Overview")
        .navigationSubtitle((model.site?.name ?? "").uppercased())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    model.shell.sheet = .locations
                } label: {
                    Image(systemName: "arrow.left.arrow.right")
                }
                // With one business it is shown disabled, as on Home.
                .disabled(!model.canChangeLocation)
                .accessibilityLabel("Switch location")
            }
        }
        .steadyNavigationBar()
        .task(id: LoadKey(frame: stats.frame.key, active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            guard scenePhase == .active else { return }
            await load(stats)
        }
        .sheet(isPresented: $choosingFrame) {
            TimeFrameSheet(chosen: stats.frame, today: stats.businessToday) { frame in
                stats.frame = frame
            }
        }
    }

    @ViewBuilder
    private func content(_ stats: StatsModel) -> some View {
        if let report = stats.current {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    headline(report)
                    SalesOverviewChart(points: report.points(), byHour: report.hourly)
                        .padding(.horizontal, 19)
                        .padding(.top, 12)
                    cards(report, ledger: stats.ledgerRefunds)
                    StatsBand()
                        .padding(.top, 16)
                    SalesOverviewTopList(title: "Top employees by amount collected", symbol: "person", rows: employeeRows(report))
                    StatsBand()
                    SalesOverviewTopList(title: "Top items by net sales", symbol: "shippingbox", rows: itemRows(report))
                    StatsBand()
                }
            }
            .refreshable { await load(stats) }
        } else if let problem = stats.currentProblem {
            StatsProblemView(message: problem) {
                Task { await load(stats) }
            }
        } else {
            StatsLoadingView()
        }
    }

    // MARK: Net sales

    private func headline(_ report: StatsReport) -> some View {
        let totals = report.totals
        return VStack(alignment: .leading, spacing: 0) {
            Text("Net sales")
                .pfFont(16, .semibold)
                .foregroundStyle(Theme.blue)
            Text(Money.format(totals.net))
                .pfFont(36, .bold, relativeTo: .largeTitle)
                .foregroundStyle(Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .padding(.top, 6)
            Text(StatsFormat.count(totals.orders, "Transaction", "Transactions"))
                .pfFont(14)
                .foregroundStyle(StatsLook.subtle)
                .padding(.leading, 2)
            if let change = StatsChange.of(totals.net, report.previous.net, decimals: 0) {
                StatsChangeLine(change: change, words: report.sinceWords, style: .triangle)
                    .padding(.leading, 2)
                    .padding(.top, 2)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: Cards

    /// Refunds and Discounts as in the photo, then the period's other money figures, each with its count where the server has one.
    private func cards(_ report: StatsReport, ledger: (count: Int, total: Int)?) -> some View {
        let totals = report.totals
        let list = [
            SalesOverviewCardData(title: "Refunds", amount: Money.format(ledger?.total ?? report.money.refunds),
                                  detail: ledger.map { StatsFormat.count($0.count, "transaction", "transactions") }),
            SalesOverviewCardData(title: "Discounts", amount: Money.format(report.discountTotal),
                                  detail: StatsFormat.count(report.discountCount, "discount", "discounts")),
            SalesOverviewCardData(title: "Tips", amount: Money.format(totals.tips),
                                  detail: report.tipOrders.map { StatsFormat.count($0, "tip", "tips") }),
            SalesOverviewCardData(title: "Taxes", amount: Money.format(totals.tax),
                                  detail: report.taxRate > 0 ? "At \(StatsFormat.rate(report.taxRate))" : "No tax rate set"),
            SalesOverviewCardData(title: "Gross sales", amount: Money.format(totals.gross),
                                  detail: StatsFormat.count(totals.units, "item sold", "items sold")),
            SalesOverviewCardData(title: "Amount collected", amount: Money.format(report.money.collected),
                                  detail: StatsFormat.count(report.money.count, "payment", "payments")),
        ]
        return ScrollView(.horizontal) {
            HStack(spacing: 12) {
                ForEach(list) { card in
                    SalesOverviewCard(card: card)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 1)
        }
        .scrollIndicators(.hidden)
    }

    // MARK: Top lists

    /// The people credited with the period's orders, by what their orders took in (the website's Employee sales "Total collected").
    private func employeeRows(_ report: StatsReport) -> [SalesOverviewTopRow] {
        report.employees
            .filter { $0.orders != 0 || $0.total != 0 }
            .sorted { $0.total > $1.total }
            .prefix(5)
            .map { SalesOverviewTopRow(id: $0.name, name: $0.name, detail: StatsFormat.count($0.orders, "order", "orders"), cents: $0.total) }
    }

    /// The items with the most net sales (after their share of discounts and refunds, as the server works it out).
    private func itemRows(_ report: StatsReport) -> [SalesOverviewTopRow] {
        report.items
            .filter { $0.qty != 0 || $0.sales != 0 }
            .sorted { $0.sales != $1.sales ? $0.sales > $1.sales : $0.qty > $1.qty }
            .prefix(5)
            .map { SalesOverviewTopRow(id: $0.name, name: $0.name, detail: "\($0.qty) sold", cents: $0.sales) }
    }

    private func load(_ stats: StatsModel) async {
        guard model.phase == .ready, let business = model.site else { return }
        await stats.load(siteID: business.id)
    }
}

/// A card of the sideways row: its name, the amount, and a count (left empty when the server has none, so the cards stay even).
struct SalesOverviewCardData: Identifiable {
    let title: String
    let amount: String
    let detail: String?

    var id: String { title }
}

/// The card from the photo: 166 pt wide, 1 pt #C7C7C7 border, 6 pt corners.
struct SalesOverviewCard: View {
    let card: SalesOverviewCardData
    @ScaledMetric(relativeTo: .body) private var width: CGFloat = 166

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(card.title)
                .pfFont(13.5)
                .foregroundStyle(Color.primary)
            Text(card.amount)
                .pfFont(17, .bold)
                .foregroundStyle(Color.primary)
                .padding(.top, 5)
            Text(card.detail ?? " ")
                .pfFont(13.5)
                .foregroundStyle(StatsLook.subtle)
                .padding(.top, 2)
                .opacity(card.detail == nil ? 0 : 1)
                .accessibilityHidden(card.detail == nil)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .padding(.leading, 17)
        .padding(.trailing, 12)
        .padding(.top, 14)
        .padding(.bottom, 18)
        .frame(width: width, alignment: .leading)
        .background(StatsLook.card, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(StatsLook.cardBorder, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }
}

/// A line of a top list: the name, what it counts, and its amount.
struct SalesOverviewTopRow: Identifiable {
    let id: String
    let name: String
    let detail: String
    let cents: Int
}

/// "Top employees by amount collected" and "Top items by net sales": the top five with a blue bar for their share of the first,
/// or the photo's empty state (the round drawing, the title and the photo's words) when the period has none.
struct SalesOverviewTopList: View {
    let title: String
    let symbol: String
    let rows: [SalesOverviewTopRow]

    var body: some View {
        if rows.isEmpty {
            empty
        } else {
            list
        }
    }

    private var empty: some View {
        HStack(alignment: .top, spacing: 19) {
            Circle()
                .fill(StatsLook.artFill)
                .frame(width: 64, height: 64)
                .overlay {
                    Image(systemName: symbol)
                        .font(.system(size: 27, weight: .light))
                        .foregroundStyle(StatsLook.artInk)
                }
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 9) {
                Text(title)
                    .pfFont(18.5, .bold, relativeTo: .title3)
                    .foregroundStyle(Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    // The photo's title wraps after "by", narrower than the words under it.
                    .frame(maxWidth: 215, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                Text("No transactions or transactions with items were recorded for the time period.")
                    .pfFont(14)
                    .foregroundStyle(StatsLook.sectionText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.top, 27)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
    }

    private var list: some View {
        let top = max(rows.map(\.cents).max() ?? 0, 1)
        return VStack(alignment: .leading, spacing: 18) {
            Text(title)
                .pfFont(18.5, .bold, relativeTo: .title3)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            ForEach(rows) { row in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(row.name)
                            .pfFont(16)
                            .foregroundStyle(Color.primary)
                            .lineLimit(2)
                        Spacer(minLength: 8)
                        Text(Money.format(row.cents))
                            .pfFont(16, .semibold)
                            .foregroundStyle(Color.primary)
                    }
                    Text(row.detail)
                        .pfFont(14)
                        .foregroundStyle(StatsLook.sectionText)
                    GeometryReader { geo in
                        Capsule()
                            .fill(StatsLook.track)
                            .overlay(alignment: .leading) {
                                Capsule()
                                    .fill(Theme.blue)
                                    .frame(width: geo.size.width * min(1, CGFloat(max(row.cents, 0)) / CGFloat(top)))
                            }
                    }
                    .frame(height: 4)
                    .accessibilityHidden(true)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 24)
        .padding(.bottom, 26)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
