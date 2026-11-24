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

    var id: String {
        switch self {
        case .switchTo(let site): return "switch-\(site.id)"
        case .changePasscode: return "passcode"
        case .settingsPage(let page): return "settings-\(page.rawValue)"
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
    /// The tab to open once a notification's business has been switched to.
    @ObservationIgnored var pendingTab: String?
    /// The business to open once the passcode step for it has finished closing.
    @ObservationIgnored var switchAfterCover: Site?

    /// Home's "Show today's sales" choice, kept while this business is open.
    var salesShown = false
    var salesAllowed = true

    let order = SaleModel()

    func popToRoot(_ which: MainTab) {
        switch which {
        case .home: home = []
        case .sale: sale = []
        case .orders: orders = []
        case .more: more = []
        }
    }

    func push(_ route: Route) {
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
        } else {
            push(.page(id))
        }
    }

    func sheetClosed() {
        if let next = afterSheet {
            afterSheet = nil
            cover = next
        }
    }
}
