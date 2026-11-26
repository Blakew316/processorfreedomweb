import SwiftUI

/// One thing said in the chat with Scout.
struct ScoutTurn: Identifiable, Equatable {
    let id = UUID()
    var mine: Bool
    var text: String
    var actions: [ScoutAction] = []
}

/// A button under one of Scout's replies: a number to call, or a callback request to the named desk.
struct ScoutAction: Identifiable, Equatable {
    let id = UUID()
    var label: String
    var href: String = ""
    var callback: String = ""
}

/// Insights → "Ask a question": the chat with Scout, laid out after the owner's reference photo (Clover's "Chat with Vera"):
/// the "Chat with Scout" bar with its own X, the chat mark, "Hi <first name>, how can I help?", the notice, starter questions to
/// tap, the "Ask Scout" box with its round arrow, and the line under it. The answers come from the server
/// (POST /api/sites/<id>/scout/chat), which holds the rules for what Scout may discuss and who it hands off to.
struct ScoutChatScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var turns: [ScoutTurn] = []
    @State private var draft = ""
    @State private var waiting = false
    /// Names this conversation on the server once the first answer is back, so a callback request can say what was asked.
    @State private var chatID = ""
    @FocusState private var typing: Bool

    /// Short labels to tap; each sends the full question.
    private static let starters: [(label: String, question: String)] = [
        ("Today's sales", "What are my total sales for today?"),
        ("Troubleshoot my device", "Can you help me troubleshoot my device?"),
        ("Recent deposits", "How do I view my recent deposits?"),
        ("Set up a terminal", "How do I set up my new terminal?"),
        ("Run a refund", "How do I run a refund?"),
    ]

    private var greeting: String {
        let name = model.firstName.trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? "Hi, how can I help?" : "Hi \(name), how can I help?"
    }

    var body: some View {
        VStack(spacing: 0) {
            bar
            Divider()
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        if turns.isEmpty { opening } else { ForEach(turns) { bubble($0).id($0.id) } }
                        if waiting { waitingDots.id("waiting") }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onChange(of: turns) { _, now in
                    guard let last = now.last else { return }
                    withAnimation(.snappy) { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
            .background(alignment: .top) {
                LinearGradient(colors: [Theme.blue.opacity(0.14), .clear], startPoint: .top, endPoint: .bottom).frame(height: 90)
            }
            askBox
            Text("Scout is AI and can make mistakes.")
                .pfFont(13.5)
                .foregroundStyle(SettingsLook.muted)
                .padding(.top, 8)
                .padding(.bottom, 12)
        }
        .background(Color(.systemBackground))
    }

    // MARK: Parts

    /// "Chat with Scout" with its own X, as in the photo: it closes the chat and leaves Insights open underneath.
    private var bar: some View {
        ZStack {
            Text("Chat with Scout")
                .pfFont(17, .semibold, relativeTo: .headline)
                .accessibilityAddTraits(.isHeader)
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(Color.primary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close chat")
                Spacer()
            }
            .padding(.horizontal, 10)
        }
        .frame(height: 52)
    }

    /// What the chat shows before the first question.
    private var opening: some View {
        VStack(spacing: 0) {
            Image(systemName: "bubble.left.and.text.bubble.right")
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(Theme.blue)
                .padding(.top, 14)
                .accessibilityHidden(true)
            Text(greeting)
                .pfFont(24, .medium, relativeTo: .title2)
                .multilineTextAlignment(.center)
                .padding(.top, 12)
            (Text("Your use of this AI-powered chatbot is subject to our ")
                + Text("[Terms](\(Config.url("/terms").absoluteString))")
                + Text(". This chat may be monitored, recorded and stored with our service provider. ")
                + Text("[Privacy policy](\(Config.url("/privacy").absoluteString))"))
                .pfFont(14.5)
                .lineSpacing(3)
                .foregroundStyle(SettingsLook.muted)
                .tint(SettingsLook.muted)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .padding(.top, 16)
            VStack(alignment: .trailing, spacing: 9) {
                ForEach(Self.starters, id: \.label) { starter in
                    Button { ask(starter.question) } label: {
                        Text(starter.label)
                            .pfFont(15.5)
                            .foregroundStyle(Color.primary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Color(.systemGray5), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.top, 26)
        }
        .frame(maxWidth: .infinity)
    }

    private func bubble(_ turn: ScoutTurn) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(turn.text)
                .pfFont(15.5)
                .foregroundStyle(Color.primary)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
            if !turn.actions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(turn.actions) { action in
                        Button { run(action) } label: {
                            Text(action.label)
                                .pfFont(14.5, .semibold)
                                .foregroundStyle(Theme.ink)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 44)
                                .overlay { Capsule().strokeBorder(Theme.ink, lineWidth: 1.5) }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(turn.mine ? Color(.systemGray5) : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .frame(maxWidth: 330, alignment: turn.mine ? .trailing : .leading)
        .frame(maxWidth: .infinity, alignment: turn.mine ? .trailing : .leading)
    }

    private var waitingDots: some View {
        ProgressView()
            .padding(14)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .accessibilityLabel("Scout is answering")
    }

    /// The "Ask Scout" box, with the round arrow at its bottom right as in the photo.
    private var askBox: some View {
        ZStack(alignment: .bottomTrailing) {
            TextField("Ask Scout", text: $draft, axis: .vertical)
                .pfFont(16)
                .lineLimit(3, reservesSpace: true)
                .focused($typing)
                .padding(.leading, 16)
                .padding(.trailing, 60)
                .padding(.vertical, 14)
                .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(SettingsLook.border, lineWidth: 1.5) }
            Button { ask(draft) } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(canSend ? Color.white : SettingsLook.greyed)
                    .frame(width: 44, height: 44)
                    .background(canSend ? Theme.navy : Color(.secondarySystemBackground), in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .padding(.trailing, 10)
            .padding(.bottom, 10)
            .accessibilityLabel("Send")
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var canSend: Bool { !waiting && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    // MARK: Talking to the server

    private func ask(_ text: String) {
        let question = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !waiting, let site = model.site else { return }
        turns.append(ScoutTurn(mine: true, text: question))
        draft = ""
        waiting = true
        let sent = turns.map { ["role": $0.mine ? "user" : "assistant", "text": $0.text] }
        Task {
            do {
                let reply = try await API.post("/api/sites/\(site.id)/scout/chat", ["chatId": chatID, "messages": sent])
                if !reply["chatId"].string.isEmpty { chatID = reply["chatId"].string }
                let actions = reply["actions"].array.compactMap { item -> ScoutAction? in
                    // A section of the website's back office has no button here: the reply names the section in words.
                    let href = item["href"].string, callback = item["callback"].string
                    guard !href.isEmpty || !callback.isEmpty else { return nil }
                    return ScoutAction(label: item["label"].string, href: href, callback: callback)
                }
                turns.append(ScoutTurn(mine: false, text: reply["text"].string, actions: actions))
            } catch is CancellationError {
            } catch {
                turns.append(ScoutTurn(mine: false, text: (error as? APIError)?.message ?? "Scout could not answer just now. Please try again."))
            }
            waiting = false
        }
    }

    private func run(_ action: ScoutAction) {
        if !action.callback.isEmpty { requestCallback(action.callback); return }
        if let url = URL(string: action.href) { openURL(url) }
    }

    /// Asks for a call back. The server texts the request with what was already asked, so nobody has to repeat it.
    private func requestCallback(_ department: String) {
        guard !waiting, let site = model.site else { return }
        waiting = true
        Task {
            do {
                try await API.post("/api/sites/\(site.id)/scout/callback", ["department": department, "chatId": chatID])
                turns.append(ScoutTurn(mine: false, text: "Done. Your callback request has been sent."))
            } catch is CancellationError {
            } catch {
                turns.append(ScoutTurn(mine: false, text: (error as? APIError)?.message ?? "We could not send that request. Please call instead."))
            }
            waiting = false
        }
    }
}
