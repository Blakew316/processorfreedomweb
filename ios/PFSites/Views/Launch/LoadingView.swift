import SwiftUI

/// The loading screen: exactly the launch screen (the lockup centred in the whole screen) plus the small animated tile,
/// so the hand-over from the launch screen is seamless. When the first check fails it says why and offers Try again.
struct LoadingView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            Color(.systemBackground)
            Image("LaunchLockup")
                .accessibilityLabel("Processor Freedom")
            if let message = model.launchError {
                VStack(spacing: 16) {
                    Text(message)
                        .pfFont(17)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Try again") { model.retryLaunch() }
                        .buttonStyle(SolidButtonStyle(radius: 24, height: 48, size: 17))
                        .frame(maxWidth: 220)
                }
                .padding(.horizontal, 32)
                .offset(y: 110)
            } else {
                TileSpinner()
            }
        }
        .ignoresSafeArea()
    }
}

/// A 2 x 2 grid of rounded squares, the shape of our tile, with one hollow square stepping clockwise every 0.2 seconds.
/// It fades in after 0.3 seconds, so a quick load shows nothing moving. With Reduce Motion it gently pulses instead.
struct TileSpinner: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false
    @State private var pulse = false

    /// The hollow square at each step: top-left, top-right, bottom-right, bottom-left.
    private let order = [0, 1, 3, 2]

    var body: some View {
        Group {
            if reduceMotion {
                grid(hollow: nil)
                    .opacity(pulse ? 1 : 0.55)
                    .animation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true), value: pulse)
                    .onAppear { pulse = true }
            } else {
                TimelineView(.periodic(from: .now, by: 0.2)) { context in
                    grid(hollow: order[Int(context.date.timeIntervalSinceReferenceDate / 0.2) % 4])
                }
            }
        }
        .opacity(shown ? 1 : 0)
        .onAppear {
            withAnimation(.easeIn(duration: 0.25).delay(0.3)) { shown = true }
        }
        .accessibilityElement()
        .accessibilityLabel("Loading")
    }

    private func grid(hollow: Int?) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                square(0, hollow: hollow)
                square(1, hollow: hollow)
            }
            HStack(spacing: 4) {
                square(2, hollow: hollow)
                square(3, hollow: hollow)
            }
        }
    }

    @ViewBuilder
    private func square(_ index: Int, hollow: Int?) -> some View {
        let shape = RoundedRectangle(cornerRadius: 4, style: .continuous)
        if index == hollow {
            shape.strokeBorder(Color("SpinnerBlue"), lineWidth: 2).frame(width: 13, height: 13)
        } else {
            shape.fill(Color("SpinnerBlue")).frame(width: 13, height: 13)
        }
    }
}

/// What the app switcher shows instead of the app: the launch screen's lockup on plain white (black in dark mode).
struct PrivacyCover: View {
    var body: some View {
        ZStack {
            Color(.systemBackground)
            Image("LaunchLockup")
                .accessibilityHidden(true)
        }
        .ignoresSafeArea()
    }
}
