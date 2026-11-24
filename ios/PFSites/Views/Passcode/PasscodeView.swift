import SwiftUI

/// The passcode screen (photo 5), for every reason it shows: typing the passcode after signing in or making one,
/// the lock screen, the passcode for another business, and changing it. The keypad is the real iOS number pad.
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
    @State private var triedFaceID = false
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
                    LogoTile(size: 40, radius: 9)
                        .padding(.top, 12)
                    Text(model.firstName.isEmpty ? "Hi there" : "Hi, \(model.firstName)")
                        .pfFont(19, .medium)
                        .padding(.top, 14)
                    Text(title)
                        .pfFont(30, .bold, relativeTo: .largeTitle)
                        .padding(.top, 8)
                        .accessibilityAddTraits(.isHeader)
                    subline
                        .padding(.top, 12)
                        .padding(.horizontal, 24)
                    dots
                        .padding(.top, 72)
                    feedback
                        .padding(.top, 16)
                        .padding(.horizontal, 24)
                    if model.biometry != .none {
                        faceIDControl
                            .padding(.top, 22)
                    }
                    if showsSwitchUser {
                        LinkButton(title: "Switch User", size: 19) { switchUser() }
                            .padding(.top, 36)
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
        .onAppear { appeared() }
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
                .pfFont(18)
                .foregroundStyle(Theme.blue)
                Spacer()
            } else {
                Spacer()
                Button {
                    logOut()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 20))
                        Text("Log out")
                            .pfFont(20)
                    }
                    .foregroundStyle(.primary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 22)
        .frame(minHeight: 44)
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
            LinkButton(title: "Forgot passcode?", size: 16) { forgot() }
        case .create:
            Text("4 digits. No repeats or runs like 1111 or 1234.")
                .pfFont(15)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        case .confirm:
            Text("Enter it again.")
                .pfFont(15)
                .foregroundStyle(.secondary)
        }
    }

    private var dots: some View {
        HStack(spacing: 35) {
            ForEach(0..<4, id: \.self) { index in
                Circle()
                    .fill(index < code.count || finished ? Theme.blue : Color.clear)
                    .overlay(Circle().strokeBorder(Theme.blue, lineWidth: 2))
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
                .pfFont(15)
                .foregroundStyle(Theme.error)
                .multilineTextAlignment(.center)
        } else {
            Color.clear.frame(height: 20)
        }
    }

    private var faceIDControl: some View {
        Button {
            faceIDWanted.toggle()
            Haptics.light()
        } label: {
            HStack(spacing: 12) {
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
                    .pfFont(17)
                    .foregroundStyle(Theme.blue)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 41)
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Theme.blue, lineWidth: 2))
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

    private func appeared() {
        faceIDWanted = model.faceIDOn
        // With Face ID on, the lock screen asks for it by itself, once; cancelling leaves the keypad.
        if step.purpose == .lock && model.faceIDOn && !triedFaceID {
            triedFaceID = true
            Task {
                let result = await model.unlockWithFaceID()
                if let result {
                    if case .ok = result {
                        await finish()
                        return
                    }
                    faceIDWanted = model.faceIDOn
                    handle(result)
                }
                focusSoon()
            }
        } else {
            focusSoon()
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
            // The server forgot this phone (for example after five wrong passcodes): the email and password are needed again.
            focused = false
            model.deviceForgotten(message)
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
