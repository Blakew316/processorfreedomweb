import AVFoundation
import SwiftUI
import UIKit
import VisionKit

/// The full-screen camera (E20): VisionKit's scanner, or the plain camera on phones where VisionKit cannot scan, under the same frame:
/// a close button, the torch when the phone has one, and "Point the camera at a barcode" in a glass capsule. When camera access was
/// refused, a sheet explains and offers Open Settings.
struct ScannerSurface: View {
    /// While something else is up (the price keypad, an alert, a read being looked up), reads are not passed on.
    var paused = false
    var toast: String? = nil
    let onRead: (String) -> Void
    let onClose: () -> Void

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @State private var camera: CameraKind = .checking
    @State private var gate = ScanGate()
    @State private var torchOn = false
    @State private var showRefused = false

    private enum CameraKind {
        case checking, vision, capture, refused, missing
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch camera {
            case .vision:
                DataScannerCamera(
                    onCodes: { codes in take(codes, fresh: true) },
                    onSeen: { codes in take(codes, fresh: false) },
                    onUnavailable: { camera = AVCaptureDevice.default(for: .video) == nil ? .missing : .capture }
                )
                .ignoresSafeArea()
            case .capture:
                CaptureCamera(onCodes: { codes in take(codes, fresh: true) })
                    .ignoresSafeArea()
            case .checking, .refused, .missing:
                EmptyView()
            }
        }
        .overlay(alignment: .top) { topBar }
        .overlay(alignment: .bottom) { bottomBar }
        .environment(\.colorScheme, .dark)
        .statusBarHidden(true)
        .task { await chooseCamera() }
        .sheet(isPresented: $showRefused, onDismiss: onClose) {
            CameraRefusedSheet()
        }
        .onDisappear { lightOff() }
        // iOS puts the light out when the camera stops (the app left, a call came in): the button must not go on saying it is on.
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in lightOff() }
    }

    private func lightOff() {
        guard torchOn else { return }
        Torch.set(false)
        torchOn = false
    }

    // MARK: The frame

    private var topBar: some View {
        HStack {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .controlSize(.large)
            .accessibilityLabel("Close")
            Spacer()
            if (camera == .vision || camera == .capture) && Torch.exists {
                Button {
                    if Torch.set(!torchOn) { torchOn.toggle() }
                } label: {
                    Image(systemName: torchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.glass)
                .buttonBorderShape(.circle)
                .controlSize(.large)
                .accessibilityLabel(torchOn ? "Turn off the light" : "Turn on the light")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var bottomBar: some View {
        VStack(spacing: 14) {
            if let toast {
                GlassToast(text: toast)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            Text(camera == .missing ? "The camera is not available." : "Point the camera at a barcode")
                .pfFont(17, .medium)
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 22)
                .padding(.vertical, 13)
                .modifier(CapsuleGlass(reduceTransparency: reduceTransparency))
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
        .animation(.snappy, value: toast)
    }

    // MARK: Camera access

    /// Asks for the camera the first time, then picks VisionKit's scanner when this phone supports it, or the plain camera.
    private func chooseCamera() async {
        guard camera == .checking else { return }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            pickScanner()
        case .notDetermined:
            // iOS's question makes the app inactive for a moment; the privacy cover should not flash over it.
            AppModel.shared.suppressCover = true
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            AppModel.shared.suppressCover = false
            if granted { pickScanner() } else { refused() }
        default:
            refused()
        }
    }

    private func pickScanner() {
        if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
            camera = .vision
        } else if AVCaptureDevice.default(for: .video) != nil {
            camera = .capture
        } else {
            camera = .missing
        }
    }

    private func refused() {
        camera = .refused
        showRefused = true
    }

    /// One sighting of one or more codes. New reads go on, unless paused; every sighting keeps a code from being read twice. A
    /// code that comes into view while paused (the next item held up while a message is still showing) is not lost: it is read at
    /// its first sighting once the scanner is free, instead of waiting to be taken away and shown again.
    private func take(_ codes: [String], fresh: Bool) {
        let now = Date()
        for code in codes {
            if paused {
                gate.sawWhileBusy(code, at: now)
                continue
            }
            let held = gate.wasHeld(code)
            let isNew = gate.pass(code, at: now)
            if isNew && (fresh || held) { onRead(code) }
        }
    }
}

private struct CapsuleGlass: ViewModifier {
    let reduceTransparency: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(Capsule().fill(Color(white: 0.18)))
        } else {
            content.glassEffect(.regular, in: .capsule)
        }
    }
}

