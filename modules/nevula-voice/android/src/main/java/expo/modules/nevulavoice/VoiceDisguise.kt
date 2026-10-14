package expo.modules.nevulavoice

import java.util.Arrays
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh
import kotlin.random.Random

internal class FastRng(seed: Long) {
  private var state = seed or 1L

  fun nextInt(): Int {
    var x = state
    x = x xor (x shl 13)
    x = x xor (x ushr 7)
    x = x xor (x shl 17)
    state = x
    return x.toInt()
  }

  fun nextFloat(): Float = (nextInt().toUInt().toFloat() / 4294967296f)

  fun range(min: Float, max: Float): Float = min + (max - min) * nextFloat()

  fun int(bound: Int): Int {
    if (bound <= 1) return 0
    return (nextInt().toUInt() % bound.toUInt()).toInt()
  }
}

private class Biquad(
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

private fun bandpass(sr: Float, freq: Float, q: Float): Biquad {
  val safeFreq = freq.coerceIn(80f, sr * 0.42f)
  val safeQ = q.toDouble().coerceIn(0.7, 6.0)
  val w0 = 2.0 * PI * safeFreq / sr
  val alpha = sin(w0) / (2.0 * safeQ)
  val b0 = alpha
  val b1 = 0.0
  val b2 = -alpha
  val a0 = 1.0 + alpha
  val a1 = -2.0 * cos(w0)
  val a2 = 1.0 - alpha
  return Biquad((b0 / a0).toFloat(), (b1 / a0).toFloat(), (b2 / a0).toFloat(), (a1 / a0).toFloat(), (a2 / a0).toFloat())
}

private fun envCoeff(sr: Int, ms: Float): Float {
  val samples = (sr * (ms / 1000f)).coerceAtLeast(2f)
  return (1.0 - exp(-1.0 / samples)).toFloat()
}

private fun onePoleHighpass(input: FloatArray, sr: Int, hz: Float) {
  val rc = 1f / (2f * PI.toFloat() * hz)
  val dt = 1f / sr
  val a = rc / (rc + dt)
  var prevX = 0f
  var prevY = 0f
  for (i in input.indices) {
    val x = input[i]
    val y = a * (prevY + x - prevX)
    prevX = x
    prevY = y
    input[i] = y
  }
}

private fun onePoleLowpass(input: FloatArray, sr: Int, hz: Float) {
  val rc = 1f / (2f * PI.toFloat() * hz)
  val dt = 1f / sr
  val a = dt / (rc + dt)
  var prev = 0f
  for (i in input.indices) {
    prev += a * (input[i] - prev)
    input[i] = prev
  }
}

private fun resample(input: FloatArray, ratio: Float): FloatArray {
  if (input.isEmpty()) return floatArrayOf()
  val safe = ratio.coerceIn(0.72f, 1.38f)
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

private fun timeWarp(input: FloatArray, rng: FastRng, amount: Float): FloatArray {
  if (input.size < 32 || amount <= 0.01f) return input.copyOf()
  val pieces = 3 + rng.int(3)
  val speeds = FloatArray(pieces) { rng.range(1f - amount, 1f + amount) }
  val avg = speeds.average().toFloat().coerceAtLeast(0.01f)
  for (i in speeds.indices) speeds[i] = speeds[i] / avg
  val out = FloatArray(input.size)
  val last = input.lastIndex
  var src = 0.0
  val pieceLen = input.size.toDouble() / pieces
  for (i in out.indices) {
    val p = (i / pieceLen).toInt().coerceIn(0, pieces - 1)
    val i0 = src.toInt().coerceIn(0, last)
    val i1 = (i0 + 1).coerceAtMost(last)
    val t = (src - i0).toFloat()
    out[i] = input[i0] * (1f - t) + input[i1] * t
    src += speeds[p]
    if (src > last) src = last.toDouble()
  }
  return out
}

private class Oscillator(kind: Int, freq: Float, private val sr: Int, rng: FastRng) {
  private var phase = rng.nextFloat()
  private val detune = rng.range(0.985f, 1.015f)
  private val base = freq
  private val pulse = kind == 0

  fun next(vibrato: Float = 0f): Float {
    val f = (base * detune * (1f + vibrato)).coerceIn(60f, sr * 0.42f)
    val p = phase
    val value = if (pulse) {
      if (p < 0.18f) 0.9f else -0.22f
    } else {
      p * 2f - 1f
    }
    phase += f / sr
    if (phase >= 1f) phase -= 1f
    return value
  }
}

private fun followEnvelope(input: FloatArray, sr: Int, attackMs: Float, releaseMs: Float): FloatArray {
  val attack = envCoeff(sr, attackMs)
  val release = envCoeff(sr, releaseMs)
  val env = FloatArray(input.size)
  var e = 0f
  for (i in input.indices) {
    val mag = abs(input[i])
    e += (mag - e) * if (mag > e) attack else release
    env[i] = e
  }
  return env
}

private fun applyGate(input: FloatArray, env: FloatArray, thresh: Float) {
  var g = 0f
  for (i in input.indices) {
    val target = if (env[i] > thresh) 1f else 0f
    g += (target - g) * if (target > g) 0.20f else 0.05f
    input[i] *= g
  }
}

private fun harmonicAm(input: FloatArray, sr: Int, f0: Float): FloatArray {
  val out = FloatArray(input.size)
  var phase = 0.0
  val twoPi = 2.0 * PI
  for (i in input.indices) {
    phase += f0 / sr
    if (phase >= 1.0) phase -= 1.0
    val w = twoPi * phase
    val am = 0.40 + 0.38 * sin(w) + 0.16 * sin(2.0 * w) + 0.10 * sin(3.0 * w)
    out[i] = input[i] * am.toFloat()
  }
  return out
}

private fun addBuzz(dest: FloatArray, env: FloatArray, sr: Int, f0: Float, amount: Float) {
  var phase = 0.0
  val twoPi = 2.0 * PI
  for (i in dest.indices) {
    phase += f0 / sr
    if (phase >= 1.0) phase -= 1.0
    val w = twoPi * phase
    val buzz = (
      sin(w) +
      0.50 * sin(3.0 * w) +
      0.33 * sin(5.0 * w) +
      0.22 * sin(7.0 * w) +
      0.16 * sin(9.0 * w)
    ).toFloat()
    dest[i] += buzz * env[i] * amount
  }
}

private fun combResonate(input: FloatArray, sr: Int, f0: Float, mix: Float) {
  val delay = (sr / f0).toInt().coerceIn(12, 400)
  val buf = FloatArray(delay)
  var idx = 0
  val feedback = 0.46f
  val dry = 1f - mix
  for (i in input.indices) {
    val delayed = buf[idx]
    val y = input[i] + delayed * feedback
    buf[idx] = y
    idx++
    if (idx >= delay) idx = 0
    input[i] = input[i] * dry + y * mix
  }
  Arrays.fill(buf, 0f)
}

private fun sineRobot(input: FloatArray, sr: Int, f0: Float, lfoHz: Float, lfoDepth: Float): FloatArray {
  val out = FloatArray(input.size)
  var phase = 0.0
  val twoPi = 2.0 * PI
  for (i in input.indices) {
    val freq = (f0 * (1.0 + lfoDepth * sin(twoPi * lfoHz * i / sr))).coerceIn(62.0, 140.0)
    phase += freq / sr
    if (phase >= 1.0) phase -= 1.0
    val am = 0.38 + 0.62 * sin(twoPi * phase)
    out[i] = input[i] * am.toFloat()
  }
  return out
}

private fun vocode(
  input: FloatArray,
  sr: Int,
  bands: Int,
  q: Float,
  pulseCarrier: Boolean,
  f0: Float,
  envHold: Int,
  rng: FastRng,
): FloatArray {
  val out = FloatArray(input.size)
  val carrier = FloatArray(input.size)
  val osc = Oscillator(if (pulseCarrier) 0 else 1, f0, sr, rng)
  val lfoHz = rng.range(1.8f, 4.2f)
  val lfoDepth = rng.range(0.012f, 0.04f)
  val twoPi = (2.0 * PI).toFloat()
  for (i in input.indices) {
    val vibrato = sin(twoPi * lfoHz * i / sr).toFloat() * lfoDepth
    carrier[i] = osc.next(vibrato)
  }

  val lo = 180.0 * rng.range(0.96f, 1.04f)
  val hi = 3800.0 * rng.range(0.96f, 1.04f)
  val attack = envCoeff(sr, rng.range(8f, 14f))
  val release = envCoeff(sr, rng.range(26f, 42f))
  val holdSamples = envHold.coerceAtLeast(1)

  for (b in 0 until bands) {
    val t = (b + 0.5) / bands
    val fc = (lo * (hi / lo).pow(t) * rng.range(0.97f, 1.03f).toDouble()).toFloat()
    val analysis = bandpass(sr.toFloat(), fc, q)
    val synth = bandpass(sr.toFloat(), fc, q)
    val gain = rng.range(0.85f, 1.2f)
    var env = 0f
    var held = 0f
    var left = 0
    for (i in input.indices) {
      val mag = abs(analysis.process(input[i]))
      env += (mag - env) * if (mag > env) attack else release
      if (holdSamples > 1) {
        if (left <= 0) {
          held = env
          left = holdSamples
        } else {
          left--
        }
      } else {
        held = env
      }
      out[i] += synth.process(carrier[i]) * held * gain
    }
  }
  Arrays.fill(carrier, 0f)
  return out
}

private fun tilt(input: FloatArray, amount: Float) {
  var prev = 0f
  for (i in input.indices) {
    val x = input[i]
    input[i] = x + (x - prev) * amount
    prev = x
  }
}

private fun normalizePeak(input: FloatArray, peakTarget: Float = 0.89f) {
  var peak = 1.0e-6f
  for (v in input) {
    if (v.isFinite()) peak = max(peak, abs(v))
  }
  val g = peakTarget / peak
  for (i in input.indices) {
    val x = if (input[i].isFinite()) input[i] * g else 0f
    input[i] = x.coerceIn(-1f, 1f)
  }
}

private fun normalizeSoft(input: FloatArray) {
  var peak = 1.0e-6f
  for (v in input) {
    if (v.isFinite()) peak = max(peak, abs(v))
  }
  val g = 0.82f / peak
  for (i in input.indices) {
    val x = if (input[i].isFinite()) input[i] else 0f
    input[i] = tanh(x * g)
  }
}

private fun tremolo(input: FloatArray, hz: Float, depth: Float, sr: Int) {
  val w = 2.0 * PI * hz / sr
  for (i in input.indices) {
    val m = 1f - depth + depth * (0.5f + 0.5f * sin(w * i).toFloat())
    input[i] *= m
  }
}

private fun bitCrush(input: FloatArray, bits: Int) {
  val levels = (1 shl bits.coerceIn(8, 14)).toFloat()
  for (i in input.indices) {
    input[i] = kotlin.math.round(input[i] * levels) / levels
  }
}

internal object VoiceDisguise {
  const val SAMPLE_RATE = 16_000
  const val MAX_SECONDS = 60

  fun downsample(pcm: ShortArray, frames: Int, fromRate: Int): ShortArray {
    val n = frames.coerceIn(0, pcm.size)
    if (n <= 0) return shortArrayOf()
    if (fromRate == SAMPLE_RATE) return pcm.copyOf(n)
    val floats = FloatArray(n) { i -> pcm[i] / 32768f }
    onePoleLowpass(floats, fromRate, 7_200f)
    onePoleLowpass(floats, fromRate, 7_200f)
    val ratio = fromRate.toFloat() / SAMPLE_RATE
    val outLen = (n / ratio).toInt().coerceAtLeast(1)
    val out = ShortArray(outLen)
    val last = n - 1
    for (i in 0 until outLen) {
      val src = i * ratio
      val i0 = src.toInt().coerceIn(0, last)
      val i1 = (i0 + 1).coerceAtMost(last)
      val t = src - i0
      val mixed = (floats[i0] * (1f - t) + floats[i1] * t).coerceIn(-1f, 1f)
      out[i] = (mixed * 32767f).toInt().toShort()
    }
    Arrays.fill(floats, 0f)
    return out
  }

  fun rms(pcm: ShortArray, frames: Int): Double {
    if (frames <= 0) return 0.0
    var sum = 0.0
    val n = frames.coerceAtMost(pcm.size)
    for (i in 0 until n) {
      val v = pcm[i].toDouble()
      sum += v * v
    }
    return sqrt(sum / n)
  }

  fun process(pcm: ShortArray, frames: Int, mode: String): ShortArray {
    val n = frames.coerceIn(0, pcm.size)
    if (n < SAMPLE_RATE / 5) {
      wipe(pcm)
      throw IllegalStateException("Recording is too short.")
    }
    if (rms(pcm, n) < 250.0) {
      wipe(pcm)
      throw IllegalStateException("Microphone captured almost no sound. Check microphone permission and try again.")
    }
    val rng = FastRng(Random.Default.nextLong() xor System.nanoTime())
    val samples = FloatArray(n) { i -> pcm[i] / 32768f }
    wipe(pcm)

    onePoleHighpass(samples, SAMPLE_RATE, if (mode == "robot") 110f else 70f)
    if (mode == "robot") {
      onePoleLowpass(samples, SAMPLE_RATE, 3_200f)
      onePoleLowpass(samples, SAMPLE_RATE, 3_200f)
      val env = followEnvelope(samples, SAMPLE_RATE, 12f, 90f)
      applyGate(samples, env, 0.012f)
      val f0 = 88f
      val voiced = harmonicAm(samples, SAMPLE_RATE, f0)
      Arrays.fill(samples, 0f)
      addBuzz(voiced, env, SAMPLE_RATE, f0, 0.30f)
      Arrays.fill(env, 0f)
      combResonate(voiced, SAMPLE_RATE, f0, 0.28f)
      onePoleHighpass(voiced, SAMPLE_RATE, 80f)
      onePoleLowpass(voiced, SAMPLE_RATE, 3_800f)
      normalizePeak(voiced, 0.88f)
      val out = ShortArray(voiced.size) { i ->
        (voiced[i] * 32767f).toInt().coerceIn(-32767, 32767).toShort()
      }
      Arrays.fill(voiced, 0f)
      return out
    }

    val warped = timeWarp(
      samples,
      rng,
      if (mode == "chatter") rng.range(0.04f, 0.08f) else rng.range(0.04f, 0.09f),
    )
    Arrays.fill(samples, 0f)
    var work = warped

    val formant = when (mode) {
      "chatter" -> rng.range(0.84f, 1.18f)
      else -> rng.range(0.80f, 1.22f)
    }
    val speed = when (mode) {
      "chatter" -> rng.range(1.04f, 1.16f)
      else -> rng.range(0.86f, 0.98f)
    }
    val resampled = resample(work, speed * formant)
    if (work !== samples) Arrays.fill(work, 0f) else Arrays.fill(samples, 0f)
    work = resampled

    val f0 = when (mode) {
      "chatter" -> rng.range(110f, 168f)
      else -> rng.range(96f, 140f)
    }

    val voiced = run {
      val bands = if (mode == "chatter") 10 + rng.int(4) else 6 + rng.int(3)
      val q = if (mode == "chatter") rng.range(2.2f, 3.4f) else rng.range(3.2f, 4.8f)
      val hold = if (mode == "synthetic") (SAMPLE_RATE * rng.range(0.018f, 0.032f)).toInt() else 1
      val mixed = vocode(work, SAMPLE_RATE, bands, q, mode != "chatter", f0, hold, rng)
      Arrays.fill(work, 0f)
      for (i in mixed.indices) mixed[i] *= 6f
      mixed
    }

    when (mode) {
      "chatter" -> {
        tremolo(voiced, rng.range(3.2f, 5.5f), rng.range(0.06f, 0.12f), SAMPLE_RATE)
        tilt(voiced, rng.range(-0.08f, 0.08f))
        onePoleHighpass(voiced, SAMPLE_RATE, 90f)
        onePoleLowpass(voiced, SAMPLE_RATE, rng.range(3600f, 4600f))
        normalizeSoft(voiced)
      }
      else -> {
        bitCrush(voiced, 11 + rng.int(3))
        tilt(voiced, rng.range(-0.08f, 0.08f))
        onePoleHighpass(voiced, SAMPLE_RATE, 90f)
        onePoleLowpass(voiced, SAMPLE_RATE, rng.range(2800f, 3600f))
        normalizeSoft(voiced)
      }
    }

    val out = ShortArray(voiced.size) { i ->
      (voiced[i] * 32767f).toInt().coerceIn(-32767, 32767).toShort()
    }
    Arrays.fill(voiced, 0f)
    return out
  }

  fun wipe(pcm: ShortArray) {
    Arrays.fill(pcm, 0)
  }

  fun wipe(pcm: FloatArray) {
    Arrays.fill(pcm, 0f)
  }
}
