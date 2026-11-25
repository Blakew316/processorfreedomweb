import Foundation
import Observation

/// A day on the business's own calendar ("2026-11-24"), the way the stats route and the website count days.
/// Arithmetic is done at noon UTC on a Gregorian calendar, so no clock change can move a day.
struct ItemSalesDay: Hashable, Comparable {
    let year: Int
    let month: Int
    let day: Int

    private static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? TimeZone.current
        return calendar
    }()

    init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    /// "2026-11-24", as the server writes days.
    init?(_ text: String) {
        let parts = text.split(separator: "-")
        guard parts.count == 3, let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
              (1...12).contains(month), (1...31).contains(day) else { return nil }
        self.init(year: year, month: month, day: day)
    }

    /// The day a moment falls on at the business (its clock in its time zone).
    static func on(_ moment: Date, in zone: TimeZone) -> ItemSalesDay {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.year, .month, .day], from: moment)
        return ItemSalesDay(year: parts.year ?? 2026, month: parts.month ?? 1, day: parts.day ?? 1)
    }

    /// Today at the business.
    static func today(in zone: TimeZone) -> ItemSalesDay { on(Date(), in: zone) }

    /// "2026-11-24".
    var text: String { "\(Self.padded(year, 4))-\(Self.padded(month, 2))-\(Self.padded(day, 2))" }

    private static func padded(_ value: Int, _ width: Int) -> String {
        let digits = String(value)
        return digits.count >= width ? digits : String(repeating: "0", count: width - digits.count) + digits
    }

    /// Noon UTC on this day: what the formatters and the arithmetic work on.
    var noon: Date {
        Self.utc.date(from: DateComponents(year: year, month: month, day: day, hour: 12)) ?? Date(timeIntervalSince1970: 0)
    }

    /// Noon on this day at the business, for the date pickers (which show days in the business's time zone).
    func noonDate(in zone: TimeZone) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12)) ?? noon
    }

    func adding(_ days: Int) -> ItemSalesDay {
        guard let moved = Self.utc.date(byAdding: .day, value: days, to: noon) else { return self }
        let parts = Self.utc.dateComponents([.year, .month, .day], from: moved)
        return ItemSalesDay(year: parts.year ?? year, month: parts.month ?? month, day: parts.day ?? day)
    }

    /// How many days later another day is (negative when it is earlier).
    func days(to other: ItemSalesDay) -> Int {
        Self.utc.dateComponents([.day], from: noon, to: other.noon).day ?? 0
    }

    /// 0 for Sunday to 6 for Saturday, as the website's and the server's weeks count them (getUTCDay).
    var weekday: Int { Self.utc.component(.weekday, from: noon) - 1 }

    var firstOfMonth: ItemSalesDay { ItemSalesDay(year: year, month: month, day: 1) }

    static func < (a: ItemSalesDay, b: ItemSalesDay) -> Bool {
        if a.year != b.year { return a.year < b.year }
        if a.month != b.month { return a.month < b.month }
        return a.day < b.day
    }
}

/// The periods of the report's date drop-down, in the photo's order.
enum ItemSalesPeriod: String, CaseIterable, Identifiable {
    case today, yesterday, thisWeek, lastWeek, last7, thisMonth, lastMonth, last30, last90, custom

    var id: String { rawValue }

    var label: String {
        switch self {
        case .today: return "Today"
        case .yesterday: return "Yesterday"
        case .thisWeek: return "This week"
        case .lastWeek: return "Last week"
        case .last7: return "Last 7 days"
        case .thisMonth: return "This month"
        case .lastMonth: return "Last month"
        case .last30: return "Last 30 days"
        case .last90: return "Last 90 days"
        case .custom: return "Custom"
        }
    }

    /// The stats route's own range key (server/app.js). The periods it has no key for are sent as custom days.
    var serverKey: String? {
        switch self {
        case .today: return "today"
        case .yesterday: return "yesterday"
        case .thisWeek: return "week"
        case .last7: return "last7"
        case .thisMonth: return "month"
        case .last30: return "last30"
        case .lastWeek, .lastMonth, .last90, .custom: return nil
        }
    }
}

