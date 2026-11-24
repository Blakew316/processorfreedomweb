import SwiftUI

/// The four tabs, like the photos: Home, Sale, Orders and More, on the system Liquid Glass tab bar.
/// Each tab has its own navigation stack, kept in the model, so every tab keeps its place.
struct MainTabsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var shell = model.shell
        TabView(selection: $shell.tab) {
            Tab("Home", systemImage: "house", value: MainTab.home) {
                NavigationStack(path: $shell.home) {
                    HomeView()
                        .navigationDestination(for: Route.self) { route in RouteDestination(route: route) }
                }
            }
            Tab("Sale", systemImage: "plus.circle", value: MainTab.sale) {
                NavigationStack(path: $shell.sale) {
                    SaleView()
                        .navigationDestination(for: Route.self) { route in RouteDestination(route: route) }
                }
            }
            // The receipt icon from the owner's Clover photo (Assets: OrdersTab, a template so it tints like the others).
            Tab("Orders", image: "OrdersTab", value: MainTab.orders) {
                NavigationStack(path: $shell.orders) {
                    OrdersView()
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
                        .disabled(model.sites.count < 2)
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
