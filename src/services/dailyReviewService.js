/**
 * TASKBAR - Daily Review Service
 *
 * Builds the Daily Review from the existing TASKBAR data.
 *
 * Important:
 * - This service only reads the data passed to it.
 * - It does not write to Firebase, IndexedDB, or any other storage.
 * - Date matching follows the actual field names used by TASKBAR.
 */

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  /*
   * TASKBAR commonly stores date inputs as YYYY-MM-DD.
   * Parse those as LOCAL dates so timezone conversion cannot move
   * them to the previous/next calendar day.
   */
  const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch.map(Number);
    const localDate = new Date(year, month - 1, day);

    return Number.isNaN(localDate.getTime())
      ? null
      : localDate;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toDateKey(value) {
  const date = normalizeDate(value);

  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayKey(today = new Date()) {
  return toDateKey(today);
}

/* ============================================================
   COMPLETION HELPERS
============================================================ */

function hasCompletedStatus(status) {
  if (typeof status !== "string") {
    return false;
  }

  return [
    "completed",
    "complete",
    "done",
    "passed",
    "selected",
  ].includes(status.trim().toLowerCase());
}

function isCompleted(item) {
  if (!item || typeof item !== "object") {
    return false;
  }

  if (
    item.completed === true ||
    item.isCompleted === true ||
    item.done === true
  ) {
    return true;
  }

  if (hasCompletedStatus(item.status)) {
    return true;
  }

  return false;
}

/*
 * Activities are logs of something the user actually did.
 * Unlike tasks/assessments/timetable entries, an activity record
 * does not normally contain a completed flag. Therefore an
 * activity recorded for today counts as completed activity.
 */
function isActivityCompleted(item) {
  if (!item || typeof item !== "object") {
    return false;
  }

  if (
    item.completed !== undefined ||
    item.isCompleted !== undefined ||
    item.done !== undefined ||
    item.status !== undefined
  ) {
    return isCompleted(item);
  }

  return true;
}

function isApplicationCompleted(item) {
  if (!item) {
    return false;
  }

  if (isCompleted(item)) {
    return true;
  }

  const status = String(item.status || "")
    .trim()
    .toLowerCase();

  /*
   * These are terminal application states in TASKBAR.
   * "Applied" and "Interview" are still active/pending states.
   */
  return status === "selected" || status === "rejected";
}

function isInterviewCompleted(item) {
  if (!item) {
    return false;
  }

  if (isCompleted(item)) {
    return true;
  }

  const status = String(item.status || "")
    .trim()
    .toLowerCase();

  return [
    "completed",
    "passed",
    "failed",
    "cancelled",
    "canceled",
  ].includes(status);
}

/* ============================================================
   DATE MATCHING
============================================================ */

function matchesAnyDate(item, todayKey, fields) {
  if (!item || !todayKey) {
    return false;
  }

  return fields.some(
    (field) => toDateKey(item?.[field]) === todayKey
  );
}

/*
 * These fields match the actual TASKBAR data models:
 *
 * todoList:
 *   date / dueDate
 *
 * topics:
 *   plannedDate
 *
 * goals:
 *   targetDate
 *
 * assessments:
 *   date
 *
 * timetable:
 *   date
 *
 * applications:
 *   appliedDate
 *
 * interviews:
 *   date
 *
 * activities:
 *   date
 */
function matchesCollectionDate(
  item,
  todayKey,
  collectionType
) {
  const fieldsByType = {
    tasks: ["date", "dueDate"],
    learning: ["plannedDate", "date"],
    goals: ["targetDate", "date"],
    assessments: ["date", "assessmentDate"],
    timetable: ["date", "scheduledDate"],
    applications: ["appliedDate", "date"],
    interviews: ["date", "interviewDate"],
    activities: ["date"],
  };

  const fields =
    fieldsByType[collectionType] || ["date"];

  return matchesAnyDate(
    item,
    todayKey,
    fields
  );
}

/* ============================================================
   COLLECTION SUMMARY
============================================================ */

function summarizeCollection(
  items,
  todayKey,
  collectionType
) {
  const list = Array.isArray(items) ? items : [];

  const todayItems = list.filter((item) =>
    matchesCollectionDate(
      item,
      todayKey,
      collectionType
    )
  );

  let completed = 0;

  todayItems.forEach((item) => {
    let itemCompleted = false;

    if (collectionType === "activities") {
      itemCompleted = isActivityCompleted(item);
    } else if (collectionType === "applications") {
      itemCompleted = isApplicationCompleted(item);
    } else if (collectionType === "interviews") {
      itemCompleted = isInterviewCompleted(item);
    } else if (collectionType === "learning") {
      itemCompleted =
        String(item?.status || "")
          .trim()
          .toLowerCase() === "completed";
    } else if (collectionType === "goals") {
      itemCompleted =
        String(item?.status || "")
          .trim()
          .toLowerCase() === "completed";
    } else if (collectionType === "assessments") {
      itemCompleted =
        String(item?.status || "")
          .trim()
          .toLowerCase() === "completed" ||
        String(item?.status || "")
          .trim()
          .toLowerCase() === "complete";
    } else if (collectionType === "timetable") {
      itemCompleted =
        String(item?.status || "")
          .trim()
          .toLowerCase() === "completed";
    } else {
      itemCompleted = isCompleted(item);
    }

    if (itemCompleted) {
      completed += 1;
    }
  });

  const pending = Math.max(
    0,
    todayItems.length - completed
  );

  return {
    total: todayItems.length,
    completed,
    pending,
  };
}

function calculatePercentage(
  completed,
  total
) {
  if (!total) {
    return 0;
  }

  return Math.round(
    (completed / total) * 100
  );
}

/* ============================================================
   STUDY TIME
============================================================ */

function getStudySessionMinutes(session) {
  if (!session || typeof session !== "object") {
    return 0;
  }

  /*
   * Focus Mode stores elapsedSeconds.
   * Use it when available because it represents the actual
   * time spent, rather than the planned 50-minute duration.
   */
  const elapsedSeconds = Number(
    session.elapsedSeconds
  );

  if (
    Number.isFinite(elapsedSeconds) &&
    elapsedSeconds > 0
  ) {
    return elapsedSeconds / 60;
  }

  const minutes = Number(
    session.duration ??
      session.durationMinutes ??
      session.minutes ??
      session.studyTime ??
      session.time ??
      0
  );

  return Number.isFinite(minutes)
    ? Math.max(0, minutes)
    : 0;
}

function getStudyData(
  studySessions,
  todayKey
) {
  const sessions = Array.isArray(
    studySessions
  )
    ? studySessions
    : [];

  const todayStudySessions =
    sessions.filter((session) =>
      matchesAnyDate(
        session,
        todayKey,
        ["date", "sessionDate"]
      )
    );

  const rawMinutes =
    todayStudySessions.reduce(
      (total, session) =>
        total +
        getStudySessionMinutes(session),
      0
    );

  const minutes = Math.round(
    Math.max(0, rawMinutes)
  );

  return {
    sessionCount:
      todayStudySessions.length,

    minutes,

    hours:
      Math.round(
        (minutes / 60) * 10
      ) / 10,
  };
}

/* ============================================================
   CREATE DAILY REVIEW
============================================================ */

/**
 * Create a daily review from existing TASKBAR data.
 *
 * Expected input:
 *
 * {
 *   tasks,
 *   learning,
 *   goals,
 *   assessments,
 *   timetable,
 *   applications,
 *   interviews,
 *   studySessions,
 *   activities,
 *   today
 * }
 */
export function createDailyReview(
  data = {}
) {
  const todayKey = getTodayKey(
    data.today || new Date()
  );

  const tasks = summarizeCollection(
    data.tasks,
    todayKey,
    "tasks"
  );

  const learning = summarizeCollection(
    data.learning,
    todayKey,
    "learning"
  );

  const goals = summarizeCollection(
    data.goals,
    todayKey,
    "goals"
  );

  const assessments = summarizeCollection(
    data.assessments,
    todayKey,
    "assessments"
  );

  const timetable = summarizeCollection(
    data.timetable,
    todayKey,
    "timetable"
  );

  const applications = summarizeCollection(
    data.applications,
    todayKey,
    "applications"
  );

  const interviews = summarizeCollection(
    data.interviews,
    todayKey,
    "interviews"
  );

  const activities = summarizeCollection(
    data.activities,
    todayKey,
    "activities"
  );

  const study = getStudyData(
    data.studySessions,
    todayKey
  );

  const totalTrackedItems =
    tasks.total +
    learning.total +
    goals.total +
    assessments.total +
    timetable.total +
    applications.total +
    interviews.total +
    activities.total;

  const completedItems =
    tasks.completed +
    learning.completed +
    goals.completed +
    assessments.completed +
    timetable.completed +
    applications.completed +
    interviews.completed +
    activities.completed;

  const pendingItems = Math.max(
    0,
    totalTrackedItems - completedItems
  );

  return {
    date: todayKey,

    tasks,
    learning,
    goals,
    assessments,
    timetable,
    applications,
    interviews,
    activities,

    study,

    overall: {
      total: totalTrackedItems,

      completed: completedItems,

      pending: pendingItems,

      completionPercentage:
        calculatePercentage(
          completedItems,
          totalTrackedItems
        ),
    },
  };
}

/* ============================================================
   FORMAT STUDY TIME
============================================================ */

/**
 * Convert study minutes into a readable format.
 *
 * Examples:
 * 30  -> "30 min"
 * 60  -> "1 hr"
 * 90  -> "1 hr 30 min"
 */
export function formatStudyTime(
  minutes = 0
) {
  const value = Math.max(
    0,
    Number(minutes) || 0
  );

  const roundedValue = Math.round(value);
  const hours = Math.floor(
    roundedValue / 60
  );
  const remainingMinutes =
    roundedValue % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

export default createDailyReview;