/// The report's one working filter: how the orders were collected (shared/core.js ORDER_METHODS), or all of them.
enum ItemSalesOrderType: String, CaseIterable, Identifiable {
    case all, pickup, curbside, delivery

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All Order Types"
        case .pickup: return "Pickup"
        case .curbside: return "Curbside"
        case .delivery: return "Delivery"
        }
    }

    /// The stats route's `type`: the order method's key, or none for all of them.
    var serverValue: String? { self == .all ? nil : rawValue }
}

/// One item of the report: what the stats route answers for it (name, category, qty, sales), and its share of all item sales.
struct ItemSalesRow: Identifiable, Hashable {
    let name: String
    let category: String
    let qty: Int
    /// Net sales in cents: what the item brought in after discounts and refunds.
    let sales: Int
    /// Whole percent of all the items' net sales, rounded the way the website rounds it.
    let percent: Int

    /// The server adds up items by name, so a name is one row.
    var id: String { name }
}

/// What the report is narrowed to: the period (with its days when it is custom) and the order type.
struct ItemSalesChoices: Equatable {
    var period: ItemSalesPeriod = .today
    /// The days of a custom period: picked, or reached with ‹ and ›.
    var from: ItemSalesDay? = nil
    var to: ItemSalesDay? = nil
    var orderType: ItemSalesOrderType = .all
}

/// The report's choices are kept while the business is open: the app makes a new dashboard (a new shell ID) for each business it
/// opens or signs in to, and the report then starts again on Today with all order types, like the rest of the dashboard.
@MainActor
enum ItemSalesKeeper {
    private static var shellID: UUID? = nil
    private static var kept = ItemSalesChoices()

    static func choices(for shellID: UUID) -> ItemSalesChoices {
        self.shellID == shellID ? kept : ItemSalesChoices()
    }

    static func keep(_ choices: ItemSalesChoices, for shellID: UUID) {
        self.shellID = shellID
        kept = choices
    }
}

/// Days and money written the way the website's reports write them.
enum ItemSalesFormat {
    private static let utc = TimeZone(secondsFromGMT: 0) ?? TimeZone.current

    /// "Tue, Nov 24, 2026".
    static func longDay(_ day: ItemSalesDay) -> String {
        day.noon.formatted(Date.FormatStyle(calendar: Calendar(identifier: .gregorian), timeZone: utc).weekday(.abbreviated).month(.abbreviated).day().year())
    }

    /// "Nov 23, 2026": the drop-down's name for a custom period of one day.
    static func shortDay(_ day: ItemSalesDay) -> String {
        day.noon.formatted(Date.FormatStyle(calendar: Calendar(identifier: .gregorian), timeZone: utc).month(.abbreviated).day().year())
    }

    /// Money as a plain number a spreadsheet can add up ("1234.50", "-5.00"), as the website's exports write it.
    static func number(_ cents: Int) -> String {
        let value = abs(cents)
        let rest = value % 100
        return (cents < 0 ? "-" : "") + String(value / 100) + "." + (rest < 10 ? "0" : "") + String(rest)
    }
}

/// CSV files the way the website writes them (saveSheetFile in public/js/ui.js): a byte-order mark, every cell in quotes, lines
/// ending CR LF. Each goes in its own folder in the same temporary Downloads folder as the app's other downloads (removed when its
/// share sheet closes, and with the rest when the dashboard closes), so the file keeps its name and never overwrites another.
enum ItemSalesFile {
    static func csv(_ rows: [[String]]) -> String {
        "\u{FEFF}" + rows.map { row in
            row.map { "\"" + $0.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }.joined(separator: ",")
        }.joined(separator: "\r\n")
    }

