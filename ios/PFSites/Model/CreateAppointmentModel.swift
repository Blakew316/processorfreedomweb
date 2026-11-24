import Foundation
import Observation

// MARK: - What the form works with

/// A bookable service of the business: site.ordering.booking.services (shared/core.js normalizeOrdering), in the server's order.
struct CreateAppointmentOffer: Identifiable, Hashable {
    /// Its place in the list (two services may share a name).
    let id: Int
    let name: String
    let minutes: Int
    /// In cents.
    let price: Int

    /// "Haircut · 30 min", as the website's Service list writes it.
    var title: String { minutes > 0 ? "\(name) · \(minutes) min" : name }
}

/// One day of the business hours (site.ordering.hours, Sunday first), in minutes after midnight.
struct CreateAppointmentDayHours: Hashable {
    let closed: Bool
    let open: Int
    let close: Int
}

/// Someone from GET /api/sites/<id>/customers: everyone who has ordered, and the customers the business saved.
struct CreateAppointmentCustomer: Identifiable, Hashable {
    /// Its place in the server's list.
    let id: Int
    let name: String
    let email: String
    let phone: String
}

/// An item of the business's menu (GET /api/sites/<id>/menu), priced the way the website prices it (itemPrice in shared/core.js).
struct CreateAppointmentItem: Identifiable, Hashable {
    let id: String
    let name: String
    /// In cents, after the item's sale percentage. A variable-price item has its price asked for instead.
    let price: Int
    let variable: Bool
    let taxable: Bool
}

/// One service of the appointment, as typed (the website's svcCard: the service, its price as text, and who it is with).
struct CreateAppointmentService: Identifiable, Hashable {
    let id = UUID()
    /// The chosen service's name, or the typed "What for" when the business has no bookable services.
    var name = ""
    /// As typed ("25.00"); empty reads as $0, as on the website.
    var price = ""
    /// A team member's name; empty is "Any available".
    var employee = ""
}

/// An item added to the appointment, from the menu or typed in (the website's d.lines).
struct CreateAppointmentLine: Identifiable, Hashable {
    let id = UUID()
    let name: String
    /// In cents, for one.
    let price: Int
    var qty: Int
    let taxable: Bool
}

/// The cards of the form that open and close.
enum CreateAppointmentSection: Hashable {
    case customer, details, payment, notes, history
}

// MARK: - Days, times and prices the way the website reads them

/// Days and times on the business's own clock. The form keeps them as the server takes them ("2026-11-24", "15:30"); the pickers
/// show them through UTC dates, so what is picked is exactly the business's day and time, whatever the iPhone's own time zone.
enum CreateAppointmentClock {
    static let utc = TimeZone(secondsFromGMT: 0) ?? .current
    /// The server's default when a business has not chosen one (defaultOrdering in shared/core.js).
    static let serverDefault = TimeZone(identifier: "America/Chicago") ?? .current

    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar
    }()

    static func pad(_ value: Int) -> String { value < 10 ? "0\(value)" : String(value) }

    /// The business's day and the minutes past its midnight right now (the website's bizWall).
    static func wall(in zone: TimeZone, at now: Date = Date()) -> (day: String, minutes: Int) {
        var local = Calendar(identifier: .gregorian)
        local.timeZone = zone
        let parts = local.dateComponents([.year, .month, .day, .hour, .minute], from: now)
        let day = "\(parts.year ?? 1970)-\(pad(parts.month ?? 1))-\(pad(parts.day ?? 1))"
        return (day, (parts.hour ?? 0) * 60 + (parts.minute ?? 0))
    }

    /// The next half hour, as the website starts a new appointment (23:45 stays on 23:00, as there).
    static func nextHalfHour(_ minutes: Int) -> String {
        let rounded = Int((Double(minutes) / 30).rounded(.up)) * 30
        return "\(pad(min(23, rounded / 60))):\(pad(rounded % 60))"
    }

    /// "11:00" → 660 (the website's hm()).
    static func minutes(_ text: String) -> Int {
        let parts = text.split(separator: ":", omittingEmptySubsequences: false).map { Int($0) ?? 0 }
        return (parts.first ?? 0) * 60 + (parts.count > 1 ? parts[1] : 0)
    }

    /// "2026-11-24" as midnight UTC.
    static func date(_ day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func day(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return "\(parts.year ?? 1970)-\(pad(parts.month ?? 1))-\(pad(parts.day ?? 1))"
    }

    /// "15:30" as a moment on 1 January 1970, UTC, for the time wheel.
    static func timeDate(_ time: String) -> Date? {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return Date(timeIntervalSince1970: TimeInterval(parts[0] * 3600 + parts[1] * 60))
    }

    static func time(_ date: Date) -> String {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return "\(pad(parts.hour ?? 0)):\(pad(parts.minute ?? 0))"
    }

    /// "2026-11-24" → "11/24/2026", as the photo's date field shows it.
    static func shortDate(_ day: String) -> String {
        let parts = day.split(separator: "-")
        guard parts.count == 3 else { return day }
        return "\(parts[1])/\(parts[2])/\(parts[0])"
    }

    /// "13:30" → "1:30 PM", as the photo's time field and the website's clock() write it.
    static func clock(_ time: String) -> String {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return time }
        let hour = parts[0] % 12 == 0 ? 12 : parts[0] % 12
        return "\(hour):\(pad(parts[1])) \(parts[0] < 12 ? "AM" : "PM")"
    }

    /// "Tue, Nov 24, 2026" (the website's fmtD).
    static func longDay(_ day: String) -> String {
        guard let start = date(day) else { return day }
        return start.formatted(Date.FormatStyle(timeZone: utc).weekday(.abbreviated).month(.abbreviated).day().year())
    }
}

