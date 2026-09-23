/** One second of valid PCM WAV, small enough for native UI fixtures. */
export function audioFixture(): Buffer {
  const sampleRate = 8_000;
  const audio = Buffer.alloc(44 + sampleRate * 2);
  audio.write('RIFF', 0);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(sampleRate, 24);
  audio.writeUInt32LE(sampleRate * 2, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(sampleRate * 2, 40);
  for (let sample = 0; sample < sampleRate; sample++)
    audio.writeInt16LE(
      Math.round(Math.sin((sample * 440 * 2 * Math.PI) / sampleRate) * 10_000),
      44 + sample * 2,
    );
  return audio;
}
