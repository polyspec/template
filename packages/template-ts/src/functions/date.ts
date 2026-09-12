// date and now (FUN-37 to FUN-42).
import { isString, textOf, type Value } from '../value/value.js';
import { argString, typeError, type BuiltIn, type FunctionContext } from './helpers.js';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Offset in seconds of `Z` or `±HH:MM`, or null when the text is not an offset.
export function parseOffset(text: string): number | null {
  if (text === 'Z') return 0;
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return null;
  return sign * (hours * 3600 + minutes * 60);
}

// Days since 1970-01-01 of a proleptic Gregorian date.
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/;

// Unix seconds of a date value (FUN-37).
export function toUnixSeconds(value: Value, envOffset: number): number {
  if (typeof value === 'number') return Math.trunc(value);
  if (isString(value)) {
    const match = DATE_TEXT.exec(textOf(value));
    if (!match) throw typeError(`${JSON.stringify(textOf(value))} is not a date`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = match[4] === undefined ? 0 : Number(match[4]);
    const minute = match[5] === undefined ? 0 : Number(match[5]);
    const second = match[6] === undefined ? 0 : Number(match[6]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
      throw typeError(`${JSON.stringify(textOf(value))} is not a date`);
    }
    const offset = match[7] === undefined ? envOffset : (parseOffset(match[7]) as number);
    return daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offset;
  }
  throw typeError('date requires a number or a string');
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function formatDate(seconds: number, format: string, offset: number): string {
  const local = seconds + offset;
  const days = Math.floor(local / 86400);
  const secondOfDay = local - days * 86400;
  const { year, month, day } = civilFromDays(days);
  const hour = Math.floor(secondOfDay / 3600);
  const minute = Math.floor((secondOfDay % 3600) / 60);
  const second = secondOfDay % 60;
  const weekday = ((days % 7) + 11) % 7; // 1970-01-01 is a Thursday (4).
  const sign = offset < 0 ? '-' : '+';
  const absOffset = Math.abs(offset);
  let result = '';
  for (let i = 0; i < format.length; i++) {
    const char = format[i] as string;
    switch (char) {
      case '\\': result += format[i + 1] ?? ''; i++; break;
      case 'Y': result += pad(year, 4); break;
      case 'y': result += pad(year % 100, 2); break;
      case 'm': result += pad(month, 2); break;
      case 'n': result += String(month); break;
      case 'd': result += pad(day, 2); break;
      case 'j': result += String(day); break;
      case 'H': result += pad(hour, 2); break;
      case 'G': result += String(hour); break;
      case 'i': result += pad(minute, 2); break;
      case 's': result += pad(second, 2); break;
      case 'D': result += DAY_SHORT[weekday] as string; break;
      case 'l': result += DAY_LONG[weekday] as string; break;
      case 'N': result += String(weekday === 0 ? 7 : weekday); break;
      case 'w': result += String(weekday); break;
      case 'M': result += MONTH_SHORT[month - 1] as string; break;
      case 'F': result += MONTH_LONG[month - 1] as string; break;
      case 'U': result += String(seconds); break;
      case 'P': result += `${sign}${pad(Math.floor(absOffset / 3600), 2)}:${pad(Math.floor((absOffset % 3600) / 60), 2)}`; break;
      default: result += char;
    }
  }
  return result;
}

function envOffset(context: FunctionContext): number {
  const offset = parseOffset(context.env.timezone);
  if (offset === null) throw typeError(`${JSON.stringify(context.env.timezone)} is not a time zone offset`);
  return offset;
}

export const dateFunctions: Record<string, BuiltIn> = {
  date: {
    min: 2,
    max: 2,
    call: ([v, fmt], context) => {
      if (v === null) return '';
      const offset = envOffset(context);
      return formatDate(toUnixSeconds(v as Value, offset), argString(fmt as Value, 'date'), offset);
    },
  },
  now: { min: 0, max: 0, call: (_args, context) => context.env.now },
};
