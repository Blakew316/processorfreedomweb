import SwiftUI

/// App security and privacy (E9, in E10's sub-page layout): the app's own sign-in settings on this iPhone.
/// The rows of the owner's photo are measured from it (1125 x 2436 px of a 375 x 812 pt phone, 3 px = 1 pt): a row's title has its
/// capitals 21 pt under the row's top, a switch starts 16 pt under it and ends 15 pt from the screen's edge, a note under a title
/// is 14 pt #5C5C5C on 18 pt lines, and a value under a title has its baseline 28 pt under the title's.
struct AppSecurityView: View {
    @Environment(AppModel.self) private var model
    @State private var faceIDBusy = false
    @State private var pushBusy = false
    @State private var confirmLogOut = false
    @State private var faceIDWanted = false
    @State private var pushWanted = false
    @State private var appearance = Appearance.choice
    /// Why a switch went back by itself (the server could not be reached, or Face ID did not answer): said under its row.
    @State private var faceIDProblem = ""
    @State private var pushProblem = ""

    /// The names of two rows, shared with the search across all settings.
    static let timeoutTitle = "Inactivity timeout"
    static let analyticsTitle = "App analytics"

    /// Change location is offered by the header's switch-location rule: with more than one business, or after a team member's
    /// passcode unlock (that session covers only the business that gave out the passcode, and the location list is where they
    /// sign in with email to see the rest).
    static func offersChangeLocation(_ model: AppModel) -> Bool {
        model.canChangeLocation
    }

