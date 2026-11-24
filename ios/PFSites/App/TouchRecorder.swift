import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// Notes every touch anywhere in the window for the 15-minute rule. It never recognises a gesture and never delays or
/// cancels a touch, so it cannot get in the way of anything else.
final class TouchRecorder: UIGestureRecognizer, UIGestureRecognizerDelegate {
    override init(target: Any?, action: Selector?) {
        super.init(target: target, action: action)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        delegate = self
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        AppModel.shared.idle.touch()
        state = .failed
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        true
    }
}

/// An invisible view in the main window that, once it is in a window, adds the touch recorder there and tells the
/// overlay windows which window is the app's.
struct WindowSpy: UIViewRepresentable {
    func makeUIView(context: Context) -> SpyView { SpyView() }
    func updateUIView(_ uiView: SpyView, context: Context) {}
}

final class SpyView: UIView {
    private weak var installedOn: UIWindow?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        isUserInteractionEnabled = false
        guard let window = self.window, window !== installedOn else { return }
        installedOn = window
        // Light or dark as chosen in the app, from the window's first frame (a cold start never shows the other one first).
        Appearance.apply(to: window)
        OverlayWindows.shared.attach(window)
        window.addGestureRecognizer(TouchRecorder(target: nil, action: nil))
    }
}
