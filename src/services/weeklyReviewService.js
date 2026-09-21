/**
 * TASKBAR - Weekly Review Service
 *
 * Creates a weekly summary from data that is already loaded by TASKBAR.
 *
 * IMPORTANT:
 * - No Firebase writes.
 * - No IndexedDB writes.
 * - No new database or collection.
 * - No changes to existing data.
 */

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value) {
  const date = normalizeDate(value);

  if (!date) {
    return null;
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function endOfDay(value) {
  const date = normalizeDate(value);

  if (!date) {
    return null;
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

function startOfWeek(value) {
  const date = startOfDay(value || new Date());

  if (!date) {
    return null;
  }

  const day = date.getDay();

  // Monday = first day of the week.
  const difference = day === 0 ? -6 : 1 - day;

  date.setDate(date.getDate() + difference);

  return date;
}

function endOfWeek(value) {
  const start = startOfWeek(value);

  if (!start) {
    return null;
  }

  const end = new Date(start);

  end.setDate(end.getDate() + 6);

  return endOfDay(end);
}

function isWithinWeek(value, weekStart, weekEnd) {
  const date = normalizeDate(value);

  if (!date || !weekStart || !weekEnd) {
    return false;
  }

  return (
    date.getTime() >= weekStart.getTime() &&
    date.getTime() <= weekEnd.getTime()
  );
}

function getPossibleDates(item) {
  if (!item || typeof item !== "object") {
    return [];
  }

  return [
    item.date,
    item.plannedDate,
    item.targetDate,
    item.dueDate,
    item.followUpDate,
    item.actionDate,
    item.createdAt,
  ].filter(Boolean);
}

function itemBelongsToWeek(
  item,
  weekStart,
  weekEnd
) {
  return getPossibleDates(item).some(
    (value) =>
      isWithinWeek(
        value,
        weekStart,
        weekEnd
      )
  );
}

/**
 * General completion rule.
 *
 * Used for:
 * - Tasks
 * - Learning
 * - Goals
 * - Assessments
 * - Timetable
 * - Applications
 * - Interviews
 */
function isCompleted(item) {
  return Boolean(
    item?.completed ??
      item?.isCompleted ??
      item?.done ??
      item?.status === "completed"
  );
}

/**
 * Activity completion rule.
 *
 * An activity is a logged/recorded activity.
 *
 * Activities may not contain:
 * - completed
 * - isCompleted
 * - done
 * - status: "completed"
 *
 * Therefore, if an activity has a valid activity date,
 * createdAt, or completedAt, it counts as a recorded
 * activity for the weekly review.
 */
function isActivityCompleted(activity) {
  if (!activity || typeof activity !== "object") {
    return false;
  }

  return Boolean(
    activity.date ||
      activity.createdAt ||
      activity.completedAt
  );
}

function summarizeCollection(
  items,
  weekStart,
  weekEnd
) {
  const list = Array.isArray(items)
    ? items
    : [];

  const weeklyItems = list.filter(
    (item) =>
      itemBelongsToWeek(
        item,
        weekStart,
        weekEnd
      )
  );

  const completed =
    weeklyItems.filter(
      isCompleted
    ).length;

  return {
    total: weeklyItems.length,
    completed,
    pending: Math.max(
      0,
      weeklyItems.length - completed
    ),
  };
}

/**
 * Activity-specific weekly summary.
 *
 * Every logged activity counts as completed.
 */
function summarizeActivities(
  items,
  weekStart,
  weekEnd
) {
  const list = Array.isArray(items)
    ? items
    : [];

  const weeklyItems = list.filter(
    (item) =>
      itemBelongsToWeek(
        item,
        weekStart,
        weekEnd
      )
  );

  const completed =
    weeklyItems.filter(
      isActivityCompleted
    ).length;

  return {
    total: weeklyItems.length,
    completed,
    pending: Math.max(
      0,
      weeklyItems.length - completed
    ),
  };
}

function percentage(
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

function getStudyMinutes(session) {
  const value = Number(
    session?.duration ??
      session?.durationMinutes ??
      session?.minutes ??
      session?.studyTime ??
      0
  );

  return Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function formatDate(date) {
  if (!date) {
    return "";
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

/**
 * Creates a weekly review.
 *
 * Expected data:
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
export function createWeeklyReview(
  data = {}
) {
  const referenceDate =
    data.today || new Date();

  const weekStart =
    startOfWeek(referenceDate);

  const weekEnd =
    endOfWeek(referenceDate);

  const tasks =
    summarizeCollection(
      data.tasks,
      weekStart,
      weekEnd
    );

  const learning =
    summarizeCollection(
      data.learning,
      weekStart,
      weekEnd
    );

  const goals =
    summarizeCollection(
      data.goals,
      weekStart,
      weekEnd
    );

  const assessments =
    summarizeCollection(
      data.assessments,
      weekStart,
      weekEnd
    );

  const timetable =
    summarizeCollection(
      data.timetable,
      weekStart,
      weekEnd
    );

  const applications =
    summarizeCollection(
      data.applications,
      weekStart,
      weekEnd
    );

  const interviews =
    summarizeCollection(
      data.interviews,
      weekStart,
      weekEnd
    );

  /**
   * IMPORTANT:
   * Activities use their own completion rule.
   */
  const activities =
    summarizeActivities(
      data.activities,
      weekStart,
      weekEnd
    );

  const studySessions =
    Array.isArray(
      data.studySessions
    )
      ? data.studySessions
      : [];

  const weeklyStudySessions =
    studySessions.filter(
      (session) =>
        itemBelongsToWeek(
          session,
          weekStart,
          weekEnd
        )
    );

  const studyMinutes =
    weeklyStudySessions.reduce(
      (total, session) =>
        total +
        getStudyMinutes(session),
      0
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

  const pendingItems =
    Math.max(
      0,
      totalTrackedItems -
        completedItems
    );

  return {
    weekStart:
      formatDate(weekStart),

    weekEnd:
      formatDate(weekEnd),

    weekStartDate:
      weekStart,

    weekEndDate:
      weekEnd,

    tasks,
    learning,
    goals,
    assessments,
    timetable,
    applications,
    interviews,
    activities,

    study: {
      sessionCount:
        weeklyStudySessions.length,

      minutes:
        studyMinutes,

      hours:
        Math.round(
          (studyMinutes / 60) * 10
        ) / 10,
    },

    overall: {
      total:
        totalTrackedItems,

      completed:
        completedItems,

      pending:
        pendingItems,

      completionPercentage:
        percentage(
          completedItems,
          totalTrackedItems
        ),
    },
  };
}

/**
 * Convert study minutes into
 * a readable format.
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

  const hours =
    Math.floor(value / 60);

  const remainingMinutes =
    value % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

export default createWeeklyReview;