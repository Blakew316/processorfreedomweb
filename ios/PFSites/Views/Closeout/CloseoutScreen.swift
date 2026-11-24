import SwiftUI

/// Home → Closeout (Part F, the owner's Clover photos): a full-screen cover with an X and the bold "Closeout" in the bar. Under it
/// the small grey "Finances", the large "Closeout" and the website's description (three lines, then "Show more..."); the Open
/// batch card with the open batch's net amount; and the closeout batch history: the current batch, the L3 batch Processor Freedom
/// does not have (greyed, with its true zero), then every closed batch. A row opens its details in the cover's own navigation
/// stack, where the current batch is closed out.
/// Everything is the server's (`GET /api/sites/<id>/closeouts`), shown with the website's words and rules (public/js/editor.js
/// CL.close), and loaded when the page appears, on pull to refresh, every 30 seconds while it is on screen, and when the app
/// comes back, so a payment or a closeout made on the website or another phone shows here too.
struct CloseoutScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var closeout = CloseoutModel()
    @State private var path: [CloseoutRoute] = []
    @State private var toast: String?

    private struct PollKey: Hashable {
        let active: Bool
        let ready: Bool
        let site: String
    }

    var body: some View {
        NavigationStack(path: $path) {
            page
                .navigationDestination(for: CloseoutRoute.self) { route in
                    switch route {
                    case .current:
                        CloseoutCurrentBatchView(closeout: closeout, onClosed: closedOut, say: show)
                    case .closed(let batch):
                        CloseoutBatchView(closeout: closeout, batch: batch, say: show)
                    }
                }
        }
        // Over whichever page of the cover is on top: "Batch closed", or why a pulled refresh did not work.
        .overlay(alignment: .bottom) {
            if let toast {
                GlassToast(text: toast)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: The page

    private var page: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Finances")
                    .pfFont(16, .semibold)
                    .foregroundStyle(SettingsLook.muted)
                Text("Closeout")
                    .pfFont(24, .bold, relativeTo: .title)
                    .foregroundStyle(Color.primary)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 8.3)
                CloseoutDescription(text: CloseoutLook.description)
                    .padding(.top, 7.3)
                batches
                    .padding(.top, 26.3)
            }
            .padding(.horizontal, 16)
            .padding(.top, 19.7)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(CloseoutLook.page)
        // The photo's bar stays plain white over what scrolls under it, like the cover's other pages.
        .scrollEdgeEffectStyle(.hard, for: .top)
        .refreshable { await pulled() }
        .navigationTitle("Closeout")
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
                CloseoutBarTitle()
            }
        }
        .steadyNavigationBar()
        .task(id: PollKey(active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            await poll()
        }
    }

    /// The Open batch card and the history once they are loaded; until then a spinner, or what went wrong and Try again.
    @ViewBuilder
    private var batches: some View {
        if let open = closeout.open {
            VStack(alignment: .leading, spacing: 0) {
                if !closeout.loadError.isEmpty {
                    SettingsA.ReloadProblem(problem: closeout.loadError)
                        .padding(.bottom, 14)
                }
                openCard(open)
                Text("Closeout batch history")
                    .pfFont(20, .bold, relativeTo: .title3)
                    .foregroundStyle(Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 27)
                history(open)
                    .padding(.top, 17.2)
            }
        } else {
            SettingsA.LoadState(loading: closeout.loading, problem: closeout.loadError) {
                Task { await reload() }
            }
        }
    }

    /// "Open batch" in bold, the "Open batch ›" link to its details, the open batch's net amount, and the website's sentence about
    /// the open batch (where Clover's photo makes a deposit promise Processor Freedom does not make).
    private func openCard(_ open: CloseoutOpenBatch) -> some View {
        SettingsCard(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Open batch")
                    .pfFont(20, .bold, relativeTo: .title3)
                    .foregroundStyle(Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Button {
                    showCurrent()
                } label: {
                    HStack(spacing: 7) {
                        Text("Open batch")
                            .pfFont(16, .semibold)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 16, weight: .regular))
                            .accessibilityHidden(true)
                    }
                    .foregroundStyle(SettingsLook.muted)
                    // A taller place to tap than the words themselves, without moving anything.
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, -10)
                .accessibilityHint("Shows the open batch")
                .padding(.top, 32.7)
                Text(Money.format(open.totals.net))
                    .pfFont(32, .light, relativeTo: .largeTitle)
                    .foregroundStyle(Color.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.top, 4.7)
                Text(CloseoutLook.openSentence)
                    .pfFont(14)
                    .foregroundStyle(CloseoutLook.note)
                    .lineSpacing(7)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 20.3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// The website's batch table as rows: the current batch, the L3 batch (greyed and not tappable: Processor Freedom has no L3
    /// transactions, so it is always 0 and $0.00), then each closed batch, newest first.
    private func history(_ open: CloseoutOpenBatch) -> some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            CloseoutRule(height: 1)
            Button {
                showCurrent()
            } label: {
                CloseoutBatchRow(title: "Current Batch", open: true, kind: "Standard transactions",
                                 count: open.totals.count, total: open.totals.net)
            }
            .buttonStyle(CloseoutRowStyle())
            .accessibilityHint("Shows the open batch")
            CloseoutRule()
            CloseoutBatchRow(title: "Current Batch", open: true, kind: "L3 transactions", count: 0, total: 0, greyed: true)
                .accessibilityElement(children: .combine)
                .accessibilityValue("Not available yet")
            CloseoutRule()
            ForEach(closeout.history) { batch in
                Button {
                    showClosed(batch)
                } label: {
                    CloseoutBatchRow(title: CloseoutLook.when(batch.closedAt, in: closeout.zone), open: false, kind: "Standard transactions",
                                     count: batch.totals.count, total: batch.totals.net, code: batch.code)
                }
                .buttonStyle(CloseoutRowStyle())
                .accessibilityHint("Shows the batch")
                CloseoutRule()
            }
        }
    }

    // MARK: Actions

    /// A page opens only from the list itself: a second tap landing before the first page has slid in opens nothing more.
    private func showCurrent() {
        model.idle.touch()
        guard path.isEmpty else { return }
        path.append(.current)
    }

    private func showClosed(_ batch: CloseoutBatch) {
        model.idle.touch()
        guard path.isEmpty else { return }
        path.append(.closed(batch))
    }

    /// The open batch was closed out from its details: back to the list (already loaded again) with "Batch closed", as the website.
    private func closedOut() {
        path = []
        show("Batch closed")
    }

    private func show(_ text: String) {
        withAnimation(.snappy) { toast = text }
        Task {
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            withAnimation(.easeOut(duration: 0.25)) {
                if toast == text { toast = nil }
            }
        }
    }

    private func reload() async {
        guard let business = model.site else { return }
        await closeout.load(siteID: business.id)
    }

    /// Pulled to refresh: when it does not work the batches stay, with the server's words (offline, for example) in a short message.
    private func pulled() async {
        guard let business = model.site else { return }
        if let words = await closeout.load(siteID: business.id) { show(words) }
    }

    /// Fresh now, then every 30 seconds while this page is on screen and the app is open and unlocked: the open batch grows with
    /// every payment taken anywhere.
    private func poll() async {
        guard scenePhase == .active, model.phase == .ready, let business = model.site else { return }
        let closeout = self.closeout
        while !Task.isCancelled {
            await closeout.load(siteID: business.id)
            try? await Task.sleep(nanoseconds: 30_000_000_000)
        }
    }
}
