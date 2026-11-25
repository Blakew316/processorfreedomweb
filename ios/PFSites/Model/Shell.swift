import Foundation
import Observation

/// The four tabs, in the photos' order.
enum MainTab: Hashable {
    case home, sale, orders, more
}

/// A screen pushed onto a tab's navigation stack.
enum Route: Hashable {
    case page(String)                        // a back-office web page by its website id ("sales", "orders", ...)
    case checkout(sub: String, note: String) // the Virtual Terminal filled in from the Sale screen's order
    case settings
    case settingsGroup(String)
    case appSecurity
    case settingsPage(SettingsPageID)        // a native Settings page pushed onto the tab (Invoice number, Payment note, ...)
    case order(String)                       // one order of the Orders tab, by its id
    case salesOverview                       // Home → Sales overview (native, the owner's Clover photos)
    case appointments                        // Home → Calendar: the Appointments day view (native)
    case createAppointment(date: String?, time: String?, employee: String?) // the "+" of Appointments; a tapped time fills date and time
}

/// Sheets the main screens show over everything.
enum ShellSheet: String, Identifiable {
    case notifications, locations
    var id: String { rawValue }
}

/// Full-screen steps the main screens show over everything.
enum ShellCover: Identifiable {
    case switchTo(Site)      // the passcode step for another business
    case changePasscode
    case settingsPage(SettingsPageID)   // a native Settings page (Business information, Payments, ...)
    case insights                       // Home → Insights, full screen with an X like the owner's photo
    case items                          // Home → Items and services, full screen with an X like the owner's photos
    case closeout                       // Home → Closeout, full screen with an X like the owner's photos
    case itemSales                      // Home → Items sales report, full screen with an X like the owner's photos
    case tasks                          // Home → Setup tasks: the Tasks screen, full screen with an X like the owner's photo

    var id: String {
        switch self {
        case .switchTo(let site): return "switch-\(site.id)"
        case .changePasscode: return "passcode"
        case .settingsPage(let page): return "settings-\(page.rawValue)"
        case .insights: return "insights"
        case .items: return "items"
        case .closeout: return "closeout"
        case .itemSales: return "itemSales"
        case .tasks: return "tasks"
        }
    }
}

/// Where the person is in the main screens of one business: the chosen tab, each tab's stack, open sheets, and the order being built.
/// It lives in the app model, so locking the app and opening it again comes back to the same tab and page; a new business starts a new one.
@Observable @MainActor
final class Shell {
    var tab: MainTab = .home
    var home: [Route] = []
    var sale: [Route] = []
    var orders: [Route] = []
    var more: [Route] = []

    var sheet: ShellSheet? = nil
    var cover: ShellCover? = nil
    /// A step to show once the open sheet has finished closing (two presentations cannot overlap).
    @ObservationIgnored var afterSheet: ShellCover?
    /// A page to open on the current tab once the open sheet has finished closing (a choice in the Notifications sheet).
    @ObservationIgnored var afterSheetTab: String?
    /// The tab to open once a notification's business has been switched to.
    @ObservationIgnored var pendingTab: String?
    /// The business to open once the passcode step for it has finished closing.
    @ObservationIgnored var switchAfterCover: Site?

    /// Home's "Show today's sales" choice, kept while this business is open.
    var salesShown = false
    var salesAllowed = true

    let order = SaleModel()
    /// The Orders tab's list, kept here so an order opened from it is a page of the tab's stack (a notification pops back to the list).
    let orderList = OrdersModel()

    /// The last screen pushed and when, to tell a second tap from a later request for the same screen.
    @ObservationIgnored private var lastPush: (route: Route, tab: MainTab, at: Date)?

    /// Pushes a screen onto the current tab. The screen already on top is never opened a second time over itself: a second tap
    /// that lands before the first push has moved the screen does nothing, and the same screen asked for again later (a
    /// notification for the web page already showing, whose own page strip may have moved on) asks that page to show it again.
    func push(_ route: Route) {
        let now = Date()
        let secondTap = lastPush.map { $0.route == route && $0.tab == tab && now.timeIntervalSince($0.at) < 0.7 } ?? false
        if secondTap { return }
        lastPush = (route, tab, now)
        let top: Route?
        switch tab {
        case .home: top = home.last
        case .sale: top = sale.last
        case .orders: top = orders.last
        case .more: top = more.last
        }
        if top == route {
            if case .page(let id) = route { WebStore.shared.showAgain(id) }
            return
        }
        switch tab {
        case .home: home.append(route)
        case .sale: sale.append(route)
        case .orders: orders.append(route)
        case .more: more.append(route)
        }
    }

    /// Opens a back-office page on the current tab, the way the website's links move around: the Orders list is its own tab.
    func open(tab id: String) {
        guard !id.isEmpty else { return }
        if id == "orders" {
            orders = []
            tab = .orders
        } else if id == "start" {
            home = []
            tab = .home
        } else if id == "settings" {
            // The app's Settings are its own screen (E9), built from the website's Settings cards.
            push(.settings)
        } else {
            push(.page(id))
        }
    }

    func sheetClosed() {
        if let next = afterSheet {
            afterSheet = nil
            cover = next
        }
        if let page = afterSheetTab {
            afterSheetTab = nil
            open(tab: page)
        }
    }
}
