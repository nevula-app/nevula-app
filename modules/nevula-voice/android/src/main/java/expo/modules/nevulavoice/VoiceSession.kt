package expo.modules.nevulavoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.util.Arrays
import java.util.UUID

internal class VoiceSession(private val context: Context) {
  private val lock = Any()
  private var recorder: AudioRecord? = null
  private var captureThread: Thread? = null
  @Volatile private var capturing = false
  private var captureRate = 44_100
  private var buffer = ShortArray(44_100 * VoiceDisguise.MAX_SECONDS)
  private var filled = 0
  private var player: MediaPlayer? = null

  fun startRecording() {
    synchronized(lock) {
      cancelLocked()
      filled = 0
      val opened = createRecorder()
      recorder = opened.record
      captureRate = opened.sampleRate
      if (buffer.size < captureRate * VoiceDisguise.MAX_SECONDS) {
        buffer = ShortArray(captureRate * VoiceDisguise.MAX_SECONDS)
      }
      capturing = true
      opened.record.startRecording()
      val rec = opened.record
      captureThread = Thread({
        val tmp = ShortArray(4096)
        val max = (captureRate * VoiceDisguise.MAX_SECONDS).coerceAtMost(buffer.size)
        while (capturing) {
          val n = rec.read(tmp, 0, tmp.size)
          if (n == AudioRecord.ERROR_INVALID_OPERATION || n == AudioRecord.ERROR_BAD_VALUE) break
          if (n <= 0) continue
          synchronized(lock) {
            val copy = n.coerceAtMost(max - filled)
            if (copy > 0) {
              System.arraycopy(tmp, 0, buffer, filled, copy)
              filled += copy
            }
            if (filled >= max) capturing = false
          }
        }
        Arrays.fill(tmp, 0)
      }, "nevula-voice-capture").also { it.start() }
    }
  }

  fun stopAndDisguise(mode: String): Map<String, Any> {
    val captured: ShortArray
    val frames: Int
    val rate: Int
    synchronized(lock) {
      if (recorder == null && filled <= 0) throw CodedException("No voice recording to process.")
      capturing = false
      try { recorder?.stop() } catch (_: Exception) {}
      try { recorder?.release() } catch (_: Exception) {}
      recorder = null
      captureThread?.join(1_500)
      captureThread = null
      frames = filled
      rate = captureRate
      captured = ShortArray(frames)
      if (frames > 0) System.arraycopy(buffer, 0, captured, 0, frames)
      VoiceDisguise.wipe(buffer)
      filled = 0
    }
    val normalized = when (mode.lowercase()) {
      "robot" -> "robot"
      "chatter" -> "chatter"
      "synthetic" -> "synthetic"
      else -> throw CodedException("Unknown voice mode.")
    }
    val pcm16k = VoiceDisguise.downsample(captured, frames, rate)
    VoiceDisguise.wipe(captured)
    if (pcm16k.size < VoiceDisguise.SAMPLE_RATE / 5) {
      VoiceDisguise.wipe(pcm16k)
      throw CodedException("Recording is too short.")
    }
    if (VoiceDisguise.rms(pcm16k, pcm16k.size) < 250.0) {
      VoiceDisguise.wipe(pcm16k)
      throw CodedException("Microphone captured almost no sound. Check microphone permission and try again.")
    }
    /**
     * Not a disguise of the mic take: STT → wipe original PCM → TTS re-speak → light style on TTS only.
     * Sent audio is synthetic speech; there is no invertible path back to the caller's voice.
     */
    val text = try {
      VoiceRewrite.transcribe(context, pcm16k)
    } finally {
      VoiceDisguise.wipe(pcm16k)
    }
    if (text.length < 2) {
      throw CodedException("Could not understand the recording. Speak clearly and try again.")
    }
    val dir = tempDir()
    val spoken = File(dir, "t-${UUID.randomUUID()}.wav")
    val disguised: ShortArray
    try {
      VoiceRewrite.speak(context, text, spoken, normalized)
      val (ttsPcm, ttsRate) = VoiceRewrite.readWav(spoken)
      disguised = VoiceRewrite.style(ttsPcm, ttsRate, normalized)
    } finally {
      spoken.delete()
    }
    val durationMs = ((disguised.size * 1000L) / VoiceDisguise.SAMPLE_RATE).toInt().coerceAtLeast(1)
    return try {
      val encoded = AudioEncoder.encode(disguised, VoiceDisguise.SAMPLE_RATE, File(dir, "d-${UUID.randomUUID()}"))
      mapOf(
        "uri" to Uri.fromFile(encoded.file).toString(),
        "durationMs" to durationMs,
        "mime" to encoded.mime,
      )
    } finally {
      VoiceDisguise.wipe(disguised)
    }
  }

  fun cancel() {
    synchronized(lock) { cancelLocked() }
  }

  fun play(uri: String) {
    stopPlayback()
    val path = if (uri.startsWith("file:")) (Uri.parse(uri).path ?: uri.removePrefix("file://")) else uri
    val player = MediaPlayer()
    player.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    )
    player.setDataSource(path)
    player.setOnCompletionListener { stopPlayback() }
    player.setOnErrorListener { _, _, _ ->
      stopPlayback()
      true
    }
    player.prepare()
    player.start()
    synchronized(lock) { this.player = player }
  }

  fun stopPlayback() {
    synchronized(lock) {
      try { player?.stop() } catch (_: Exception) {}
      try { player?.release() } catch (_: Exception) {}
      player = null
    }
  }

  fun wipeTemps() {
    val dir = tempDir()
    dir.listFiles()?.forEach { file ->
      runCatching { file.delete() }
    }
  }

  fun destroy() {
    cancel()
    stopPlayback()
    wipeTemps()
    VoiceRewrite.release()
  }

  private fun cancelLocked() {
    capturing = false
    try { recorder?.stop() } catch (_: Exception) {}
    try { recorder?.release() } catch (_: Exception) {}
    recorder = null
    captureThread?.join(400)
    captureThread = null
    VoiceDisguise.wipe(buffer)
    filled = 0
  }

  private fun tempDir(): File {
    val dir = File(context.cacheDir, "nevula-voice")
    if (!dir.exists()) dir.mkdirs()
    File(dir, ".nomedia").takeIf { !it.exists() }?.writeText("")
    return dir
  }

  private data class OpenedRecorder(val record: AudioRecord, val sampleRate: Int)

  private fun createRecorder(): OpenedRecorder {
    val rates = intArrayOf(44_100, 48_000, 16_000)
    val sources = intArrayOf(MediaRecorder.AudioSource.MIC, MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.DEFAULT)
    for (rate in rates) {
      val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      if (min <= 0) continue
      val buf = min.coerceAtLeast(rate / 2) * 2
      for (source in sources) {
        try {
          val rec = AudioRecord(source, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, buf)
          if (rec.state == AudioRecord.STATE_INITIALIZED) return OpenedRecorder(rec, rate)
          rec.release()
        } catch (_: Exception) {
        }
      }
    }
    throw CodedException("Could not open the microphone.")
  }
}
