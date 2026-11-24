import SwiftUI
import UIKit

/// The look of Sales Overview, Insights and the Time frame sheet, measured from the owner's Clover photos (1125 x 2436 px of a
/// 375 x 812 pt phone, so 3 px = 1 pt), with Clover's green rebranded to Processor Freedom's blue and navy.
enum StatsLook {
    /// #E5E5E5: the hairlines around the time frame row, and the 12 pt bands between Sales Overview's sections.
    static let hairline = Color(light: UIColor(hex: 0xE5E5E5), dark: .systemGray4)
    static let band = Color(light: UIColor(hex: 0xE5E5E5), dark: .systemGray6)
    /// #727272: "0 Transactions", the cards' second lines and the sheet's times.
    static let subtle = Color(light: UIColor(hex: 0x727272), dark: .secondaryLabel)
    /// #7F7F7F: the words under a section's title.
    static let sectionText = Color(light: UIColor(hex: 0x7F7F7F), dark: .secondaryLabel)
    /// #E70000: a fall against the previous period (a rise is brand blue; never green).
    static let down = Color(light: UIColor(hex: 0xE70000), dark: UIColor(hex: 0xFF6B5F))
    /// #C7C7C7: the 1 pt border of the cards that scroll sideways.
    static let cardBorder = Color(light: UIColor(hex: 0xC7C7C7), dark: .systemGray4)
    static let card = Color(light: .white, dark: .secondarySystemBackground)
    /// #808080: the zero line of the Sales Overview chart.
    static let zeroLine = Color(light: UIColor(hex: 0x808080), dark: .systemGray)
    /// The round drawings of the top lists: #F0F0F0 circle, #ABABAB lines, #D9D9D9, #E0E0E0, #F7F7F7 and white fills.
    static let artFill = Color(light: UIColor(hex: 0xF0F0F0), dark: .systemGray5)
    static let artInk = Color(light: UIColor(hex: 0xABABAB), dark: .systemGray2)
    static let artShade = Color(light: UIColor(hex: 0xD9D9D9), dark: .systemGray3)
    static let artLight = Color(light: UIColor(hex: 0xE0E0E0), dark: .systemGray4)
    static let artPaper = Color(light: UIColor(hex: 0xF7F7F7), dark: .systemGray5)
    static let artWhite = Color(light: .white, dark: .systemGray4)
    /// #F0F0F0 behind the blue share bars of the top lists.
    static let track = Color(light: UIColor(hex: 0xF0F0F0), dark: .systemGray5)
    /// #B7B7B9: the hairlines between the Time frame sheet's rows.
    static let sheetLine = Color(light: UIColor(hex: 0xB7B7B9), dark: .separator)
    /// #5C5C5C: the Insights chart's legend, amounts and day names.
    static let axisText = Color(light: UIColor(hex: 0x5C5C5C), dark: .secondaryLabel)
    /// #696969: "vs previous period" under the Insights figures.
    static let changeWords = Color(light: UIColor(hex: 0x696969), dark: .secondaryLabel)
    /// #E6E6E6 dotted grid lines, and the #C7C7C7 dots between them on the bottom line of the Insights chart.
    static let grid = Color(light: UIColor(hex: 0xE6E6E6), dark: .systemGray4)
    static let axisLine = Color(light: UIColor(hex: 0xC7C7C7), dark: .systemGray3)
}

/// A 1 pt line across the screen.
struct StatsHairline: View {
    var body: some View {
        StatsLook.hairline.frame(height: 1)
    }
}

/// The 12 pt grey band between Sales Overview's sections.
struct StatsBand: View {
    var body: some View {
        StatsLook.band.frame(height: 12)
    }
}

/// The time frame row (the Sales Overview photo): the period underlined in blue, which opens the Time frame sheet, and the days
/// it covers with their hours on the right.
struct StatsTimeFrameRow: View {
    let stats: StatsModel
    let choose: () -> Void

    var body: some View {
        let label = stats.frame.range.label
        let span = days
        HStack(alignment: .center, spacing: 12) {
            Button(action: choose) {
                Text(label)
                    .underline()
                    .pfFont(15)
                    .foregroundStyle(Theme.blue)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Time frame, \(label)")
            .accessibilityHint("Opens the time frames")
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2.5) {
                Text(StatsDays.title(from: span.from, to: span.to))
                    .pfFont(13, .semibold)
                    .foregroundStyle(Color.primary)
                Text(StatsDays.allDay)
                    .pfFont(12)
                    .foregroundStyle(Color.primary)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .accessibilityElement(children: .combine)
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 52)
    }

    /// The days the numbers shown cover, or, while they load, the days the time frame covers.
    private var days: (from: String, to: String) {
        if let report = stats.current, !report.from.isEmpty, !report.to.isEmpty { return (report.from, report.to) }
        return stats.frame.days(today: stats.businessToday)
    }
}

/// While the numbers load.
struct StatsLoadingView: View {
    var minHeight: CGFloat = 0

