import SwiftUI

/// Tapping an appointment (the website's apptSheet): the customer's name, the day and time, its details, and the website's
/// actions with its words: Confirm or Complete (or Done), Record payment with the tenders, No show, Void payment, Cancel. Each one
/// goes to the server; the sheet closes after it, and the day shows the server's answer.
struct AppointmentDaySheet: View {
    let list: AppointmentsModel
    let appointmentID: String
    /// Closes the sheet, with a short message for the day view ("Paid by cash"), or nil.
    let finish: (String?) -> Void

    @Environment(AppModel.self) private var model
    @State private var snapshot: Appointment? = nil
    @State private var working: String? = nil
    @State private var problem: String? = nil
    @State private var question: Question? = nil
    @State private var choosingTender = false

    init(list: AppointmentsModel, appointmentID: String, finish: @escaping (String?) -> Void) {
        self.list = list
        self.appointmentID = appointmentID
        self.finish = finish
    }

    /// A step that cannot be undone, asked first in the website's words (apptConfirm and apptVoid).
    private struct Question {
        enum Step {
            case status(AppointmentStatus)
            case voiding
        }

        let step: Step
        let title: String
        let text: String
        let action: String
    }

    /// The appointment as the day has it now (it is loaded again after every step), or the last copy seen.
    private var appointment: Appointment? { list.appointment(appointmentID) ?? snapshot }

