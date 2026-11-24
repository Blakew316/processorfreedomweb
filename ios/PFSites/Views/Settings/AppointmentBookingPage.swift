import SwiftUI

/// Settings → Services and appointments → Appointment booking (E10, the owner's photos, "redesign it to where it looks like ours").
/// Every value is the business's real booking setup (`GET /api/sites/<id>` → `ordering.booking`) or a fact about how the website's
/// booking page and the server take requests (shared/booking.js, `makeAppt` in server/app.js). What Processor Freedom does not do
/// yet is greyed. The pencils open the website's Online booking page, and the values load again when it closes.
struct AppointmentBookingPage: View {
    @Environment(AppModel.self) private var model
    @State private var loader = SettingsA.SiteLoader()
    @State private var openTab: String?

    var body: some View {
        SettingsPage(title: "Appointment booking", refresh: { await loader.load(model) }) {
            VStack(alignment: .leading, spacing: 20) {
                if let site = loader.site {
                    SettingsA.ReloadProblem(problem: loader.problem)
                    cards(Booking(site))
                } else {
                    SettingsA.LoadState(loading: loader.loading, problem: loader.problem) {
                        Task { await loader.load(model) }
                    }
                }
            }
            .modifier(SettingsA.WebPages(tab: $openTab) {
                Task { await loader.load(model) }
            })
        }
        .settingsLoads { await loader.load(model) }
    }

    /// What the page shows, read from the business.
    private struct Booking {
        struct Service: Identifiable {
            let id: String
            let name: String
            let detail: String
        }

        let enabled: Bool
        let perSlot: Int
        let services: [Service]

        init(_ site: JSON) {
            let booking = site["ordering"]["booking"]
            enabled = booking["enabled"].bool
            // The server keeps it between 1 and 200 (normalizeOrdering), 2 when it was never set.
            perSlot = booking["perSlot"].exists ? max(1, booking["perSlot"].int) : 2
            services = booking["services"].array.enumerated().compactMap { (index: Int, item: JSON) -> Service? in
                let name = item["name"].string.trimmed
                guard !name.isEmpty else { return nil }
                // As the booking page lists them: "60 min · $45.00", with whichever parts are set.
                let minutes = item["minutes"].int, price = item["price"].int
                let detail = [minutes > 0 ? "\(minutes) min" : "", price > 0 ? Money.format(price) : ""].filter { !$0.isEmpty }.joined(separator: " · ")
                // The position keeps the rows apart even if two services ever shared an id.
                return Service(id: "\(index)-\(item["id"].string)", name: name, detail: detail)
            }
        }
    }

    /// Measured from the photos, from a card's top edge: a two-line title's first baseline 39 pt down with the pencil centred
    /// on it, a one-line title centred 39 pt down; the first setting's name 116 pt down on 24 pt lines, its value 27 pt under
    /// the name and the next name 49 pt under the value; the card ends 18 pt under its last line.
    @ViewBuilder
    private func cards(_ booking: Booking) -> some View {
        let edit: () -> Void = { openTab = "booking" }

        SettingsCard(spacing: 28) {
            SettingsA.WithButton(button: SettingsA.EditButton(label: "Edit online scheduling preferences", action: edit)) {
                SettingsA.CardTitle(text: "Online scheduling preferences")
            }
            .padding(.bottom, 3)
            VStack(alignment: .leading, spacing: 28) {
                row("Online booking", booking.enabled ? "On" : "Off")
                // The booking page offers a time every 30 minutes, on the hour and the half hour.
                row("The start of appointments should be scheduled", "in 30 min blocks (i.e. 1:00, 1:30, 2:00 PM)")
                // Any later time today can be requested.
                row("Appointments must be made in advance of", "No minimum")
                // The server takes requests up to 90 days ahead ("Please choose a date in the next three months.").
                row("Appointments can't be scheduled farther out than", "90 days")
                row("Booking requests per time slot", String(booking.perSlot))
                row("Show option to book with any available employee", "Not available yet", greyed: true)
                // One service per request.
                row("Allow multiple services to be booked online", "Off")
                row("Remove employees from online booking site", "Not available yet", greyed: true)
                row("Daily appointment limit", "Off")
            }
            .padding(.bottom, -6)
        }

        // Booking requests have no cancellation policy or fee yet: nothing here can be changed.
        SettingsCard(spacing: 28) {
            SettingsA.WithButton(button: SettingsA.EditButton(label: "Edit cancellation and deposit policy", action: nil)) {
                SettingsA.CardTitle(text: "Cancellation and deposit policy")
            }
            .padding(.bottom, 3)
            VStack(alignment: .leading, spacing: 28) {
                row("Policy", "None")
                row("Show cancellation policy on your online booking site", "Off")
                row("Cancellation policy time window", "Not available yet", greyed: true)
                row("Cancellation policy", "Not available yet", greyed: true)
                row("Cancellation and no-show fee protection", "No fee")
            }
            .padding(.bottom, -6)
        }

        // A booking request never takes a payment.
        SettingsCard(spacing: 28) {
            SettingsA.WithButton(button: SettingsA.EditButton(label: "Edit payment requirements", action: nil)) {
                SettingsA.CardTitle(text: "Payment requirements")
            }
            .padding(.top, -3)
            SettingsA.Note(parts: [.text("Let customers book online without paying")])
                .padding(.bottom, -8)
        }

        SettingsCard(spacing: 28) {
            SettingsA.WithButton(button: SettingsA.EditButton(label: "Edit online service menu", action: edit)) {
                SettingsA.CardTitle(text: "Online service menu")
            }
            .padding(.top, -3)
            if booking.services.isEmpty {
                SettingsA.Note(parts: [.text("No services yet")])
                    .padding(.bottom, -8)
            } else {
                VStack(alignment: .leading, spacing: 28) {
                    ForEach(booking.services) { service in
                        row(service.name, service.detail)
                    }
                }
                .padding(.bottom, -6)
            }
        }

        // Employees are not shown on the booking page.
        SettingsCard(spacing: 8) {
            SettingsA.CardTitle(text: "Employee order")
            SettingsA.WithButton(button: SettingsA.EditButton(label: "Edit employee order", action: nil)) {
                SettingsA.Note(parts: [.text("Set the order in which employees appear during online booking.")])
            }
            Text("Not available yet")
                .pfFont(16)
                .foregroundStyle(SettingsLook.greyed)
                .padding(.top, 12)
        }
    }

    /// A setting as the photos show it: the name in bold on 24 pt lines over its value in grey; greyed, with "Not available
    /// yet", for what Processor Freedom does not do. A value left empty (a service with no length or price) shows the name only.
    private func row(_ label: String, _ value: String, greyed: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .pfFont(18, .bold)
                .foregroundStyle(greyed ? SettingsLook.greyed : Color.primary)
                .lineSpacing(2.5)
            if !value.isEmpty {
                Text(value)
                    .pfFont(16)
                    .foregroundStyle(greyed ? SettingsLook.greyed : SettingsLook.muted)
                    .lineSpacing(5)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
