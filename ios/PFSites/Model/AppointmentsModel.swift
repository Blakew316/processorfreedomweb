import Foundation
import Observation

/// The Appointments day view (Home → Calendar), as the website's Calendar page has it (public/js/editor.js CL.calendar): the
/// business's appointments, the team's names for the Employee(s) filter, the day on screen, the two filters, and the actions of the
/// website's appointment sheet. The appointments come from GET /api/sites/<id>/appointments, which sends those from 30 days before
/// the business's today onward, with that today (on the business's own clock).
/// One model lives for each open business (a new Shell means another business or another sign-in), so the filters are kept while
/// the business is open.
@Observable @MainActor
final class AppointmentsModel {
    /// The website's name for an appointment without one of the team's names, and the first choice of the Employee(s) filter.
    static let anyAvailable = AppointmentDayCalendar.anyAvailable

    var appointments: [Appointment] = []
    /// The business's today ("2026-11-23"), from the server.
    var today = ""
    /// The owner and the team, by the names the business knows them by (GET /api/sites/<id>/shifts, readable by every login).
    var people: [String] = []
    var loaded = false
    var loadError = ""
    /// The day picked in the calendar; nil follows the business's today (also past midnight, while the screen stays open).
    var pickedDay: String? = nil
    /// The Employee(s) filter: the names shown, "Any available" among them; nil shows everyone, people added later too.
    var employees: Set<String>? = nil
    /// The Appointment attributes filter: the statuses shown; nil shows all five.
    var statuses: Set<AppointmentStatus>? = nil
    /// The business's time zone (site.ordering.timezone). The calendar for choosing the day runs on it, so the day it marks as
    /// today is the business's today; the phone's own zone until the server has said.
    var zone: TimeZone = .current

    /// Counts the loads and the changes, so an answer that set out before a newer one is never shown over it.
    @ObservationIgnored private var generation = 0
    /// When the time zone was last read.
    @ObservationIgnored private var zoneReadAt: Date? = nil

    private static var kept: (shell: UUID, model: AppointmentsModel)?

    /// The model of the business open now: the same one while its Shell lives, a new one after that.
    static func forShell(_ shell: UUID) -> AppointmentsModel {
        if let kept, kept.shell == shell { return kept.model }
        let fresh = AppointmentsModel()
        kept = (shell, fresh)
        return fresh
    }

    // MARK: The day on screen

    /// "2026-11-23": the day picked, or the business's today (the phone's own today until the server has answered once).
    var day: String { pickedDay ?? (today.isEmpty ? AppointmentDayCalendar.phoneToday() : today) }

    /// A screen opened from Home starts on today; the filters stay.
    func startOnToday() {
        if pickedDay != nil { pickedDay = nil }
    }

    func pick(_ day: String) {
        let next: String? = day == today ? nil : day
        if next != pickedDay { pickedDay = next }
    }

    /// The first day the server sends appointments for: 30 days before the business's today.
    var firstDay: String? { today.isEmpty ? nil : AppointmentDayCalendar.adding(-30, to: today) }

    // MARK: Loading

    func load(siteID: String) async {
        generation += 1
        let mine = generation
        async let names: Void = loadPeople(siteID: siteID)
        async let clock: Void = loadZone(siteID: siteID)
        do {
            let answer = try await API.get("/api/sites/\(siteID)/appointments")
            // A newer load or a change made meanwhile has the fresher list.
            if mine == generation {
                let list = answer["appointments"].array.compactMap { Appointment($0) }
                let serverToday = answer["today"].string
                if list != appointments { appointments = list }
                if !serverToday.isEmpty, serverToday != today {
                    today = serverToday
                    if pickedDay == serverToday { pickedDay = nil }
                }
                if !loaded { loaded = true }
                if !loadError.isEmpty { loadError = "" }
            }
        } catch let error as APIError {
            if error.status == 401 { AppModel.shared.sessionEnded() }
            if error.status == 403 {
                // This login may not see this business's appointments: the server's words, and none of them.
                if !appointments.isEmpty { appointments = [] }
                if !loaded { loaded = true }
                loadError = error.message
            } else if !loaded {
                // A failed refresh keeps the list it had; the message shows when there is nothing yet.
                loadError = error.message
            }
        } catch {
            // Cancelled: the screen went away.
        }
        await names
        await clock
    }

