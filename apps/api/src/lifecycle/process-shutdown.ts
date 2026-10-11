export type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export interface ProcessShutdownController {
  signal: AbortSignal;
  dispose(): void;
}

/** Connect process termination signals to the abort signal consumed by long-running loops. */
export function createProcessShutdownController(
  onStopping: () => void = () => undefined
): ProcessShutdownController {
  const controller = new AbortController();
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    onStopping();
    controller.abort();
  };
  const signals: ShutdownSignal[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) process.once(signal, stop);

  return {
    signal: controller.signal,
    dispose() {
      for (const signal of signals) process.removeListener(signal, stop);
    },
  };
}
