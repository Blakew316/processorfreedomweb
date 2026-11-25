import SwiftUI

/// The four tabs, like the photos: Home, Sale, Orders and More, on the system Liquid Glass tab bar.
/// Each tab has its own navigation stack, kept in the model, so every tab keeps its place. The photo's icons are all line
/// drawings, so Home and Sale ask for the plain symbols (a tab bar swaps in the filled ones otherwise), like Orders and More.
struct MainTabsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var shell = model.shell
        TabView(selection: $shell.tab) {
            Tab(value: MainTab.home) {
                NavigationStack(path: $shell.home) {
                    HomeView()
                        .navigationDestination(for: Route.self) { route in RouteDestination(route: route) }
                }
            } label: {
                Label("Home", systemImage: "house")
                    .environment(\.symbolVariants, .none)
            }
            Tab(value: MainTab.sale) {
                NavigationStack(path: $shell.sale) {
                    SaleView()
                        .navigationDestination(for: Route.self) { route in RouteDestination(route: route) }
                }
            } label: {
                Label("Sale", systemImage: "plus.circle")
                    .environment(\.symbolVariants, .none)
            }
            // The receipt icon from the owner's Clover photo (Assets: OrdersTab, a template so it tints like the others).
            // The Orders list is native (E19); the badge counts the orders still marked new.
            Tab("Orders", image: "OrdersTab", value: MainTab.orders) {
                NavigationStack(path: $shell.orders) {
                    OrdersTabView()
                        .navigationDestination(for: Route.self) { route in RouteDestination(route: route) }
                }
            }
            .badge(model.ordersBadge)
            Tab("More", systemImage: "line.3.horizontal", value: MainTab.more) {
                NavigationStack(path: $shell.more) {
                    MoreView()
                        .navigationDestination(for: Route.self) { route in RouteDestination(route: route) }
                }
            }
        }
        .tabBarMinimizeBehavior(.never)
        .tint(Theme.blue)
    }
}

/// The screen for each kind of pushed route.
struct RouteDestination: View {
    let route: Route
    @Environment(AppModel.self) private var model

    var body: some View {
        switch route {
        case .page(let tab):
            WebScreen(tab: tab)
        case .checkout(let sub, let note):
            WebScreen(tab: "sale", script: SaleModel.handOffScript(sub: sub, note: note))
        case .settings:
            SettingsView()
        case .settingsGroup(let id):
            SettingsGroupView(groupID: id)
        case .appSecurity:
            AppSecurityView()
        case .settingsPage(let page):
            SettingsPageHost(id: page)
        case .order(let id):
            OrderDetailView(orders: model.shell.orderList, orderID: id)
        case .salesOverview:
            SalesOverviewScreen()
        case .appointments:
            AppointmentsScreen()
        case .createAppointment(let date, let time, let employee):
            CreateAppointmentScreen(date: date, time: time, employee: employee)
        }
    }
}

/// The header of each tab's first screen (E2): the tab's name large on the left with the business name under it,
/// and the switch-location and notification buttons (Sale has its menu instead of switch-location).
struct TabHeader: ViewModifier {
    enum Kind {
        case standard
        case sale
    }

    let title: String
    var kind: Kind = .standard
    @Environment(AppModel.self) private var model

    func body(content: Content) -> some View {
        content
            // What scrolls under the top bar is cut off cleanly at the bar's edge, as in the photos and on the Settings pages:
            // nothing of the page shows through the bar.
            .scrollEdgeEffectStyle(.hard, for: .top)
            .navigationTitle(title)
            .navigationSubtitle((model.site?.name ?? "").uppercased())
            .toolbarTitleDisplayMode(.inlineLarge)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if kind == .sale {
                        SaleMenuButton()
                    } else {
                        Button {
                            model.shell.sheet = .locations
                        } label: {
                            Image(systemName: "arrow.left.arrow.right")
                        }
                        // With one business it is shown disabled; after a team passcode it opens the list to sign in for all of them.
                        .disabled(!model.canChangeLocation)
                        .accessibilityLabel("Switch location")
                    }
                    Button {
                        model.shell.sheet = .notifications
                    } label: {
                        // A small red dot on the bell when there is something new since the sheet was last opened.
                        if model.notesDot {
                            Image(systemName: "bell.badge")
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(Color.red, Color.primary)
                        } else {
                            Image(systemName: "bell")
                        }
                    }
                    .accessibilityLabel("Notifications")
                    .accessibilityValue(model.notesDot ? "New" : "")
                }
            }
            .steadyNavigationBar()
    }
}

extension View {
    func tabHeader(_ title: String, kind: TabHeader.Kind = .standard) -> some View {
        modifier(TabHeader(title: title, kind: kind))
    }
}
