type LogContext = Record<string, unknown> | undefined;

function canUseConsole() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function sanitizeContext(context?: LogContext) {
  if (!context) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      if (value instanceof Error) {
        return [key, value.message];
      }

      return [key, value];
    }),
  );
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

export function logInfo(message: string, context?: LogContext) {
  if (!canUseConsole()) {
    return;
  }

  console.log(message, sanitizeContext(context));
}

export function logWarn(message: string, context?: LogContext) {
  if (!canUseConsole()) {
    return;
  }

  console.warn(message, sanitizeContext(context));
}

export function logError(message: string, error?: unknown, context?: LogContext) {
  if (!canUseConsole()) {
    return;
  }

  console.error(message, {
    ...sanitizeContext(context),
    ...(error ? { error: sanitizeError(error) } : {}),
  });
}
