package expo.modules.nevulavoice

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Arrays

internal data class EncodedAudio(val file: File, val mime: String)

internal object AudioEncoder {
  fun encode(pcm: ShortArray, sampleRate: Int, destWithoutExt: File): EncodedAudio {
    val aac = File(destWithoutExt.parentFile, destWithoutExt.name + ".m4a")
    return try {
      encodeAac(pcm, sampleRate, aac)
      EncodedAudio(aac, "audio/mp4")
    } catch (_: Exception) {
      aac.delete()
      val wav = File(destWithoutExt.parentFile, destWithoutExt.name + ".wav")
      writeWav(pcm, sampleRate, wav)
      EncodedAudio(wav, "audio/wav")
    }
  }

  private fun encodeAac(source: ShortArray, sampleRate: Int, dest: File) {
    dest.parentFile?.mkdirs()
    if (dest.exists()) dest.delete()
    val encodeRate = if (sampleRate < 22_050) 22_050 else sampleRate
    val pcm = if (encodeRate == sampleRate) source else upsample(source, sampleRate, encodeRate)
    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, encodeRate, 1).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, 48_000)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16_384)
    }
    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    encoder.start()
    val muxer = MediaMuxer(dest.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var track = -1
    var muxerStarted = false
    var offset = 0
    var inputEos = false
    var outputEos = false
    val info = MediaCodec.BufferInfo()
    val timeoutUs = 12_000L
    var loops = 0
    val maxLoops = pcm.size + 20_000
    try {
      while (!outputEos && loops < maxLoops) {
        loops++
        if (!inputEos) {
          val inIndex = encoder.dequeueInputBuffer(timeoutUs)
          if (inIndex >= 0) {
            val inBuf = encoder.getInputBuffer(inIndex)
            if (inBuf != null) {
              inBuf.clear()
              inBuf.order(ByteOrder.LITTLE_ENDIAN)
              val maxSamples = (inBuf.remaining() / 2).coerceAtMost(pcm.size - offset)
              if (maxSamples <= 0) {
                encoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputEos = true
              } else {
                for (i in 0 until maxSamples) inBuf.putShort(pcm[offset + i])
                val pts = offset * 1_000_000L / encodeRate
                encoder.queueInputBuffer(inIndex, 0, maxSamples * 2, pts, 0)
                offset += maxSamples
              }
            }
          }
        }
        when (val outIndex = encoder.dequeueOutputBuffer(info, timeoutUs)) {
          MediaCodec.INFO_TRY_AGAIN_LATER -> Unit
          MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            if (!muxerStarted) {
              track = muxer.addTrack(encoder.outputFormat)
              muxer.start()
              muxerStarted = true
            }
          }
          else -> if (outIndex >= 0) {
            val outBuf = encoder.getOutputBuffer(outIndex)
            if (outBuf != null && info.size > 0 && muxerStarted && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
              outBuf.position(info.offset)
              outBuf.limit(info.offset + info.size)
              muxer.writeSampleData(track, outBuf, info)
            }
            encoder.releaseOutputBuffer(outIndex, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputEos = true
          }
        }
      }
      if (!muxerStarted || !dest.exists() || dest.length() < 64) {
        throw IllegalStateException("AAC encoder produced no audio.")
      }
    } finally {
      if (pcm !== source) Arrays.fill(pcm, 0)
      try { if (muxerStarted) muxer.stop() } catch (_: Exception) {}
      try { muxer.release() } catch (_: Exception) {}
      try { encoder.stop() } catch (_: Exception) {}
      try { encoder.release() } catch (_: Exception) {}
    }
  }

  private fun upsample(pcm: ShortArray, fromRate: Int, toRate: Int): ShortArray {
    val ratio = fromRate.toDouble() / toRate
    val outLen = (pcm.size / ratio).toInt().coerceAtLeast(1)
    val out = ShortArray(outLen)
    val last = pcm.lastIndex
    for (i in 0 until outLen) {
      val src = i * ratio
      val i0 = src.toInt().coerceIn(0, last)
      val i1 = (i0 + 1).coerceAtMost(last)
      val t = (src - i0).toFloat()
      out[i] = (pcm[i0] * (1f - t) + pcm[i1] * t).toInt().coerceIn(-32767, 32767).toShort()
    }
    return out
  }

  private fun writeWav(pcm: ShortArray, sampleRate: Int, dest: File) {
    dest.parentFile?.mkdirs()
    val dataBytes = pcm.size * 2
    val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray(Charsets.US_ASCII))
    header.putInt(36 + dataBytes)
    header.put("WAVE".toByteArray(Charsets.US_ASCII))
    header.put("fmt ".toByteArray(Charsets.US_ASCII))
    header.putInt(16)
    header.putShort(1)
    header.putShort(1)
    header.putInt(sampleRate)
    header.putInt(sampleRate * 2)
    header.putShort(2)
    header.putShort(16)
    header.put("data".toByteArray(Charsets.US_ASCII))
    header.putInt(dataBytes)
    FileOutputStream(dest).use { out ->
      out.write(header.array())
      val buf = ByteBuffer.allocate(4096).order(ByteOrder.LITTLE_ENDIAN)
      var i = 0
      while (i < pcm.size) {
        buf.clear()
        while (i < pcm.size && buf.remaining() >= 2) {
          buf.putShort(pcm[i])
          i++
        }
        out.write(buf.array(), 0, buf.position())
      }
    }
  }
}