    static func write(name: String, rows: [[String]]) throws -> URL {
        let folder = try DownloadCenter.newFolder()
        let cleaned = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-").trimmed
        let file = folder.appendingPathComponent(String((cleaned.isEmpty ? "report" : cleaned).prefix(116)) + ".csv")
        try Data(csv(rows).utf8).write(to: file, options: .atomic)
        return file
    }
}

/// The Items sales report (Home → Items sales report): the business's items for a period from GET /api/sites/<id>/stats, worded and
/// worked out like the website's Item sales report (public/js/editor.js CL['r-items']), with its periods, ‹ and › and order type.
@Observable @MainActor
final class ItemSalesModel {
    /// The website's sentence under "No results found" on this report (NORES in public/js/editor.js).
    static let noResults = "Try again with a different timeframe, filters or search criteria."
    /// The website's name for this report and its words about it (nameOf('r-items') and ABOUT['r-items'] in public/js/editor.js).
    static let aboutTitle = "Item and Service sales"
    static let about = "How many of each item sold and what it brought in."
    /// The most days the stats route takes between the first and the last day of a custom period, and its words past that.
    static let longestRange = 731
    static let tooLong = "Choose a range of two years or less."

    private(set) var choices: ItemSalesChoices
    /// The items of the period, best sellers by net sales first.
    private(set) var rows: [ItemSalesRow] = []
    /// Why the report for the current choices did not load (the server's own words), when nothing is shown for them.
    private(set) var problem = ""
    /// This login may not see reports: the words stay, and trying again would not help.
    private(set) var forbidden = false
    /// The business's time zone (ordering.timezone): "Today" is the business's today.
    private(set) var zone: TimeZone = TimeZone(identifier: "America/Chicago") ?? TimeZone.current
    private(set) var slug = ""
    private(set) var businessName = ""
    /// The business's people (GET /api/sites/<id>/shifts: the owner and the team), for the Employees filter.
    private(set) var people: [String] = []
    /// The request the rows answer; nil while nothing has come in for the current choices.
    private(set) var shownQuery: String? = nil
    /// The days the server answered for, which the date line shows once they come.
    private var answeredFrom: ItemSalesDay? = nil
    private var answeredTo: ItemSalesDay? = nil

    private let shellID: UUID
    @ObservationIgnored private var siteLoadedAt: Date? = nil

    init(shellID: UUID) {
        self.shellID = shellID
        choices = ItemSalesKeeper.choices(for: shellID)
    }

    // MARK: The period

    var today: ItemSalesDay { ItemSalesDay.today(in: zone) }

    /// The first and last day of the chosen period on the business's calendar. Weeks start on Sunday, as the website's and the
    /// server's This week do.
    var span: (from: ItemSalesDay, to: ItemSalesDay) {
        let now = today
        switch choices.period {
        case .today:
            return (now, now)
        case .yesterday:
            let day = now.adding(-1)
            return (day, day)
        case .thisWeek:
            return (now.adding(-now.weekday), now)
        case .lastWeek:
            let start = now.adding(-now.weekday)
            return (start.adding(-7), start.adding(-1))
        case .last7:
            return (now.adding(-6), now)
        case .thisMonth:
            return (now.firstOfMonth, now)
        case .lastMonth:
            let end = now.firstOfMonth.adding(-1)
            return (end.firstOfMonth, end)
        case .last30:
            return (now.adding(-29), now)
        case .last90:
            return (now.adding(-89), now)
        case .custom:
            guard let from = choices.from, let to = choices.to else { return (now, now) }
            if to < from { return (to, from) }
            return (from, to)
        }
    }

    /// What is asked of the stats route for the current choices.
    var query: String {
        var parts: [String]
        if let key = choices.period.serverKey {
            parts = ["range=\(key)"]
        } else {
            let days = span
            parts = ["range=custom", "from=\(days.from.text)", "to=\(days.to.text)"]
        }
        if let type = choices.orderType.serverValue { parts.append("type=\(Config.query(type))") }
        return parts.joined(separator: "&")
    }

