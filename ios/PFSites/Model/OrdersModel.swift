import Foundation
import Observation

/// One line of a customer's order: what was ordered, how many, the price of one (options included) and the options chosen.
struct CustomerOrderLine: Hashable {
    let name: String
    let qty: Int
    let price: Int
    let options: [String]
    var total: Int { price * qty }

    init(_ json: JSON) {
        name = json["name"].string
        qty = max(0, json["qty"].int)
        price = json["price"].int
        options = json["opts"].array.map { $0.string }.filter { !$0.isEmpty }
    }
}

/// An order from the business's online ordering page, as the server describes it (toOrder in server/app.js).
struct CustomerOrder: Identifiable, Hashable {
    let id: String
    let number: Int
    let status: String       // new, confirmed, ready, completed or cancelled
    let method: String       // pickup, curbside or delivery
    let name: String
    let email: String
    let phone: String
    let address: String
    let vehicle: String
    let notes: String
    let lines: [CustomerOrderLine]
    let subtotal: Int
    let discount: Int
    let promo: String
    let tax: Int
    let fee: Int
    let tip: Int
    let total: Int
    /// The time the customer asked for, on the business's clock ("2026-11-23T15:30"); empty for as soon as possible.
    let scheduled: String
    let createdAt: Date
    let paidAt: Date?
    let paidMethod: String
    let refunded: Int
    let refundNote: String
    let gift: Int            // paid by gift card when ordering
    let giftCode: String     // the card's last four ("…1234")

    init?(_ json: JSON) {
        let id = json["id"].string
        guard !id.isEmpty else { return nil }
        self.id = id
        number = json["number"].int
        status = json["status"].string
        method = json["method"].string
        name = json["name"].string
        email = json["email"].string
        phone = json["phone"].string
        address = json["address"].string
        vehicle = json["vehicle"].string
        notes = json["notes"].string
        lines = json["items"].array.map { CustomerOrderLine($0) }
        subtotal = json["subtotal"].int
        discount = json["discount"].int
        promo = json["promo"].string
        tax = json["tax"].int
        fee = json["fee"].int
        tip = json["tip"].int
        total = json["total"].int
        scheduled = json["scheduled"].string
        createdAt = Date(timeIntervalSince1970: Double(json["createdAt"].int) / 1000)
        paidAt = json["paidAt"].exists && json["paidAt"].int > 0 ? Date(timeIntervalSince1970: Double(json["paidAt"].int) / 1000) : nil
        paidMethod = json["paidMethod"].string
        refunded = json["refunded"].int
        refundNote = json["refundNote"].string
        gift = json["gift"].int
        giftCode = json["giftCode"].string
    }

    /// Open orders are still being made; closed ones are completed or cancelled.
    var isOpen: Bool { status == "new" || status == "confirmed" || status == "ready" }
    var isPaid: Bool { paidAt != nil }
    /// What is paid at the counter: the total, less what a gift card paid when ordering.
    var due: Int { total - gift }

    /// The website's names for the statuses (ORDER_STATUSES), with "ready" named for how the order is collected (readyLabel).
    var statusName: String {
        switch status {
        case "new": return "Received"
        case "confirmed": return "Confirmed"
        case "ready": return method == "delivery" ? "Out for delivery" : method == "curbside" ? "Ready for curbside" : "Ready for pickup"
        case "completed": return "Completed"
        case "cancelled": return "Cancelled"
        default: return status.capitalized
        }
    }

    /// How the customer collects the order (ORDER_METHODS).
    var methodName: String {
        switch method {
        case "pickup": return "Pickup"
        case "curbside": return "Curbside"
        case "delivery": return "Delivery"
        default: return method.capitalized
        }
    }

    var methodSymbol: String {
        switch method {
        case "curbside": return "car"
        case "delivery": return "shippingbox"
        default: return "bag"
        }
    }

    /// The next step, with the button's words, as the website's order sheet offers it.
    var nextStep: (status: String, label: String)? {
        switch status {
        case "new": return ("confirmed", "Confirm order")
        case "confirmed": return ("ready", "Mark ready")
        case "ready": return ("completed", "Complete")
        default: return nil
        }
    }

