import Foundation

/// A section of the website's back-office sidebar, with its pages in the website's order.
struct OfficeSection: Identifiable {
    let label: String
    let icon: String
    let pages: [PageLink]
    var id: String { label }
}

/// The website's navigation, mirrored from public/js/editor.js (NAV.office, BOOKTOOLS, TOOLS, NAV.site and the TABS names),
/// so the app's More list and titles use the same words and pages as the website's sidebar.
enum OfficeCatalog {
    private static func p(_ id: String, _ label: String) -> PageLink { PageLink(id: id, label: label) }

    /// The sidebar sections, in the website's order. Home is left out: it is the app's own first tab.
    /// The Employees list is the owner's to manage, as on the website.
    static func sections(owner: Bool) -> [OfficeSection] {
        [
            OfficeSection(label: "Insights", icon: "sparkles", pages: [p("insights", "Insights")]),
            OfficeSection(label: "Appointments", icon: "calendar", pages: [p("calendar", "Calendar"), p("appts", "Overview")]),
            OfficeSection(label: "Sales activity", icon: "receipt", pages: [p("orders", "Orders"), p("tx", "Transactions"), p("cash", "Cash log"), p("invoices", "Invoices"), p("est", "Estimates"), p("projects", "Projects"), p("plans", "Recurring payments")]),
            OfficeSection(label: "Reports", icon: "chart.bar", pages: [p("sales", "Sales overview"), p("r-full", "Sales report"), p("r-items", "Item and Service sales"), p("r-peer", "Peer insights"), p("r-emp", "Employee sales"), p("r-tender", "Tender & card types"), p("r-disc", "Discounts"), p("r-removed", "Removed items"), p("r-gift", "Gift cards"), p("r-types", "Order types")]),
            OfficeSection(label: "Finances", icon: "building.columns", pages: [p("fin", "Overview"), p("close", "Closeout"), p("stmts", "Statements"), p("r-taxes", "Taxes"), p("disputes", "Disputes"), p("capital", "Capital"), p("stax", "Sales tax"), p("bills", "Pay Bills")]),
            OfficeSection(label: "Items", icon: "tag", pages: [p("items", "Item list"), p("menu", "Categories"), p("mods", "Modifier groups"), p("menus", "Menus"), p("labels", "Printer labels"), p("revs", "Revenue classes"), p("discs", "Discounts")]),
            OfficeSection(label: "Employees", icon: "person.text.rectangle", pages: (owner ? [p("team", "Employees list")] : []) + [p("timesheets", "Timesheets"), p("schedule", "Scheduling"), p("tips", "Tips")]),
            OfficeSection(label: "Customers", icon: "person.2", pages: [p("customers", "Customers list"), p("promos", "Promos"), p("inbox", "Feedback"), p("rewards", "Rewards"), p("gift", "Gift cards")]),
            OfficeSection(label: "Booking tools", icon: "calendar.badge.clock", pages: [p("obook", "Online booking"), p("boutreach", "Customer outreach")]),
            OfficeSection(label: "Ordering tools", icon: "bag", pages: [p("online", "Online ordering"), p("outreach", "Customer outreach")]),
        ]
    }

    /// The website side's pages (NAV.site), shown when the Website section is opened.
    static let websitePages: [PageLink] = [
        p("design", "Look and feel"), p("history", "Earlier versions"), p("sections", "Sections"), p("policies", "Policies"),
        p("business", "Business info"), p("domain", "Web address"), p("seo", "Google listing"),
    ]

    /// Pages the website keeps for owners only.
    static let ownerOnly: Set<String> = ["team", "emp-new", "devices"]

    /// A page's name as the website's TABS list has it, shown as the title until the page itself reports its title.
    static func title(for tab: String) -> String { titles[tab] ?? "PF Sites" }

    private static let titles: [String: String] = [
        "sale": "Virtual Terminal", "sites": "My sites", "start": "Home", "orders": "Orders", "tx": "Transactions", "cash": "Cash log", "close": "Closeout",
        "est": "Estimates", "tips": "Tips", "r-full": "Sales report", "r-emp": "Employee sales", "r-tender": "Tender types", "r-disc": "Discounts report",
        "r-removed": "Removed items", "r-exports": "Exports", "insights": "Insights", "appts": "Appointments", "calendar": "Calendar", "booking": "Online booking",
        "schedule": "Scheduling", "timesheets": "Timesheets", "projects": "Projects", "plans": "Recurring payments", "gift": "Gift cards",
        "bizinfo": "Business information", "devices": "Devices", "appearance": "Appearance", "settings": "Settings", "profile": "Profile", "items": "Items",
        "menu": "Categories", "mods": "Modifier groups", "menus": "Menus", "labels": "Printer labels", "revs": "Revenue classes", "discs": "Discounts",
        "sales": "Sales overview", "r-items": "Item sales", "r-types": "Order types", "r-taxes": "Taxes", "customers": "Customers", "invoices": "Invoices",
        "r-peer": "Peer insights", "r-gift": "Gift cards report", "fin": "Finances", "stmts": "Statements", "disputes": "Disputes", "capital": "Capital",
        "stax": "Sales tax", "bills": "Pay bills", "emp-new": "New employee", "cust-new": "Add customer", "appt-new": "Create appointment",
        "promos": "Promo codes", "deals": "Happy hour", "rewards": "Rewards", "inbox": "Feedback", "team": "Employees", "ordering": "Online ordering",
        "hours": "Business hours", "alerts": "Alerts and emails", "online": "Online ordering", "outreach": "Customer outreach", "obook": "Online booking",
        "boutreach": "Customer outreach", "design": "Look and feel", "sections": "Home page", "business": "Business info", "domain": "Web address",
        "policies": "Policies", "seo": "Search", "history": "History", "tasks": "Setup tasks", "notes": "Notifications",
        // Pages opened from a list (a new estimate from the Template Library, a category, a menu): named from the start too.
        "mod-new": "Add modifier group", "mod-edit": "Modifier group", "menu-view": "Menu", "label-view": "Printer label", "cat-view": "Category",
        "inv-edit": "Create New Invoice", "est-edit": "Create New Estimate", "proj-edit": "Create new project",
    ]
}

