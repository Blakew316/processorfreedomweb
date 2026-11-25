import SwiftUI
import UIKit

/// The coordinate space the screen places the drop-down list and the ⋮ menu in.
private let itemSalesSpace = "ItemSalesScreen"

/// Which card is open over the page: the date drop-down's list, or the ⋮ menu.
enum ItemSalesPopup {
    case range, menu
}

/// Home → Items sales report (Part F, the owner's Clover photos): a full-screen cover with an X and the bold title in the bar, over
/// the grey page: the small grey "Reports", "Item sales" with the round grey ⋮ (Print, Export, Accounting sync, Learn about this
/// report), the date drop-down and the round grey Filters button, the period's dates with ‹ and ›, the Revenue items tab (Non revenue
/// items greyed: Processor Freedom has none), then the period's items or the website's empty state.
/// Everything is the server's (`GET /api/sites/<id>/stats`), worked out and worded like the website's Item sales report
/// (public/js/editor.js CL['r-items']), and loaded when the screen appears, when the choices change, on pull to refresh and when the
/// app comes back, so a sale made on the website or another phone shows here too. The period and the order type are kept while the
/// business is open.
struct ItemSalesScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var report: ItemSalesModel
    @State private var popup: ItemSalesPopup? = nil
    @State private var filtersOpen = false
    @State private var customOpen = false
    @State private var syncOpen = false
    @State private var aboutOpen = false
    @State private var toast: String? = nil
    /// The QuickBooks file, offered once the Accounting sync sheet has finished closing (two presentations cannot overlap).
    @State private var fileToOffer: URL? = nil
    @State private var fieldFrame = CGRect.zero
    @State private var dotsFrame = CGRect.zero
    @State private var pageHeight: CGFloat = 0
    /// The ⋮ menu's width in the photo (241 pt), growing with the person's text size like its words do.
    @ScaledMetric(relativeTo: .body) private var menuWidth: CGFloat = 241

    private struct LoadKey: Hashable {
        let query: String
        let active: Bool
        let ready: Bool
    }

    init() {
        _report = State(initialValue: ItemSalesModel(shellID: AppModel.shared.shellID))
    }

    private var siteID: String { model.site?.id ?? "" }
    private var siteName: String { model.site?.name ?? "" }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .topLeading) {
                page
                if popup != nil {
                    // A tap anywhere else closes the list or the menu, as on the website.
                    Color.clear
                        .contentShape(Rectangle())
                        .ignoresSafeArea()
                        .onTapGesture { closePopup() }
                        .accessibilityHidden(true)
                        .zIndex(1)
                }
                popupCard
                if filtersOpen {
                    ItemSalesFiltersPanel(report: report, siteID: siteID) {
                        closeFilters()
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .zIndex(3)
                }
            }
            .coordinateSpace(.named(itemSalesSpace))
            .overlay(alignment: .bottom) {
                if let toast {
                    GlassToast(text: toast)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 20)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .navigationTitle("Items sales report")
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
                    Text("Items sales report")
                        .pfFont(19, .bold, relativeTo: .headline)
                        .lineLimit(1)
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .steadyNavigationBar()
            .sheet(isPresented: $customOpen) {
                ItemSalesCustomRangeSheet(report: report)
            }
            .sheet(isPresented: $syncOpen, onDismiss: { offerFile() }) {
                ItemSalesSyncSheet {
                    await downloadForQuickBooks()
                }
            }
            .alert(ItemSalesModel.aboutTitle, isPresented: $aboutOpen) {
                Button("Got it", role: .cancel) {}
            } message: {
                Text(ItemSalesModel.about)
            }
            .task(id: LoadKey(query: report.query, active: scenePhase == .active, ready: model.phase == .ready)) {
                await load()
            }
        }
    }

    // MARK: The page

    private var page: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                heading
                controls
                    .padding(.top, 28)
                dateLine
                    .padding(.top, 19)
                ItemSalesTabs()
                    .padding(.top, 30)
                results
            }
            .padding(.horizontal, 16)
            .padding(.top, 18.5)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, minHeight: pageHeight, alignment: .topLeading)
            // The photo's corner is a plain 24 pt quarter circle.
            .background(SettingsLook.page, in: UnevenRoundedRectangle(topLeadingRadius: 24, style: .circular))
        }
        .background(Color(.systemBackground))
        // The bar stays plain over what scrolls under it, like the Settings pages with the same grey panel.
        .scrollEdgeEffectStyle(.hard, for: .top)
        .scrollDisabled(popup != nil)
        .refreshable { await pullToRefresh() }
        .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.height
        } action: { height in
            pageHeight = height
        }
        .accessibilityHidden(filtersOpen)
    }

    /// The small grey "Reports", then "Item sales" with the round grey ⋮ beside it.
    private var heading: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Reports")
                .pfFont(16.5, .medium)
                .foregroundStyle(SettingsLook.muted)
            HStack(spacing: 12) {
                // The photo's words sit 1 pt under the middle of the round button.
                Text("Item sales")
                    .pfFont(24.5, .bold, relativeTo: .title)
                    .foregroundStyle(Color.primary)
                    .accessibilityAddTraits(.isHeader)
                    .offset(y: 1)
                Spacer(minLength: 8)
                ItemSalesRoundButton(width: 48, active: popup == .menu) {
                    toggle(.menu)
                } label: {
                    ItemSalesDots()
                }
                .accessibilityLabel("More")
                .onGeometryChange(for: CGRect.self) { proxy in
                    proxy.frame(in: .named(itemSalesSpace))
                } action: { frame in
                    dotsFrame = frame
                }
            }
            .padding(.top, 6.5)
        }
    }

    /// The date drop-down field (calendar, the period's name, a chevron) and the round grey Filters button.
    private var controls: some View {
        HStack(alignment: .top, spacing: 8) {
            Button {
                toggle(.range)
            } label: {
                // The photo's places: the calendar 14 pt in and the chevron 17.4 pt in from the field's edges, each a little
                // under the middle of the field (0.9 pt and 0.6 pt); the words start 43 pt in.
                HStack(spacing: 9) {
                    ItemSalesCalendarIcon()
                        .offset(y: 0.9)
                    Text(report.fieldLabel)
                        .pfFont(16.5)
                        .foregroundStyle(Color.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Spacer(minLength: 8)
                    ItemSalesChevron(up: popup == .range)
                        .offset(y: 0.6)
                }
                .padding(.leading, 14)
                .padding(.trailing, 17.4)
                .frame(width: 220, height: 50)
                .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 12, style: .circular))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .circular)
                        .strokeBorder(ItemSalesLook.fieldBorder, lineWidth: 1)
                }
                .contentShape(RoundedRectangle(cornerRadius: 12, style: .circular))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Date range")
            .accessibilityValue(report.fieldLabel)
            .onGeometryChange(for: CGRect.self) { proxy in
                proxy.frame(in: .named(itemSalesSpace))
            } action: { frame in
                fieldFrame = frame
            }
            ItemSalesRoundButton(width: 50, badge: report.filtersOn) {
                openFilters()
            } label: {
                ItemSalesSlidersShape()
                    .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                    .frame(width: 17.5, height: 19.5)
                    .accessibilityHidden(true)
            }
            .accessibilityLabel("Filters")
            .accessibilityValue(filtersValue)
        }
        .padding(.leading, 2)
    }

    private var filtersValue: String {
        report.filtersOn == 0 ? "None on" : String(report.filtersOn) + " on"
    }

    /// "Tue, Nov 24, 2026 at 12:00 AM - 11:59 PM", then ‹ and ›, which move the period by its own length (› greyed once it ends today).
    private var dateLine: some View {
        HStack(spacing: 0) {
            Text(report.rangeLine)
                .pfFont(14, .semibold)
                .foregroundStyle(ItemSalesLook.dateText)
                .fixedSize(horizontal: false, vertical: true)
            // The photo's spacing: ‹ starts 14.7 pt after the dates' last letter and › sits 33.7 pt after ‹. The places to tap are
            // 30 pt wide; the right part of ›'s reaches into the margin instead of pushing the dates onto two lines.
            stepButton(later: false)
                .padding(.leading, 1.6)
            stepButton(later: true)
                .padding(.leading, 3.7)
                .padding(.trailing, -11.3)
            Spacer(minLength: 0)
        }
    }

    private func stepButton(later: Bool) -> some View {
        let enabled = !later || report.canStepLater
        return Button {
            report.step(later ? 1 : -1)
        } label: {
            ItemSalesStepShape(later: later)
                .stroke(enabled ? Color.primary : SettingsLook.greyed, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                .frame(width: 7.3, height: 14)
                .frame(width: 30, height: 44)
                .contentShape(Rectangle())
        }
        // Not the plain style: it fades a button that cannot be used, and the greyed › is grey already.
        .buttonStyle(ItemsBareStyle())
        .disabled(!enabled)
        .accessibilityLabel(later ? "Later" : "Earlier")
    }

    /// The period's items, or the website's empty state once the report for these choices has come; until then a spinner, or what
    /// went wrong (never a red banner).
    @ViewBuilder
    private var results: some View {
        if report.isCurrent {
            if report.rows.isEmpty {
                // The photo's drawing area starts 24 pt under the tabs: the website's drawing in its middle, the words under it.
                ItemSalesEmptyState()
                    .padding(.top, 24)
            } else {
                ItemSalesRowsCard(rows: report.rows)
                    .padding(.top, 24)
            }
        } else if !report.problem.isEmpty {
            ItemSalesProblem(problem: report.problem, canRetry: !report.forbidden) {
                // The words go and the spinner shows while the report is asked for again.
                report.clearProblem()
                Task { await load() }
            }
        } else {
            ProgressView()
                .controlSize(.large)
                .tint(Theme.blue)
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
        }
    }

    // MARK: The list and the menu over the page

    @ViewBuilder
    private var popupCard: some View {
        switch popup {
        case .range:
            ItemSalesRangeList(chosen: report.choices.period) { period in
                pick(period)
            }
            .frame(width: fieldFrame.width)
            .offset(x: fieldFrame.minX, y: fieldFrame.maxY + 4)
            .transition(.opacity)
            .zIndex(2)
            .accessibilityAddTraits(.isModal)
            .accessibilityAction(.escape) { closePopup() }
        case .menu:
            menu
                .frame(width: max(dotsFrame.maxX, 0), alignment: .trailing)
                .offset(y: dotsFrame.maxY + 4)
                .transition(.opacity)
                .zIndex(2)
                .accessibilityAddTraits(.isModal)
                .accessibilityAction(.escape) { closePopup() }
        case nil:
            EmptyView()
        }
    }

    /// The ⋮ menu (photo 63e1e3b0). Print and Export wait for the report of the chosen period; Learn about this report shows the
    /// website's words about it. It is the photo's width, or as wide as its longest line needs to stay on one line as in the
    /// photo, and never wider than the page.
    private var menu: some View {
        let widest = max(dotsFrame.maxX - 16, 160)
        return VStack(alignment: .leading, spacing: 0) {
            ItemSalesMenuRow(icon: .print, title: "Print", enabled: report.isCurrent, focused: true) {
                printReport()
            }
            ItemSalesMenuRow(icon: .export, title: "Export", enabled: report.isCurrent) {
                exportReport()
            }
            ItemSalesMenuRow(icon: .sync, title: "Accounting sync") {
                openSync()
            }
            ItemSalesMenuRow(icon: .info, title: "Learn about this report") {
                openAbout()
            }
        }
        .padding(.vertical, 6)
        .frame(minWidth: min(menuWidth, widest), maxWidth: widest)
        .fixedSize(horizontal: true, vertical: false)
        .modifier(ItemSalesPopupCard())
    }

    // MARK: Actions

    private func toggle(_ which: ItemSalesPopup) {
        withAnimation(.easeOut(duration: 0.15)) {
            popup = popup == which ? nil : which
        }
    }

    private func closePopup() {
        guard popup != nil else { return }
        withAnimation(.easeOut(duration: 0.15)) { popup = nil }
    }

    private func pick(_ period: ItemSalesPeriod) {
        closePopup()
        if period == .custom {
            customOpen = true
        } else {
            // The light tap the app gives a newly chosen period, as Home's time frames do.
            if period != report.choices.period { Haptics.light() }
            report.choose(period)
        }
    }

    private func openFilters() {
        closePopup()
        withAnimation(.snappy(duration: 0.3)) { filtersOpen = true }
    }

    private func closeFilters() {
        withAnimation(.snappy(duration: 0.3)) { filtersOpen = false }
    }

    private func printReport() {
        closePopup()
        ItemSalesPrinter.show(html: report.printPage(siteName: siteName), title: "Item sales")
    }

    private func exportReport() {
        closePopup()
        do {
            let file = try report.exportFile(siteName: siteName)
            UIPresenter.share(file)
        } catch {
            Haptics.error()
            show("The file could not be saved. Please try again.")
        }
    }

    private func openSync() {
        closePopup()
        fileToOffer = nil
        syncOpen = true
    }

    private func openAbout() {
        closePopup()
        aboutOpen = true
    }

    /// The website's QuickBooks download: its words when the period has no payments or the server said no; otherwise the sheet
    /// closes, the file is offered, and "3 transactions ready for QuickBooks" shows, as on the website.
    private func downloadForQuickBooks() async -> String? {
        do {
            guard let made = try await report.quickBooksFile(siteID: siteID, siteName: siteName) else {
                return "No payments in this period to send to QuickBooks."
            }
            // The sheet stays while the file is made; if it went anyway (Cancel), the file is not kept to pop up later.
            guard syncOpen, !Task.isCancelled else { return nil }
            fileToOffer = made.file
            syncOpen = false
            Haptics.success()
            let plural = made.count == 1 ? "" : "s"
            show(String(made.count) + " transaction" + plural + " ready for QuickBooks")
            return nil
        } catch let error as APIError {
            // Signed out everywhere, or the server ended the session: the app checks, then locks. A 403 is only a message.
            if error.status == 401 { model.sessionEnded() }
            return error.message
        } catch is CancellationError {
            return nil
        } catch {
            return "The file could not be saved. Please try again."
        }
    }

    private func offerFile() {
        guard let file = fileToOffer else { return }
        fileToOffer = nil
        UIPresenter.share(file)
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

    // MARK: Loading

    /// The report for the current choices and the business's details (its time zone, web address name and name; at most once a
    /// minute). The stats route works out its own periods and answers with the business's time zone, so for those the report is
    /// asked for first; the periods worked out here need the business's calendar before their days are asked for.
    private func load() async {
        guard scenePhase == .active, model.phase == .ready, !siteID.isEmpty else { return }
        if report.choices.period.serverKey != nil {
            await report.load(siteID: siteID)
            await report.loadSite(siteID: siteID)
        } else {
            await report.loadSite(siteID: siteID)
            await report.load(siteID: siteID)
        }
    }

    private func pullToRefresh() async {
        guard !siteID.isEmpty else { return }
        if report.choices.period.serverKey != nil {
            if let words = await report.load(siteID: siteID) { show(words) }
            await report.loadSite(siteID: siteID, force: true)
        } else {
            await report.loadSite(siteID: siteID, force: true)
            if let words = await report.load(siteID: siteID) { show(words) }
        }
    }
}