/// Money typed as text, read exactly as the website reads it.
enum CreateAppointmentPrice {
    /// parsePrice in shared/core.js: "$1,234.50", "12", "9,50", "Free" → cents; nil when it is not a price (or more than $100,000).
    static func parse(_ input: String) -> Int? {
        let raw = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return nil }
        let lower = raw.lowercased()
        if lower == "free" || lower == "no charge" || lower == "n/c" { return 0 }
        if raw.range(of: "-\\s*[0-9]|\\(\\s*\\$?[0-9]", options: .regularExpression) != nil { return nil }
        var text = String(raw.filter { ($0.isASCII && $0.isNumber) || $0 == "." || $0 == "," })
        guard text.contains(where: { $0.isASCII && $0.isNumber }) else { return nil }
        let chars = Array(text)
        if let last = chars.lastIndex(where: { $0 == "." || $0 == "," }) {
            let decimals = chars.count - last - 1
            let separators = chars.filter { $0 == "." || $0 == "," }.count
            // Three digits after a lone dot could be cents typed wrong (1.250), so it is not guessed.
            if decimals == 3 && separators == 1 && chars[last] == "." { return nil }
            if decimals > 3 { return nil }
            if decimals >= 1 && decimals <= 2 {
                let whole = String(chars[..<last].filter { $0 != "." && $0 != "," })
                text = whole + "." + String(chars[(last + 1)...])
            } else {
                text = String(chars.filter { $0 != "." && $0 != "," })
            }
        }
        // ",50" reads as 0.50, as JavaScript's parseFloat reads ".50".
        if text.hasPrefix(".") { text = "0" + text }
        guard let value = Double(text), value.isFinite else { return nil }
        let cents = jsRound(value * 100)
        guard cents >= 0, cents <= 10_000_000 else { return nil }
        return Int(cents)
    }

    /// The website's cents(): what a price field adds to the sums (empty or unreadable is $0).
    static func cents(_ text: String) -> Int { parse(text.isEmpty ? "0" : text) ?? 0 }

    /// JavaScript's Math.round (halves go up), so the sums come out to the cent the website gets.
    static func jsRound(_ value: Double) -> Double {
        let down = value.rounded(.down)
        return value - down >= 0.5 ? down + 1 : down
    }

    static func roundToInt(_ value: Double) -> Int {
        let rounded = jsRound(value)
        return rounded.isFinite ? Int(rounded) : 0
    }
}

// MARK: - The form

