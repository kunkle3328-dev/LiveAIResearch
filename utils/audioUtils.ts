
import { Blob } from '@google/genai';

export const PCM_SAMPLE_RATE = 16000;

/**
 * Converts Float32Array PCM data to the specific format required by Gemini Live API.
 */
export function pcmToGeminiBlob(data: Float32Array, sampleRate: number): Blob {
  const l = data.length;
  // Convert Float32 to Int16
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  const bytes = new Uint8Array(int16.buffer);
  
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    data: base64,
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
}

/**
 * Decodes a base64 string containing raw PCM data into a Float32Array.
 */
export function base64ToFloat32(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Interpret as Int16
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  
  return float32;
}

/**
 * Merges multiple Base64 PCM strings into a single Base64 string.
 * Optimized for memory and stack safety.
 */
export function mergeBase64PCM(base64Chunks: string[]): string {
  if (!base64Chunks || base64Chunks.length === 0) return '';
  
  // 1. Calculate total size first to allocate once
  let totalLength = 0;
  const decodedChunks: Uint8Array[] = [];
  
  for (const b64 of base64Chunks) {
      const bin = atob(b64);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for(let i=0; i<len; i++) bytes[i] = bin.charCodeAt(i);
      decodedChunks.push(bytes);
      totalLength += len;
  }
  
  // 2. Merge into single buffer
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of decodedChunks) {
    result.set(arr, offset);
    offset += arr.length;
  }
  
  // 3. Encode back to base64 safely
  // Process in smaller chunks to avoid stack overflow with String.fromCharCode
  // Using 0x8000 (32768) is generally safe for modern browsers
  const CHUNK_SIZE = 0x8000; 
  const chars: string[] = [];
  
  for (let i = 0; i < totalLength; i += CHUNK_SIZE) {
    const slice = result.subarray(i, Math.min(i + CHUNK_SIZE, totalLength));
    // Use apply only on small chunks
    chars.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  
  return btoa(chars.join(''));
}

/**
 * Creates an AudioBuffer from Float32 PCM data.
 */
export function createAudioBuffer(
  ctx: AudioContext,
  data: Float32Array,
  sampleRate: number
): AudioBuffer {
  const buffer = ctx.createBuffer(1, data.length, sampleRate);
  buffer.getChannelData(0).set(data);
  return buffer;
}

/**
 * Calculates RMS volume for visualization
 */
export function calculateVolume(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  const rms = Math.sqrt(sum / data.length);
  return Math.min(1, rms * 5); 
}
