import SwiftUI

/// The main window: the dashboard (kept alive under the lock screen, which is its own window above), the sign-in steps over it,
/// and the loading screen over everything. The 15-minute warning has its own window too (OverlayWindows), so sheets cannot hide it.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            if model.shellAlive && model.site != nil {
                ShellView()
                    .id(model.shellID)
                    .accessibilityHidden(model.phase != .ready)
            }
            phaseContent
            if model.showLoading {
                LoadingView()
                    .transition(.opacity)
                    .zIndex(10)
            }
        }
        .background(WindowSpy())
        .animation(.easeInOut(duration: 0.3), value: model.showLoading)
        .animation(.easeInOut(duration: 0.25), value: model.phase)
        .task { await model.start() }
        .onChange(of: scenePhase) { _, newPhase in
            model.scenePhaseChanged(newPhase)
        }
    }

    @ViewBuilder
    private var phaseContent: some View {
        switch model.phase {
        case .welcome:
            WelcomeFlow()
                .transition(.opacity)
        case .choosingLocation:
            LocationPickerView(style: .signIn, sites: model.sites, current: nil, onCancel: {}) { chosen in
                model.chooseLocation(chosen)
            }
            .transition(.opacity)
        case .passcode(let step):
            if step.purpose != .lock {
                PasscodeView(step: step)
                    .id(step)
                    .transition(.opacity)
            }
        case .creatingBusiness:
            CreateBusinessView()
                .transition(.opacity)
        case .launching, .ready:
            EmptyView()
        }
    }
}

/// The lock screen's window. It keeps showing the last lock step while it fades away after the right passcode.
struct LockScreen: View {
    @Environment(AppModel.self) private var model
    @State private var step: PasscodeStep?

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            if let step {
                PasscodeView(step: step)
                    .id(step)
            }
        }
        .onAppear {
            if step == nil { step = model.lockStepShowing }
        }
        .onChange(of: model.phase) { _, _ in
            if let showing = model.lockStepShowing { step = showing }
        }
    }
}

/// The dashboard of one business (or the kitchen screen for a kitchen login), with the sheets and full-screen steps it opens.
struct ShellView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var shell = model.shell
        Group {
            if model.site?.isKitchen == true {
                KitchenView()
            } else {
                MainTabsView()
            }
        }
        .sheet(item: $shell.sheet, onDismiss: { shell.sheetClosed() }) { sheet in
            switch sheet {
            case .notifications:
                NotificationsSheet()
                    .environment(model)
            case .locations:
                LocationSheet()
                    .environment(model)
            }
        }
        .fullScreenCover(item: $shell.cover, onDismiss: {
            if let business = shell.switchAfterCover {
                shell.switchAfterCover = nil
                model.switchSite(to: business)
            }
        }) { cover in
            switch cover {
            case .switchTo(let business):
                SwitchPasscodeView(business: business)
                    .environment(model)
            case .changePasscode:
                ChangePasscodeView()
                    .environment(model)
            }
        }
    }
}
