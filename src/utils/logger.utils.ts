import { env } from '@config';

/**
 * Application log levels in increasing order of severity:
 * DEBUG -> INFO -> WARN -> ERROR
 */
const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;

type Level = (typeof LOG_LEVELS)[number];

const activeLogLevelIndex = LOG_LEVELS.indexOf(env.logLevel.toUpperCase() as Level);

/**
 * Emits a structured log line to console if the level satisfies the configured threshold.
 *
 * @param level - Log severity level
 * @param source - Component or class name identifier
 * @param message - Primary log message
 * @param metadata - Optional metadata payload
 */
function printMessage(level: Level, source: string, message: string, metadata?: unknown): void {
  const currentLevelIndex = LOG_LEVELS.indexOf(level);
  const cutoffIndex = Math.max(activeLogLevelIndex, 0);

  if (currentLevelIndex < cutoffIndex) {
    return;
  }

  const timestamp = new Date().toISOString();
  const extraDetail = metadata === undefined ? '' : ` ${JSON.stringify(metadata)}`;

  // eslint-disable-next-line no-console
  console.log(`${timestamp} ${level.padEnd(5)} [${source}] ${message}${extraDetail}`);
}

/**
 * Creates a scoped logger instance for a given module or class.
 *
 * @param source - Component identifier displayed in log tags (e.g. 'LoginPage')
 * @returns Scoped logger object exposing debug, info, warn, and error methods
 */
export function logger(source: string) {
  return {
    debug: (message: string, metadata?: unknown) =>
      printMessage('DEBUG', source, message, metadata),
    info: (message: string, metadata?: unknown) => printMessage('INFO', source, message, metadata),
    warn: (message: string, metadata?: unknown) => printMessage('WARN', source, message, metadata),
    error: (message: string, metadata?: unknown) => printMessage('ERROR', source, message, metadata)
  };
}