    var canCancel: Bool { status != "cancelled" && status != "completed" }
    var canRecordPayment: Bool { paidAt == nil && status != "cancelled" }

    /// The pill on the right of the list row.
    var pill: OrderPill {
        if status == "cancelled" { return .cancelled }
        if refunded > 0 { return .refunded }
        return paidAt != nil ? .paid : .notPaid
    }

    /// The payment line's icon: how it was paid, or how it is collected while it is not paid.
    var payOrCollectSymbol: String { isPaid ? Self.tenderSymbol(paidMethod) : methodSymbol }
    var payOrCollectName: String { isPaid ? paidMethod : methodName }

    static func tenderSymbol(_ tender: String) -> String {
        switch tender {
        case "Cash": return "banknote"
        case "Card": return "creditcard"
        case "Online payment": return "globe"
        case "Check": return "doc.text"
        case "Gift card": return "gift"
        default: return "dollarsign.circle"
        }
    }
}

enum OrderPill {
    case paid, notPaid, cancelled, refunded

    var title: String {
        switch self {
        case .paid: return "Paid"
        case .notPaid: return "Not paid"
        case .cancelled: return "Cancelled"
        case .refunded: return "Refunded"
        }
    }
}

/// The periods of the date menu. Days follow the business's own time zone, the way the website's reports do.
enum OrdersRange: String, CaseIterable, Identifiable {
    case today, yesterday, last7, month, last30

    var id: String { rawValue }

    var label: String {
        switch self {
        case .today: return "Today"
        case .yesterday: return "Yesterday"
        case .last7: return "Last 7 days"
        case .month: return "This month"
        case .last30: return "Last 30 days"
        }
    }
}

enum OrdersTab: Hashable {
    case closed, open
}

enum OrderTypeFilter: String, CaseIterable, Identifiable {
    case all, pickup, curbside, delivery

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .pickup: return "Pickup"
        case .curbside: return "Curbside"
        case .delivery: return "Delivery"
        }
    }
}

enum PaymentFilter: String, CaseIterable, Identifiable {
    case all, paid, notPaid

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .paid: return "Paid"
        case .notPaid: return "Not paid"
        }
    }
}

/// The orders of one day, under their grey band.
struct OrderDay: Identifiable {
    let id: String          // the day on the business's calendar, "2026-11-23"
    let title: String       // "Today", "Yesterday" or "Mon, Nov 21"
    let orders: [CustomerOrder]
}

/// The Orders tab: the business's latest 300 orders from the server, narrowed by the date menu, the search field, the filters and
/// the Closed / Open tabs, and the actions the website's order sheet offers. Kept fresh on a timer while it is on screen.
@Observable @MainActor
final class OrdersModel {
    static let tenders = ["Cash", "Card", "Online payment", "Check", "Gift card", "Other"]

    var orders: [CustomerOrder] = []
    var loaded = false
    var loadError = ""
    /// Why the last refresh failed while a list was already showing. The list stays, with one quiet line over it, so orders that
    /// may be out of date are never taken for the latest (staff watch this list for new orders). It goes when a refresh works.
    private(set) var refreshProblem = ""
    var timeZone: TimeZone = TimeZone(identifier: "America/Chicago") ?? .current
    var range: OrdersRange = .today
    var tab: OrdersTab = .closed
    var search = ""
    var typeFilter: OrderTypeFilter = .all
    var paymentFilter: PaymentFilter = .all
    /// Days whose band was tapped closed.
    var collapsed: Set<String> = []

    /// The business's day ("2026-11-23") at the last look. The period, the bands and "Today" are worked out from the clock when the
    /// screen is drawn, so reading this draws it again when the day turns over at the business.
    private(set) var today = ""

    /// Once the person picks a tab it stays; until then the first load opens Open when there is something to do.
    @ObservationIgnored private(set) var tabChosen = false
    /// The first tab is settled (chosen by the app, or tapped by the person). The list is not drawn before that, so it never
    /// shows on one tab and jumps to the other.
    private(set) var tabSettled = false
    @ObservationIgnored private var siteLoadedAt: Date?
    /// The short wait for the business's time zone before the first tab is chosen without it.
    @ObservationIgnored private var zoneWait: Task<Void, Never>?
    /// Counts the lists asked for, the last one shown and the orders changed on this phone, so a list that left the server before a
    /// newer one, or before a change made here, never replaces what is newer.
    @ObservationIgnored private var asked = 0
    @ObservationIgnored private var shown = 0
    @ObservationIgnored private var edits = 0

