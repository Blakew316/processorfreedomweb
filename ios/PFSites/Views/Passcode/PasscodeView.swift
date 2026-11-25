import SwiftUI
import UIKit

/// The passcode screen (photo 5), for every reason it shows: typing the passcode after signing in or making one,
/// the lock screen, the passcode for another business, and changing it. The keypad is the real iOS number pad.
/// Sizes from the photo, from the top of the safe area: "Log out" 18.4 pt semibold with its icon, centred 30 pt down; the 32 pt
/// tile 77 pt down; "Hi, Blake" 17.5 pt semibold; the title 26.5 pt bold; "Forgot passcode?" 14.2 pt; four 17 pt dots with a 1 pt
/// ring, 50 pt apart, 82 pt lower; the 40 pt "Enable Face ID" box 51 pt under them; "Switch User" 15 pt, its baseline 38.8 pt
/// under the box. (Weights from the strokes in the photo: 2.3 pt for "Log out" and "Hi, Blake", 3.9 pt for the title.)
struct PasscodeView: View {
    let step: PasscodeStep
    let onDone: (() -> Void)?
    let onCancel: (() -> Void)?

    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var stage: Stage
    @State private var code = ""
    @State private var problem = ""
    @State private var busy = false
    @State private var finished = false
    @State private var shakes: CGFloat = 0
    @State private var faceIDWanted = false
    @State private var faceIDRunning = false
    @FocusState private var focused: Bool

    private enum Stage: Equatable {
        case enter
        case create
        case confirm(String)
    }

    init(step: PasscodeStep, onDone: (() -> Void)? = nil, onCancel: (() -> Void)? = nil) {
        self.step = step
        self.onDone = onDone
        self.onCancel = onCancel
        let start: Stage
        switch step.purpose {
        case .afterSignIn(let has, let forgot): start = has && !forgot ? .enter : .create
        case .switchTo(let has): start = has ? .enter : .create
        case .lock, .change: start = .enter
        }
        _stage = State(initialValue: start)
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color(.systemBackground).ignoresSafeArea()
            ScrollView {
                VStack(spacing: 0) {
                    topBar
                    LogoTile(size: 32, radius: 7)
                        .padding(.top, 25)
                    Text(model.firstName.isEmpty ? "Hi there" : "Hi, \(model.firstName)")
                        .pfFont(17.5, .semibold)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.top, 14)
                        .padding(.horizontal, 24)
                    Text(title)
                        .pfFont(26.5, .bold, relativeTo: .largeTitle)
                        .padding(.top, 8)
                        .accessibilityAddTraits(.isHeader)
                    subline
                        .padding(.top, 14)
                        .padding(.horizontal, 24)
                    dots
                        .padding(.top, 82)
                    // The server's message (with tries left) sits between the dots and the Face ID box, which never moves for it.
                    feedback
                        .padding(.horizontal, 24)
                        .frame(maxWidth: .infinity, minHeight: 51)
                    if model.biometry != .none {
                        if showsBiometricButton {
                            biometricButton
                        } else {
                            faceIDControl
                        }
                    }
                    if showsSwitchUser {
                        LinkButton(title: "Switch User", size: 15) { switchUser() }
                            .padding(.top, 24.5)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)

            // The keypad: a hidden field that keeps the number pad up.
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .autocorrectionDisabled()
                .focused($focused)
                .frame(width: 1, height: 1)
                .opacity(0.011)
                .privacySensitive()
                .accessibilityLabel("Passcode")
                // How many digits are in, never the digits themselves.
                .accessibilityValue("\(code.count) of 4 digits entered")
        }
        .contentShape(Rectangle())
        .onTapGesture { if !finished && !faceIDRunning { focused = true } }
        .onAppear { faceIDWanted = model.faceIDOn }
        .task { await appeared() }
        .onChange(of: code) { _, newValue in typed(newValue) }
    }

    // MARK: Pieces

