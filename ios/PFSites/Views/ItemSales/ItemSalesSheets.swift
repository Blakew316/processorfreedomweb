import SwiftUI
import UIKit

/// "Custom" in the date drop-down: a first and a last day on the business's calendar, never after today, and at most 731 days
/// apart (the stats route's limit, with its own words when it is passed).
struct ItemSalesCustomRangeSheet: View {
    let report: ItemSalesModel
    @Environment(\.dismiss) private var dismiss
    @State private var from: Date
    @State private var to: Date

    init(report: ItemSalesModel) {
        self.report = report
        let days = report.span
        _from = State(initialValue: days.from.noonDate(in: report.zone))
        _to = State(initialValue: days.to.noonDate(in: report.zone))
    }

    private var zone: TimeZone { report.zone }
    private var fromDay: ItemSalesDay { ItemSalesDay.on(from, in: zone) }
    private var toDay: ItemSalesDay { ItemSalesDay.on(to, in: zone) }
    /// The end of today at the business: no later day can be chosen.
    private var latest: Date { report.today.noonDate(in: zone).addingTimeInterval(11 * 3600 + 59 * 60) }
    private var tooLong: Bool { abs(fromDay.days(to: toDay)) > ItemSalesModel.longestRange }

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("From", selection: $from, in: ...latest, displayedComponents: .date)
                    DatePicker("To", selection: $to, in: ...latest, displayedComponents: .date)
                } footer: {
                    if tooLong {
                        Text(ItemSalesModel.tooLong)
                            .pfFont(15)
                            .foregroundStyle(SettingsLook.muted)
                    }
                }
            }
            .environment(\.timeZone, zone)
            .environment(\.calendar, calendar)
            .tint(Theme.blue)
            .navigationTitle(ItemSalesPeriod.custom.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        report.chooseCustom(from: fromDay, to: toDay)
                        dismiss()
                    }
                    .disabled(tooLong)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// "Accounting sync" does what the website's "Sync with QuickBooks" does (quickbooks() in public/js/editor.js): its steps, then a
/// file of the period's payments and refunds that QuickBooks Online reads. `download` gives back words when there is nothing to send
/// or the server said no; when the file is made, the screen closes this sheet and offers the file.
struct ItemSalesSyncSheet: View {
    let download: () async -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var problem = ""

    private let steps = [
        "Choose the dates at the top of this page, then download below.",
        "In QuickBooks Online, go to Transactions › Bank transactions › Link account › Upload from file.",
        "Pick the downloaded file and the account to put it in. QuickBooks matches the Date, Description and Amount columns for you.",
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(String(index + 1) + ".")
                                .pfFont(16, .semibold)
                                .foregroundStyle(Color.primary)
                            Text(step)
                                .pfFont(16)
                                .foregroundStyle(SettingsLook.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    if !problem.isEmpty {
                        Text(problem)
                            .pfFont(16, .semibold)
                            .foregroundStyle(Color.primary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button {
                    Task { await run() }
                } label: {
                    if busy {
                        ProgressView().tint(.white)
                    } else {
                        Text("Download for QuickBooks")
                    }
                }
                .buttonStyle(SolidButtonStyle(fill: Theme.blue, text: .white, radius: 24, height: 48, size: 16.5))
                .disabled(busy)
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 12)
                .background(Color(.systemBackground))
            }
            .navigationTitle("Sync with QuickBooks")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func run() async {
        busy = true
        problem = ""
        let words = await download()
        busy = false
        if let words {
            problem = words
            UIAccessibility.post(notification: .announcement, argument: words)
        }
    }
}

/// AirPrint for the report, like the website's Print (which prints its report page on white).
@MainActor
enum ItemSalesPrinter {
    static func show(html: String, title: String) {
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo.printInfo()
        info.jobName = title
        info.outputType = .general
        controller.printInfo = info
        let formatter = UIMarkupTextPrintFormatter(markupText: html)
        formatter.perPageContentInsets = UIEdgeInsets(top: 36, left: 36, bottom: 36, right: 36)
        controller.printFormatter = formatter
        _ = controller.present(animated: true, completionHandler: nil)
    }
}