    var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    var filtersOn: Int { (typeFilter == .all ? 0 : 1) + (paymentFilter == .all ? 0 : 1) }

    // MARK: Loading

    func load(siteID: String) async {
        markDay()
        asked += 1
        let ticket = asked
        do {
            var answer: JSON
            var before: Int
            repeat {
                before = edits
                answer = try await API.get("/api/sites/\(siteID)/orders")
                // An order was changed here while the list was on its way: it may have left the server first, so it is asked for again.
            } while before != edits
            guard ticket > shown else { return }
            shown = ticket
            let list = answer["orders"].array.compactMap { CustomerOrder($0) }
            if list != orders { orders = list }
            if !loaded { loaded = true }
            if !loadError.isEmpty { loadError = "" }
            if !refreshProblem.isEmpty { refreshProblem = "" }
            settleFirstTab()
            AppModel.shared.setOrdersBadge(list.filter { $0.status == "new" }.count)
        } catch let error as APIError {
            if error.status == 401 { AppModel.shared.sessionEnded() }
            // A failed refresh keeps the list it had; the message shows when there is nothing to show, or when this login may not see it.
            if ticket > shown, !loaded || error.status == 403 { loadError = error.message }
            if ticket > shown, loaded, error.status != 401, error.status != 403 { refreshProblem = error.message }
        } catch {
            // Cancelled: the screen went away.
        }
    }

    /// Notes the business's day, so the screen is drawn again when it changes (midnight there, or its time zone arriving).
    private func markDay() {
        let key = dayKey(Date(), calendar: calendar)
        if key != today { today = key }
    }

    /// The business's time zone (ordering.timezone), so "Today" is the business's today. Read again at most once a minute.
    func loadSite(siteID: String, force: Bool = false) async {
        if !force, let at = siteLoadedAt, Date().timeIntervalSince(at) < 60 { return }
        guard let answer = try? await API.get("/api/sites/\(siteID)") else {
            // It could not be read (not merely given up because the screen went away): the first tab is chosen with the day
            // the app has, rather than waited for.
            if !Task.isCancelled { chooseFirstTab() }
            return
        }
        siteLoadedAt = Date()
        let zone = answer["site"]["ordering"]["timezone"].string
        if let found = TimeZone(identifier: zone), found.identifier != timeZone.identifier { timeZone = found }
        chooseFirstTab()
    }

    /// The person tapped a tab: it stays, and nothing is chosen for them any more.
    func tabPicked() {
        tabChosen = true
        zoneWait?.cancel()
        zoneWait = nil
        if !tabSettled { tabSettled = true }
    }

