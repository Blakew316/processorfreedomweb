import SwiftUI
import UIKit

/// The look of the Closeout screen, measured from the owner's Clover photos (1125 x 2436 px screenshots of a 375 x 812 pt phone,
/// so 3 px = 1 pt), with Clover's green rebranded to Processor Freedom's blue. Unlike the Settings pages, the page is white.
enum CloseoutLook {
    static let page = Color(.systemBackground)
    /// #5C5C5C: the sentence at the bottom of the Open batch card.
    static let note = Color(light: UIColor(hex: 0x5C5C5C), dark: .secondaryLabel)
    /// #727272: the lines of a batch row (Standard transactions, Count, Batch Total, ID).
    static let detail = Color(light: UIColor(hex: 0x727272), dark: .secondaryLabel)
    /// #F5F5F5: a batch row while it is pressed.
    static let pressed = Color(light: UIColor(hex: 0xF5F5F5), dark: .systemGray6)
    /// #F9F9F9: the box behind "Show more...", barely off the page (in dark mode too: a grey box there read as a button).
    static let moreFill = Color(light: UIColor(hex: 0xF9F9F9), dark: UIColor(hex: 0x0D0D0E))
    /// #FAE9AD with #0F0B00 words: the "Open" pill.
    static let openFill = Color(light: UIColor(hex: 0xFAE9AD), dark: UIColor(hex: 0xFAE9AD, alpha: 0.24))
    static let openText = Color(light: UIColor(hex: 0x0F0B00), dark: UIColor(hex: 0xFCEFC2))

    /// The page's description: the photo's two sentences (the owner asked for the screen to be identical to the photo), then the
    /// website's own sentence about the open batch (public/js/editor.js CL.close), as its own paragraph, behind "Show more...".
    /// "Show more..." shows only when the description runs past three lines; the paragraph break makes the third line end at
    /// "closes.", so the link sits after whole words at the end of the third line, as in the photo.
    static let description = "Card transactions make up a batch for a given time period. Funds are deposited 1–3 days after each batch closes.\n\nYour open batch consists of all transactions since your last closeout."
    /// The Open batch card's sentence, as in the photo (the owner asked for the screen to be identical to the photo).
    static let openSentence = "Funds are deposited within 1-3 business days after each closeout event"

    /// A moment the way the website's Closeout page writes it (toLocaleString with a short weekday and month, the day, the year,
    /// the hour and the minutes, in the phone's own language): "Mon, Nov 23, 2026, 6:35 PM". It is written on the business's
    /// clock (ordering.timezone), like the times of the Orders tab, so a batch reads the same wherever the phone is.
    static func when(_ date: Date, in zone: TimeZone) -> String {
        let day = date.formatted(Date.FormatStyle(timeZone: zone).weekday(.abbreviated).month(.abbreviated).day().year())
        // An ordinary space before AM and PM, as in the photo and on the Orders tab: the system writes a narrow one, which
        // reads as "11:11AM".
        let time = date.formatted(Date.FormatStyle(timeZone: zone).hour().minute()).replacingOccurrences(of: "\u{202F}", with: " ")
        return "\(day), \(time)"
    }
}

/// Where the Closeout cover's own navigation stack can go: the open batch, or a closed one.
enum CloseoutRoute: Hashable {
    case current
    case closed(CloseoutBatch)
}

/// The status pill of a batch row (the photos): "Open" in yellow; "Closed" in light blue #E8F1FC with navy words (Clover's light
/// green with dark green words, rebranded like the app's other light blue pills). Greyed for the L3 row, which Processor Freedom
/// does not have.
struct CloseoutPill: View {
    let open: Bool
    var greyed = false

    var body: some View {
        Text(open ? "Open" : "Closed")
            .pfFont(14, .semibold)
            .foregroundStyle(text)
            .lineLimit(1)
            .padding(.horizontal, 13)
            .frame(minHeight: 32)
            .background(fill, in: Capsule())
    }

    private var fill: Color {
        if greyed { return SettingsLook.offFill }
        return open ? CloseoutLook.openFill : SettingsLook.onFill
    }

    private var text: Color {
        if greyed { return SettingsLook.greyed }
        return open ? CloseoutLook.openText : SettingsLook.onText
    }
}

/// A row of the batch history (the photos): the batch's name or the time it was closed (16 pt), its pill, then its lines in grey
/// (14 pt, 24 pt apart), and a chevron centred at the right. 168 pt tall, 192 pt with the ID line, as in the photos: the
/// paddings and the lines' own heights (19.33 pt for the name, 17 pt for a grey line) add up to exactly that.
struct CloseoutBatchRow: View {
    let title: String
    let open: Bool
    let kind: String
    let count: Int
    let total: Int
    var code: String? = nil
    var greyed = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .pfFont(16, .semibold)
                    .foregroundStyle(greyed ? SettingsLook.greyed : Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                CloseoutPill(open: open, greyed: greyed)
                    .padding(.top, 6.2)
                VStack(alignment: .leading, spacing: 7) {
                    Text(kind)
                    Text("Count: \(String(count))")
                    Text("Batch Total: \(Money.format(total))")
                    if let code {
                        Text("ID: \(code)")
                    }
                }
                .pfFont(14)
                .foregroundStyle(greyed ? SettingsLook.greyed : CloseoutLook.detail)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6.3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(greyed ? SettingsLook.greyed : Color.primary)
                .accessibilityHidden(true)
        }
        .padding(.leading, 18)
        .padding(.trailing, 25.3)
        .padding(.top, 20.6)
        .padding(.bottom, 18.57)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

/// A batch row turns light grey while it is pressed, as in the photo.
struct CloseoutRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? CloseoutLook.pressed : Color.clear)
    }
}

