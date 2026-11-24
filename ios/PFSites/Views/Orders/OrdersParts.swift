import SwiftUI
import UIKit

/// The look of the Orders tab, measured from the owner's Clover photo (1125 x 2436 px of a 375 x 812 pt phone, so 3 px = 1 pt),
/// with Clover's green rebranded to Processor Freedom's blue.
enum OrdersLook {
    /// #5C5C5C: the search field's border and its placeholder.
    static let fieldBorder = Color(light: UIColor(hex: 0x5C5C5C), dark: .systemGray)
    static let placeholder = Color(light: UIColor(hex: 0x5C5C5C), dark: .secondaryLabel)
    /// #727272: the filter button's border.
    static let buttonBorder = Color(light: UIColor(hex: 0x727272), dark: .systemGray)
    /// #E5E5E5: the hairlines and the grey band over each day.
    static let hairline = Color(light: UIColor(hex: 0xE5E5E5), dark: .systemGray4)
    static let band = Color(light: UIColor(hex: 0xE5E5E5), dark: .systemGray5)
    /// #FBFBFB behind the rows.
    static let row = Color(light: UIColor(hex: 0xFBFBFB), dark: .secondarySystemBackground)
    /// #7E7E7E: the chevron on a day's band.
    static let chevron = Color(light: UIColor(hex: 0x7E7E7E), dark: .systemGray)
    /// #253338: a row's total, order number and payment line.
    static let rowText = Color(light: UIColor(hex: 0x253338), dark: .label)
    /// The grey of a "Not paid" pill. In dark mode it is a step lighter than the rows and cards it sits on, where the light
    /// mode's grey would be their own colour and the pill would vanish.
    static let quietPill = Color(light: .systemGray6, dark: .systemGray5)
}

/// The pill at the right of an order: Paid (light blue), Not paid (grey), Cancelled and Refunded (light red).
struct OrderPillView: View {
    let pill: OrderPill

    var body: some View {
        Text(pill.title)
            .pfFont(14, .semibold)
            .foregroundStyle(text)
            .lineLimit(1)
            .padding(.horizontal, 14)
            .frame(minWidth: 81, minHeight: 22)
            .background(fill, in: Capsule())
    }

    private var fill: Color {
        switch pill {
        case .paid: return SettingsLook.onFill
        case .notPaid: return OrdersLook.quietPill
        case .cancelled, .refunded: return Theme.error.opacity(0.14)
        }
    }

    private var text: Color {
        switch pill {
        case .paid: return SettingsLook.onText
        case .notPaid: return Color(.secondaryLabel)
        case .cancelled, .refunded: return Theme.error
        }
    }
}

/// A 1 pt line across the screen.
struct OrdersHairline: View {
    var body: some View {
        OrdersLook.hairline.frame(height: 1)
    }
}

/// The filter button's two sliders, drawn as in the owner's photo on an 18 x 20 pt grid: the left knob low, the right knob high,
/// each line 1.67 pt thick with round ends. (The other screens' filter buttons are drawn the same way from their photos.)
struct OrdersSliders: Shape {
    func path(in rect: CGRect) -> Path {
        let unit = min(rect.width / 18, rect.height / 20)
        let left = rect.midX - 5 * unit, right = rect.midX + 5 * unit
        let point = { (x: CGFloat, y: CGFloat) in CGPoint(x: x, y: rect.midY + y * unit) }
        let knob = { (x: CGFloat, y: CGFloat) in
            CGRect(x: x - 2.92 * unit, y: rect.midY + (y - 2.92) * unit, width: 5.84 * unit, height: 5.84 * unit)
        }
        var path = Path()
        path.move(to: point(left, -8.83))
        path.addLine(to: point(left, -3.17))
        path.addEllipse(in: knob(left, 3))
        path.move(to: point(left, 5.92))
        path.addLine(to: point(left, 8.83))
        path.move(to: point(right, -8.83))
        path.addLine(to: point(right, -5.92))
        path.addEllipse(in: knob(right, -3))
        path.move(to: point(right, 3.17))
        path.addLine(to: point(right, 8.83))
        return path
    }
}