    var body: some View {
        ProgressView()
            .controlSize(.large)
            .tint(Theme.blue)
            .frame(maxWidth: .infinity, minHeight: minHeight)
            .frame(maxHeight: minHeight > 0 ? nil : .infinity)
    }
}

/// When the numbers could not be loaded: the server's words and Try again (the Orders tab's style; never a red banner).
struct StatsProblemView: View {
    let message: String
    var fill = true
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Text(message)
                .pfFont(17)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button("Try again", action: retry)
                .buttonStyle(SolidButtonStyle(radius: 6, height: 44, size: 17))
                .frame(maxWidth: 200)
        }
        .padding(.horizontal, fill ? 32 : 8)
        .padding(.vertical, fill ? 0 : 24)
        .frame(maxWidth: .infinity)
        .frame(maxHeight: fill ? .infinity : nil)
    }
}

/// "▼ 100% since yesterday" under Sales Overview's net sales (a small filled triangle, all in the change's colour), and
/// "↑ 154.48% vs previous period" under each Insights figure (a thin arrow and the bold percent in the change's colour, grey words).
struct StatsChangeLine: View {
    enum Style {
        case triangle, arrow
    }

    let change: StatsChange
    let words: String
    let style: Style

    @ScaledMetric(relativeTo: .footnote) private var triangleWidth: CGFloat = 7.7
    @ScaledMetric(relativeTo: .footnote) private var triangleHeight: CGFloat = 6.7
    @ScaledMetric(relativeTo: .subheadline) private var arrowWidth: CGFloat = 14.6
    @ScaledMetric(relativeTo: .subheadline) private var arrowHeight: CGFloat = 16

