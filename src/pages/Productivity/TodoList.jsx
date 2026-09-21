import { useEffect, useMemo, useState } from "react";
import {
  ListTodo,
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  Circle,
  CalendarDays,
  BookOpen,
  Target,
  ClipboardCheck,
  Clock3,
  Archive as ArchiveIcon,
  RotateCcw,
} from "lucide-react";

import {
  getTodoList,
  saveTodoList,
  getTopics,
  saveTopics,
  getGoals,
  saveGoals,
  getTimetable,
  saveTimetable,
  getAssessments,
  saveAssessments,
  getQuickTasks,
  saveQuickTasks,
} from "../../utils/db";

import {
  getItemsFromFirestore,
  saveItemToFirestore,
  deleteItemFromFirestore,
  subscribeToFirestoreCollection,
} from "../../firebase/firestore";

import { getTodayLocalDateKey } from "../../utils/calculations";
import Modal from "../../components/common/Modal";

import {
  ARCHIVE_RETENTION_DAYS,
  cleanupArchive,
  createArchiveItem,
  getArchiveAge,
  getArchiveDaysRemaining,
} from "../../services/archiveService";

const emptyForm = {
  title: "",
  date: getTodayLocalDateKey(),
};

function formatDate(date) {
  if (!date) return "No date";

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDateStatus(date, today) {
  if (!date) return "no-date";
  if (date === today) return "today";
  if (date > today) return "upcoming";
  return "overdue";
}

function getCurrentWeekday() {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  return days[new Date().getDay()];
}

function getLinkedArchiveKey(task) {
  if (!task?.source || task?.sourceId === undefined || task?.sourceId === null) {
    return "";
  }

  const datePart =
    task.source === "timetable"
      ? String(task.date || "")
      : "";

  return `${task.source}:${String(task.sourceId)}:${datePart}`;
}

function TodoList() {
  const [todos, setTodos] = useState([]);
  const [linkedTasks, setLinkedTasks] = useState([]);

  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);

  const [form, setForm] = useState(emptyForm);

  const today = getTodayLocalDateKey();

  /*
   * ============================================================
   * LOAD PERSONAL TO-DOS + LINKED SYSTEM TASKS
   * ============================================================
   */

  async function loadLinkedTasks() {
    try {
      const [
        topics,
        goals,
        timetable,
        assessments,
        quickTasks,
      ] = await Promise.all([
        getTopics(),
        getGoals(),
        getTimetable(),
        getAssessments(),
        getQuickTasks(),
      ]);

      const unified = [];

      /*
       * --------------------------------------------------------
       * LEARNING
       * --------------------------------------------------------
       */

      (Array.isArray(topics) ? topics : []).forEach(
        (topic) => {
          if (!topic?.plannedDate) return;

          unified.push({
            id: `learning-${topic.id}`,
            source: "learning",
            sourceId: topic.id,
            title: topic.name || "Learning Topic",
            date: topic.plannedDate,
            completed: topic.status === "completed",
            type: "Learning",
            icon: "learning",
            skill: topic.skill || "",
          });
        }
      );

      /*
       * --------------------------------------------------------
       * GOALS
       * --------------------------------------------------------
       */

      (Array.isArray(goals) ? goals : []).forEach(
        (goal) => {
          if (!goal?.targetDate) return;

          unified.push({
            id: `goal-${goal.id}`,
            source: "goals",
            sourceId: goal.id,
            title: goal.title || "Goal",
            date: goal.targetDate,
            completed: goal.status === "completed",
            type: "Goal",
            icon: "goal",
            skill: goal.skill || "",
          });
        }
      );

      /*
       * --------------------------------------------------------
       * ASSESSMENTS
       * --------------------------------------------------------
       */

      (Array.isArray(assessments) ? assessments : []).forEach(
        (assessment) => {
          if (!assessment?.date) return;

          unified.push({
            id: `assessment-${assessment.id}`,
            source: "assessments",
            sourceId: assessment.id,
            title:
              assessment.title || "Assessment",
            date: assessment.date,
            completed:
              assessment.status === "completed",
            type: "Assessment",
            icon: "assessment",
            skill: assessment.type || "",
          });
        }
      );

      /*
       * --------------------------------------------------------
       * QUICK TASKS
       * --------------------------------------------------------
       */

      (Array.isArray(quickTasks) ? quickTasks : []).forEach(
        (task) => {
          unified.push({
            id: `quick-${task.id}`,
            source: "quickTasks",
            sourceId: task.id,
            title: task.task || "Task",
            date: task.dueDate || "",
            completed:
              task.status === "completed",
            type: "Task",
            icon: "task",
            skill: task.priority
              ? `${task.priority} Priority`
              : "",
          });
        }
      );

      /*
       * --------------------------------------------------------
       * TODAY'S TIMETABLE
       *
       * Timetable is recurring by weekday.
       * Therefore only today's entries become today's tasks.
       * --------------------------------------------------------
       */

      const currentWeekday =
        getCurrentWeekday();

      (Array.isArray(timetable)
        ? timetable
        : []
      ).forEach((entry) => {
        if (
          entry?.day !== currentWeekday ||
          !entry?.activity
        ) {
          return;
        }

        if (
          entry.status === "completed" ||
          entry.status === "missed"
        ) {
          return;
        }

        unified.push({
          id: `timetable-${entry.id}-${today}`,
          source: "timetable",
          sourceId: entry.id,
          title: entry.activity,
          date: today,
          completed:
            entry.status === "completed",
          type: "Timetable",
          icon: "timetable",
          skill: entry.category || "",
          startTime: entry.startTime || "",
          endTime: entry.endTime || "",
        });
      });

      const archivedKeys = new Set(
        todos
          .filter((item) => item?.archived === true)
          .map((item) => String(item.archiveKey || ""))
          .filter(Boolean)
      );

      const visibleLinkedTasks = unified.filter((task) => {
        const archiveKey = getLinkedArchiveKey(task);
        return !archiveKey || !archivedKeys.has(archiveKey);
      });

      setLinkedTasks(visibleLinkedTasks);
    } catch (error) {
      console.error(
        "Failed to load linked tasks:",
        error
      );

      setLinkedTasks([]);
    }
  }

  useEffect(() => {
    let unsubscribe = null;
    let isMounted = true;

    async function load() {
      try {
        /*
         * ======================================================
         * PERSONAL TO-DO LOAD
         * ======================================================
         */

        const localData =
          await getTodoList();

        const localTodos =
          Array.isArray(localData)
            ? localData
            : [];

        if (isMounted) {
          setTodos(
            localTodos.map((item) => ({
              ...item,
              id: String(item.id),
              date: item.date || "",
              completed:
                item.completed === true,
            }))
          );
        }

        /*
         * ======================================================
         * FIRESTORE
         * ======================================================
         */

        let cloudTodos = [];

        try {
          cloudTodos =
            await getItemsFromFirestore(
              "todoList"
            );

          if (!Array.isArray(cloudTodos)) {
            cloudTodos = [];
          }
        } catch (error) {
          console.error(
            "Failed to load todo list from Firestore:",
            error
          );
        }

        cloudTodos = cloudTodos.map(
          (item) => ({
            ...item,
            id: String(item.id),
            date: item.date || "",
            completed:
              item.completed === true,
          })
        );

        /*
         * ======================================================
         * MERGE
         * ======================================================
         */

        const mergedMap = new Map();

        localTodos.forEach((item) => {
          if (
            item?.id !== undefined &&
            item?.id !== null
          ) {
            mergedMap.set(
              String(item.id),
              {
                ...item,
                id: String(item.id),
                date: item.date || "",
                completed:
                  item.completed === true,
              }
            );
          }
        });

        cloudTodos.forEach((item) => {
          if (
            item?.id !== undefined &&
            item?.id !== null
          ) {
            mergedMap.set(
              String(item.id),
              item
            );
          }
        });

        const mergedTodos =
          Array.from(mergedMap.values());

        /*
         * ======================================================
         * ARCHIVE CLEANUP
         *
         * Only records already marked as archived are passed to
         * cleanupArchive. Active tasks are never removed merely
         * because their normal task date is old.
         * ======================================================
         */
        const archivedItems = mergedTodos.filter(
          (item) => item?.archived === true
        );

        const retainedArchivedItems =
          cleanupArchive(archivedItems);

        const retainedArchiveIds = new Set(
          retainedArchivedItems.map((item) =>
            String(item.id)
          )
        );

        const expiredArchivedItems =
          archivedItems.filter(
            (item) =>
              !retainedArchiveIds.has(
                String(item.id)
              )
          );

        const cleanedTodos = mergedTodos.filter(
          (item) =>
            item?.archived !== true ||
            retainedArchiveIds.has(
              String(item.id)
            )
        );

        for (const expiredItem of expiredArchivedItems) {
          try {
            await deleteItemFromFirestore(
              "todoList",
              String(expiredItem.id)
            );
          } catch (error) {
            console.error(
              "Failed to remove expired archived task:",
              error
            );
          }
        }

        if (isMounted) {
          setTodos(cleanedTodos);
        }

        await saveTodoList(
          cleanedTodos
        );

        /*
         * ======================================================
         * UPLOAD LOCAL-ONLY TASKS
         * ======================================================
         */

        const cloudIds = new Set(
          cloudTodos.map((item) =>
            String(item.id)
          )
        );

        for (const item of localTodos) {
          if (
            item?.id === undefined ||
            item?.id === null
          ) {
            continue;
          }

          const itemId =
            String(item.id);

          if (!cloudIds.has(itemId)) {
            try {
              await saveItemToFirestore(
                "todoList",
                itemId,
                {
                  ...item,
                  id: itemId,
                }
              );
            } catch (error) {
              console.error(
                "Failed to upload todo task:",
                error
              );
            }
          }
        }

        /*
         * ======================================================
         * FIRESTORE REAL-TIME LISTENER
         * ======================================================
         */

        unsubscribe =
          subscribeToFirestoreCollection(
            "todoList",
            async (firestoreItems) => {
              if (!isMounted) {
                return;
              }

              const normalized =
                Array.isArray(
                  firestoreItems
                )
                  ? firestoreItems.map(
                      (item) => ({
                        ...item,
                        id: String(
                          item.id
                        ),
                        date:
                          item.date ||
                          "",
                        completed:
                          item.completed ===
                          true,
                      })
                    )
                  : [];

              setTodos(normalized);

              try {
                await saveTodoList(
                  normalized
                );
              } catch (error) {
                console.error(
                  "Failed to update IndexedDB:",
                  error
                );
              }
            }
          );

        /*
         * ======================================================
         * LOAD LINKED SYSTEMS
         * ======================================================
         */

        await loadLinkedTasks();
      } catch (error) {
        console.error(
          "Failed to load todo list:",
          error
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();

    /*
     * Refresh when returning to the page/app.
     */

    function refreshLinkedTasks() {
      loadLinkedTasks();
    }

    window.addEventListener(
      "focus",
      refreshLinkedTasks
    );

    document.addEventListener(
      "visibilitychange",
      refreshLinkedTasks
    );

    return () => {
      isMounted = false;

      if (unsubscribe) {
        unsubscribe();
      }

      window.removeEventListener(
        "focus",
        refreshLinkedTasks
      );

      document.removeEventListener(
        "visibilitychange",
        refreshLinkedTasks
      );
    };
  }, []);

  useEffect(() => {
    loadLinkedTasks();
  }, [todos]);

  /*
   * ============================================================
   * PERSONAL TODO PERSIST
   * ============================================================
   */

  async function persist(
    updated,
    changedTodo = null
  ) {
    const normalized =
      updated.map((item) => ({
        ...item,
        id: String(item.id),
        date: item.date || "",
        completed:
          item.completed === true,
      }));

    setTodos(normalized);

    try {
      await saveTodoList(
        normalized
      );
    } catch (error) {
      console.error(
        "Failed to save todo list locally:",
        error
      );
    }

    if (changedTodo) {
      try {
        await saveItemToFirestore(
          "todoList",
          String(changedTodo.id),
          {
            ...changedTodo,
            id: String(
              changedTodo.id
            ),
          }
        );
      } catch (error) {
        console.error(
          "Failed to save todo task to Firestore:",
          error
        );
      }
    }
  }

  /*
   * ============================================================
   * ADD FORM
   * ============================================================
   */

  function openAddForm() {
    setEditingTodo(null);

    setForm({
      title: "",
      date: today,
    });

    setShowForm(true);
  }

  /*
   * ============================================================
   * EDIT PERSONAL TODO
   * ============================================================
   */

  function openEditForm(todo) {
    if (todo.source) {
      return;
    }

    setEditingTodo(todo);

    setForm({
      title: todo.title || "",
      date: todo.date || today,
    });

    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingTodo(null);

    setForm({
      ...emptyForm,
      date: today,
    });
  }

  /*
   * ============================================================
   * ADD / EDIT PERSONAL TASK
   * ============================================================
   */

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.title.trim()) {
      return;
    }

    if (editingTodo) {
      const updatedTodo = {
        ...editingTodo,
        id: String(
          editingTodo.id
        ),
        title:
          form.title.trim(),
        date: form.date || "",
        completed:
          editingTodo.completed ===
          true,
        completedAt:
          editingTodo.completedAt ||
          null,
      };

      const updated =
        todos.map((item) =>
          String(item.id) ===
          String(editingTodo.id)
            ? updatedTodo
            : item
        );

      await persist(
        updated,
        updatedTodo
      );
    } else {
      const newTodo = {
        id: String(Date.now()),
        title:
          form.title.trim(),
        date: form.date || "",
        completed: false,
        completedAt: null,
      };

      await persist(
        [...todos, newTodo],
        newTodo
      );
    }

    closeForm();
  }

  /*
   * ============================================================
   * TOGGLE PERSONAL TODO
   * ============================================================
   */

  async function togglePersonalTodo(todo) {
    const completed =
      todo.completed !== true;

    const updatedTodo = {
      ...todo,
      id: String(todo.id),
      completed,
      completedAt: completed
        ? new Date().toISOString()
        : null,
    };

    const updated =
      todos.map((item) =>
        String(item.id) ===
        String(todo.id)
          ? updatedTodo
          : item
      );

    await persist(
      updated,
      updatedTodo
    );
  }

  /*
   * ============================================================
   * TOGGLE LINKED TASK
   * ============================================================
   */

  async function toggleLinkedTask(task) {
    const completed =
      task.completed !== true;

    try {
      /*
       * LEARNING
       */

      if (
        task.source ===
        "learning"
      ) {
        const topics =
          await getTopics();

        const updated =
          topics.map((topic) =>
            String(topic.id) ===
            String(task.sourceId)
              ? {
                  ...topic,
                  status:
                    completed
                      ? "completed"
                      : "remaining",
                  completedAt:
                    completed
                      ? topic.completedAt ||
                        today
                      : topic.completedAt,
                }
              : topic
          );

        await saveTopics(
          updated
        );
      }

      /*
       * GOALS
       */

      else if (
        task.source ===
        "goals"
      ) {
        const goals =
          await getGoals();

        const updated =
          goals.map((goal) =>
            String(goal.id) ===
            String(task.sourceId)
              ? {
                  ...goal,
                  status:
                    completed
                      ? "completed"
                      : "pending",
                }
              : goal
          );

        await saveGoals(
          updated
        );
      }

      /*
       * ASSESSMENTS
       */

      else if (
        task.source ===
        "assessments"
      ) {
        const assessments =
          await getAssessments();

        const updated =
          assessments.map(
            (assessment) =>
              String(
                assessment.id
              ) ===
              String(
                task.sourceId
              )
                ? {
                    ...assessment,
                    status:
                      completed
                        ? "completed"
                        : "upcoming",
                  }
                : assessment
          );

        await saveAssessments(
          updated
        );
      }

      /*
       * QUICK TASKS
       */

      else if (
        task.source ===
        "quickTasks"
      ) {
        const quickTasks =
          await getQuickTasks();

        const updated =
          quickTasks.map(
            (item) =>
              String(item.id) ===
              String(
                task.sourceId
              )
                ? {
                    ...item,
                    status:
                      completed
                        ? "completed"
                        : "pending",
                  }
                : item
          );

        await saveQuickTasks(
          updated
        );
      }

      /*
       * TIMETABLE
       */

      else if (
        task.source ===
        "timetable"
      ) {
        const timetable =
          await getTimetable();

        const updated =
          timetable.map(
            (entry) =>
              String(entry.id) ===
              String(
                task.sourceId
              )
                ? {
                    ...entry,
                    status:
                      completed
                        ? "completed"
                        : "planned",
                  }
                : entry
          );

        await saveTimetable(
          updated
        );
      }

      await loadLinkedTasks();
    } catch (error) {
      console.error(
        "Failed to update linked task:",
        error
      );
    }
  }

  /*
   * ============================================================
   * DELETE PERSONAL TODO
   * ============================================================
   */

  async function deleteTodo(todo) {
    if (todo.source) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${todo.title}"?`
      );

    if (!confirmed) {
      return;
    }

    const updated =
      todos.filter(
        (item) =>
          String(item.id) !==
          String(todo.id)
      );

    setTodos(updated);

    try {
      await saveTodoList(
        updated
      );
    } catch (error) {
      console.error(
        "Failed to delete todo locally:",
        error
      );
    }

    try {
      await deleteItemFromFirestore(
        "todoList",
        String(todo.id)
      );
    } catch (error) {
      console.error(
        "Failed to delete todo from Firestore:",
        error
      );
    }
  }

  /*
   * ============================================================
   * ARCHIVE
   * ============================================================
   */

  async function archiveTodo(todo) {
    if (!todo || todo.completed !== true) {
      return;
    }

    const now = new Date().toISOString();

    /*
     * PERSONAL TODO
     */
    if (!todo.source) {
      const originalId = String(
        todo.originalId ?? todo.id
      );

      const originalTodo = todos.find(
        (item) => String(item.id) === originalId
      );

      if (!originalTodo) {
        console.error(
          "Archive failed: personal todo was not found.",
          originalId
        );
        return;
      }

      const archivedTodo = {
        ...originalTodo,
        id: originalId,
        completed: true,
        completedAt: originalTodo.completedAt || now,
        archived: true,
        archivedAt: now,
        archiveDate: now,
        archiveKey: `personal:${originalId}:`,
        archiveSource: "personal",
      };

      const updated = todos.map((item) =>
        String(item.id) === originalId
          ? archivedTodo
          : item
      );

      await persist(updated, archivedTodo);
      return;
    }

    /*
     * LINKED TASK
     *
     * Linked tasks belong to Learning, Goals, Assessments,
     * Quick Tasks or Timetable. Their source record must stay
     * completed, while a separate archive record is created in
     * todoList so the source data is not damaged.
     */
    const archiveKey = getLinkedArchiveKey(todo);

    if (!archiveKey) {
      console.error(
        "Archive failed: linked task has no archive key.",
        todo
      );
      return;
    }

    const existing = todos.find(
      (item) =>
        item?.archived === true &&
        String(item.archiveKey || "") === archiveKey
    );

    if (existing) {
      return;
    }

    const archivedTodo = {
      id: `archive-${todo.source}-${String(todo.sourceId)}-${String(
        todo.date || ""
      ).replace(/[^0-9A-Za-z_-]/g, "")}`,
      title: todo.title || "Archived task",
      date: todo.date || "",
      completed: true,
      completedAt: todo.completedAt || now,
      archived: true,
      archivedAt: now,
      archiveDate: now,
      archiveKey,
      archiveSource: todo.source,
      source: todo.source,
      sourceId: todo.sourceId,
      type: todo.type || "Task",
      icon: todo.icon || "task",
      skill: todo.skill || "",
      startTime: todo.startTime || "",
      endTime: todo.endTime || "",
    };

    await persist(
      [...todos, archivedTodo],
      archivedTodo
    );
  }

  async function restoreArchivedTodo(item) {
    if (!item) {
      return;
    }

    /* Restore linked source task first. */
    if (item.source) {
      await toggleLinkedTask({
        ...item,
        completed: true,
      });

      const updated = todos.filter(
        (todo) => String(todo.id) !== String(item.id)
      );

      setTodos(updated);

      try {
        await saveTodoList(updated);
      } catch (error) {
        console.error(
          "Failed to remove restored linked archive locally:",
          error
        );
      }

      try {
        await deleteItemFromFirestore(
          "todoList",
          String(item.id)
        );
      } catch (error) {
        console.error(
          "Failed to remove restored linked archive from Firestore:",
          error
        );
      }

      return;
    }

    const restoredTodo = {
      ...item,
      archived: false,
    };

    delete restoredTodo.archivedAt;
    delete restoredTodo.archiveDate;
    delete restoredTodo.archiveKey;
    delete restoredTodo.archiveSource;

    const updated = todos.map((todo) =>
      String(todo.id) === String(item.id)
        ? restoredTodo
        : todo
    );

    await persist(updated, restoredTodo);
  }

  async function deleteArchivedTodo(item) {
    const confirmed = window.confirm(
      `Permanently delete "${item.title || "Archived task"}"?`
    );

    if (!confirmed) {
      return;
    }

    const updated = todos.filter(
      (todo) =>
        String(todo.id) !== String(item.id)
    );

    setTodos(updated);

    try {
      await saveTodoList(updated);
    } catch (error) {
      console.error(
        "Failed to update archived tasks locally:",
        error
      );
    }

    try {
      await deleteItemFromFirestore(
        "todoList",
        String(item.id)
      );
    } catch (error) {
      console.error(
        "Failed to permanently delete archived task:",
        error
      );
    }
  }

  const archivedTasks = useMemo(
    () =>
      todos
        .filter((task) => task?.archived === true)
        .sort((a, b) =>
          String(b.archivedAt || "").localeCompare(
            String(a.archivedAt || "")
          )
        ),
    [todos]
  );

  /*
   * ============================================================
   * ALL UNIFIED TASKS
   * ============================================================
   */

  const allTasks = useMemo(() => {
    const personal =
      todos
        .filter((todo) => todo?.archived !== true)
        .map((todo) => ({
        ...todo,
        id: `personal-${todo.id}`,
        originalId: todo.id,
        source: null,
        type: "Task",
        icon: "task",
        date: todo.date || "",
      }));

    return [
      ...personal,
      ...linkedTasks,
    ];
  }, [todos, linkedTasks]);

  /*
   * ============================================================
   * GROUPS
   * ============================================================
   */

  const todayTasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          !task.completed &&
          getDateStatus(
            task.date,
            today
          ) === "today"
      ),
    [allTasks, today]
  );

  const upcomingTasks = useMemo(
    () =>
      allTasks
        .filter(
          (task) =>
            !task.completed &&
            getDateStatus(
              task.date,
              today
            ) === "upcoming"
        )
        .sort((a, b) =>
          String(a.date || "").localeCompare(
            String(b.date || "")
          )
        ),
    [allTasks, today]
  );

  const overdueTasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          !task.completed &&
          getDateStatus(
            task.date,
            today
          ) === "overdue"
      ),
    [allTasks, today]
  );

  const noDateTasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          !task.completed &&
          getDateStatus(
            task.date,
            today
          ) === "no-date"
      ),
    [allTasks, today]
  );

  const completedTasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          task.completed === true
      ),
    [allTasks]
  );

  /*
   * ============================================================
   * ICON
   * ============================================================
   */

  function TaskIcon({ task }) {
    if (task.icon === "learning") {
      return <BookOpen size={18} />;
    }

    if (task.icon === "goal") {
      return <Target size={18} />;
    }

    if (task.icon === "assessment") {
      return (
        <ClipboardCheck
          size={18}
        />
      );
    }

    if (task.icon === "timetable") {
      return (
        <Clock3 size={18} />
      );
    }

    return (
      <ListTodo size={18} />
    );
  }

  /*
   * ============================================================
   * TASK ROW
   * ============================================================
   */

  function TaskRow({ task }) {
    const isLinked =
      Boolean(task.source);

    return (
      <div
        className="topic-row"
        key={task.id}
      >
        <div className="topic-information">
          <strong
            style={
              task.completed
                ? {
                    textDecoration:
                      "line-through",
                  }
                : undefined
            }
          >
            {task.title}
          </strong>

          <span
            style={{
              display: "flex",
              alignItems:
                "center",
              gap: "6px",
              flexWrap: "wrap",
            }}
          >
            <TaskIcon
              task={task}
            />

            {task.type}

            {task.date &&
              ` • ${formatDate(
                task.date
              )}`}

            {task.startTime &&
              ` • ${task.startTime}`}

            {task.endTime &&
              ` - ${task.endTime}`}

            {task.skill &&
              ` • ${task.skill}`}
          </span>
        </div>

        <div className="topic-actions">
          <button
            type="button"
            className="edit-button"
            title={
              task.completed
                ? "Mark incomplete"
                : "Mark complete"
            }
            onClick={() =>
              isLinked
                ? toggleLinkedTask(
                    task
                  )
                : togglePersonalTodo(
                    {
                      ...task,
                      id:
                        task.originalId,
                    }
                  )
            }
          >
            {task.completed ? (
              <Circle size={18} />
            ) : (
              <CheckCircle2
                size={18}
              />
            )}
          </button>

          {!isLinked && (
            <>
              <button
                type="button"
                className="edit-button"
                title="Edit task"
                onClick={() =>
                  openEditForm({
                    ...task,
                    id:
                      task.originalId,
                  })
                }
              >
                <Pencil
                  size={17}
                />
              </button>

              <button
                type="button"
                className="delete-button"
                title="Delete task"
                onClick={() =>
                  deleteTodo({
                    ...task,
                    id:
                      task.originalId,
                  })
                }
              >
                <Trash2
                  size={17}
                />
              </button>

            </>
          )}

          {task.completed && (
            <button
              type="button"
              className="edit-button"
              title="Archive completed task"
              onClick={() => archiveTodo(task)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                minWidth: "82px",
              }}
            >
              <ArchiveIcon size={17} />
              <span>Archive</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (loading) {
    return (
      <div className="module-page">
        <h1>✅ To-Do</h1>

        <p>
          Loading to-do list...
        </p>
      </div>
    );
  }

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <div className="module-page">
      {/* HEADER */}

      <div className="page-header">
        <div>
          <h1>✅ To-Do</h1>

          <p>
            One place for your tasks,
            study plans, goals and
            scheduled work.
          </p>

          <p
            style={{
              fontSize: "13px",
              opacity: 0.7,
              marginTop: "4px",
            }}
          >
            Tasks are shown by their
            actual date.
          </p>
        </div>

        <button
          className="add-topic-button"
          onClick={openAddForm}
        >
          <Plus size={18} />
          Add Task
        </button>
      </div>

      {/* STATS */}

      <section className="stat-grid">
        <div className="stat-card">
          <ListTodo size={25} />

          <span>
            Total
          </span>

          <strong>
            {allTasks.length}
          </strong>
        </div>

        <div className="stat-card">
          <CalendarDays
            size={25}
          />

          <span>
            Today
          </span>

          <strong>
            {todayTasks.length}
          </strong>
        </div>

        <div className="stat-card">
          <Clock3 size={25} />

          <span>
            Upcoming
          </span>

          <strong>
            {upcomingTasks.length}
          </strong>
        </div>

        <div className="stat-card">
          <CheckCircle2
            size={25}
          />

          <span>
            Completed
          </span>

          <strong>
            {completedTasks.length}
          </strong>
        </div>
      </section>

      {/* ADD / EDIT FORM */}

      <Modal
        isOpen={showForm}
        onClose={closeForm}
        showCloseButton={false}
        className="todo-form-modal"
      >
        <section className="module-form-card">
          <div className="add-topic-header">
            <h2>
              {editingTodo
                ? "Edit Task"
                : "Add Task"}
            </h2>

            <button
              type="button"
              className="close-button"
              onClick={closeForm}
            >
              <X size={20} />
            </button>
          </div>

          <form
            className="grid-form"
            onSubmit={handleSubmit}
          >
            <div className="form-group">
              <label>
                Task *
              </label>

              <input
                type="text"
                placeholder="Example: Clean study table"
                value={form.title}
                onChange={(event) =>
                  setForm({
                    ...form,
                    title: event.target.value,
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Date</label>

              <input
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm({
                    ...form,
                    date: event.target.value,
                  })
                }
              />
            </div>

            <button
              type="submit"
              className="save-topic-button"
            >
              {editingTodo
                ? "Save Changes"
                : "Add Task"}
            </button>
          </form>
        </section>
      </Modal>

      {/* TODAY */}

      <section
        className="learning-section"
        style={{
          marginTop: 20,
        }}
      >
        <div className="topic-header">
          <div>
            <h2>
              📅 Today
            </h2>

            <p>
              Tasks scheduled for
              today.
            </p>
          </div>
        </div>

        <div className="topic-list">
          {todayTasks.map(
            (task) => (
              <TaskRow
                key={task.id}
                task={task}
              />
            )
          )}

          {todayTasks.length ===
            0 && (
            <p className="empty-topics">
              Nothing scheduled
              for today.
            </p>
          )}
        </div>
      </section>

      {/* UPCOMING */}

      <section
        className="learning-section"
        style={{
          marginTop: 20,
        }}
      >
        <div className="topic-header">
          <div>
            <h2>
              🔜 Upcoming
            </h2>

            <p>
              Future tasks stay here
              until their actual date.
            </p>
          </div>
        </div>

        <div className="topic-list">
          {upcomingTasks.map(
            (task) => (
              <TaskRow
                key={task.id}
                task={task}
              />
            )
          )}

          {upcomingTasks.length ===
            0 && (
            <p className="empty-topics">
              No upcoming tasks.
            </p>
          )}
        </div>
      </section>

      {/* OVERDUE */}

      <section
        className="learning-section"
        style={{
          marginTop: 20,
        }}
      >
        <div className="topic-header">
          <div>
            <h2>
              ⚠️ Overdue
            </h2>

            <p>
              Tasks whose date has
              already passed.
            </p>
          </div>
        </div>

        <div className="topic-list">
          {overdueTasks.map(
            (task) => (
              <TaskRow
                key={task.id}
                task={task}
              />
            )
          )}

          {overdueTasks.length ===
            0 && (
            <p className="empty-topics">
              No overdue tasks.
            </p>
          )}
        </div>
      </section>

      {/* NO DATE */}

      {noDateTasks.length >
        0 && (
        <section
          className="learning-section"
          style={{
            marginTop: 20,
          }}
        >
          <div className="topic-header">
            <div>
              <h2>
                📝 No Date
              </h2>

              <p>
                Tasks without a
                scheduled date.
              </p>
            </div>
          </div>

          <div className="topic-list">
            {noDateTasks.map(
              (task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                />
              )
            )}
          </div>
        </section>
      )}

      {/* COMPLETED */}

      <section
        className="learning-section"
        style={{
          marginTop: 20,
        }}
      >
        <div className="topic-header">
          <div>
            <h2>
              ✅ Completed
            </h2>

            <p>
              Finished tasks from all
              Taskbar systems.
            </p>
          </div>
        </div>

        <div className="topic-list">
          {completedTasks.map(
            (task) => (
              <TaskRow
                key={task.id}
                task={task}
              />
            )
          )}

          {completedTasks.length ===
            0 && (
            <p className="empty-topics">
              No completed tasks.
            </p>
          )}
        </div>
      </section>


      {/* ARCHIVE */}

      <section
        className="learning-section"
        style={{
          marginTop: 20,
        }}
      >
        <div className="topic-header">
          <div>
            <h2>
              <ArchiveIcon
                size={20}
                style={{
                  verticalAlign: "middle",
                  marginRight: "7px",
                }}
              />
              Archive
            </h2>

            <p>
              Completed personal tasks can be archived here.
              Archived records are retained for {ARCHIVE_RETENTION_DAYS} days.
            </p>
          </div>
        </div>

        <div className="topic-list">
          {archivedTasks.map((task) => {
            const age = getArchiveAge(task);
            const remaining = getArchiveDaysRemaining(task);

            return (
              <div
                className="topic-row"
                key={`archive-${task.id}`}
              >
                <div className="topic-information">
                  <strong>
                    {task.title}
                  </strong>

                  <span>
                    <ArchiveIcon size={16} />
                    Archived {age} day{age === 1 ? "" : "s"} ago
                    {" • "}
                    {remaining > 0
                      ? `${remaining} day${remaining === 1 ? "" : "s"} remaining`
                      : "Expires now"}
                  </span>
                </div>

                <div className="topic-actions">
                  <button
                    type="button"
                    className="edit-button"
                    title="Restore task"
                    onClick={() =>
                      restoreArchivedTodo(task)
                    }
                  >
                    <RotateCcw size={17} />
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    title="Permanently delete archive item"
                    onClick={() =>
                      deleteArchivedTodo(task)
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            );
          })}

          {archivedTasks.length === 0 && (
            <p className="empty-topics">
              Archive is empty.
            </p>
          )}
        </div>
      </section>

    </div>
  );
}

export default TodoList;