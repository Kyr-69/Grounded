# Locates the Android SDK / NDK / JDK installed by Android Studio and runs
# a Tauri Android command with the right environment set.
#
# Usage:  powershell -File scripts\android-env.ps1 <command...>
#   e.g.  powershell -File scripts\android-env.ps1 tauri android init
#         powershell -File scripts\android-env.ps1 tauri android dev
#         powershell -File scripts\android-env.ps1 tauri android build --apk

$ErrorActionPreference = "Stop"

function Find-Sdk {
    $candidates = @(
        "$env:LOCALAPPDATA\Android\Sdk",
        "$env:ANDROID_HOME",
        "C:\Android\Sdk"
    ) | Where-Object { $_ -and (Test-Path (Join-Path $_ "platform-tools")) }
    if ($candidates.Count -eq 0) {
        Write-Error @"
Android SDK not found. Install Android Studio (Standard setup), then in
More Actions > SDK Manager > SDK Tools enable 'Android SDK Platform-Tools'
and 'NDK (Side by side)', and let this script find it again.
"@
    }
    return $candidates[0]
}

function Find-Ndk {
    param($Sdk)
    $ndkRoot = Join-Path $Sdk "ndk"
    if (-not (Test-Path $ndkRoot)) {
        Write-Error "No NDK found under $ndkRoot — install 'NDK (Side by side)' via SDK Manager > SDK Tools."
    }
    $ndk = Get-ChildItem $ndkRoot | Sort-Object Name -Descending | Select-Object -First 1
    return $ndk.FullName
}

function Find-Jdk {
    # Android Studio's bundled JBR is the recommended JDK for Gradle.
    $candidates = @(
        "C:\Program Files\Android\Android Studio\jbr",
        "$env:LOCALAPPDATA\Programs\Android Studio\jbr",
        "$env:JAVA_HOME"
    ) | Where-Object { $_ -and (Test-Path $_) }
    if ($candidates.Count -eq 0) {
        Write-Error "No JDK found — install Android Studio (its bundled JBR is used automatically)."
    }
    return $candidates[0]
}

$sdk = Find-Sdk
$ndk = Find-Ndk -Sdk $sdk
$jdk = Find-Jdk

$env:ANDROID_HOME = $sdk
$env:NDK_HOME     = $ndk
$env:JAVA_HOME    = $jdk

Write-Host "ANDROID_HOME = $sdk"
Write-Host "NDK_HOME     = $ndk"
Write-Host "JAVA_HOME    = $jdk"
Write-Host ""

if ($args.Count -eq 0) {
    Write-Host "Environment ready. Re-run with a command, e.g.: android-env.ps1 tauri android init"
    exit 0
}

& npx @args
exit $LASTEXITCODE
