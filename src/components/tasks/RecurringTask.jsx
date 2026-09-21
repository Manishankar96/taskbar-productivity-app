import { useEffect, useMemo, useState } from "react";
import {
  getItemsFromFirestore,
  saveItemToFirestore,
  deleteItemFromFirestore,
} from "../../firebase/firestore";
import { Plus, Repeat, Trash2, X } from "lucide-react";

const RECURRING_TASKS_COLLECTION = "recurringTasks";

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function formatFrequency(task) {
  const frequency =
    task?.frequency ||
    task?.recurrence ||
    task?.repeatType ||
    "daily";

  const normalized = String(frequency).toLowerCase();

  if (normalized === "weekly") return "Weekly";
  if (normalized === "monthly") return "Monthly";
  return "Daily";
}

function isTaskActive(task) {
  return (
    task?.active !== false &&
    task?.enabled !== false &&
    task?.status !== "inactive"
  );
}

function getTaskTitle(task) {
  return (
    task?.title ||
    task?.name ||
    task?.task ||
    "Recurring Task"
  );
}

function getNextDate(task) {
  const value =
    task?.nextDate ||
    task?.nextRunDate ||
    task?.date ||
    task?.startDate;

  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getTodayKey() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}-${String(now.getDate()).padStart(
    2,
    "0"
  )}`;
}

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  date.setDate(date.getDate() + amount);

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )}`;
}

