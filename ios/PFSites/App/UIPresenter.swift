import SafariServices
import UIKit

/// Shows UIKit screens (Safari pages, the share sheet, the in-app preview) over whatever is on top.
@MainActor
enum UIPresenter {
    static func top() -> UIViewController? {
        let window = OverlayWindows.shared.mainWindow ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first { $0.isKeyWindow }
        var controller = window?.rootViewController
        while let next = controller?.presentedViewController, !next.isBeingDismissed { controller = next }
        return controller
    }

    static func present(_ controller: UIViewController) {
        guard let top = top() else { return }
        if let popover = controller.popoverPresentationController {
            popover.sourceView = top.view
            popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        top.present(controller, animated: true)
    }

    /// A page in Safari inside the app (terms, help, a customer's site). Other kinds of address go to the app that handles them.
    static func safari(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            return
        }
        let controller = SFSafariViewController(url: url)
        controller.preferredControlTintColor = UIColor(named: "BrandBlue")
        controller.dismissButtonStyle = .done
        present(controller)
    }

    /// Save to Files, AirDrop, Mail and the rest, for a downloaded file.
    static func share(_ file: URL) {
        present(UIActivityViewController(activityItems: [file], applicationActivities: nil))
    }

    /// Our own pages that need the signed-in session (the website preview) open in an in-app browser that shares it.
    static func browser(_ url: URL) {
        let controller = UINavigationController(rootViewController: BrowserController(url: url))
        controller.modalPresentationStyle = .pageSheet
        present(controller)
    }

    static func alert(title: String, message: String) {
        let controller = UIAlertController(title: title, message: message, preferredStyle: .alert)
        controller.addAction(UIAlertAction(title: "OK", style: .default))
        present(controller)
    }

    static func openNotificationSettings() {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
    }
}