/// Camera access was refused: why the scanner cannot open, and the way to Settings.
struct CameraRefusedSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 34))
                .foregroundStyle(Theme.blue)
                .padding(.top, 28)
                .accessibilityHidden(true)
            Text("Camera access is off")
                .pfFont(21, .bold, relativeTo: .title2)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text("PF Sites uses the camera to scan barcodes. Turn on Camera for PF Sites in Settings.")
                .pfFont(16)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                dismiss()
            }
            .buttonStyle(SolidButtonStyle(radius: 8, height: 48, size: 17))
            Button {
                dismiss()
            } label: {
                // The whole 44 pt row is the button, not only its word.
                Text("Close")
                    .pfFont(17, .semibold)
                    .foregroundStyle(Theme.blue)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .presentationDetents([.medium])
    }
}

// MARK: - The Sale screen's scanner

/// The Sale screen's barcode button: every new read finds the item with that product code and adds it, until the person closes the
/// scanner. A variable-price item asks for its price first; a sold-out item and an unknown code say so.
struct SaleScannerView: View {
    let order: SaleModel
    let siteID: String
    /// "Search items" on the unknown-code alert: the code goes into the Sale screen's search field.
    let onSearch: (String) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var keypad: KeypadTarget?
    @State private var missing: String?
    @State private var toast: String?
    @State private var toastHide: Task<Void, Never>?
    /// The read being looked up; stopped when the scanner closes, so nothing is added after the person has left it.
    @State private var lookup: Task<Void, Never>?

    var body: some View {
        ScannerSurface(paused: busy || keypad != nil || missing != nil, toast: toast, onRead: read, onClose: { dismiss() })
            .sheet(item: $keypad) { target in
                PriceKeypadSheet(target: target, order: order) { name in
                    Haptics.success()
                    show("Added \(name)")
                }
            }
            .alert(missing.map { "No item has product code \($0)." } ?? "", isPresented: Binding(get: { missing != nil }, set: { if !$0 { missing = nil } })) {
                Button("Search items") {
                    if let code = missing { onSearch(code) }
                    missing = nil
                    dismiss()
                }
                Button("OK", role: .cancel) {}
            }
            .onChange(of: model.isLocked) { _, locked in
                if locked { dismiss() }
            }
            .onDisappear {
                toastHide?.cancel()
                lookup?.cancel()
            }
    }

    private func read(_ code: String) {
        guard !busy else { return }
        busy = true
        model.idle.touch()
        lookup = Task {
            let result = await order.scanned(code, siteID: siteID)
            busy = false
            guard !Task.isCancelled else { return }
            switch result {
            case .added(let name):
                Haptics.success()
                show("Added \(name)")
            case .needsPrice(let item):
                keypad = .item(item)
            case .soldOut(let name):
                Haptics.error()
                show("\(name) is sold out.")
            case .notFound(let shown):
                Haptics.error()
                missing = shown
            case .failed(let message):
                Haptics.error()
                show(message)
            }
        }
    }

    private func show(_ text: String) {
        toastHide?.cancel()
        toast = text
        toastHide = Task {
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            guard !Task.isCancelled else { return }
            toast = nil
        }
    }
}

// MARK: - One read for the website

/// The website's item editor, inside the app, asks for a product code (pfAsk { cmd: 'scanBarcode' }): the same scanner opens for
/// one read and gives back the code exactly as read, or nothing when it is closed.
struct SingleScanView: View {
    let finish: (String?) -> Void
    @Environment(AppModel.self) private var model

    var body: some View {
        ScannerSurface(onRead: { code in finish(code) }, onClose: { finish(nil) })
            .onChange(of: model.isLocked) { _, locked in
                if locked { finish(nil) }
            }
    }
}

/// Opens the one-read scanner over whatever is showing and waits for its answer.
@MainActor
enum BarcodeScan {
    private static var waiting: CheckedContinuation<String?, Never>?
    private static weak var screen: UIViewController?

    /// The code as read, or nil when the person closed the scanner (or it could not open).
    static func scanOnce() async -> String? {
        guard waiting == nil, let top = UIPresenter.top() else { return nil }
        return await withCheckedContinuation { continuation in
            waiting = continuation
            let root = SingleScanView(finish: { code in BarcodeScan.finish(code) })
                .environment(AppModel.shared)
                .tint(Theme.blue)
                .dynamicTypeSize(...DynamicTypeSize.large)
            let host = UIHostingController(rootView: root)
            host.modalPresentationStyle = .fullScreen
            host.overrideUserInterfaceStyle = .dark
            host.view.backgroundColor = .black
            screen = host
            top.present(host, animated: true)
            // A screen that was already busy presenting something refuses quietly: then the answer is that nothing was read.
            Task {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                if screen === host, host.presentingViewController == nil { finish(nil) }
            }
        }
    }

    static func finish(_ code: String?) {
        // Closed from the screen under it, so the scanner and anything over it (the camera-refused sheet) go together; the
        // scanner's own dismiss would only close that sheet. Done even when the answer was already given.
        if let host = screen, let presenter = host.presentingViewController, presenter.presentedViewController === host {
            presenter.dismiss(animated: true)
        }
        screen = nil
        guard let continuation = waiting else { return }
        waiting = nil
        continuation.resume(returning: code)
    }
}