function addMonths(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  date.setMonth(date.getMonth() + amount);

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )}`;
}

function calculateNextDate(task) {
  const current =
    task?.nextDate ||
    task?.nextRunDate ||
    task?.date ||
    task?.startDate ||
    getTodayKey();

  const frequency =
    task?.frequency ||
    task?.recurrence ||
    task?.repeatType ||
    "daily";

  const normalized = String(frequency).toLowerCase();

  if (normalized === "weekly") {
    return addDays(current, 7);
  }

  if (normalized === "monthly") {
    return addMonths(current, 1);
  }

  return addDays(current, 1);
}

function emptyForm() {
  return {
    title: "",
    frequency: "daily",
    startDate: getTodayKey(),
  };
}

export default function RecurringTask() {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadTasks() {
    try {
      setError("");

      const data = await getItemsFromFirestore(
        RECURRING_TASKS_COLLECTION
      );

      setTasks(Array.isArray(data) ? data : []);
    } catch (loadError) {
      console.error(
        "Failed to load recurring tasks:",
        loadError
      );
      setError("Unable to load recurring tasks.");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await getItemsFromFirestore(
          RECURRING_TASKS_COLLECTION
        );

        if (active) {
          setTasks(Array.isArray(data) ? data : []);
        }
      } catch (loadError) {
        console.error(
          "Failed to load recurring tasks:",
          loadError
        );

        if (active) {
          setError("Unable to load recurring tasks.");
          setTasks([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    const refresh = () => {
      loadTasks();
    };

    window.addEventListener(
      "taskbarRecurringTasksUpdated",
      refresh
    );
    window.addEventListener("storage", refresh);

    return () => {
      active = false;

      window.removeEventListener(
        "taskbarRecurringTasksUpdated",
        refresh
      );
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const activeTasks = useMemo(
    () => tasks.filter(isTaskActive),
    [tasks]
  );

  async function handleCreate(event) {
    event.preventDefault();

    const title = form.title.trim();

    if (!title) {
      setError("Please enter a task name.");
      return;
    }

    if (!form.startDate) {
      setError("Please select a start date.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const id = `recurring-${Date.now()}`;

      const task = {
        id,
        title,
        frequency: form.frequency,
        recurrence: form.frequency,
        startDate: form.startDate,
        nextDate: form.startDate,
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

      setTasks((previous) => [...previous, task]);
      setForm(emptyForm());
      setShowForm(false);

      window.dispatchEvent(
        new Event("taskbarRecurringTasksUpdated")
      );
    } catch (saveError) {
      console.error(
        "Failed to create recurring task:",
        saveError
      );
      setError("Unable to create recurring task.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(task) {
    const active = !isTaskActive(task);

    const updated = {
      ...task,
      active,
      enabled: active,
      status: active ? "active" : "inactive",
      updatedAt: new Date().toISOString(),
    };

    try {
      setError("");

      await saveItemToFirestore(
        RECURRING_TASKS_COLLECTION,
        task.id,
        updated
      );

      setTasks((previous) =>
        previous.map((item) =>
          item.id === task.id ? updated : item
        )
      );

      window.dispatchEvent(
        new Event("taskbarRecurringTasksUpdated")
      );
    } catch (toggleError) {
      console.error(
        "Failed to update recurring task:",
        toggleError
      );
      setError("Unable to update recurring task.");
    }
  }

  async function handleDelete(task) {
    const confirmed = window.confirm(
      `Delete recurring task "${getTaskTitle(task)}"?`
    );

    if (!confirmed) return;

    try {
      setError("");

      if (typeof deleteItemFromFirestore === "function") {
        await deleteItemFromFirestore(
          RECURRING_TASKS_COLLECTION,
          task.id
        );
      } else {
        // The existing Firestore helper may not expose a delete
        // function in every TASKBAR version. In that case, keep
        // the operation safe rather than guessing another API.
        setError(
          "Delete is not available in the current Firestore helper."
        );
        return;
      }

      setTasks((previous) =>
        previous.filter((item) => item.id !== task.id)
      );

      window.dispatchEvent(
        new Event("taskbarRecurringTasksUpdated")
      );
    } catch (deleteError) {
      console.error(
        "Failed to delete recurring task:",
        deleteError
      );
      setError("Unable to delete recurring task.");
    }
  }

  async function handleRunNow(task) {
    const today = getTodayKey();

    const updated = {
      ...task,
      lastGeneratedDate: today,
      nextDate: calculateNextDate({
        ...task,
        nextDate: today,
      }),
      updatedAt: new Date().toISOString(),
    };

    try {
      setError("");

      await saveItemToFirestore(
        RECURRING_TASKS_COLLECTION,
        task.id,
        updated
      );

      setTasks((previous) =>
        previous.map((item) =>
          item.id === task.id ? updated : item
        )
      );

      window.dispatchEvent(
        new Event("taskbarRecurringTasksUpdated")
      );
    } catch (runError) {
      console.error(
        "Failed to update recurring task date:",
        runError
      );
      setError("Unable to update the recurring task.");
    }
  }

  return (
    <div
      className="recurring-task-page"
      style={{
        width: "100%",
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <div
        className="section-card"
        style={{
          padding: "24px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <Repeat size={24} />
              <h1 style={{ margin: 0 }}>
                Recurring Tasks
              </h1>
            </div>

            <p
              style={{
                margin: "8px 0 0",
                opacity: 0.72,
              }}
            >
              Create tasks that repeat on a regular schedule.
            </p>
          </div>

          <button
            type="button"
            className="view-button"
            onClick={() => {
              setError("");
              setShowForm((value) => !value);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
            }}
          >
            {showForm ? (
              <X size={18} />
            ) : (
              <Plus size={18} />
            )}
            {showForm ? "Close" : "Add Recurring Task"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="section-card"
          style={{
            padding: "14px 16px",
            marginBottom: "20px",
            border: "1px solid rgba(255, 80, 80, 0.35)",
          }}
        >
          {error}
        </div>
      )}

      {showForm && (
        <form
          className="section-card"
          onSubmit={handleCreate}
          style={{
            padding: "24px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "7px",
              }}
            >
              <span>Task name</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
                placeholder="Example: Java practice"
                style={{
                  padding: "11px 12px",
                  borderRadius: "9px",
                  border:
                    "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.05)",
                  color: "inherit",
                  outline: "none",
                }}
              />
            </label>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "7px",
              }}
            >
              <span>Repeat</span>
              <select
                value={form.frequency}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    frequency: event.target.value,
                  }))
                }
                style={{
                  padding: "11px 12px",
                  borderRadius: "9px",
                  border:
                    "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.05)",
                  color: "inherit",
                  outline: "none",
                }}
              >
                {FREQUENCIES.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "7px",
              }}
            >
              <span>Start date</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    startDate: event.target.value,
                  }))
                }
                style={{
                  padding: "11px 12px",
                  borderRadius: "9px",
                  border:
                    "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.05)",
                  color: "inherit",
                  outline: "none",
                }}
              />
            </label>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "18px",
            }}
          >
            <button
              type="submit"
              className="view-button"
              disabled={saving}
              style={{
                cursor: saving
                  ? "not-allowed"
                  : "pointer",
                opacity: saving ? 0.65 : 1,
              }}
            >
              {saving ? "Saving..." : "Create Task"}
            </button>

            <button
              type="button"
              className="view-button"
              onClick={() => {
                setForm(emptyForm());
                setShowForm(false);
              }}
              style={{
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div
        className="section-card"
        style={{
          padding: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>
              Your Recurring Tasks
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                opacity: 0.7,
              }}
            >
              {activeTasks.length} active
            </p>
          </div>
        </div>

        {loading ? (
          <p className="empty-topics">
            Loading recurring tasks...
          </p>
        ) : tasks.length === 0 ? (
          <p className="empty-topics">
            No recurring tasks yet. Create your first one
            above.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {tasks.map((task) => {
              const active = isTaskActive(task);

              return (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                    flexWrap: "wrap",
                    padding: "16px",
                    borderRadius: "12px",
                    background:
                      "rgba(255,255,255,0.04)",
                    border:
                      "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <strong
                      style={{
                        display: "block",
                        fontSize: "1rem",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {getTaskTitle(task)}
                    </strong>

                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        flexWrap: "wrap",
                        marginTop: "7px",
                        fontSize: "0.9rem",
                        opacity: 0.72,
                      }}
                    >
                      <span>
                        {formatFrequency(task)}
                      </span>

                      {getNextDate(task) && (
                        <span>
                          Next: {getNextDate(task)}
                        </span>
                      )}

                      <span>
                        {active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className="view-button"
                      onClick={() =>
                        handleToggle(task)
                      }
                      style={{ cursor: "pointer" }}
                    >
                      {active ? "Pause" : "Activate"}
                    </button>

                    {active && (
                      <button
                        type="button"
                        className="view-button"
                        onClick={() =>
                          handleRunNow(task)
                        }
                        style={{ cursor: "pointer" }}
                      >
                        Update Next Date
                      </button>
                    )}

                    <button
                      type="button"
                      aria-label={`Delete ${getTaskTitle(
                        task
                      )}`}
                      onClick={() =>
                        handleDelete(task)
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "40px",
                        height: "40px",
                        borderRadius: "9px",
                        border:
                          "1px solid rgba(255,255,255,0.12)",
                        background:
                          "rgba(255,255,255,0.05)",
                        color: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
