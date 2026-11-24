import SwiftUI

/// App security and privacy (E9): the app's own sign-in settings on this iPhone.
struct AppSecurityView: View {
    @Environment(AppModel.self) private var model
    @State private var faceIDBusy = false
    @State private var pushBusy = false
    @State private var confirmLogOut = false
    @State private var faceIDWanted = false
    @State private var pushWanted = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Global settings")
                    .pfFont(17, .semibold)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 17)
                    .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
                    .background(Color(.secondarySystemBackground))
                    .accessibilityAddTraits(.isHeader)

                SettingsRowView(title: "Change passcode", enabled: Keychain.device != nil) {
                    model.shell.cover = .changePasscode
                }

                if model.biometry != .none {
                    toggleRow(title: model.biometry.name, detail: "Open PF Sites with \(model.biometry.name) instead of typing your passcode.", isOn: $faceIDWanted, busy: faceIDBusy)
                }

                notificationsRow

                SettingsRowView(title: "Two-step sign-in", subtitle: twoStepStatus, small: true, enabled: true) {
                    model.shell.push(.page("profile"))
                }

                infoRow(title: "Lock after 15 minutes without activity", detail: "For your security, PF Sites locks itself after 15 minutes without a tap or typing, and asks for your passcode again.")

                if model.sites.count > 1 {
                    SettingsRowView(title: "Change location", enabled: true) {
                        model.shell.sheet = .locations
                    }
                }

                Button {
                    confirmLogOut = true
                } label: {
                    Text("Log out")
                        .pfFont(20, .medium)
                        .foregroundStyle(Color.red)
                        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                        .padding(.horizontal, 17)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, 12)
            }
        }
        .background(Color(.systemBackground))
        .navigationTitle("App security and privacy")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("App security and privacy")
                    .pfFont(18, .bold)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .steadyNavigationBar()
        .onAppear {
            faceIDWanted = model.faceIDOn
            pushWanted = model.pushOn
        }
        .task {
            await model.refreshPushStatus()
            pushWanted = model.pushOn
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
            SettingsRowView(title: "Notifications", subtitle: "Turned off in iOS Settings. Tap to open Settings.", small: true, enabled: true) {
                UIPresenter.openNotificationSettings()
            }
        } else {
            toggleRow(title: "Notifications", detail: "New orders and booking requests on this iPhone.", isOn: $pushWanted, busy: pushBusy)
        }
    }

    private func toggleRow(title: String, detail: String, isOn: Binding<Bool>, busy: Bool) -> some View {
        VStack(spacing: 0) {
            Toggle(isOn: isOn) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .pfFont(20, .medium)
                    Text(detail)
                        .pfFont(14)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(Theme.blue)
            .disabled(busy)
            .padding(.horizontal, 17)
            .padding(.vertical, 14)
            .frame(minHeight: 60)
            Divider()
                .padding(.leading, 17)
        }
    }

    private func infoRow(title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .pfFont(20, .medium)
                Text(detail)
                    .pfFont(14)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 17)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .accessibilityElement(children: .combine)
            Divider()
                .padding(.leading, 17)
        }
    }
}
