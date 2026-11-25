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
    /// The password the server has just accepted, kept for the code step, which sends it again with the code. No field shows it:
    /// the one on Log in is emptied as the code step opens, so going back there never leaves a right password one tap on the eye
    /// away. It goes when the code step is left.
    var sentPassword = ""
    var methods: [String] = []
    var phone = ""
    var sent = false
    var busy = false
    var error = ""
    /// A line shown above the form, for example after "Forgot passcode?".
    var note = ""
    /// After signing in, the person makes a new passcode instead of typing the old one.
    var forgotPasscode = false
    /// Whose passcode was forgotten (their email, in small letters): someone else who signs in after "Forgot passcode?" types the
    /// passcode they have instead of being walked into replacing it. Empty when the phone remembered no email.
    var forgotFor = ""
    /// Why the code step starts without a code on its way (the text message could not be sent, or another one was asked for too
    /// soon): the server's words, handed from Log in to the code step, which shows them under its boxes.
    var codeProblem = ""

    func reset(email: String) {
        path = []
        self.email = email
        password = ""
        sentPassword = ""
        methods = []
        phone = ""
        sent = false
        busy = false
        error = ""
        note = ""
        forgotPasscode = false
        forgotFor = ""
        codeProblem = ""
    }

    /// "Forgot passcode?" holds for the person signing in with this email (and for anyone when nobody was remembered).
    func forgot(for email: String) -> Bool {
        let who = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return forgotPasscode && (forgotFor.isEmpty || who.isEmpty || who == forgotFor)
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
