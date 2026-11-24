import SwiftUI

/// The open batch's details, pushed inside the Closeout cover (the website's "Current batch" sheet): "Current batch 12", since when,
/// its lines, and "Close out batch", which is off while there is nothing in the batch and asks first ("Close out batch 12?" with the
/// batch's "Batch total" line). Closing out goes back to the list with "Batch closed".
struct CloseoutCurrentBatchView: View {
    let closeout: CloseoutModel
    let onClosed: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var confirming = false
    /// The batch as it was when "Close out batch" was tapped: the question names it, and only it is closed out.
    @State private var asked: CloseoutOpenBatch?
    @State private var working = false
    @State private var problem: String?

    private struct PollKey: Hashable {
        let active: Bool
        let ready: Bool
        let site: String
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
        .task(id: PollKey(active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            await poll()
        }
        .alert(confirmTitle, isPresented: $confirming) {
            Button("Cancel", role: .cancel) {}
            Button("Close out batch") { closeOut() }
        } message: {
            Text(confirmText)
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
                .pfFont(24, .bold, relativeTo: .title)
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
                asked = open
                confirming = true
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

    /// "Since Mon, Nov 23, 2026, 6:35 PM", or "Since you started" before the first closeout, as the website writes it.
    private static func sinceLine(_ open: CloseoutOpenBatch) -> String {
        guard let since = open.since else { return "Since you started" }
        return "Since \(CloseoutLook.when(since))"
    }

    /// The question before closing out, named after the button: "Close out batch 12?" (the website closes out at once, without one).
    private var confirmTitle: String {
        guard let batch = asked else { return "Close out batch?" }
        return "Close out batch \(String(batch.number))?"
    }

    /// Under it, the batch's own line from the website's batch sheet: "Batch total $45.00".
    private var confirmText: String {
        guard let batch = asked else { return "" }
        return "Batch total \(Money.format(batch.totals.net))"
    }

    /// Closes out the batch the person was asked about. The server closes whatever batch is open when the request arrives, so the
    /// model checks first that it is still that batch; when it has changed (a payment came in, or it was closed out on the website
    /// or another phone) nothing is closed and the question is asked again with the batch as it is now.
    private func closeOut() {
        guard let business = model.site, let batch = asked, !working else { return }
        working = true
        model.idle.touch()
        let tapped = Date()
        Task {
            do {
                if let now = try await closeout.closeOut(batch, siteID: business.id) {
                    await Self.afterAlert(since: tapped)
                    working = false
                    asked = now
                    confirming = !now.totals.isEmpty
                    return
                }
                working = false
                Haptics.success()
                onClosed()
            } catch let error as APIError {
                Haptics.error()
                // A 401 is checked (the app locks only if the session really ended); anything else is the server's own words,
                // a 403 included, and the batch is loaded again so the page shows what is true now.
                if error.status == 401 {
                    working = false
                    model.sessionEnded()
                    return
                }
                await Self.afterAlert(since: tapped)
                working = false
                problem = error.message
                await reload()
            } catch {
                // Cancelled: the page went away.
                working = false
            }
        }
    }

    /// Two alerts cannot be up at once: the next one waits until the question's alert has gone, as the Orders tab waits.
    private static func afterAlert(since tapped: Date) async {
        let left = 0.45 - Date().timeIntervalSince(tapped)
        if left > 0 {
            try? await Task.sleep(nanoseconds: UInt64(left * 1_000_000_000))
        }
    }

    private func reload() async {
        guard let business = model.site else { return }
        await closeout.load(siteID: business.id)
    }

    /// Fresh now, then every 30 seconds while the open batch is on screen and the app is open and unlocked.
    private func poll() async {
        guard scenePhase == .active, model.phase == .ready, let business = model.site else { return }
        let closeout = self.closeout
        while !Task.isCancelled {
            await closeout.load(siteID: business.id)
            try? await Task.sleep(nanoseconds: 30_000_000_000)
        }
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
        let site: String
    }

    /// The batch as the latest load has it, or as it was opened once it has left the latest 200.
    private var shown: CloseoutBatch { closeout.batch(batch.id) ?? batch }

    var body: some View {
        let info = shown
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if !closeout.loadError.isEmpty {
                    SettingsA.ReloadProblem(problem: closeout.loadError)
                        .padding(.bottom, 14)
                }
                Text("Batch \(String(info.number))")
                    .pfFont(24, .bold, relativeTo: .title)
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
        .task(id: LoadKey(active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            await appeared()
        }
    }

    /// "Closed Mon, Nov 23, 2026, 6:35 PM by Blake", as the website writes it (without "by" for very old batches).
    private static func closedLine(_ batch: CloseoutBatch) -> String {
        "Closed \(CloseoutLook.when(batch.closedAt))" + (batch.by.isEmpty ? "" : " by \(batch.by)")
    }

    /// Fresh each time the page shows while the app is open and unlocked.
    private func appeared() async {
        guard scenePhase == .active, model.phase == .ready else { return }
        await reload()
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
        var parts = tenderParts(totals)
        parts.append(("Payments", Money.format(totals.payments), false))
        if totals.refunds > 0 { parts.append(("Refunds", Money.format(-totals.refunds), false)) }
        parts.append(("Batch total", Money.format(totals.net), true))
        if totals.paidIn > 0 { parts.append(("Cash in", Money.format(totals.paidIn), false)) }
        if totals.paidOut > 0 { parts.append(("Cash out", Money.format(-totals.paidOut), false)) }
        return numbered(parts)
    }

    /// A closed batch (the website's `past()`): the tenders, Payments, then Refunds, Cash in and Cash out when there were any, and
    /// the Batch total last.
    static func closed(_ totals: CloseoutTotals) -> [CloseoutLine] {
        var parts = tenderParts(totals)
        parts.append(("Payments", Money.format(totals.payments), false))
        if totals.refunds > 0 { parts.append(("Refunds", Money.format(-totals.refunds), false)) }
        if totals.paidIn > 0 { parts.append(("Cash in", Money.format(totals.paidIn), false)) }
        if totals.paidOut > 0 { parts.append(("Cash out", Money.format(-totals.paidOut), false)) }
        parts.append(("Batch total", Money.format(totals.net), true))
        return numbered(parts)
    }

    /// "Cash · 3" and what those payments came to less their refunds.
    private static func tenderParts(_ totals: CloseoutTotals) -> [(String, String, Bool)] {
        totals.tenders.map { tender in ("\(tender.method) · \(String(tender.count))", Money.format(tender.net), false) }
    }

    private static func numbered(_ parts: [(String, String, Bool)]) -> [CloseoutLine] {
        var lines: [CloseoutLine] = []
        for part in parts {
            lines.append(CloseoutLine(id: lines.count, label: part.0, value: part.1, total: part.2))
        }
        return lines
    }
}

/// A batch's lines on a white card, as the website's `cl-lines`: the label in grey at the left and the amount at the right, 16 pt
/// apart, and the Batch total in bold under a thin rule.
struct CloseoutLinesCard: View {
    let lines: [CloseoutLine]

    var body: some View {
        SettingsCard(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(lines) { line in
                    if line.total {
                        VStack(alignment: .leading, spacing: 0) {
                            CloseoutRule(height: 1)
                            row(line)
                                .padding(.top, 12)
                        }
                        .padding(.top, line.id == 0 ? 0 : 8)
                    } else {
                        row(line)
                            .padding(.top, line.id == 0 ? 0 : 16)
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
