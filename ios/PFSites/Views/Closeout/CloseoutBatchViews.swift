import SwiftUI

/// The open batch's details, pushed inside the Closeout cover (the website's "Current batch" sheet): its number, since when, its
/// lines, and "Close out batch", which asks first with the website's words and is off while there is nothing in the batch.
/// Closing out goes back to the list with "Batch closed".
struct CloseoutCurrentBatchView: View {
    let closeout: CloseoutModel
    let onClosed: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var asking: CloseoutOpenBatch?
    @State private var working = false
    @State private var problem: String?

    private struct LoadKey: Hashable {
        let active: Bool
        let ready: Bool
    }

    var body: some View {
        ScrollView {
            Group {
                if let open = closeout.open {
                    content(open)
                } else {
                    SettingsA.LoadState(loading: closeout.loading, problem: closeout.loadError) {
                        Task { await reload() }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 19)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(CloseoutLook.page)
        .scrollEdgeEffectStyle(.hard, for: .top)
        .refreshable { await reload() }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                CloseoutBarTitle()
            }
        }
        .steadyNavigationBar()
        .task(id: LoadKey(active: scenePhase == .active, ready: model.phase == .ready)) {
            guard scenePhase == .active, model.phase == .ready else { return }
            await reload()
        }
        .alert(confirmTitle,
               isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }),
               presenting: asking) { _ in
            Button("Cancel", role: .cancel) {}
            Button("Close out") { closeOut() }
        } message: { batch in
            Text(Self.confirmText(batch))
        }
        .alert(problem ?? "", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    private func content(_ open: CloseoutOpenBatch) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if !closeout.loadError.isEmpty {
                SettingsA.ReloadProblem(problem: closeout.loadError)
                    .padding(.bottom, 14)
            }
            Text("Current batch \(String(open.number))")
                .pfFont(24.5, .bold, relativeTo: .title)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(Self.sinceLine(open))
                .pfFont(16)
                .foregroundStyle(SettingsLook.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7.3)
            CloseoutLinesCard(lines: CloseoutLine.current(open.totals))
                .padding(.top, 26)
            Button {
                model.idle.touch()
                asking = open
            } label: {
                if working {
                    ProgressView().tint(.white)
                } else {
                    Text("Close out batch")
                }
            }
            .buttonStyle(SolidButtonStyle(fill: open.totals.isEmpty ? Color(.systemGray5) : Theme.blue,
                                          text: open.totals.isEmpty ? SettingsLook.greyed : .white,
                                          radius: 24, height: 48, size: 17))
            .disabled(open.totals.isEmpty || working)
            .padding(.top, 24)
        }
    }

    /// "Current batch 12", as the website's sheet is headed.
    private var title: String {
        guard let open = closeout.open else { return "Current batch" }
        return "Current batch \(String(open.number))"
    }

    /// "Since Mon, Nov 23, 2026, 6:35 PM", or "Since you started" before the first closeout.
    private static func sinceLine(_ open: CloseoutOpenBatch) -> String {
        guard let since = open.since else { return "Since you started" }
        return "Since \(CloseoutLook.when(since))"
    }

    /// The website's question before closing out: "Close out batch 12?"
    private var confirmTitle: String {
        guard let batch = asking else { return "Close out batch?" }
        return "Close out batch \(String(batch.number))?"
    }

    /// The website's confirmation: "$45.00 from 3 payments will be filed under Batch history, and a new batch starts."
    private static func confirmText(_ batch: CloseoutOpenBatch) -> String {
        let count = batch.totals.count
        return "\(Money.format(batch.totals.net)) from \(String(count)) payment\(count == 1 ? "" : "s") will be filed under Batch history, and a new batch starts."
    }

    private func closeOut() {
        guard let business = model.site, !working else { return }
        working = true
        model.idle.touch()
        Task {
            do {
                try await closeout.closeOut(siteID: business.id)
                working = false
                Haptics.success()
                onClosed()
            } catch let error as APIError {
                working = false
                Haptics.error()
                // A 401 is checked (the app locks only if the session really ended); anything else is the server's own words,
                // a 403 included, and the batch is loaded again so the screen shows what is true now.
                if error.status == 401 {
                    model.sessionEnded()
                    return
                }
                problem = error.message
                await reload()
            } catch {
                // Cancelled: the screen went away.
                working = false
            }
        }
    }

    private func reload() async {
        guard let business = model.site else { return }
        await closeout.load(siteID: business.id)
    }
}

/// A closed batch's details, pushed inside the Closeout cover (the website's batch sheet): "Batch 12", when it was closed and by
/// whom, and its lines.
struct CloseoutBatchView: View {
    let closeout: CloseoutModel
    let batch: CloseoutBatch

    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    private struct LoadKey: Hashable {
        let active: Bool
        let ready: Bool
    }

    /// The batch as the latest load has it, or as it was opened once it has left the latest 200.
    private var shown: CloseoutBatch { closeout.batch(batch.id) ?? batch }

