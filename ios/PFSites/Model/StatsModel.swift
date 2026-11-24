import Foundation
import Observation

// The numbers behind Home's "Sales overview" and "Insights" tiles: GET /api/sites/<id>/stats (server/app.js), read the way the
// website's reports read them (public/js/editor.js: CL.sales, CL['r-disc'], insights()). Days are the business's own days, in its
// time zone (site.ordering.timezone), exactly as the server counts them.

// MARK: - Time frames

/// The periods of the Time frame sheet, in the owner's photo's order. "Last 90 days" and "Custom" are asked for as custom dates;
/// the others use the server's own range names.
enum StatsRange: String, CaseIterable, Identifiable {
    case today, yesterday, week, month, last7, last30, last90, custom

    var id: String { rawValue }

    var label: String {
        switch self {
        case .today: return "Today"
        case .yesterday: return "Yesterday"
        case .week: return "This week"
        case .month: return "This month"
        case .last7: return "Last 7 days"
        case .last30: return "Last 30 days"
        case .last90: return "Last 90 days"
        case .custom: return "Custom"
        }
    }
}

/// A chosen time frame: its period, and for Custom the first and last day ("2026-11-01").
struct StatsTimeFrame: Hashable {
    var range: StatsRange
    var from = ""
    var to = ""

    /// The server's limit: the last day at most 731 days after the first.
    static let longest = 731

    /// Which numbers belong to it.
    var key: String { range == .custom ? "custom:\(from):\(to)" : range.rawValue }

    /// The days it covers, worked out the way the server does from the business's today (a week starts on Sunday).
    func days(today: String) -> (from: String, to: String) {
        switch range {
        case .today:
            return (today, today)
        case .yesterday:
            let day = StatsDays.shift(today, by: -1)
            return (day, day)
        case .week:
            return (StatsDays.shift(today, by: -StatsDays.weekday(today)), today)
        case .month:
            return (String(today.prefix(8)) + "01", today)
        case .last7:
            return (StatsDays.shift(today, by: -6), today)
        case .last30:
            return (StatsDays.shift(today, by: -29), today)
        case .last90:
            return (StatsDays.shift(today, by: -89), today)
        case .custom:
            return from <= to ? (from, to) : (to, from)
        }
    }

    /// The query for GET /api/sites/<id>/stats (the transactions route takes the same one).
    func query(today: String) -> String {
        switch range {
        case .last90, .custom:
            let span = days(today: today)
            return "range=custom&from=\(span.from)&to=\(span.to)"
        default:
            return "range=\(range.rawValue)"
        }
    }
}

// MARK: - Days