/// Create appointment (Home → Calendar → "+"): the website's Create appointment (public/js/editor.js CL['appt-new']) with the
/// same data, rules, sums and request. The business's services, hours, tax rate and time zone come from GET /api/sites/<id>, its
/// customers from /customers, its appointments (for Find availability and the customer's history) from /appointments, the team
/// from /shifts and the items from /menu. Saving a new customer first adds them with POST /api/sites/<id>/contacts, then the
/// appointment goes to POST /api/sites/<id>/appointments (makeAppt in server/app.js).
@Observable @MainActor
final class CreateAppointmentModel {
    static let anyAvailable = "Any available"
    static let notesLimit = 200
    /// The server keeps at most 80 characters of a service name (makeAppt).
    static let serviceNameLimit = 80
    static let noOpenTimes = "No open times in the next two weeks. Set your business hours first."
    static let extraHourChoices: [String] = (0...8).map { CreateAppointmentClock.pad($0) }
    static let extraMinuteChoices = ["00", "15", "30", "45"]

    // MARK: What the business has

    var siteLoaded = false
    var loadError = ""
    var offers: [CreateAppointmentOffer] = []
    var hours: [CreateAppointmentDayHours] = []
    /// A percentage, like 8.25.
    var taxRate: Double = 0
    var zone: TimeZone = CreateAppointmentClock.serverDefault
    /// The owner and the team, by the names the business knows them by.
    var people: [String] = []
    var customers: [CreateAppointmentCustomer] = []
    var customersError = ""
    var appointments: [Appointment] = []
    var items: [CreateAppointmentItem] = []
    var itemsLoaded = false
    var itemsError = ""

    // MARK: The draft (the website's d)

    var customer: CreateAppointmentCustomer? = nil
    var query = ""
    var newCustomer = false
    var firstName = ""
    var lastName = ""
    var email = ""
    var phone = ""
    var services: [CreateAppointmentService]
    var date = ""
    var time = ""
    var extraHour = "00"
    var extraMinute = "00"
    var lines: [CreateAppointmentLine] = []
    /// In cents.
    var discount = 0
    var charge = 0
    var notes = ""
    var open: Set<CreateAppointmentSection> = [.customer, .details, .payment]
    var saving = false

    /// A date or time that came with the screen, was picked, or was found stays; otherwise they follow the business's clock.
    @ObservationIgnored private var dateChosen = false
    @ObservationIgnored private var timeChosen = false

    /// A time tapped in the day view brings its date, time and team member, as the website's apptPre does.
    init(date: String?, time: String?, employee: String?) {
        services = [CreateAppointmentService(employee: employee ?? "")]
        if let date, !date.isEmpty {
            self.date = date
            dateChosen = true
        }
        if let time, !time.isEmpty {
            self.time = time
            timeChosen = true
        }
        fillClock()
    }

    /// Today on the business's clock and the next half hour, unless they came with the screen or were chosen.
    private func fillClock() {
        let wall = CreateAppointmentClock.wall(in: zone)
        if !dateChosen, date != wall.day { date = wall.day }
        let next = CreateAppointmentClock.nextHalfHour(wall.minutes)
        if !timeChosen, time != next { time = next }
    }

    // MARK: Loading

    func load(siteID: String) async {
        async let siteDone: Void = loadSite(siteID)
        async let peopleDone: Void = loadPeople(siteID)
        async let customersDone: Void = loadCustomers(siteID)
        async let appointmentsDone: Void = loadAppointments(siteID)
        async let itemsDone: Void = loadItems(siteID)
        await siteDone
        await peopleDone
        await customersDone
        await appointmentsDone
        await itemsDone
    }

    /// Try again after the business could not be read.
    func retry(siteID: String) async {
        loadError = ""
        await load(siteID: siteID)
    }

    private func loadSite(_ siteID: String) async {
        do {
            let answer = try await API.get("/api/sites/\(siteID)")
            let ordering = answer["site"]["ordering"]
            var found: [CreateAppointmentOffer] = []
            for entry in ordering["booking"]["services"].array {
                let name = entry["name"].string.trimmed
                guard !name.isEmpty else { continue }
                found.append(CreateAppointmentOffer(id: found.count, name: name, minutes: max(0, entry["minutes"].int), price: max(0, entry["price"].int)))
            }
            if found != offers { offers = found }
            let week = ordering["hours"].array.map { day in
                CreateAppointmentDayHours(closed: day["closed"].bool, open: CreateAppointmentClock.minutes(day["open"].string), close: CreateAppointmentClock.minutes(day["close"].string))
            }
            if week != hours { hours = week }
            let rate = (ordering["taxRate"].raw as? NSNumber)?.doubleValue ?? Double(ordering["taxRate"].string) ?? 0
            if rate != taxRate { taxRate = rate.isFinite ? rate : 0 }
            if let business = TimeZone(identifier: ordering["timezone"].string), business.identifier != zone.identifier { zone = business }
            fillClock()
            if !siteLoaded { siteLoaded = true }
            if !loadError.isEmpty { loadError = "" }
        } catch let error as APIError {
            if error.status == 401 { AppModel.shared.sessionEnded() }
            // A business already on screen stays; the message shows when there is nothing yet.
            if !siteLoaded { loadError = error.message }
        } catch {
            // Cancelled: the screen went away.
        }
    }

