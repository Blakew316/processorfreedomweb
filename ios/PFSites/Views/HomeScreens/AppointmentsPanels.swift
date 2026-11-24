import SwiftUI

/// Which panel covers the day view.
enum AppointmentDayPanel: Hashable {
    case employees, attributes
}

/// Employee(s) (the owner's photo): All, a hairline, then a checkbox for "Any available" and for each person on the team, as the
/// website's Employee(s) panel lists them. Show results is ready once the choice differs from what the day shows.
struct AppointmentDayEmployeesPanel: View {
    let list: AppointmentsModel
    let close: () -> Void
    /// nil: everyone, people the list learns of later too, until a box is changed.
    @State private var chosen: Set<String>?

    init(list: AppointmentsModel, close: @escaping () -> Void) {
        self.list = list
        self.close = close
        _chosen = State(initialValue: list.employees)
    }

    private var choices: [String] { list.employeeChoices }

    private func isOn(_ name: String) -> Bool { chosen?.contains(name) ?? true }

    private var allOn: Bool { choices.allSatisfy { isOn($0) } }

    var body: some View {
        AppointmentDayPanelFrame(title: "Employee(s)", buttonInset: 13, changed: list.employeeFilter(chosen) != list.employeeFilter(list.employees), close: close, apply: apply) {
            VStack(spacing: 0) {
                AppointmentDayCheckRow(title: "All", on: allOn) {
                    chosen = allOn ? [] : nil
                }
                AppointmentDayHairline()
                    .padding(.horizontal, 17)
                ForEach(choices, id: \.self) { name in
                    AppointmentDayCheckRow(title: name, on: isOn(name)) {
                        var set = chosen ?? Set(choices)
                        if set.contains(name) { set.remove(name) } else { set.insert(name) }
                        chosen = set
                    }
                }
            }
        }
    }

    /// Everyone chosen shows everyone, people added later too (the website keeps no list then).
    private func apply() {
        list.employees = list.employeeFilter(chosen)
        close()
    }
}

/// Appointment attributes (the owner's photo): All, the grey "Appointment status" band with the five statuses the server gives
/// appointments, each with its icon, then the grey "Order status" band. Its two rows are the website's, shown greyed and unchecked:
/// they cannot be chosen, as on the website.
struct AppointmentDayAttributesPanel: View {
    let list: AppointmentsModel
    let close: () -> Void
    @State private var chosen: Set<AppointmentStatus>

    init(list: AppointmentsModel, close: @escaping () -> Void) {
        self.list = list
        self.close = close
        _chosen = State(initialValue: list.statuses ?? Set(AppointmentStatus.allCases))
    }

    private var applied: Set<AppointmentStatus> { list.statuses ?? Set(AppointmentStatus.allCases) }
    private var allOn: Bool { chosen.count == AppointmentStatus.allCases.count }

    var body: some View {
        AppointmentDayPanelFrame(title: "Appointment attributes", buttonInset: 17, changed: chosen != applied, close: close, apply: apply) {
            VStack(spacing: 0) {
                AppointmentDayCheckRow(title: "All", on: allOn) {
                    chosen = allOn ? [] : Set(AppointmentStatus.allCases)
                }
                AppointmentDayHairline()
                    .padding(.horizontal, 17)
                AppointmentDayBand(title: "Appointment status")
                ForEach(AppointmentStatus.allCases) { status in
                    AppointmentDayCheckRow(title: status.title, icon: AppointmentDayStatusIcon.Kind(status), on: chosen.contains(status)) {
                        if chosen.contains(status) { chosen.remove(status) } else { chosen.insert(status) }
                    }
                }
                AppointmentDayBand(title: "Order status")
                AppointmentDayCheckRow(title: "Open", icon: .open, on: false, greyed: true) {}
                AppointmentDayCheckRow(title: "Partially paid", icon: .partlyPaid, on: false, greyed: true) {}
            }
        }
    }

    private func apply() {
        list.statuses = allOn ? nil : chosen
        close()
    }
}

/// The frame both panels share (the photos): the title with the ringed X under the navigation bar, a hairline, the rows (they
/// scroll), a hairline, then Cancel and Show results. It covers the day view below the bar, the way the photos show it.
struct AppointmentDayPanelFrame<Content: View>: View {
    let title: String
    /// The pills' side margin: 13 pt under Employee(s) and 17 pt under Appointment attributes, as in the two photos.
    let buttonInset: CGFloat
    let changed: Bool
    let close: () -> Void
    let apply: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                Text(title)
                    .pfFont(20, .bold, relativeTo: .title3)
                    .foregroundStyle(Color.primary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                AppointmentDayCloseButton(action: close)
            }
            .padding(.leading, 17)
            .padding(.trailing, 8)
            .padding(.top, 5)
            .padding(.bottom, 4)
            AppointmentDayHairline()
            ScrollView {
                content()
                    .padding(.top, 16)
                    .padding(.bottom, 16)
            }
            AppointmentDayHairline()
            VStack(spacing: 8) {
                Button("Cancel", action: close)
                    .buttonStyle(AppointmentDayPillStyle(kind: .soft))
                Button("Show results", action: apply)
                    .buttonStyle(AppointmentDayPillStyle(kind: .primary))
                    .disabled(!changed)
            }
            .padding(.horizontal, buttonInset)
            .padding(.top, 16)
            .padding(.bottom, 12)
        }
        .background(Color(.systemBackground).ignoresSafeArea(edges: .bottom))
        .accessibilityAddTraits(.isModal)
    }
}

/// A checkbox row (the photos): 56 pt with just a name, centred; 62 pt with a status icon, the icon 16 pt from the row's top and
/// the name 8 pt after it, sitting 3 pt low. The checkbox is 37 pt from the edge. Greyed rows cannot be changed.
struct AppointmentDayCheckRow: View {
    let title: String
    var icon: AppointmentDayStatusIcon.Kind? = nil
    let on: Bool
    var greyed = false
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            row
                .padding(.leading, 37)
                .padding(.trailing, 17)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(greyed)
        .accessibilityLabel(title)
        .accessibilityValue(on ? "Checked" : "Not checked")
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    @ViewBuilder
    private var row: some View {
        if let icon {
            HStack(spacing: 0) {
                AppointmentDayCheckbox(on: on, greyed: greyed)
                AppointmentDayStatusIcon(kind: icon, greyed: greyed)
                    .padding(.leading, 12)
                label
                    .offset(y: 3)
                    .padding(.leading, 8)
                Spacer(minLength: 0)
            }
            .padding(.top, 16)
            .padding(.bottom, 22)
        } else {
            HStack(spacing: 0) {
                AppointmentDayCheckbox(on: on, greyed: greyed)
                label
                    .padding(.leading, 12.5)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 6)
            .frame(minHeight: 56)
        }
    }

    private var label: some View {
        Text(title)
            .pfFont(16, .medium)
            .foregroundStyle(greyed ? SettingsLook.greyed : Color.primary)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A grey band naming a group ("Appointment status", "Order status"), 56 pt with a hairline under it, 17 pt in from each side.
struct AppointmentDayBand: View {
    let title: String

    var body: some View {
        VStack(spacing: 0) {
            Text(title)
                .pfFont(18.5, .bold, relativeTo: .headline)
                .foregroundStyle(Color.primary)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                .padding(.horizontal, 16.67)
                .background(AppointmentDayLook.band)
            AppointmentDayHairline()
        }
        .padding(.horizontal, 17)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}