/// One row of the Settings screens: where it goes, or nothing when Processor Freedom does not have it yet (shown greyed).
struct SettingsRow: Identifiable, Hashable {
    enum Target: Hashable {
        case page(String)       // a back-office web page
        case group(String)      // a Settings sub-list
        case locations          // the Choose primary location sheet
        case appSecurity        // the app's own security list
        case native(SettingsPageID) // a native full-screen Settings page
        case pushed(SettingsPageID) // a native Settings page pushed onto the tab (the white pages with the back button)
        case unavailable
    }

    let title: String
    let target: Target
    var subtitle: String = ""

    var id: String { title }
    var enabled: Bool { target != .unavailable }
}

/// A grey band and the rows under it.
struct SettingsBand: Identifiable {
    let title: String
    let rows: [SettingsRow]
    var id: String { title }
}

/// A Settings sub-list, mirroring a card of the website's Settings page (public/js/editor.js PANELS.settings).
struct SettingsGroup: Identifiable {
    let id: String
    let title: String
    let bands: [SettingsBand]
}

enum SettingsCatalog {
    static func groups(owner: Bool) -> [SettingsGroup] {
        [
            SettingsGroup(id: "about", title: "About your business", bands: [SettingsBand(title: "Global settings", rows: [
                SettingsRow(title: "Business information", target: .native(.businessInformation)),
                SettingsRow(title: "Merchants", target: .locations),
                SettingsRow(title: "Closeout settings", target: .native(.closeoutSettings)),
            ])]),
            SettingsGroup(id: "operations", title: "Business operations", bands: [
                SettingsBand(title: "Global settings", rows: operationsRows(owner: owner)),
                // Clover's "Clover Go settings" (the owner's photo): how the Sale screen shows items and takes custom items.
                SettingsBand(title: "PF Sites settings", rows: [
                    SettingsRow(title: "Item images", target: .pushed(.itemImages)),
                    SettingsRow(title: "Custom item name", target: .pushed(.customItemName)),
                ]),
            ]),
            SettingsGroup(id: "transactions", title: "Transactions", bands: [
                SettingsBand(title: "Global settings", rows: [
                    SettingsRow(title: "Orders", target: .native(.ordersOptions)),
                    SettingsRow(title: "Order receipts", target: .native(.orderReceipts)),
                    SettingsRow(title: "Order types", target: .native(.orderTypes)),
                    SettingsRow(title: "Payments", target: .native(.payments)),
                    SettingsRow(title: "Payment receipts", target: .native(.paymentReceipts)),
                    // The white pages are pushed, with the tab bar still under them, as in their photos.
                    SettingsRow(title: "Invoice number", target: .pushed(.invoiceNumber)),
                    SettingsRow(title: "Invoices and estimates", target: .native(.invoicesEstimates)),
                    SettingsRow(title: "Manual card entry permission", target: .pushed(.manualCardEntry)),
                ]),
                SettingsBand(title: "PF Sites settings", rows: [
                    SettingsRow(title: "Payment note", target: .pushed(.paymentNote)),
                    SettingsRow(title: "Quick sale", target: .pushed(.quickSale)),
                    SettingsRow(title: "Carbon copy receipts", target: .pushed(.carbonCopyReceipts)),
                    SettingsRow(title: "Tap to Pay on iPhone", target: .pushed(.tapToPay)),
                ]),
            ]),
            SettingsGroup(id: "services", title: "Services and appointments", bands: [SettingsBand(title: "Global settings", rows: [
                SettingsRow(title: "Appointment booking", target: .native(.appointmentBooking)),
            ])]),
        ]
    }

    /// Business operations, in the order of Clover Go's list in the owner's photo (Taxes and fees, Additional charges, Tips, Business
    /// hours, Devices and printers, then Inventory). "Reporting" and "Accounting Sync" are panels on the website's Settings page.
    private static func operationsRows(owner: Bool) -> [SettingsRow] {
        var rows: [SettingsRow] = [
            SettingsRow(title: "Notification preferences", target: .page("alerts")),
            SettingsRow(title: "Online booking", target: .page("obook")),
            SettingsRow(title: "Customer communication preferences", target: .page("alerts")),
            SettingsRow(title: "Reporting", target: .page("settings")),
            SettingsRow(title: "Accounting Sync", target: .page("settings")),
            SettingsRow(title: "Taxes and fees", target: .page("ordering")),
            SettingsRow(title: "Additional charges", target: .unavailable),
            SettingsRow(title: "Tips", target: .page("ordering")),
            SettingsRow(title: "Business hours", target: .page("hours")),
        ]
        if owner { rows.append(SettingsRow(title: "Devices and printers", target: .page("devices"))) }
        rows.append(SettingsRow(title: "Inventory", target: .native(.inventory)))
        return rows
    }
}