    var body: some View {
        switch style {
        case .triangle:
            HStack(spacing: 6) {
                if change.direction != .flat {
                    StatsTriangle(up: change.direction == .up)
                        .fill(color)
                        .frame(width: triangleWidth, height: triangleHeight)
                        .accessibilityHidden(true)
                }
                Text("\(change.text) \(words)")
                    .pfFont(13)
                    .foregroundStyle(color)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(spoken)
        case .arrow:
            HStack(alignment: .center, spacing: 6.7) {
                if change.direction != .flat {
                    StatsArrow(up: change.direction == .up)
                        .stroke(color, style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                        .frame(width: arrowWidth, height: arrowHeight)
                        .accessibilityHidden(true)
                }
                Text("\(Text(change.text).fontWeight(.bold).foregroundStyle(color)) \(words)")
                    .pfFont(14.5)
                    .foregroundStyle(StatsLook.changeWords)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(spoken)
        }
    }

    private var color: Color {
        switch change.direction {
        case .up: return Theme.blue
        case .down: return StatsLook.down
        case .flat: return StatsLook.subtle
        }
    }

    private var spoken: String {
        switch change.direction {
        case .up: return change.text == "New" ? "New \(words)" : "Up \(change.text) \(words)"
        case .down: return change.text == "New" ? "New \(words)" : "Down \(change.text) \(words)"
        case .flat: return "\(change.text) \(words)"
        }
    }
}

/// The small filled triangle of Sales Overview's change line, pointing up or down.
struct StatsTriangle: Shape {
    let up: Bool

    func path(in rect: CGRect) -> Path {
        var path = Path()
        if up {
            path.move(to: CGPoint(x: rect.midX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        } else {
            path.move(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        }
        path.closeSubpath()
        return path
    }
}

/// The thin arrow of the Insights figures: a stem and an open head, up or down.
struct StatsArrow: Shape {
    let up: Bool

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let inset: CGFloat = 0.7
        let headDepth = rect.width / 2
        let tipY = up ? rect.minY + inset : rect.maxY - inset
        let tailY = up ? rect.maxY - inset : rect.minY + inset
        let barbY = up ? tipY + headDepth : tipY - headDepth
        path.move(to: CGPoint(x: rect.midX, y: tailY))
        path.addLine(to: CGPoint(x: rect.midX, y: tipY))
        path.move(to: CGPoint(x: rect.minX + inset, y: barbY))
        path.addLine(to: CGPoint(x: rect.midX, y: tipY))
        path.addLine(to: CGPoint(x: rect.maxX - inset, y: barbY))
        return path
    }
}

/// The round drawings beside "Top employees by amount collected" and "Top items by net sales": Processor Freedom's own line
/// drawings of a team member and a box, in the photo's style and greys (never Clover's artwork).
struct StatsArt: View {
    enum Subject {
        case person, box
    }

    let subject: Subject
    @ScaledMetric(relativeTo: .title3) private var size: CGFloat = 64

    var body: some View {
        ZStack {
            Circle().fill(StatsLook.artFill)
            switch subject {
            case .person:
                drawn(.shirt, fill: StatsLook.artShade)
                drawn(.collar, fill: StatsLook.artWhite)
                drawn(.badge, fill: StatsLook.artWhite)
                drawn(.neck, fill: StatsLook.artWhite)
                drawn(.head, fill: StatsLook.artWhite)
                drawn(.hair, fill: StatsLook.artShade)
                StatsArtShape(part: .eyes).fill(StatsLook.artInk)
                StatsArtShape(part: .smile).stroke(StatsLook.artInk, style: StrokeStyle(lineWidth: 1, lineCap: .round))
            case .box:
                drawn(.boxTop, fill: StatsLook.artLight)
                drawn(.boxSide, fill: StatsLook.artShade)
                drawn(.boxFront, fill: StatsLook.artPaper)
                drawn(.tapeTop, fill: StatsLook.artShade)
                drawn(.tapeFront, fill: StatsLook.artShade)
                StatsArtShape(part: .label).fill(StatsLook.artShade)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private func drawn(_ part: StatsArtShape.Part, fill: Color) -> some View {
        StatsArtShape(part: part)
            .fill(fill)
            .overlay {
                StatsArtShape(part: part)
                    .stroke(StatsLook.artInk, style: StrokeStyle(lineWidth: 1, lineJoin: .round))
            }
    }
}

/// The parts of the drawings, drawn on a 64 x 64 grid and scaled to the circle.
struct StatsArtShape: Shape {
    enum Part {
        case shirt, collar, badge, neck, head, hair, eyes, smile
        case boxTop, boxSide, boxFront, tapeTop, tapeFront, label
    }

    let part: Part

    func path(in rect: CGRect) -> Path {
        var path = Path()
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: y) }
        switch part {
        case .shirt:
            path.move(to: point(9, 68))
            path.addLine(to: point(11, 53))
            path.addQuadCurve(to: point(22, 42), control: point(12.5, 44))
            path.addLine(to: point(42, 42))
            path.addQuadCurve(to: point(53, 53), control: point(51.5, 44))
            path.addLine(to: point(55, 68))
            path.closeSubpath()
        case .collar:
            path.move(to: point(26.5, 42))
            path.addLine(to: point(32, 50))
            path.addLine(to: point(37.5, 42))
            path.closeSubpath()
        case .badge:
            path.addRoundedRect(in: CGRect(x: 38, y: 51, width: 8, height: 5), cornerSize: CGSize(width: 1, height: 1))
        case .neck:
            path.addRect(CGRect(x: 28.5, y: 34, width: 7, height: 8))
        case .head:
            path.addEllipse(in: CGRect(x: 22.5, y: 15, width: 19, height: 21))
        case .hair:
            path.move(to: point(22.6, 25))
            path.addQuadCurve(to: point(32, 13.5), control: point(22, 14))
            path.addQuadCurve(to: point(41.4, 25), control: point(42, 14))
            path.addQuadCurve(to: point(33, 19.5), control: point(37, 20))
            path.addQuadCurve(to: point(22.6, 25), control: point(26, 20.5))
            path.closeSubpath()
        case .eyes:
            path.addEllipse(in: CGRect(x: 27.3, y: 25.8, width: 2, height: 2))
            path.addEllipse(in: CGRect(x: 34.7, y: 25.8, width: 2, height: 2))
        case .smile:
            path.move(to: point(29, 30.5))
            path.addQuadCurve(to: point(35, 30.5), control: point(32, 33.5))
        case .boxTop:
            path.move(to: point(14.5, 23))
            path.addLine(to: point(20.5, 17))
            path.addLine(to: point(49.5, 17))
            path.addLine(to: point(43.5, 23))
            path.closeSubpath()
        case .boxSide:
            path.move(to: point(43.5, 23))
            path.addLine(to: point(49.5, 17))
            path.addLine(to: point(49.5, 42))
            path.addLine(to: point(43.5, 48))
            path.closeSubpath()
        case .boxFront:
            path.addRoundedRect(in: CGRect(x: 14.5, y: 23, width: 29, height: 25), cornerSize: CGSize(width: 1.5, height: 1.5))
        case .tapeTop:
            path.move(to: point(26, 23))
            path.addLine(to: point(32, 17))
            path.addLine(to: point(38, 17))
            path.addLine(to: point(32, 23))
            path.closeSubpath()
        case .tapeFront:
            path.addRect(CGRect(x: 26, y: 23, width: 6, height: 7.5))
        case .label:
            path.addRoundedRect(in: CGRect(x: 34.5, y: 41.5, width: 7, height: 3.5), cornerSize: CGSize(width: 1, height: 1))
        }
        let scale = min(rect.width, rect.height) / 64
        return path.applying(CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: rect.minX, ty: rect.minY))
    }
}
