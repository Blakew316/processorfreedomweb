import SwiftUI

/// Tapping an appointment (the website's apptSheet): the customer's name, the day and time, its details, and the website's
/// actions with its words: Confirm or Complete (or Done), Record payment with the tenders, No show, Void payment, Cancel. Each one
/// goes to the server; the sheet closes after it, and the day shows the server's answer. The sheet opens as tall as what it
/// shows, so every action is in sight, and it stays up while a step is on its way to the server.
struct AppointmentDaySheet: View {
    let list: AppointmentsModel
    let appointmentID: String
    /// The height of the day view under the bar: the tallest the sheet opens by itself (more than that scrolls).
    let room: CGFloat
    /// Closes the sheet, with a short message for the day view ("Paid by cash"), or nil.
    let finish: (String?) -> Void

    @Environment(AppModel.self) private var model
    @State private var snapshot: Appointment? = nil
    @State private var working: String? = nil
    /// A step worked and the sheet is on its way out: while it slides away its steps (the pill that just turned from Confirm to
    /// Complete among them) do nothing, so a second press cannot move the booking on again.
    @State private var closing = false
    @State private var problem: String? = nil
    @State private var question: Question? = nil
    @State private var choosingTender = false
    /// How tall everything in the sheet is, once it has been laid out.
    @State private var contentHeight: CGFloat = 0

    init(list: AppointmentsModel, appointmentID: String, room: CGFloat, finish: @escaping (String?) -> Void) {
        self.list = list
        self.appointmentID = appointmentID
        self.room = room
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
        .presentationDetents(detents)
        .presentationDragIndicator(.visible)
        // A step on its way to the server keeps the sheet up until its answer is shown (the X waits too).
        .interactiveDismissDisabled(working != nil)
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

    /// The sheet's heights: as tall as what it shows once that is known, and the system's half height until then. One taller
    /// than the day view opens at the day view's height, scrolls, and can be pulled up to the top.
    private var detents: Set<PresentationDetent> {
        guard contentHeight > 0 else { return [.medium, .large] }
        guard room > 0, contentHeight > room else { return [.height(contentHeight)] }
        return [.height(room), .large]
    }

    // MARK: What it shows

    private func details(_ appointment: Appointment) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 12) {
                    Text(appointment.name)
                        .pfFont(20, .bold, relativeTo: .title3)
                        .foregroundStyle(Color.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 8)
                    // The 34 pt X is centred on the name's first line; its 44 pt tap area reaches 5 pt further out all round and
                    // takes no room of its own below the name.
                    AppointmentDayCloseButton { finish(nil) }
                        .disabled(working != nil)
                        .opacity(working != nil ? 0.4 : 1)
                        .padding(.vertical, -10)
                        .padding(.trailing, -5)
                }
                // Under the name and the X, so the day, the time and the length have the whole width and stay on one line.
                Text(AppointmentDayCalendar.when(appointment))
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
                if let status = AppointmentStatus(rawValue: appointment.status) {
                    HStack(spacing: 10) {
                        AppointmentDayStatusIcon(kind: AppointmentDayStatusIcon.Kind(status))
                        Text(status.title)
                            .pfFont(16, .semibold)
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
            .padding(.bottom, 16)
            .onGeometryChange(for: CGFloat.self) { proxy in
                proxy.size.height
            } action: { height in
                let whole = height.rounded(.up)
                if whole != contentHeight { contentHeight = whole }
            }
        }
        // Nothing to scroll while it all fits.
        .scrollBounceBehavior(.basedOnSize)
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

    /// A phone number or an email address as a link. Its tap area reaches half-way to the lines above and below without moving
    /// anything, and VoiceOver reads the line as one ("Phone, (312) 555-0144, link").
    @ViewBuilder
    private func linkLine(_ label: String, _ value: String, url: URL?) -> some View {
        if let url {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(label)
                    .pfFont(16)
                    .foregroundStyle(SettingsLook.muted)
                    .accessibilityHidden(true)
                Spacer(minLength: 8)
                Link(destination: url) {
                    Text(value)
                        .pfFont(16, .semibold)
                        .foregroundStyle(Theme.blue)
                        .multilineTextAlignment(.trailing)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .padding(.vertical, 8)
                        .padding(.leading, 12)
                        .contentShape(Rectangle())
                }
                .padding(.vertical, -8)
                .padding(.leading, -12)
                .accessibilityLabel("\(label), \(value)")
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
                stepPill("Confirm", step: AppointmentStatus.confirmed.rawValue) { change(to: .confirmed) }
            } else if confirmed {
                stepPill("Complete", step: AppointmentStatus.completed.rawValue) { change(to: .completed) }
            } else {
                Button("Done") { finish(nil) }
                    .buttonStyle(AppointmentDayPillStyle(kind: .primary))
                    .disabled(working != nil)
            }
            if appointment.payable {
                stepPill("Record payment", step: "pay", kind: .soft) { choosingTender = true }
            }
            if confirmed && !appointment.paid {
                stepPill("No show", step: AppointmentStatus.noshow.rawValue, kind: .soft) { ask(.status(.noshow), appointment) }
            }
            if appointment.paid {
                textButton("Void payment", step: "void", color: Theme.blue) { ask(.voiding, appointment) }
            }
            if (pending || confirmed) && !appointment.paid {
                textButton("Cancel", step: AppointmentStatus.cancelled.rawValue, color: Theme.error) { ask(.status(.cancelled), appointment) }
            }
        }
    }

