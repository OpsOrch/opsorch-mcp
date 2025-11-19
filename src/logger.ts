const LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const;

export type LogLevel = keyof typeof LEVEL_ORDER;

type Metadata = Record<string, unknown> | undefined;

function parseLogLevel(value: string | undefined): LogLevel {
  if (!value) {
    return 'info';
  }

  const normalized = value.toLowerCase();
  if (normalized in LEVEL_ORDER) {
    return normalized as LogLevel;
  }

  return 'info';
}

const currentLevel = parseLogLevel(process.env.OPSORCH_LOG_LEVEL);

function serializeMetadata(metadata: Metadata): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return '';
  }

  const serialized = JSON.stringify(metadata, (_key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    return value;
  });

  return serialized ? ` ${serialized}` : '';
}

function log(level: LogLevel, message: string, metadata?: Metadata): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) {
    return;
  }

  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${serializeMetadata(metadata)}`;

  if (level === 'warn') {
    console.warn(line);
  } else if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, metadata?: Metadata) => log('debug', message, metadata),
  info: (message: string, metadata?: Metadata) => log('info', message, metadata),
  warn: (message: string, metadata?: Metadata) => log('warn', message, metadata),
  error: (message: string, metadata?: Metadata) => log('error', message, metadata),
  level: currentLevel,
};
