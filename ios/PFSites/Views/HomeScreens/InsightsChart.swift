import SwiftUI

/// The Insights chart (the owner's photo, rebranded): the "Net sales" legend, the amounts on the left at four dotted lines, the
/// line of net sales by day (by hour for a one-day period) in brand blue over a fading blue area, and the slanted day names under
/// each point.
struct InsightsChart: View {
    let points: [StatsPoint]

    /// Half the height of an amount's line, so the top amount (centred on the top line) has room above the plot.
    @ScaledMetric(relativeTo: .caption) private var labelHalf: CGFloat = 8
    /// About how wide a character of the slanted names is, to leave room for the longest one under the plot.
    @ScaledMetric(relativeTo: .caption) private var nameCharacter: CGFloat = 7.1
    @ScaledMetric(relativeTo: .caption) private var nameLine: CGFloat = 16

    /// Measured from the photo: four lines 52.7 pt apart, the top one 24.5 pt under the legend's baseline, the plot 9.5 pt in
    /// from both sides of the card's content, 15.7 pt between the amounts and the plot, and the names' ends 21 pt under the
    /// bottom line.
    private var plotHeight: CGFloat { 158 }
    private var namesDrop: CGFloat { 21.1 }

    var body: some View {
        let scale = StatsScale(values: points.map(\.cents))
        VStack(alignment: .leading, spacing: 12.3) {
            legend
                .padding(.leading, 17.5)
            HStack(alignment: .top, spacing: 15.7) {
                amounts(scale)
                plot(scale)
            }
            .padding(.top, labelHalf)
            .padding(.horizontal, 9.5)
        }
    }

    /// The legend's sample of the chart (16 x 6.7 pt in the photo: a 1 pt line over its fading area) and "Net sales", its "N"
    /// 13 pt after the sample.
    private var legend: some View {
        HStack(alignment: .lastTextBaseline, spacing: 11.6) {
            VStack(spacing: 0) {
                Theme.blue.frame(height: 1)
                LinearGradient(colors: [Theme.blue.opacity(0.32), Theme.blue.opacity(0.06)], startPoint: .top, endPoint: .bottom)
                    .frame(height: 5.7)
            }
            .frame(width: 16)
            .accessibilityHidden(true)
            Text("Net sales")
                .pfFont(16, .bold)
                .foregroundStyle(StatsLook.axisText)
        }
    }

    /// The amounts at the lines, right-aligned in a column as wide as the widest one.
    private func amounts(_ scale: StatsScale) -> some View {
        Text(scale.widestLabel)
            .pfFont(13.5, .light)
            .fixedSize()
            .hidden()
            .frame(height: plotHeight)
            .overlay {
                GeometryReader { geo in
                    ForEach(scale.ticks, id: \.self) { tick in
                        Text(Money.format(tick))
                            .pfFont(13.5, .light)
                            .foregroundStyle(StatsLook.axisText)
                            .fixedSize()
                            .frame(width: geo.size.width, alignment: .trailing)
                            .position(x: geo.size.width / 2, y: scale.y(tick, height: plotHeight))
                    }
                }
            }
            .accessibilityHidden(true)
    }

    /// Room under the plot for the longest slanted name.
    private var namesBand: CGFloat {
        let longest = CGFloat(shownNames.map(\.label.count).max() ?? 3)
        return namesDrop + (longest * nameCharacter + nameLine / 2) * 0.7071 + 3
    }

    /// Every name for a week or less; otherwise every few, so about eight show.
    private var every: Int {
        points.count <= 8 ? 1 : Int((Double(points.count) / 8).rounded(.up))
    }

    private var shownNames: [StatsPoint] {
        points.enumerated().filter { $0.offset % every == 0 }.map { $0.element }
    }

    private func plot(_ scale: StatsScale) -> some View {
        GeometryReader { geo in
            let width = geo.size.width
            let slot = width / CGFloat(max(points.count, 1))
            let xs = points.indices.map { slot * (CGFloat($0) + 0.5) }
            let ys = points.map { scale.y($0.cents, height: plotHeight) }
            let baseY = scale.y(0, height: plotHeight)
            ZStack(alignment: .topLeading) {
                drawing(scale: scale, width: width, xs: xs, ys: ys, baseY: baseY)
                    .accessibilityHidden(true)
                // VoiceOver reads each day (or hour) and its net sales.
                HStack(spacing: 0) {
                    ForEach(points) { point in
                        Color.clear
                            .accessibilityElement()
                            .accessibilityLabel(point.spoken)
                            .accessibilityValue(Money.format(point.cents))
                    }
                }
                .frame(width: width, height: plotHeight)
            }
        }
        .frame(height: plotHeight)
        .padding(.bottom, namesBand)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Net sales chart")
    }

