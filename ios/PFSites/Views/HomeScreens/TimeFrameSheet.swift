import SwiftUI

/// The Time frame sheet (the owner's photo): "Time frame" with an X, then Today, Yesterday, This week, This month, Last 7 days,
/// Last 30 days, Last 90 days and Custom (with its calendar), each with the days it covers, the chosen one in brand blue with a
/// check. Custom opens a start and an end date (never after the business's today, at most 731 days apart, the server's limit).
/// Sales Overview and Insights both use it; each keeps its own choice.
struct TimeFrameSheet: View {
    let chosen: StatsTimeFrame
    /// The business's date ("2026-11-24").
    let today: String
    let choose: (StatsTimeFrame) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.displayScale) private var displayScale
    @State private var customOpen = false
    /// Counts the taps that open Custom, so the list scrolls to show its dates.
    @State private var revealCustom = 0
    /// Whether Custom's dates can be seen: the sheet can open with them already open below the last row in view.
    @State private var datesInView = false
    @State private var start = Date()
    @State private var end = Date()

    /// Measured from the photo: the title's line starts 20 pt under the top of the sheet and the rows 43 pt under it, so the
    /// empty bottom of the title's line (under its baseline) runs 0.9 pt into the first row, as there. Both grow with the title's
    /// text size, so the title never reaches the rows at any size. The title, the rows' names and their dates are all drawn in
    /// one weight there (strokes 0.17 of the capitals' height: semibold), the hours under the dates in regular.
    @ScaledMetric(relativeTo: .title3) private var titleTop: CGFloat = 20
    @ScaledMetric(relativeTo: .title3) private var titleBand: CGFloat = 43
    /// The Custom row's calendar: 13.4 pt square in the photo, 17 pt after "Custom".
    @ScaledMetric(relativeTo: .body) private var calendarSize: CGFloat = 13.4

    private static let customID = "customDates"

    var body: some View {
        VStack(spacing: 0) {
            Text("Time frame")
                .pfFont(20, .semibold, relativeTo: .title3)
                .foregroundStyle(Color.primary)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
                .padding(.top, titleTop)
                .padding(.leading, 18)
                .padding(.trailing, 64)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(height: titleBand, alignment: .top)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(StatsRange.rows) { range in
                            presetRow(range)
                            separator
                        }
                        customRow
                        if customOpen {
                            customDates
                                .id(TimeFrameSheet.customID)
                                .transition(.opacity)
                                .onScrollVisibilityChange(threshold: 0.2) { datesInView = $0 }
                        }
                    }
                    .padding(.bottom, 24)
                }
                .onChange(of: revealCustom) { _, _ in
                    Task {
                        try? await Task.sleep(nanoseconds: 300_000_000)
                        withAnimation(.snappy) { proxy.scrollTo(TimeFrameSheet.customID, anchor: .bottom) }
                    }
                }
            }
        }
        .overlay(alignment: .topTrailing) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(Color.primary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
            .padding(.top, 10.7)
            .padding(.trailing, 8)
        }
        .background(Color(.systemBackground))
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        .onAppear(perform: prefill)
    }

    // MARK: Rows

    private func presetRow(_ range: StatsRange) -> some View {
        let on = chosen.range == range
        let span = StatsTimeFrame(range: range).days(today: today)
        return Button {
            if !on { Haptics.light() }
            choose(StatsTimeFrame(range: range))
            dismiss()
        } label: {
            HStack(alignment: .center, spacing: 0) {
                Text(range.label)
                    .pfFont(15.5, .semibold)
                    .foregroundStyle(on ? Theme.blue : Color.primary)
                Spacer(minLength: 12)
                dates(from: span.from, to: span.to, on: on)
                check(on)
            }
            .padding(.leading, 18)
            .padding(.trailing, 21)
            .frame(maxWidth: .infinity, minHeight: rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// Custom, with its calendar: it opens the start and end dates under it. When custom days are chosen (or Insights shows the
    /// week before today), it is marked, with its days.
    private var customRow: some View {
        let on = chosen.range.isCustomDays
        let span = chosen.days(today: today)
        return Button {
            // Open, but below what is in view: the tap brings the dates up instead of closing them unseen.
            if customOpen && !datesInView {
                revealCustom += 1
                return
            }
            withAnimation(.snappy) { customOpen.toggle() }
            if customOpen { revealCustom += 1 } else { datesInView = false }
        } label: {
            HStack(alignment: .center, spacing: 0) {
                HStack(spacing: 16) {
                    Text(StatsRange.custom.label)
                        .pfFont(15.5, .semibold)
                        .foregroundStyle(on ? Theme.blue : Color.primary)
                    TimeFrameCalendarGlyph()
                        .stroke(Theme.blue, lineWidth: calendarSize * TimeFrameCalendarGlyph.lineWidth / TimeFrameCalendarGlyph.grid)
                        .frame(width: calendarSize, height: calendarSize)
                        .accessibilityHidden(true)
                }
                Spacer(minLength: 12)
                if on {
                    dates(from: span.from, to: span.to, on: true)
                }
                check(on)
            }
            .padding(.leading, 18)
            .padding(.trailing, 21)
            .frame(maxWidth: .infinity, minHeight: rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityHint(customOpen && datesInView ? "Hides the dates" : "Shows a start and end date")
    }

    /// The days on the right: the date (or first and last day) semibold, the hours under it; brand blue on the chosen row.
    /// Measured from the photo: the hours' capitals 8.7 pt tall (12 pt text, as on Sales Overview) and their baseline 14 pt under
    /// the date's, closer than two lines of text set by themselves.
    private func dates(from: String, to: String, on: Bool) -> some View {
        VStack(alignment: .trailing, spacing: -0.8) {
            Text(StatsDays.title(from: from, to: to))
                .pfFont(13, .semibold)
                .foregroundStyle(on ? Theme.blue : Color.primary)
            Text(StatsDays.allDay)
                .pfFont(12)
                .foregroundStyle(on ? Theme.blue : StatsLook.subtle)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }

    /// The check of the chosen row. Every row keeps its room, so the dates line up.
    private func check(_ on: Bool) -> some View {
        Image(systemName: "checkmark")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Theme.blue)
            .frame(width: 13)
            .padding(.leading, 22)
            .opacity(on ? 1 : 0)
            .accessibilityHidden(true)
    }

    private var separator: some View {
        StatsLook.sheetLine
            .frame(height: 1 / max(displayScale, 1))
            .padding(.leading, 16)
    }

    /// A row and its one-pixel line under it take exactly 90 pt, as in the photo (a line every 270 px).
    private var rowHeight: CGFloat { 90 - 1 / max(displayScale, 1) }

    // MARK: Custom dates

    private var todayDate: Date { StatsDays.date(today) ?? Date() }

    /// The last day the end can be: 731 days after the start, and never after today.
    private var latestEnd: Date {
        let limit = StatsDays.calendar.date(byAdding: .day, value: StatsTimeFrame.longest, to: start) ?? start
        return max(start, min(limit, todayDate))
    }

    private var customDates: some View {
        VStack(alignment: .leading, spacing: 0) {
            separator
            DatePicker("Start date", selection: $start, in: ...todayDate, displayedComponents: .date)
                .pfFont(15.5, .semibold)
                .padding(.horizontal, 18)
                .frame(minHeight: 60)
            separator
            DatePicker("End date", selection: $end, in: start...latestEnd, displayedComponents: .date)
                .pfFont(15.5, .semibold)
                .padding(.horizontal, 18)
                .frame(minHeight: 60)
            Button("Apply", action: apply)
                .buttonStyle(SolidButtonStyle(radius: 8, height: 48, size: 17))
                .padding(.horizontal, 18)
                .padding(.top, 14)
        }
        .tint(Theme.blue)
        // The pickers work in whole days of the business's calendar, kept as midnight UTC.
        .environment(\.timeZone, StatsDays.utc)
        .environment(\.calendar, StatsDays.calendar)
        .onChange(of: start) { _, _ in
            if end < start { end = start }
            if end > latestEnd { end = latestEnd }
        }
    }

    private func prefill() {
        let span = chosen.days(today: today)
        let first = min(StatsDays.date(span.from) ?? todayDate, todayDate)
        let last = StatsDays.date(span.to) ?? todayDate
        start = first
        end = max(first, min(last, todayDate))
        customOpen = chosen.range.isCustomDays
    }

    private func apply() {
        let first = StatsDays.string(min(start, end))
        let last = StatsDays.string(max(start, min(end, latestEnd)))
        Haptics.light()
        choose(StatsTimeFrame(range: .custom, from: first, to: last))
        dismiss()
    }
}

/// The Custom row's calendar, traced from the photo (40 x 40 px at 3 px a point): a box with a line under its top and two rings
/// standing above it, on a 40-unit grid, to be stroked `lineWidth` units wide.
struct TimeFrameCalendarGlyph: Shape {
    static let grid: CGFloat = 40
    static let lineWidth: CGFloat = 4.3

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addRoundedRect(in: CGRect(x: 2.1, y: 6, width: 35.9, height: 31.9), cornerSize: CGSize(width: 2.5, height: 2.5))
        path.move(to: CGPoint(x: 2.1, y: 17.95))
        path.addLine(to: CGPoint(x: 38, y: 17.95))
        path.move(to: CGPoint(x: 10.05, y: 0))
        path.addLine(to: CGPoint(x: 10.05, y: 12.2))
        path.move(to: CGPoint(x: 30.05, y: 0))
        path.addLine(to: CGPoint(x: 30.05, y: 12.2))
        let scale = min(rect.width, rect.height) / TimeFrameCalendarGlyph.grid
        return path.applying(CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: rect.minX, ty: rect.minY))
    }
}