    /// The names for Employee, in the server's order (the owner first, then the team as they were added). A list that cannot be
    /// read leaves only "Any available", as the website falls back to no names.
    private func loadPeople(_ siteID: String) async {
        guard let answer = try? await API.get("/api/sites/\(siteID)/shifts") else { return }
        var seen: Set<String> = [Self.anyAvailable]
        var names: [String] = []
        for entry in answer["people"].array {
            let name = entry.string
            if !name.trimmed.isEmpty, seen.insert(name).inserted { names.append(name) }
        }
        if names != people { people = names }
    }

    private func loadCustomers(_ siteID: String) async {
        do {
            let answer = try await API.get("/api/sites/\(siteID)/customers")
            let list = answer["customers"].array.enumerated().map { index, entry in
                CreateAppointmentCustomer(id: index, name: entry["name"].string, email: entry["email"].string, phone: entry["phone"].string)
            }
            if list != customers { customers = list }
            if !customersError.isEmpty { customersError = "" }
        } catch let error as APIError {
            if error.status == 401 { AppModel.shared.sessionEnded() }
            // The website treats a list it cannot read as no customers; the server's words show under the search.
            if customers.isEmpty { customersError = error.message }
        } catch {
            // Cancelled.
        }
    }

    private func loadAppointments(_ siteID: String) async {
        guard let answer = try? await API.get("/api/sites/\(siteID)/appointments") else { return }
        let list = answer["appointments"].array.compactMap { Appointment($0) }
        if list != appointments { appointments = list }
    }

    private func loadItems(_ siteID: String) async {
        do {
            let answer = try await API.get("/api/sites/\(siteID)/menu")
            let list: [CreateAppointmentItem] = answer["items"].array.compactMap { entry in
                let id = entry["id"].string
                guard !id.isEmpty else { return nil }
                let listed = max(0, entry["price"].int)
                let sale = min(90, max(0, entry["sale"].int))
                let price = sale > 0 ? CreateAppointmentPrice.roundToInt(Double(listed * (100 - sale)) / 100) : listed
                return CreateAppointmentItem(id: id, name: entry["name"].string, price: price, variable: entry["variable"].bool, taxable: entry["taxable"].exists ? entry["taxable"].bool : true)
            }
            if list != items { items = list }
            if !itemsLoaded { itemsLoaded = true }
            if !itemsError.isEmpty { itemsError = "" }
        } catch let error as APIError {
            if error.status == 401 { AppModel.shared.sessionEnded() }
            if items.isEmpty { itemsError = error.message }
            if !itemsLoaded { itemsLoaded = true }
        } catch {
            // Cancelled.
        }
    }

    // MARK: The cards

    func isOpen(_ section: CreateAppointmentSection) -> Bool { open.contains(section) }

    func toggle(_ section: CreateAppointmentSection) {
        if open.contains(section) {
            open.remove(section)
        } else {
            open.insert(section)
        }
    }

    // MARK: The customer

    /// Up to six customers whose name, email or phone holds what was typed (the website's search, in any case).
    var matches: [CreateAppointmentCustomer] {
        let typed = query.lowercased()
        guard !typed.isEmpty else { return [] }
        return Array(customers.filter { "\($0.name) \($0.email) \($0.phone)".lowercased().contains(typed) }.prefix(6))
    }

    func pick(_ chosen: CreateAppointmentCustomer) {
        customer = chosen
        query = ""
    }

    func changeCustomer() { customer = nil }

    /// "+ Add new customer" and "Select an existing customer".
    func toggleNewCustomer() {
        newCustomer.toggle()
        customer = nil
    }