    var body: some View {
        let info = shown
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Batch \(String(info.number))")
                    .pfFont(24.5, .bold, relativeTo: .title)
                    .foregroundStyle(Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text(Self.closedLine(info))
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 7.3)
                CloseoutLinesCard(lines: CloseoutLine.closed(info.totals))
                    .padding(.top, 26)
            }
            .padding(.horizontal, 16)
            .padding(.top, 19)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(CloseoutLook.page)
        .scrollEdgeEffectStyle(.hard, for: .top)
        .refreshable { await reload() }
        .navigationTitle("Batch \(String(info.number))")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                CloseoutBarTitle()
            }
        }
        .steadyNavigationBar()
        .task(id: LoadKey(active: scenePhase == .active, ready: model.phase == .ready)) {
            guard scenePhase == .active, model.phase == .ready else { return }
            await reload()
        }
    }

    /// "Closed Mon, Nov 23, 2026, 6:35 PM by Blake", as the website writes it.
    private static func closedLine(_ batch: CloseoutBatch) -> String {
        "Closed \(CloseoutLook.when(batch.closedAt))" + (batch.by.isEmpty ? "" : " by \(batch.by)")
    }

    private func reload() async {
        guard let business = model.site else { return }
        await closeout.load(siteID: business.id)
    }
}

/// A line of a batch's details, as the website's batch sheets list them.
struct CloseoutLine: Identifiable {
    let id: Int
    let label: String
    let value: String
    var total = false

    /// The open batch (the website's `current()`): each tender with its count and what it came to less refunds, Payments,
    /// Refunds when there were any, the Batch total, then Cash in and Cash out when there was any.
    static func current(_ totals: CloseoutTotals) -> [CloseoutLine] {
        var lines = tenders(totals)
        lines.append(CloseoutLine(id: lines.count, label: "Payments", value: Money.format(totals.payments)))
        if totals.refunds > 0 { lines.append(CloseoutLine(id: lines.count, label: "Refunds", value: Money.format(-totals.refunds))) }
        lines.append(CloseoutLine(id: lines.count, label: "Batch total", value: Money.format(totals.net), total: true))
        if totals.paidIn > 0 { lines.append(CloseoutLine(id: lines.count, label: "Cash in", value: Money.format(totals.paidIn))) }
        if totals.paidOut > 0 { lines.append(CloseoutLine(id: lines.count, label: "Cash out", value: Money.format(-totals.paidOut))) }
        return lines
    }

    /// A closed batch (the website's `past()`): the tenders, Payments, Refunds, Cash in and Cash out when there were any, and the
    /// Batch total last.
    static func closed(_ totals: CloseoutTotals) -> [CloseoutLine] {
        var lines = tenders(totals)
        lines.append(CloseoutLine(id: lines.count, label: "Payments", value: Money.format(totals.payments)))
        if totals.refunds > 0 { lines.append(CloseoutLine(id: lines.count, label: "Refunds", value: Money.format(-totals.refunds))) }
        if totals.paidIn > 0 { lines.append(CloseoutLine(id: lines.count, label: "Cash in", value: Money.format(totals.paidIn))) }
        if totals.paidOut > 0 { lines.append(CloseoutLine(id: lines.count, label: "Cash out", value: Money.format(-totals.paidOut))) }
        lines.append(CloseoutLine(id: lines.count, label: "Batch total", value: Money.format(totals.net), total: true))
        return lines
    }

    /// "Cash · 3" and what those payments came to less their refunds.
    private static func tenders(_ totals: CloseoutTotals) -> [CloseoutLine] {
        totals.tenders.enumerated().map { index, tender in
            CloseoutLine(id: index, label: "\(tender.method) · \(String(tender.count))", value: Money.format(tender.net))
        }
    }
}

/// A batch's lines on a white card: the label in grey at the left and the amount at the right, the Batch total in bold under a
/// thin rule (the website's `cl-lines`).
struct CloseoutLinesCard: View {
    let lines: [CloseoutLine]

    var body: some View {
        SettingsCard(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
                    if line.total {
                        VStack(alignment: .leading, spacing: 0) {
                            CloseoutRule(height: 1)
                                .padding(.top, index == 0 ? 0 : 8)
                            row(line)
                                .padding(.top, 12)
                        }
                    } else {
                        row(line)
                            .padding(.top, index == 0 ? 0 : 16)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func row(_ line: CloseoutLine) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(line.label)
                .pfFont(line.total ? 17 : 16, line.total ? .bold : .regular)
                .foregroundStyle(line.total ? Color.primary : SettingsLook.muted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Text(line.value)
                .pfFont(line.total ? 17 : 16, line.total ? .bold : .semibold)
                .foregroundStyle(Color.primary)
                .lineLimit(1)
                .layoutPriority(1)
        }
        .accessibilityElement(children: .combine)
    }
}
