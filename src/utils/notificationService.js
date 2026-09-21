// ============================================================
// TASKBAR - SMART NOTIFICATION SERVICE
// ============================================================
// Purpose:
// - Keep all intelligent notification logic in ONE place.
// - Use actual TASKBAR data.
// - Generate up to 5 useful notifications per day.
// - Keep manual reminders separate.
// - Personalize messages with the user's profile name.
// - Prefer important tasks/deadlines over generic motivation.
// - Use LOCAL dates, never UTC.
// - Keep notifications calm, useful, short, and encouraging.
// ============================================================

import { LocalNotifications } from "@capacitor/local-notifications";

import {
  getItemsFromFirestore,
} from "../firebase/firestore";

import {
  getTodayLocalDateKey,
  diffInLocalDays,
} from "./calculations";

// ============================================================
// CONFIGURATION
// ============================================================

const STORAGE_KEY = "taskbar-smart-notification-state";

const MAX_NOTIFICATIONS_PER_DAY = 5;

// Five daily notification opportunities.
const DAILY_WINDOWS = [
  {
    key: "morning",
    hour: 8,
    minute: 30,
  },
  {
    key: "late-morning",
    hour: 11,
    minute: 0,
  },
  {
    key: "afternoon",
    hour: 14,
    minute: 0,
  },
  {
    key: "evening",
    hour: 18,
    minute: 0,
  },
  {
    key: "night",
    hour: 20,
    minute: 0,
  },
];

// Notification IDs are kept away from manual reminder IDs.
const SMART_NOTIFICATION_BASE_ID = 700000;

// ============================================================
// BASIC HELPERS
// ============================================================

function isNativeApp() {
  try {
    return Boolean(
      typeof window !== "undefined" &&
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === "function" &&
        window.Capacitor.isNativePlatform()
    );
  } catch {
    return false;
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return number;
}

function getDateKey(value) {
  if (!value) return null;

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return null;
}

function isCompleted(item) {
  if (!item) return false;

  return (
    item.completed === true ||
    item.isCompleted === true ||
    item.done === true ||
    item.status === "completed" ||
    item.status === "Completed" ||
    item.status === "done"
  );
}

function isPending(item) {
  return !isCompleted(item);
}

// ============================================================
// SETTINGS
// ============================================================

async function getSettings() {
  try {
    const settings = await getItemsFromFirestore("settings");

    if (Array.isArray(settings)) {
      return settings[0] || {};
    }

    if (settings && typeof settings === "object") {
      return settings;
    }

    return {};
  } catch {
    return {};
  }
}

async function areSmartNotificationsEnabled() {
  try {
    const settings = await getSettings();

    return settings?.remindersEnabled !== false;
  } catch {
    return true;
  }
}

function getProfileName(profile) {
  if (!profile) return "";

  const possibleNames = [
    profile.name,
    profile.fullName,
    profile.displayName,
    profile.username,
    profile.firstName,
  ];

  for (const value of possibleNames) {
    if (typeof value === "string" && value.trim()) {
      return value.trim().split(" ")[0];
    }
  }

  return "";
}

// ============================================================
// SMART NOTIFICATION STATE
// ============================================================

function getNotificationState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {
        date: getTodayLocalDateKey(),
        scheduled: [],
        sent: [],
      };
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      parsed.date !== getTodayLocalDateKey()
    ) {
      return {
        date: getTodayLocalDateKey(),
        scheduled: [],
        sent: [],
      };
    }

    return {
      date: parsed.date,
      scheduled: safeArray(parsed.scheduled),
      sent: safeArray(parsed.sent),
    };
  } catch {
    return {
      date: getTodayLocalDateKey(),
      scheduled: [],
      sent: [],
    };
  }
}

function saveNotificationState(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        date: getTodayLocalDateKey(),
        scheduled: safeArray(state.scheduled),
        sent: safeArray(state.sent),
      })
    );
  } catch {
    // Notification state must never break TASKBAR.
  }
}

function hasSentToday(key) {
  if (!key) return false;

  return getNotificationState().sent.includes(key);
}

function markScheduled(key) {
  if (!key) return;

  const state = getNotificationState();

  if (!state.scheduled.includes(key)) {
    state.scheduled.push(key);
  }

  saveNotificationState(state);
}

function unmarkScheduled(key) {
  if (!key) return;

  const state = getNotificationState();

  state.scheduled = state.scheduled.filter(
    (item) => item !== key
  );

  saveNotificationState(state);
}

function markSent(key) {
  if (!key) return;

  const state = getNotificationState();

  state.scheduled = state.scheduled.filter(
    (item) => item !== key
  );

  if (!state.sent.includes(key)) {
    state.sent.push(key);
  }

  saveNotificationState(state);
}

async function syncDeliveredSmartNotifications() {
  if (!isNativeApp()) return;

  try {
    const delivered =
      await LocalNotifications.getDeliveredNotifications();

    for (const notification of safeArray(delivered?.notifications)) {
      if (
        notification?.extra?.type ===
        "taskbar-smart-notification"
      ) {
        markSent(
          notification?.extra?.eventKey
        );
      }
    }
  } catch (error) {
    console.error(
      "TASKBAR smart notification delivery sync error:",
      error
    );
  }
}

let smartNotificationListenerRegistered = false;
let smartNotificationListenerPromise = null;

function registerSmartNotificationListener() {
  if (!isNativeApp()) return null;

  if (smartNotificationListenerRegistered) {
    return smartNotificationListenerPromise;
  }

  smartNotificationListenerPromise = LocalNotifications.addListener(
    "localNotificationReceived",
    (notification) => {
      if (
        notification?.extra?.type ===
        "taskbar-smart-notification"
      ) {
        markSent(
          notification?.extra?.eventKey
        );
      }
    }
  );

  smartNotificationListenerRegistered = true;

  return smartNotificationListenerPromise;
}