    /// The rows on screen answer the current choices.
    var isCurrent: Bool { shownQuery == query }

    /// The days the date line shows: the server's answer for the rows on screen, or the chosen period until it comes.
    var shownSpan: (from: ItemSalesDay, to: ItemSalesDay) {
        if isCurrent, let from = answeredFrom, let to = answeredTo { return (from, to) }
        return span
    }

    /// The drop-down's words: the period's name, or for custom days the day ("Nov 23, 2026") or "Custom", as the website names them.
    var fieldLabel: String {
        guard choices.period == .custom else { return choices.period.label }
        let days = span
        return days.from == days.to ? ItemSalesFormat.shortDay(days.from) : ItemSalesPeriod.custom.label
    }

    /// "Tue, Nov 24, 2026 at 12:00 AM - 11:59 PM" for one day, as in the photo; the first and last day for longer periods, as the
    /// website writes them.
    var rangeLine: String {
        let days = shownSpan
        if days.from == days.to { return "\(ItemSalesFormat.longDay(days.from)) at 12:00 AM - 11:59 PM" }
        return "\(ItemSalesFormat.longDay(days.from)) - \(ItemSalesFormat.longDay(days.to))"
    }

    /// › is greyed once the period ends today.
    var canStepLater: Bool { shownSpan.to < today }

    /// How many filters are on, for the count on the Filters button (the website's `.fbtn em`).
    var filtersOn: Int { choices.orderType == .all ? 0 : 1 }

    // MARK: Choosing

    func choose(_ period: ItemSalesPeriod) {
        guard period != .custom else { return }
        var next = choices
        next.period = period
        next.from = nil
        next.to = nil
        set(next)
    }

    /// Custom days from the date pickers, in order. The server takes at most 731 days between them.
    func chooseCustom(from: ItemSalesDay, to: ItemSalesDay) {
        var next = choices
        next.period = .custom
        next.from = min(from, to)
        next.to = max(from, to)
        set(next)
    }

    /// ‹ and ›: the period moves by its own length, and never past today (cDates in public/js/editor.js).
    func step(_ direction: Int) {
        let days = shownSpan, now = today
        let length = days.from.days(to: days.to) + 1
        var from = days.from.adding(direction * length)
        var to = days.to.adding(direction * length)
        if to > now {
            to = now
            from = now.adding(1 - length)
        }
        var next = choices
        next.period = .custom
        next.from = from
        next.to = to
        set(next)
    }

    func chooseOrderType(_ type: ItemSalesOrderType) {
        var next = choices
        next.orderType = type
        set(next)
    }

    /// New choices: what was on screen was for the old ones, so it goes until the new report comes.
    private func set(_ next: ItemSalesChoices) {
        guard next != choices else { return }
        choices = next
        rows = []
        shownQuery = nil
        answeredFrom = nil
        answeredTo = nil
        problem = ""
        forbidden = false
        ItemSalesKeeper.keep(next, for: shellID)
    }

    // MARK: Loading

    /// Try again was tapped after the report did not load: the words go, so the spinner shows until the new answer comes.
    func clearProblem() {
        problem = ""
        forbidden = false
    }

    /// The business's time zone, web address name and name (GET /api/sites/<id>), at most once a minute unless forced.
    func loadSite(siteID: String, force: Bool = false) async {
        guard !siteID.isEmpty else { return }
        if !force, let at = siteLoadedAt, Date().timeIntervalSince(at) < 60 { return }
        guard let answer = try? await API.get("/api/sites/\(siteID)") else { return }
        siteLoadedAt = Date()
        let site = answer["site"]
        if let found = TimeZone(identifier: site["ordering"]["timezone"].string), found.identifier != zone.identifier { zone = found }
        if !site["slug"].string.isEmpty { slug = site["slug"].string }
        if !site["name"].string.isEmpty { businessName = site["name"].string }
    }