/// Days on the business's calendar, written "2026-11-24" as the server writes them. Counting and formatting use a UTC Gregorian
/// calendar, so a day stays the same day whatever the phone's own time zone is.
enum StatsDays {
    static let utc = TimeZone(secondsFromGMT: 0) ?? .current

    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar
    }()

    /// The business's today: the date on its own clock right now.
    static func today(in zone: TimeZone, now: Date = Date()) -> String {
        var local = Calendar(identifier: .gregorian)
        local.timeZone = zone
        return string(local.dateComponents([.year, .month, .day], from: now))
    }

    static func string(_ date: Date) -> String {
        string(calendar.dateComponents([.year, .month, .day], from: date))
    }

    private static func string(_ parts: DateComponents) -> String {
        String(format: "%04d-%02d-%02d", parts.year ?? 1970, parts.month ?? 1, parts.day ?? 1)
    }

    /// Midnight UTC of the day, the form the formatters and date pickers here use.
    static func date(_ day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func shift(_ day: String, by count: Int) -> String {
        guard let start = date(day), let moved = calendar.date(byAdding: .day, value: count, to: start) else { return day }
        return string(moved)
    }

    /// 0 for Sunday, as the server's getUTCDay().
    static func weekday(_ day: String) -> Int {
        guard let start = date(day) else { return 0 }
        return calendar.component(.weekday, from: start) - 1
    }

    /// How many days from the first to the last, both counted.
    static func count(from: String, to: String) -> Int {
        guard let first = date(from), let last = date(to) else { return 1 }
        return (calendar.dateComponents([.day], from: first, to: last).day ?? 0) + 1
    }

    private static func style(_ base: Date.FormatStyle) -> Date.FormatStyle {
        var style = base
        style.timeZone = utc
        style.calendar = calendar
        return style
    }

    /// "Nov 24, 2026", or "Nov 22 – 24, 2026" and "Oct 26 – Nov 24, 2026" for longer periods, as in the Time frame photo.
    static func title(from: String, to: String) -> String {
        guard let first = date(from), let last = date(to) else { return "" }
        if from == to { return first.formatted(style(Date.FormatStyle(date: .abbreviated, time: .omitted))) }
        let formatter = DateIntervalFormatter()
        formatter.calendar = calendar
        formatter.timeZone = utc
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: first, to: last)
    }

    /// "12:00 AM – 11:59 PM", in the phone's way of writing times: every period covers whole days.
    static var allDay: String {
        let start = date("2000-01-01") ?? Date(timeIntervalSince1970: 946_684_800)
        let times = style(Date.FormatStyle(date: .omitted, time: .shortened))
        return "\(start.formatted(times)) – \(start.addingTimeInterval(86_340).formatted(times))"
    }

    /// "November 17, 2026".
    static func long(_ day: String) -> String {
        date(day)?.formatted(style(Date.FormatStyle(date: .long, time: .omitted))) ?? day
    }

    /// "November 17".
    static func monthDay(_ day: String) -> String {
        date(day)?.formatted(style(Date.FormatStyle().month(.wide).day())) ?? day
    }

    /// "Tue", under a chart of a week or less.
    static func weekdayShort(_ day: String) -> String {
        date(day)?.formatted(style(Date.FormatStyle().weekday(.abbreviated))) ?? day
    }

    /// "Nov 18", under a chart of a longer period.
    static func shortDay(_ day: String) -> String {
        date(day)?.formatted(style(Date.FormatStyle().month(.abbreviated).day())) ?? day
    }

    /// "Tuesday, November 17", for VoiceOver.
    static func spokenDay(_ day: String) -> String {
        date(day)?.formatted(style(Date.FormatStyle().weekday(.wide).month(.wide).day())) ?? day
    }

    /// "12am", "1pm": the hour names under the Sales Overview chart, as in the photo.
    static func hourLabel(_ hour: Int) -> String {
        "\(hour % 12 == 0 ? 12 : hour % 12)\(hour < 12 ? "am" : "pm")"
    }

    /// "2 PM", in the phone's way of writing an hour.
    static func hourSpoken(_ hour: Int) -> String {
        let start = date("2000-01-01") ?? Date(timeIntervalSince1970: 946_684_800)
        return start.addingTimeInterval(Double(hour) * 3600).formatted(style(Date.FormatStyle().hour()))
    }
}

// MARK: - The report

/// Sales of the period, from orders that were not cancelled (the server's `totals`).
struct StatsTotals {
    let orders: Int
    let gross: Int
    let discounts: Int
    let net: Int
    let tax: Int
    let fees: Int
    let tips: Int
    let total: Int
    let units: Int
    let refunds: Int
    let itemDiscounts: Int
    let itemDiscountLines: Int
    let average: Int
    let cancelled: Int

    init(_ json: JSON) {
        orders = json["orders"].int
        gross = json["gross"].int
        discounts = json["discounts"].int
        net = json["net"].int
        tax = json["tax"].int
        fees = json["fees"].int
        tips = json["tips"].int
        total = json["total"].int
        units = json["units"].int
        refunds = json["refunds"].int
        itemDiscounts = json["itemDiscounts"].int
        itemDiscountLines = json["itemDiscountLines"].int
        average = json["average"].int
        cancelled = json["cancelled"].int
    }
}

/// The same number of days just before the period (the server's `previous`).
struct StatsPrevious {
    let from: String
    let to: String
    let orders: Int
    let net: Int
    let total: Int

    init(_ json: JSON) {
        from = json["from"].string
        to = json["to"].string
        orders = json["orders"].int
        net = json["net"].int
        total = json["total"].int
    }
}

/// One hour ("00" to "23") of a one-day period, or one day ("2026-11-17") of a longer one.
struct StatsBucket {
    let key: String
    let orders: Int
    let net: Int

    init(_ json: JSON) {
        key = json["key"].string
        orders = json["orders"].int
        net = json["net"].int
    }
}

struct StatsItem {
    let name: String
    let qty: Int
    let sales: Int

    init(_ json: JSON) {
        name = json["name"].string
        qty = json["qty"].int
        sales = json["sales"].int
    }
}

struct StatsCategory {
    let name: String
    let sales: Int

    init(_ json: JSON) {
        name = json["name"].string
        sales = json["sales"].int
    }
}