    /// Someone is chosen or being added, so the payment can be recorded from the appointment later.
    var hasCustomer: Bool { customer != nil || newCustomer }

    /// The chosen customer's appointments the server sent (from 30 days back): by email, or by name.
    var history: [Appointment] {
        guard let customer else { return [] }
        return appointments.filter { (!customer.email.isEmpty && $0.email == customer.email) || $0.name == customer.name }
    }

    /// The website's words for each status in Appointment History.
    static func statusWord(_ status: String) -> String {
        switch status {
        case "pending": return "Pending"
        case "confirmed": return "Confirmed"
        case "completed": return "Completed"
        case "cancelled": return "Cancelled"
        case "noshow": return "No-show"
        default: return status
        }
    }

    // MARK: The services

    func addService() { services.append(CreateAppointmentService()) }

    func removeService(_ id: UUID) {
        guard services.count > 1 else { return }
        services.removeAll { $0.id == id }
    }

    /// Choosing a service fills in its price when none was typed.
    func choose(_ offer: CreateAppointmentOffer, for id: UUID) {
        guard let index = services.firstIndex(where: { $0.id == id }) else { return }
        services[index].name = offer.name
        if services[index].price.isEmpty { services[index].price = Money.decimal(offer.price) }
    }

    func offer(named name: String) -> CreateAppointmentOffer? { offers.first { $0.name == name } }

    /// "Any available" and the team, with a name that came with the screen kept even when it is not on the list.
    func employeeChoices(including chosen: String) -> [String] {
        if chosen.isEmpty || people.contains(chosen) { return people }
        return people + [chosen]
    }

    // MARK: Date and time

    func setDate(_ day: String) {
        dateChosen = true
        if date != day { date = day }
    }

    func setTime(_ value: String) {
        timeChosen = true
        if time != value { time = value }
    }

    /// The website's findAvail: from the next half hour on the business's clock, every half hour for two weeks, the first time
    /// inside the business hours (a day that closes after midnight runs on into the next) that no appointment starts at.
    /// False when there is none.
    func findAvailability(at now: Date = Date()) -> Bool {
        let wall = CreateAppointmentClock.wall(in: zone, at: now)
        guard hours.count == 7, let midnight = CreateAppointmentClock.date(wall.day) else { return false }
        let current = Int((midnight.timeIntervalSince1970 / 60).rounded()) + wall.minutes
        let first = Int((Double(current) / 30).rounded(.up)) * 30
        let taken = Set(appointments.map { $0.at })
        for step in 0..<(14 * 48) {
            let slot = Date(timeIntervalSince1970: TimeInterval(first + step * 30) * 60)
            let parts = CreateAppointmentClock.calendar.dateComponents([.year, .month, .day, .hour, .minute, .weekday], from: slot)
            guard let year = parts.year, let month = parts.month, let day = parts.day, let hour = parts.hour, let minute = parts.minute,
                  let weekday = parts.weekday else { continue }
            let index = (weekday + 6) % 7
            let at = hour * 60 + minute
            let today = hours[index]
            let before = hours[(index + 6) % 7]
            let openToday = !today.closed && (today.close > today.open ? (at >= today.open && at < today.close) : at >= today.open)
            let lateFromBefore = !before.closed && before.close <= before.open && at < before.close
            guard openToday || lateFromBefore else { continue }
            let foundDay = "\(year)-\(CreateAppointmentClock.pad(month))-\(CreateAppointmentClock.pad(day))"
            let foundTime = "\(CreateAppointmentClock.pad(hour)):\(CreateAppointmentClock.pad(minute))"
            if !taken.contains("\(foundDay)T\(foundTime)") {
                setDate(foundDay)
                setTime(foundTime)
                return true
            }
        }
        return false
    }

    // MARK: Items

    func addItem(_ item: CreateAppointmentItem, price: Int? = nil) {
        lines.append(CreateAppointmentLine(name: item.name, price: price ?? item.price, qty: 1, taxable: item.taxable))
    }

    func addCustom(name: String, price: Int) {
        lines.append(CreateAppointmentLine(name: name, price: price, qty: 1, taxable: true))
    }

