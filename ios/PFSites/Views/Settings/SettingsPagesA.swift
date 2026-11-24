import SwiftUI

// PLACEHOLDERS, replaced by the Settings A agent: Business information (E11), Closeout settings (E12), Appointment booking (E10).
// Nothing here may ship; each struct keeps its name and becomes the real page (it may move to its own file).

struct BusinessInformationPage: View {
    var body: some View { SettingsPage(title: "Business information") { EmptyView() } }
}

struct CloseoutSettingsPage: View {
    var body: some View { SettingsPage(title: "Closeout settings") { EmptyView() } }
}

struct AppointmentBookingPage: View {
    var body: some View { SettingsPage(title: "Appointment booking") { EmptyView() } }
}