    /// The list is in: the first tab is chosen now when the business's time zone is known, and otherwise once it arrives, for
    /// at most a second (it is asked for beside the list and usually lands with it). With Chicago's day, a business elsewhere,
    /// in the hours when its day and Chicago's differ, settled on Closed with open orders waiting under "Open (2)".
    private func settleFirstTab() {
        guard !tabChosen else { return }
        if siteLoadedAt != nil {
            chooseFirstTab()
            return
        }
        guard zoneWait == nil else { return }
        zoneWait = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            self?.zoneWait = nil
            self?.chooseFirstTab()
        }
    }

    /// The first tab, chosen once the list is in: Open when there is something to do today, else Closed.
    private func chooseFirstTab() {
        guard !tabChosen, loaded else { return }
        zoneWait?.cancel()
        zoneWait = nil
        tabChosen = true
        let first: OrdersTab = counts().open > 0 ? .open : .closed
        if tab != first { tab = first }
        if !tabSettled { tabSettled = true }
    }

    func replace(_ fresh: CustomerOrder) {
        edits += 1
        if let index = orders.firstIndex(where: { $0.id == fresh.id }) {
            orders[index] = fresh
        } else {
            orders.insert(fresh, at: 0)
        }
        AppModel.shared.setOrdersBadge(orders.filter { $0.status == "new" }.count)
    }

    func order(_ id: String) -> CustomerOrder? { orders.first { $0.id == id } }

    // MARK: Actions (the website's order sheet)

    /// Moves an order to its next status, or cancels it. The server checks it again (a payment recorded first must be refunded).
    /// `from` is the status this phone showed: when the order has moved on since (another phone, the website), the server
    /// refuses with its own words and the list loads again, instead of an old screen moving a finished order backwards.
    /// A change that was asked about first (Cancel order) gives the status the order had when the question was put.
    func setStatus(_ order: CustomerOrder, to status: String, from shown: String? = nil, siteID: String) async throws -> CustomerOrder {
        let answer = try await API.post("/api/sites/\(siteID)/orders/\(order.id)", ["status": status, "from": shown ?? order.status])
        guard let fresh = CustomerOrder(answer["order"]) else { throw APIError(status: 0, message: "Something went wrong. Please try again.") }
        replace(fresh)
        return fresh
    }

    /// Records a payment taken at the counter (nothing is charged by this). A gift card needs its code: it pays from its balance.
    /// The app only offers this for an order with no payment, and says so (`unpaid`): if the order was paid elsewhere in the
    /// meantime the server refuses, instead of taking this as a change of how it was paid.
    func recordPayment(_ order: CustomerOrder, tender: String, giftCode: String? = nil, siteID: String) async throws -> CustomerOrder {
        var body: [String: Any] = ["method": tender, "unpaid": true]
        if let giftCode { body["giftCode"] = giftCode }
        let answer = try await API.post("/api/sites/\(siteID)/orders/\(order.id)/payment", body)
        guard let fresh = CustomerOrder(answer["order"]) else { throw APIError(status: 0, message: "Something went wrong. Please try again.") }
        replace(fresh)
        return fresh
    }

    // MARK: What the list shows

    /// The chosen period: its first moment and the moment after its last day, on the business's calendar.
    func span(now: Date = Date()) -> (start: Date, end: Date) {
        // Read so that whatever is drawn from the period is drawn again when the business's day changes.
        _ = self.today
        let calendar = calendar
        let today = calendar.startOfDay(for: now)
        let day = { (offset: Int) -> Date in calendar.date(byAdding: .day, value: offset, to: today) ?? today }
        let first: Date
        switch range {
        case .today: first = today
        case .yesterday: first = day(-1)
        case .last7: first = day(-6)
        case .month: first = calendar.dateInterval(of: .month, for: today)?.start ?? today
        case .last30: first = day(-29)
        }
        let last = range == .yesterday ? first : today
        return (first, calendar.date(byAdding: .day, value: 1, to: last) ?? last.addingTimeInterval(86_400))
    }

    /// The server sends the 300 newest orders. When that many came and the chosen period reaches back past the oldest of them,
    /// the period has older orders this list does not hold: the list says so instead of looking complete.
    var periodIsCutShort: Bool {
        guard orders.count >= 300, let oldest = orders.map(\.createdAt).min() else { return false }
        return span().start < oldest
    }

    var inRange: [CustomerOrder] {
        let period = span()
        return orders.filter { $0.createdAt >= period.start && $0.createdAt < period.end }
    }

    /// The orders of the period that match the search words and the filters, on both tabs.
    var matching: [CustomerOrder] { inRange.filter { matchesSearch($0) && matchesFilters($0) } }

    func counts() -> (closed: Int, open: Int) {
        let list = matching
        let open = list.filter { $0.isOpen }.count
        return (list.count - open, open)
    }

    var days: [OrderDay] {
        let list = matching.filter { tab == .open ? $0.isOpen : !$0.isOpen }
        let calendar = calendar
        var out: [OrderDay] = []
        var current: (key: String, date: Date, orders: [CustomerOrder])?
        for order in list.sorted(by: { $0.createdAt > $1.createdAt }) {
            let key = dayKey(order.createdAt, calendar: calendar)
            if current?.key == key {
                current?.orders.append(order)
            } else {
                if let done = current { out.append(OrderDay(id: done.key, title: dayTitle(done.date), orders: done.orders)) }
                current = (key, order.createdAt, [order])
            }
        }
        if let done = current { out.append(OrderDay(id: done.key, title: dayTitle(done.date), orders: done.orders)) }
        return out
    }

    func matchesSearch(_ order: CustomerOrder) -> Bool {
        let words = search.trimmed
        guard !words.isEmpty else { return true }
        let number = words.hasPrefix("#") ? String(words.dropFirst()) : words
        if !number.isEmpty, String(order.number).contains(number) { return true }
        if order.name.localizedCaseInsensitiveContains(words) || order.email.localizedCaseInsensitiveContains(words) { return true }
        let digits = words.filter { $0.isASCII && $0.isNumber }
        if digits.count >= 3, order.phone.filter({ $0.isASCII && $0.isNumber }).contains(digits) { return true }
        return false
    }

    func matchesFilters(_ order: CustomerOrder) -> Bool {
        if typeFilter != .all && order.method != typeFilter.rawValue { return false }
        switch paymentFilter {
        case .all: return true
        case .paid: return order.isPaid
        case .notPaid: return !order.isPaid
        }
    }

    // MARK: Dates on the business's clock

    private func dayKey(_ date: Date, calendar: Calendar) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    func dayTitle(_ date: Date) -> String {
        let calendar = calendar
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(Date.FormatStyle(timeZone: timeZone).weekday(.abbreviated).month(.abbreviated).day())
    }

    /// The dash between two dates or times, with the thin spaces iOS itself puts around it (the photo's "12:00 AM – 11:59 PM").
    private static let dash = "\u{2009}–\u{2009}"

    /// "Nov 23, 2026", or "Nov 17 – Nov 23, 2026" for a longer period.
    var rangeTitle: String {
        let period = span()
        let last = period.end.addingTimeInterval(-1)
        let full = Date.FormatStyle(timeZone: timeZone).month(.abbreviated).day().year()
        if calendar.isDate(period.start, inSameDayAs: last) { return period.start.formatted(full) }
        let sameYear = calendar.component(.year, from: period.start) == calendar.component(.year, from: last)
        let first = sameYear ? period.start.formatted(Date.FormatStyle(timeZone: timeZone).month(.abbreviated).day()) : period.start.formatted(full)
        return first + Self.dash + last.formatted(full)
    }

    /// "12:00 AM – 11:59 PM", in the phone's way of writing times.
    var rangeTimes: String {
        let start = span().start
        let late = calendar.date(bySettingHour: 23, minute: 59, second: 0, of: start) ?? start.addingTimeInterval(86_340)
        let style = Date.FormatStyle(date: .omitted, time: .shortened, timeZone: timeZone)
        return start.formatted(style) + Self.dash + late.formatted(style)
    }

    func time(_ date: Date) -> String {
        date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: timeZone))
    }

    /// "Nov 23, 2026 at 1:42 PM".
    func dateAndTime(_ date: Date) -> String {
        date.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened, timeZone: timeZone))
    }

    /// The website's slotLabel: "Today 3:30 PM", "Tomorrow 9:00 AM" or "Wed, Nov 25 3:30 PM", on the business's clock.
    func slotLabel(_ value: String) -> String {
        let parts = value.split(whereSeparator: { $0 == "-" || $0 == "T" || $0 == ":" }).compactMap { Int($0) }
        guard parts.count >= 5 else { return value }
        let calendar = calendar
        guard let day = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return value }
        let offset = calendar.dateComponents([.day], from: calendar.startOfDay(for: Date()), to: day).day ?? 0
        let hour = parts[3], minute = parts[4]
        let clock = "\(hour % 12 == 0 ? 12 : hour % 12):\(minute < 10 ? "0" : "")\(minute) \(hour < 12 ? "AM" : "PM")"
        let dayText = offset == 0 ? "Today" : offset == 1 ? "Tomorrow"
            : day.formatted(Date.FormatStyle(timeZone: timeZone).weekday(.abbreviated).month(.abbreviated).day())
        return "\(dayText) \(clock)"
    }
}
