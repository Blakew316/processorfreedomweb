import SwiftUI

/// The Time frame sheet (the owner's photo): Today, Yesterday, This week, This month, Last 7 days, Last 30 days, Last 90 days and
/// Custom, each with the days it covers, the chosen one in brand blue with a check. Custom opens a start and end date (not after
/// the business's today, at most 731 days apart, the server's limit). Sales Overview and Insights both use it.
struct TimeFrameSheet: View {
    let chosen: StatsTimeFrame
    /// The business's date ("2026-11-24").
    let today: String
    let choose: (StatsTimeFrame) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.displayScale) private var displayScale
    @State private var customOpen = false
    @State private var start = Date()
    @State private var end = Date()

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(StatsRange.allCases.filter { $0 != .custom }) { range in
                        presetRow(range)
                        separator
                    }
                    customRow
                    if customOpen {
                        customDates
                            .transition(.opacity)
                    }
                }
                .padding(.bottom, 24)
            }
        }
        .background(Color(.systemBackground))
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        .onAppear(perform: prefill)
    }

    // MARK: Title

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            Text("Time frame")
                .pfFont(20, .semibold, relativeTo: .title3)
                .foregroundStyle(Color.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
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
        }
        .padding(.leading, 18)
        .padding(.trailing, 8)
        .frame(minHeight: 34)
        .padding(.top, 10)
    }

    // MARK: Rows

    private func presetRow(_ range: StatsRange) -> some View {
        let on = chosen.range == range
        let span = StatsTimeFrame(range: range).days(today: today)
        return Button {
            choose(StatsTimeFrame(range: range))
            dismiss()
        } label: {
            HStack(alignment: .center, spacing: 0) {
                Text(range.label)
                    .pfFont(15.5, .medium)
                    .foregroundStyle(on ? Theme.blue : Color.primary)
                Spacer(minLength: 12)
                dates(from: span.from, to: span.to, on: on)
                check(on)
            }
            .padding(.leading, 18)
            .padding(.trailing, 21)
            .frame(maxWidth: .infinity, minHeight: 90)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// Custom, with its calendar: it opens the start and end dates under it. When a custom period is chosen, its days show too.
    private var customRow: some View {
        let on = chosen.range == .custom
        let span = chosen.days(today: today)
        return Button {
            withAnimation(.snappy) { customOpen.toggle() }
        } label: {
            HStack(alignment: .center, spacing: 0) {
                HStack(spacing: 14) {
                    Text(StatsRange.custom.label)
                        .pfFont(15.5, .medium)
                        .foregroundStyle(on ? Theme.blue : Color.primary)
                    Image(systemName: "calendar")
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.blue)
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
            .frame(maxWidth: .infinity, minHeight: 90)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityHint(customOpen ? "Hides the dates" : "Shows a start and end date")
    }

    private func dates(from: String, to: String, on: Bool) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(StatsDays.title(from: from, to: to))
                .pfFont(13, .semibold)
                .foregroundStyle(on ? Theme.blue : Color.primary)
            Text(StatsDays.allDay)
                .pfFont(12.5)
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
            .frame(width: 16)
            .padding(.leading, 21)
            .opacity(on ? 1 : 0)
            .accessibilityHidden(true)
    }

    private var separator: some View {
        StatsLook.sheetLine
            .frame(height: 1 / max(displayScale, 1))
            .padding(.leading, 16)
    }

    // MARK: Custom dates

    private var todayDate: Date { StatsDays.date(today) ?? Date() }

    /// The last day the end can be: two years after the start, and never after today.
    private var latestEnd: Date {
        let limit = StatsDays.calendar.date(byAdding: .day, value: StatsTimeFrame.longest, to: start) ?? start
        return max(start, min(limit, todayDate))
    }

    private var customDates: some View {
        VStack(alignment: .leading, spacing: 14) {
            DatePicker("Start date", selection: $start, in: ...todayDate, displayedComponents: .date)
                .pfFont(16)
            DatePicker("End date", selection: $end, in: start...latestEnd, displayedComponents: .date)
                .pfFont(16)
            Button("Apply", action: apply)
                .buttonStyle(SolidButtonStyle(radius: 8, height: 48, size: 17))
                .padding(.top, 6)
        }
        .tint(Theme.blue)
        // The pickers work in whole days of the business's calendar, kept as midnight UTC.
        .environment(\.timeZone, StatsDays.utc)
        .environment(\.calendar, StatsDays.calendar)
        .padding(.horizontal, 18)
        .padding(.top, 4)
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
        customOpen = chosen.range == .custom
    }

    private func apply() {
        let first = StatsDays.string(min(start, end))
        let last = StatsDays.string(max(start, min(end, latestEnd)))
        choose(StatsTimeFrame(range: .custom, from: first, to: last))
        dismiss()
    }
}
