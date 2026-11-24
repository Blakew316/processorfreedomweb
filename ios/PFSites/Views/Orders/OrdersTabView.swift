import SwiftUI

/// The Orders tab (E19, the owner's photo): search and filters, the date menu, the Closed and Open tabs, and the orders grouped by
/// day under grey bands that fold away. It refreshes when it appears, on pull, and every 20 seconds while it is on screen.
struct OrdersTabView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var showFilters = false

    /// The business's list lives with the tab's stack, so an opened order is a page of that stack.
    private var orders: OrdersModel { model.shell.orderList }

    private struct PollKey: Hashable {
        let active: Bool
        let ready: Bool
        let site: String
    }

    var body: some View {
        VStack(spacing: 0) {
            searchRow
            OrdersHairline()
            dateRow
            OrdersHairline()
            tabsRow
            content
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
            HStack(spacing: 15) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 18))
                    .foregroundStyle(.primary)
                    .accessibilityHidden(true)
                TextField(text: $list.search, prompt: Text("Search orders").foregroundStyle(OrdersLook.placeholder)) {
                    Text("Search orders")
                }
                .pfFont(17)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .onChange(of: list.search) { _, _ in model.idle.touch() }
                if !list.search.isEmpty {
                    Button {
                        list.search = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color(.systemBackground)))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(OrdersLook.fieldBorder, lineWidth: 1))

            Button {
                showFilters = true
            } label: {
                Image(systemName: "slider.vertical.3")
                    .font(.system(size: 20))
                    .foregroundStyle(Theme.blue)
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
                Text(list.range.label)
                    .underline()
                    .pfFont(15)
                    .foregroundStyle(Theme.blue)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Date range, \(list.range.label)")
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(list.rangeTitle)
                    .pfFont(13, .semibold)
                    .foregroundStyle(.primary)
                Text(list.rangeTimes)
                    .pfFont(12.5)
                    .foregroundStyle(.primary)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .accessibilityElement(children: .combine)
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 52)
    }

    // MARK: Closed and Open

    private var tabsRow: some View {
        let counts = orders.counts()
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                tabButton(.closed, title: "Closed", count: counts.closed)
                tabButton(.open, title: "Open", count: counts.open)
            }
            OrdersHairline()
        }
    }

    private func tabButton(_ tab: OrdersTab, title: String, count: Int) -> some View {
        let on = orders.tab == tab
        return Button {
            orders.tabChosen = true
            orders.tab = tab
        } label: {
            Text(count > 0 ? "\(title) (\(count))" : title)
                .pfFont(12.5, on ? .semibold : .regular)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
                .overlay(alignment: .bottom) {
                    if on { Theme.blue.frame(height: 2) }
                }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: The list

    @ViewBuilder
    private var content: some View {
        if !orders.loaded && orders.loadError.isEmpty {
            Spacer()
            ProgressView().controlSize(.large).tint(Theme.blue)
            Spacer()
        } else if !orders.loadError.isEmpty && (!orders.loaded || orders.orders.isEmpty) {
            Spacer()
            VStack(spacing: 14) {
                Text(orders.loadError)
                    .pfFont(17)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Try again") { Task { await refresh(force: true) } }
                    .buttonStyle(SolidButtonStyle(radius: 6, height: 44, size: 17))
                    .frame(maxWidth: 200)
            }
            .padding(.horizontal, 32)
            Spacer()
        } else {
            let days = orders.days
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
            HStack(spacing: 10) {
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
                Image(systemName: "chevron.right")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(OrdersLook.chevron)
                    .rotationEffect(.degrees(open ? 0 : 90))
            }
            .padding(.leading, 16)
            .padding(.trailing, 10)
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
            model.idle.touch()
            model.shell.orders.append(.order(order.id))
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 12) {
                    Text(Money.format(order.total))
                        .pfFont(16.5, .semibold)
                        .foregroundStyle(OrdersLook.rowText)
                    Spacer(minLength: 8)
                    OrderPillView(pill: order.pill)
                }
                Text("Order #\(String(order.number))")
                    .pfFont(16, .medium)
                    .foregroundStyle(OrdersLook.rowText)
                    .padding(.top, 17)
                HStack(spacing: 0) {
                    Image(systemName: order.payOrCollectSymbol)
                        .font(.system(size: 15))
                        .foregroundStyle(OrdersLook.rowText)
                        .frame(minWidth: 20, alignment: .leading)
                        .padding(.trailing, 8)
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
            .padding(.bottom, 28)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(OrdersLook.row)
            .overlay(alignment: .bottom) {
                if !last {
                    OrdersLook.hairline
                        .frame(height: 2.0 / 3.0)
                        .padding(.horizontal, 18)
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