/// How the orders were collected: pickup, curbside or delivery.
struct StatsMethod {
    let method: String
    let orders: Int

    init(_ json: JSON) {
        method = json["method"].string
        orders = json["orders"].int
    }

    /// The website's names (ORDER_METHODS in shared/core.js).
    var name: String {
        switch method {
        case "pickup": return "Pickup"
        case "curbside": return "Curbside"
        case "delivery": return "Delivery"
        default: return method.capitalized
        }
    }
}

/// Orders credited to the person who took each one on (the name the server records, or "Not recorded").
struct StatsEmployee {
    let name: String
    let orders: Int
    let total: Int

    init(_ json: JSON) {
        name = json["name"].string
        orders = json["orders"].int
        total = json["total"].int
    }
}

/// A discount used in the period: a promo code on orders, a sale price on items, or an invoice discount.
struct StatsPromo {
    let uses: Int
    let amount: Int
    let item: Bool
    let invoice: Bool

    init(_ json: JSON) {
        uses = json["uses"].int
        amount = json["amount"].int
        item = json["item"].bool
        invoice = json["invoice"].bool
    }
}

/// Money actually taken and given back in the period, from the money ledger (orders, invoices, appointments, gift cards).
struct StatsMoney {
    let collected: Int
    let refunds: Int
    let count: Int

    init(_ json: JSON) {
        collected = json["collected"].int
        refunds = json["refunds"].int
        count = json["count"].int
    }
}

/// One bar or point of a chart.
struct StatsPoint: Identifiable {
    let id: String
    let cents: Int
    /// The name under the chart: "12am", "Tue" or "Nov 18".
    let label: String
    /// What VoiceOver says for it: "2 PM" or "Tuesday, November 17".
    let spoken: String
}

/// What GET /api/sites/<id>/stats answered for one time frame.
struct StatsReport {
    let key: String
    let from: String
    let to: String
    let today: String
    let days: Int
    let hourly: Bool
    let timeZone: TimeZone?
    let taxRate: Double
    let totals: StatsTotals
    let previous: StatsPrevious
    let series: [StatsBucket]
    let items: [StatsItem]
    let categories: [StatsCategory]
    let methods: [StatsMethod]
    let employees: [StatsEmployee]
    let promos: [StatsPromo]
    let money: StatsMoney
    /// Orders that were not cancelled and had a tip, when the server's list of the period's orders is complete (it sends the
    /// latest 2,000); nil when it may not be.
    let tipOrders: Int?

    init(_ json: JSON, key: String) {
        self.key = key
        from = json["from"].string
        to = json["to"].string
        today = json["today"].string
        days = max(1, json["days"].int)
        hourly = json["unit"].string == "hour"
        timeZone = TimeZone(identifier: json["timezone"].string)
        let rate = json["taxRate"]
        taxRate = (rate.raw as? NSNumber)?.doubleValue ?? Double(rate.string) ?? 0
        totals = StatsTotals(json["totals"])
        previous = StatsPrevious(json["previous"])
        series = json["series"].array.map { StatsBucket($0) }
        items = json["items"].array.map { StatsItem($0) }
        categories = json["categories"].array.map { StatsCategory($0) }
        methods = json["methods"].array.map { StatsMethod($0) }
        employees = json["employees"].array.map { StatsEmployee($0) }
        promos = json["promos"].array.map { StatsPromo($0) }
        money = StatsMoney(json["money"])
        let orders = json["orders"].array
        tipOrders = orders.count < 2000 ? orders.filter { $0["status"].string != "cancelled" && $0["tip"].int > 0 }.count : nil
    }

    /// Every discount, as the website's Discounts report adds them up: on orders, on items (sale prices) and on invoices.
    var discountTotal: Int {
        totals.discounts + totals.itemDiscounts + promos.filter { $0.invoice }.reduce(0) { $0 + $1.amount }
    }

    /// How many times a discount was applied (the same report's count).
    var discountCount: Int {
        promos.filter { !$0.item }.reduce(0) { $0 + $1.uses } + totals.itemDiscountLines
    }

    /// The previous period's average order, worked out like the server's (its total over its orders).
    var previousAverage: Int {
        previous.orders > 0 ? Int((Double(previous.total) / Double(previous.orders)).rounded()) : 0
    }

    /// The words after the change in net sales on Sales Overview: what the server compared the period with.
    var sinceWords: String {
        if days == 1 { return from == today ? "since yesterday" : "since the day before" }
        return "since the previous \(days) days"
    }

