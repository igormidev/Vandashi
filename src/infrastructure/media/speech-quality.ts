export function audibleSamples(samples: Float32Array): boolean {
  let energy = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) return false;
    energy += sample * sample;
  }
  return samples.length > 1_600 && Math.sqrt(energy / samples.length) > 0.0003;
}

export function plausibleTranscript(text: string, duration: number): boolean {
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!/\p{L}/u.test(text) || words.length > duration * 7 + 5 || /(.)\1{12}/u.test(text)) return false;
  if (words.length > 20 && new Set(words).size / words.length < 0.2) return false;
  const phrases = new Map<string, number>();
  for (let index = 0; index < words.length - 2; index++) {
    const phrase = words.slice(index, index + 3).join(' ');
    const count = (phrases.get(phrase) ?? 0) + 1;
    if (count > 5) return false;
    phrases.set(phrase, count);
  }
  return true;
}

export function speechScores(logits: ArrayLike<number>, languages: Record<string, number>) {
  let maximum = -Infinity;
  for (let index = 0; index < logits.length; index++) maximum = Math.max(maximum, logits[index] ?? -Infinity);
  let total = 0;
  for (let index = 0; index < logits.length; index++)
    total += Math.exp((logits[index] ?? -Infinity) - maximum);
  const ranked = Object.entries(languages)
    .map(([name, id]) => ({ language: name.slice(2, -2), score: logits[id] ?? -Infinity }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const languageTotal = ranked.reduce((sum, value) => sum + Math.exp(value.score - (best?.score ?? 0)), 0);
  return {
    language: best?.language ?? 'en',
    confidence: 1 / languageTotal,
    // The pinned multilingual tokenizer calls this token <|nocaptions|>.
    noSpeech: Math.exp((logits[50362] ?? -Infinity) - maximum) / total,
  };
}
