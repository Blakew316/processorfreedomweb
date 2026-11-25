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

    /// The kinds of link that open in their own app: mail, phone and text. No other kind of address is handed to another app.
    static let appSchemes: Set<String> = ["mailto", "tel", "sms"]

    /// A page in Safari inside the app (terms, help, a customer's site). Mail, phone and text links go to their apps.
    static func safari(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            if appSchemes.contains(url.scheme?.lowercased() ?? "") { UIApplication.shared.open(url, options: [:], completionHandler: nil) }
            return
        }
        let controller = SFSafariViewController(url: url)
        controller.dismissButtonStyle = .done
        present(controller)
    }

    /// Save to Files, AirDrop, Mail and the rest, for a downloaded or exported file. The copy made for the sheet is not left on
    /// the phone (a report, a set of recovery codes): it is removed at once when the sheet is closed without a choice, and ten
    /// minutes after a choice, as whatever was chosen (a print job, Mail, what was copied) may still be reading the file when
    /// the sheet reports it is done. A choice the person backed out of leaves the sheet up, so the file stays for the next
    /// choice. Whatever is left goes when the dashboard closes and at the next launch.
    static func share(_ file: URL) {
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.completionWithItemsHandler = { activity, completed, _, _ in
            if completed {
                DispatchQueue.main.asyncAfter(deadline: .now() + 600) { DownloadCenter.remove(file) }
            } else if activity == nil {
                DownloadCenter.remove(file)
            }
        }
        present(sheet)
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

    /// The server's own words in an alert of their own, without a title (a 403, for example: shown, never a sign-out).
    static func message(_ text: String) {
        let controller = UIAlertController(title: nil, message: text, preferredStyle: .alert)
        controller.addAction(UIAlertAction(title: "OK", style: .default))
        present(controller)
    }

    static func openNotificationSettings() {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
    }
}