    /// The business's time zone, from GET /api/sites/<id> (site.ordering.timezone): with the first load, then at most every ten
    /// minutes, since it seldom changes and that answer carries the whole website. A failed read keeps the zone it had.
    private func loadZone(siteID: String) async {
        if let at = zoneReadAt, Date().timeIntervalSince(at) < 600 { return }
        guard let answer = try? await API.get("/api/sites/\(siteID)") else { return }
        zoneReadAt = Date()
        if let found = TimeZone(identifier: answer["site"]["ordering"]["timezone"].string), found.identifier != zone.identifier { zone = found }
    }

    /// The names for the Employee(s) filter, in the server's order (the owner first, then the team as they were added). A list
    /// that cannot be read leaves the last one, as the website falls back to no names.
    private func loadPeople(siteID: String) async {
        guard let answer = try? await API.get("/api/sites/\(siteID)/shifts") else { return }
        var seen: Set<String> = [Self.anyAvailable]
        var names: [String] = []
        for item in answer["people"].array {
            let name = item.string
            if !name.trimmed.isEmpty, seen.insert(name).inserted { names.append(name) }
        }
        if names != people { people = names }
    }

    func appointment(_ id: String) -> Appointment? { appointments.first { $0.id == id } }

    func replace(_ fresh: Appointment) {
        if let index = appointments.firstIndex(where: { $0.id == fresh.id }) {
            if appointments[index] != fresh { appointments[index] = fresh }
        } else {
            appointments.append(fresh)
        }
    }

    // MARK: What the day shows

    /// "Any available", then the owner and the team.
    var employeeChoices: [String] { [Self.anyAvailable] + people }

    /// The website's colOf: the appointment's team member, or "Any available" when it names no one on the team now.
    func column(of appointment: Appointment) -> String {
        people.contains(appointment.employee) ? appointment.employee : Self.anyAvailable
    }

    func shows(_ appointment: Appointment) -> Bool {
        // Only the five statuses the server gives appointments are ever shown, as on the website.
        guard let status = AppointmentStatus(rawValue: appointment.status) else { return false }
        if let statuses, !statuses.contains(status) { return false }
        if let employees, !employees.contains(column(of: appointment)) { return false }
        return true
    }

    /// The day's appointments that pass both filters, in time order.
    var dayList: [Appointment] {
        let shownDay = day
        return appointments
            .filter { $0.day == shownDay && shows($0) }
            .sorted { ($0.startMinute, $0.name, $0.id) < ($1.startMinute, $1.name, $1.id) }
    }

    /// How many people the Employee(s) filter shows, when it leaves someone out (the website's count on its button).
    var employeesShown: Int? {
        guard let employees else { return nil }
        let count = employeeChoices.filter { employees.contains($0) }.count
        return count < employeeChoices.count ? count : nil
    }

    /// How many statuses the Appointment attributes filter shows, when it leaves one out.
    var statusesShown: Int? {
        guard let statuses, statuses.count < AppointmentStatus.allCases.count else { return nil }
        return statuses.count
    }

    /// A choice of names as the filter keeps it: nil when it holds everyone on the list now (people added later are shown too).
    func employeeFilter(_ chosen: Set<String>?) -> Set<String>? {
        guard let chosen else { return nil }
        let choices = employeeChoices
        return choices.allSatisfy({ chosen.contains($0) }) ? nil : chosen.intersection(choices)
    }

    // MARK: Actions (the website's appointment sheet); the server checks each one again

    func setStatus(_ appointment: Appointment, to status: AppointmentStatus, siteID: String) async throws -> Appointment {
        let answer = try await API.post("/api/sites/\(siteID)/appointments/\(appointment.id)", ["status": status.rawValue])
        return try took(answer)
    }

    /// Records what the customer paid (nothing is charged by this).
    func recordPayment(_ appointment: Appointment, tender: String, siteID: String) async throws -> Appointment {
        let answer = try await API.post("/api/sites/\(siteID)/appointments/\(appointment.id)/payment", ["method": tender])
        return try took(answer)
    }

    /// Removes a payment recorded by mistake; a team member's login is told it may not.
    func voidPayment(_ appointment: Appointment, siteID: String) async throws -> Appointment {
        let answer = try await API.post("/api/sites/\(siteID)/appointments/\(appointment.id)/payment", ["void": true])
        return try took(answer)
    }

