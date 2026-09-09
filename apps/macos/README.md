# Scalar for macOS

Scalar is a native macOS client authored with the Native SDK. Its application
logic is ahead-of-time compiled from `src/core.ts`, and its UI is rendered from
`src/app.native` by native AppKit and Metal surfaces. The shipped application
contains no JavaScript runtime, browser shell, or WebView.

The client uses the same Scalar brand and product data as the web application.
Login is completed in the user's default browser through a short-lived device
authorization flow. Access and refresh tokens are stored in macOS Keychain and
all CRM data remains canonical in the Scalar web service.

## Build and test

```sh
native check
native test
native build
native package --target macos --signing adhoc --archive
```

The development DMG is written to `zig-out/package/`. Public releases must use
a Developer ID certificate and Apple notarization instead of ad hoc signing.

## Requirements

- Native SDK CLI 0.9.3
- Node.js 22.15 or newer
- Zig 0.16.0 for direct Zig commands (the Native SDK CLI includes its own build toolchain)
