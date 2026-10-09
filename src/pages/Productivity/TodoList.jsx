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
} from "lucide-react";

import {
  getTopics,
  saveTopics,
  getGoals,
  saveGoals,
  getAssessments,
  saveAssessments,
} from "../../utils/db";

import {
  getItemsFromFirestore,
  saveItemToFirestore,
  deleteItemFromFirestore,
  subscribeToFirestoreCollection,
} from "../../firebase/firestore";

import { getTodayLocalDateKey } from "../../utils/calculations";
import Modal from "../../components/common/Modal";


const HISTORY_CATEGORY = "Tasks";
const COMPLETED_RETENTION_DAYS = 2;

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


function getCompletedAgeInDays(value) {
  if (!value) return Infinity;

  const completedDate = new Date(value);
  if (Number.isNaN(completedDate.getTime())) return Infinity;

  const now = new Date();
  const diff = now.getTime() - completedDate.getTime();

  return diff / (24 * 60 * 60 * 1000);
}

function isCompletedWithinRetention(value) {
  const age = getCompletedAgeInDays(value);
  return age >= 0 && age < COMPLETED_RETENTION_DAYS;
}


function TodoList() {
  const [todos, setTodos] = useState([]);
  const [linkedTasks, setLinkedTasks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [historyClock, setHistoryClock] = useState(Date.now());

  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);

  const [form, setForm] = useState(emptyForm);

  const today = getTodayLocalDateKey();

  // Refresh the 2-day completed-task boundary automatically.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setHistoryClock(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

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
        assessments,
      ] = await Promise.all([
        getTopics(),
        getGoals(),
        getAssessments(),
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
            completedAt:
              topic.completedAtTimestamp ||
              topic.completedAt ||
              null,
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
            completedAt: goal.completedAt || null,
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
            completedAt: assessment.completedAt || null,
            type: "Assessment",
            icon: "assessment",
            skill: assessment.type || "",
          });
        }
      );

            // Linked tasks remain owned by Learning, Goals, or Assessments.
      // Their original record supplies the completion timestamp used by Reports History.
      setLinkedTasks(unified);
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
         *
         * Firestore is the single source of truth.
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

        const normalizedCloudTodos =
          cloudTodos.map((item) => {
            const normalized = {
              ...item,
              id: String(item.id),
              date: item.date || "",
              completed:
                item.completed === true,
            };

            if (normalized.completed && !normalized.source) {
              normalized.historyCategory =
                normalized.historyCategory ||
                HISTORY_CATEGORY;
              normalized.completedAt =
                normalized.completedAt ||
                normalized.completedAtTimestamp ||
                null;
            }

            return normalized;
          });

        if (isMounted) {
          setTodos(normalizedCloudTodos);
        }

        /*
         * ======================================================
         * FIRESTORE REAL-TIME LISTENER
         * ======================================================
         */

        unsubscribe =
          subscribeToFirestoreCollection(
            "todoList",
            (firestoreItems) => {
              if (!isMounted) {
                return;
              }

              const normalized =
                Array.isArray(firestoreItems)
                  ? firestoreItems.map((item) => {
                      const normalizedItem = {
                        ...item,
                        id: String(item.id),
                        date: item.date || "",
                        completed:
                          item.completed === true,
                      };

                      if (
                        normalizedItem.completed &&
                        !normalizedItem.source
                      ) {
                        normalizedItem.historyCategory =
                          normalizedItem.historyCategory ||
                          HISTORY_CATEGORY;
                        normalizedItem.completedAt =
                          normalizedItem.completedAt ||
                          normalizedItem.completedAtTimestamp ||
                          null;
                      }

                      return normalizedItem;
                    })
                  : [];

              setTodos(normalized);
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

    if (completed) {
      updatedTodo.historyCategory =
        HISTORY_CATEGORY;
    } else {
      delete updatedTodo.historyCategory;
    }

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
    const completedAt = completed
      ? new Date().toISOString()
      : null;

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
                  completedAt,
                  completedAtTimestamp: completedAt,
                  ...(completed
                    ? {
                        historyCategory:
                          "Learning",
                      }
                    : {
                        historyCategory:
                          undefined,
                      }),
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
                  completedAt,
                  ...(completed
                    ? {
                        historyCategory: "Goals",
                      }
                    : {
                        historyCategory: undefined,
                      }),
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
                ? (() => {
                    const updatedAssessment = {
                      ...assessment,
                      status:
                        completed
                          ? "completed"
                          : "upcoming",
                      completedAt,
                    };

                    if (completed) {
                      updatedAssessment.historyCategory =
                        "Assessments";
                    } else {
                      delete updatedAssessment.historyCategory;
                      delete updatedAssessment.completedAt;
                    }

                    return updatedAssessment;
                  })()
                : assessment
          );

        await saveAssessments(
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
   * ALL UNIFIED TASKS
   * ============================================================
   */

  const allTasks = useMemo(() => {
    const personal =
      todos.map((todo) => ({
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

  // Completed tasks stay visible for 2 days.
  // After 2 days they are no longer shown here and become History items in Reports.
  const completedTasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          task.completed &&
          isCompletedWithinRetention(task.completedAt)
      ),
    [allTasks, historyClock]
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

    return <ListTodo size={18} />;
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


      {/* COMPLETED - 2 DAY RETENTION */}

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
              Completed tasks stay here for 2 full days (48 hours) before moving to History.
            </p>
          </div>
        </div>

        <div className="topic-list">
          {completedTasks.map((task) => (
            <TaskRow
              key={`completed-${task.id}`}
              task={task}
            />
          ))}

          {completedTasks.length === 0 && (
            <p className="empty-topics">
              No recently completed tasks.
            </p>
          )}
        </div>
      </section>



    </div>
  );
}

export default TodoList;