    /// The report for the current choices. Its answer is used only if the choices are still the same when it comes. A refresh that
    /// does not work while the rows for these choices stay on screen gives back the server's words for a short message.
    @discardableResult
    func load(siteID: String) async -> String? {
        guard !siteID.isEmpty else { return nil }
        let asked = query
        do {
            let answer = try await API.get("/api/sites/\(siteID)/stats?\(asked)")
            guard asked == query else { return nil }
            show(answer, for: asked)
            return nil
        } catch let error as APIError {
            guard asked == query else { return nil }
            // Signed out everywhere, or the server ended the session: the app checks, then locks. A 403 is only a message.
            if error.status == 401 { AppModel.shared.sessionEnded() }
            if error.status != 403 && shownQuery == asked { return error.status == 401 ? nil : error.message }
            rows = []
            shownQuery = nil
            forbidden = error.status == 403
            problem = error.message
            return nil
        } catch {
            // Cancelled: the screen went away, or the choices changed and their own report is on its way.
            return nil
        }
    }

    private func show(_ answer: JSON, for asked: String) {
        let items = answer["items"].array
        let total = items.reduce(0) { sum, item in sum + item["sales"].int }
        let made = items.map { (item: JSON) -> ItemSalesRow in
            let sales = item["sales"].int
            // Math.round, as the website rounds it: halves go up.
            let share = total != 0 ? Int((Double(sales) / Double(total) * 100 + 0.5).rounded(.down)) : 0
            return ItemSalesRow(name: item["name"].string, category: item["category"].string, qty: item["qty"].int, sales: sales, percent: share)
        }
        rows = made.sorted { (a: ItemSalesRow, b: ItemSalesRow) -> Bool in
            if a.sales != b.sales { return a.sales > b.sales }
            if a.qty != b.qty { return a.qty > b.qty }
            return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
        }
        answeredFrom = ItemSalesDay(answer["from"].string)
        answeredTo = ItemSalesDay(answer["to"].string)
        shownQuery = asked
        problem = ""
        forbidden = false
        // The report says which time zone it counted days in; a period worked out here follows it.
        if let found = TimeZone(identifier: answer["timezone"].string), found.identifier != zone.identifier { zone = found }
    }

