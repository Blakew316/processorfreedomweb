import SwiftUI

/// App security and privacy (E9, in E10's sub-page layout): the app's own sign-in settings on this iPhone.
struct AppSecurityView: View {
    @Environment(AppModel.self) private var model
    @State private var faceIDBusy = false
    @State private var pushBusy = false
    @State private var confirmLogOut = false
    @State private var faceIDWanted = false
    @State private var pushWanted = false

    static let lockTitle = "Lock after 15 minutes without activity"

    /// Change location is offered by the header's switch-location rule: with more than one business, or after a team member's
    /// passcode unlock (that session covers only the business that gave out the passcode, and the location list is where they
    /// sign in with email to see the rest).
    static func offersChangeLocation(_ model: AppModel) -> Bool {
        model.canChangeLocation
    }

    var body: some View {
        SettingsListScreen(title: "App security and privacy") {
            SettingsListBand(title: "Global settings")

            SettingsRowView(title: "Change passcode", enabled: Keychain.device != nil) {
                model.shell.cover = .changePasscode
            }

            if model.biometry != .none {
                toggleRow(title: model.biometry.name, isOn: $faceIDWanted, busy: faceIDBusy)
            }

            notificationsRow

            SettingsRowView(title: "Two-step sign-in", subtitle: twoStepStatus, small: true, enabled: true) {
                model.shell.push(.page("profile"))
            }

            infoRow(Self.lockTitle)

            if Self.offersChangeLocation(model) {
                SettingsRowView(title: "Change location", enabled: true) {
                    model.shell.sheet = .locations
                }
            }

            logOutRow
                .padding(.top, 12)
        }
        .onAppear {
            faceIDWanted = model.faceIDOn
            pushWanted = model.pushOn
        }
        .task {
            await model.refreshPushStatus()
            pushWanted = model.pushOn
            // Two-step sign-in is turned on or off on the Profile page: its state shows here when that page closes.
            await SettingsActions.reloadPerson(model)
        }
        // The switches apply when they change, then show what really happened (iOS may refuse, Face ID may be cancelled).
        .onChange(of: faceIDWanted) { _, wanted in
            guard wanted != model.faceIDOn, !faceIDBusy else { return }
            faceIDBusy = true
            Task {
                await model.applyFaceID(wanted)
                faceIDBusy = false
                faceIDWanted = model.faceIDOn
            }
        }
        .onChange(of: pushWanted) { _, wanted in
            guard wanted != model.pushOn, !pushBusy else { return }
            pushBusy = true
            Task {
                if wanted {
                    await model.requestPush()
                } else {
                    await model.disablePush()
                }
                await model.refreshPushStatus()
                pushBusy = false
                pushWanted = model.pushOn
            }
        }
        .confirmationDialog("Log out of PF Sites on this iPhone?", isPresented: $confirmLogOut, titleVisibility: .visible) {
            Button("Log out", role: .destructive) { Task { await model.signOut() } }
        } message: {
            Text("You'll sign in with your email and password next time.")
        }
    }

    private var twoStepStatus: String {
        guard let person = model.user else { return "" }
        return person.twoFactor || person.textCodes ? "On" : "Off"
    }

    @ViewBuilder
    private var notificationsRow: some View {
        if !model.config.appPush {
            // The server cannot send Apple push yet.
            SettingsRowView(title: "Notifications", subtitle: "Not available yet", small: true, enabled: false) {}
        } else if model.pushDenied {
            // Refused in iOS: only iOS Settings can turn them back on.
            SettingsRowView(title: "Notifications", subtitle: "Off in iOS Settings", small: true, enabled: true) {
                UIPresenter.openNotificationSettings()
            }
        } else {
            toggleRow(title: "Notifications", isOn: $pushWanted, busy: pushBusy)
        }
    }

    /// A row with a switch, in the Settings row style.
    private func toggleRow(title: String, isOn: Binding<Bool>, busy: Bool) -> some View {
        VStack(spacing: 0) {
            Toggle(isOn: isOn) {
                Text(title)
                    .pfFont(17.5, .semibold)
                    .foregroundStyle(Color.primary)
            }
            .tint(Theme.blue)
            .disabled(busy)
            .padding(.leading, 24)
            .padding(.trailing, 20)
            .padding(.vertical, 10)
            .frame(minHeight: 55)
            SettingsListSeparator()
        }
    }

    /// A fact about the app, with nothing to change.
    private func infoRow(_ title: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .pfFont(17.5, .semibold)
                .foregroundStyle(Color.primary)
                .padding(.leading, 24)
                .padding(.trailing, 20)
                .padding(.vertical, 17)
                .frame(maxWidth: .infinity, minHeight: 55, alignment: .leading)
            SettingsListSeparator()
        }
    }

    private var logOutRow: some View {
        Button {
            confirmLogOut = true
        } label: {
            Text("Log out")
                .pfFont(17.5, .semibold)
                .foregroundStyle(Color.red)
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, minHeight: 55, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
