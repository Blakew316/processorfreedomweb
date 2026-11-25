import SwiftUI

/// Home → Insights, full screen with an X (the owner's Clover photos, rebranded): the large "Insights" with the underlined time frame
/// (it opens the Time frame sheet; the choice is kept while the business is open), then the "Your business snapshot" card: a
/// paragraph written from the period's numbers, Net sales, Net sold (the orders counted in net sales) and Average order size
/// against the previous period, the net sales chart, and "Ask a question", greyed and not tappable: Processor Freedom has no
/// assistant to answer it yet. It opens on the seven whole days before today, as the photo does. Everything is the server's
/// numbers (GET /api/sites/<id>/stats), loaded when the screen appears, when the app comes back, when the time frame changes, on
/// pull, and every minute while it shows today.
struct InsightsScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var choosingFrame = false
    /// The height the page shows, so the grey panel always reaches its bottom (while the numbers load, too), as in the photos.
    @State private var visibleHeight: CGFloat = 0

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
        NavigationStack {
            ScrollView {
                // Measured from the photos: the grey panel starts under the bar with its top-left corner rounded like the
                // card's (a 24 pt circle); the heading's line starts 18.7 pt down, the card 16.6 pt under the heading, and the
                // panel ends 16 pt under the card.
                VStack(alignment: .leading, spacing: 0) {
                    heading(stats)
                    // A refresh that did not work (offline, say): the numbers from before stay, and one quiet line says so.
                    SettingsA.ReloadProblem(problem: stats.refreshProblem)
                        .padding(.top, 10)
                    card(stats)
                        .padding(.top, 16.6)
                }
                .padding(.horizontal, 16)
                .padding(.top, 18.7)
                .padding(.bottom, 16)
                .frame(maxWidth: .infinity, minHeight: visibleHeight, alignment: .topLeading)
                .background(SettingsLook.page, in: UnevenRoundedRectangle(topLeadingRadius: 24, style: .circular))
                .animation(.snappy, value: stats.refreshProblem)
            }
            .onGeometryChange(for: CGFloat.self) { proxy in
                proxy.size.height
            } action: { height in
                visibleHeight = height
            }
            .background(Color(.systemBackground))
            .refreshable { await load(stats) }
            .navigationTitle("Insights")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // The photo's bare black X, its centre 28 pt from the edge: no glass circle behind it.
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
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
                    Text("Insights")
                        .pfFont(19, .bold, relativeTo: .headline)
                        .lineLimit(1)
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .steadyNavigationBar()
        }
        .task(id: LoadKey(frame: stats.frame.key, active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            guard scenePhase == .active, model.phase == .ready else { return }
            await load(stats)
            // Today is read again every minute while the screen shows.
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                if Task.isCancelled { return }
                if stats.refreshesEveryMinute { await load(stats, full: false) }
            }
        }
        .sheet(isPresented: $choosingFrame) {
            TimeFrameSheet(chosen: stats.frame, today: stats.businessToday) { frame in
                stats.frame = frame
            }
        }
    }

    // MARK: Heading

    /// "Insights", 24 pt bold, with the underlined time frame on its right: a preset's name, or the days themselves ("Nov 17 – 23,
    /// 2026") for custom days and the week Insights opens on.
    private func heading(_ stats: StatsModel) -> some View {
        let label = frameLabel(stats)
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("Insights")
                .pfFont(24, .bold, relativeTo: .title)
                .foregroundStyle(Color.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            Button {
                choosingFrame = true
            } label: {
                StatsTimeFrameLink(label: label)
                    .minimumScaleFactor(0.8)
                    // A wider and taller place to tap than the words themselves (44 pt), without moving anything.
                    .padding(.horizontal, 12)
                    .padding(.vertical, 13)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, -12)
            .padding(.vertical, -13)
            .accessibilityLabel("Time frame, \(label)")
            .accessibilityHint("Opens the time frames")
        }
    }

    /// The days of the numbers shown, or, while they load, the days the time frame covers.
    private func frameLabel(_ stats: StatsModel) -> String {
        let range = stats.frame.range
        guard range.isCustomDays else { return range.label }
        if let report = stats.current, !report.from.isEmpty, !report.to.isEmpty {
            return StatsDays.title(from: report.from, to: report.to)
        }
        let span = stats.frame.days(today: stats.businessToday)
        return StatsDays.title(from: span.from, to: span.to)
    }

    // MARK: Your business snapshot

    /// The white card of the photo: 1 pt #E3E3E3 border, 24 pt corners, the title 20 pt bold; "Ask a question" ends 16 pt over
    /// the border at the bottom.
    private func card(_ stats: StatsModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Your business snapshot")
                .pfFont(20, .bold, relativeTo: .title3)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            snapshot(stats)
        }
        .padding(.horizontal, 17.5)
        .padding(.top, 15.8)
        .padding(.bottom, 17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 24, style: .circular))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .circular)
                .strokeBorder(SettingsLook.border, lineWidth: 1)
        }
    }

    @ViewBuilder
    private func snapshot(_ stats: StatsModel) -> some View {
        if let report = stats.current {
            let totals = report.totals
            // Measured from the photos: the paragraph's capitals 11 pt tall (15.5 pt text; its first line is as wide there as
            // at this size here) on lines 24 pt apart, the first baseline 83 pt under the card's top; "Net sales" 15.3 pt under
            // the last baseline; the three figures 98 pt apart; the chart's legend 45 pt under the last figure's arrow, and "Ask
            // a question" 85.5 pt under the chart's bottom line.
            VStack(alignment: .leading, spacing: 0) {
                Text(report.snapshot())
                    .pfFont(15.5)
                    .lineSpacing(5.5)
                    .foregroundStyle(Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 28.4)
                VStack(alignment: .leading, spacing: 24.9) {
                    InsightsFigure(label: "Net sales", value: Money.format(totals.net),
                                   change: StatsChange.of(totals.net, report.previous.net, decimals: 2))
                    InsightsFigure(label: "Net sold", value: String(totals.orders),
                                   change: StatsChange.of(totals.orders, report.previous.orders, decimals: 2))
                    InsightsFigure(label: "Average order size", value: Money.format(totals.average),
                                   change: StatsChange.of(totals.average, report.previousAverage, decimals: 2))
                }
                .padding(.leading, 3)
                .padding(.top, 7.6)
                InsightsChart(points: report.points())
                    .padding(.top, 29)
                askButton
                    .padding(.top, 41)
            }
        } else if let problem = stats.currentProblem {
            Group {
                if stats.problemIsFinal {
                    StatsProblemView(message: problem, fill: false)
                } else {
                    StatsProblemView(message: problem, fill: false) {
                        Task { await load(stats) }
                    }
                }
            }
            .padding(.top, 12)
        } else {
            StatsLoadingView(minHeight: 480)
        }
    }

    /// "Ask a question", greyed and not tappable: Processor Freedom has no assistant to answer questions yet (the owner's decision).
    private var askButton: some View {
        Button {} label: {
            Text("Ask a question")
                .pfFont(16, .medium)
                .foregroundStyle(SettingsLook.greyed)
                .lineLimit(1)
                .padding(.horizontal, 19)
                .frame(minHeight: 48)
                .background(Color(.systemGray5), in: Capsule())
        }
        .buttonStyle(InsightsGreyedButtonStyle())
        .disabled(true)
        .accessibilityValue("Not available yet")
    }

    private func load(_ stats: StatsModel, full: Bool = true) async {
        guard model.phase == .ready, let business = model.site else { return }
        await stats.load(siteID: business.id, full: full)
    }
}

/// A figure of the snapshot: its name in grey, the amount, and the change against the previous period.
struct InsightsFigure: View {
    let label: String
    let value: String
    let change: StatsChange

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
            StatsChangeLine(change: change, words: "vs previous period", style: .arrow)
                .padding(.leading, 2)
                .padding(.top, 4.4)
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
