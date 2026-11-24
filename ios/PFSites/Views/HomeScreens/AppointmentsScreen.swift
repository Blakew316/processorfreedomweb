import SwiftUI

/// Home → Calendar: the Appointments day view, like the owner's Clover photo. The bar has the bold title; under it the day
/// ("Nov 23" with a chevron: a calendar to choose the day), round grey buttons with brand-blue drawings (the same calendar, the
/// Employee(s) panel, the Appointment attributes panel) and the brand-blue "+" (Create appointment). Below, the day's appointments
/// that pass both filters, in time order, as cards; a day with none is plain empty space, as in the photo. Tapping one opens its
/// sheet with the website's actions. It loads when it appears (so one made in Create appointment shows on the way back), on pull,
/// when the app comes back to the front, and each minute while it is on screen.
struct AppointmentsScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var started = false
    /// Counts the times the day view came back into sight (Create appointment closing), so each one loads the day again.
    @State private var returns = 0
    @State private var panel: AppointmentDayPanel? = nil
    @State private var pickingFromTitle = false
    @State private var pickingFromButton = false
    @State private var opened: Opened? = nil
    @State private var toast: String? = nil

    private struct Opened: Identifiable {
        let id: String
    }

    private struct PollKey: Hashable {
        let active: Bool
        let ready: Bool
        let site: String
        let returns: Int
    }

    init() {}

    /// The open business's model: its filters are kept while the business is open.
    private var list: AppointmentsModel { AppointmentsModel.forShell(model.shellID) }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                toolbarRow
                content
            }
            .accessibilityHidden(panel != nil)
            if let panel {
                panelView(panel)
                    .transition(.move(edge: .bottom))
                    .zIndex(1)
            }
        }
        .animation(.snappy(duration: 0.3), value: panel)
        .background(Color(.systemBackground))
        .navigationTitle("Appointments")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Appointments")
                    .pfFont(19, .bold, relativeTo: .headline)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .toolbarVisibility(.hidden, for: .tabBar)
        .steadyNavigationBar()
        .onAppear {
            if started {
                returns += 1
            } else {
                started = true
                list.startOnToday()
            }
        }
        .task(id: PollKey(active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "", returns: returns)) {
            await poll()
        }
        .sheet(item: $opened, onDismiss: { Task { await refresh() } }) { item in
            AppointmentDaySheet(list: list, appointmentID: item.id) { message in
                opened = nil
                if let message { show(message) }
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                GlassToast(text: toast)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: The row under the bar (the photo: the day at 32 pt, then 48 pt circles 12, 8 and 8 pt apart, 16 pt from the edge)

    private var toolbarRow: some View {
        let shown = list
        return HStack(spacing: 0) {
            Button {
                pickingFromTitle = true
            } label: {
                HStack(spacing: 21) {
                    Text(AppointmentDayCalendar.title(shown.day, today: shown.today))
                        .pfFont(16, .bold)
                        .foregroundStyle(Color.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    AppointmentDayGlyph(kind: .chevronDown)
                        .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                        .frame(width: 13.33, height: 7.33)
                }
                .padding(.leading, 16)
                .frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .popover(isPresented: $pickingFromTitle) { dayPicker }
            .accessibilityLabel(AppointmentDayCalendar.long(shown.day))
            .accessibilityHint("Choose a day")

            Spacer(minLength: 12)

            roundButton(.calendar, label: "Choose a day", count: nil) { pickingFromButton = true }
                .popover(isPresented: $pickingFromButton) { dayPicker }
            roundButton(.people, label: "Employee(s)", count: shown.employeesShown) { open(.employees) }
                .padding(.leading, 12)
            roundButton(.sliders, label: "Appointment attributes", count: shown.statusesShown) { open(.attributes) }
                .padding(.leading, 8)
            Button {
                model.idle.touch()
                model.shell.push(.createAppointment(date: nil, time: nil, employee: nil))
            } label: {
                AppointmentDayGlyph(kind: .plus)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 1.33, lineCap: .round))
                    .frame(width: 11.33, height: 11.33)
                    .frame(width: 48, height: 48)
                    .background(Theme.blue, in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 8)
            .accessibilityLabel("Create appointment")
        }
        .padding(.horizontal, 16)
        .padding(.top, 28)
    }

    /// A 48 pt grey circle with a brand-blue drawing; a count in a blue dot when its filter leaves something out, as the website's
    /// buttons show it.
    private func roundButton(_ glyph: AppointmentDayGlyph.Kind, label: String, count: Int?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            AppointmentDayGlyph(kind: glyph)
                .stroke(Theme.blue, style: StrokeStyle(lineWidth: 1.2, lineCap: .round, lineJoin: .round))
                .frame(width: glyph.size.width, height: glyph.size.height)
                .frame(width: 48, height: 48)
                .background(AppointmentDayLook.grey, in: Circle())
                .overlay(alignment: .topTrailing) {
                    if let count {
                        Text(String(count))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 4)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Capsule().fill(Theme.blue))
                            .offset(x: 2, y: -2)
                    }
                }
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityValue(count.map { "\($0) shown" } ?? "")
    }

    /// The calendar for choosing the day: from the first day the server sends appointments for (30 days back) onward.
    private var dayPicker: some View {
        let shown = list
        let first = shown.firstDay.flatMap { AppointmentDayCalendar.date($0) } ?? .distantPast
        let day = Binding<Date>(
            get: { AppointmentDayCalendar.date(shown.day) ?? Date() },
            set: { picked in
                model.idle.touch()
                shown.pick(AppointmentDayCalendar.day(picked))
                pickingFromTitle = false
                pickingFromButton = false
            }
        )
        return DatePicker("Day", selection: day, in: first..., displayedComponents: .date)
            .datePickerStyle(.graphical)
            .labelsHidden()
            .tint(Theme.blue)
            .environment(\.timeZone, AppointmentDayCalendar.zone)
            .frame(minWidth: 300)
            .padding(12)
            .presentationCompactAdaptation(.popover)
    }

    // MARK: The day's appointments

    @ViewBuilder
    private var content: some View {
        let shown = list
        if !shown.loaded && shown.loadError.isEmpty {
            ProgressView()
                .controlSize(.large)
                .tint(Theme.blue)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if !shown.loaded {
            VStack(spacing: 14) {
                Text(shown.loadError)
                    .pfFont(17)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Try again") { Task { await refresh() } }
                    .buttonStyle(SolidButtonStyle(radius: 6, height: 44, size: 17))
                    .frame(maxWidth: 200)
            }
            .padding(.horizontal, 32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 12) {
                    if !shown.loadError.isEmpty {
                        // This login may no longer see them: the server's words, plainly.
                        Text(shown.loadError)
                            .pfFont(16)
                            .foregroundStyle(SettingsLook.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(shown.dayList) { appointment in
                        card(appointment)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 24)
                .padding(.bottom, 32)
            }
            .refreshable { await refresh() }
        }
    }

    /// One appointment in the app's card style: the time, the customer, the service and who it is with, and its status icon.
    private func card(_ appointment: Appointment) -> some View {
        let status = AppointmentStatus(rawValue: appointment.status)
        let service = appointment.service.isEmpty ? "Booking" : appointment.service
        let employee = appointment.employee.isEmpty ? AppointmentsModel.anyAvailable : appointment.employee
        let times = AppointmentDayCalendar.times(appointment)
        return Button {
            model.idle.touch()
            opened = Opened(id: appointment.id)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(times)
                        .pfFont(16, .semibold)
                        .foregroundStyle(Color.primary)
                    Text(appointment.name)
                        .pfFont(20, .bold, relativeTo: .title3)
                        .foregroundStyle(Color.primary)
                        .padding(.top, 2)
                    Text(service)
                        .pfFont(16)
                        .foregroundStyle(SettingsLook.muted)
                    HStack(spacing: 6) {
                        Image(systemName: "person")
                            .font(.system(size: 14))
                            .accessibilityHidden(true)
                        Text(employee)
                            .pfFont(16)
                    }
                    .foregroundStyle(SettingsLook.muted)
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                if let status {
                    AppointmentDayStatusIcon(kind: AppointmentDayStatusIcon.Kind(status))
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SettingsLook.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(SettingsLook.border, lineWidth: 1)
            }
            .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel([times, appointment.name, service, employee, status?.title ?? ""].filter { !$0.isEmpty }.joined(separator: ", "))
        .accessibilityHint("Opens the appointment")
    }

    // MARK: Panels

    private func open(_ which: AppointmentDayPanel) {
        model.idle.touch()
        panel = which
    }

    @ViewBuilder
    private func panelView(_ which: AppointmentDayPanel) -> some View {
        switch which {
        case .employees:
            AppointmentDayEmployeesPanel(list: list) { panel = nil }
        case .attributes:
            AppointmentDayAttributesPanel(list: list) { panel = nil }
        }
    }

    // MARK: Keeping it fresh

    /// Loads now, then each minute while the day view is on screen and the app is open and unlocked.
    private func poll() async {
        guard scenePhase == .active, model.phase == .ready, let business = model.site else { return }
        let shown = list
        while !Task.isCancelled {
            await shown.load(siteID: business.id)
            try? await Task.sleep(nanoseconds: 60_000_000_000)
        }
    }

    private func refresh() async {
        guard let business = model.site else { return }
        await list.load(siteID: business.id)
    }

    private func show(_ text: String) {
        withAnimation(.snappy) { toast = text }
        Task {
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            withAnimation(.easeOut(duration: 0.25)) { if toast == text { toast = nil } }
        }
    }
}
