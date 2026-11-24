import SwiftUI

/// Welcome, Log in and Two-step in one navigation stack (Welcome hides the bar; the others show "Login" with the system back button).
struct WelcomeFlow: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var auth = model.auth
        NavigationStack(path: $auth.path) {
            WelcomeView()
                .navigationDestination(for: AuthStep.self) { step in
                    switch step {
                    case .login: LoginView()
                    case .twoStep: TwoStepView()
                    }
                }
        }
        .tint(Theme.blue)
    }
}

/// The first screen for someone signed out (photo 1): our name, what the app is for, Get started and Apply now.
struct WelcomeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                // Our only region: a label, not a button.
                Text("North America")
                    .pfFont(17)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 28)
            .padding(.trailing, 22)

            VStack(spacing: 0) {
                LogoTile(size: 52, radius: 12)
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text("PF").pfFont(34, .bold, relativeTo: .largeTitle)
                    Text(" Sites").pfFont(34, .light, relativeTo: .largeTitle)
                }
                .padding(.top, 14)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("PF Sites")
                .accessibilityAddTraits(.isHeader)
                Text("Track, manage and transact on the go")
                    .pfFont(17)
                    .multilineTextAlignment(.center)
                    .padding(.top, 14)
            }
            .padding(.top, 30)
            .padding(.horizontal, 21)

            Spacer(minLength: 32)

            Button("Get started") {
                model.auth.path.append(.login)
            }
            .buttonStyle(SolidButtonStyle(radius: 8, height: 48, size: 18))
            .padding(.horizontal, 21)

            HStack(spacing: 8) {
                Text("Don't have an account?")
                    .pfFont(17)
                LinkButton(title: "Apply now", size: 17) {
                    UIPresenter.safari(Config.url("/signup"))
                }
            }
            .padding(.top, 28)
            .padding(.bottom, 36)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .toolbar(.hidden, for: .navigationBar)
    }
}