// ============================================================
// NOTIFICATION ID
// ============================================================

function getSmartNotificationId(windowKey, dateKey) {
  let hash = 0;

  const value = `${windowKey}-${dateKey}`;

  for (let i = 0; i < value.length; i += 1) {
    hash =
      (hash << 5) -
      hash +
      value.charCodeAt(i);

    hash |= 0;
  }

  return (
    SMART_NOTIFICATION_BASE_ID +
    Math.abs(hash % 100000)
  );
}

// ============================================================
// PERMISSION
// ============================================================

export async function requestSmartNotificationPermission() {
  if (!isNativeApp()) {
    return {
      granted: false,
      native: false,
    };
  }

  try {
    let permission =
      await LocalNotifications.checkPermissions();

    if (permission.display !== "granted") {
      permission =
        await LocalNotifications.requestPermissions();
    }

    return {
      granted:
        permission.display === "granted",
      native: true,
    };
  } catch (error) {
    console.error(
      "TASKBAR smart notification permission error:",
      error
    );

    return {
      granted: false,
      native: true,
    };
  }
}

// ============================================================
// FIRESTORE HELPERS
// ============================================================

async function getCollection(collectionName) {
  try {
    const items =
      await getItemsFromFirestore(
        collectionName
      );

    return safeArray(items);
  } catch (error) {
    console.error(
      `TASKBAR smart notification Firestore read failed: ${collectionName}`,
      error
    );

    return [];
  }
}

async function getSingleProfile() {
  try {
    const profileItems =
      await getCollection("profile");

    if (profileItems.length === 0) {
      return null;
    }

    const profile = profileItems[0];

    if (
      profile &&
      typeof profile === "object" &&
      profile.profile &&
      typeof profile.profile === "object"
    ) {
      return {
        ...profile.profile,
        ...profile,
      };
    }

    return profile;
  } catch {
    return null;
  }
}

// ============================================================
// LOAD ALL TASKBAR DATA
// ============================================================

async function loadTaskbarData() {
  const [
    profile,
    topics,
    goals,
    water,
    activities,
    assessments,
    todoList,
    studySessions,
    jobPreparation,
    applications,
    savedJobs,
    interviews,
    income,
    expenses,
    budgets,
    timetable,
    reminders,
  ] = await Promise.all([
    getSingleProfile(),
    getCollection("topics"),
    getCollection("goals"),
    getCollection("water"),
    getCollection("activities"),
    getCollection("assessments"),
    getCollection("todoList"),
    getCollection("studySessions"),
    getCollection("jobPreparation"),
    getCollection("applications"),
    getCollection("savedJobs"),
    getCollection("interviews"),
    getCollection("income"),
    getCollection("expenses"),
    getCollection("budget"),
    getCollection("timetable"),
    getCollection("reminders"),
  ]);

  return {
    profile,
    topics,
    goals,
    water,
    activities,
    assessments,
    todoList,
    studySessions,
    timetable,
    reminders,

    career: {
      jobPreparation,
      applications,
      savedJobs,
      interviews,
    },

    finance: {
      income,
      expenses,
      budgets,
    },
  };
}

// ============================================================
// TODAY DATA HELPERS
// ============================================================

function getTodayItems(
  items,
  possibleDateFields = []
) {
  const today =
    getTodayLocalDateKey();

  return safeArray(items).filter((item) => {
    for (
      const field of possibleDateFields
    ) {
      const dateKey =
        getDateKey(item?.[field]);

      if (dateKey === today) {
        return true;
      }
    }

    return false;
  });
}

function getOverdueItems(
  items,
  possibleDateFields = []
) {
  const today =
    getTodayLocalDateKey();

  return safeArray(items).filter((item) => {
    if (isCompleted(item)) {
      return false;
    }

    for (
      const field of possibleDateFields
    ) {
      const dateKey =
        getDateKey(item?.[field]);

      if (!dateKey) {
        continue;
      }

      try {
        return (
          diffInLocalDays(
            dateKey,
            today
          ) > 0
        );
      } catch {
        return false;
      }
    }

    return false;
  });
}

function getUpcomingItems(
  items,
  possibleDateFields = [],
  days = 3
) {
  const today =
    getTodayLocalDateKey();

  return safeArray(items).filter((item) => {
    if (isCompleted(item)) {
      return false;
    }

    for (
      const field of possibleDateFields
    ) {
      const dateKey =
        getDateKey(item?.[field]);

      if (!dateKey) {
        continue;
      }

      try {
        const difference =
          diffInLocalDays(
            today,
            dateKey
          );

        return (
          difference >= 0 &&
          difference <= days
        );
      } catch {
        return false;
      }
    }

    return false;
  });
}

// ============================================================
// ITEM TITLE
// ============================================================

function getItemTitle(
  item,
  fallback = "something"
) {
  if (!item) {
    return fallback;
  }

  const fields = [
    "title",
    "name",
    "task",
    "taskName",
    "topic",
    "topicName",
    "goal",
    "goalName",
    "subject",
    "description",
  ];

  for (const field of fields) {
    if (
      typeof item[field] === "string" &&
      item[field].trim()
    ) {
      return item[field].trim();
    }
  }

  return fallback;
}

// ============================================================
// WATER ANALYSIS
// ============================================================