    /// A step as a 48 pt pill. While its step runs it keeps its own colour with a spinner on it (pressing it again does nothing),
    /// and the other steps wait, pale.
    private func stepPill(_ title: String, step: String, kind: AppointmentDayPillStyle.Kind = .primary, action: @escaping () -> Void) -> some View {
        let running = working == step
        return Button {
            if working == nil && !closing { action() }
        } label: {
            if running {
                ProgressView()
                    .tint(kind == .primary ? Color.white : Color.primary)
            } else {
                Text(title)
            }
        }
        .buttonStyle(AppointmentDayPillStyle(kind: kind))
        .disabled(working != nil && !running)
        .accessibilityLabel(title)
        .accessibilityValue(running ? "In progress" : "")
    }

    /// A step in words (Void payment, Cancel), with a spinner in their place while it runs.
    private func textButton(_ title: String, step: String, color: Color, action: @escaping () -> Void) -> some View {
        let running = working == step
        return Button {
            if working == nil && !closing { action() }
        } label: {
            ZStack {
                if running {
                    ProgressView()
                        .tint(color)
                } else {
                    Text(title)
                        .pfFont(17, .semibold)
                        .foregroundStyle(color)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(working != nil && !running)
        .accessibilityLabel(title)
        .accessibilityValue(running ? "In progress" : "")
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
        guard let appointment, let business = model.site, working == nil, !closing else { return }
        working = status.rawValue
        model.idle.touch()
        Task {
            do {
                _ = try await list.setStatus(appointment, to: status, siteID: business.id)
                Haptics.success()
                closing = true
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
        guard let appointment, let business = model.site, working == nil, !closing else { return }
        working = "pay"
        model.idle.touch()
        Task {
            do {
                _ = try await list.recordPayment(appointment, tender: tender, siteID: business.id)
                Haptics.success()
                closing = true
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
        guard let appointment, let business = model.site, working == nil, !closing else { return }
        working = "void"
        model.idle.touch()
        Task {
            do {
                _ = try await list.voidPayment(appointment, siteID: business.id)
                Haptics.success()
                closing = true
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

    /// The number to dial: its digits, with a leading +. It stops where the number does, at a letter ("ext 5", "x12"), a comma,
    /// a semicolon, a slash, # or * (what the phone pad offers for an extension), so an extension or a second number written
    /// after it is not dialled as part of the first.
    private func phoneURL(_ phone: String) -> URL? {
        var digits = ""
        for character in phone.trimmed {
            if character.isASCII && character.isNumber {
                digits.append(character)
            } else if character == "+" && digits.isEmpty {
                digits.append(character)
            } else if character.isLetter || ",;/#*".contains(character) {
                if digits.contains(where: { $0.isNumber }) { break }
            }
        }
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
