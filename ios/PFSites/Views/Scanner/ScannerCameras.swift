import AVFoundation
import SwiftUI
import UIKit
import Vision
import VisionKit

/// The barcodes the scanner reads (E20): EAN-13 (with UPC-A inside it), EAN-8, UPC-E, Code 128, Code 39, Code 93, ITF-14 and QR.
enum ScanSymbologies {
    static let vision: [VNBarcodeSymbology] = [.ean13, .ean8, .upce, .code128, .code39, .code93, .itf14, .qr]
    static let metadata: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce, .code128, .code39, .code93, .itf14, .qr]
}

/// Keeps one read from turning into two: a code seen in the last 2 seconds is ignored, and a code that stays in view keeps
/// counting as seen (the fallback camera reports it many times a second). A class, so marking a code seen redraws nothing.
final class ScanGate {
    private var seen: [String: Date] = [:]

    /// Whether this sighting is a new read. Every sighting counts as seen; while reading is `held` (the code before it is
    /// still being looked up), only codes already read do, so a code first shown during the wait is read as soon as the wait
    /// is over instead of never while it stays in view.
    func pass(_ code: String, at now: Date = Date(), held: Bool = false) -> Bool {
        let last = seen[code]
        if held && last == nil { return true }
        seen[code] = now
        if seen.count > 64 { seen = seen.filter { now.timeIntervalSince($0.value) < 10 } }
        guard let last else { return true }
        return now.timeIntervalSince(last) >= 2
    }
}

/// The phone's torch, for scanning in a dim stockroom.
@MainActor
enum Torch {
    private static var device: AVCaptureDevice? { AVCaptureDevice.default(for: .video) }

    static var exists: Bool { device?.hasTorch == true }

    @discardableResult
    static func set(_ on: Bool) -> Bool {
        guard let device, device.hasTorch else { return false }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            if on {
                guard device.isTorchAvailable else { return false }
                try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
            } else {
                device.torchMode = .off
            }
            return true
        } catch {
            return false
        }
    }
}

// MARK: - VisionKit

/// VisionKit's live scanner (DataScannerViewController), which draws its own highlight around the code it sees.
struct DataScannerCamera: UIViewControllerRepresentable {
    /// Codes that just came into view.
    var onCodes: ([String]) -> Void
    /// Codes still in view (they moved).
    var onSeen: ([String]) -> Void
    /// The scanner stopped being available (the camera was taken away or restricted).
    var onUnavailable: () -> Void

    func makeUIViewController(context: Context) -> DataScannerHost {
        let host = DataScannerHost()
        update(host)
        return host
    }

    func updateUIViewController(_ host: DataScannerHost, context: Context) {
        update(host)
    }

    private func update(_ host: DataScannerHost) {
        host.onCodes = onCodes
        host.onSeen = onSeen
        host.onUnavailable = onUnavailable
    }
}

/// Holds the DataScannerViewController and starts it once it is on screen, as VisionKit asks.
final class DataScannerHost: UIViewController, DataScannerViewControllerDelegate {
    var onCodes: (([String]) -> Void)?
    var onSeen: (([String]) -> Void)?
    var onUnavailable: (() -> Void)?
    private var scanner: DataScannerViewController?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: ScanSymbologies.vision)],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: true,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = self
        addChild(scanner)
        scanner.view.frame = view.bounds
        scanner.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(scanner.view)
        scanner.didMove(toParent: self)
        self.scanner = scanner
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard let scanner, !scanner.isScanning else { return }
        do {
            try scanner.startScanning()
        } catch {
            onUnavailable?()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        scanner?.stopScanning()
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        let codes = Self.codes(in: addedItems)
        if !codes.isEmpty { onCodes?(codes) }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        let codes = Self.codes(in: updatedItems)
        if !codes.isEmpty { onSeen?(codes) }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
        onUnavailable?()
    }

    private static func codes(in items: [RecognizedItem]) -> [String] {
        items.compactMap { item -> String? in
            guard case .barcode(let barcode) = item, let text = barcode.payloadStringValue, !text.isEmpty else { return nil }
            return text
        }
    }
}

// MARK: - AVFoundation (older iPhones, or when VisionKit cannot scan)

/// A plain camera with AVCaptureMetadataOutput, for phones where VisionKit's scanner is not supported or not available.
struct CaptureCamera: UIViewControllerRepresentable {
    var onCodes: ([String]) -> Void

    func makeUIViewController(context: Context) -> CaptureScanController {
        let controller = CaptureScanController()
        controller.onCodes = onCodes
        return controller
    }

    func updateUIViewController(_ controller: CaptureScanController, context: Context) {
        controller.onCodes = onCodes
    }
}

/// The capture session, its preview and a brief outline drawn around each code it reads.
final class CaptureScanController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onCodes: (([String]) -> Void)?
    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.processorfreedomsites.scanner")
    private var preview: AVCaptureVideoPreviewLayer?
    private let outline = CAShapeLayer()
    private var outlineFade: Task<Void, Never>?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device) else { return }
        session.beginConfiguration()
        if session.canAddInput(input) { session.addInput(input) }
        let output = AVCaptureMetadataOutput()
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            let available = output.availableMetadataObjectTypes
            output.metadataObjectTypes = ScanSymbologies.metadata.filter { available.contains($0) }
        }
        session.commitConfiguration()

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.addSublayer(layer)
        preview = layer

        outline.strokeColor = UIColor(named: "BrandBlue")?.cgColor ?? UIColor.systemBlue.cgColor
        outline.fillColor = UIColor.clear.cgColor
        outline.lineWidth = 3
        outline.lineJoin = .round
        outline.opacity = 0
        view.layer.addSublayer(outline)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let session = self.session
        sessionQueue.async {
            if !session.isRunning { session.startRunning() }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        outlineFade?.cancel()
        let session = self.session
        sessionQueue.async {
            if session.isRunning { session.stopRunning() }
        }
    }

    /// Called on the main queue (set above), for every frame that shows a code.
    nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        MainActor.assumeIsolated {
            self.read(metadataObjects)
        }
    }

    private func read(_ objects: [AVMetadataObject]) {
        let codes = objects.compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }.filter { !$0.isEmpty }
        guard !codes.isEmpty else { return }
        if let first = objects.first, let shown = preview?.transformedMetadataObject(for: first) {
            showOutline(around: shown.bounds)
        }
        onCodes?(codes)
    }

    private func showOutline(around box: CGRect) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        outline.path = UIBezierPath(roundedRect: box.insetBy(dx: -8, dy: -8), cornerRadius: 10).cgPath
        outline.opacity = 1
        CATransaction.commit()
        outlineFade?.cancel()
        outlineFade = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard !Task.isCancelled else { return }
            self?.outline.opacity = 0
        }
    }
}
