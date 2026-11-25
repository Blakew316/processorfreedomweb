import Foundation
import Observation

/// The screens of the sign-in stack after Welcome.
enum AuthStep: Hashable {
    case login
    case twoStep
}

/// What the Welcome, Log in and Two-step screens share: the typed email and password (sent again with the code),
/// and what the server said about the second step.
@Observable @MainActor
final class AuthFlow {
    var path: [AuthStep] = []
    var email = ""
    var password = ""
    var methods: [String] = []
    var phone = ""
    var sent = false
    var busy = false
    var error = ""
    /// A line shown above the form, for example after "Forgot passcode?".
    var note = ""
    /// After signing in, the person makes a new passcode instead of typing the old one.
    var forgotPasscode = false
    /// Why the code step starts without a code on its way (the text message could not be sent, or another one was asked for too
    /// soon): the server's words, handed from Log in to the code step, which shows them under its boxes.
    var codeProblem = ""

    func reset(email: String) {
        path = []
        self.email = email
        password = ""
        methods = []
        phone = ""
        sent = false
        busy = false
        error = ""
        note = ""
        forgotPasscode = false
        codeProblem = ""
    }

    /// Takes in what the server said about the second step: which ways are on, the end of the phone number, whether it just texted.
    func took(_ e: APIError) {
        if !e.methods.isEmpty { methods = e.methods }
        if !e.phone.isEmpty { phone = e.phone }
        sent = e.sent
    }

    /// The code step starts on the text message when one was just sent or texting is the only way.
    var startsWithText: Bool { sent || methods == ["text"] }

    /// The last four digits of the number the code went to ("•••• 1234" from the server).
    var lastFour: String { String(phone.filter { $0.isASCII && $0.isNumber }.suffix(4)) }
}