function getWaterStats(water) {
  const today =
    getTodayLocalDateKey();

  const todayRecords =
    safeArray(water).filter((item) => {
      const dateKey =
        getDateKey(item?.date) ||
        getDateKey(item?.createdAt) ||
        getDateKey(item?.timestamp);

      return dateKey === today;
    });

  let consumed = 0;
  let target = 0;

  for (const record of todayRecords) {
    consumed += safeNumber(
      record?.amount ??
        record?.amountMl ??
        record?.ml ??
        record?.consumed ??
        record?.consumedMl
    );

    if (!target) {
      target = safeNumber(
        record?.target ??
          record?.targetMl ??
          record?.dailyTarget
      );
    }
  }

  if (target <= 0) {
    target = 2500;
  }

  return {
    consumed,
    target,
    percentage: Math.min(
      100,
      Math.round(
        (consumed / target) * 100
      )
    ),
  };
}

// ============================================================
// ACTIVITY ANALYSIS
// ============================================================

function getActivityStats(
  activities
) {
  const today =
    getTodayLocalDateKey();

  const todayActivities =
    safeArray(activities).filter(
      (item) => {
        const dateKey =
          getDateKey(item?.date) ||
          getDateKey(item?.createdAt) ||
          getDateKey(item?.timestamp);

        return dateKey === today;
      }
    );

  let minutes = 0;

  for (
    const activity of todayActivities
  ) {
    minutes += safeNumber(
      activity?.minutes ??
        activity?.duration ??
        activity?.durationMinutes
    );
  }

  return {
    minutes,
    hasActivity:
      minutes > 0 ||
      todayActivities.length > 0,
  };
}

// ============================================================
// STUDY ANALYSIS
// ============================================================

function getStudyStats(
  studySessions,
  topics
) {
  const today =
    getTodayLocalDateKey();

  const todaySessions =
    safeArray(studySessions).filter(
      (session) => {
        const dateKey =
          getDateKey(session?.date) ||
          getDateKey(session?.startTime) ||
          getDateKey(session?.createdAt);

        return dateKey === today;
      }
    );

  let minutes = 0;

  for (
    const session of todaySessions
  ) {
    minutes += safeNumber(
      session?.minutes ??
        session?.duration ??
        session?.durationMinutes
    );
  }

  const todayCompletedTopics =
    safeArray(topics).filter(
      (topic) => {
        if (!isCompleted(topic)) {
          return false;
        }

        const dateKey =
          getDateKey(
            topic?.completedDate
          ) ||
          getDateKey(
            topic?.completedAt
          ) ||
          getDateKey(topic?.date);

        return dateKey === today;
      }
    );

  return {
    minutes,
    completedTopics:
      todayCompletedTopics.length,
    hasStudy:
      minutes > 0 ||
      todayCompletedTopics.length > 0,
  };
}

// ============================================================
// CENTRAL TODO ANALYSIS
// ============================================================

function getTodoStats(todoList) {
  const today =
    getTodayLocalDateKey();

  const pending =
    safeArray(todoList).filter(
      (item) => !isCompleted(item)
    );

  const todayPending =
    pending.filter((item) => {
      const dateKey =
        getDateKey(item?.date) ||
        getDateKey(item?.taskDate) ||
        getDateKey(item?.dueDate) ||
        getDateKey(
          item?.scheduledDate
        );

      return dateKey === today;
    });

  const overdue =
    pending.filter((item) => {
      const dateKey =
        getDateKey(item?.date) ||
        getDateKey(item?.taskDate) ||
        getDateKey(item?.dueDate) ||
        getDateKey(
          item?.scheduledDate
        );

      if (!dateKey) {
        return false;
      }

      try {
        return (
          diffInLocalDays(
            dateKey,
            today
          ) > 0
        );
      } catch {
        return false;
      }
    });

  return {
    pending,
    todayPending,
    overdue,
  };
}

// ============================================================
// IMPORTANCE DETECTION
// ============================================================

function isImportant(item) {
  if (!item) {
    return false;
  }

  if (
    item.priority === "high" ||
    item.priority === "High" ||
    item.priority === "urgent" ||
    item.priority === "Urgent"
  ) {
    return true;
  }

  if (
    item.important === true ||
    item.isImportant === true
  ) {
    return true;
  }

  const priorityNumber =
    safeNumber(item.priority);

  if (priorityNumber >= 8) {
    return true;
  }

  return false;
}

// ============================================================
// CAREER DATA
// ============================================================

function getCareerStats(
  careerData = {}
) {
  const jobPreparation =
    safeArray(
      careerData.jobPreparation
    );

  const applications =
    safeArray(
      careerData.applications
    );

  const savedJobs =
    safeArray(
      careerData.savedJobs
    );

  const interviews =
    safeArray(
      careerData.interviews
    );

  const today =
    getTodayLocalDateKey();

  const duePreparation =
    jobPreparation.filter((item) => {
      if (isCompleted(item)) {
        return false;
      }

      const dateKey =
        getDateKey(item?.dueDate) ||
        getDateKey(item?.date);

      if (!dateKey) {
        return false;
      }

      try {
        return (
          diffInLocalDays(
            dateKey,
            today
          ) <= 0
        );
      } catch {
        return false;
      }
    });

  const followUps =
    applications.filter((item) => {
      if (isCompleted(item)) {
        return false;
      }

      const dateKey =
        getDateKey(
          item?.followUpDate
        ) ||
        getDateKey(
          item?.nextFollowUp
        );

      return dateKey === today;
    });

  const upcomingInterviews =
    interviews.filter((item) => {
      if (isCompleted(item)) {
        return false;
      }

      const dateKey =
        getDateKey(item?.date) ||
        getDateKey(
          item?.interviewDate
        );

      if (!dateKey) {
        return false;
      }

      try {
        const days =
          diffInLocalDays(
            today,
            dateKey
          );

        return (
          days >= 0 &&
          days <= 2
        );
      } catch {
        return false;
      }
    });

  const applicationsToday =
    applications.filter((item) => {
      const dateKey =
        getDateKey(item?.date) ||
        getDateKey(item?.appliedDate) ||
        getDateKey(
          item?.applicationDate
        ) ||
        getDateKey(
          item?.createdAt
        );

      return dateKey === today;
    });

  return {
    duePreparation,
    followUps,
    upcomingInterviews,
    savedJobs,
    applicationsToday,
  };
}

