#!/bin/zsh
set -euo pipefail

if [[ -z "${SCALAR_DEVELOPER_ID_APPLICATION:-}" ]]; then
  print -u2 "SCALAR_DEVELOPER_ID_APPLICATION is required"
  exit 1
fi
if [[ -z "${SCALAR_SPARKLE_PUBLIC_KEY:-}" ]]; then
  print -u2 "SCALAR_SPARKLE_PUBLIC_KEY is required"
  exit 1
fi
if [[ -z "${SCALAR_NOTARY_PROFILE:-}" ]]; then
  print -u2 "SCALAR_NOTARY_PROFILE is required"
  exit 1
fi

script_dir=${0:A:h}
mac_dir=${script_dir:h}
version=${SCALAR_VERSION:-0.1.0}
build_number=${SCALAR_BUILD_NUMBER:-1}
output_dir=${mac_dir}/dist
app_dir=${output_dir}/Scalar.app

rm -rf "${output_dir}"
mkdir -p "${app_dir}/Contents/MacOS" "${app_dir}/Contents/Frameworks"

swift build --package-path "${mac_dir}" -c release
cp "${mac_dir}/.build/release/ScalarMac" "${app_dir}/Contents/MacOS/ScalarMac"
sed \
  -e "s/__SCALAR_VERSION__/${version}/g" \
  -e "s/__SCALAR_BUILD__/${build_number}/g" \
  -e "s|__SPARKLE_PUBLIC_KEY__|${SCALAR_SPARKLE_PUBLIC_KEY}|g" \
  "${mac_dir}/Resources/Info.plist" > "${app_dir}/Contents/Info.plist"

sparkle_framework=$(find "${mac_dir}/.build" -path '*/Sparkle.framework' -type d | head -1)
if [[ -z "${sparkle_framework}" ]]; then
  print -u2 "Sparkle.framework was not produced by SwiftPM"
  exit 1
fi
ditto "${sparkle_framework}" "${app_dir}/Contents/Frameworks/Sparkle.framework"

codesign --force --options runtime --timestamp \
  --entitlements "${mac_dir}/Resources/ScalarMac.entitlements" \
  --sign "${SCALAR_DEVELOPER_ID_APPLICATION}" "${app_dir}"
codesign --verify --deep --strict --verbose=2 "${app_dir}"

ditto -c -k --sequesterRsrc --keepParent "${app_dir}" "${output_dir}/Scalar-${version}.zip"
xcrun notarytool submit "${output_dir}/Scalar-${version}.zip" \
  --keychain-profile "${SCALAR_NOTARY_PROFILE}" --wait
xcrun stapler staple "${app_dir}"
xcrun stapler validate "${app_dir}"

print "Release is signed, notarized, and ready at ${app_dir}"
