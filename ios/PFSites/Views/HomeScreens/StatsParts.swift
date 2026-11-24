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
    /// #F0F0F0 and #ABABAB: the round drawings of the empty sections.
    static let artFill = Color(light: UIColor(hex: 0xF0F0F0), dark: .systemGray5)
    static let artInk = Color(light: UIColor(hex: 0xABABAB), dark: .systemGray2)
    /// #F0F0F0 behind the blue share bars of the top lists.
    static let track = Color(light: UIColor(hex: 0xF0F0F0), dark: .systemGray5)
    /// #B7B7B9: the hairlines between the Time frame sheet's rows.
    static let sheetLine = Color(light: UIColor(hex: 0xB7B7B9), dark: .separator)
    /// #5C5C5C: the Insights chart's legend, amounts and day names.
    static let axisText = Color(light: UIColor(hex: 0x5C5C5C), dark: .secondaryLabel)
    /// #E6E6E6 dotted grid lines, and the solid #C7C7C7 line at the bottom of the Insights chart.
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
    var horizontalPadding: CGFloat = 20
    var minHeight: CGFloat = 52
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
            VStack(alignment: .trailing, spacing: 3) {
                Text(StatsDays.title(from: span.from, to: span.to))
                    .pfFont(13, .semibold)
                    .foregroundStyle(Color.primary)
                Text(StatsDays.allDay)
                    .pfFont(12.5)
                    .foregroundStyle(Color.primary)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .accessibilityElement(children: .combine)
        }
        .padding(.horizontal, horizontalPadding)
        .frame(minHeight: minHeight)
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

/// "▲ 12% since yesterday" under Sales Overview's net sales, and "↑ 154.48% vs previous period" under each Insights figure.
struct StatsChangeLine: View {
    enum Style {
        case triangle, arrow
    }

    let change: StatsChange
    let words: String
    let style: Style

    var body: some View {
        switch style {
        case .triangle:
            HStack(spacing: 6.5) {
                if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: 9))
                        .accessibilityHidden(true)
                }
                Text("\(change.text) \(words)")
                    .pfFont(13.5)
            }
            .foregroundStyle(color)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(spoken)
        case .arrow:
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: 17, weight: .light))
                        .foregroundStyle(color)
                        .accessibilityHidden(true)
                }
                Text("\(Text(change.text).fontWeight(.bold).foregroundStyle(color)) \(words)")
                    .pfFont(14)
                    .foregroundStyle(StatsLook.axisText)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(spoken)
        }
    }

    private var symbol: String? {
        switch change.direction {
        case .up: return style == .triangle ? "arrowtriangle.up.fill" : "arrow.up"
        case .down: return style == .triangle ? "arrowtriangle.down.fill" : "arrow.down"
        case .flat: return nil
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
