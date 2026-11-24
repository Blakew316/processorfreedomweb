import SwiftUI

/// The location list: "Choose your primary location" after signing in (photo 4, D5), and the "Choose primary location"
/// sheet from the dashboard's switch-location button, Merchants and Change location (E11).
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

    @State private var query = ""
    @State private var chosen: String?

    init(style: Style, sites: [Site], current: String? = nil, onCancel: @escaping () -> Void = {}, onChoose: @escaping (Site) -> Void) {
        self.style = style
        self.sites = sites
        self.current = current
        self.onCancel = onCancel
        self.onChoose = onChoose
        _chosen = State(initialValue: current)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                FilledSearchField(placeholder: "Search all locations", text: $query)
                    .padding(.horizontal, 17)
                    .padding(.top, 16)
                Divider()
                    .padding(.top, 14)
                Text("OPEN")
                    .pfFont(13, .bold)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 19)
                    .frame(maxWidth: .infinity, minHeight: 41, alignment: .leading)
                    .background(Color(.systemGray5))
                    .accessibilityAddTraits(.isHeader)
                rows
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            Button(style == .signIn ? "Continue" : "Save") {
                if let picked = sites.first(where: { $0.id == chosen }) { onChoose(picked) }
            }
            .buttonStyle(SolidButtonStyle(fill: canContinue ? Theme.blue : Color(.systemGray3), text: .white, radius: 10, height: 48, size: 18))
            .disabled(!canContinue)
            .padding(.horizontal, 17)
            .padding(.vertical, 10)
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
            VStack(alignment: .leading, spacing: 0) {
                LocationFlag()
                    .padding(.top, 28)
                    .padding(.leading, 8)
                Text("Choose your primary location")
                    .pfFont(23, .bold, relativeTo: .title2)
                    .padding(.top, 34)
                    .accessibilityAddTraits(.isHeader)
                Text("This is the location you log in to by default and the passcode you will use to log in. You can change your location again after you log in.")
                    .pfFont(17)
                    .lineSpacing(6)
                    .padding(.top, 12)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 17)
        case .sheet:
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer()
                    Button {
                        onCancel()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 22, weight: .regular))
                            .foregroundStyle(.primary)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Close")
                }
                .padding(.top, 12)
                .padding(.trailing, 8)
                Text("Choose primary location")
                    .pfFont(24, .bold, relativeTo: .title2)
                    .padding(.horizontal, 17)
                    .accessibilityAddTraits(.isHeader)
                Text("This is the default location every time you log in to the app.")
                    .pfFont(17)
                    .lineSpacing(6)
                    .padding(.top, 12)
                    .padding(.horizontal, 17)
                    .fixedSize(horizontal: false, vertical: true)
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
                .pfFont(17)
                .foregroundStyle(.secondary)
                .padding(19)
        }
        ForEach(Array(list.enumerated()), id: \.element.id) { index, business in
            let picked = business.id == chosen
            Button {
                chosen = business.id
                Haptics.light()
            } label: {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(business.name.uppercased())
                            .pfFont(19)
                            .foregroundStyle(.primary)
                        Text(business.placeLine.uppercased())
                            .pfFont(16)
                            .foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    if picked {
                        Image(systemName: "checkmark")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(Theme.blue)
                    }
                }
                .padding(.horizontal, 19)
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(picked ? Theme.lightBlue : Color.clear)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(picked ? .isSelected : [])
            if index < list.count - 1 {
                Divider().padding(.horizontal, 19)
            }
        }
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
            pennant.addLine(to: CGPoint(x: 27 * unit, y: 7.5 * unit))
            pennant.addLine(to: CGPoint(x: 13 * unit, y: 13 * unit))
            pennant.closeSubpath()
            context.fill(pennant, with: .color(blue))
            var pole = Path()
            pole.move(to: CGPoint(x: 12.5 * unit, y: 2 * unit))
            pole.addLine(to: CGPoint(x: 12.5 * unit, y: 31 * unit))
            context.stroke(pole, with: .color(ink), style: StrokeStyle(lineWidth: 2 * unit, lineCap: .round))
            let ring = Path(ellipseIn: CGRect(x: 2 * unit, y: 27.5 * unit, width: 21 * unit, height: 7 * unit))
            context.stroke(ring, with: .color(ink), lineWidth: 1.8 * unit)
        }
        .frame(width: 28, height: 36)
        .accessibilityHidden(true)
    }
}