    /// The chart's points: every hour of a past day, the hours so far of today, or every day of a longer period.
    func points(now: Date = Date()) -> [StatsPoint] {
        if hourly {
            var last = 23
            if to == today, let zone = timeZone {
                var local = Calendar(identifier: .gregorian)
                local.timeZone = zone
                last = local.component(.hour, from: now)
                // Never hide an hour that has sales, whatever the phone's clock says.
                if let sold = series.last(where: { $0.net != 0 || $0.orders != 0 }), let hour = Int(sold.key) { last = max(last, hour) }
            }
            return series.compactMap { bucket in
                guard let hour = Int(bucket.key), hour <= last else { return nil }
                return StatsPoint(id: bucket.key, cents: bucket.net, label: StatsDays.hourLabel(hour), spoken: StatsDays.hourSpoken(hour))
            }
        }
        let week = series.count <= 7
        return series.map { bucket in
            StatsPoint(id: bucket.key, cents: bucket.net, label: week ? StatsDays.weekdayShort(bucket.key) : StatsDays.shortDay(bucket.key),
                       spoken: StatsDays.spokenDay(bucket.key))
        }
    }

    // MARK: Your business snapshot

    /// The Insights paragraph, written from the numbers by the website's insights() rules: every sentence states something the
    /// numbers show, and nothing else.
    func snapshot() -> String {
        let t = totals
        var said: [String] = []
        let when = from == to ? "On \(StatsDays.long(from))," : "From \(StatsDays.long(from)), to \(StatsDays.long(to)),"
        if t.orders == 0 {
            if t.net == 0 {
                said.append("\(when) your business had no sales.")
            } else {
                said.append("\(when) your business had no orders, and refunds brought net sales to \(Money.format(t.net)).")
            }
        } else {
            said.append("\(when) your business made net sales of \(Money.format(t.net)) from \(StatsFormat.count(t.orders, "order", "orders"))\(comparison).")
            said.append("The average order was \(Money.format(t.average)).")
            let discounts = discountTotal
            let refunded = money.refunds
            switch (discounts > 0, refunded > 0) {
            case (false, false):
                said.append("No refunds or discounts were given.")
            case (true, true):
                said.append("You gave \(Money.format(discounts)) in discounts and refunded \(Money.format(refunded)).")
            case (true, false):
                said.append("You gave \(Money.format(discounts)) in discounts, and no refunds were given.")
            case (false, true):
                said.append("You refunded \(Money.format(refunded)), and no discounts were given.")
            }
            if t.tips > 0 { said.append("Customers added \(Money.format(t.tips)) in tips.") }
            if let busiest { said.append(busiest) }
            if let bestSeller { said.append(bestSeller) }
            if let favouriteWay { said.append(favouriteWay) }
        }
        if t.cancelled > 0 { said.append(t.cancelled == 1 ? "1 order was cancelled." : "\(t.cancelled) orders were cancelled.") }
        return said.joined(separator: " ")
    }

    /// ", up 154% on the previous 7 days", or nothing when there is nothing to compare.
    private var comparison: String {
        let now = totals.net, was = previous.net
        let before = days == 1 ? "the day before" : "the previous \(days) days"
        if was == 0 {
            guard now != 0, previous.orders == 0 else { return "" }
            return days == 1 ? ", with no sales the day before to compare" : ", with no sales in the previous \(days) days to compare"
        }
        if now == was { return ", the same as \(before)" }
        let change = Double(now - was) / Double(abs(was)) * 100
        let whole = Int(abs(change).rounded())
        let way = change > 0 ? "up" : "down"
        return whole == 0 ? ", \(way) less than 1% on \(before)" : ", \(way) \(whole)% on \(before)"
    }

    /// The busiest hour of a day, or the strongest and quietest days of a longer period.
    private var busiest: String? {
        guard var best = series.first, var quiet = series.first else { return nil }
        for bucket in series {
            if bucket.net > best.net { best = bucket }
            if bucket.net < quiet.net { quiet = bucket }
        }
        guard best.net > 0 else { return nil }
        if hourly {
            guard let hour = Int(best.key) else { return nil }
            return "Your busiest hour was \(StatsDays.hourSpoken(hour)), bringing in \(Money.format(best.net))."
        }
        var text = "\(StatsDays.monthDay(best.key)) was your strongest day, bringing in \(Money.format(best.net))"
        if totals.net > 0 && best.net < totals.net {
            text += ", \(Int((Double(best.net) / Double(totals.net) * 100).rounded()))% of your net sales"
        }
        if quiet.key != best.key {
            if quiet.orders == 0 && quiet.net == 0 {
                text += ", while \(StatsDays.monthDay(quiet.key)) had no sales"
            } else {
                text += ", while \(StatsDays.monthDay(quiet.key)) was the quietest at \(Money.format(quiet.net))"
            }
        }
        return text + "."
    }

