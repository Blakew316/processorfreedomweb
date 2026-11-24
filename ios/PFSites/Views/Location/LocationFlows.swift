import SwiftUI

/// "Choose primary location" from the dashboard (the switch-location button, Merchants, Change location).
/// Saving a different business goes on to its passcode step. After a team passcode the session covers only that business,
/// so the list shows just that one and offers signing in with email to see them all.
struct LocationSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        LocationPickerView(style: .sheet, sites: model.sites, current: model.site?.id, onCancel: { dismiss() }, onSignInForAll: model.sessionLimited ? { model.signInForAllBusinesses() } : nil) { chosen in
            model.shell.afterSheet = .switchTo(chosen)
            dismiss()
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        .task {
            do {
                try await model.loadSites()
            } catch let error as APIError where error.sessionEnded {
                // Signed out everywhere meanwhile: check, then lock.
                model.sessionEnded()
            } catch {
                // Offline for a moment: the list the app already has stays.
            }
        }
    }
}

/// The passcode step for another business: its passcode when the person has one there, else a new one. Then that business opens.
struct SwitchPasscodeView: View {
    let business: Site
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var has: Bool?
    @State private var problem = ""

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            if let has {
                PasscodeView(step: PasscodeStep(purpose: .switchTo(has: has), site: business.ref), onDone: {
                    // The business changes once this step has closed (the dashboard is rebuilt for it).
                    model.shell.switchAfterCover = business
                    dismiss()
                }, onCancel: {
                    cancel()
                })
            } else {
                // Before the passcode screen is up (the server is being asked, or could not be reached) the step closes with the
                // same X in the same place, so there is always a way back.
                VStack(spacing: 0) {
                    HStack {
                        PasscodeCloseButton { cancel() }
                            .padding(.leading, 6)
                        Spacer()
                    }
                    .frame(height: 44)
                    Spacer()
                    if !problem.isEmpty {
                        VStack(spacing: 16) {
                            Text(problem)
                                .pfFont(17)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                            Button("Try again") { Task { await load() } }
                                .buttonStyle(SolidButtonStyle(radius: 24, height: 48, size: 17))
                                .frame(maxWidth: 220)
                            Button("Cancel") { cancel() }
                                .pfFont(17)
                                .frame(minHeight: 44)
                        }
                        .padding(.horizontal, 32)
                    } else {
                        ProgressView().controlSize(.large).tint(Theme.blue)
                    }
                    Spacer()
                    // As much room under the middle as the X's row takes above it, so the spinner or the message is centred.
                    Color.clear.frame(height: 44)
                }
            }
        }
        .task { await load() }
    }

    private func cancel() {
        model.shell.pendingTab = nil
        dismiss()
    }

    private func load() async {
        problem = ""
        do {
            let answer = try await API.get("/api/app/passcode?site=\(Config.query(business.id))")
            has = answer["has"].bool
        } catch let error as APIError where error.sessionEnded {
            // The session ended (signed out everywhere, or the server dropped it): this step closes and the app locks.
            model.shell.pendingTab = nil
            dismiss()
            model.sessionEnded()
        } catch {
            // A 403 (this session may not open that business) or anything else: the server's words, with Try again.
            problem = (error as? APIError)?.message ?? APIError.unreachableMessage
        }
    }
}

/// Change passcode (Settings → App security and privacy): the current passcode, then a new one twice.
struct ChangePasscodeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            if let business = model.site {
                PasscodeView(step: PasscodeStep(purpose: .change, site: business.ref), onDone: { dismiss() }, onCancel: { dismiss() })
            }
        }
    }
}
