import fs from 'node:fs';
import path from 'node:path';
import pino, {
  type Logger,
  type LoggerOptions,
  type TransportTargetOptions,
} from 'pino';
import pretty from 'pino-pretty';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface CreateLoggerOptions {
  name?: string;
  level?: LogLevel;
  logDir?: string;
  logFileName?: string;
  enableFile?: boolean;
  enableConsole?: boolean;
  prettyPrint?: boolean;
  additionalTransports?: Array<{
    target: string;
    options?: Record<string, unknown>;
    level?: LogLevel;
  }>;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const isTest = process.env.NODE_ENV === 'test';
  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

  const {
    name = 'moonwitness',
    level = (process.env.LOG_LEVEL as LogLevel) || (isTest ? 'silent' : 'info'),
    logDir = process.env.LOG_DIR || path.resolve(process.cwd(), 'logs'),
    logFileName = process.env.LOG_FILE_NAME || `${name}.log`,
    enableFile = process.env.LOG_TO_FILE !== 'false' && !isTest,
    enableConsole = isTest ? false : true,
    prettyPrint = isDev,
    additionalTransports = [],
  } = options;

  if (level === 'silent') {
    return pino({ level: 'silent', name });
  }
  const streamLevel = level as pino.Level;

  const streams: pino.StreamEntry[] = [];

  // Console output (in-process, no worker thread)
  if (enableConsole) {
    streams.push({
      level: streamLevel,
      stream: prettyPrint
        ? pretty({
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
            sync: true,
          })
        : process.stdout,
    });
  }

  // File output (enabled by default) — always JSON lines
  if (enableFile) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      streams.push({
        level: streamLevel,
        stream: pino.destination({ dest: path.resolve(logDir, logFileName), sync: true, mkdir: true }),
      });
    } catch {
      // Fail-safe: never crash the app because the log dir is not writable
    }
  }

  // Optional extra worker-based transports (e.g. Loki, Elasticsearch)
  if (additionalTransports.length > 0) {
    const targets: TransportTargetOptions[] = additionalTransports.map((t) => ({
      target: t.target,
      level: t.level || level,
      options: t.options || {},
    }));
    streams.push({ level: streamLevel, stream: pino.transport({ targets }) });
  }

  const pinoOptions: LoggerOptions = {
    name,
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return streams.length > 0 ? pino(pinoOptions, pino.multistream(streams)) : pino(pinoOptions);
}

// Lazily-created shared root logger (avoids side effects on import)
let rootLogger: Logger | undefined;
export function getLogger(): Logger {
  return (rootLogger ??= createLogger());
}

export { pino };
export type { Logger, LoggerOptions };
