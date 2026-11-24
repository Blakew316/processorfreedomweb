import SwiftUI

/// The location list: "Choose your primary location" after signing in (photo 4, D5), and the "Choose primary location"
/// sheet from the dashboard's switch-location button, Merchants and Change location (E11, the owner's two sheet photos).
/// Both photos share the list: a 48 pt grey search field 18 pt in from each side, a hairline, the 40 pt "OPEN" band, then the
/// businesses (the name 16.5 pt and its address 14.2 pt, both in capitals), and a 46 pt button pinned at the foot.
struct LocationPickerView: View {
    enum Style {
        case signIn   // full screen after signing in: the flag, Continue
        case sheet    // a sheet from the dashboard: X to close, the current one checked, Save
    }

    let style: Style
    let sites: [Site]
    let current: String?
    let onCancel: () -> Void
    let onChoose: (Site) -> Void
    /// Set when the session covers only one business (a team passcode): the list offers signing in with email to see them all.
    var onSignInForAll: (() -> Void)? = nil

    @State private var query = ""
    @State private var chosen: String?

    init(style: Style, sites: [Site], current: String? = nil, onCancel: @escaping () -> Void = {}, onSignInForAll: (() -> Void)? = nil, onChoose: @escaping (Site) -> Void) {
        self.style = style
        self.sites = sites
        self.current = current
        self.onCancel = onCancel
        self.onSignInForAll = onSignInForAll
        self.onChoose = onChoose
        _chosen = State(initialValue: current)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                LocationSearchField(text: $query)
                    .padding(.horizontal, 18)
                    .padding(.top, 9)
                // The hairline under the search, a point of white, then the grey band.
                Rectangle()
                    .fill(Color(.systemGray4))
                    .frame(height: 1)
                    .padding(.top, 13)
                Text("OPEN")
                    .pfFont(12.5, .bold)
                    .foregroundStyle(SignInLook.muted)
                    .padding(.leading, 18)
                    .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
                    .background(Color(.systemGray5))
                    .padding(.top, 1)
                    .accessibilityAddTraits(.isHeader)
                rows
                if let onSignInForAll {
                    LinkButton(title: "Sign in with email to see all your businesses", size: 16.5) { onSignInForAll() }
                        .padding(.horizontal, 18)
                        .padding(.top, 22)
                        .padding(.bottom, 12)
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            Button(style == .signIn ? "Continue" : "Save") {
                if let picked = sites.first(where: { $0.id == chosen }) { onChoose(picked) }
            }
            .buttonStyle(SolidButtonStyle(fill: canContinue ? Theme.blue : Color(.systemGray3), text: .white, radius: 4, height: 46, size: 18.5))
            .disabled(!canContinue)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 3)
            .background(Color(.systemBackground))
        }
        .background(Color(.systemBackground))
    }

    private var canContinue: Bool {
        guard let chosen else { return false }
        return style == .signIn || chosen != current
    }

    @ViewBuilder
    private var header: some View {
        switch style {
        case .signIn:
            // From the top of the safe area: the flag 38 pt down and 25 pt in, the title 29 pt under it, the words 12 pt under that.
            VStack(alignment: .leading, spacing: 0) {
                LocationFlag()
                    .padding(.top, 38)
                    .padding(.leading, 9)
                Text("Choose your primary location")
                    .pfFont(21, .bold, relativeTo: .title2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 29)
                    .accessibilityAddTraits(.isHeader)
                Text("This is the location you log in to by default and the passcode you will use to log in. You can change your location again after you log in.")
                    .pfFont(16.5)
                    .lineSpacing(6.3)
                    .padding(.top, 12)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 16)
        case .sheet:
            // From the top of the sheet: the X centred 28 pt down, 20 pt from the right; the title 48 pt down.
            VStack(alignment: .leading, spacing: 0) {
                Text("Choose primary location")
                    .pfFont(21, .bold, relativeTo: .title2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.trailing, 44)
                    .accessibilityAddTraits(.isHeader)
                Text("This is the default location every time you log in to the app.")
                    .pfFont(16.5)
                    .lineSpacing(6.3)
                    .padding(.top, 13)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 16)
            .padding(.top, 48)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .topTrailing) {
                Button {
                    onCancel()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 20, weight: .regular))
                        .foregroundStyle(.primary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, 6)
                .padding(.trailing, 6)
                .accessibilityLabel("Close")
            }
        }
    }

    private var shown: [Site] {
        let words = query.trimmed
        guard !words.isEmpty else { return sites }
        return sites.filter { $0.name.localizedCaseInsensitiveContains(words) || $0.street.localizedCaseInsensitiveContains(words) }
    }

    @ViewBuilder
    private var rows: some View {
        let list = shown
        if list.isEmpty {
            Text("No locations match \u{201C}\(query.trimmed)\u{201D}.")
                .pfFont(16.5)
                .foregroundStyle(.secondary)
                .padding(18)
        }
        ForEach(Array(list.enumerated()), id: \.element.id) { index, business in
            let picked = business.id == chosen
            Button {
                chosen = business.id
                Haptics.light()
            } label: {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4.8) {
                        Text(business.name.uppercased())
                            .pfFont(16.5)
                            .foregroundStyle(.primary)
                        LocationAddress(business: business)
                    }
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    // The tick's place is kept on every row, so a long address wraps the same way whether it is chosen or not.
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.blue)
                        .opacity(picked ? 1 : 0)
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, 18)
                .padding(.top, 29.6)
                .padding(.bottom, 25.5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(picked ? Theme.lightBlue : Color.clear)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(picked ? .isSelected : [])
            if index < list.count - 1 {
                Rectangle()
                    .fill(Color(.systemGray4))
                    .frame(height: 1)
                    .padding(.horizontal, 18)
            }
        }
    }

    /// The address in capitals, with the state and the ZIP kept together on one line ("…, KAUFMAN, / TX, 75142"), as in the photos.
    static func addressLine(_ business: Site) -> String {
        let line = business.placeLine.uppercased()
        guard !business.street.trimmed.isEmpty, let last = line.range(of: ", ", options: .backwards) else { return line }
        return line.replacingCharacters(in: last, with: ",\u{00A0}")
    }
}

