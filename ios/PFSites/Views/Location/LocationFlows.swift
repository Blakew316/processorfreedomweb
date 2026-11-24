import SwiftUI

/// "Choose primary location" from the dashboard (the switch-location button, Merchants, Change location).
/// Saving a different business goes on to its passcode step.
struct LocationSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        LocationPickerView(style: .sheet, sites: model.sites, current: model.site?.id, onCancel: { dismiss() }) { chosen in
            model.shell.afterSheet = .switchTo(chosen)
            dismiss()
        }
        .presentationDetents([.large])
        .task { _ = try? await model.loadSites() }
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
                    model.shell.pendingTab = nil
                    dismiss()
                })
            } else if !problem.isEmpty {
                VStack(spacing: 16) {
                    Text(problem)
                        .pfFont(17)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(SolidButtonStyle(radius: 24, height: 48, size: 17))
                        .frame(maxWidth: 220)
                    Button("Cancel") { dismiss() }
                        .pfFont(17)
                }
                .padding(32)
            } else {
                ProgressView().controlSize(.large).tint(Theme.blue)
            }
        }
        .task { await load() }
    }

    private func load() async {
        problem = ""
        do {
            let answer = try await API.get("/api/app/passcode?site=\(Config.query(business.id))")
            has = answer["has"].bool
        } catch {
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
