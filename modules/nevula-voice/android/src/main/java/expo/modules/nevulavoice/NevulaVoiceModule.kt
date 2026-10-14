package expo.modules.nevulavoice

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class NevulaVoiceModule : Module() {
  private var session: VoiceSession? = null

  override fun definition() = ModuleDefinition {
    Name("NevulaVoice")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      session = VoiceSession(context)
    }

    OnDestroy {
      session?.destroy()
      session = null
    }

    OnActivityEntersBackground {
      session?.stopPlayback()
    }

    AsyncFunction("prepareEngine") {
      val context = appContext.reactContext ?: throw CodedException("Voice capture is unavailable.")
      VoiceRewrite.ensureReady(context)
    }

    AsyncFunction("startRecording") {
      val context = appContext.reactContext ?: throw CodedException("Voice capture is unavailable.")
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw CodedException("Microphone permission is required for voice messages.")
      }
      engine().startRecording()
    }

    AsyncFunction("stopAndDisguise") Coroutine { mode: String ->
      withContext(Dispatchers.Default) {
        engine().stopAndDisguise(mode)
      }
    }

    AsyncFunction("cancelRecording") {
      engine().cancel()
    }

    AsyncFunction("play") { uri: String ->
      engine().play(uri)
    }

    AsyncFunction("stopPlayback") {
      engine().stopPlayback()
    }

    AsyncFunction("wipeTemps") {
      engine().wipeTemps()
    }
  }

  private fun engine(): VoiceSession {
    val current = session
    if (current != null) return current
    val context = appContext.reactContext ?: throw CodedException("Voice capture is unavailable.")
    return VoiceSession(context).also { session = it }
  }
}
