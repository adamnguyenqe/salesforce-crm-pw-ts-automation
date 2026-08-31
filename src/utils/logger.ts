import { env } from '@config';

/**
 * Prints progress messages. Anything below the LOG_LEVEL setting is skipped.
 *   DEBUG — small steps, for investigating
 *   INFO  — normal commentary
 *   WARN  — odd, but we carried on
 *   ERROR — something went wrong
 */

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;

type Level = (typeof LOG_LEVELS)[number];

const minimumLevelToPrint = LOG_LEVELS.indexOf(env.logLevel.toUpperCase() as Level);

function printMessage(level: Level, source: string, message: string, extra?: unknown) {
  const thisLevel = LOG_LEVELS.indexOf(level);

  const cutoff = Math.max(minimumLevelToPrint, 0);
  if (thisLevel < cutoff) {
    return;
  }

  const timestamp = new Date().toISOString();
  const extraDetail = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;

  // eslint-disable-next-line no-console
  console.log(`${timestamp} ${level.padEnd(5)} [${source}] ${message}${extraDetail}`);
}

/**
 * Create a logger for a class or module.
 *
 * @param source - What to show in brackets on each line. Usually the class
 *                 name, e.g. 'LoginPage'
 * @returns An object with debug, info, warn and error methods
 */
export function logger(source: string) {
  return {
    debug: (message: string, extra?: unknown) => printMessage('DEBUG', source, message, extra),
    info: (message: string, extra?: unknown) => printMessage('INFO', source, message, extra),
    warn: (message: string, extra?: unknown) => printMessage('WARN', source, message, extra),
    error: (message: string, extra?: unknown) => printMessage('ERROR', source, message, extra)
  };
}
