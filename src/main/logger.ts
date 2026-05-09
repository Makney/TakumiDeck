import log from 'electron-log/main';

// Globaler Logger für den Main-Prozess.
// Schreibt in <userData>/logs/main.log, parallel auf stdout im Dev-Mode.
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.transports.file.maxSize = 5 * 1024 * 1024;

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export const logger: Logger = log;
