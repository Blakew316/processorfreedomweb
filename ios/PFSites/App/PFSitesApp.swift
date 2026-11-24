import SwiftUI

@main
struct PFSitesApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            // The standard text size at most, as Clover Go keeps it: a larger text size set on the phone does not enlarge the app.
            // Nor does the phone's Bold Text setting thicken its letters: Clover Go's own typeface takes no notice of that
            // setting either, and every weight in the app was chosen against Clover's photos.
            RootView()
                .environment(AppModel.shared)
                .tint(Theme.blue)
                .dynamicTypeSize(...DynamicTypeSize.large)
                .environment(\.legibilityWeight, .regular)
                .onAppear { Appearance.applyToAllWindows() }
        }
    }
}