    /// The item sold most often (the server lists items by how many sold), and the strongest category when there are several.
    private var bestSeller: String? {
        guard let top = items.first, top.qty > 0, !top.name.isEmpty else { return nil }
        var text = "\(top.name) sold \(StatsFormat.count(top.qty, "time", "times")) for \(Money.format(top.sales))"
        if categories.count > 1, let category = categories.first, category.sales > 0, !category.name.isEmpty,
           category.name != "No longer on the menu" {
            text += ". \(category.name) was your strongest category at \(Money.format(category.sales))"
        }
        return text + "."
    }

    /// How most customers ordered.
    private var favouriteWay: String? {
        guard totals.orders > 0 else { return nil }
        var way: StatsMethod?
        for method in methods where method.orders > (way?.orders ?? 0) { way = method }
        guard let way else { return nil }
        return "\(way.name) made up \(Int((Double(way.orders) / Double(totals.orders) * 100).rounded()))% of orders."
    }
}

// MARK: - Changes and words

/// How a figure moved against the previous period: "▲ 12%" on Sales Overview, "↑ 154.48%" on Insights.
struct StatsChange: Equatable {
    enum Direction {
        case up, down, flat
    }

    let direction: Direction
    let text: String

    /// nil when there is nothing to say: both periods at zero on Sales Overview (the website shows nothing then either).
    /// A period after one at zero is "New", as on the website.
    static func of(_ now: Int, _ was: Int, decimals: Int) -> StatsChange? {
        if was == 0 {
            if now == 0 { return decimals > 0 ? StatsChange(direction: .flat, text: percent(0, decimals: decimals)) : nil }
            return StatsChange(direction: now > 0 ? .up : .down, text: "New")
        }
        let change = Double(now - was) / Double(abs(was)) * 100
        let scale = pow(10, Double(decimals))
        let rounded = (change * scale).rounded() / scale
        if rounded == 0 { return StatsChange(direction: .flat, text: percent(0, decimals: decimals)) }
        return StatsChange(direction: rounded > 0 ? .up : .down, text: percent(abs(rounded), decimals: decimals))
    }

    private static func percent(_ value: Double, decimals: Int) -> String {
        value.formatted(.number.precision(.fractionLength(decimals))) + "%"
    }
}

enum StatsFormat {
    /// "1 order", "16 orders".
    static func count(_ value: Int, _ one: String, _ many: String) -> String {
        "\(value) \(value == 1 ? one : many)"
    }

    /// A chart's amount the way the website's chart writes it: "$0", "$1,250", "$12.50".
    static func chartMoney(_ cents: Int) -> String {
        let text = Money.format(cents)
        return text.hasSuffix(".00") ? String(text.dropLast(3)) : text
    }

    /// "$12.5K", "$1.2M": a chart's amount when the whole one would not fit over its bar.
    static func compactMoney(_ cents: Int) -> String {
        let dollars = Double(abs(cents)) / 100
        let sign = cents < 0 ? "−" : ""
        let short = { (value: Double) in value.formatted(.number.precision(.fractionLength(0...1))) }
        if dollars >= 1_000_000 { return "\(sign)$\(short(dollars / 1_000_000))M" }
        if dollars >= 1_000 { return "\(sign)$\(short(dollars / 1_000))K" }
        return "\(sign)$\(Int(dollars.rounded()))"
    }

    /// "8.25%" for a tax rate.
    static func rate(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...3))) + "%"
    }
}

// MARK: - Loading

/// One screen's time frame and its numbers. Sales Overview and Insights each have one, kept while the business is open
/// (StatsChoices), so each screen comes back to the time frame chosen there.
@Observable @MainActor
final class StatsModel {
    enum Screen: Hashable {
        case salesOverview, insights
    }