    @ViewBuilder
    private var topBar: some View {
        HStack {
            if let onCancel {
                // Over the dashboard (another business's passcode, Change passcode) the step closes with the bare X every
                // full-screen cover in the app has, in the same place: its centre 28 pt from the edge, 22 pt down.
                PasscodeCloseButton {
                    // Not while a passcode is being checked or saved: its answer must not land on a step that was left.
                    guard !working else { return }
                    focused = false
                    onCancel()
                }
                .padding(.leading, -15)
                Spacer()
            } else {
                Spacer()
                Button {
                    logOut()
                } label: {
                    // 6.3 pt between the frames leaves the photo's 9.7 pt between the drawing and the words (the symbol and the
                    // first letter carry the rest as their own side space).
                    HStack(spacing: 6.3) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 17))
                            .accessibilityHidden(true)
                        Text("Log out")
                            .pfFont(18.4, .semibold)
                    }
                    .foregroundStyle(.primary)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 21)
        .frame(height: 44)
        .padding(.top, onCancel == nil ? 8 : 0)
        .padding(.bottom, onCancel == nil ? 0 : 8)
    }

    private var title: String {
        switch stage {
        case .enter: return "Enter passcode"
        case .create: return "Create passcode"
        case .confirm: return "Confirm passcode"
        }
    }

    @ViewBuilder
    private var subline: some View {
        switch stage {
        case .enter:
            LinkButton(title: "Forgot passcode?", size: 14.2) { forgot() }
        case .create:
            Text("4 digits. No repeats or runs like 1111 or 1234.")
                .pfFont(14.2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        case .confirm:
            Text("Enter it again.")
                .pfFont(14.2)
                .foregroundStyle(.secondary)
        }
    }

    private var dots: some View {
        HStack(spacing: 33) {
            ForEach(0..<4, id: \.self) { index in
                Circle()
                    .fill(index < code.count || finished ? Theme.blue : Color.clear)
                    .overlay(Circle().strokeBorder(Theme.blue, lineWidth: 1))
                    .frame(width: 17, height: 17)
            }
        }
        .modifier(Shake(amount: shakes))
        .accessibilityElement()
        .accessibilityLabel("Passcode")
        .accessibilityValue("\(code.count) of 4 digits entered")
    }

    @ViewBuilder
    private var feedback: some View {
        // The spinner stays after a right passcode too, while what comes next is made ready (Face ID being set up, the
        // dashboard's data): the screen never just sits there with its dots filled. It shows while Face ID is with the server
        // as well, when the number pad is down and the ways off this screen wait.
        if busy || finished || faceIDRunning {
            ProgressView().tint(Theme.blue)
        } else if !problem.isEmpty {
            Text(problem)
                .pfFont(14.2)
                .foregroundStyle(Theme.error)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, 6)
        } else {
            Color.clear.frame(height: 0)
        }
    }

    /// "Enable Face ID": a 40 pt box with 10 pt corners and a 1 pt blue border, holding a 20 pt round tick box (a 1 pt ring in the
    /// photo) and the words. Its tap area is 44 pt tall.
    private var faceIDControl: some View {
        Button {
            faceIDWanted.toggle()
            Haptics.light()
        } label: {
            HStack(spacing: 11) {
                ZStack {
                    Circle()
                        .fill(faceIDWanted ? Theme.blue : Color.clear)
                    Circle()
                        .strokeBorder(Theme.blue, lineWidth: 1)
                    if faceIDWanted {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                            .accessibilityHidden(true)
                    }
                }
                .frame(width: 20, height: 20)
                .animation(.snappy(duration: 0.2), value: faceIDWanted)
                Text("Enable \(model.biometry.name)")
                    .pfFont(14.2)
                    .foregroundStyle(Theme.blue)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 40)
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.blue, lineWidth: 1))
            .padding(.vertical, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -2)
        .accessibilityValue(faceIDWanted ? "On" : "Off")
        .accessibilityHint("Takes effect after your passcode.")
    }

    /// On the lock screen with Face ID already on, Apple's Face ID symbol takes the box's place: tapping it unlocks with Face ID.
    private var showsBiometricButton: Bool {
        step.purpose == .lock && model.faceIDOn
    }

    private var biometricButton: some View {
        Button {
            Task { await useFaceID() }
        } label: {
            Image(systemName: model.biometry.symbol)
                .font(.system(size: 34, weight: .regular))
                .foregroundStyle(Theme.blue)
                .frame(width: 64, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(faceIDRunning || busy || finished)
        .accessibilityLabel("Unlock with \(model.biometry.name)")
    }

    private var showsSwitchUser: Bool {
        switch step.purpose {
        case .afterSignIn, .lock: return true
        case .switchTo, .change: return false
        }
    }

    // MARK: Behaviour

    private func appeared() async {
        // Face ID never asks by itself (locking or signing out would be undone the moment this screen appears): the person taps
        // its symbol when they want it. The number pad comes up meanwhile.
        focusSoon()
    }

    /// Face ID when its symbol is tapped. Cancelling, or a face it does not recognise, leaves the lock screen with the number pad.
    private func useFaceID() async {
        guard !faceIDRunning, !busy, !finished else { return }
        faceIDRunning = true
        defer { faceIDRunning = false }
        focused = false
        // Digits that slip in while Face ID is up are never sent, so they are not left showing as filled dots afterwards.
        let typedBefore = code
        switch await model.unlockWithFaceID() {
        case .unlocked:
            await finish()
        case .stay, .keypad, .hidden:
            if code != typedBefore { code = typedBefore }
            if !finished { focusSoon() }
        case .refused(let result):
            faceIDWanted = model.faceIDOn
            handle(result)
            if !finished { focusSoon() }
        }
    }

    /// The keypad comes up once the screen is in place (focusing during the window's first moment can be ignored).
    private func focusSoon() {
        Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            if !finished && !faceIDRunning { focused = true }
        }
    }

    private func typed(_ value: String) {
        let digits = value.digits(limit: 4)
        if digits != value {
            code = digits
            return
        }
        guard !busy, !finished, !faceIDRunning else { return }
        if digits.count == 1 && !problem.isEmpty { problem = "" }
        if digits.count == 4 {
            Task { await submit(digits) }
        }
    }

    private func submit(_ digits: String) async {
        switch stage {
        case .enter:
            busy = true
            let result: PasscodeResult
            if step.purpose == .lock {
                result = await model.unlock(passcode: digits)
            } else {
                result = await model.verifyPasscode(digits, site: step.site)
            }
            busy = false
            if case .ok = result {
                if step.purpose == .change { move(to: .create) } else { await finish() }
            } else {
                handle(result)
            }
        case .create:
            guard await settled(digits) else { return }
            // The same rules as the server, checked here first.
            if let rule = Passcode.problem(digits) {
                refuse(rule)
            } else {
                move(to: .confirm(digits))
            }
        case .confirm(let first):
            guard await settled(digits) else { return }
            guard digits == first else {
                refuse("Those passcodes did not match. Try again.")
                stage = .create
                return
            }
            busy = true
            let result = await model.savePasscode(digits, site: step.site)
            busy = false
            if case .ok = result { await finish() } else { handle(result) }
        }
    }

    /// The fourth dot shows filled for a moment before the screen moves on (nothing is sent to the server at these steps, so
    /// without the pause the dots would empty the instant the last digit is typed). False when the digits were changed meanwhile.
    private func settled(_ digits: String) async -> Bool {
        let was = stage
        try? await Task.sleep(nanoseconds: 150_000_000)
        return code == digits && stage == was && !busy && !finished
    }

    private func move(to next: Stage) {
        stage = next
        code = ""
        problem = ""
        // VoiceOver says the new step ("Confirm passcode"): the title changes in place.
        UIAccessibility.post(notification: .announcement, argument: title)
    }

    private func refuse(_ message: String) {
        problem = message
        code = ""
        Haptics.error()
        if !reduceMotion {
            withAnimation(.linear(duration: 0.45)) { shakes += 1 }
        }
        // VoiceOver reads the message out: it appears under the dots and would not be come across by itself.
        UIAccessibility.post(notification: .announcement, argument: message)
    }

    private func handle(_ result: PasscodeResult) {
        switch result {
        case .ok:
            break
        case .wrong(let message), .failed(let message):
            refuse(message)
        case .signIn(let message):
            // The server forgot this phone (five wrong passcodes, two-step sign-in turned on, removed from the team):
            // the email and password are needed again, and the Log in screen says why.
            focused = false
            model.deviceForgotten(message)
        case .sessionEnded(let message):
            // The session ended while this screen was open (the phone's key is still good).
            focused = false
            switch step.purpose {
            case .afterSignIn:
                model.sessionEndedBeforeReady(message)
            case .switchTo, .change:
                onCancel?()
                model.sessionEnded()
            case .lock:
                refuse(message)
            }
        }
    }

    private func finish() async {
        guard !finished else { return }
        finished = true
        focused = false
        Haptics.light()
        await model.applyFaceID(faceIDWanted)
        switch step.purpose {
        case .afterSignIn:
            await model.passcodeFinished(for: step.site)
        case .lock:
            await model.finishUnlock()
        case .switchTo, .change:
            onDone?()
        }
    }

    /// A passcode or Face ID is with the server, or was just accepted: the ways off this screen (Log out, Switch User, Forgot
    /// passcode?, the X) and the number pad wait for the answer, so it never lands after the person has gone somewhere else and
    /// a second unlock is never sent beside it. It is never long: the request gives up by itself.
    private var working: Bool { busy || finished || faceIDRunning }

    private func forgot() {
        guard !working else { return }
        switch step.purpose {
        case .afterSignIn:
            // Right after the email and password: they can simply make a new one.
            move(to: .create)
        case .lock, .change, .switchTo:
            // Anywhere else the email and password come first (then a new passcode), so someone holding an unlocked phone for a
            // moment cannot set a passcode they know and open the app with it later.
            focused = false
            model.forgotPasscode()
        }
    }

    private func logOut() {
        guard !working else { return }
        focused = false
        Task { await model.signOut() }
    }

    private func switchUser() {
        guard !working else { return }
        focused = false
        model.switchUser()
    }
}

/// The bare X that closes a passcode step shown over the dashboard, like every full-screen cover in the app: 18 pt, no glass
/// circle, in a 44 pt tap area.
struct PasscodeCloseButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(Color.primary)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Cancel")
    }
}
