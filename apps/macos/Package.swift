// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "ScalarMac",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "ScalarMac", targets: ["ScalarMac"])],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.2")
    ],
    targets: [
        .executableTarget(
            name: "ScalarMac",
            dependencies: [.product(name: "Sparkle", package: "Sparkle")]
        )
    ]
)
