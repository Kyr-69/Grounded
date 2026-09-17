package app.grounded.routine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

/**
 * Ongoing "task in progress" notification with a live progress bar.
 *
 * Rendered natively (not via the notification plugin) because the plugin
 * has no progress/ongoing API. The webview drives it over the JS bridge:
 * every ActiveTaskBar tick calls show()/hide() with the remaining time.
 * Dismissing it is impossible while setOngoing(true); it disappears when
 * the window closes (hide) or the app is killed.
 */
object ProgressNotification {

  private const val CHANNEL_ID = "grounded-active-task"
  private const val NOTIFICATION_ID = 4242

  /** Latest state sent from JS, kept so the channel can be (re)created lazily. */
  @Volatile private var lastTitle: String? = null

  fun show(context: Context, title: String, endLabel: String, progress: Int) {
    lastTitle = title
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureChannel(manager)

    val openApp = PendingIntent.getActivity(
      context,
      0,
      context.packageManager.getLaunchIntentForPackage(context.packageName),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification: Notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText("Window open until $endLabel")
      .setProgress(100, progress.coerceIn(0, 100), false)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setContentIntent(openApp)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .build()

    try {
      manager.notify(NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // Notifications permission not granted — skip silently.
    }
  }

  fun hide(context: Context) {
    lastTitle = null
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(NOTIFICATION_ID)
  }

  private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Active task",
        NotificationManager.IMPORTANCE_LOW // silent, no heads-up popup
      ).apply {
        description = "Shows the task window in progress"
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }
  }
}
