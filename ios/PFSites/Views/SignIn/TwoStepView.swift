import SwiftUI
import UIKit

/// Two-step sign-in (photo 3): the code we texted, or the one from the authenticator app, or a recovery code.
/// Sizes from the photo, measured from the line under the bar: 24 pt in from each side, the brand row 23 pt below the line,
/// the title 26.4 pt, the words 16.1 pt, the light blue panel of six 45 x 56 pt boxes, the 16 pt checkbox, the two 48 pt
/// pills, "Having trouble?" 17.5 pt and its links 16 pt (the first link's baseline 36.7 pt under its baseline). The title, the
/// phone number's last digits and "Having trouble?" are semibold: their strokes in the photo are 3.1 pt, 2.1 pt and 2.1 pt thick,
/// lighter than the bold "Log in" of the screen before.
struct TwoStepView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode
    @State private var lastCodeMode: Mode
    @State private var code = ""
    @State private var recovery = ""
    @State private var remember = false
    @State private var error = ""
    @State private var info = ""
    @State private var busy = false
    @State private var resending = false
    @FocusState private var codeFocused: Bool
    @FocusState private var recoveryFocused: Bool

    private enum Mode {
        case text, app, recovery
    }

    init() {
        let start: Mode = AppModel.shared.auth.startsWithText ? .text : .app
        _mode = State(initialValue: start)
        _lastCodeMode = State(initialValue: start)
    }

    var body: some View {
        let auth = model.auth
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Divider()
                    SignInBrandRow()
                        .padding(.top, 23)
                        .padding(.leading, 24)

                    VStack(alignment: .leading, spacing: 0) {
                        Text(title)
                            .pfFont(26.4, .semibold, relativeTo: .largeTitle)
                            .foregroundStyle(SignInLook.title)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                        explanation(auth)
                            .pfFont(16.1)
                            .foregroundStyle(SignInLook.text)
                            .lineSpacing(1)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 24)

                        Group {
                            if mode == .recovery {
                                SignInField(focused: recoveryFocused) {
                                    TextField("XXXXX-XXXXX", text: $recovery)
                                        .keyboardType(.asciiCapable)
                                        .textInputAutocapitalization(.characters)
                                        .autocorrectionDisabled()
                                        .focused($recoveryFocused)
                                        .submitLabel(.go)
                                        .onSubmit { submit() }
                                        .accessibilityLabel("Recovery code")
                                }
                            } else {
                                CodeBoxes(code: $code, focused: $codeFocused)
                            }
                        }
                        .padding(.top, 16)

                        if !error.isEmpty {
                            Text(error)
                                .pfFont(15)
                                .foregroundStyle(Theme.error)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, 12)
                        }
                        if !info.isEmpty {
                            Text(info)
                                .pfFont(15)
                                .foregroundStyle(.secondary)
                                .padding(.top, 12)
                        }

                        CheckRowSmall(on: $remember, label: "Remember this device for 14 days")
                            .padding(.top, 31)

                        Button {
                            submit()
                        } label: {
                            if busy {
                                ProgressView().tint(.white)
                            } else {
                                Text("Log in")
                            }
                        }
                        .buttonStyle(SignInPillStyle(fill: ready || busy ? Theme.blue : SignInLook.waitingFill, text: ready || busy ? .white : SignInLook.waitingText))
                        .disabled(!ready)
                        .padding(.top, 29)

                        Button("Cancel") {
                            dismiss()
                        }
                        .buttonStyle(SignInPillStyle(fill: SignInLook.cancelFill, text: .primary))
                        .padding(.top, 12)

                        Text("Having trouble?")
                            .pfFont(17.5, .semibold)
                            .padding(.top, 65)
                            .accessibilityAddTraits(.isHeader)
                        VStack(alignment: .leading, spacing: 14) {
                            troubleLinks(auth)
                        }
                        .padding(.top, 17)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 48)

                    Spacer(minLength: 40)
                    SignInRegionRow()
                        .padding(.bottom, 6)
                }
                .frame(minHeight: geometry.size.height)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color(.systemBackground))
        .navigationTitle("Login")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { SignInBarTitle() }
        .onAppear {
            Task {
                try? await Task.sleep(nanoseconds: 450_000_000)
                focusEntry()
            }
        }
        .onChange(of: code) { _, newValue in
            let digits = newValue.digits(limit: 6)
            if digits != newValue {
                code = digits
                return
            }
            if !digits.isEmpty && !error.isEmpty { error = "" }
            // With all six digits in (typed, or filled in from Messages) the number pad goes away, so the tick box and the Log in
            // button it was covering are in view; tapping the boxes brings it back.
            if digits.count == 6 { codeFocused = false }
        }
    }

    // MARK: Words

    private var title: String {
        switch mode == .recovery ? lastCodeMode : mode {
        case .text: return "Check your phone"
        default: return "Check your authenticator app"
        }
    }

    private func explanation(_ auth: AuthFlow) -> Text {
        if mode == .recovery {
            return Text("Enter one of the recovery codes you saved when you turned on two-step sign-in.")
        }
        if mode == .text {
            let last = auth.lastFour
            if last.isEmpty { return Text("Enter the verification code we've sent to your phone.") }
            return Text("Enter the verification code we've sent to the phone number ending in \(Text(last).fontWeight(.semibold))")
        }
        return Text("Enter the 6-digit code from your authenticator app.")
    }

    @ViewBuilder
    private func troubleLinks(_ auth: AuthFlow) -> some View {
        if mode == .text {
            LinkButton(title: "Resend verification code", size: 16) { resend() }
            if auth.methods.contains("app") {
                LinkButton(title: "Use your authenticator app instead", size: 16) { switchTo(.app) }
            }
        } else if mode == .app {
            if auth.methods.contains("text") {
                LinkButton(title: "Text me a code instead", size: 16) { resend() }
            }
        }
        if mode == .recovery {
            LinkButton(title: "Use a 6-digit code instead", size: 16) { switchTo(lastCodeMode) }
        } else {
            LinkButton(title: "Use a recovery code instead", size: 16) { switchTo(.recovery) }
        }
    }

    // MARK: Actions

    private var entered: String { mode == .recovery ? recovery.trimmed : code }

    private var ready: Bool {
        guard !busy else { return false }
        if mode == .recovery { return recovery.filter { $0.isLetter || $0.isNumber }.count >= 10 }
        return code.count == 6
    }

    private func focusEntry() {
        if mode == .recovery { recoveryFocused = true } else { codeFocused = true }
    }

    private func switchTo(_ next: Mode) {
        if next != .recovery { lastCodeMode = next }
        mode = next
        error = ""
        code = ""
        recovery = ""
        Task {
            try? await Task.sleep(nanoseconds: 100_000_000)
            focusEntry()
        }
    }

    private func submit() {
        guard ready else { return }
        let auth = model.auth
        busy = true
        error = ""
        info = ""
        let value = entered
        Task {
            let outcome = await model.logIn(email: auth.email.trimmed.lowercased(), password: auth.password, code: value, remember: remember)
            busy = false
            switch outcome {
            case .success:
                break
            case .needsCode(let problem):
                auth.took(problem)
                code = ""
                recovery = ""
                refuse(problem.message)
                focusEntry()
            case .failed(let message):
                refuse(message)
            }
        }
    }

    /// What went wrong, under the entry: shown, felt, and read out by VoiceOver (it would not be come across by itself).
    private func refuse(_ message: String) {
        error = message
        Haptics.error()
        UIAccessibility.post(notification: .announcement, argument: message)
    }

    /// Texts a code (again): the same email and password with sendText and no code. One at a time, and never while a code is
    /// being checked, so a second tap cannot ask for a second text (the server would refuse it and its refusal would show).
    private func resend() {
        guard !busy, !resending else { return }
        let auth = model.auth
        resending = true
        error = ""
        info = ""
        Task {
            let outcome = await model.logIn(email: auth.email.trimmed.lowercased(), password: auth.password, sendText: true)
            resending = false
            switch outcome {
            case .success:
                break
            case .needsCode(let answer):
                auth.took(answer)
                if answer.sent {
                    lastCodeMode = .text
                    mode = .text
                    code = ""
                    Haptics.success()
                    showInfo("We sent a new code.")
                    focusEntry()
                } else {
                    refuse(answer.message)
                }
            case .failed(let message):
                refuse(message)
            }
        }
    }

    private func showInfo(_ text: String) {
        info = text
        UIAccessibility.post(notification: .announcement, argument: text)
        Task {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if info == text { info = "" }
        }
    }
}