    var body: some View {
        Group {
            if let appointment {
                details(appointment)
            } else {
                ProgressView()
                    .controlSize(.large)
                    .tint(Theme.blue)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(SettingsLook.page)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear {
            if snapshot == nil { snapshot = list.appointment(appointmentID) }
        }
        .onChange(of: list.appointment(appointmentID)) { _, fresh in
            if let fresh { snapshot = fresh }
        }
        .alert(question?.title ?? "", isPresented: Binding(get: { question != nil }, set: { if !$0 { question = nil } }), presenting: question) { asked in
            Button("Cancel", role: .cancel) {}
            Button(asked.action, role: .destructive) { run(asked.step) }
        } message: { asked in
            Text(asked.text)
        }
        .confirmationDialog(tenderTitle, isPresented: $choosingTender, titleVisibility: .visible) {
            ForEach(appointmentTenders, id: \.self) { tender in
                Button(tender) { pay(tender) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(tenderText)
        }
        .alert(problem ?? "", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    // MARK: What it shows

    private func details(_ appointment: Appointment) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(appointment.name)
                            .pfFont(20, .bold, relativeTo: .title3)
                            .foregroundStyle(Color.primary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                        Text(AppointmentDayCalendar.when(appointment))
                            .pfFont(16)
                            .foregroundStyle(SettingsLook.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    AppointmentDayCloseButton { finish(nil) }
                        .padding(.top, -5)
                        .padding(.trailing, -5)
                }
                if let status = AppointmentStatus(rawValue: appointment.status) {
                    HStack(spacing: 10) {
                        AppointmentDayStatusIcon(kind: AppointmentDayStatusIcon.Kind(status))
                        Text(status.title)
                            .pfFont(16, .medium)
                            .foregroundStyle(Color.primary)
                    }
                    .accessibilityElement(children: .combine)
                    .padding(.top, 16)
                }
                SettingsCard(spacing: 16) {
                    lines(appointment)
                }
                .padding(.top, 20)
                actions(appointment)
                    .padding(.top, 20)
            }
            .padding(.horizontal, 16)
            .padding(.top, 24)
            .padding(.bottom, 32)
        }
    }

    /// The website's lines, in its order: Service, Employee, Total, Payment, Phone, Email, Notes.
    @ViewBuilder
    private func lines(_ appointment: Appointment) -> some View {
        line("Service", AppointmentDayCalendar.service(appointment))
        line("Employee", AppointmentDayCalendar.employee(appointment))
        if appointment.total > 0 {
            line("Total", Money.format(appointment.total))
        }
        if appointment.paid {
            line("Payment", "Paid · \(appointment.paidMethod)")
        }
        if !appointment.phone.isEmpty {
            linkLine("Phone", appointment.phone, url: phoneURL(appointment.phone))
        }
        if !appointment.email.isEmpty {
            linkLine("Email", appointment.email, url: mailURL(appointment.email))
        }
        if !appointment.notes.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Notes")
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
                Text(appointment.notes)
                    .pfFont(16, .semibold)
                    .foregroundStyle(Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    private func line(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label)
                .pfFont(16)
                .foregroundStyle(SettingsLook.muted)
            Spacer(minLength: 8)
            Text(value)
                .pfFont(16, .semibold)
                .foregroundStyle(Color.primary)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func linkLine(_ label: String, _ value: String, url: URL?) -> some View {
        if let url {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(label)
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
                Spacer(minLength: 8)
                Link(destination: url) {
                    Text(value)
                        .pfFont(16, .semibold)
                        .foregroundStyle(Theme.blue)
                        .multilineTextAlignment(.trailing)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
        } else {
            line(label, value)
        }
    }

    // MARK: The website's actions

    private func actions(_ appointment: Appointment) -> some View {
        let pending = appointment.status == AppointmentStatus.pending.rawValue
        let confirmed = appointment.status == AppointmentStatus.confirmed.rawValue
        return VStack(spacing: 12) {
            if pending {
                mainButton("Confirm", step: AppointmentStatus.confirmed.rawValue) { change(to: .confirmed) }
            } else if confirmed {
                mainButton("Complete", step: AppointmentStatus.completed.rawValue) { change(to: .completed) }
            } else {
                Button("Done") { finish(nil) }
                    .buttonStyle(AppointmentDayPillStyle(kind: .primary))
                    .disabled(working != nil)
            }
            if appointment.payable {
                Button("Record payment") { choosingTender = true }
                    .buttonStyle(AppointmentDayPillStyle(kind: .soft))
                    .disabled(working != nil)
            }
            if confirmed && !appointment.paid {
                Button("No show") { ask(.status(.noshow), appointment) }
                    .buttonStyle(AppointmentDayPillStyle(kind: .soft))
                    .disabled(working != nil)
            }
            if appointment.paid {
                textButton("Void payment", color: Theme.blue) { ask(.voiding, appointment) }
            }
            if (pending || confirmed) && !appointment.paid {
                textButton("Cancel", color: Theme.error) { ask(.status(.cancelled), appointment) }
            }
        }
    }

    private func mainButton(_ title: String, step: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            if working == step {
                ProgressView().tint(Color.white)
            } else {
                Text(title)
            }
        }
        .buttonStyle(AppointmentDayPillStyle(kind: .primary))
        .disabled(working != nil)
    }

    private func textButton(_ title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .pfFont(17, .semibold)
                .foregroundStyle(color)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(working != nil)
    }

    /// The website's apptConfirm and apptVoid questions.
    private func ask(_ step: Question.Step, _ appointment: Appointment) {
        switch step {
        case .status(let status) where status == .noshow:
            question = Question(step: step, title: "Mark \(appointment.name) as a no-show?",
                                text: "The booking stays in your records as a no-show.", action: "Mark no-show")
        case .status:
            // Cancelling a booking that was never confirmed declines it.
            let decline = appointment.status == AppointmentStatus.pending.rawValue
            question = Question(step: step, title: decline ? "Decline \(appointment.name)'s booking?" : "Cancel \(appointment.name)'s appointment?",
                                text: "The customer is told by email.", action: decline ? "Decline" : "Cancel appointment")
        case .voiding:
            question = Question(step: step, title: "Void the \(Money.format(appointment.total)) payment?",
                                text: "It was recorded as \(appointment.paidMethod.lowercased()). The appointment can be paid again afterwards.",
                                action: "Void payment")
        }
    }

    private func run(_ step: Question.Step) {
        switch step {
        case .status(let status): change(to: status)
        case .voiding: voidPayment()
        }
    }

    /// The website's apptPay sheet: "Record payment for Jane Doe" and "$45.00 for Haircut."
    private var tenderTitle: String { appointment.map { "Record payment for \($0.name)" } ?? "Record payment" }

    private var tenderText: String {
        guard let appointment else { return "" }
        return "\(Money.format(appointment.total)) for \(appointment.service.isEmpty ? "the appointment" : appointment.service)."
    }

    // MARK: Talking to the server

    private func change(to status: AppointmentStatus) {
        guard let appointment, let business = model.site, working == nil else { return }
        working = status.rawValue
        model.idle.touch()
        Task {
            do {
                _ = try await list.setStatus(appointment, to: status, siteID: business.id)
                Haptics.success()
                working = nil
                finish(nil)
            } catch let error as APIError {
                working = nil
                failed(error)
            } catch {
                // Cancelled: the sheet went away.
                working = nil
            }
        }
    }

    private func pay(_ tender: String) {
        guard let appointment, let business = model.site, working == nil else { return }
        working = "pay"
        model.idle.touch()
        Task {
            do {
                _ = try await list.recordPayment(appointment, tender: tender, siteID: business.id)
                Haptics.success()
                working = nil
                finish("Paid by \(tender.lowercased())")
            } catch let error as APIError {
                working = nil
                failed(error)
            } catch {
                working = nil
            }
        }
    }

    private func voidPayment() {
        guard let appointment, let business = model.site, working == nil else { return }
        working = "void"
        model.idle.touch()
        Task {
            do {
                _ = try await list.voidPayment(appointment, siteID: business.id)
                Haptics.success()
                working = nil
                finish("Payment voided")
            } catch let error as APIError {
                working = nil
                failed(error)
            } catch {
                working = nil
            }
        }
    }

    /// The server's own words. A 401 is checked (it locks only when the session really ended); a 403 (a team member voiding a
    /// payment) or a conflict is a message, and the day is loaded again so the sheet shows what is true now.
    private func failed(_ error: APIError) {
        Haptics.error()
        if error.status == 401 {
            model.sessionEnded()
            return
        }
        problem = error.message
        guard let business = model.site else { return }
        Task { await list.load(siteID: business.id) }
    }

    private func phoneURL(_ phone: String) -> URL? {
        let digits = phone.filter { $0.isASCII && ($0.isNumber || $0 == "+") }
        guard digits.filter({ $0.isNumber }).count >= 3 else { return nil }
        return URL(string: "tel:\(digits)")
    }

    private func mailURL(_ email: String) -> URL? {
        let address = email.trimmed
        guard address.contains("@") else { return nil }
        if let url = URL(string: "mailto:\(address)") { return url }
        return address.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed).flatMap { URL(string: "mailto:\($0)") }
    }
}
