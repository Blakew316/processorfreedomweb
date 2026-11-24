import UIKit
import UserNotifications

/// Notifications: the device token for Apple push, banners while the app is open, and opening the right page on a tap.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        NetworkMonitor.shared.start()
        DownloadCenter.clearOldFiles()
        Task { await AppModel.shared.refreshPushRegistration() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        AppModel.shared.pushTokenArrived(hex)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        AppModel.shared.pushTokenFailed()
    }

    /// A notification while the app is open still shows as a banner with its sound (new orders should never be missed).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    /// A tap on a notification opens its page, for example /app/site/<id>?tab=orders opens that business's Orders.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let path = response.notification.request.content.userInfo["url"] as? String ?? ""
        await MainActor.run { AppModel.shared.openNotification(path: path) }
    }
}
