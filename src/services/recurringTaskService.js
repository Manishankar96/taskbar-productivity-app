// src/services/recurringTaskService.js

import {
  getItemsFromFirestore,
  saveItemToFirestore,
  deleteItemFromFirestore,
} from "../firebase/firestore";

const RECURRING_TASKS_COLLECTION = "recurringTasks";
const TODO_COLLECTION = "todoList";

/* =========================================================
   DATE HELPERS
========================================================= */

export function getLocalDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);

  return `${value.getFullYear()}-${String(
    value.getMonth() + 1
  ).padStart(2, "0")}-${String(value.getDate()).padStart(
    2,
    "0"
  )}`;
}

export function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  date.setDate(date.getDate() + Number(days || 0));

  return getLocalDateKey(date);
}

export function addMonths(dateKey, months) {
  const date = new Date(`${dateKey}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  date.setMonth(date.getMonth() + Number(months || 0));

  return getLocalDateKey(date);
}

/* =========================================================
   NORMALIZATION
========================================================= */

export function normalizeFrequency(value) {
  const frequency = String(value || "daily").toLowerCase();

  if (
    frequency === "week" ||
    frequency === "weekly" ||
    frequency === "every-week"
  ) {
    return "weekly";
  }

  if (
    frequency === "month" ||
    frequency === "monthly" ||
    frequency === "every-month"
  ) {
    return "monthly";
  }

  return "daily";
}

export function getRecurringTaskTitle(task) {
  return (
    task?.title ||
    task?.name ||
    task?.task ||
    "Recurring Task"
  );
}

export function isRecurringTaskActive(task) {
  return (
    task?.active !== false &&
    task?.enabled !== false &&
    task?.status !== "inactive"
  );
}

function getStartDate(task) {
  return (
    task?.nextDate ||
    task?.nextRunDate ||
    task?.startDate ||
    task?.date ||
    getLocalDateKey()
  );
}

/* =========================================================
   NEXT OCCURRENCE
========================================================= */

export function calculateNextOccurrence(
  dateKey,
  frequency
) {
  const normalized = normalizeFrequency(frequency);

  if (normalized === "weekly") {
    return addDays(dateKey, 7);
  }

  if (normalized === "monthly") {
    return addMonths(dateKey, 1);
  }

  return addDays(dateKey, 1);
}

/* =========================================================
   FIREBASE READ
========================================================= */

export async function getRecurringTasks() {
  const items = await getItemsFromFirestore(
    RECURRING_TASKS_COLLECTION
  );

  return Array.isArray(items) ? items : [];
}

/* =========================================================
   CREATE
========================================================= */

export async function createRecurringTask({
  title,
  frequency = "daily",
  startDate = getLocalDateKey(),
  description = "",
  category = "",
}) {
  const cleanTitle = String(title || "").trim();

  if (!cleanTitle) {
    throw new Error(
      "Recurring task title is required."
    );
  }

  const normalizedFrequency =
    normalizeFrequency(frequency);

  const id = `recurring-${Date.now()}`;

  const task = {
    id,
    title: cleanTitle,
    frequency: normalizedFrequency,
    recurrence: normalizedFrequency,
    startDate,
    nextDate: startDate,
    description: String(description || ""),
    category: String(category || ""),
    active: true,
    enabled: true,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveItemToFirestore(
    RECURRING_TASKS_COLLECTION,
    id,
    task
  );

  window.dispatchEvent(
    new Event("taskbarRecurringTasksUpdated")
  );

  return task;
}

/* =========================================================
   UPDATE
========================================================= */

export async function updateRecurringTask(
  taskId,
  updates = {}
) {
  if (!taskId) {
    throw new Error(
      "Recurring task ID is required."
    );
  }

  const tasks = await getRecurringTasks();

  const existing = tasks.find(
    (task) => task?.id === taskId
  );

  if (!existing) {
    throw new Error(
      "Recurring task was not found."
    );
  }

  const updated = {
    ...existing,
    ...updates,
    id: taskId,
    updatedAt: new Date().toISOString(),
  };

  if (updates.frequency !== undefined) {
    updated.frequency = normalizeFrequency(
      updates.frequency
    );

    updated.recurrence = updated.frequency;
  }

  if (updates.active !== undefined) {
    updated.enabled = updates.active === true;

    updated.status =
      updates.active === true
        ? "active"
        : "inactive";
  }

  await saveItemToFirestore(
    RECURRING_TASKS_COLLECTION,
    taskId,
    updated
  );

  window.dispatchEvent(
    new Event("taskbarRecurringTasksUpdated")
  );

  return updated;
}

/* =========================================================
   ACTIVATE / DEACTIVATE
========================================================= */

export async function setRecurringTaskActive(
  taskId,
  active
) {
  return updateRecurringTask(taskId, {
    active: active === true,
    enabled: active === true,
    status:
      active === true
        ? "active"
        : "inactive",
  });
}

export async function toggleRecurringTask(
  taskId
) {
  const tasks = await getRecurringTasks();

  const task = tasks.find(
    (item) => item?.id === taskId
  );

  if (!task) {
    throw new Error(
      "Recurring task was not found."
    );
  }

  return setRecurringTaskActive(
    taskId,
    !isRecurringTaskActive(task)
  );
}

/* =========================================================
   DELETE
========================================================= */

export async function deleteRecurringTask(taskId) {
  if (!taskId) {
    throw new Error(
      "Recurring task ID is required."
    );
  }

  await deleteItemFromFirestore(
    RECURRING_TASKS_COLLECTION,
    taskId
  );

  window.dispatchEvent(
    new Event("taskbarRecurringTasksUpdated")
  );
}

/* =========================================================
   TODO ITEM BUILDER
========================================================= */

export function buildTodoFromRecurringTask(
  recurringTask,
  dateKey = getLocalDateKey()
) {
  if (!recurringTask?.id) {
    throw new Error(
      "A valid recurring task is required."
    );
  }

  const title =
    getRecurringTaskTitle(recurringTask);

  const todoId =
    `recurring-todo-${recurringTask.id}-${dateKey}`;

  return {
    id: todoId,
    title,
    task: title,
    date: dateKey,
    completed: false,
    status: "pending",
    source: "Recurring Tasks",
    recurringTaskId: recurringTask.id,
    createdAt: new Date().toISOString(),
  };
}

/* =========================================================
   CHECK EXISTING GENERATED TODO
========================================================= */

export async function hasGeneratedTodoForDate(
  recurringTaskId,
  dateKey
) {
  const todos = await getItemsFromFirestore(
    TODO_COLLECTION
  );

  if (!Array.isArray(todos)) {
    return false;
  }

  return todos.some(
    (todo) =>
      todo?.recurringTaskId === recurringTaskId &&
      todo?.date === dateKey
  );
}

/* =========================================================
   GENERATE TODO FOR A SPECIFIC DATE
========================================================= */

export async function generateRecurringTodo(
  recurringTask,
  dateKey = getLocalDateKey()
) {
  if (!recurringTask?.id) {
    throw new Error(
      "A valid recurring task is required."
    );
  }

  if (!isRecurringTaskActive(recurringTask)) {
    return {
      created: false,
      reason: "inactive",
      todo: null,
    };
  }

  const alreadyExists =
    await hasGeneratedTodoForDate(
      recurringTask.id,
      dateKey
    );

  if (alreadyExists) {
    return {
      created: false,
      reason: "already-exists",
      todo: null,
    };
  }

  const todo = buildTodoFromRecurringTask(
    recurringTask,
    dateKey
  );

  await saveItemToFirestore(
    TODO_COLLECTION,
    todo.id,
    todo
  );

  return {
    created: true,
    reason: "created",
    todo,
  };
}

/* =========================================================
   PROCESS ONE RECURRING TASK
========================================================= */

export async function processRecurringTask(
  recurringTask,
  today = getLocalDateKey()
) {
  if (!recurringTask?.id) {
    return {
      created: false,
      updated: false,
      reason: "invalid-task",
    };
  }

  if (!isRecurringTaskActive(recurringTask)) {
    return {
      created: false,
      updated: false,
      reason: "inactive",
    };
  }

  let nextDate = getStartDate(
    recurringTask
  );

  const frequency =
    normalizeFrequency(
      recurringTask.frequency ||
        recurringTask.recurrence ||
        recurringTask.repeatType
    );

  let createdAny = false;
  let safetyCounter = 0;

  while (
    nextDate <= today &&
    safetyCounter < 365
  ) {
    const result =
      await generateRecurringTodo(
        recurringTask,
        nextDate
      );

    if (result.created) {
      createdAny = true;
    }

    const followingDate =
      calculateNextOccurrence(
        nextDate,
        frequency
      );

    if (followingDate === nextDate) {
      break;
    }

    nextDate = followingDate;
    safetyCounter += 1;
  }

  const updated = {
    ...recurringTask,
    nextDate,
    frequency,
    recurrence: frequency,
    lastProcessedDate: today,
    updatedAt: new Date().toISOString(),
  };

  const shouldUpdate =
    recurringTask.nextDate !== nextDate ||
    recurringTask.lastProcessedDate !== today ||
    recurringTask.frequency !== frequency ||
    recurringTask.recurrence !== frequency;

  if (shouldUpdate) {
    await saveItemToFirestore(
      RECURRING_TASKS_COLLECTION,
      recurringTask.id,
      updated
    );
  }

  return {
    created: createdAny,
    updated: shouldUpdate,
    nextDate,
    task: updated,
  };
}

/* =========================================================
   PROCESS ALL ACTIVE RECURRING TASKS
========================================================= */

export async function processRecurringTasks(
  today = getLocalDateKey()
) {
  const tasks = await getRecurringTasks();

  const activeTasks = tasks.filter(
    isRecurringTaskActive
  );

  const results = [];

  for (const task of activeTasks) {
    try {
      const result =
        await processRecurringTask(
          task,
          today
        );

      results.push(result);
    } catch (error) {
      console.error(
        "Failed to process recurring task:",
        task?.id,
        error
      );

      results.push({
        created: false,
        updated: false,
        reason: "error",
        error,
        task,
      });
    }
  }

  window.dispatchEvent(
    new Event("taskbarRecurringTasksUpdated")
  );

  return results;
}

/* =========================================================
   GET TASKS DUE TODAY
========================================================= */

export async function getRecurringTasksDueToday(
  today = getLocalDateKey()
) {
  const tasks = await getRecurringTasks();

  return tasks.filter((task) => {
    if (!isRecurringTaskActive(task)) {
      return false;
    }

    return getStartDate(task) <= today;
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const recurringTaskService = {
  getRecurringTasks,
  createRecurringTask,
  updateRecurringTask,
  setRecurringTaskActive,
  toggleRecurringTask,
  deleteRecurringTask,
  calculateNextOccurrence,
  buildTodoFromRecurringTask,
  hasGeneratedTodoForDate,
  generateRecurringTodo,
  processRecurringTask,
  processRecurringTasks,
  getRecurringTasksDueToday,
  isRecurringTaskActive,
  getRecurringTaskTitle,
  normalizeFrequency,
};

export default recurringTaskService;