    let screen: Screen
    /// The chosen time frame. Changing it loads its numbers (the screens reload when it changes).
    var frame: StatsTimeFrame
    private(set) var report: StatsReport?
    /// Refunds from the money ledger for Sales Overview's Refunds card (GET /api/sites/<id>/transactions), for `ledgerKey`.
    private(set) var refundCount: Int?
    private(set) var refundTotal: Int?
    private(set) var ledgerKey = ""
    private(set) var problem = ""
    private(set) var problemKey = ""
    /// The business's time zone (site.ordering.timezone), so "Today" and "Last 90 days" are the business's days.
    private(set) var zone: TimeZone?

    init(screen: Screen) {
        self.screen = screen
        // Sales Overview opens on Today, as in its photo; Insights on the last 7 days, as the website's Insights page does.
        frame = StatsTimeFrame(range: screen == .insights ? .last7 : .today)
    }

    /// The numbers for the chosen time frame, or nil while they load.
    var current: StatsReport? {
        guard let report, report.key == frame.key else { return nil }
        return report
    }

    /// Why the chosen time frame's numbers could not be shown, when that is the case.
    var currentProblem: String? {
        guard problemKey == frame.key, !problem.isEmpty else { return nil }
        return problem
    }

    /// The Refunds card's count and amount from the ledger, when they were loaded with the numbers shown.
    var ledgerRefunds: (count: Int, total: Int)? {
        guard ledgerKey == frame.key, let refundCount, let refundTotal else { return nil }
        return (refundCount, refundTotal)
    }

    /// The business's date right now.
    var businessToday: String {
        if let zone { return StatsDays.today(in: zone) }
        if let report, !report.today.isEmpty { return report.today }
        return StatsDays.today(in: .current)
    }

    /// Loads the chosen time frame's numbers. A failed refresh keeps numbers already shown for the same time frame; the message
    /// shows when there is nothing to show, or when this login may not see them (403, never a sign-out).
    func load(siteID: String) async {
        let asked = self.frame
        if asked.range == .last90 && zone == nil { await loadZone(siteID: siteID) }
        let today = businessToday
        let span = asked.days(today: today)
        let query = asked.query(today: today)
        // The refunds count comes from the ledger's list, which grows with the period: only asked for up to about three months.
        let wantsLedger = screen == .salesOverview && StatsDays.count(from: span.from, to: span.to) <= 92
        let ledgerPath: String? = wantsLedger ? "/api/sites/\(siteID)/transactions?\(query)" : nil
        async let ledger = StatsModel.quietly(ledgerPath)
        do {
            let answer = try await API.get("/api/sites/\(siteID)/stats?\(query)")
            let refunds = await ledger
            guard asked == self.frame else { return }
            let fresh = StatsReport(answer, key: asked.key)
            if let found = fresh.timeZone, found.identifier != zone?.identifier { zone = found }
            report = fresh
            if let refunds, refunds["totals"].isObject {
                refundCount = refunds["totals"]["refundCount"].int
                refundTotal = refunds["totals"]["refunds"].int
                ledgerKey = asked.key
            } else {
                refundCount = nil
                refundTotal = nil
                ledgerKey = ""
            }
            problem = ""
            problemKey = ""
        } catch let error as APIError {
            guard asked == self.frame else { return }
            if error.status == 401 { AppModel.shared.sessionEnded() }
            if error.status == 403 { report = nil }
            if current == nil {
                problem = error.message
                problemKey = asked.key
            }
        } catch {
            // Cancelled: the screen went away, or another time frame was chosen.
        }
    }

    /// Reads the business's time zone (GET /api/sites/<id>).
    func loadZone(siteID: String) async {
        guard let answer = try? await API.get("/api/sites/\(siteID)") else { return }
        if let found = TimeZone(identifier: answer["site"]["ordering"]["timezone"].string) { zone = found }
    }

    private nonisolated static func quietly(_ path: String?) async -> JSON? {
        guard let path else { return nil }
        return try? await API.get(path)
    }
}

/// Each screen's StatsModel while one business is open. The app makes a new dashboard (a new shell ID) for each business it opens,
/// and the choices start again with it, like the rest of the dashboard's state (Shell).
@MainActor
final class StatsChoices {
    static let shared = StatsChoices()

    private var shellID: UUID?
    private var models: [StatsModel.Screen: StatsModel] = [:]

    func model(_ screen: StatsModel.Screen, shellID: UUID) -> StatsModel {
        if self.shellID != shellID {
            self.shellID = shellID
            models = [:]
        }
        if let found = models[screen] { return found }
        let made = StatsModel(screen: screen)
        models[screen] = made
        return made
    }
}