    /// The server's answer replaces the appointment at once; a load that set out before the change cannot put the old one back.
    private func took(_ answer: JSON) throws -> Appointment {
        guard let fresh = Appointment(answer["appointment"]) else {
            throw APIError(status: 0, message: "Something went wrong. Please try again.")
        }
        generation += 1
        replace(fresh)
        return fresh
    }
}

/// The day view's dates. Days are the server's "2026-11-23" strings on the business's clock, so they are kept as noon in GMT,
/// where no time zone can move them to another day, and shown in the phone's own way of writing dates and times. Only the
/// calendar for choosing the day works in the business's own time zone (AppointmentsModel.zone), so that its "today" is right.
enum AppointmentDayCalendar {
    static let zone = TimeZone(secondsFromGMT: 0) ?? .current
    /// The website's words for an appointment that names no one on the team (AppointmentsModel.anyAvailable).
    static let anyAvailable = "Any available"

    /// A gregorian calendar in a time zone.
    static func calendar(in zone: TimeZone) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar
    }

    static var gregorian: Calendar { calendar(in: zone) }

    /// Noon (GMT) of a "2026-11-23" day.
    static func date(_ day: String) -> Date? { date(day, in: zone) }

    /// Noon of a "2026-11-23" day in a time zone.
    static func date(_ day: String, in zone: TimeZone) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar(in: zone).date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }

    static func day(_ date: Date) -> String { day(date, in: zone) }

    /// The "2026-11-23" day a moment falls on in a time zone.
    static func day(_ date: Date, in zone: TimeZone) -> String {
        let parts = calendar(in: zone).dateComponents([.year, .month, .day], from: date)
        return iso(year: parts.year ?? 0, month: parts.month ?? 0, day: parts.day ?? 0)
    }

    static func adding(_ days: Int, to day: String) -> String {
        guard let start = date(day), let moved = gregorian.date(byAdding: .day, value: days, to: start) else { return day }
        return Self.day(moved)
    }

    /// The phone's own today, only until the server has said the business's.
    static func phoneToday() -> String { day(Date(), in: TimeZone.current) }

    /// "2026-11-03".
    private static func iso(year: Int, month: Int, day: Int) -> String {
        func two(_ value: Int) -> String { value < 10 ? "0\(value)" : String(value) }
        let digits = String(year)
        return String(repeating: "0", count: max(0, 4 - digits.count)) + digits + "-" + two(month) + "-" + two(day)
    }

    /// "Nov 23", with the year when the day is in another year than the business's today.
    static func title(_ day: String, today: String) -> String {
        guard let noon = date(day) else { return day }
        let style = Date.FormatStyle(timeZone: zone).month(.abbreviated).day()
        let otherYear = !today.isEmpty && day.prefix(4) != today.prefix(4)
        return noon.formatted(otherYear ? style.year() : style)
    }

    /// "Mon, Nov 23, 2026", the website's way of naming a day in the appointment sheet.
    static func long(_ day: String) -> String {
        date(day)?.formatted(Date.FormatStyle(timeZone: zone).weekday(.abbreviated).month(.abbreviated).day().year()) ?? day
    }

    /// "3:30 PM" for a minute of the day.
    static func clock(_ minute: Int, on day: String) -> String {
        guard let noon = date(day) else { return "" }
        let time = gregorian.startOfDay(for: noon).addingTimeInterval(TimeInterval(minute * 60))
        return time.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: zone))
    }

    /// "3:30 PM – 4:00 PM", or just the start when the appointment has no length.
    static func times(_ appointment: Appointment) -> String {
        let start = clock(appointment.startMinute, on: appointment.day)
        guard appointment.minutes > 0 else { return start }
        return "\(start) – \(clock(appointment.startMinute + appointment.minutes, on: appointment.day))"
    }

    /// The website's line under the name in the appointment sheet: "Mon, Nov 23, 2026 · 3:30 PM · 30 min".
    static func when(_ appointment: Appointment) -> String {
        "\(long(appointment.day)) · \(clock(appointment.startMinute, on: appointment.day))"
            + (appointment.minutes > 0 ? " · \(appointment.minutes) min" : "")
    }

    /// The website's words for what the appointment is for, and who it is with.
    static func service(_ appointment: Appointment) -> String {
        appointment.service.isEmpty ? "Booking" : appointment.service
    }

    static func employee(_ appointment: Appointment) -> String {
        appointment.employee.isEmpty ? anyAvailable : appointment.employee
    }
}
