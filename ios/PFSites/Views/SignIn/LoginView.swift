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
    private static let pageSpace = "log-in-page"
    /// The photo's 94 pt between the brand row and "Log in", and the least it closes up to while the keyboard is up.
    private static let fullGap: CGFloat = 94
    private static let leastGap: CGFloat = 28
    /// That gap now. With the keyboard up on a phone too short to show the Log in button above it, the gap closes by what is
    /// missing, so the button comes into view and the brand row stays where it is. (The page used to be scrolled up instead,
    /// which parked the brand row inside the top bar, where it showed through as a smear behind the back button and the title.)
    @State private var gap: CGFloat = LoginView.fullGap
    /// The bottom of the Log in button with the space under it, measured in the page.
    @State private var buttonBottom: CGFloat = 0

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
                                .accessibilityHidden(true)
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
                                .accessibilityHidden(true)
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
                            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.pageSpace)).maxY } action: { buttonBottom = $0 }

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
                        .padding(.top, gap)
                        // A message coming or going moves the button under it smoothly.
                        .animation(.snappy(duration: 0.25), value: auth.error)

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
                    .coordinateSpace(.named(Self.pageSpace))
                }
                .scrollDismissesKeyboard(.interactively)
                // The keyboard came or went, a message moved the button, or a field was left: the gap is worked out again.
                .onChange(of: geometry.size.height) { _, visible in settle(visible) }
                .onChange(of: buttonBottom) { _, _ in settle(geometry.size.height) }
                .onChange(of: focus) { _, _ in settle(geometry.size.height) }
                // On a phone too short even for that, the rest is done by scrolling, once the keyboard is up (on a phone tall
                // enough to show the button already, nothing moves).
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

    /// Closes the gap above "Log in" by what the Log in button lacks to show above the keyboard, and opens it again when the
    /// keyboard has gone. `visible` is the page's height on screen, which the keyboard shortens.
    private func settle(_ visible: CGFloat) {
        guard buttonBottom > 0, visible > 0 else { return }
        let rest = buttonBottom - gap
        let wanted = focus == nil ? Self.fullGap : min(Self.fullGap, max(Self.leastGap, visible - rest))
        guard abs(wanted - gap) > 0.5 else { return }
        withAnimation(.snappy(duration: 0.25)) { gap = wanted }
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
                // "Enter the code we texted you" is a plain 401. Anything else with the code step's flags is a refusal (the text
                // could not be sent, or one was asked for too soon): the code step says so, where the ways to get a code are,
                // instead of reading as if a code were on its way.
                auth.codeProblem = error.status == 401 ? "" : error.message
                // Only from this screen: if it was left with Back while the answer was on its way, the code step is not
                // pushed onto Welcome.
                if auth.path.last == .login { auth.path.append(.twoStep) }
            case .failed(let message):
                auth.error = message
                Haptics.error()
                // VoiceOver reads the new message out; it is not come across by itself.
                UIAccessibility.post(notification: .announcement, argument: message)
            }
        }
    }
}
