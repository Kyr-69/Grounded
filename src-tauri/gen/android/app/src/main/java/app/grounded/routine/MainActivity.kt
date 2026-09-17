package app.grounded.routine

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private val handler = Handler(Looper.getMainLooper())
  private var bridgeAttached = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    attachNativeBridge()
  }

  /**
   * Attach the JS bridge to Tauri's WebView. The view isn't necessarily in
   * the hierarchy yet right after super.onCreate(), so we retry on the main
   * looper until it shows up (bounded retries, then give up silently).
   */
  private fun attachNativeBridge(retry: Int = 0) {
    if (bridgeAttached) return
    val wv = findWebView(window.decorView)
    if (wv != null) {
      wv.addJavascriptInterface(NativeBridge(applicationContext), "GroundedNative")
      bridgeAttached = true
    } else if (retry < 20) {
      handler.postDelayed({ attachNativeBridge(retry + 1) }, 250)
    }
  }

  private fun findWebView(view: android.view.View?): WebView? {
    if (view is WebView) return view
    if (view is android.view.ViewGroup) {
      for (i in 0 until view.childCount) {
        findWebView(view.getChildAt(i))?.let { return it }
      }
    }
    return null
  }

  override fun onDestroy() {
    super.onDestroy()
    // Clear the ongoing notification when the process is going away.
    ProgressNotification.hide(applicationContext)
  }
}
