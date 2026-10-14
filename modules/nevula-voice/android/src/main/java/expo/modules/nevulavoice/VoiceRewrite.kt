package expo.modules.nevulavoice

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import expo.modules.kotlin.exception.CodedException
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

internal object VoiceRewrite {
  private val lock = Any()
  private var model: Model? = null
  private var modelLang: String? = null

  fun ensureReady(context: Context) {
    synchronized(lock) {
        loadModel(context)
    }
  }

  fun transcribe(context: Context, pcm16k: ShortArray): String {
    val ready = synchronized(lock) { loadModel(context) }
    val recognizer = Recognizer(ready, VoiceDisguise.SAMPLE_RATE.toFloat())
    try {
      val buf = ByteArray(4096)
      val wrap = ByteBuffer.wrap(buf).order(ByteOrder.LITTLE_ENDIAN)
      var offset = 0
      while (offset < pcm16k.size) {
        wrap.clear()
        while (offset < pcm16k.size && wrap.remaining() >= 2) {
          wrap.putShort(pcm16k[offset])
          offset++
        }
        recognizer.acceptWaveForm(buf, wrap.position())
      }
      val json = recognizer.finalResult
      val text = JSONObject(json).optString("text").trim().replace(Regex("\\s+"), " ")
      return text
    } finally {
      recognizer.close()
    }
  }

