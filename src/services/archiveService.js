// src/services/archiveService.js

const DAY_MS = 24 * 60 * 60 * 1000;

/*
 * TASKBAR ARCHIVE RETENTION
 *
 * Archived items are retained for 50 days.
 */
export const ARCHIVE_RETENTION_DAYS = 50;

/**
 * Convert a value into a valid Date.
 */
function toValidDate(value) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Calculate how many days an archived item
 * has been stored.
 */
function getAgeInDays(item, now = new Date()) {
  if (!item) {
    return 0;
  }

  const archiveDate = toValidDate(
    item.archivedAt
  );

  const currentDate = toValidDate(now);

  if (!archiveDate || !currentDate) {
    return 0;
  }

  return Math.floor(
    Math.max(
      0,
      currentDate.getTime() -
        archiveDate.getTime()
    ) / DAY_MS
  );
}

/**
 * Check whether an archived item has exceeded
 * the 50-day retention period.
 */
export function isArchiveExpired(
  item,
  now = new Date()
) {
  const age = getAgeInDays(
    item,
    now
  );

  return age >= ARCHIVE_RETENTION_DAYS;
}

/**
 * Add archive metadata to an item.
 *
 * This creates a new object and does not mutate
 * the original active item.
 */
export function createArchiveItem(
  item,
  now = new Date()
) {
  if (
    !item ||
    typeof item !== "object"
  ) {
    return null;
  }

  const validNow =
    toValidDate(now);

  const archivedAt =
    validNow
      ? validNow.toISOString()
      : new Date().toISOString();

  return {
    ...item,
    archived: true,
    archivedAt,
  };
}

/**
 * Remove archive items that are 50 days old
 * or older from an array.
 *
 * This function does NOT delete anything from
 * Firebase or IndexedDB.
 *
 * It only returns the retained items.
 */
export function cleanupArchive(
  items = [],
  now = new Date()
) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter(
    (item) =>
      !isArchiveExpired(
        item,
        now
      )
  );
}

/**
 * Get currently retained archive items.
 */
export function getActiveArchive(
  items = [],
  now = new Date()
) {
  return cleanupArchive(
    items,
    now
  );
}

/**
 * Get the age of an archived item
 * in days.
 */
export function getArchiveAge(
  item,
  now = new Date()
) {
  return getAgeInDays(
    item,
    now
  );
}

/**
 * Get the number of days remaining
 * before the 50-day retention period ends.
 */
export function getArchiveDaysRemaining(
  item,
  now = new Date()
) {
  return Math.max(
    0,
    ARCHIVE_RETENTION_DAYS -
      getAgeInDays(
        item,
        now
      )
  );
}

/**
 * Default export.
 */
export default {
  ARCHIVE_RETENTION_DAYS,
  createArchiveItem,
  cleanupArchive,
  getActiveArchive,
  getArchiveAge,
  getArchiveDaysRemaining,
  isArchiveExpired,
};