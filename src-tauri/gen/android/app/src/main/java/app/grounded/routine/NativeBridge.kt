package app.grounded.routine

import android.webkit.JavascriptInterface
import android.content.Context

/**
 * JS bridge attached to the Tauri webview. Exposes the native progress
 * notification to the frontend as `window.GroundedNative.progress(...)`.
 *
 * We attach it by wrapping the existing WebView client setup in
 * MainActivity — Tauri owns the WebView, so we hook it after creation.
 */
class NativeBridge(private val context: Context) {

  @JavascriptInterface
  fun showProgress(title: String, endLabel: String, progress: Int) {
    ProgressNotification.show(context, title, endLabel, progress)
  }

  @JavascriptInterface
  fun hideProgress() {
    ProgressNotification.hide(context)
  }
}
