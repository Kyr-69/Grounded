# Source this before any Tauri Android command:
#   source ../scripts/android-env.sh   (from projects/Grounded)
# Or in one line: source scripts/android-env.sh && npm run tauri android dev

# Use Adoptium JDK 21 — the Android Studio JBR is Java 25, which this
# Gradle wrapper rejects ("Unsupported class file major version 69").
export JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
export ANDROID_HOME="C:\Android\Sdk"
export NDK_HOME="C:\Android\Sdk\ndk\27.0.12077973"
export PATH="/c/Android/Sdk/platform-tools:$PATH"

echo "Android env ready:"
echo "  JAVA_HOME=$JAVA_HOME"
echo "  ANDROID_HOME=$ANDROID_HOME"
echo "  NDK_HOME=$NDK_HOME"
adb devices
