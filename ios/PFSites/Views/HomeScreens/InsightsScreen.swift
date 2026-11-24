import SwiftUI

/// Home → Insights, full screen with an X (the owner's Clover photos, rebranded): the "Your business snapshot" card with a paragraph
/// written from the period's numbers, Net sales, Net sold (the orders counted in net sales) and Average order size against the
/// previous period, the net sales chart, and "Ask a question", greyed: the server has no assistant to answer it. The time frame
/// row under the heading opens the Time frame sheet; the choice is kept while the business is open.
struct InsightsScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var choosingFrame = false

    /// This screen's time frame and numbers, kept while the business is open.
    private var stats: StatsModel { StatsChoices.shared.model(.insights, shellID: model.shellID) }

    private struct LoadKey: Hashable {
        let frame: String
        let active: Bool
        let ready: Bool
        let site: String
    }

    var body: some View {
        let stats = self.stats
        SettingsPage(title: "Insights", heading: "Insights", refresh: { await load(stats) }) {
            StatsTimeFrameRow(stats: stats, horizontalPadding: 2, minHeight: 44) { choosingFrame = true }
                .padding(.top, -14)
            SettingsCard(title: "Your business snapshot", spacing: 28) {
                snapshot(stats)
            }
        }
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
    private func snapshot(_ stats: StatsModel) -> some View {
        if let report = stats.current {
            let totals = report.totals
            VStack(alignment: .leading, spacing: 0) {
                Text(report.snapshot())
                    .pfFont(15)
                    .lineSpacing(6)
                    .foregroundStyle(Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 26) {
                    InsightsFigure(label: "Net sales", value: Money.format(totals.net),
                                   change: StatsChange.of(totals.net, report.previous.net, decimals: 2))
                    InsightsFigure(label: "Net sold", value: String(totals.orders),
                                   change: StatsChange.of(totals.orders, report.previous.orders, decimals: 2))
                    InsightsFigure(label: "Average order size", value: Money.format(totals.average),
                                   change: StatsChange.of(totals.average, report.previousAverage, decimals: 2))
                }
                .padding(.leading, 3)
                .padding(.top, 8)
                InsightsChart(points: report.points())
                    .padding(.top, 30)
                askButton
                    .padding(.top, 40)
            }
        } else if let problem = stats.currentProblem {
            StatsProblemView(message: problem, fill: false) {
                Task { await load(stats) }
            }
        } else {
            StatsLoadingView(minHeight: 200)
        }
    }

    /// "Ask a question", greyed and not tappable: Processor Freedom has no assistant to answer questions yet.
    private var askButton: some View {
        Button {} label: {
            Text("Ask a question")
                .pfFont(16, .semibold)
                .foregroundStyle(SettingsLook.greyed)
                .padding(.horizontal, 17)
                .frame(minHeight: 48)
                .background(Color(.systemGray6), in: Capsule())
        }
        .buttonStyle(InsightsGreyedButtonStyle())
        .disabled(true)
    }

    private func load(_ stats: StatsModel) async {
        guard model.phase == .ready, let business = model.site else { return }
        await stats.load(siteID: business.id)
    }
}

/// A figure of the snapshot: its name, the amount, and the change against the previous period.
struct InsightsFigure: View {
    let label: String
    let value: String
    let change: StatsChange?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .pfFont(16, .semibold)
                .foregroundStyle(SettingsLook.muted)
            Text(value)
                .pfFont(20.5)
                .foregroundStyle(Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.top, 7)
            if let change {
                StatsChangeLine(change: change, words: "vs previous period", style: .arrow)
                    .padding(.top, 5)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Draws the label as it is, with no pressed or disabled effect of its own: the greyed look is the label's.
struct InsightsGreyedButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
    }
}
