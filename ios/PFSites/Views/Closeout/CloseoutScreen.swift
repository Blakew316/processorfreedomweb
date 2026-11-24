import SwiftUI

// PLACEHOLDER, replaced by the Closeout agent (Part F). Nothing here may ship.
struct CloseoutScreen: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Color(.systemBackground)
                .navigationTitle("Closeout")
                .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Close", systemImage: "xmark") { dismiss() } } }
        }
    }
}