// ============================================================
// FINANCE DATA
// ============================================================

function getFinanceStats(
  financeData = {}
) {
  const income =
    safeArray(financeData.income);

  const expenses =
    safeArray(financeData.expenses);

  const budgets =
    safeArray(financeData.budgets);

  const today =
    getTodayLocalDateKey();

  const todayExpenses =
    expenses.filter((item) => {
      const dateKey =
        getDateKey(item?.date) ||
        getDateKey(item?.createdAt);

      return dateKey === today;
    });

  let todayExpenseAmount = 0;

  for (
    const expense of todayExpenses
  ) {
    todayExpenseAmount +=
      safeNumber(
        expense?.amount ??
          expense?.value ??
          expense?.cost
      );
  }

  let budgetAmount = 0;

  for (const budget of budgets) {
    budgetAmount += safeNumber(
      budget?.amount ??
        budget?.limit ??
        budget?.budget
    );
  }

  return {
    income,
    expenses,
    budgets,
    todayExpenseAmount,
    budgetAmount,
  };
}

// ============================================================
// CANDIDATE CREATION
// ============================================================

function createCandidate({
  key,
  type,
  priority,
  title,
  body,
  reason,
  eventKey,
}) {
  return {
    key,
    type,
    priority,
    title,
    body,
    reason,
    eventKey: eventKey || key,
  };
}

// ============================================================
// NOTIFICATION TEXT HELPERS
// ============================================================

function namedMessage(
  name,
  withNameText,
  withoutNameText
) {
  return name
    ? withNameText.replace(
        /\[Name\]/g,
        name
      )
    : withoutNameText;
}

function getAssessmentText(
  name,
  assessmentName
) {
  return namedMessage(
    name,
    `📚 [Name], ${assessmentName} is today. You’ve got this! ✨`,
    `📚 ${assessmentName} is today. You’ve got this! ✨`
  );
}

function getAssessmentTimeText(
  name,
  assessmentName,
  time
) {
  return namedMessage(
    name,
    `⏰ [Name], ${assessmentName} is at ${time}. You’ve got this! ✨`,
    `⏰ ${assessmentName} is at ${time}. You’ve got this! ✨`
  );
}

function getInterviewText(
  name,
  interviewName,
  isToday
) {
  return namedMessage(
    name,
    isToday
      ? `💼 [Name], ${interviewName} is today. You’ve got this! ✨`
      : `💼 [Name], ${interviewName} is tomorrow. A little preparation tonight?`,
    isToday
      ? `💼 ${interviewName} is today. You’ve got this! ✨`
      : `💼 ${interviewName} is tomorrow. A little preparation tonight?`
  );
}

// ============================================================
// APPLICATION / REVIEW HELPERS
// ============================================================

// ============================================================
// BUILD SMART CANDIDATES
// ============================================================

