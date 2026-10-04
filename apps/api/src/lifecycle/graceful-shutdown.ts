export interface GracefulShutdownTarget {
  close(): Promise<void>;
  closeConnections(): void;
  log(level: 'info' | 'error', message: string): void;
}

export async function gracefulShutdown(
  target: GracefulShutdownTarget,
  signal: NodeJS.Signals,
  timeoutMs = 30_000
): Promise<void> {
  target.log('info', `Graceful shutdown started after ${signal}`);
  const forceClose = setTimeout(() => {
    target.log('error', `Graceful shutdown exceeded ${timeoutMs} ms; closing active connections`);
    target.closeConnections();
  }, timeoutMs);
  forceClose.unref();
  try {
    await target.close();
    target.log('info', 'Graceful shutdown complete');
  } finally {
    clearTimeout(forceClose);
  }
}