/// A business's address under its name (14.2 pt, in capitals). On one line when it fits; otherwise the street and town, then the
/// state and ZIP under them ("112 N WASHINGTON ST, KAUFMAN," / "TX, 751422051"), the second line 14 pt below the first as in both
/// photos. One wrapping text would put it 16.95 pt below (SF Pro's line height is 1.1934 times its size), so the two lines are set
/// as two texts drawn 2.95 pt closer, scaled with the text size.
struct LocationAddress: View {
    let business: Site
    @ScaledMetric(relativeTo: .body) private var closer: CGFloat = -2.95

    var body: some View {
        let line = LocationPickerView.addressLine(business)
        if let split = Self.lines(business) {
            ViewThatFits(in: .horizontal) {
                piece(line)
                VStack(alignment: .leading, spacing: closer) {
                    piece(split.first)
                    piece(split.second)
                }
            }
        } else {
            piece(line)
        }
    }

    private func piece(_ text: String) -> some View {
        Text(text)
            .pfFont(14.2)
            .foregroundStyle(SignInLook.muted)
    }

    /// Where a typed address breaks: before its last two parts (the state and the ZIP). Nil for a web address, or a street with
    /// fewer than three parts, which wrap as ordinary text.
    static func lines(_ business: Site) -> (first: String, second: String)? {
        guard !business.street.trimmed.isEmpty else { return nil }
        let parts = business.placeLine.uppercased().components(separatedBy: ", ")
        guard parts.count >= 3 else { return nil }
        return (parts.dropLast(2).joined(separator: ", ") + ",", parts.suffix(2).joined(separator: ", "))
    }
}

/// The location search (both photos): #EEEEEE with 4 pt corners, 48 pt tall, the magnifying glass 10 pt in, then the prompt in grey.
struct LocationSearchField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 17))
                .foregroundStyle(.primary)
                .accessibilityHidden(true)
            TextField("Search all locations", text: $text, prompt: Text("Search all locations").foregroundStyle(SignInLook.muted))
                .pfFont(16.5)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 48)
        .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(SignInLook.searchFill))
    }
}

/// The flag of the location screen: a navy pole (white in dark mode) with a small ring at its foot and a blue pennant.
struct LocationFlag: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let ink: Color = colorScheme == .dark ? .white : Color(uiColor: UIColor(hex: 0x0a1f44))
        let blue = Theme.flagBlue
        Canvas { context, size in
            let unit = min(size.width / 28, size.height / 36)
            var pennant = Path()
            pennant.move(to: CGPoint(x: 13 * unit, y: 2 * unit))
            pennant.addLine(to: CGPoint(x: 25 * unit, y: 7.5 * unit))
            pennant.addLine(to: CGPoint(x: 13 * unit, y: 13 * unit))
            pennant.closeSubpath()
            context.fill(pennant, with: .color(blue))
            // From the photo: a 1.5 pt pole down to the foot of a 1.3 pt ring 22.7 x 7 pt around it.
            var pole = Path()
            pole.move(to: CGPoint(x: 12.5 * unit, y: 2 * unit))
            pole.addLine(to: CGPoint(x: 12.5 * unit, y: 34 * unit))
            context.stroke(pole, with: .color(ink), style: StrokeStyle(lineWidth: 1.5 * unit, lineCap: .round))
            let ring = Path(ellipseIn: CGRect(x: 1.5 * unit, y: 27.5 * unit, width: 22 * unit, height: 7 * unit))
            context.stroke(ring, with: .color(ink), lineWidth: 1.3 * unit)
        }
        .frame(width: 28, height: 36)
        .accessibilityHidden(true)
    }
}