function buildCandidates(data) {
  const {
    profile,
    topics,
    goals,
    water,
    activities,
    assessments,
    todoList,
    studySessions,
    career,
    finance,
  } = data;

  const name = getProfileName(profile);

  const candidates = [];

  const today =
    getTodayLocalDateKey();

  // ----------------------------------------------------------
  // 1. IMPORTANT TODO
  // ----------------------------------------------------------

  const todoStats =
    getTodoStats(todoList);

  const importantTodo =
    todoStats.todayPending.find(
      isImportant
    ) ||
    todoStats.overdue.find(
      isImportant
    );

  if (importantTodo) {
    const taskName =
      getItemTitle(
        importantTodo,
        "one small thing"
      );

    candidates.push(
      createCandidate({
        key: "important-task",
        type: "task",
        priority: 100,

        title: namedMessage(
          name,
          `🌱 [Name], one tiny win?`,
          "🌱 One tiny win?"
        ),

        body: namedMessage(
          name,
          `✨ [Name], shall we turn "${taskName}" into a little win?`,
          `✨ Shall we turn "${taskName}" into a little win?`
        ),

        reason: "important task",

        eventKey:
          `important-task-${taskName}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 2. OVERDUE TASK
  // ----------------------------------------------------------

  if (todoStats.overdue.length > 0) {
    const task =
      todoStats.overdue[0];

    const taskName =
      getItemTitle(
        task,
        "One little thing"
      );

    candidates.push(
      createCandidate({
        key: "overdue-task",
        type: "task",
        priority: 95,

        title: namedMessage(
          name,
          `🌱 [Name], one small step?`,
          "🌱 One small step?"
        ),

        body: namedMessage(
          name,
          `🌱 [Name], "${taskName}" is still waiting. Let's give it a little time.`,
          `🌱 "${taskName}" is still waiting. Let's give it a little time.`
        ),

        reason: "overdue task",

        eventKey:
          `overdue-task-${taskName}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 3. TODAY TASK
  // ----------------------------------------------------------

  if (
    todoStats.todayPending.length > 0
  ) {
    const task =
      todoStats.todayPending[0];

    const taskName =
      getItemTitle(
        task,
        "one small thing"
      );

    candidates.push(
      createCandidate({
        key: "today-task",
        type: "task",
        priority: 90,

        title: namedMessage(
          name,
          `👀 Psst, [Name]…`,
          "👀 Psst…"
        ),

        body: namedMessage(
          name,
          `✨ [Name], shall we turn "${taskName}" into a little win?`,
          `✨ Shall we turn "${taskName}" into a little win?`
        ),

        reason: "today task",

        eventKey:
          `today-task-${taskName}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 4. INTERVIEW
  // ----------------------------------------------------------

  const careerStats =
    getCareerStats(career);

  if (
    careerStats.upcomingInterviews
      .length > 0
  ) {
    const interview =
      careerStats
        .upcomingInterviews[0];

    const interviewDate =
      getDateKey(
        interview?.date
      ) ||
      getDateKey(
        interview?.interviewDate
      );

    let days = null;

    if (interviewDate) {
      try {
        days =
          diffInLocalDays(
            today,
            interviewDate
          );
      } catch {
        days = null;
      }
    }

    const company =
      interview?.company ||
      interview?.companyName ||
      interview?.organization ||
      interview?.employer;

    const interviewTitle =
      getItemTitle(
        interview,
        company || "Your interview"
      );

    const interviewName =
      company &&
      interviewTitle !== company
        ? `${company} — ${interviewTitle}`
        : interviewTitle;

    let title;
    let body;

    if (days === 0) {
      title = namedMessage(
        name,
        `💼 [Name], you've got this today!`,
        "💼 You've got this today!"
      );

      body =
        getInterviewText(
          name,
          interviewName,
          true
        );
    } else if (days === 1) {
      title = namedMessage(
        name,
        `💼 [Name], tomorrow's little mission`,
        "💼 Tomorrow's little mission"
      );

      body =
        getInterviewText(
          name,
          interviewName,
          false
        );
    } else {
      title = namedMessage(
        name,
        `💼 [Name], a little career step`,
        "💼 A little career step"
      );

      body = namedMessage(
        name,
        `✨ [Name], a little preparation today can make tomorrow easier.`,
        "✨ A little preparation today can make tomorrow easier."
      );
    }

    candidates.push(
      createCandidate({
        key: "career-interview",
        type: "career",
        priority: 98,

        title,
        body,

        reason:
          "upcoming interview",

        eventKey:
          `interview-${interview.id || interviewName}-${interviewDate}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 5. APPLICATION FOLLOW-UP
  // ----------------------------------------------------------

  if (
    careerStats.followUps.length > 0
  ) {
    const followUp =
      careerStats.followUps[0];

    const applicationName =
      getItemTitle(
        followUp,
        "your application"
      );

    candidates.push(
      createCandidate({
        key: "career-followup",
        type: "career",
        priority: 94,

        title: namedMessage(
          name,
          `💼 [Name], one little career step`,
          "💼 One little career step"
        ),

        body: namedMessage(
          name,
          `🚀 [Name], "${applicationName}" has a follow-up today. A tiny check-in could keep things moving.`,
          `🚀 "${applicationName}" has a follow-up today. A tiny check-in could keep things moving.`
        ),

        reason:
          "application follow-up",

        eventKey:
          `followup-${followUp.id || applicationName}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 6. JOB PREPARATION
  // ----------------------------------------------------------

  if (
    careerStats.duePreparation.length > 0
  ) {
    const item =
      careerStats.duePreparation[0];

    const preparationName =
      getItemTitle(
        item,
        "your career preparation"
      );

    candidates.push(
      createCandidate({
        key: "career-preparation",
        type: "career",
        priority: 88,

        title: namedMessage(
          name,
          `🚀 [Name], one tiny career win?`,
          "🚀 One tiny career win?"
        ),

        body: namedMessage(
          name,
          `💼 [Name], ${preparationName} is ready for a little attention.`,
          `💼 ${preparationName} is ready for a little attention.`
        ),

        reason:
          "career preparation",

        eventKey:
          `career-preparation-${item.id || preparationName}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 7. ASSESSMENT
  // ----------------------------------------------------------

  const todayAssessments =
    getTodayItems(
      assessments,
      [
        "date",
        "scheduledDate",
      ]
    ).filter(isPending);

  if (
    todayAssessments.length > 0
  ) {
    const assessment =
      todayAssessments[0];

    const assessmentName =
      getItemTitle(
        assessment,
        "Your assessment"
      );

    const assessmentTime =
      assessment?.time ||
      assessment?.scheduledTime ||
      assessment?.startTime;

    const body =
      assessmentTime
        ? getAssessmentTimeText(
            name,
            assessmentName,
            assessmentTime
          )
        : getAssessmentText(
            name,
            assessmentName
          );

    candidates.push(
      createCandidate({
        key: "assessment",

        // IMPORTANT:
        // Assessment is separate from normal study.
        type: "assessment",

        priority: 110,

        title: namedMessage(
          name,
          `📚 [Name], you've got this!`,
          "📚 You've got this!"
        ),

        body,

        reason:
          "today assessment",

        eventKey:
          `assessment-${assessment.id || assessmentName}-${today}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 8. STUDY
  // ----------------------------------------------------------

  const studyStats =
    getStudyStats(
      studySessions,
      topics
    );

  if (!studyStats.hasStudy) {
    const pendingTopics =
      topics.filter(isPending);

    if (
      pendingTopics.length > 0
    ) {
      candidates.push(
        createCandidate({
          key: "study",
          type: "study",
          priority: 80,

          title: namedMessage(
            name,
            `📚 [Name], 20 minutes?`,
            "📚 20 minutes?"
          ),

          body: namedMessage(
            name,
            `💫 [Name], you + 20 focused minutes = a pretty good day.`,
            "💫 You + 20 focused minutes = a pretty good day."
          ),

          reason:
            "no study recorded today",

          eventKey:
            `study-${today}`,
        })
      );
    }
  }

  // ----------------------------------------------------------
  // 9. GOALS
  // ----------------------------------------------------------

  const goalsDue =
    getUpcomingItems(
      goals,
      [
        "targetDate",
        "dueDate",
        "date",
      ],
      1
    );

  if (
    goalsDue.length > 0
  ) {
    const goal =
      goalsDue[0];

    const goalName =
      getItemTitle(
        goal,
        "your goal"
      );

    candidates.push(
      createCandidate({
        key: "goal",
        type: "goal",
        priority: 82,

        title: namedMessage(
          name,
          `🎯 [Name], your goal called.`,
          "🎯 Your goal called."
        ),

        body: namedMessage(
          name,
          `🎯 [Name], it says, "Keep going." One tiny step is enough.`,
          `🎯 It says, "Keep going." One tiny step is enough.`
        ),

        reason:
          "goal deadline",

        eventKey:
          `goal-${goal.id || goalName}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 10. WATER
  // ----------------------------------------------------------

  const waterStats =
    getWaterStats(water);

  if (
    waterStats.target > 0 &&
    waterStats.percentage < 40
  ) {
    candidates.push(
      createCandidate({
        key: "water",
        type: "wellness",
        priority: 70,

        title: namedMessage(
          name,
          `💧 Hey [Name]…`,
          "💧 Hey…"
        ),

        body: namedMessage(
          name,
          `😄 [Name], your water bottle is feeling ignored.`,
          "😄 Your water bottle is feeling ignored."
        ),

        reason:
          "water intake below 40% of today's target",

        eventKey:
          `water-${today}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 11. ACTIVITY
  // ----------------------------------------------------------

  const activityStats =
    getActivityStats(
      activities
    );

  if (
    !activityStats.hasActivity
  ) {
    candidates.push(
      createCandidate({
        key: "activity",
        type: "wellness",
        priority: 65,

        title: namedMessage(
          name,
          `🚶 [Name], tiny movement?`,
          "🚶 Tiny movement?"
        ),

        body:
          "Your body has been waiting for a tiny adventure. A little walk?",

        reason:
          "no activity recorded today",

        eventKey:
          `activity-${today}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 12. FINANCE
  // ----------------------------------------------------------

  const financeStats =
    getFinanceStats(finance);

  if (
    financeStats.budgetAmount > 0 &&
    financeStats.todayExpenseAmount >
      financeStats.budgetAmount
  ) {
    candidates.push(
      createCandidate({
        key: "finance-budget",
        type: "finance",
        priority: 45,

        title: namedMessage(
          name,
          `💰 [Name], a tiny money check?`,
          "💰 A tiny money check?"
        ),

        body:
          "A quick look at today's spending could feel good. 📊",

        reason:
          "budget exceeded",

        eventKey:
          `finance-${today}`,
      })
    );
  }

  // ----------------------------------------------------------
  // 13. JOB APPLICATION
  // ----------------------------------------------------------

  if (
    careerStats.applicationsToday
      .length === 0 &&
    careerStats.savedJobs.length > 0
  ) {
    const savedJob =
      careerStats.savedJobs.find(
        (job) => !isCompleted(job)
      );

    if (savedJob) {
      const jobName =
        getItemTitle(
          savedJob,
          "one job"
        );

      candidates.push(
        createCandidate({
          key: "job-application",
          type: "career-application",
          priority: 87,

          title: namedMessage(
            name,
            `💼 [Name], 20 minutes for your future?`,
            "💼 20 minutes for your future?"
          ),

          body: namedMessage(
            name,
            `🚀 [Name], find one job and make one small move.`,
            "🚀 Find one job and make one small move."
          ),

          reason:
            "no job application today",

          eventKey:
            `job-application-${today}-${jobName}`,
        })
      );
    }
  }

  // ----------------------------------------------------------
  // 14. DAILY REVIEW / INSIGHTS
  // ----------------------------------------------------------
  // Reports/Insights does not currently store a Firestore field
  // that means "review completed today". Do not guess this with
  // localStorage keys. The review reminder is therefore omitted
  // until the Reports page has an explicit persisted state.

  // ----------------------------------------------------------
  // TIMETABLE / MANUAL REMINDER DUPLICATION PROTECTION
  // ----------------------------------------------------------
  // Timetable.jsx already owns timetable-start notifications.
  // Reminders.jsx already owns user-created reminder notifications.
  // Therefore the smart service intentionally does NOT create
  // duplicate notifications for either system.

  // ----------------------------------------------------------
  // 15. POSITIVE BACKUP
  // ----------------------------------------------------------
  //
  // This candidate is intentionally low priority.
  // It should only be selected when there is no
  // higher-value notification for the current window.
  //

  const hasMeaningfulProgress =
    todoStats.todayPending.length === 0 &&
    todoStats.overdue.length === 0 &&
    studyStats.hasStudy &&
    activityStats.hasActivity;

  candidates.push(
    createCandidate({
      key: "positive",
      type: "motivation",
      priority:
        hasMeaningfulProgress
          ? 60
          : 20,

      title: namedMessage(
        name,
        `✨ Look at that, [Name].`,
        "✨ Look at that."
      ),

      body: namedMessage(
        name,
        `💙 [Name], you've already made some progress today.`,
        "💙 You've already made some progress today."
      ),

      reason:
        "positive encouragement",

      eventKey:
        `positive-${today}`,
    })
  );

  return candidates;
}
// ============================================================
// CANDIDATE SELECTION
// ============================================================

function chooseCandidate(
  candidates,
  windowKey,
  usedEvents = new Set()
) {
  const available =
    safeArray(candidates).filter(
      (candidate) => {
        if (!candidate) {
          return false;
        }

        if (
          !candidate.eventKey
        ) {
          return false;
        }

        if (
          usedEvents.has(
            candidate.eventKey
          )
        ) {
          return false;
        }

        if (
          hasSentToday(
            candidate.eventKey
          )
        ) {
          return false;
        }

        // Job application reminder is specifically
        // a night opportunity.
        if (
          candidate.key ===
            "job-application" &&
          windowKey !== "night"
        ) {
          return false;
        }

        // Daily review/insights is specifically
        // a night opportunity.
        if (
          candidate.key ===
            "daily-review" &&
          windowKey !== "night"
        ) {
          return false;
        }

        // Positive messages are useful mainly when
        // the day is winding down.
        if (
          candidate.key ===
            "positive" &&
          windowKey !== "evening" &&
          windowKey !== "night"
        ) {
          return false;
        }

        return true;
      }
    );

  if (
    available.length === 0
  ) {
    return null;
  }

  // ----------------------------------------------------------
  // TIME-SENSITIVE PRIORITY
  // ----------------------------------------------------------
  //
  // These should not be pushed aside simply because
  // another category is preferred by the current window.
  //

  const highPriority =
    available
      .filter(
        (candidate) =>
          candidate.priority >= 95
      )
      .sort(
        (a, b) =>
          b.priority - a.priority
      );

  if (
    highPriority.length > 0
  ) {
    return highPriority[0];
  }

  // ----------------------------------------------------------
  // WINDOW PREFERENCES
  // ----------------------------------------------------------

  const preferences = {
    morning: [
      "assessment",
      "career",
      "task",
      "goal",
      "study",
    ],

    "late-morning": [
      "wellness",
      "task",
      "study",
      "assessment",
      "goal",
    ],

    afternoon: [
      "task",
      "study",
      "career",
      "goal",
      "wellness",
      "assessment",
    ],

    evening: [
      "task",
      "career",
      "goal",
      "study",
      "wellness",
      "motivation",
    ],

    night: [
      "career-application",
      "career",
      "task",
      "review",
      "goal",
      "study",
      "wellness",
      "motivation",
      "finance",
    ],
  };

  const preferredTypes =
    preferences[
      windowKey
    ] || [];

  for (
    const type of preferredTypes
  ) {
    const matching =
      available
        .filter(
          (candidate) =>
            candidate.type === type
        )
        .sort(
          (a, b) =>
            b.priority - a.priority
        );

    if (
      matching.length > 0
    ) {
      return matching[0];
    }
  }

  // ----------------------------------------------------------
  // FINAL FALLBACK
  // ----------------------------------------------------------

  return (
    available
      .slice()
      .sort(
        (a, b) =>
          b.priority - a.priority
      )[0] || null
  );
}

// ============================================================
// BUILD TODAY'S SMART NOTIFICATION PLAN
// ============================================================

export async function buildSmartNotificationPlan() {
  const enabled =
    await areSmartNotificationsEnabled();

  if (!enabled) {
    return [];
  }

  const data =
    await loadTaskbarData();

  const candidates =
    buildCandidates(data);

  const today =
    getTodayLocalDateKey();

  const now =
    new Date();

  const plan = [];

  // Used only during this planning pass.
  //
  // IMPORTANT:
  // We do NOT use candidate.type here.
  //
  // Different events of the same type are allowed.
  // Example:
  // - water at 11 AM
  // - activity at 2 PM
  //
  // Only the exact same event is blocked.
  const usedEvents =
    new Set();

  for (
    const window of DAILY_WINDOWS
  ) {
    const scheduledDate =
      new Date();

    scheduledDate.setHours(
      window.hour,
      window.minute,
      0,
      0
    );

    // Past opportunity windows are skipped.
    if (
      scheduledDate <= now
    ) {
      continue;
    }

    const candidate =
      chooseCandidate(
        candidates,
        window.key,
        usedEvents
      );

    if (!candidate) {
      continue;
    }

    usedEvents.add(
      candidate.eventKey
    );

    plan.push({
      ...candidate,

      windowKey:
        window.key,

      dateKey:
        today,

      scheduledDate,
    });

    if (
      plan.length >=
      MAX_NOTIFICATIONS_PER_DAY
    ) {
      break;
    }
  }

  return plan;
}

// ============================================================
// GET WINDOW DATE
// ============================================================

function getWindowDate(
  windowKey,
  dateKey = getTodayLocalDateKey()
) {
  const window =
    DAILY_WINDOWS.find(
      (item) =>
        item.key === windowKey
    );

  if (!window) {
    return null;
  }

  const date =
    new Date(
      `${dateKey}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  date.setHours(
    window.hour,
    window.minute,
    0,
    0
  );

  return date;
}

// ============================================================
// SCHEDULE ONE SMART NOTIFICATION
// ============================================================

export async function scheduleSmartNotification(
  notification
) {
  if (!notification) {
    return false;
  }

  if (!isNativeApp()) {
    return false;
  }

  const permission =
    await requestSmartNotificationPermission();

  if (!permission.granted) {
    return false;
  }

  const date =
    notification.scheduledDate instanceof
    Date
      ? notification.scheduledDate
      : new Date(
          notification.scheduledDate
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return false;
  }

  if (
    date <= new Date()
  ) {
    return false;
  }

  const notificationId =
    getSmartNotificationId(
      notification.windowKey,
      notification.dateKey
    );

  try {
    await LocalNotifications.schedule(
      {
        notifications: [
          {
            id: notificationId,

            title:
              notification.title,

            body:
              notification.body,

            schedule: {
              at: date,
              allowWhileIdle: true,
            },

            extra: {
              type:
                "taskbar-smart-notification",

              eventKey:
                notification.eventKey,

              notificationType:
                notification.type,

              windowKey:
                notification.windowKey,

              reason:
                notification.reason,

              dateKey:
                notification.dateKey,
            },
          },
        ],
      }
    );

    markScheduled(notification.eventKey);

    return true;
  } catch (error) {
    console.error(
      "TASKBAR smart notification schedule error:",
      error
    );

    return false;
  }
}

// ============================================================
// CANCEL SMART NOTIFICATIONS
// ============================================================

export async function cancelSmartNotifications() {
  if (!isNativeApp()) {
    return false;
  }

  try {
    const pending =
      await LocalNotifications.getPending();

    const smartNotifications =
      safeArray(
        pending?.notifications
      ).filter(
        (notification) =>
          notification?.extra
            ?.type ===
          "taskbar-smart-notification"
      );

    if (
      smartNotifications.length === 0
    ) {
      return true;
    }

    await LocalNotifications.cancel(
      {
        notifications:
          smartNotifications.map(
            (notification) => ({
              id:
                notification.id,
            })
          ),
      }
    );

    for (const notification of smartNotifications) {
      unmarkScheduled(
        notification?.extra?.eventKey
      );
    }

    return true;
  } catch (error) {
    console.error(
      "TASKBAR smart notification cancel error:",
      error
    );

    return false;
  }
}

// ============================================================
// SCHEDULE TODAY'S SMART NOTIFICATIONS
// ============================================================

export async function scheduleTodaySmartNotifications() {
  const enabled =
    await areSmartNotificationsEnabled();

  if (!enabled) {
    return [];
  }

  const plan =
    await buildSmartNotificationPlan();

  if (
    plan.length === 0
  ) {
    return [];
  }

  const scheduled = [];

  for (
    const notification of plan
  ) {
    const success =
      await scheduleSmartNotification(
        notification
      );

    if (success) {
      scheduled.push(
        notification
      );
    }
  }

  return scheduled;
}

// ============================================================
// REFRESH SMART NOTIFICATIONS
// ============================================================
//
// Call this after meaningful TASKBAR data changes.
// Examples:
// - task completed/created
// - water logged
// - activity recorded
// - study session completed
// - goal changed
// - career data changed
// - assessment changed
//
// This keeps future notifications aligned with
// the latest available TASKBAR data.
//

export async function refreshSmartNotifications() {
  if (!isNativeApp()) {
    return [];
  }

  const enabled =
    await areSmartNotificationsEnabled();

  if (!enabled) {
    await cancelSmartNotifications();

    return [];
  }

  try {
    await cancelSmartNotifications();
  } catch {
    // Continue and rebuild the plan.
  }

  return scheduleTodaySmartNotifications();
}

// ============================================================
// INITIALIZE SMART NOTIFICATIONS
// ============================================================

export async function initializeSmartNotifications() {
  if (!isNativeApp()) {
    return {
      enabled: false,
      native: false,
      scheduled: [],
    };
  }

  const enabled =
    await areSmartNotificationsEnabled();

  if (!enabled) {
    await cancelSmartNotifications();

    return {
      enabled: false,
      native: true,
      scheduled: [],
    };
  }

  const permission =
    await requestSmartNotificationPermission();

  if (!permission.granted) {
    return {
      enabled: true,
      native: true,
      permissionGranted: false,
      scheduled: [],
    };
  }

  try {
    registerSmartNotificationListener();
    await syncDeliveredSmartNotifications();

    // Remove previously scheduled smart
    // notifications before creating today's plan.
    await cancelSmartNotifications();

    const scheduled =
      await scheduleTodaySmartNotifications();

    return {
      enabled: true,
      native: true,
      permissionGranted: true,
      scheduled,
    };
  } catch (error) {
    console.error(
      "TASKBAR smart notification initialization error:",
      error
    );

    return {
      enabled: true,
      native: true,
      permissionGranted: true,
      scheduled: [],
      error,
    };
  }
}

// ============================================================
// MANUAL SMART NOTIFICATION TEST
// ============================================================
//
// This is ONLY a developer/test notification.
// It does NOT replace the intelligent notification system.
//

export async function sendSmartNotificationTest() {
  if (!isNativeApp()) {
    return {
      success: false,
      reason:
        "Not running in native app",
    };
  }

  const permission =
    await requestSmartNotificationPermission();

  if (!permission.granted) {
    return {
      success: false,
      reason:
        "Notification permission not granted",
    };
  }

  const profile =
    await getSingleProfile();

  const name =
    getProfileName(profile);

  const title = namedMessage(
    name,
    `💙 [Name], TASKBAR is here for you`,
    "💙 TASKBAR is here for you"
  );

  const body =
    "Your smart notification system is working. Keep going one small step at a time. ✨";

  const notificationId =
    SMART_NOTIFICATION_BASE_ID +
    99999;

  try {
    await LocalNotifications.schedule(
      {
        notifications: [
          {
            id: notificationId,

            title,

            body,

            schedule: {
              at:
                new Date(
                  Date.now() + 5000
                ),
              allowWhileIdle: true,
            },

            extra: {
              type:
                "taskbar-smart-test",
            },
          },
        ],
      }
    );

    return {
      success: true,
    };
  } catch (error) {
    console.error(
      "TASKBAR smart test notification error:",
      error
    );

    return {
      success: false,
      error,
    };
  }
}

// ============================================================
// PREVIEW SMART NOTIFICATIONS
// ============================================================
//
// This does NOT schedule anything.
// It only returns the current plan for debugging/testing.
//

export async function previewSmartNotifications() {
  try {
    return await buildSmartNotificationPlan();
  } catch (error) {
    console.error(
      "TASKBAR smart notification preview error:",
      error
    );

    return [];
  }
}

// ============================================================
// EXPORT HELPERS
// ============================================================

export {
  getNotificationState,
  hasSentToday,
  markScheduled,
  unmarkScheduled,
  markSent,
  buildCandidates,
  chooseCandidate,
};