    /// One more or one less; none left takes the line away.
    func step(_ id: UUID, by change: Int) {
        guard let index = lines.firstIndex(where: { $0.id == id }) else { return }
        lines[index].qty += change
        if lines[index].qty < 1 { lines.remove(at: index) }
    }

    func removeLine(_ id: UUID) { lines.removeAll { $0.id == id } }

    // MARK: The sums (exactly the website's)

    private var servicesSum: Int { services.reduce(0) { $0 + CreateAppointmentPrice.cents($1.price) } }

    var subtotal: Int { servicesSum + lines.reduce(0) { $0 + $1.price * $1.qty } }

    /// Services are taxed, and so are items unless their sales tax is off.
    var taxedSubtotal: Int { servicesSum + lines.reduce(0) { $0 + ($1.taxable ? $1.price * $1.qty : 0) } }

    /// What is taxed after the discount, which is shared across what is taxed and what is not.
    var taxable: Int {
        let sub = subtotal, taxed = taxedSubtotal
        let share = sub != 0 ? CreateAppointmentPrice.roundToInt(Double(discount * taxed) / Double(sub)) : 0
        return max(0, taxed - share)
    }

    var tax: Int { CreateAppointmentPrice.roundToInt(Double(taxable) * taxRate / 100) }

    var total: Int { max(0, subtotal - discount + charge + tax) }

    /// The discount can be at most the subtotal; the website's message when more was asked for.
    func setDiscount(_ cents: Int) -> String? {
        let sub = subtotal
        discount = max(0, min(cents, sub))
        return cents > sub ? "The discount can be up to the subtotal, \(Money.format(sub))." : nil
    }

    func setCharge(_ cents: Int) { charge = max(0, cents) }

    // MARK: Typing

    /// Everything typed, so each keystroke counts as activity for the 15-minute rule.
    var typing: String {
        ([query, firstName, lastName, email, phone, notes] + services.map { $0.name + "\u{1}" + $0.price }).joined(separator: "\u{2}")
    }

    /// Notes stop at 200 characters and a typed service name at 80, as the website's fields do (counted as the website counts).
    func limitText() {
        while notes.utf16.count > Self.notesLimit { notes.removeLast() }
        for index in services.indices where services[index].name.utf16.count > Self.serviceNameLimit {
            var name = services[index].name
            while name.utf16.count > Self.serviceNameLimit { name.removeLast() }
            services[index].name = name
        }
    }

    // MARK: Saving

    /// The website's ready(): a customer, a service, a date and a time.
    var ready: Bool {
        let who = customer != nil || (newCustomer && (!firstName.isEmpty || !lastName.isEmpty))
        return who && services.contains { !$0.name.trimmed.isEmpty } && !date.isEmpty && !time.isEmpty
    }

    /// Saves the appointment as the website does: a new customer is added first, then the appointment. True once it is saved;
    /// the server's message is thrown otherwise, and everything typed stays.
    func save(siteID: String) async throws -> Bool {
        guard ready, !saving else { return false }
        saving = true
        defer { saving = false }
        let name: String, mail: String, tel: String
        if let customer {
            name = customer.name
            mail = customer.email
            tel = customer.phone
        } else {
            name = "\(firstName) \(lastName)".trimmed
            mail = email
            tel = phone
        }
        let names = services.map { $0.name.trimmed }.filter { !$0.isEmpty }
        let minutes = services.reduce(0) { $0 + (offer(named: $1.name)?.minutes ?? 0) } + (Int(extraHour) ?? 0) * 60 + (Int(extraMinute) ?? 0)
        let employee = services.first { !$0.employee.isEmpty }?.employee ?? ""
        let body: [String: Any] = [
            "serviceName": names.joined(separator: ", "),
            "date": date,
            "time": time,
            "name": name,
            "email": mail,
            "phone": tel,
            "party": 1,
            "notes": notes,
            "employee": employee,
            "minutes": minutes,
            "total": total,
            "tax": tax,
            "taxable": taxable,
        ]
        do {
            if customer == nil {
                try await API.post("/api/sites/\(siteID)/contacts", ["name": name, "email": mail, "phone": tel])
            }
            try await API.post("/api/sites/\(siteID)/appointments", body)
            return true
        } catch let error as APIError {
            if error.status == 401 { AppModel.shared.sessionEnded() }
            throw error
        }
    }
}
