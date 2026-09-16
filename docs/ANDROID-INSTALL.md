# Install HOUSEWIRE on Android

This is a standalone release APK, not an Expo Go link or development client.
The app runs from its own home-screen icon. Android 7 or newer is required by
the current Expo SDK; a recent Android phone is recommended for the camera and audio games.

## Download and install

1. Open [Download HOUSEWIRE 1.0.0, build 2 for Android](https://expo.dev/artifacts/eas/9azrZhcHGyNam7qkU5Ed3GLCtZ18esbk_7zKwKDRsDE.apk)
   on the Android phone, or scan the QR below. The download is approximately
   **189 MB** (180 MiB) and does not require an Expo login.
2. Open the downloaded file. If Android asks, allow that browser or file manager
   to install this APK, then tap **Install**. You can turn that permission off afterward.
3. Open **HOUSEWIRE**. No Expo Go account or running Metro server is needed.
4. When installing an updated APK, install over the old version to preserve local
   game history. Do not uninstall first unless you intend to erase its local data.

The APK is for Android only. An iPhone requires a separately signed iOS build.

![Download HOUSEWIRE Android APK](../downloads/HOUSEWIRE-ANDROID-INSTALL-QR.png)

Built successfully on **16 September 2026**, from branch `downloadable-android`.
[Completed build and logs](https://expo.dev/accounts/osama_366/projects/housewire/builds/2ab34fcd-5b7a-4767-84e0-0f1e5e5eaa34).
Version name is **1.0.0**, Android versionCode **2**. This includes the current v6
rooms, revised marble machine, workshop wiring, shadow-rendering changes, and 17
offline music tracks. The online artifact expires **30 September 2026**. Keep the local backup:
`downloads/HOUSEWIRE-1.0.0-2ab34fcd.apk`. Download files are intentionally excluded
from Git, so the QR image above is available in this local checkout after collection.

SHA-256: `2a642bff4f65bfcca375b4d90fb20c26137ba7a67625cd9a0bb0e87b9be4ece8`

## What works without a laptop or internet?

- Family Frequency on one shared phone, using its local question packs.
- Escape Cases' solo rehearsal, Last Light practice, and Circuit Race vs ghost.
- Local case generation, bundled images/sounds/fonts, profiles, and game history.

GPT chat and remote generation require the AI server and internet. They are not
an on-device GPT model. Live multi-phone games require the multiplayer relay.

## Enable GPT and connect more phones

On the laptop, in PowerShell:

```powershell
cd "C:\Users\hp\projects\Ai bonding candidates\housewire"
npm run relay
```

Keep the laptop and phones on the same reachable private Wi-Fi or hotspot. The
API key stays in the laptop's `.env`; it is not included in the APK or cloud
build upload. If the server is already running, reuse it instead of starting a
second process on the same ports.

This preview build defaults to the laptop at **10.10.139.0**:

- Multiplayer: `ws://10.10.139.0:8787`
- AI: `http://10.10.139.0:8788`

Saved connection settings from an earlier installation take precedence over these
defaults. Check the address after updating if you previously saved a different one.

If that address changes, open **Settings → Phone connection**, enter the new
laptop Wi-Fi IP address, and tap **Save & check connection**. Both services
should show ready. The app remembers this on that phone. Leave and recreate an
existing multiplayer room after changing the address; new join QR codes carry
the new relay address.

If the phone cannot reach the server, try opening
`http://<laptop-ip>:8788/health` in its browser. Use the same private network and
check the laptop firewall if this fails. Do not disable the firewall globally.

For a hosted backend, expand **Separate server addresses** and enter the relay's
`wss://` address and the AI service's independent `https://` address. No hosting
service is deployed by this APK build. Never paste an API key into these fields.

## Rebuild

```powershell
npm ci
npm run check:apk
npm run build:apk
```

To wait for a submitted build and save its APK, checksum, and installation QR:

```powershell
node scripts/collect-android-build.mjs <build-id>
```

The files are saved under `downloads/` (excluded from Git and cloud uploads).
The QR links directly to the APK, not to an Expo Go session. Keep the local APK
copy: Expo's current preview-artifact retention can expire the online download.

Sign in to the Expo account that owns `@osama_366/housewire` when requested.
EAS manages the Android signing key; keep access to that project so future
versions retain the same signing identity. `preview` produces a release APK
with its JavaScript and assets included, not a debug app that waits for Metro.

The two non-secret preview URLs are configured in the project's EAS **preview**
environment. Update them before another build if a different default is needed;
existing installations can simply change them in Settings.

`production` is a separate store AAB profile. It refuses missing or insecure
server URLs and disables cleartext LAN networking. No store release is submitted
by `npm run build:apk`.

## Validation scope

Executed successfully for this release:

- Typecheck and lint; **1,016 tests across 96 files**.
- Expo Doctor: **21/21** locally.
- Successful EAS cloud release APK compilation, versionCode **2**.
- Anonymous APK download and SHA-256 checksum generation.
- Android `apksigner` verification passed; the certificate matches the earlier
  APK exactly. `aapt` confirms the same `app.housewire.mobile` package and the
  increased versionCode **2**, so the artifact meets Android's signing/version
  requirements for an in-place update. Physical installation remains untested.
- All 1,823 APK ZIP entries passed CRC checks. Bundled JavaScript is present,
  all 17 music tracks match their source SHA-256 hashes, and no `.env`, signing
  keys, credentials or server-source entries were found.
- The targeted v6 browser gameplay/music checks and iOS/Android/web exports are
  documented in [the v6 validation report](ROOMS-V6-VALIDATION.md); they are not
  equivalent to installing this Android release on a phone.

No physical Android device or emulator was available. Installing and playing on
your phone is still the final device check; browser tests do not verify Android
camera/microphone hardware or your phone's Wi-Fi/firewall reachability.