    /// The lines, the area and the line of net sales, and the slanted names, in the plot's own points.
    private func drawing(scale: StatsScale, width: CGFloat, xs: [CGFloat], ys: [CGFloat], baseY: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(Array(scale.ticks.enumerated()), id: \.offset) { index, tick in
                let y = scale.y(tick, height: plotHeight)
                Path { path in
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: width, y: y))
                }
                .stroke(StatsLook.grid, style: StrokeStyle(lineWidth: 1, dash: [1, 1]))
                if index == 0 {
                    // The bottom line: darker dots between the grid's, so it reads as one solid light line.
                    Path { path in
                        path.move(to: CGPoint(x: 0, y: y))
                        path.addLine(to: CGPoint(x: width, y: y))
                    }
                    .stroke(StatsLook.axisLine, style: StrokeStyle(lineWidth: 1, dash: [1, 1], dashPhase: 1))
                }
            }
            if xs.count > 1 {
                Path { path in
                    path.move(to: CGPoint(x: xs[0], y: baseY))
                    for index in xs.indices { path.addLine(to: CGPoint(x: xs[index], y: ys[index])) }
                    path.addLine(to: CGPoint(x: xs[xs.count - 1], y: baseY))
                    path.closeSubpath()
                }
                .fill(LinearGradient(colors: [Theme.blue.opacity(0.36), Theme.blue.opacity(0.06)], startPoint: .top, endPoint: .bottom))
                Path { path in
                    path.move(to: CGPoint(x: xs[0], y: ys[0]))
                    for index in xs.indices.dropFirst() { path.addLine(to: CGPoint(x: xs[index], y: ys[index])) }
                }
                // 1 pt in the photo (3 px on the level stretch from Sunday to Monday).
                .stroke(Theme.blue, style: StrokeStyle(lineWidth: 1, lineCap: .round, lineJoin: .round))
            } else if let x = xs.first, let y = ys.first {
                Circle()
                    .fill(Theme.blue)
                    .frame(width: 6, height: 6)
                    .position(x: x, y: y)
            }
            ForEach(Array(points.enumerated()), id: \.element.id) { index, point in
                if index % every == 0 {
                    // Slanted up to the right, its end just under its point, as in the photo.
                    Text(point.label)
                        .pfFont(13.5, .light)
                        .foregroundStyle(StatsLook.axisText)
                        .fixedSize()
                        .rotationEffect(.degrees(-45), anchor: .trailing)
                        .frame(width: 0, height: 0, alignment: .trailing)
                        .position(x: xs[index] - 1, y: plotHeight + namesDrop)
                }
            }
        }
        .frame(width: width, height: plotHeight, alignment: .topLeading)
    }
}

/// The amounts up the side of the Insights chart: four lines from zero (or from below zero when refunds pushed a day under it) at
/// a round step, $5,000.00 apart for a best day of $13,314.73, as in the photo.
struct StatsScale {
    let low: Int
    let step: Int

    init(values: [Int]) {
        let top = max(values.max() ?? 0, 0)
        let bottom = min(values.min() ?? 0, 0)
        guard top > bottom else {
            // No sales: the line lies on $0.00 under lines $100.00 apart.
            self.low = 0
            self.step = 10_000
            return
        }
        var size = StatsScale.nice(Double(top - bottom) / 3)
        var start = Int((Double(bottom) / Double(size)).rounded(.down)) * size
        while start + 3 * size < top {
            size = StatsScale.nice(Double(size) + 1)
            start = Int((Double(bottom) / Double(size)).rounded(.down)) * size
        }
        self.low = start
        self.step = size
    }

    var high: Int { low + 3 * step }
    var ticks: [Int] { (0...3).map { low + $0 * step } }
    var widestLabel: String { ticks.map { Money.format($0) }.max { $0.count < $1.count } ?? Money.format(high) }

    /// Where a value sits, from the top of a plot this tall.
    func y(_ value: Int, height: CGFloat) -> CGFloat {
        height * (1 - CGFloat(value - low) / CGFloat(max(3 * step, 1)))
    }

    /// The smallest of 1, 2, 2.5 and 5 times a power of ten at or above the value, in whole cents.
    static func nice(_ raw: Double) -> Int {
        guard raw > 0 else { return 1 }
        let magnitude = pow(10, floor(log10(raw)))
        for multiple in [1.0, 2.0, 2.5, 5.0, 10.0] where multiple * magnitude >= raw {
            return max(1, Int((multiple * magnitude).rounded(.up)))
        }
        return max(1, Int((10 * magnitude).rounded(.up)))
    }
}
