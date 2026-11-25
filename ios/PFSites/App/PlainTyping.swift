import UIKit

/// iOS's smart punctuation turns a straight ' or " into a curly one, and two hyphens into a dash, as they are typed. That suits
/// a note and is wrong for a password shown while it is typed, which has to reach the server exactly as typed. SwiftUI has no
/// setting for it, so this reaches the text field that is being typed in and switches it off there. The keyboard stays the
/// ordinary one, so a password in any script can still be typed (a letters-only keyboard would stop that).
@MainActor
enum PlainTyping {
    /// Switches smart quotes, dashes and spacing off for the text field in use. Nothing happens when none is, or when they are
    /// off already.
    static func applyToFieldInUse() {
        guard let field = UIResponder.inUse as? UITextField else { return }
        guard field.smartQuotesType != .no || field.smartDashesType != .no || field.smartInsertDeleteType != .no else { return }
        field.smartQuotesType = .no
        field.smartDashesType = .no
        field.smartInsertDeleteType = .no
        // The keyboard takes the new settings up when it is asked to look again.
        field.reloadInputViews()
    }
}

extension UIResponder {
    private static weak var caught: UIResponder?

    /// Whatever is being typed in right now, found the way UIKit offers: an action sent to nobody in particular goes to it first.
    static var inUse: UIResponder? {
        caught = nil
        UIApplication.shared.sendAction(#selector(catchInUse(_:)), to: nil, from: nil, for: nil)
        return caught
    }

    @objc private func catchInUse(_ sender: Any?) {
        UIResponder.caught = self
    }
}
