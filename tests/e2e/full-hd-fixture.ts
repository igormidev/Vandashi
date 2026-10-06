import { execFile } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { promisify } from 'node:util';
const execute = promisify(execFile);
/** Use the host's native encoder on macOS; other CI hosts supply FFmpeg. No media handlers are replaced. */
export function createFullHdFixture(path: string) {
  return createEncodedFixture(path, 1920, 1080);
}
export async function createEncodedFixture(path: string, width: number, height: number) {
  if (process.platform !== 'darwin') {
    await execute('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${String(width)}x${String(height)}:rate=30`,
      '-t',
      '6',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-profile:v',
      'high',
      '-level:v',
      '5.0',
      '-pix_fmt',
      'yuv420p',
      path,
    ]);
    return;
  }
  const source = join(dirname(path), `fixture-${String(width)}-${String(height)}.swift`);
  await writeFile(
    source,
    `import AVFoundation
import CoreVideo
import Foundation
let destination = URL(fileURLWithPath: CommandLine.arguments[1])
let writer = try AVAssetWriter(outputURL: destination, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: ${String(width)}, AVVideoHeightKey: ${String(height)}])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: ${String(width)}, kCVPixelBufferHeightKey as String: ${String(height)}])
writer.add(input)
guard writer.startWriting() else { fatalError(String(describing: writer.error)) }
writer.startSession(atSourceTime: .zero)
for frame in 0..<180 {
 while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.001) }
 var buffer: CVPixelBuffer?
 guard CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer) == kCVReturnSuccess, let pixels = buffer else { fatalError("Pixel buffer unavailable") }
 CVPixelBufferLockBaseAddress(pixels, [])
 let rowBytes=CVPixelBufferGetBytesPerRow(pixels)
 let base=CVPixelBufferGetBaseAddress(pixels)!
 for row in 0..<${String(height)} { let pointer=base.advanced(by: row * rowBytes).assumingMemoryBound(to: UInt32.self); for column in 0..<${String(width)} { pointer[column]=((row / 100 + column / 100 + frame / 15) % 2 == 0) ? 0xFFFF8000 : 0xFF202080 } }
 CVPixelBufferUnlockBaseAddress(pixels, [])
 guard adaptor.append(pixels, withPresentationTime: CMTime(value: Int64(frame), timescale: 30)) else { fatalError(String(describing: writer.error)) }
}
input.markAsFinished()
let done=DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
guard writer.status == .completed else { fatalError(String(describing: writer.error)) }
`,
  );
  try {
    await execute('/usr/bin/swift', ['-O', source, path], { timeout: 60000, maxBuffer: 1024 * 1024 });
  } finally {
    await rm(source, { force: true });
  }
}
