type MonitoringLevel = 'info' | 'warn' | 'error';

export type MonitoringContext = Record<string, unknown>;

const scrub = (input: unknown): unknown => {
  if (input == null) return input;
  if (typeof input === 'string') {
    if (input.length > 500) return `${input.slice(0, 500)}…`;
    return input;
  }
  if (Array.isArray(input)) return input.slice(0, 20).map(scrub);
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/token|password|secret|authorization|apikey/i.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = scrub(v);
      }
    }
    return out;
  }
  return input;
};

class MonitoringService {
  private log(level: MonitoringLevel, message: string, context?: MonitoringContext) {
    const payload = context ? scrub(context) : undefined;
    const prefix = `[monitoring:${level}] ${message}`;
    if (level === 'error') {
      console.error(prefix, payload ?? '');
    } else if (level === 'warn') {
      console.warn(prefix, payload ?? '');
    } else if (__DEV__) {
      console.log(prefix, payload ?? '');
    }
  }

  info(message: string, context?: MonitoringContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: MonitoringContext) {
    this.log('warn', message, context);
  }

  error(message: string, error?: unknown, context?: MonitoringContext) {
    const err =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error;
    this.log('error', message, { ...context, error: err });
  }
}

export const monitoringService = new MonitoringService();
