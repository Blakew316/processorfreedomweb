import SwiftUI

/// App security and privacy (E9, in E10's sub-page layout): the app's own sign-in settings on this iPhone.
struct AppSecurityView: View {
    @Environment(AppModel.self) private var model
    @State private var faceIDBusy = false
    @State private var pushBusy = false
    @State private var confirmLogOut = false
    @State private var faceIDWanted = false
    @State private var pushWanted = false
    @State private var appearance = Appearance.choice

    static let lockTitle = "Lock after 15 minutes without activity"

    /// Change location is offered by the header's switch-location rule: with more than one business, or after a team member's
    /// passcode unlock (that session covers only the business that gave out the passcode, and the location list is where they
    /// sign in with email to see the rest).
    static func offersChangeLocation(_ model: AppModel) -> Bool {
        model.canChangeLocation
    }

    var body: some View {
        SettingsListScreen(title: "App security and privacy") {
            // The three settings of the owner's photo first, under Clover's "Clover Go settings" band; then the app's own.
            SettingsListBand(title: "PF Sites settings")

            if model.biometry != .none {
                biometricRow
            }

            timeoutRow

            analyticsRow

            appearanceRow

            SettingsRowView(title: "Change passcode", enabled: Keychain.device != nil) {
                model.shell.cover = .changePasscode
            }

            notificationsRow

            SettingsRowView(title: "Two-step sign-in", subtitle: twoStepStatus, small: true, enabled: true) {
                model.shell.push(.page("profile"))
            }

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

    /// Face ID (or Touch ID) as the photo shows it: the name in bold with the note under it, and the switch at the right.
    private var biometricRow: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(model.biometry.name)
                        .pfFont(17.5, .semibold)
                        .foregroundStyle(Color.primary)
                    Text("Access your account using your fingerprint or face ID, which helps keep your information secure.")
                        .pfFont(16)
                        .foregroundStyle(SettingsLook.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Toggle(model.biometry.name, isOn: $faceIDWanted)
                    .labelsHidden()
                    .tint(Theme.blue)
                    .disabled(faceIDBusy)
            }
            .padding(.leading, 24)
            .padding(.trailing, 20)
            .padding(.vertical, 16)
            SettingsListSeparator()
        }
    }

    /// The app locks after 15 minutes without activity, a fixed rule, so the chevron is greyed.
    private var timeoutRow: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Inactivity timeout")
                        .pfFont(17.5, .semibold)
                        .foregroundStyle(Color.primary)
                    Text("15 minutes")
                        .pfFont(17.5)
                        .foregroundStyle(Color.primary)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(SettingsLook.greyed)
                    .padding(.top, 3)
                    .accessibilityHidden(true)
            }
            .padding(.leading, 24)
            .padding(.trailing, 24)
            .padding(.vertical, 16)
            .accessibilityElement(children: .combine)
            SettingsListSeparator()
        }
    }

    /// How the app looks on this iPhone: the iPhone's own light or dark setting, or always light, or always dark. Tapping the row
    /// opens the three choices with the chosen one ticked; the whole app changes straight away.
    private var appearanceRow: some View {
        VStack(spacing: 0) {
            Menu {
                Picker("Appearance", selection: $appearance) {
                    ForEach(AppearanceChoice.allCases) { choice in
                        Text(choice.title).tag(choice)
                    }
                }
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Appearance")
                            .pfFont(17.5, .semibold)
                            .foregroundStyle(Color.primary)
                        Text(appearance.title)
                            .pfFont(17.5)
                            .foregroundStyle(Color.primary)
                    }
                    .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.primary)
                        .accessibilityHidden(true)
                }
                .padding(.leading, 24)
                .padding(.trailing, 30)
                .padding(.vertical, 17)
                .frame(maxWidth: .infinity, minHeight: 55, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Appearance")
            .accessibilityValue(appearance.title)
            SettingsListSeparator()
        }
        .onChange(of: appearance) { _, choice in
            Appearance.set(choice)
        }
    }

    /// PF Sites collects no app analytics, so the switch is off and cannot be turned on.
    private var analyticsRow: some View {
        VStack(spacing: 0) {
            Toggle(isOn: .constant(false)) {
                Text("App analytics")
                    .pfFont(17.5, .semibold)
                    .foregroundStyle(SettingsLook.greyed)
            }
            .tint(Theme.blue)
            .disabled(true)
            .padding(.leading, 24)
            .padding(.trailing, 20)
            .padding(.vertical, 10)
            .frame(minHeight: 55)
            .accessibilityValue("Off")
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
