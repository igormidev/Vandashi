import { AppFault, failureEnvelope } from '../../domain/diagnostics';
import { readFile } from 'node:fs/promises';
import { env, pipeline, Tensor } from '@huggingface/transformers';
import { z } from 'zod';
import { audibleSamples, plausibleTranscript, speechScores } from './speech-quality';
import type { SpeechSegment } from '../../domain/asset-inspection';

const requestSchema = z.object({
  modelPath: z.string(),
  samples: z
    .array(
      z.object({
        path: z.string(),
        start: z.number().nonnegative(),
        duration: z.number().positive().max(30),
      }),
    )
    .max(3),
});
const configSchema = z.object({
  decoder_start_token_id: z.number().int(),
  lang_to_id: z.record(z.string(), z.number().int()),
});
const transcriptSchema = z.object({
  text: z.string(),
  chunks: z
    .array(z.object({ text: z.string(), timestamp: z.tuple([z.number().nullable(), z.number().nullable()]) }))
    .optional(),
});

function disposeTensors(value: unknown): void {
  if (value instanceof Tensor) value.dispose();
  else if (Array.isArray(value)) for (const entry of value) disposeTensors(entry);
  else if (value !== null && typeof value === 'object')
    for (const entry of Object.values(value)) disposeTensors(entry);
}

async function main(): Promise<void> {
  const request = requestSchema.parse(JSON.parse(await readFile(process.argv[2] ?? '', 'utf8')) as unknown);
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  const config = configSchema.parse(
    JSON.parse(await readFile(`${request.modelPath}/generation_config.json`, 'utf8')) as unknown,
  );
  const transcriber = await pipeline('automatic-speech-recognition', request.modelPath, {
    dtype: 'q8',
    device: 'cpu',
    local_files_only: true,
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1, enableCpuMemArena: false },
  });
  const segments: SpeechSegment[] = [];
  try {
    for (const sample of request.samples) {
      const bytes = await readFile(sample.path);
      if (bytes.length > 30 * 16_000 * 4 || bytes.length % 4)
        throw new AppFault({ id: 'mediaSpeechSampleInvalid' });
      const audio = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
      if (!audibleSamples(audio)) continue;
      const features: unknown = await transcriber.processor(audio);
      if (
        !features ||
        typeof features !== 'object' ||
        !('input_features' in features) ||
        !(features.input_features instanceof Tensor)
      )
        throw new AppFault({ id: 'mediaSpeechFeaturesInvalid' });
      const output: unknown = await transcriber.model({
        input_features: features.input_features,
        decoder_input_ids: new Tensor(
          'int64',
          BigInt64Array.from([BigInt(config.decoder_start_token_id)]),
          [1, 1],
        ),
      });
      if (
        !output ||
        typeof output !== 'object' ||
        !('logits' in output) ||
        !(output.logits instanceof Tensor) ||
        !(output.logits.data instanceof Float32Array)
      )
        throw new AppFault({ id: 'mediaSpeechDetectionInvalid' });
      const scores = speechScores(output.logits.data, config.lang_to_id);
      disposeTensors(output);
      disposeTensors(features);
      if (scores.noSpeech > 0.6 || scores.confidence < 0.5) continue;
      const result = transcriptSchema.parse(
        await transcriber(audio, {
          language: scores.language,
          task: 'transcribe',
          return_timestamps: true,
          max_new_tokens: 256,
        }),
      );
      if (!plausibleTranscript(result.text, sample.duration)) continue;
      for (const chunk of result.chunks ?? [{ text: result.text, timestamp: [0, sample.duration] }]) {
        const start = Math.max(0, Math.min(sample.duration, chunk.timestamp[0] ?? 0));
        const end = Math.max(start, Math.min(sample.duration, chunk.timestamp[1] ?? sample.duration));
        if (end > start && chunk.text.trim())
          segments.push({
            start: sample.start + start,
            end: sample.start + end,
            text: chunk.text.trim(),
            language: scores.language,
          });
      }
    }
    process.stdout.write(JSON.stringify(segments));
  } finally {
    await transcriber.dispose();
  }
}
void main().catch((error: unknown) => {
  process.stdout.write(JSON.stringify(failureEnvelope(error)));
});
