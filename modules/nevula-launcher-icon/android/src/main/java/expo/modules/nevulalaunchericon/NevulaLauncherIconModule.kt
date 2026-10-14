package expo.modules.nevulalaunchericon

import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NevulaLauncherIconModule : Module() {
  companion object {
    private const val PREFS = "nevula_appearance"
    private const val KEY_MODE = "launcher_icon_mode"
    private const val CHANNEL_ID = "nevula-messages"
    private const val BADGE_CHANNEL_ID = "nevula-messages-badge"
    private const val NOTIFICATION_ID = 71001
  }

  override fun definition() = ModuleDefinition {
    Name("NevulaLauncherIcon")

    AsyncFunction("setIcon") { mode: String ->
      if (mode != "nevula" && mode != "calculator") {
        throw CodedException("Unknown launcher icon mode.")
      }
      val context = appContext.reactContext ?: throw CodedException("Android context is unavailable.")
      persistAppearanceMode(context, mode)
      val packageName = context.packageName
      val packageManager = context.packageManager
      val nevula = ComponentName(packageName, "$packageName.MainActivityNevula")
      val calculator = ComponentName(packageName, "$packageName.MainActivityCalculator")
      val enabled = if (mode == "calculator") calculator else nevula
      val disabled = if (mode == "calculator") nevula else calculator

      packageManager.setComponentEnabledSetting(
        enabled,
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.DONT_KILL_APP
      )
      packageManager.setComponentEnabledSetting(
        disabled,
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
        PackageManager.DONT_KILL_APP
      )

      // Recents / app switcher should match Settings → Appearance (not the static application icon).
      applyTaskAppearance(mode)
    }

    AsyncFunction("presentCalculatorAlert") { title: String, body: String, badgeOnly: Boolean ->
      val context = appContext.reactContext ?: throw CodedException("Android context is unavailable.")
      presentAlert(context, title, body, badgeOnly)
    }

    AsyncFunction("requestUnrestrictedBattery") {
      val context = appContext.reactContext ?: throw CodedException("Android context is unavailable.")
      requestUnrestrictedBattery(context)
    }

    AsyncFunction("openOemPushSettings") {
      val context = appContext.currentActivity
        ?: appContext.reactContext
        ?: throw CodedException("Android context is unavailable.")
      openOemPushSettings(context)
    }

    AsyncFunction("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: throw CodedException("Android context is unavailable.")
      isIgnoringBatteryOptimizations(context)
    }

    AsyncFunction("openExternalApp") { packageName: String ->
      val context = appContext.currentActivity
        ?: appContext.reactContext
        ?: throw CodedException("Android context is unavailable.")
      openExternalApp(context, packageName)
    }
  }

  private fun openExternalApp(context: Context, packageName: String): Boolean {
    val pm = context.packageManager
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(packageName, 0)
      }
    } catch (_: PackageManager.NameNotFoundException) {
      return false
    }

    fun start(intent: Intent): Boolean {
      return try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
      } catch (_: Exception) {
        false
      }
    }

    pm.getLaunchIntentForPackage(packageName)?.let { if (start(it)) return true }

    // Resolve MAIN/LAUNCHER for that package explicitly (more reliable than getLaunchIntent alone).
    val main = Intent(Intent.ACTION_MAIN).apply {
      addCategory(Intent.CATEGORY_LAUNCHER)
      setPackage(packageName)
    }
    @Suppress("DEPRECATION")
    val matches = pm.queryIntentActivities(main, 0)
    if (matches.isNotEmpty()) {
      val info = matches[0].activityInfo
      if (start(Intent(main).setClassName(info.packageName, info.name))) return true
    }

    // Known Orbot entry points across older/newer builds.
    for (cls in listOf(
      "org.torproject.android.OrbotActivity",
      "org.torproject.android.OrbotMainActivity",
      "org.torproject.android.ui.OrbotActivity",
    )) {
      if (start(Intent().setClassName(packageName, cls))) return true
    }

    // START_TOR is declared on Orbot’s main activity.
    if (start(Intent("org.torproject.android.START_TOR").setPackage(packageName))) return true

    return false
  }

  private fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val pm = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
    return pm.isIgnoringBatteryOptimizations(context.packageName)
  }

  private fun requestUnrestrictedBattery(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    if (isIgnoringBatteryOptimizations(context)) return
    try {
      val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = android.net.Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    } catch (_: Throwable) {
      try {
        val fallback = Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(fallback)
      } catch (_: Throwable) {
        // User can still open settings manually.
      }
    }
  }

  /** Honor/Huawei: open startup / protected-apps screens so FCM is not force-stopped. */
  private fun openOemPushSettings(context: Context) {
    val pkg = context.packageName
    val candidates = listOf(
      Intent().setClassName(
        "com.huawei.systemmanager",
        "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
      ),
      Intent().setClassName(
        "com.huawei.systemmanager",
        "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity",
      ),
      Intent("huawei.intent.action.HSM_BOOTAPP_MANAGER"),
      Intent().setClassName(
        "com.hihonor.systemmanager",
        "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
      ),
      Intent().setClassName(
        "com.hihonor.systemmanager",
        "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity",
      ),
      Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = android.net.Uri.parse("package:$pkg")
      },
    )
    for (intent in candidates) {
      try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (intent.resolveActivity(context.packageManager) != null) {
          context.startActivity(intent)
          return
        }
      } catch (_: Throwable) {
        // try next
      }
    }
  }

  private fun persistAppearanceMode(context: Context, mode: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_MODE, mode)
      .apply()
  }

  private fun appearanceMode(context: Context): String {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_MODE, "nevula")
    return if (raw == "calculator") "calculator" else "nevula"
  }

  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Calculator", NotificationManager.IMPORTANCE_HIGH).apply {
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 180, 120, 180)
        setShowBadge(true)
      }
    )
    manager.createNotificationChannel(
      NotificationChannel(BADGE_CHANNEL_ID, "Calculator badge", NotificationManager.IMPORTANCE_LOW).apply {
        enableVibration(false)
        setShowBadge(true)
      }
    )
  }

  private fun presentAlert(context: Context, title: String, body: String, badgeOnly: Boolean) {
    ensureChannels(context)
    val pkg = context.packageName
    val calculatorMode = appearanceMode(context) == "calculator"
    val appLabel = if (calculatorMode) "Calculator" else "NEVULA"
    val contentTitle = if (calculatorMode) {
      when {
        title.isBlank() || title.equals("NEVULA", ignoreCase = true) -> "Calculator"
        else -> title
      }
    } else {
      when {
        title.isBlank() || title.equals("Calculator", ignoreCase = true) -> "NEVULA"
        else -> title
      }
    }
    val smallRes = if (calculatorMode) {
      context.resources.getIdentifier("notification_icon_calculator", "drawable", pkg)
        .takeIf { it != 0 }
        ?: context.resources.getIdentifier("notification_icon", "drawable", pkg)
    } else {
      context.resources.getIdentifier("notification_icon", "drawable", pkg)
    }
    if (smallRes == 0) throw CodedException("Notification icon missing.")
    val largeRes = if (calculatorMode) {
      context.resources.getIdentifier("notification_large_calculator", "drawable", pkg)
        .takeIf { it != 0 }
        ?: context.resources.getIdentifier("calculator_icon", "drawable", pkg)
    } else {
      context.resources.getIdentifier("ic_launcher", "mipmap", pkg).takeIf { it != 0 } ?: 0
    }

    var launch = context.packageManager.getLaunchIntentForPackage(pkg)
      ?: Intent().setClassName(pkg, "$pkg.MainActivity")
    if (calculatorMode) {
      try {
        context.packageManager.getActivityInfo(ComponentName(pkg, "$pkg.MainActivityCalculator"), 0)
        launch = Intent().setClassName(pkg, "$pkg.MainActivityCalculator")
      } catch (_: Throwable) {
        // keep launch
      }
    }
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pending = PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val channel = if (badgeOnly) BADGE_CHANNEL_ID else CHANNEL_ID
    val builder = NotificationCompat.Builder(context, channel)
      .setSmallIcon(smallRes)
      .setContentTitle(contentTitle)
      .setContentText(if (badgeOnly) "" else body)
      .setContentIntent(pending)
      .setAutoCancel(true)
      .setPriority(if (badgeOnly) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setVisibility(if (badgeOnly) NotificationCompat.VISIBILITY_SECRET else NotificationCompat.VISIBILITY_PUBLIC)
      .setTicker(appLabel)

    // Best-effort only: AOSP requires privileged SUBSTITUTE_NOTIFICATION_APP_NAME to honor this.
    builder.extras.putCharSequence("android.substName", appLabel)

    if (largeRes != 0) {
      BitmapFactory.decodeResource(context.resources, largeRes)?.let { builder.setLargeIcon(it) }
    }
    if (!badgeOnly) {
      builder.setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val granted = ContextCompat.checkSelfPermission(
        context,
        android.Manifest.permission.POST_NOTIFICATIONS,
      ) == PackageManager.PERMISSION_GRANTED
      if (!granted) return
    }

    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
  }

  private fun applyTaskAppearance(mode: String) {
    val activity = appContext.currentActivity ?: return
    val label = if (mode == "calculator") "Calculator" else "NEVULA"
    val resName = if (mode == "calculator") "calculator_icon" else "ic_launcher"
    val resType = if (mode == "calculator") "drawable" else "mipmap"
    val resId = activity.resources.getIdentifier(resName, resType, activity.packageName)
    if (resId == 0) {
      activity.setTaskDescription(ActivityManager.TaskDescription(label))
      return
    }
    val bitmap = BitmapFactory.decodeResource(activity.resources, resId)
    if (bitmap == null) {
      activity.setTaskDescription(ActivityManager.TaskDescription(label))
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      activity.setTaskDescription(
        ActivityManager.TaskDescription(label, bitmap, 0xFF05070A.toInt())
      )
    } else {
      @Suppress("DEPRECATION")
      activity.setTaskDescription(ActivityManager.TaskDescription(label, bitmap))
    }
  }
}