  fun speak(context: Context, text: String, dest: File, mode: String) {
    dest.parentFile?.mkdirs()
    if (dest.exists()) dest.delete()
    val lang = language()
    val latch = CountDownLatch(1)
    var error: String? = null
    val main = Handler(Looper.getMainLooper())
    main.post {
      val holder = arrayOfNulls<TextToSpeech>(1)
      holder[0] = TextToSpeech(context) { status ->
        val tts = holder[0]
        if (tts == null || status != TextToSpeech.SUCCESS) {
          error = "Could not start the replacement voice."
          try { tts?.shutdown() } catch (_: Exception) {}
          latch.countDown()
          return@TextToSpeech
        }
        try {
          val locale = if (lang == "de") Locale.GERMAN else Locale.US
          tts.language = locale
          pickVoice(tts, locale)?.let { tts.voice = it }
          when (mode) {
            "synthetic" -> {
              tts.setPitch(1.72f)
              tts.setSpeechRate(0.82f)
            }
            "chatter" -> {
              tts.setPitch(0.93f)
              tts.setSpeechRate(1.12f)
            }
            else -> {
              tts.setPitch(0.86f)
              tts.setSpeechRate(1.15f)
            }
          }
          tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) {
              tts.stop()
              tts.shutdown()
              latch.countDown()
            }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
              error = "The replacement voice failed."
              tts.stop()
              tts.shutdown()
              latch.countDown()
            }
            override fun onError(utteranceId: String?, errorCode: Int) {
              error = "The replacement voice failed."
              tts.stop()
              tts.shutdown()
              latch.countDown()
            }
          })
          val spoken = spokenText(text)
          val ok = tts.synthesizeToFile(spoken, Bundle(), dest, "nevula-voice")
          if (ok != TextToSpeech.SUCCESS) {
            error = "Could not write the replacement voice."
            tts.stop()
            tts.shutdown()
            latch.countDown()
          }
        } catch (e: Exception) {
          error = e.message ?: "Could not speak the message."
          try { tts.shutdown() } catch (_: Exception) {}
          latch.countDown()
        }
      }
    }
    if (!latch.await(45, TimeUnit.SECONDS)) {
      throw CodedException("The replacement voice timed out.")
    }
    if (error != null) throw CodedException(error)
    if (!dest.exists() || dest.length() < 64) throw CodedException("The replacement voice produced no audio.")
  }

  fun readWav(file: File): Pair<ShortArray, Int> {
    FileInputStream(file).use { raw ->
      val bytes = raw.readBytes()
      if (bytes.size < 44) throw CodedException("Replacement voice file was unreadable.")
      val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
      if (ascii(buf, 0, 4) != "RIFF" || ascii(buf, 8, 4) != "WAVE") {
        throw CodedException("Replacement voice file was unreadable.")
      }
      var offset = 12
      var channels = 1
      var rate = VoiceDisguise.SAMPLE_RATE
      var bits = 16
      var dataPos = -1
      var dataLen = 0
      while (offset + 8 <= bytes.size) {
        val id = ascii(buf, offset, 4)
        val size = buf.getInt(offset + 4)
        val next = offset + 8 + size + (size and 1)
        if (id == "fmt ") {
          channels = buf.getShort(offset + 10).toInt().coerceAtLeast(1)
          rate = buf.getInt(offset + 12).coerceIn(8_000, 48_000)
          bits = buf.getShort(offset + 22).toInt()
        } else if (id == "data") {
          dataPos = offset + 8
          dataLen = size.coerceAtMost(bytes.size - dataPos)
          break
        }
        offset = next
      }
      if (dataPos < 0 || bits != 16) throw CodedException("Replacement voice file was unreadable.")
      val samples = dataLen / 2
      val frames = samples / channels
      val pcm = ShortArray(frames)
      var i = 0
      var s = dataPos
      while (i < frames && s + 1 < bytes.size) {
        pcm[i] = buf.getShort(s)
        s += 2 * channels
        i++
      }
      return pcm to rate
    }
  }

  fun style(pcm: ShortArray, sampleRate: Int, mode: String): ShortArray {
    val floats = FloatArray(pcm.size) { i -> pcm[i] / 32768f }
    VoiceDisguise.wipe(pcm)
    var work = if (sampleRate == VoiceDisguise.SAMPLE_RATE) floats else resampleTo16k(floats, sampleRate)
    if (work !== floats) java.util.Arrays.fill(floats, 0f)
    work = when (mode) {
      "chatter" -> styleKitt(work)
      "synthetic" -> styleHelium(work)
      else -> styleComputer(work)
    }
    var peak = 1.0e-6f
    for (v in work) peak = kotlin.math.max(peak, abs(v))
    val g = 0.88f / peak
    val out = ShortArray(work.size) { i ->
      (work[i] * g * 32767f).toInt().coerceIn(-32767, 32767).toShort()
    }
    java.util.Arrays.fill(work, 0f)
    return out
  }

  private fun styleComputer(input: FloatArray): FloatArray {
    var phase = 0.0
    val twoPi = 2.0 * PI
    val f0 = 108.0
    val sr = VoiceDisguise.SAMPLE_RATE.toDouble()
    for (i in input.indices) {
      phase += f0 / sr
      if (phase >= 1.0) phase -= 1.0
      val w = twoPi * phase
      val am = 0.78 + 0.18 * sin(w) + 0.04 * sin(2.0 * w)
      input[i] = (input[i] * am).toFloat()
    }
    comb(input, 108f, 0.12f)
    return input
  }

  private fun styleKitt(input: FloatArray): FloatArray {
    val a = kittBand(600f)
    val b = kittBand(1100f)
    val c = kittBand(1750f)
    val out = FloatArray(input.size)
    val twoPi = 2.0 * PI
    val sr = VoiceDisguise.SAMPLE_RATE.toFloat()
    for (i in input.indices) {
      val x = input[i]
      val sweep = (0.5 + 0.5 * sin(twoPi * 7.4 * i / sr)).toFloat()
      val ya = a.process(x)
      val yb = b.process(x)
      val yc = c.process(x)
      val wet = if (sweep < 0.5f) {
        val t = sweep * 2f
        ya * (1f - t) + yb * t
      } else {
        val t = (sweep - 0.5f) * 2f
        yb * (1f - t) + yc * t
      }
      val trem = (0.86 + 0.14 * sin(twoPi * 5.8 * i / sr)).toFloat()
      out[i] = (x * 0.38f + wet * 0.92f) * trem
    }
    return out
  }

  private fun styleHelium(input: FloatArray): FloatArray {
    val lifted = resampleRatio(input, 1.16f)
    java.util.Arrays.fill(input, 0f)
    var prev = 0f
    for (i in lifted.indices) {
      val x = lifted[i]
      lifted[i] = x + (x - prev) * 0.18f
      prev = x
    }
    return lifted
  }

  private fun kittBand(freq: Float): KittBiquad {
    val sr = VoiceDisguise.SAMPLE_RATE.toFloat()
    val w0 = 2.0 * PI * freq / sr
    val q = 3.4
    val alpha = sin(w0) / (2.0 * q)
    val b0 = alpha
    val b2 = -alpha
    val a0 = 1.0 + alpha
    val a1 = -2.0 * kotlin.math.cos(w0)
    val a2 = 1.0 - alpha
    return KittBiquad((b0 / a0).toFloat(), 0f, (b2 / a0).toFloat(), (a1 / a0).toFloat(), (a2 / a0).toFloat())
  }

  private fun comb(input: FloatArray, f0: Float, mix: Float) {
    val delay = (VoiceDisguise.SAMPLE_RATE / f0).toInt().coerceIn(12, 400)
    val buf = FloatArray(delay)
    var idx = 0
    val dry = 1f - mix
    for (i in input.indices) {
      val delayed = buf[idx]
      val y = input[i] + delayed * 0.42f
      buf[idx] = y
      idx++
      if (idx >= delay) idx = 0
      input[i] = input[i] * dry + y * mix
    }
    java.util.Arrays.fill(buf, 0f)
  }

  private fun resampleRatio(input: FloatArray, ratio: Float): FloatArray {
    if (input.isEmpty()) return floatArrayOf()
    val safe = ratio.coerceIn(0.62f, 1.72f)
    val outLen = (input.size / safe).toInt().coerceAtLeast(1)
    val out = FloatArray(outLen)
    val last = input.lastIndex
    for (i in 0 until outLen) {
      val src = i * safe
      val i0 = src.toInt().coerceIn(0, last)
      val i1 = (i0 + 1).coerceAtMost(last)
      val t = src - i0
      out[i] = input[i0] * (1f - t) + input[i1] * t
    }
    return out
  }

  private fun resampleTo16k(input: FloatArray, fromRate: Int): FloatArray {
    val ratio = fromRate.toFloat() / VoiceDisguise.SAMPLE_RATE
    return resampleRatio(input, ratio)
  }

  private fun spokenText(text: String): String {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return trimmed
    return trimmed.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
  }

  private fun language(): String {
    val lang = Locale.getDefault().language.lowercase(Locale.US)
    return if (lang.startsWith("de")) "de" else "en"
  }

  private fun loadModel(context: Context): Model {
    val lang = language()
    model?.let { if (modelLang == lang) return it }
    model?.close()
    model = null
    val dir = unpackModel(context, lang)
    val loaded = Model(dir.absolutePath)
    model = loaded
    modelLang = lang
    return loaded
  }

  private fun unpackModel(context: Context, lang: String): File {
    val name = if (lang == "de") "vosk-model-small-de-0.15" else "vosk-model-small-en-us-0.15"
    val root = File(context.filesDir, "nevula-vosk/$name")
    val ready = File(root, ".ready")
    if (ready.exists() && File(root, "am").exists() && File(root, "conf").exists()) return root
    if (root.exists()) root.deleteRecursively()
    val zip = File(context.cacheDir, "$name.zip")
    val url = "https://alphacephei.com/vosk/models/$name.zip"
    download(url, zip)
    unzip(zip, File(context.filesDir, "nevula-vosk"))
    zip.delete()
    if (!File(root, "am").exists()) {
      throw CodedException("Voice rewriting model was incomplete.")
    }
    ready.writeText("ok")
    return root
  }

  private fun download(url: String, dest: File) {
    dest.parentFile?.mkdirs()
    if (dest.exists()) dest.delete()
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.connectTimeout = 20_000
    conn.readTimeout = 180_000
    conn.instanceFollowRedirects = true
    try {
      if (conn.responseCode !in 200..299) {
        throw CodedException("Voice rewriting needs a one-time download. Connect to the internet and try again.")
      }
      BufferedInputStream(conn.inputStream).use { input ->
        FileOutputStream(dest).use { output ->
          val buf = ByteArray(16_384)
          while (true) {
            val n = input.read(buf)
            if (n <= 0) break
            output.write(buf, 0, n)
          }
        }
      }
    } catch (error: CodedException) {
      dest.delete()
      throw error
    } catch (_: Exception) {
      dest.delete()
      throw CodedException("Voice rewriting needs a one-time download. Connect to the internet and try again.")
    } finally {
      conn.disconnect()
    }
  }

  private fun unzip(zip: File, into: File) {
    into.mkdirs()
    ZipInputStream(BufferedInputStream(FileInputStream(zip))).use { zis ->
      while (true) {
        val entry = zis.nextEntry ?: break
        val name = entry.name.replace('\\', '/')
        if (name.contains("..") || name.startsWith("/") || name.contains("__MACOSX")) {
          zis.closeEntry()
          continue
        }
        val out = File(into, name)
        if (entry.isDirectory) {
          out.mkdirs()
        } else {
          out.parentFile?.mkdirs()
          FileOutputStream(out).use { dest ->
            val buf = ByteArray(16_384)
            while (true) {
              val n = zis.read(buf)
              if (n <= 0) break
              dest.write(buf, 0, n)
            }
          }
        }
        zis.closeEntry()
      }
    }
  }

  private fun pickVoice(tts: TextToSpeech, locale: Locale): Voice? {
    val voices = tts.voices ?: return null
    val offline = voices.filter {
      it.locale.language.equals(locale.language, true) && !it.isNetworkConnectionRequired
    }.sortedBy { it.name }
    return offline.firstOrNull() ?: voices.filter { it.locale.language.equals(locale.language, true) }.minByOrNull { it.name }
  }

  private fun ascii(buf: ByteBuffer, offset: Int, len: Int): String {
    val chars = CharArray(len)
    for (i in 0 until len) chars[i] = buf.get(offset + i).toInt().toChar()
    return String(chars)
  }

  fun release() {
    synchronized(lock) {
      model?.close()
      model = null
      modelLang = null
    }
  }
}

private class KittBiquad(
  private val b0: Float,
  private val b1: Float,
  private val b2: Float,
  private val a1: Float,
  private val a2: Float,
) {
  private var z1 = 0f
  private var z2 = 0f

  fun process(x: Float): Float {
    val y = b0 * x + z1
    z1 = b1 * x - a1 * y + z2
    z2 = b2 * x - a2 * y
    return if (y.isFinite()) y else 0f
  }
}
