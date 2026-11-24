import Foundation

/// An appointment as the server describes it (toAppt in server/app.js). Shared by the Appointments day view and Create appointment.
struct Appointment: Identifiable, Hashable {
    let id: String
    let service: String
    let minutes: Int
    /// The time on the business's clock, like "2026-11-23T15:30".
    let at: String
    let name: String
    let email: String
    let phone: String
    let party: Int
    let notes: String
    /// pending, confirmed, completed, cancelled or noshow.
    let status: String
    /// The team member's name; empty means "Any available".
    let employee: String
    /// In cents.
    let total: Int
    let tax: Int
    /// Milliseconds since 1970, nil until a payment is recorded.
    let paidAt: Int?
    let paidMethod: String
    let createdAt: Int

    init?(_ json: JSON) {
        let id = json["id"].string
        guard !id.isEmpty else { return nil }
        self.id = id
        service = json["service"].string
        minutes = max(0, json["minutes"].int)
        at = json["at"].string
        name = json["name"].string
        email = json["email"].string
        phone = json["phone"].string
        party = max(1, json["party"].int)
        notes = json["notes"].string
        status = json["status"].string
        employee = json["employee"].string
        total = max(0, json["total"].int)
        tax = max(0, json["tax"].int)
        paidAt = json["paidAt"].exists ? json["paidAt"].int : nil
        paidMethod = json["paidMethod"].string
        createdAt = json["createdAt"].int
    }

    /// "2026-11-23".
    var day: String { String(at.prefix(10)) }
    /// "15:30".
    var time: String { at.count >= 16 ? String(at.dropFirst(11).prefix(5)) : "" }
    /// Minutes after midnight on the business's clock.
    var startMinute: Int {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : 0
    }
    var paid: Bool { paidAt != nil }
    /// The website's apptPayable: a price, nothing recorded yet, and the appointment went ahead.
    var payable: Bool { total > 0 && !paid && status != "cancelled" && status != "noshow" }
}

/// The five statuses an appointment can have on the server, with the words the website's Appointment attributes panel uses.
enum AppointmentStatus: String, CaseIterable, Identifiable {
    case pending, confirmed, completed, cancelled, noshow

    var id: String { rawValue }

    var title: String {
        switch self {
        case .pending: return "Pending"
        case .confirmed: return "Confirmed"
        case .completed: return "Completed"
        case .cancelled: return "Canceled"
        case .noshow: return "No show"
        }
    }
}

/// The ways an appointment's payment can be recorded (APPT_TENDERS in server/app.js and public/js/editor.js).
let appointmentTenders = ["Cash", "Card", "Online payment", "Check", "Other"]