    var body: some View {
        SettingsListScreen(title: "App security and privacy") {
            // The three settings of the owner's photo first, under Clover's "Clover Go settings" band; then the app's own.
            Section {
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
            } header: {
                SettingsListBand(title: "PF Sites settings")
            }
        }
        .onAppear {
            faceIDWanted = model.faceIDOn
            pushWanted = model.pushOn
        }
        .task {
            await model.refreshPushStatus()
            if !pushBusy { pushWanted = model.pushOn }
            // Two-step sign-in is turned on or off on the Profile page: its state shows here when that page closes.
            await SettingsActions.reloadPerson(model)
        }
        // The switches apply when they change, then show what really happened (iOS may refuse, Face ID may be cancelled).
        .onChange(of: faceIDWanted) { _, wanted in
            guard wanted != model.faceIDOn, !faceIDBusy else { return }
            faceIDBusy = true
            faceIDProblem = ""
            Task {
                await model.applyFaceID(wanted)
                faceIDBusy = false
                if model.faceIDOn != wanted {
                    // Turning it on did not go through: the server could not be reached, or Face ID did not answer.
                    Haptics.error()
                    faceIDProblem = "\(model.biometry.name) could not be turned on. Try again."
                }
                faceIDWanted = model.faceIDOn
            }
        }
        .onChange(of: pushWanted) { _, wanted in
            guard wanted != model.pushOn, !pushBusy else { return }
            pushBusy = true
            pushProblem = ""
            Task {
                let done = wanted ? await model.requestPush() : await model.disablePush()
                await model.refreshPushStatus()
                pushBusy = false
                // Refused in iOS has its own row ("Off in iOS Settings"); anything else is the server not answering.
                if !done, !model.pushDenied, model.pushOn != wanted {
                    Haptics.error()
                    pushProblem = "Notifications could not be turned \(wanted ? "on" : "off"). Check your connection and try again."
                }
                pushWanted = model.pushOn
            }
        }
        // Changed somewhere else meanwhile (the website's own switch, iOS Settings, the lock screen): the switches follow.
        .onChange(of: model.faceIDOn) { _, on in
            if !faceIDBusy, faceIDWanted != on { faceIDWanted = on }
        }
        .onChange(of: model.pushOn) { _, on in
            if !pushBusy, pushWanted != on { pushWanted = on }
        }
        .animation(.snappy, value: faceIDProblem)
        .animation(.snappy, value: pushProblem)
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
            switchRow(title: "Notifications", isOn: $pushWanted, busy: pushBusy, problem: pushProblem)
        }
    }

    /// A row with a switch, as the photo's App analytics row: 55.3 pt tall, the title's capitals 21 pt under the row's top and
    /// the switch 16 pt under it. What went wrong when it was last changed is said under the title.
    private func switchRow(title: String, isOn: Binding<Bool>, busy: Bool = false, problem: String = "", greyed: Bool = false) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                // The switch carries the name for VoiceOver.
                Text(title)
                    .pfFont(17.5, .semibold)
                    .foregroundStyle(greyed ? SettingsLook.greyed : Color.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 16.67)
                    .accessibilityHidden(true)
                Toggle(title, isOn: isOn)
                    .labelsHidden()
                    .tint(Theme.blue)
                    .disabled(busy || greyed)
                    .padding(.top, 16)
            }
            .padding(.leading, 24)
            .padding(.trailing, 15)
            .frame(minHeight: 55.33, alignment: .top)
            rowProblem(problem)
            SettingsListSeparator()
        }
    }

    /// Why a switch went back, in the app's error colour, under its row's words.
    @ViewBuilder
    private func rowProblem(_ problem: String) -> some View {
        if !problem.isEmpty {
            Text(problem)
                .pfFont(14)
                .foregroundStyle(Theme.error)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 24)
                .padding(.trailing, 24)
                .padding(.bottom, 14)
                .transition(.opacity)
        }
    }

    /// Face ID (or Touch ID) as the photo shows it: the name in bold with the note under it, and the switch at the right.
    private var biometricRow: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4.67) {
                    Text(model.biometry.name)
                        .pfFont(17.5, .semibold)
                        .foregroundStyle(Color.primary)
                        .accessibilityHidden(true)
                    Text("Access your account using your fingerprint or face ID, which helps keep your information secure.")
                        .pfFont(14)
                        .foregroundStyle(SettingsListLook.quiet)
                        .lineSpacing(1.3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Toggle(model.biometry.name, isOn: $faceIDWanted)
                    .labelsHidden()
                    .tint(Theme.blue)
                    .disabled(faceIDBusy)
                    .padding(.top, -0.67)
            }
            .padding(.leading, 24)
            .padding(.trailing, 15)
            .padding(.top, 16.67)
            .padding(.bottom, 14.33)
            rowProblem(faceIDProblem)
            SettingsListSeparator()
        }
    }

    /// The app locks after 15 minutes without activity, a fixed rule, so the chevron is greyed.
    private var timeoutRow: some View {
        VStack(spacing: 0) {
            titleAndValue(title: Self.timeoutTitle, value: "15 minutes") {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(SettingsLook.greyed)
            }
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
                titleAndValue(title: "Appearance", value: appearance.title) {
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.primary)
                }
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

    /// A row with a value under its title, as the photo's Inactivity timeout row: 83.3 pt tall, the value's baseline 28 pt under
    /// the title's, and the mark at the right level with the title, 30 pt from the screen's edge like the lists' chevrons.
    private func titleAndValue<Mark: View>(title: String, value: String, @ViewBuilder mark: () -> Mark) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 7.33) {
                Text(title)
                    .pfFont(17.5, .semibold)
                    .foregroundStyle(Color.primary)
                Text(value)
                    .pfFont(17.5)
                    .foregroundStyle(Color.primary)
            }
            .multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            mark()
                .frame(height: 21)
                .padding(.top, 1)
                .accessibilityHidden(true)
        }
        .padding(.leading, 24)
        .padding(.trailing, 30)
        .padding(.top, 16.67)
        .padding(.bottom, 17.33)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// PF Sites collects no app analytics, so the switch is off and cannot be turned on.
    private var analyticsRow: some View {
        switchRow(title: Self.analyticsTitle, isOn: .constant(false), greyed: true)
    }

    private var logOutRow: some View {
        Button {
            confirmLogOut = true
        } label: {
            Text("Log out")
                .pfFont(17.5, .semibold)
                .foregroundStyle(Theme.error)
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, minHeight: 55.33, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
