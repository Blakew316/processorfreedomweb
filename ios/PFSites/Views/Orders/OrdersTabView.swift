import SwiftUI

/// The Orders tab (E19, the owner's photo): search and filters, the date menu, the Closed and Open tabs, and the orders grouped by
/// day under grey bands that fold away. It refreshes when it appears, on pull, and every 20 seconds while it is on screen.
struct OrdersTabView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.displayScale) private var displayScale
    @State private var showFilters = false
    /// Try again is asking the server (the button shows a spinner and cannot be pressed twice).
    @State private var retrying = false
    /// A tab was chosen by hand: from then on the blue line slides to the chosen tab. (The first load picks a tab without a slide.)
    @State private var tabTapped = false

    /// The business's list lives with the tab's stack, so an opened order is a page of that stack.
    private var orders: OrdersModel { model.shell.orderList }

    private struct PollKey: Hashable {
        let active: Bool
        let ready: Bool
        let site: String
    }

    var body: some View {
        let days = orders.days
        // The list is showing (not the spinner or the message), with at least one day's band under the tabs.
        let banded = orders.loaded && (orders.loadError.isEmpty || !orders.orders.isEmpty) && !days.isEmpty
        VStack(spacing: 0) {
            searchRow
            OrdersHairline()
            dateRow
            OrdersHairline()
            tabsRow(lined: !banded)
            content(days)
        }
        .background(Color(.systemBackground))
        .tabHeader("Orders")
        .task(id: PollKey(active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            await poll()
        }
        .sheet(isPresented: $showFilters) {
            OrderFiltersSheet(orders: orders)
        }
    }

    // MARK: Search and filters

    private var searchRow: some View {
        @Bindable var list = orders
        return HStack(spacing: 8) {
            // The photo: the glass 10 pt inside the box, the words 40.7 pt inside it and a point above its middle.
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 17.3))
                    .foregroundStyle(.primary)
                    .accessibilityHidden(true)
                TextField(text: $list.search, prompt: Text("Search orders").foregroundStyle(OrdersLook.placeholder)) {
                    Text("Search orders")
                }
                .pfFont(17)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .padding(.bottom, 2)
                .onChange(of: list.search) { _, _ in model.idle.touch() }
                if !list.search.isEmpty {
                    Button {
                        list.search = ""
                    } label: {
                        // 44 pt to press; the cross itself stays where it was.
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, -12)
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.leading, 8)
            .padding(.trailing, 10)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color(.systemBackground)))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(OrdersLook.fieldBorder, lineWidth: 1))

            Button {
                showFilters = true
            } label: {
                OrdersSliders()
                    .stroke(Theme.blue, style: StrokeStyle(lineWidth: 5.0 / 3.0, lineCap: .round))
                    .frame(width: 18, height: 20)
                    .frame(width: 48, height: 48)
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(OrdersLook.buttonBorder, lineWidth: 1))
                    .overlay(alignment: .topTrailing) {
                        if list.filtersOn > 0 {
                            Text(String(list.filtersOn))
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(minWidth: 18, minHeight: 18)
                                .background(Circle().fill(Theme.blue))
                                .offset(x: 6, y: -6)
                        }
                    }
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Filters")
            .accessibilityValue(list.filtersOn > 0 ? "\(list.filtersOn) on" : "")
        }
        .padding(.leading, 15)
        .padding(.trailing, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    // MARK: The date menu

    private var dateRow: some View {
        @Bindable var list = orders
        return HStack(alignment: .center, spacing: 12) {
            Menu {
                Picker("Date range", selection: $list.range) {
                    ForEach(OrdersRange.allCases) { range in
                        Text(range.label).tag(range)
                    }
                }
            } label: {
                // The same link as on Sales Overview, semibold as the photos have it on both screens.
                Text(list.range.label)
                    .underline()
                    .pfFont(15, .semibold)
                    .foregroundStyle(Theme.blue)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Date range, \(list.range.label)")
            Spacer(minLength: 8)
            // The photo's baselines: the date 21.5 pt and the times 38.5 pt under the line above.
            VStack(alignment: .trailing, spacing: 2.5) {
                Text(list.rangeTitle)
                    .pfFont(13, .semibold)
                    .foregroundStyle(.primary)
                Text(list.rangeTimes)
                    .pfFont(12)
                    .foregroundStyle(.primary)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.bottom, 1)
            .accessibilityElement(children: .combine)
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 52)
    }

    // MARK: Closed and Open

    /// The two tabs, with one 2 pt blue line under the chosen half. A day's grey band sits right under them, as in the photo; the
    /// hairline is only drawn when there is no band (the spinner, a message, an empty list).
    private func tabsRow(lined: Bool) -> some View {
        let counts = orders.counts()
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                tabButton(.closed, title: "Closed", count: counts.closed)
                tabButton(.open, title: "Open", count: counts.open)
            }
            .overlay(alignment: .bottomLeading) {
                GeometryReader { proxy in
                    // Half the width, on a whole pixel like the tabs themselves.
                    let half = (proxy.size.width / 2 * displayScale).rounded() / displayScale
                    Theme.blue
                        .frame(width: half, height: 2)
                        .offset(x: orders.tab == .open ? half : 0)
                        .animation(tabTapped ? .snappy(duration: 0.25) : nil, value: orders.tab)
                }
                .frame(height: 2)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
            if lined { OrdersHairline() }
        }
    }

    private func tabButton(_ tab: OrdersTab, title: String, count: Int) -> some View {
        let on = orders.tab == tab
        return Button {
            tabTapped = true
            orders.tabChosen = true
            guard !on else { return }
            // The light tap the app gives when moving between the pages of a section.
            Haptics.light()
            orders.tab = tab
        } label: {
            Text(count > 0 ? "\(title) (\(count))" : title)
                .pfFont(11.25, on ? .semibold : .regular)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: The list

    @ViewBuilder
    private func content(_ days: [OrderDay]) -> some View {
        if !orders.loaded && orders.loadError.isEmpty {
            Spacer()
            ProgressView().controlSize(.large).tint(Theme.blue)
            Spacer()
        } else if !orders.loadError.isEmpty && (!orders.loaded || orders.orders.isEmpty) {
            Spacer()
            VStack(spacing: 14) {
                Text(orders.loadError)
                    .pfFont(17)
                    .foregroundStyle(SettingsLook.muted)
                    .multilineTextAlignment(.center)
                Button {
                    guard !retrying else { return }
                    retrying = true
                    Task {
                        await refresh(force: true)
                        retrying = false
                    }
                } label: {
                    if retrying { ProgressView().tint(.white) } else { Text("Try again") }
                }
                .buttonStyle(SolidButtonStyle(radius: 6, height: 44, size: 17))
                .frame(maxWidth: 200)
                .disabled(retrying)
            }
            .padding(.horizontal, 32)
            Spacer()
        } else {
            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                    if days.isEmpty {
                        emptyState
                    }
                    ForEach(days) { day in
                        Section {
                            if !orders.collapsed.contains(day.id) {
                                ForEach(Array(day.orders.enumerated()), id: \.element.id) { index, order in
                                    row(order, last: index == day.orders.count - 1)
                                }
                            }
                        } header: {
                            band(day)
                        }
                    }
                }
            }
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await refresh(force: true) }
            // The rows' own colour carries on under a short list (and under the tab bar), so the list never ends in a step of
            // colour, which is plain to see in dark mode.
            .background(days.isEmpty ? Color(.systemBackground) : OrdersLook.row)
        }
    }

    /// The grey band over a day: its name, how many orders, and a chevron. Tapping it folds the day away or opens it again.
    private func band(_ day: OrderDay) -> some View {
        let open = !orders.collapsed.contains(day.id)
        return Button {
            withAnimation(.snappy) {
                if open { orders.collapsed.insert(day.id) } else { orders.collapsed.remove(day.id) }
            }
        } label: {
            HStack(spacing: 8) {
                Text(day.title)
                    .pfFont(15, .bold)
                    .foregroundStyle(.primary)
                Text(String(day.orders.count))
                    .pfFont(14, .medium)
                    .foregroundStyle(.primary)
                    .padding(.horizontal, 12)
                    .frame(minWidth: 32, minHeight: 19)
                    .overlay(Capsule().strokeBorder(Color.primary, lineWidth: 1))
                Spacer(minLength: 8)
                // The photo's chevron: 17 pt tall, 9.7 pt from the edge.
                Image(systemName: "chevron.right")
                    .font(.system(size: 19.5, weight: .medium))
                    .foregroundStyle(OrdersLook.chevron)
                    .rotationEffect(.degrees(open ? 0 : 90))
            }
            .padding(.leading, 16)
            .padding(.trailing, 8.5)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(OrdersLook.band)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(day.title), \(day.orders.count) \(day.orders.count == 1 ? "order" : "orders")")
        .accessibilityValue(open ? "Shown" : "Hidden")
        .accessibilityHint(open ? "Hides this day's orders" : "Shows this day's orders")
    }

    /// An order: the total and its pill, the order number, then how it was paid (or how it is collected) and the time.
    private func row(_ order: CustomerOrder, last: Bool) -> some View {
        Button {
            // Only from the list itself: a second tap while the order is already opening does not open it twice.
            guard model.shell.orders.isEmpty else { return }
            model.idle.touch()
            model.shell.orders.append(.order(order.id))
        } label: {
            // Measured on the photo, from the top of a row: the pill at 20 pt, the order line's letters at 61.7 pt, the payment
            // line's baseline at 102 pt, a 1 pt line at 133.7 pt, and the next row 135.3 pt down.
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 12) {
                    Text(Money.format(order.total))
                        .pfFont(16.5, .semibold)
                        .foregroundStyle(OrdersLook.rowText)
                        .padding(.bottom, 2)
                    Spacer(minLength: 8)
                    OrderPillView(pill: order.pill)
                }
                Text("Order #\(String(order.number))")
                    .pfFont(16, .medium)
                    .foregroundStyle(OrdersLook.rowText)
                    .padding(.top, 16)
                HStack(spacing: 0) {
                    // One 22 pt column for the icon (the photo's card logo), starting on the words' edge, so every row's words
                    // start at the same place whatever the icon. The symbols carry about 2 pt of empty space on their left.
                    Image(systemName: order.payOrCollectSymbol)
                        .font(.system(size: 15))
                        .foregroundStyle(OrdersLook.rowText)
                        .frame(width: 22, alignment: .leading)
                        .offset(x: -2)
                        .padding(.trailing, 6)
                        .accessibilityHidden(true)
                    Text(order.payOrCollectName)
                        .pfFont(16, .medium)
                        .layoutPriority(1)
                    Text(" • \(orders.time(order.createdAt))")
                        .pfFont(16)
                        .layoutPriority(2)
                }
                .foregroundStyle(OrdersLook.rowText)
                .lineLimit(1)
                .padding(.top, 9)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 29.67)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(OrdersLook.row)
            .overlay(alignment: .bottom) {
                if !last {
                    OrdersLook.hairline
                        .frame(height: 1)
                        .padding(.horizontal, 18)
                        .padding(.bottom, 2.0 / 3.0)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the order")
    }

    /// The website's words when the list is empty.
    @ViewBuilder
    private var emptyState: some View {
        let anyInPeriod = !orders.inRange.isEmpty
        let narrowed = !orders.search.trimmed.isEmpty || orders.filtersOn > 0
        VStack(spacing: 8) {
            if !anyInPeriod {
                Text(orders.range == .today ? "No orders yet today" : "No orders found")
                    .pfFont(18, .bold)
                Text("Find orders with a different search, date range and filter combination.")
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
            } else if narrowed && orders.matching.isEmpty {
                Text("No orders match your search or filters")
                    .pfFont(18, .bold)
                Text("Find orders with a different search, date range and filter combination.")
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
            } else {
                Text(orders.tab == .open ? "No open orders" : "No closed orders")
                    .pfFont(18, .bold)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.top, 48)
    }

    // MARK: Keeping it fresh

    /// Loads now, then every 20 seconds while the list is on screen and the app is open and unlocked. The business's time zone is
    /// read beside the list, never before it (its own 60-second memory keeps that cheap), so the list does not wait on it and a
    /// time zone that failed to load is tried again on the next pass; the days regroup when it arrives.
    private func poll() async {
        guard scenePhase == .active, model.phase == .ready, let business = model.site else { return }
        let list = orders
        while !Task.isCancelled {
            async let zone: Void = list.loadSite(siteID: business.id)
            await list.load(siteID: business.id)
            await zone
            try? await Task.sleep(nanoseconds: 20_000_000_000)
        }
    }

    private func refresh(force: Bool) async {
        guard let business = model.site else { return }
        async let site: Void = orders.loadSite(siteID: business.id, force: force)
        async let list: Void = orders.load(siteID: business.id)
        _ = await (site, list)
    }
}
