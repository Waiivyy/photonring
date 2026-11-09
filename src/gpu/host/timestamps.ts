// GPU time from timestamp queries, without trusting what comes back. The WebGPU specification
// calls timestamp values implementation-defined and requires applications to handle arbitrary
// results (section 20.4, "Timestamp Query"). Safari 27.0 on an Apple M5 copied a query set out
// while the passes that write it were still running and returned the previous batch's values,
// which the page showed as negative GPU times (docs/PERFORMANCE.md, "Timestamps in Safari").
// So the copy waits until the queue has finished the timed work, in a submission of its own,
// and a span counts only if it is not negative and no longer than the wall-clock time of the
// work plus a small allowance.

/** Milliseconds of a batch of passes. */
export interface PassTime {
  /** GPU time from timestamp queries, or null when none were taken or the span was rejected. */
  readonly gpuMs: number | null;
  /**
   * Wall-clock time from just before the first submission until the queue reported the work
   * submitted so far finished (work submitted after the batch may or may not be included).
   */
  readonly wallMs: number;
}

/**
 * Allowance when comparing a GPU span with the wall-clock time of the same work: the
 * specification coarsens timestamps to 100 microseconds or more, and performance.now() is
 * coarsened too.
 */
export const WALL_SLACK_MS = 2;

/**
 * The span from `begin` to `end` (nanoseconds) in milliseconds, or null when it cannot be the
 * duration of work that took `wallMs` of wall-clock time: a beginning of 0 (a query that was never
 * written reads 0), an end before the beginning, or longer than that time plus WALL_SLACK_MS.
 * Equal timestamps give 0: Chrome rounds timestamps to steps of 65.536 microseconds, so work
 * shorter than one step reads 0.
 */
export function timestampSpanMs(begin: bigint, end: bigint, wallMs: number): number | null {
  if (begin === 0n || end < begin || !Number.isFinite(wallMs)) return null;
  const ms = Number(end - begin) / 1e6;
  return Number.isFinite(ms) && ms <= wallMs + WALL_SLACK_MS ? ms : null;
}

/** GPUMapMode.READ in the WebGPU specification; this module compiles without WebGPU types. */
const MAP_READ = 0x0001;

/** The calls timeSubmissions makes on a buffer it reads; a GPUBuffer has them. */
export interface ReadableBuffer {
  mapAsync(mode: number): Promise<unknown>;
  getMappedRange(): ArrayBuffer;
  unmap(): unknown;
}

/** The calls timeSubmissions makes on a device; a GPUDevice has them. */
export interface TimingDevice<QuerySet, Buffer, CommandBuffer> {
  readonly queue: {
    submit(commandBuffers: CommandBuffer[]): unknown;
    onSubmittedWorkDone(): Promise<unknown>;
  };
  createCommandEncoder(): {
    resolveQuerySet(
      querySet: QuerySet,
      firstQuery: number,
      queryCount: number,
      destination: Buffer,
      destinationOffset: number,
    ): unknown;
    copyBufferToBuffer(
      source: Buffer,
      sourceOffset: number,
      destination: Buffer,
      destinationOffset: number,
      size: number,
    ): unknown;
    finish(): CommandBuffer;
  };
}

/** A two-entry timestamp query set with its resolve and map-read buffers (16 bytes each). */
export interface TimestampSlots<QuerySet, Buffer> {
  readonly set: QuerySet;
  readonly resolve: Buffer;
  readonly read: Buffer & ReadableBuffer;
}

/**
 * Calls `submit`, which submits work that writes the beginning timestamp at index 0 and the end
 * at index 1 of `slots.set`, waits for the queue to drain, then copies the two timestamps out in
 * a submission of its own and reads them. Without `slots`, only the wall-clock time is measured.
 * `submit` runs before this returns, so work submitted after the call is queued after it.
 */
export async function timeSubmissions<QuerySet, Buffer, CommandBuffer>(
  device: TimingDevice<QuerySet, Buffer, CommandBuffer>,
  slots: TimestampSlots<QuerySet, Buffer> | null,
  submit: () => void,
  now: () => number = () => performance.now(),
): Promise<PassTime> {
  const start = now();
  submit();
  await device.queue.onSubmittedWorkDone();
  const wallMs = now() - start;
  if (!slots) return { gpuMs: null, wallMs };
  const encoder = device.createCommandEncoder();
  encoder.resolveQuerySet(slots.set, 0, 2, slots.resolve, 0);
  encoder.copyBufferToBuffer(slots.resolve, 0, slots.read, 0, 16);
  device.queue.submit([encoder.finish()]);
  await slots.read.mapAsync(MAP_READ);
  try {
    const t = new BigUint64Array(slots.read.getMappedRange());
    return { gpuMs: timestampSpanMs(t[0]!, t[1]!, wallMs), wallMs };
  } finally {
    slots.read.unmap();
  }
}
