/**
 * TASKBAR Deadline Intelligence
 *
 * Pure date helpers.
 * This service does not read/write Firebase, IndexedDB,
 * or any other storage.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Check whether a Date object is valid.
 */
function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/**
 * Convert a TASKBAR deadline value into a Date.
 *
 * TASKBAR commonly stores dates as:
 * YYYY-MM-DD
 *
 * Date-only deadlines are treated as the end of
 * that local calendar day.
 */
function parseDeadline(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  // Handle YYYY-MM-DD safely as a local date.
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnly) {
    const [, year, month, day] = dateOnly;

    const result = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      23,
      59,
      59,
      999
    );

    return isValidDate(result) ? result : null;
  }

  // Handle full date/time values.
  const result = new Date(value);

  return isValidDate(result) ? result : null;
}

/**
 * Get the beginning of the local calendar day.
 */
function startOfLocalDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

/**
 * Calculate difference between two calendar days.
 */
function getCalendarDayDifference(target, now) {
  const targetDay = startOfLocalDay(target);
  const currentDay = startOfLocalDay(now);

  return Math.round(
    (targetDay.getTime() - currentDay.getTime()) / DAY_MS
  );
}

/**
 * Get complete deadline information.
 *
 * Possible statuses:
 *
 * - no-deadline
 * - overdue
 * - today
 * - tomorrow
 * - soon
 * - upcoming
 */
export function getDeadlineInfo(
  value,
  now = new Date()
) {
  const target = parseDeadline(value);

  if (!target || !isValidDate(now)) {
    return {
      hasDeadline: false,
      status: "no-deadline",
      label: "No deadline",
      daysRemaining: null,
      hoursRemaining: null,
      targetDate: null,
    };
  }

  const calendarDays =
    getCalendarDayDifference(
      target,
      now
    );

  const differenceMs =
    target.getTime() -
    now.getTime();

  const hoursRemaining =
    Math.max(
      0,
      Math.ceil(
        differenceMs /
          (60 * 60 * 1000)
      )
    );

  // --------------------------------------------------
  // OVERDUE
  // --------------------------------------------------

  if (differenceMs < 0) {
    const overdueDays =
      Math.abs(calendarDays);

    return {
      hasDeadline: true,
      status: "overdue",
      label: `${overdueDays} day${
        overdueDays === 1
          ? ""
          : "s"
      } overdue`,
      daysRemaining:
        -overdueDays,
      hoursRemaining: 0,
      targetDate: target,
    };
  }

  // --------------------------------------------------
  // DUE TODAY
  // --------------------------------------------------

  if (calendarDays === 0) {
    return {
      hasDeadline: true,
      status: "today",
      label: "Due today",
      daysRemaining: 0,
      hoursRemaining,
      targetDate: target,
    };
  }

  // --------------------------------------------------
  // TOMORROW
  // --------------------------------------------------

  if (calendarDays === 1) {
    return {
      hasDeadline: true,
      status: "tomorrow",
      label: "1 day remaining",
      daysRemaining: 1,
      hoursRemaining,
      targetDate: target,
    };
  }

  // --------------------------------------------------
  // APPROACHING DEADLINE
  // --------------------------------------------------

  if (calendarDays <= 3) {
    return {
      hasDeadline: true,
      status: "soon",
      label: `${calendarDays} days remaining`,
      daysRemaining:
        calendarDays,
      hoursRemaining,
      targetDate: target,
    };
  }

  // --------------------------------------------------
  // NORMAL UPCOMING DEADLINE
  // --------------------------------------------------

  return {
    hasDeadline: true,
    status: "upcoming",
    label: `${calendarDays} days remaining`,
    daysRemaining:
      calendarDays,
    hoursRemaining,
    targetDate: target,
  };
}

/**
 * Check whether a deadline is approaching.
 *
 * Default:
 * A deadline is considered approaching
 * when it is within 3 days and is not overdue.
 */
export function isDeadlineApproaching(
  value,
  days = 3,
  now = new Date()
) {
  const info =
    getDeadlineInfo(
      value,
      now
    );

  return (
    info.hasDeadline &&
    info.status !== "overdue" &&
    info.daysRemaining !== null &&
    info.daysRemaining <= days
  );
}

/**
 * Default export.
 */
export default getDeadlineInfo;