/// The line between batch rows: 2 pt of #E3E3E3 (1 pt above the first row), across the page between its 16 pt margins.
struct CloseoutRule: View {
    var height: CGFloat = 2

    var body: some View {
        SettingsLook.border
            .frame(height: height)
            .accessibilityHidden(true)
    }
}

/// The page's description (16 pt #4D4D4D, 24 pt lines), clipped at three lines with the brand-blue "Show more..." on its light grey
/// box at the end of the third line (the photo); opened, the whole text with a brand-blue "Show less" at its end. The link only
/// shows when the text is longer than three lines: a link with nothing behind it would promise more than there is.
struct CloseoutDescription: View {
    let text: String

    @State private var expanded = false
    @State private var fullHeight: CGFloat = 0
    @State private var shortHeight: CGFloat = 0

    private var longer: Bool { fullHeight > shortHeight + 1 }

    /// The text before its first blank line (the whole text when it has none).
    private var firstParagraph: String {
        guard let range = text.range(of: "\n\n") else { return text }
        return String(text[..<range.lowerBound])
    }

    var body: some View {
        Group {
            if expanded && longer {
                Text(opened)
                    .modifier(CloseoutDescriptionStyle(lines: nil))
                    .tint(Theme.blue)
                    .environment(\.openURL, OpenURLAction { _ in
                        withAnimation(.snappy) { expanded = false }
                        return .handled
                    })
                    .accessibilityAction(named: "Show less") {
                        withAnimation(.snappy) { expanded = false }
                    }
            } else {
                // Closed, only the first paragraph shows, so the third line ends on whole words with no "…" before the link.
                Text(longer ? firstParagraph : text)
                    .modifier(CloseoutDescriptionStyle(lines: 3))
                    // On the third line's baseline, whatever the text size.
                    .overlay(alignment: Alignment(horizontal: .trailing, vertical: .lastTextBaseline)) {
                        if longer { showMore }
                    }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // Two unseen copies measure the text whole and at three lines, so the link knows whether there is more to show.
        .background(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                Text(text)
                    .modifier(CloseoutDescriptionStyle(lines: nil))
                    .onGeometryChange(for: CGFloat.self) { proxy in
                        proxy.size.height
                    } action: { height in
                        fullHeight = height
                    }
                Text(text)
                    .modifier(CloseoutDescriptionStyle(lines: 3))
                    .onGeometryChange(for: CGFloat.self) { proxy in
                        proxy.size.height
                    } action: { height in
                        shortHeight = height
                    }
            }
            .opacity(0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    /// The whole text with a brand-blue "Show less" at its end.
    private var opened: AttributedString {
        var out = AttributedString(text + " ")
        var link = AttributedString("Show less")
        link.link = URL(string: "pfcloseout://less")
        link.foregroundColor = Theme.blue
        out += link
        return out
    }

    /// "Show more..." on its #F9F9F9 box (24 pt tall, 10 pt either side of the words, 4 pt in from the right edge), over the end
    /// of the third line, which runs on under it as in the photo: the box and the white 4 pt beside it hide the rest of the line.
    private var showMore: some View {
        Button {
            withAnimation(.snappy) { expanded = true }
        } label: {
            Text("Show more...")
                .pfFont(16)
                .foregroundStyle(Theme.blue)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 10)
                .padding(.top, 2.8)
                .padding(.bottom, 2.1)
                .background(CloseoutLook.moreFill)
                // A taller place to tap than the box itself, without moving anything.
                .padding(.vertical, 10)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -10)
        .accessibilityLabel("Show more")
        .padding(.trailing, 4)
        .background(alignment: .trailing) {
            CloseoutLook.page
                .frame(width: 4)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

/// 16 pt #4D4D4D with 24 pt between baselines, as in the photo.
private struct CloseoutDescriptionStyle: ViewModifier {
    let lines: Int?

    func body(content: Content) -> some View {
        content
            .pfFont(16)
            .foregroundStyle(SettingsLook.muted)
            .lineSpacing(4.9)
            .lineLimit(lines)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The bold "Closeout" in the middle of the bar on every page of the cover, as on the photo (19 pt).
struct CloseoutBarTitle: View {
    var body: some View {
        Text("Closeout")
            .pfFont(19, .bold, relativeTo: .headline)
            .lineLimit(1)
            .accessibilityAddTraits(.isHeader)
    }
}
