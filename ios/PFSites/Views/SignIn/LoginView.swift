import SwiftUI

/// Log in (photo 2, and the website's log in page): email, password with the eye, Log in, and the way to reset a password.
struct LoginView: View {
    @Environment(AppModel.self) private var model
    @FocusState private var focus: Field?
    @State private var showPassword = false

    private enum Field: Hashable {
        case email, password
    }

    var body: some View {
        @Bindable var auth = model.auth
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Divider()
                    BrandRow()
                        .padding(.top, 16)
                        .padding(.leading, 17)

                    VStack(alignment: .leading, spacing: 0) {
                        if !auth.note.isEmpty {
                            Text(auth.note)
                                .pfFont(16)
                                .foregroundStyle(.secondary)
                                .padding(.bottom, 18)
                        }
                        Text("Log in")
                            .pfFont(30, .bold, relativeTo: .largeTitle)
                            .accessibilityAddTraits(.isHeader)

                        Text("Email")
                            .pfFont(16)
                            .padding(.top, 22)
                        BoxField(focused: focus == .email) {
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
                        .padding(.top, 8)

                        Text("Password")
                            .pfFont(16)
                            .padding(.top, 20)
                        BoxField(focused: focus == .password) {
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
                                Button {
                                    showPassword.toggle()
                                    focus = .password
                                } label: {
                                    Image(systemName: showPassword ? "eye.slash" : "eye")
                                        .font(.system(size: 18))
                                        .foregroundStyle(.primary)
                                        .frame(width: 36, height: 36)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(showPassword ? "Hide password" : "Show password")
                            }
                        }
                        .padding(.top, 8)

                        if !auth.error.isEmpty {
                            Text(auth.error)
                                .pfFont(15)
                                .foregroundStyle(Theme.error)
                                .padding(.top, 12)
                                .accessibilityAddTraits(.updatesFrequently)
                        }

                        Button {
                            logIn()
                        } label: {
                            if auth.busy {
                                ProgressView().tint(.white)
                            } else {
                                Text("Log in")
                            }
                        }
                        .buttonStyle(SolidButtonStyle(radius: 25, height: 50))
                        .opacity(canSubmit ? 1 : 0.6)
                        .disabled(!canSubmit)
                        .padding(.top, 20)

                        Text("New user or forgot your password?")
                            .pfFont(18)
                            .padding(.top, 24)
                        LinkButton(title: "Access your account", underline: false) {
                            UIPresenter.safari(Config.url("/forgot"))
                        }
                        .padding(.top, 4)
                    }
                    .padding(.horizontal, 17)
                    .padding(.top, 96)

                    Spacer(minLength: 40)
                    AuthFooter(showsLegal: true)
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
            }
        }
    }
}
