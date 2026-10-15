#!/usr/bin/env bash
# Builds the Android APK: web build -> android assets -> signed release APK in release/.
# Requires: Node, JDK 17+, Android SDK (ANDROID_HOME or android/local.properties).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf android/app/src/main/assets/www
mkdir -p android/app/src/main/assets/www
cp -r dist/. android/app/src/main/assets/www/
# release signing key (kept outside git). Keep it: updates of the app must be signed with the same key.
if [ ! -f android/keystore/release.jks ]; then
  mkdir -p android/keystore
  keytool -genkeypair -v -keystore android/keystore/release.jks -alias superessence \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "${SE_KEYSTORE_PASSWORD:-superessence}" -keypass "${SE_KEYSTORE_PASSWORD:-superessence}" \
    -dname "CN=SuperEssence, OU=Games, O=SuperEssence, C=FR"
fi
cd android
./gradlew --no-daemon assembleRelease
cd ..
mkdir -p release
cp android/app/build/outputs/apk/release/app-release.apk release/SuperEssence-TheDoll.apk
echo "APK: release/SuperEssence-TheDoll.apk"
