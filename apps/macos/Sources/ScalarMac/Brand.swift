import SwiftUI

enum ScalarBrand {
    static let blue = Color(red: 90 / 255, green: 176 / 255, blue: 232 / 255)
    static let ink = Color(red: 10 / 255, green: 10 / 255, blue: 10 / 255)
    static let panel = Color(nsColor: .controlBackgroundColor)
}

struct ScalarMark: View {
    var body: some View {
        Text("]s[")
            .font(.system(size: 25, weight: .bold, design: .rounded))
            .foregroundStyle(ScalarBrand.blue)
            .accessibilityLabel("Scalar")
    }
}
