import SwiftUI

@main
struct PFSitesApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            // The standard text size at most, as Clover Go keeps it: a larger text size set on the phone does not enlarge the app.
            RootView()
                .environment(AppModel.shared)
                .tint(Theme.blue)
                .dynamicTypeSize(...DynamicTypeSize.large)
        }
    }
}
