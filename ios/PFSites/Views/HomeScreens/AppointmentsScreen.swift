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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var started = false
    @State private var panel: AppointmentDayPanel? = nil
    @State private var pickingFromTitle = false
    @State private var pickingFromButton = false
    /// The calendar's choice: noon of the day on screen when it opens, in the business's time zone.
    @State private var pickerDate = Date()
    /// The time zone the calendar opened in (the business's), so its own "today" is the business's today and a day tapped reads
    /// back as that day.
    @State private var pickerZone = TimeZone.current
    @State private var opened: Opened? = nil
    @State private var toast: String? = nil
    /// The height of the day view under the bar: an appointment's sheet opens no taller than this by itself.
    @State private var roomHeight: CGFloat = 0
    /// VoiceOver goes back to the round button whose panel has just closed.
    @AccessibilityFocusState private var returnFocus: AppointmentDayPanel?

    private struct Opened: Identifiable {
        let id: String
    }

    private struct PollKey: Hashable {
        let active: Bool
        let ready: Bool
        let site: String
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
                // Sliding up from the foot of the screen; fading in for someone who has asked iOS for less motion.
                panelView(panel)
                    .transition(reduceMotion ? AnyTransition.opacity : AnyTransition.move(edge: .bottom))
                    .zIndex(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.height
        } action: { height in
            if height != roomHeight { roomHeight = height }
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
            // Opened from Home it starts on today; back from Create appointment it stays on the day it showed.
            if !started {
                started = true
                list.startOnToday()
            }
        }
        // Runs each time the day view comes into sight (also back from Create appointment), and again when the app comes back.
        .task(id: PollKey(active: scenePhase == .active, ready: model.phase == .ready, site: model.site?.id ?? "")) {
            await poll()
        }
        // A day tapped in the calendar shows at once and closes it (the day already on screen changes nothing).
        .onChange(of: pickerDate) { _, picked in
            let day = AppointmentDayCalendar.day(picked, in: pickerZone)
            guard pickingFromTitle || pickingFromButton, day != list.day else { return }
            model.idle.touch()
            list.pick(day)
            pickingFromTitle = false
            pickingFromButton = false
        }
        .sheet(item: $opened, onDismiss: { Task { await refresh() } }) { item in
            AppointmentDaySheet(list: list, appointmentID: item.id, room: roomHeight) { message in
                opened = nil
                if let message { show(message) }
            }
            .environment(model)
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

    // MARK: The row under the bar (the photo: the day 16 pt bold, then 48 pt circles 12, 8 and 8 pt apart, 16 pt from the edge)

    private var toolbarRow: some View {
        let shown = list
        return HStack(spacing: 0) {
            Button {
                openCalendar()
                pickingFromTitle = true
            } label: {
                // The photo's day begins 32.3 pt from the edge (31 pt, then the letter's own side space) and its chevron 21.3 pt
                // after the last figure.
                HStack(spacing: 20.67) {
                    Text(AppointmentDayCalendar.title(shown.day, today: shown.today))
                        .pfFont(16, .bold)
                        .foregroundStyle(Color.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    AppointmentDayGlyph(kind: .chevronDown)
                        .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                        .frame(width: 13.33, height: 7.33)
                }
                .padding(.leading, 15)
                .frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .popover(isPresented: $pickingFromTitle) { dayPicker }
            .accessibilityLabel(AppointmentDayCalendar.long(shown.day))
            .accessibilityHint("Choose a day")

            Spacer(minLength: 12)

            roundButton(.calendar, label: "Choose a day", count: nil) {
                openCalendar()
                pickingFromButton = true
            }
            .popover(isPresented: $pickingFromButton) { dayPicker }
            roundButton(.people, label: "Employee(s)", count: shown.employeesShown) { open(.employees) }
                .accessibilityFocused($returnFocus, equals: .employees)
                .padding(.leading, 12)
            roundButton(.sliders, label: "Appointment attributes", count: shown.statusesShown) { open(.attributes) }
                .accessibilityFocused($returnFocus, equals: .attributes)
                .padding(.leading, 8)
            Button {
                model.idle.touch()
                // A second tap before the form has slid in would open it twice.
                if case .createAppointment = model.shell.home.last { return }
                model.shell.push(.createAppointment(date: nil, time: nil, employee: nil))
            } label: {
                // The photo's "+" sits 1.67 pt below the middle of its circle.
                AppointmentDayGlyph(kind: .plus)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 1.25, lineCap: .round))
                    .frame(width: 11.33, height: 11.33)
                    .offset(y: 1.67)
                    .frame(width: 48, height: 48)
                    .background(Theme.blue, in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 8)
            .accessibilityLabel("Create appointment")
        }
        .padding(.horizontal, 16)
        // 26 pt under the bar puts the buttons where the photo has them (133 pt down) on the owner's iPhone, whose bar ends
        // 107 pt down (3 pt lower than on the 375 pt wide simulator).
        .padding(.top, 26)
        // Room under the buttons, so that cards scrolling up are cut off a little below them, not against them (the day at
        // rest starts where it did: the list has 8 pt less above it).
        .padding(.bottom, 8)
    }

    /// A 48 pt grey circle with a brand-blue drawing; a count in a blue dot when its filter leaves something out, as the website's
    /// buttons show it.
    private func roundButton(_ glyph: AppointmentDayGlyph.Kind, label: String, count: Int?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            // In the photo the two people sit 1 pt above the middle of their circle; the other drawings are centred.
            AppointmentDayGlyph(kind: glyph)
                .stroke(Theme.blue, style: StrokeStyle(lineWidth: 1.25, lineCap: .round, lineJoin: .round))
                .frame(width: glyph.size.width, height: glyph.size.height)
                .offset(y: glyph == .people ? -1 : 0)
                .frame(width: 48, height: 48)
                .background(AppointmentDayLook.grey, in: Circle())
                .overlay(alignment: .topTrailing) {
                    if let count {
                        Text(String(count))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Color.white)
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

    /// The calendar opens on the day on screen, on the business's clock.
    private func openCalendar() {
        model.idle.touch()
        let zone = list.zone
        if zone.identifier != pickerZone.identifier { pickerZone = zone }
        if let shownDate = AppointmentDayCalendar.date(list.day, in: zone), shownDate != pickerDate { pickerDate = shownDate }
    }

    /// The calendar for choosing the day, in the business's time zone (its marked "today" is the business's today): from the first
    /// day the server sends appointments for (30 days back) onward.
    private var dayPicker: some View {
        let zone = pickerZone
        let firstNoon = list.firstDay.flatMap { AppointmentDayCalendar.date($0, in: zone) }
        let first = firstNoon.map { AppointmentDayCalendar.calendar(in: zone).startOfDay(for: $0) } ?? Date.distantPast
        return DatePicker("Day", selection: $pickerDate, in: first..., displayedComponents: .date)
            .datePickerStyle(.graphical)
            .labelsHidden()
            .tint(Theme.blue)
            .environment(\.timeZone, zone)
            .frame(width: 320)
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
                // The spinner takes the message's place while it tries again.
                Button("Try again") { Task { await retry() } }
                    .buttonStyle(SolidButtonStyle(radius: 6, height: 44, size: 17))
                    .frame(maxWidth: 200)
            }
            .padding(.horizontal, 32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 12) {
                    if !shown.loadError.isEmpty {
                        // This login may not see them: the server's words, plainly.
                        Text(shown.loadError)
                            .pfFont(16)
                            .foregroundStyle(SettingsLook.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(shown.dayList) { appointment in
                        card(appointment)
                    }
                    if shown.dayList.isEmpty && shown.loadError.isEmpty {
                        // A day with nothing to show is plain empty space, as in the photo; VoiceOver is told why.
                        Color.clear
                            .frame(height: 44)
                            .accessibilityElement()
                            .accessibilityLabel(shown.dayIsFilteredAway ? "No appointments match the filters" : "No appointments")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 32)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .refreshable { await refresh() }
        }
    }

    /// One appointment in the app's card style: the time, the customer, the service and who it is with, and its status icon.
    private func card(_ appointment: Appointment) -> some View {
        let status = AppointmentStatus(rawValue: appointment.status)
        let service = AppointmentDayCalendar.service(appointment)
        let employee = AppointmentDayCalendar.employee(appointment)
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
            AppointmentDayEmployeesPanel(list: list) { closePanel() }
        case .attributes:
            AppointmentDayAttributesPanel(list: list) { closePanel() }
        }
    }

    /// Closes the panel; once it has slid away, VoiceOver goes back to the round button that opened it.
    private func closePanel() {
        let which = panel
        panel = nil
        guard let which else { return }
        Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            returnFocus = which
        }
    }

    // MARK: Keeping it fresh

    /// Loads now, then each minute while the day view is on screen and the app is open and unlocked.
    private func poll() async {
        guard scenePhase == .active, model.phase == .ready, let business = model.site else { return }
        let shown = list
        // The first read after coming back takes an earlier failure's message away while it tries again.
        await shown.retry(siteID: business.id)
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 60_000_000_000)
            guard !Task.isCancelled else { return }
            await shown.load(siteID: business.id)
        }
    }

    private func refresh() async {
        guard let business = model.site else { return }
        await list.load(siteID: business.id)
    }

    private func retry() async {
        guard let business = model.site else { return }
        await list.retry(siteID: business.id)
    }

    private func show(_ text: String) {
        withAnimation(.snappy) { toast = text }
        Task {
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            withAnimation(.easeOut(duration: 0.25)) {
                if toast == text { toast = nil }
            }
        }
    }
}
