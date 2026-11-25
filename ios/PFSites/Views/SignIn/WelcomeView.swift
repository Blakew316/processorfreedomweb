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
        // Back on Welcome, the password typed on Log in is forgotten: left in the form, anyone who picked the phone up later
        // could open Log in again and read it with the eye button.
        .onChange(of: auth.path) { _, path in
            auth.attempt += 1
            if path.isEmpty, !auth.password.isEmpty { auth.password = "" }
            // The copy the code step sends again goes when that step is left (Cancel, or Back).
            if path.last != .twoStep, !auth.sentPassword.isEmpty { auth.sentPassword = "" }
        }
    }
}

/// The first screen for someone signed out (photo 1): our name, what the app is for, Get started and Apply now.
/// Sizes from the photo: the region 17 pt, the 32 pt tile 92 pt below the top of the safe area, "PF Sites" 27 pt right under it,
/// the line under that 14.2 pt; at the foot a 44 pt button 20 pt in from each side, then "Don't have an account?" 14.2 pt with
/// "Apply now" 16 pt on the same baseline (its cap height is 11.3 pt in the photo against 10 pt).
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
            .padding(.top, 32)
            .padding(.trailing, 20)

            VStack(spacing: 0) {
                LogoTile(size: 32, radius: 7.5)
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text("PF").pfFont(27, .bold, relativeTo: .largeTitle)
                    Text(" Sites").pfFont(27, .light, relativeTo: .largeTitle)
                }
                // 5 pt puts the name's baseline where the photo has it, 63 pt under the tile's top (and the line under it with it).
                .padding(.top, 5)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("PF Sites")
                .accessibilityAddTraits(.isHeader)
                Text("Track, manage and transact on the go")
                    .pfFont(14.2)
                    .multilineTextAlignment(.center)
                    .padding(.top, 10)
            }
            .padding(.top, 40)
            .padding(.horizontal, 20)

            Spacer(minLength: 32)

            Button("Get started") {
                // A fresh start: what an earlier try said is not shown again.
                model.auth.error = ""
                // Set, not added: a second tap that lands before Log in has slid in does not open it twice.
                model.auth.path = [.login]
            }
            .buttonStyle(SolidButtonStyle(radius: 6, height: 44, size: 14.7))
            .padding(.horizontal, 20)

            // The bigger "Apply now" sets the line's height: 16.6 pt above and 45.3 pt below keep the baseline (and the button above)
            // where the photo has them.
            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text("Don't have an account?")
                    .pfFont(14.2)
                LinkButton(title: "Apply now", size: 16) {
                    UIPresenter.safari(Config.url("/signup"))
                }
            }
            .padding(.top, 16.6)
            .padding(.bottom, 45.3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .toolbar(.hidden, for: .navigationBar)
    }
}
