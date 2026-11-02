# Little Joys: Native App Starter (developer handoff)

This package contains the source of **Little Joys v1.0 Hourly Sunshine**, with the exact preferred smiley artwork and app assets, prepared for a native iOS/Android app build through Capacitor 8.

**IMPORTANT:** This is source code, NOT an installable Android APK / iPhone IPA, not an app-store submission, and it DOES NOT yet contain a native home-screen widget or reliable background reminders. No completed iOS or Android builds have been claimed or tested.

## What is already included

- Existing Little Joys web screens (Today / Journal / Reflections / Together / You)
- Smiley logo and tap/sun animation, photo memories, microphone experiment, optional hourly quote/joke content
- `package.json` and `capacitor.config.json`, pointing at `www/` as the web app

## What an engineer must do

1. Use Node.js 22+ and install the prerequisites for the target platform. For iOS use a Mac with Xcode; for Android use Android Studio and the Android SDK. Check https://capacitorjs.com/docs/getting-started/environment-setup
2. In this folder run `npm install`. This requires an internet connection and npm registry access. The app dependencies are pinned to the verified Capacitor 8.5.2 release.
3. `npx cap add android` (on a computer with Android Studio), or `npx cap add ios` (on a Mac with Xcode). Run `npx cap sync` after changes to the web application.
4. Edit platform permissions to allow an explicitly user-initiated microphone session:
   - iOS, `ios/App/App/Info.plist`: add `NSMicrophoneUsageDescription` string, e.g. `Allow Little Joys to analyze sound on your device when you tap Start listening. Audio is not recorded or uploaded.`
   - Android, `android/app/src/main/AndroidManifest.xml`: inside the manifest add `<uses-permission android:name="android.permission.RECORD_AUDIO" />`.
   - Test on REAL devices. The current laughter detector is experimental and not accurate AI laughter recognition.
5. Set the final bundle ID under your own developer account (the current `com.littlejoys.preview` is a placeholder), app icon/launch appearance, app signing, and store metadata.
6. Add the truly native home-screen widget (iOS WidgetKit/SwiftUI and Android AppWidget/Glance), which must save moments into app-accessible shared storage. The current website itself cannot provide this native widget.
7. For hourly reminders while the app is closed, implement user-opted-in local scheduled notifications or push notifications via native APIs, including Quiet Hours and notification settings. The web prototype's in-browser reminders are not reliable when closed.
8. Test storage migration and backup carefully. Web browser localStorage and a native WebView are NOT automatically the same storage, so a saved browser journal will not automatically appear in this native build. Import a backup if applicable. Photo and microphone behaviors also require native QA.
9. Add a production privacy policy and any data disclosures before distribution. Decide on secure cloud accounts and consent-based sharing, if those features are launched later. Keep privacy promises consistent with actual native code.
10. Validate the build in TestFlight / Play internal testing, resolve store-review issues (especially minimum functionality) before public release.

## Folder structure

- `www/`: unchanged latest prototype app including logo, HTML/CSS/JS, PWA assets
- `package.json`: Capacitor dependencies
- `capacitor.config.json`: native wrapper configuration

## Important publishing reality

- Apple Developer Program: normally $99/year. Android Google Play Console: $25 one-time registration, plus applicable testing requirements. Fees are charged by platform providers, not by this starter package.
- Apple requires apps to offer more than a repackaged website. See App Review Guideline 4.2.
- iOS apps require macOS/Xcode or a compatible remote Mac/cloud build service. The starter package alone cannot install directly on an iPhone.

Official guidance:
- https://capacitorjs.com/docs/getting-started
- https://capacitorjs.com/docs/getting-started/environment-setup
- https://developer.apple.com/app-store/review/guidelines/
- https://support.google.com/googleplay/android-developer/answer/6112435
