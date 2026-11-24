import SwiftUI
import UIKit

/// The passcode screen (photo 5), for every reason it shows: typing the passcode after signing in or making one,
/// the lock screen, the passcode for another business, and changing it. The keypad is the real iOS number pad.
/// Sizes from the photo, from the top of the safe area: "Log out" 18.4 pt with its icon, centred 30 pt down; the 32 pt tile 77 pt
/// down; "Hi, Blake" 17.5 pt; the title 26.5 pt bold; "Forgot passcode?" 14.2 pt; four 17 pt dots 50 pt apart, 82 pt lower; the
/// 40 pt "Enable Face ID" box 51 pt under them; "Switch User" 15 pt, its baseline 38.8 pt under the box.
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
                        .pfFont(17.5, .medium)
                        .padding(.top, 14)
                    Text(title)
                        .pfFont(26.5, .bold, relativeTo: .largeTitle)
                        .padding(.top, 9)
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
                        faceIDControl
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
        }
        .contentShape(Rectangle())
        .onTapGesture { if !finished { focused = true } }
        .onAppear { faceIDWanted = model.faceIDOn }
        // Ends with the screen, so a Face ID attempt still waiting for the app to come to the front never outlives it.
        .task { await appeared() }
        .onChange(of: code) { _, newValue in typed(newValue) }
    }

    // MARK: Pieces

    @ViewBuilder
    private var topBar: some View {
        HStack {
            if let onCancel {
                Button("Cancel") {
                    focused = false
                    onCancel()
                }
                .pfFont(17)
                .foregroundStyle(Theme.blue)
                Spacer()
            } else {
                Spacer()
                Button {
                    logOut()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 17))
                        Text("Log out")
                            .pfFont(18.4)
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
        .padding(.top, 8)
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
                    .overlay(Circle().strokeBorder(Theme.blue, lineWidth: 1.3))
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
        if busy {
            ProgressView().tint(Theme.blue)
        } else if !problem.isEmpty {
            Text(problem)
                .pfFont(14.2)
                .foregroundStyle(Theme.error)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, 6)
                .accessibilityAddTraits(.updatesFrequently)
        }
    }

    /// "Enable Face ID": a 40 pt box with 10 pt corners and a 1 pt blue border, holding a 20 pt round tick box and the words.
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
                        .strokeBorder(Theme.blue, lineWidth: 1.5)
                    if faceIDWanted {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 20, height: 20)
                Text("Enable \(model.biometry.name)")
                    .pfFont(14.2)
                    .foregroundStyle(Theme.blue)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 40)
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.blue, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(faceIDWanted ? "On" : "Off")
        .accessibilityHint("Takes effect after your passcode.")
    }

    private var showsSwitchUser: Bool {
        switch step.purpose {
        case .afterSignIn, .lock: return true
        case .switchTo, .change: return false
        }
    }

    // MARK: Behaviour

    private func appeared() async {
        // With Face ID on, the lock screen asks for it by itself, once for each time the app locks.
        if step.purpose == .lock && model.faceIDOn && model.biometry != .none {
            await tryFaceID()
        } else {
            focusSoon()
        }
    }

    /// Face ID once, when the app is in front (asking while it is still opening would be cancelled by the system). When the app is
    /// not in front within 2 seconds (the phone was locked, or another app opened, as it started), the number pad comes up meanwhile,
    /// and Face ID still asks once the app is in front. This lock's one turn is only taken when Face ID really asks.
    private func tryFaceID() async {
        var waited = 0
        while UIApplication.shared.applicationState != .active {
            if waited == 20 { focusSoon() }
            waited += 1
            try? await Task.sleep(nanoseconds: 100_000_000)
            if Task.isCancelled || finished { return }
        }
        guard !finished, model.takeFaceIDTurn() else {
            if !finished { focusSoon() }
            return
        }
        switch await model.unlockWithFaceID() {
        case .unlocked:
            await finish()
        case .stay:
            // Cancelled: the lock screen stays as it is; a tap anywhere brings up the number pad.
            break
        case .keypad, .hidden:
            focusSoon()
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
            if !finished { focused = true }
        }
    }

    private func typed(_ value: String) {
        let digits = value.digits(limit: 4)
        if digits != value {
            code = digits
            return
        }
        guard !busy, !finished else { return }
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
            // The same rules as the server, checked here first.
            if let rule = Passcode.problem(digits) {
                refuse(rule)
            } else {
                move(to: .confirm(digits))
            }
        case .confirm(let first):
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

    private func move(to next: Stage) {
        stage = next
        code = ""
        problem = ""
    }

    private func refuse(_ message: String) {
        problem = message
        code = ""
        Haptics.error()
        if !reduceMotion {
            withAnimation(.linear(duration: 0.45)) { shakes += 1 }
        }
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

    private func forgot() {
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
        focused = false
        Task { await model.signOut() }
    }

    private func switchUser() {
        focused = false
        model.switchUser()
    }
}
