import SwiftUI

/// The Sales Overview chart (the owner's photo): a brand-blue bar for each hour of a one-day period (up to now for today) or each
/// day of a longer one, the amount over each bar when there is room for it (shortened when it is wide), the grey zero line across
/// the chart, and the hour or day names under it. A tap on a bar writes its amount in full over it; another tap takes it away.
struct SalesOverviewChart: View {
    let points: [StatsPoint]
    let byHour: Bool

    @State private var selected: String?
    @ScaledMetric(relativeTo: .caption) private var valueLift: CGFloat = 11

    /// Measured from the photo: the zero line sits 120 pt under the top of the chart (20 pt of room for the amount over the
    /// tallest bar, then 100 pt of bar), the names 57 pt under it, and the cards start 330 pt under the top.
    static let height: CGFloat = 330
    private static let valueRoom: CGFloat = 20
    private static let barRoom: CGFloat = 100
    private static let namesBelow: CGFloat = 57

    /// Where everything goes for a chart this wide.
    private struct Plan {
        let slot: CGFloat
        let barWidth: CGFloat
        let span: CGFloat
        let zeroY: CGFloat
        let every: Int
        let amountsFit: Bool

        init(points: [StatsPoint], width: CGFloat) {
            let count = max(points.count, 1)
            slot = width / CGFloat(count)
            barWidth = min(max(slot * 0.62, min(1, slot)), 32)
            let high = max(points.map(\.cents).max() ?? 0, 0)
            let low = min(points.map(\.cents).min() ?? 0, 0)
            span = CGFloat(max(high - low, 1))
            let share = high == 0 && low == 0 ? 1 : CGFloat(high) / span
            zeroY = SalesOverviewChart.valueRoom + SalesOverviewChart.barRoom * share
            every = max(1, Int((Double(count) / 8).rounded(.up)))
            amountsFit = count <= 8
        }

        func x(_ index: Int) -> CGFloat { slot * (CGFloat(index) + 0.5) }
        func length(_ cents: Int) -> CGFloat { SalesOverviewChart.barRoom * CGFloat(abs(cents)) / span }
        func top(_ cents: Int) -> CGFloat { cents >= 0 ? zeroY - length(cents) : zeroY }
    }

    var body: some View {
        GeometryReader { geo in
            chart(Plan(points: points, width: geo.size.width), width: geo.size.width)
        }
        .frame(height: SalesOverviewChart.height)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(byHour ? "Net sales by hour" : "Net sales by day")
        .onChange(of: points.map(\.id)) { _, _ in selected = nil }
    }

    private func chart(_ plan: Plan, width: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                ForEach(Array(points.enumerated()), id: \.element.id) { index, point in
                    mark(point, index: index, plan: plan, width: width)
                }
                StatsLook.zeroLine
                    .frame(width: width, height: 1)
                    .position(x: width / 2, y: plan.zeroY)
            }
            .accessibilityHidden(true)
            targets(width: width)
        }
        .frame(width: width, height: SalesOverviewChart.height, alignment: .topLeading)
    }

    /// One bar with its amount and its name.
    @ViewBuilder
    private func mark(_ point: StatsPoint, index: Int, plan: Plan, width: CGFloat) -> some View {
        let x = plan.x(index)
        let length = max(plan.length(point.cents), 1)
        let top = plan.top(point.cents)
        let chosen = selected == point.id
        let dimmed = selected != nil && !chosen
        if point.cents != 0 {
            bar(up: point.cents > 0)
                .fill(Theme.blue.opacity(dimmed ? 0.35 : 1))
                .frame(width: plan.barWidth, height: length)
                .position(x: x, y: top + length / 2)
        }
        if plan.amountsFit || chosen {
            // The tapped bar's amount is written in full, kept inside the chart, on the page's colour so it reads over the
            // bars and amounts beside it. Measured from the photo: digits 9 pt tall, their middle 11 pt over the line.
            let text = amount(point.cents, room: chosen ? .infinity : plan.slot - 4)
            let half = estimatedWidth(text) / 2
            Text(text)
                .pfFont(12.75, .semibold)
                .foregroundStyle(Theme.blue.opacity(dimmed ? 0.35 : 1))
                .fixedSize()
                .padding(.horizontal, chosen ? 3 : 0)
                .background(chosen ? Color(.systemBackground) : Color.clear)
                .position(x: chosen ? min(max(x, half), max(width - half, half)) : x,
                          y: point.cents >= 0 ? top - valueLift : top + length + valueLift)
                .zIndex(chosen ? 1 : 0)
        }
        if index % plan.every == 0 {
            Text(point.label)
                .pfFont(10, .semibold)
                .foregroundStyle(Color.primary)
                .fixedSize()
                .position(x: x, y: SalesOverviewChart.valueRoom + SalesOverviewChart.barRoom + SalesOverviewChart.namesBelow)
        }
    }

    /// One tap target per bar: a tap shows that bar's amount (another tap hides it), and VoiceOver reads each bar.
    private func targets(width: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(points) { point in
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        Haptics.light()
                        withAnimation(.snappy) { selected = selected == point.id ? nil : point.id }
                    }
                    .accessibilityElement()
                    .accessibilityLabel(point.spoken)
                    .accessibilityValue(Money.format(point.cents))
            }
        }
        .frame(width: width, height: SalesOverviewChart.valueRoom + SalesOverviewChart.barRoom + SalesOverviewChart.namesBelow + 12)
    }

    /// The website's way of writing a bar's amount ("$0", "$1,250"), shortened ("$12.5K", then "$13K") when it would not fit
    /// over its bar.
    private func amount(_ cents: Int, room: CGFloat) -> String {
        let full = StatsFormat.chartMoney(cents)
        if estimatedWidth(full) <= room { return full }
        let short = StatsFormat.compactMoney(cents)
        return estimatedWidth(short) <= room ? short : StatsFormat.compactMoney(cents, whole: true)
    }

    /// About how wide an amount is drawn: 8 pt for a digit, a letter or the dollar sign and 3.6 pt for a point or a comma.
    private func estimatedWidth(_ text: String) -> CGFloat {
        text.reduce(CGFloat(0)) { $0 + ($1 == "." || $1 == "," ? 3.6 : 8) } * (valueLift / 11)
    }

    private func bar(up: Bool) -> UnevenRoundedRectangle {
        UnevenRoundedRectangle(topLeadingRadius: up ? 3 : 0, bottomLeadingRadius: up ? 0 : 3, bottomTrailingRadius: up ? 0 : 3,
                               topTrailingRadius: up ? 3 : 0, style: .continuous)
    }
}