    /// Everyone at the business, for the Employees filter: the owner and the team, as the Shifts page lists them. Asked for each time
    /// the Filters panel opens, so someone added on the website shows; the names shown stay until the answer comes, and when it
    /// does not come.
    func loadPeople(siteID: String) async {
        guard !siteID.isEmpty, let answer = try? await API.get("/api/sites/\(siteID)/shifts") else { return }
        var seen = Set<String>()
        let names = answer["people"].array.map { $0.string.trimmed }.filter { !$0.isEmpty && seen.insert($0).inserted }
        people = names.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    // MARK: Print, export and accounting sync, as the website's ⋮ menu does them

    private func slugPart(_ siteName: String) -> String {
        if !slug.isEmpty { return slug }
        let joined = siteName.lowercased().split(whereSeparator: { !($0.isASCII && ($0.isLetter || $0.isNumber)) }).joined(separator: "-")
        return joined.isEmpty ? "report" : joined
    }

    private func name(_ siteName: String) -> String { businessName.isEmpty ? siteName : businessName }

    /// The report as the website's "Export to Excel or CSV" writes it as CSV (pageRows and exportReport in public/js/editor.js):
    /// the report's name, the business, the period and when it was exported, then the table with money as plain numbers.
    func exportFile(siteName: String) throws -> URL {
        let days = shownSpan
        let period = days.from == days.to ? days.from.text : days.from.text + " to " + days.to.text
        let exported = Date().formatted(date: .numeric, time: .standard)
        var lines: [[String]] = [
            [Self.aboutTitle],
            [name(siteName)],
            ["Period: " + period],
            ["Exported " + exported],
            [],
        ]
        if !rows.isEmpty {
            lines.append(["Item", "Category", "Sold", "Net sales", "% of sales"])
            for row in rows {
                lines.append([row.name, row.category, String(row.qty), ItemSalesFormat.number(row.sales), "\(row.percent)%"])
            }
            lines.append([])
        }
        let fileName = Self.aboutTitle.lowercased().split(whereSeparator: { !($0.isASCII && ($0.isLetter || $0.isNumber)) }).joined(separator: "-")
        return try ItemSalesFile.write(name: "\(slugPart(siteName))-\(fileName)-\(today.text)", rows: lines)
    }

    /// What the website's "Sync with QuickBooks" downloads (quickbooks() in public/js/editor.js): the period's payments and refunds
    /// as the Date, Description and Amount columns QuickBooks Online reads. Nil when the period has none.
    func quickBooksFile(siteID: String, siteName: String) async throws -> (file: URL, count: Int)? {
        let answer = try await API.get("/api/sites/\(siteID)/transactions?\(query)")
        let usDay = { (day: String) -> String in
            let parts = day.split(separator: "-")
            return parts.count == 3 ? "\(parts[1])/\(parts[2])/\(parts[0])" : day
        }
        let who = { (row: JSON) -> String in row["customer"].string.isEmpty ? "Customer" : row["customer"].string }
        var lines: [[String]] = [["Date", "Description", "Amount"]]
        for row in answer["payments"].array {
            lines.append([usDay(row["date"].string), "\(row["source"].string) \(row["ref"].string) · \(who(row)) · \(row["method"].string)", ItemSalesFormat.number(row["amount"].int)])
        }
        for row in answer["refunds"].array {
            lines.append([usDay(row["date"].string), "Refund \(row["ref"].string) · \(who(row)) · \(row["method"].string)", ItemSalesFormat.number(-row["amount"].int)])
        }
        guard lines.count > 1 else { return nil }
        let file = try ItemSalesFile.write(name: "\(slugPart(siteName))-quickbooks-\(answer["from"].string)-to-\(answer["to"].string)", rows: lines)
        return (file, lines.count - 1)
    }

    /// The report on white paper, for AirPrint (the website prints its report page in its light colours).
    func printPage(siteName: String) -> String {
        func escaped(_ text: String) -> String {
            text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
        }
        var body = "<p class=\"k\">Reports</p><h1>Item sales</h1>"
        body += "<p class=\"m\">\(escaped(name(siteName)))</p><p class=\"d\">\(escaped(rangeLine))</p>"
        if choices.orderType != .all { body += "<p class=\"m\">Order type: \(escaped(choices.orderType.label))</p>" }
        if rows.isEmpty {
            body += "<p class=\"e\"><b>No results found</b><br>\(escaped(Self.noResults))</p>"
        } else {
            body += "<table><thead><tr><th>Item</th><th>Category</th><th class=\"n\">Sold</th><th class=\"n\">Net sales</th><th class=\"n\">% of sales</th></tr></thead><tbody>"
            for row in rows {
                body += "<tr><td><b>\(escaped(row.name))</b></td><td>\(escaped(row.category))</td><td class=\"n\">\(row.qty)</td>"
                body += "<td class=\"n\">\(escaped(Money.format(row.sales)))</td><td class=\"n\">\(row.percent)%</td></tr>"
            }
            body += "</tbody></table>"
        }
        let style = """
        body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#000;font-size:11pt}
        .k{color:#4D4D4D;margin:0 0 2pt}h1{font-size:20pt;margin:0 0 6pt}.m{margin:0 0 2pt}.d{font-weight:600;margin:6pt 0 14pt}
        table{width:100%;border-collapse:collapse}th{text-align:left;color:#4D4D4D;font-weight:600;border-bottom:1pt solid #999;padding:5pt 4pt}
        td{border-bottom:0.5pt solid #ccc;padding:5pt 4pt;vertical-align:top}.n{text-align:right;white-space:nowrap}.e{margin-top:24pt}
        """
        return "<!doctype html><html><head><meta charset=\"utf-8\"><style>\(style)</style></head><body>\(body)</body></html>"
    }
}