/// Six boxes for the code, built on one hidden text field that stays focused (so codes from Messages fill in by themselves).
/// From the photo: a light blue panel 15 pt above and below the boxes and 4 pt at the sides, boxes 45 x 56 pt with 4 pt corners and
/// a 1 pt grey border, 8 pt apart and 17 pt between the third and the fourth; the box being filled has a dark 1 pt border with a
/// 2 pt blue ring around it.
struct CodeBoxes: View {
    @Binding var code: String
    var focused: FocusState<Bool>.Binding

    var body: some View {
        ZStack {
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused(focused)
                .frame(width: 1, height: 1)
                .opacity(0.02)
                .accessibilityLabel("Verification code")
                .accessibilityValue("\(code.count) of 6 digits entered")
            HStack(spacing: 17) {
                HStack(spacing: 8) {
                    ForEach(0..<3, id: \.self) { index in box(index) }
                }
                HStack(spacing: 8) {
                    ForEach(3..<6, id: \.self) { index in box(index) }
                }
            }
            .accessibilityHidden(true)
        }
        .padding(.vertical, 15)
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity)
        .background(Theme.lightBlue)
        .contentShape(Rectangle())
        .onTapGesture { focused.wrappedValue = true }
    }

    private func box(_ index: Int) -> some View {
        let characters = Array(code)
        let digit = index < characters.count ? String(characters[index]) : ""
        let current = focused.wrappedValue && index == min(characters.count, 5) && characters.count < 6
        let shape = RoundedRectangle(cornerRadius: 4, style: .continuous)
        return Text(digit)
            .pfFont(24, .medium)
            .foregroundStyle(.primary)
            .frame(minWidth: 30, maxWidth: 45, minHeight: 56, maxHeight: 56)
            .background(shape.fill(Color(.systemBackground)))
            .overlay(shape.strokeBorder(current ? Color.primary : SignInLook.boxBorder, lineWidth: 1))
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(Theme.blue.opacity(current ? 0.5 : 0), lineWidth: 2)
                    .padding(-1)
            )
    }
}

/// The photo's checkbox row: a 16 pt square with 2.5 pt corners and a 1 pt grey border (filled navy with a white tick when on,
/// like every ticked box in the app), 17.6 pt before the words, which are 16.1 pt and set a little apart, as in the photo.
/// The whole row toggles it, and its tap area reaches 12 pt above and below the words.
struct CheckRowSmall: View {
    @Binding var on: Bool
    let label: String

    var body: some View {
        Button {
            on.toggle()
            Haptics.light()
        } label: {
            HStack(spacing: 17.6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                        .fill(on ? SignInLook.navyButton : Color.clear)
                    RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                        .strokeBorder(on ? SignInLook.navyButton : SignInLook.boxBorder, lineWidth: 1)
                    if on {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 16, height: 16)
                .animation(.snappy(duration: 0.2), value: on)
                Text(label)
                    .pfFont(16.1)
                    .tracking(0.4)
                    .foregroundStyle(SignInLook.text)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -12)
        .accessibilityValue(on ? "Checked" : "Not checked")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
