import { AppFault, diagnosticEnglish, diagnosticFromError } from '../../domain/diagnostics';
import { z } from 'zod';
import type { DependencyCheck } from '../../domain/models';
import type { MediaProbe } from '../../domain/media';
import { resolveMediaBinary } from './binaries';
import { inspectionProcess } from './inspection-process';
import { runProcess, type MediaRuntime } from './runtime';

const appSetupUrl = 'https://github.com/igormidev/Vandashi#run-from-source';

const doctorSchema = z.object({
  checks: z.array(
    z.object({ name: z.string(), ok: z.boolean(), detail: z.string(), hint: z.string().optional() }),
  ),
});
const probeSchema = z.object({
  streams: z
    .array(
      z.object({
        codec_type: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        sample_aspect_ratio: z.string().optional(),
        tags: z.object({ rotate: z.string().optional() }).optional(),
        side_data_list: z.array(z.object({ rotation: z.number().optional() })).optional(),
      }),
    )
    .default([]),
  format: z.object({ duration: z.string().optional(), format_name: z.string().optional() }),
});

function displayedDimensions(video: z.infer<typeof probeSchema>['streams'][number] | undefined): {
  width: number | null;
  height: number | null;
} {
  if (!video?.width || !video.height || video.width < 0 || video.height < 0)
    return { width: null, height: null };
  const parts = video.sample_aspect_ratio?.match(/^(\d+):(\d+)$/);
  const numerator = Number(parts?.[1]);
  const denominator = Number(parts?.[2]);
  const sampleRatio = numerator > 0 && denominator > 0 ? numerator / denominator : 1;
  const width = video.width * sampleRatio;
  // Display Matrix is authoritative; older files may only expose a rotate tag.
  const rotation =
    video.side_data_list?.find((entry) => entry.rotation !== undefined)?.rotation ??
    Number(video.tags?.rotate ?? 0);
  if (!Number.isFinite(rotation) || !Number.isFinite(width))
    throw new AppFault({ id: 'mediaDisplayDimensionsInvalid' });
  const radians = ((rotation % 360) * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    width: Math.round(width * cosine + video.height * sine),
    height: Math.round(width * sine + video.height * cosine),
  };
}

export function parseMediaProbe(output: string): MediaProbe {
  const parsed = probeSchema.parse(JSON.parse(output) as unknown);
  const video = parsed.streams.find((stream) => stream.codec_type === 'video');
  const duration = Number(parsed.format.duration ?? 0);
  if (!Number.isFinite(duration) || duration < 0) throw new AppFault({ id: 'mediaDurationInvalid' });
  return {
    duration,
    ...displayedDimensions(video),
    hasAudio: parsed.streams.some((stream) => stream.codec_type === 'audio'),
    format: parsed.format.format_name ?? '',
  };
}

export async function probeMedia(
  runtime: MediaRuntime,
  path: string,
  signal: AbortSignal = new AbortController().signal,
): Promise<MediaProbe> {
  const output = await inspectionProcess(
    resolveMediaBinary('ffprobe', runtime.environment),
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name:stream=codec_type,width,height,sample_aspect_ratio:stream_tags=rotate:stream_side_data=rotation',
      '-of',
      'json',
      '--',
      path,
    ],
    runtime.environment,
    signal,
    15_000,
  );
  return parseMediaProbe(output.toString());
}

export function requiredDoctorChecks(output: string): DependencyCheck[] {
  const report = doctorSchema.parse(JSON.parse(output) as unknown);
  // Docker, Whisper, music and TTS are optional; doctor.ok includes them and is NOT a gate.
  const dependencies = [
    {
      name: 'Node.js',
      label: { id: 'mediaNodeLabel' },
      recovery: { id: 'mediaBundledRuntimeRecovery' },
      helpUrl: appSetupUrl,
    },
    {
      name: 'FFmpeg',
      label: { id: 'mediaFfmpegLabel' },
      recovery: { id: 'mediaToolSetupRequired', params: { name: 'FFmpeg' } },
      helpUrl: 'https://ffmpeg.org/download.html',
    },
    {
      name: 'FFprobe',
      label: { id: 'mediaFfprobeLabel' },
      recovery: { id: 'mediaToolSetupRequired', params: { name: 'FFprobe' } },
      helpUrl: 'https://ffmpeg.org/download.html',
    },
    {
      name: 'Chrome',
      label: { id: 'mediaChromeLabel' },
      recovery: { id: 'mediaBrowserSetupRequired' },
      helpUrl: 'https://hyperframes.heygen.com/packages/cli#browser',
    },
  ] as const;
  return dependencies.map(({ name, label, recovery, helpUrl }) => {
    const check = report.checks.find((candidate) => candidate.name === name);
    const fault = check?.ok
      ? null
      : new AppFault(recovery, [check?.detail, check?.hint].filter(Boolean).join('\n') || undefined);
    return {
      id: `media-${name.toLowerCase().replace(/[^a-z]/g, '')}`,
      label,
      status: check?.ok ? 'ready' : 'missing',
      detail: fault?.message ?? check?.detail ?? '',
      ...(fault ? { diagnostic: fault.diagnostic } : {}),
      repairPrompt: null,
      helpUrl,
    };
  });
}

export async function checkMediaDependencies(
  runtime: MediaRuntime,
  onCheck?: (check: DependencyCheck) => void,
): Promise<DependencyCheck[]> {
  const checks: DependencyCheck[] = [];
  const record = (check: DependencyCheck): void => {
    checks.push(check);
    onCheck?.(check);
  };
  try {
    const version = (
      await runProcess(runtime.nodePath, [runtime.cliPath, '--version'], runtime.environment)
    ).trim();
    record({
      id: 'hyperframes',
      label: { id: 'mediaHyperframesLabel' },
      status: 'ready',
      detail: `Hyperframes ${version} · Studio included`,
      diagnostic: { kind: 'app', message: { id: 'mediaStudioIncluded', params: { version } } },
      repairPrompt: null,
      helpUrl: null,
    });
    const output = await runProcess(
      runtime.nodePath,
      [runtime.cliPath, 'doctor', '--json'],
      runtime.environment,
      45_000,
    );
    for (const check of requiredDoctorChecks(output)) record(check);
  } catch (error) {
    const cause = diagnosticFromError(error);
    record({
      id: checks.length > 0 ? 'media-environment' : 'hyperframes',
      status: 'error',
      detail: diagnosticEnglish(cause),
      diagnostic: cause,
      recovery: { id: checks.length > 0 ? 'mediaEnvironmentRecovery' : 'mediaBundledRuntimeRecovery' },
      label: { id: checks.length > 0 ? 'mediaEnvironmentLabel' : 'mediaHyperframesLabel' },
      repairPrompt: null,
      helpUrl: checks.length > 0 ? 'https://hyperframes.heygen.com/guides/troubleshooting' : appSetupUrl,
    });
  }
  const skill = new AppFault({ id: 'mediaSkillMissing' });
  record({
    id: 'skill',
    label: { id: 'mediaSkillLabel' },
    status: 'missing',
    detail: skill.message,
    diagnostic: skill.diagnostic,
    repairPrompt: null,
    helpUrl: 'https://hyperframes.heygen.com/guides/skills',
  });
  return checks;
}
