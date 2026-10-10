export function coerceDurationMinutes(value: number | string | null | undefined, fallback = 60) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value.replace(/[^\d]/g, ''), 10)
        : Number.NaN;

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.max(1, Math.round(numericValue));
}

export function sanitizeDurationInput(value: string) {
  const digitsOnly = value.replace(/[^\d]/g, '');
  return digitsOnly.replace(/^0+(?=\d)/, '');
}

export function formatDuration(minutes: number) {
  const safeMinutes = coerceDurationMinutes(minutes);

  if (safeMinutes >= 60) {
    const hours = Math.floor(safeMinutes / 60);
    const remainingMinutes = safeMinutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  return `${safeMinutes} min`;
}

export function formatRemainingMinutes(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.ceil(safeSeconds / 60);
  return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
}

export function formatDateLabel(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTimeLabel(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function toDateInputValue(isoString?: string | null) {
  const date = isoString ? new Date(isoString) : new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toTimeInputValue(isoString?: string | null) {
  const date = isoString ? new Date(isoString) : new Date();
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function sanitizeDateInput(value: string) {
  return value.replace(/[^\d-]/g, '').slice(0, 10);
}

export function sanitizeTimeInput(value: string) {
  return value.replace(/[^\d:]/g, '').slice(0, 5);
}

export function combineScheduleInputs(dateInput: string, timeInput: string) {
  const normalizedDate = dateInput.trim();
  const normalizedTime = timeInput.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    throw new Error('Start date must be in YYYY-MM-DD format.');
  }

  if (!/^\d{2}:\d{2}$/.test(normalizedTime)) {
    throw new Error('Start time must be in HH:mm format.');
  }

  const [yearPart, monthPart, dayPart] = normalizedDate.split('-');
  const [hourPart, minutePart] = normalizedTime.split(':');
  const year = Number.parseInt(yearPart ?? '', 10);
  const month = Number.parseInt(monthPart ?? '', 10);
  const day = Number.parseInt(dayPart ?? '', 10);
  const hours = Number.parseInt(hourPart ?? '', 10);
  const minutes = Number.parseInt(minutePart ?? '', 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error('Enter a valid start date and time.');
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

export function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? '')
    .join('');
}