/// A short message in a glass capsule ("Added Coffee", "#1042 paid by cash") that goes away by itself.
struct GlassToast: View {
    let text: String
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        Text(text)
            .pfFont(16, .semibold)
            .foregroundStyle(.primary)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .modifier(ToastBackground(reduceTransparency: reduceTransparency))
            .onAppear { UIAccessibility.post(notification: .announcement, argument: text) }
            // A toast already showing keeps its view when its words change ("Added Coffee", then "Added Bagel"): say the new ones too.
            .onChange(of: text) { _, new in UIAccessibility.post(notification: .announcement, argument: new) }
    }
}

private struct ToastBackground: ViewModifier {
    let reduceTransparency: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(Capsule().fill(Color(.secondarySystemBackground)))
        } else {
            content.glassEffect(.regular, in: .capsule)
        }
    }
}

/// The filter sheet behind the slider button: how the order is collected, and whether it is paid. Apply uses the choices; Clear
/// goes back to all orders.
struct OrderFiltersSheet: View {
    let orders: OrdersModel
    @Environment(\.dismiss) private var dismiss
    @State private var type: OrderTypeFilter = .all
    @State private var payment: PaymentFilter = .all

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Filters")
                    .pfFont(21, .bold, relativeTo: .title2)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 20))
                        .foregroundStyle(.primary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.leading, 18)
            .padding(.trailing, 8)
            .padding(.top, 14)

            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    section("Order type") {
                        ForEach(OrderTypeFilter.allCases) { option in
                            choice(option.label, on: type == option) { type = option }
                        }
                    }
                    section("Payment") {
                        ForEach(PaymentFilter.allCases) { option in
                            choice(option.label, on: payment == option) { payment = option }
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 20)
            }

            HStack(spacing: 12) {
                Button("Clear") {
                    orders.typeFilter = .all
                    orders.paymentFilter = .all
                    dismiss()
                }
                .buttonStyle(OutlineButtonStyle())
                Button("Apply") {
                    orders.typeFilter = type
                    orders.paymentFilter = payment
                    dismiss()
                }
                .buttonStyle(SolidButtonStyle(radius: 8, height: 48, size: 17))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .overlay(alignment: .top) { OrdersHairline() }
        }
        .background(Color(.systemBackground))
        .presentationDetents([.medium, .large])
        .onAppear {
            type = orders.typeFilter
            payment = orders.paymentFilter
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .pfFont(17, .bold)
                .padding(.bottom, 6)
                .accessibilityAddTraits(.isHeader)
            content()
        }
    }

    /// A radio row like the ones on the other screens' filter sheets (the owner's photos): a 16 pt ring with a 6 pt dot, the
    /// chosen one navy (Clover's dark green), white in dark mode.
    private func choice(_ title: String, on: Bool, pick: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.snappy(duration: 0.2)) { pick() }
        } label: {
            HStack(spacing: 13) {
                ZStack {
                    Circle()
                        .strokeBorder(on ? Theme.ink : SettingsLook.muted, lineWidth: 1)
                    if on {
                        Circle()
                            .fill(Theme.ink)
                            .frame(width: 6, height: 6)
                    }
                }
                .frame(width: 16, height: 16)
                .accessibilityHidden(true)
                Text(title)
                    .pfFont(17)
                    .foregroundStyle(.primary)
                Spacer(minLength: 0)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// A white button with a grey border and blue words (Clear, Record payment).
struct OutlineButtonStyle: ButtonStyle {
    var text: Color = Theme.blue
    var height: CGFloat = 48
    var radius: CGFloat = 8

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .pfFont(17, .semibold)
            .foregroundStyle(text)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color(light: .white, dark: .secondarySystemBackground)))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color(.systemGray3), lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
