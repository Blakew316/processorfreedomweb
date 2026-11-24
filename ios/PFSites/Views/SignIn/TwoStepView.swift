import SwiftUI

/// Two-step sign-in (photo 3): the code we texted, or the one from the authenticator app, or a recovery code.
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
                    BrandRow()
                        .padding(.top, 16)
                        .padding(.leading, 17)

                    VStack(alignment: .leading, spacing: 0) {
                        Text(title)
                            .pfFont(30, .bold, relativeTo: .largeTitle)
                            .accessibilityAddTraits(.isHeader)
                        explanation(auth)
                            .pfFont(18)
                            .lineSpacing(3)
                            .padding(.top, 16)

                        Group {
                            if mode == .recovery {
                                BoxField(focused: recoveryFocused) {
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
                        .padding(.top, 24)

                        if !error.isEmpty {
                            Text(error)
                                .pfFont(15)
                                .foregroundStyle(Theme.error)
                                .padding(.top, 12)
                        }
                        if !info.isEmpty {
                            Text(info)
                                .pfFont(15)
                                .foregroundStyle(.secondary)
                                .padding(.top, 12)
                        }

                        CheckRow(on: $remember, label: "Remember this device for 14 days")
                            .padding(.top, 28)

                        Button {
                            submit()
                        } label: {
                            if busy {
                                ProgressView().tint(.white)
                            } else {
                                Text("Log in")
                            }
                        }
                        .buttonStyle(SolidButtonStyle(fill: ready ? Theme.blue : Color(.systemGray6), text: ready ? .white : Color(.systemGray3), radius: 25, height: 50))
                        .disabled(!ready)
                        .padding(.top, 28)

                        Button("Cancel") {
                            dismiss()
                        }
                        .buttonStyle(SolidButtonStyle(fill: Color(.systemGray5), text: .primary, radius: 25, height: 50))
                        .padding(.top, 12)

                        Text("Having trouble?")
                            .pfFont(19, .bold)
                            .padding(.top, 56)
                            .accessibilityAddTraits(.isHeader)
                        VStack(alignment: .leading, spacing: 16) {
                            troubleLinks(auth)
                        }
                        .padding(.top, 14)
                    }
                    .padding(.horizontal, 17)
                    .padding(.top, 56)

                    Spacer(minLength: 40)
                    AuthFooter(showsLegal: false)
                }
                .frame(minHeight: geometry.size.height)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color(.systemBackground))
        .navigationTitle("Login")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Login")
                    .pfFont(18, .bold)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .onAppear {
            Task {
                try? await Task.sleep(nanoseconds: 450_000_000)
                focusEntry()
            }
        }
        .onChange(of: code) { _, newValue in
            let digits = newValue.digits(limit: 6)
            if digits != newValue { code = digits }
            if !digits.isEmpty && !error.isEmpty { error = "" }
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
            return Text("Enter the verification code we've sent to the phone number ending in \(Text(last).bold())")
        }
        return Text("Enter the 6-digit code from your authenticator app.")
    }

    @ViewBuilder
    private func troubleLinks(_ auth: AuthFlow) -> some View {
        if mode == .text {
            LinkButton(title: "Resend verification code") { resend() }
            if auth.methods.contains("app") {
                LinkButton(title: "Use your authenticator app instead") { switchTo(.app) }
            }
        } else if mode == .app {
            if auth.methods.contains("text") {
                LinkButton(title: "Text me a code instead") { resend() }
            }
        }
        if mode == .recovery {
            LinkButton(title: "Use a 6-digit code instead") { switchTo(lastCodeMode) }
        } else {
            LinkButton(title: "Use a recovery code instead") { switchTo(.recovery) }
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
                error = problem.message
                code = ""
                recovery = ""
                Haptics.error()
                focusEntry()
            case .failed(let message):
                error = message
                Haptics.error()
            }
        }
    }

    /// Texts a code (again): the same email and password with sendText and no code.
    private func resend() {
        let auth = model.auth
        error = ""
        info = ""
        Task {
            let outcome = await model.logIn(email: auth.email.trimmed.lowercased(), password: auth.password, sendText: true)
            switch outcome {
            case .success:
                break
            case .needsCode(let answer):
                auth.took(answer)
                if answer.sent {
                    lastCodeMode = .text
                    mode = .text
                    code = ""
                    showInfo("We sent a new code.")
                    focusEntry()
                } else {
                    error = answer.message
                }
            case .failed(let message):
                error = message
            }
        }
    }

    private func showInfo(_ text: String) {
        info = text
        Task {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if info == text { info = "" }
        }
    }
}

/// Six boxes for the code, built on one hidden text field that stays focused (so codes from Messages fill in by themselves).
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
            HStack(spacing: 8) {
                ForEach(0..<6, id: \.self) { index in
                    box(index)
                    if index == 2 {
                        Spacer().frame(width: 10)
                    }
                }
            }
            .accessibilityHidden(true)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(Theme.lightBlue)
        .contentShape(Rectangle())
        .onTapGesture { focused.wrappedValue = true }
    }

    private func box(_ index: Int) -> some View {
        let characters = Array(code)
        let digit = index < characters.count ? String(characters[index]) : ""
        let current = focused.wrappedValue && index == min(characters.count, 5) && characters.count < 6
        return Text(digit)
            .pfFont(26, .medium)
            .foregroundStyle(.primary)
            .frame(minWidth: 30, maxWidth: 46, minHeight: 56, maxHeight: 56)
            .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(Color(.systemBackground)))
            .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(current ? Color.primary : Color(.systemGray2), lineWidth: current ? 2.5 : 1))
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Theme.blue.opacity(current ? 0.45 : 0), lineWidth: 3)
                    .padding(-3)
            )
    }
}
