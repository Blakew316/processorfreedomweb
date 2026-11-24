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
    static let anyAvailable = "Any available"

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
        pickedDay = nil
    }

    func pick(_ day: String) {
        let next: String? = day == today ? nil : day
        if next != pickedDay { pickedDay = next }
    }

    /// The first day the server sends appointments for: 30 days before the business's today.
    var firstDay: String? { today.isEmpty ? nil : AppointmentDayCalendar.adding(-30, to: today) }

    // MARK: Loading

    func load(siteID: String) async {
        async let names: Void = loadPeople(siteID: siteID)
        do {
            let answer = try await API.get("/api/sites/\(siteID)/appointments")
            let list = answer["appointments"].array.compactMap { Appointment($0) }
            let serverToday = answer["today"].string
            if list != appointments { appointments = list }
            if !serverToday.isEmpty, serverToday != today {
                today = serverToday
                if pickedDay == serverToday { pickedDay = nil }
            }
            if !loaded { loaded = true }
            if !loadError.isEmpty { loadError = "" }
        } catch let error as APIError {
            if error.status == 401 { AppModel.shared.sessionEnded() }
            // A failed refresh keeps the list it had; the message shows when there is nothing yet, or when this login may not see it.
            if !loaded || error.status == 403 { loadError = error.message }
        } catch {
            // Cancelled: the screen went away.
        }
        await names
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
            appointments[index] = fresh
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

    private func took(_ answer: JSON) throws -> Appointment {
        guard let fresh = Appointment(answer["appointment"]) else {
            throw APIError(status: 0, message: "Something went wrong. Please try again.")
        }
        replace(fresh)
        return fresh
    }
}

/// The day view's dates. Days are the server's "2026-11-23" strings on the business's clock, so they are kept as noon in GMT,
/// where no time zone can move them to another day, and shown in the phone's own way of writing dates and times.
enum AppointmentDayCalendar {
    static let zone = TimeZone(secondsFromGMT: 0) ?? .current

    static var gregorian: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar
    }

    /// Noon of a "2026-11-23" day.
    static func date(_ day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return gregorian.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }

    static func day(_ date: Date) -> String {
        let parts = gregorian.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func adding(_ days: Int, to day: String) -> String {
        guard let start = date(day), let moved = gregorian.date(byAdding: .day, value: days, to: start) else { return day }
        return Self.day(moved)
    }

    /// The phone's own today, only until the server has said the business's.
    static func phoneToday() -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let parts = calendar.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
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
}
