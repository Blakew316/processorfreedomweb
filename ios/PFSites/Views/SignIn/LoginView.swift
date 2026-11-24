import SwiftUI
import UIKit

/// Log in (photo 2, and the website's log in page): email, password with the eye, Log in, and the way to reset a password.
/// Sizes from the photo, measured from the line under the bar: the brand row 16 pt below it, "Log in" 24.6 pt bold, the labels
/// 14.2 pt, the fields 48 pt tall with 12 pt corners, the navy Log in pill 48 pt, the lines under it 16 pt; at the foot a hairline,
/// the legal line and the region row. Everything sits 16 pt in from each side.
struct LoginView: View {
    @Environment(AppModel.self) private var model
    @FocusState private var focus: Field?
    @State private var showPassword = false

    private enum Field: Hashable {
        case email, password
    }

    /// The Log in button with the space under it, for bringing it above the keyboard.
    private static let buttonID = "log-in-button"

    var body: some View {
        @Bindable var auth = model.auth
        GeometryReader { geometry in
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Divider()
                        SignInBrandRow()
                            .padding(.top, 16)
                            .padding(.leading, 16)

                        VStack(alignment: .leading, spacing: 0) {
                            if !auth.note.isEmpty {
                                // After "Forgot passcode?" or the like: what happens after signing in.
                                Text(auth.note)
                                    .pfFont(15)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .padding(.bottom, 16)
                            }
                            Text("Log in")
                                .pfFont(24.6, .bold, relativeTo: .largeTitle)
                                .accessibilityAddTraits(.isHeader)

                            Text("Email")
                                .pfFont(14.2)
                                .padding(.top, 19)
                            SignInField(focused: focus == .email) {
                                TextField("", text: $auth.email)
                                    .textContentType(.username)
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .submitLabel(.next)
                                    .focused($focus, equals: .email)
                                    .onSubmit { focus = .password }
                                    .accessibilityLabel("Email")
                            }
                            .padding(.top, 5)

                            Text("Password")
                                .pfFont(14.2)
                                .padding(.top, 19)
                            SignInField(focused: focus == .password) {
                                HStack(spacing: 8) {
                                    Group {
                                        if showPassword {
                                            TextField("", text: $auth.password)
                                        } else {
                                            SecureField("", text: $auth.password)
                                        }
                                    }
                                    .textContentType(.password)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .submitLabel(.go)
                                    .focused($focus, equals: .password)
                                    .onSubmit { logIn() }
                                    .accessibilityLabel("Password")
                                    // The photo's eye is 20 pt wide with its middle 25 pt in from the field's edge; it sits in a
                                    // 44 pt tap area.
                                    Button {
                                        showPassword.toggle()
                                        focus = .password
                                    } label: {
                                        Image(systemName: showPassword ? "eye.slash" : "eye")
                                            .font(.system(size: 15))
                                            .foregroundStyle(.primary)
                                            .frame(width: 44, height: 44)
                                            .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    .padding(.trailing, -13)
                                    .accessibilityLabel(showPassword ? "Hide password" : "Show password")
                                }
                            }
                            .padding(.top, 5)

                            if !auth.error.isEmpty {
                                Text(auth.error)
                                    .pfFont(15)
                                    .foregroundStyle(Theme.error)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .padding(.top, 10)
                                    .accessibilityAddTraits(.updatesFrequently)
                            }

                            Button {
                                logIn()
                            } label: {
                                if auth.busy {
                                    ProgressView().tint(SignInLook.navyButtonText)
                                } else {
                                    Text("Log in")
                                }
                            }
                            // Clover's dark green button, in our navy; like the photo it stays at full strength while the fields are empty.
                            .buttonStyle(SignInPillStyle(fill: SignInLook.navyButton, text: SignInLook.navyButtonText))
                            .disabled(!canSubmit)
                            .padding(.top, 20)
                            .padding(.bottom, 12)
                            .id(Self.buttonID)

                            Text("New user or forgot your password?")
                                .pfFont(16.1)
                                .foregroundStyle(SignInLook.text)
                                .padding(.top, 5)
                            LinkButton(title: "Access your account", size: 16.5, underline: false) {
                                UIPresenter.safari(Config.url("/forgot"))
                            }
                            .padding(.top, 3)
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 94)

                        Spacer(minLength: 40)

                        VStack(spacing: 0) {
                            Divider()
                                .padding(.horizontal, 16)
                            SignInLegalLine()
                                .padding(.top, 20)
                                .padding(.horizontal, 16)
                            SignInRegionRow()
                                .padding(.top, 25)
                                .padding(.bottom, 18)
                        }
                    }
                    .frame(minHeight: geometry.size.height)
                }
                .scrollDismissesKeyboard(.interactively)
                // Once the keyboard is up for a field, the Log in button is brought above it as well, so the next step is never
                // under the keyboard (on a phone tall enough to show it already, nothing moves).
                .onChange(of: focus) { _, field in
                    guard field != nil else { return }
                    Task {
                        try? await Task.sleep(nanoseconds: 400_000_000)
                        guard focus != nil else { return }
                        withAnimation(.snappy) { proxy.scrollTo(Self.buttonID, anchor: .bottom) }
                    }
                }
            }
        }
        .background(Color(.systemBackground))
        .navigationTitle("Login")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { SignInBarTitle() }
        .onAppear {
            guard model.auth.email.isEmpty else { return }
            Task {
                try? await Task.sleep(nanoseconds: 450_000_000)
                focus = .email
            }
        }
    }

    private var canSubmit: Bool {
        let auth = model.auth
        return !auth.busy && !auth.email.trimmed.isEmpty && !auth.password.isEmpty
    }

    private func logIn() {
        guard canSubmit else { return }
        let auth = model.auth
        auth.error = ""
        auth.busy = true
        focus = nil
        let email = auth.email.trimmed.lowercased()
        let password = auth.password
        Task {
            let outcome = await model.logIn(email: email, password: password)
            auth.busy = false
            switch outcome {
            case .success:
                break
            case .needsCode(let error):
                auth.took(error)
                auth.path.append(.twoStep)
            case .failed(let message):
                auth.error = message
                Haptics.error()
                // VoiceOver reads the new message out; it is not come across by itself.
                UIAccessibility.post(notification: .announcement, argument: message)
            }
        }
    }
}
