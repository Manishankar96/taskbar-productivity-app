import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { getTodoList, saveTodoList } from "../../utils/db";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const EMPTY_FORM = {
  title: "",
  date: "",
};

function toDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getTodayKey() {
  const date = new Date();
  return toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateKey(value) {
  if (!value) return null;

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(value) {
  const date = parseDateKey(value);
  if (!date) return "";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getInitialMonth() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function CalendarView() {
  const [visibleMonth, setVisibleMonth] = useState(getInitialMonth);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const todayKey = getTodayKey();
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();

  useEffect(() => {
    let active = true;

    async function loadCalendarData() {
      setLoading(true);
      setError("");

      try {
        const todoData = await getTodoList();

        if (!active) return;

        setTasks(Array.isArray(todoData) ? todoData : []);
      } catch (err) {
        console.error("Failed to load calendar data:", err);

        if (active) {
          setError(
            err?.message ||
              "Failed to load calendar data. Please try again."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCalendarData();

    return () => {
      active = false;
    };
  }, []);

  const monthDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousMonthDays = new Date(year, month, 0).getDate();

    const cells = [];

    for (let index = firstDay - 1; index >= 0; index -= 1) {
      const day = previousMonthDays - index;
      const date = new Date(year, month - 1, day);

      cells.push({
        date,
        key: toDateKey(
          date.getFullYear(),
          date.getMonth(),
          date.getDate()
        ),
        currentMonth: false,
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);

      cells.push({
        date,
        key: toDateKey(year, month, day),
        currentMonth: true,
      });
    }

    let nextDay = 1;

    while (cells.length < 42) {
      const date = new Date(year, month + 1, nextDay);

      cells.push({
        date,
        key: toDateKey(
          date.getFullYear(),
          date.getMonth(),
          date.getDate()
        ),
        currentMonth: false,
      });

      nextDay += 1;
    }

    return cells;
  }, [year, month]);

  const tasksByDate = useMemo(() => {
    const grouped = {};

    tasks.forEach((task) => {
      const date = parseDateKey(task?.date);
      if (!date) return;

      const key = toDateKey(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(task);
    });

    Object.values(grouped).forEach((items) => {
      items.sort((a, b) => {
        if (Boolean(a.completed) !== Boolean(b.completed)) {
          return a.completed ? 1 : -1;
        }

        return String(a.title || "").localeCompare(
          String(b.title || "")
        );
      });
    });

    return grouped;
  }, [tasks]);

  const selectedTasks = selectedDate
    ? tasksByDate[selectedDate] || []
    : [];

  const monthTaskCount = useMemo(
    () =>
      monthDays.reduce(
        (count, cell) =>
          count +
          (cell.currentMonth
            ? (tasksByDate[cell.key] || []).length
            : 0),
        0
      ),
    [monthDays, tasksByDate]
  );

  function goPreviousMonth() {
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() - 1, 1)
    );
  }

  function goNextMonth() {
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + 1, 1)
    );
  }

  function goToday() {
    const current = new Date();

    setVisibleMonth(
      new Date(current.getFullYear(), current.getMonth(), 1)
    );
  }

  function openAddForm(date = selectedDate || todayKey) {
    setEditingTask(null);
    setForm({
      title: "",
      date,
    });
    setShowForm(true);
    setError("");
  }

  function openEditForm(task) {
    setEditingTask(task);
    setForm({
      title: task.title || "",
      date: task.date || todayKey,
    });
    setShowForm(true);
    setError("");
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingTask(null);
    setForm(EMPTY_FORM);
  }

  async function persistTasks(nextTasks) {
    setSaving(true);
    setError("");

    try {
      const normalized = nextTasks.map((item) => ({
        ...item,
        id: String(item.id),
        date: item.date || "",
        completed: item.completed === true,
        completedAt: item.completedAt || null,
      }));

      await saveTodoList(normalized);
      setTasks(normalized);
      return true;
    } catch (err) {
      console.error("Failed to save calendar task:", err);

      setError(
        err?.message ||
          "Failed to save the task. Please try again."
      );

      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const title = form.title.trim();
    const date = form.date;

    if (!title) {
      setError("Task title is required.");
      return;
    }

    if (!date) {
      setError("Task date is required.");
      return;
    }

    if (editingTask) {
      const updatedTask = {
        ...editingTask,
        id: String(editingTask.id),
        title,
        date,
        completed: editingTask.completed === true,
        completedAt: editingTask.completedAt || null,
      };

      const nextTasks = tasks.map((task) =>
        String(task.id) === String(editingTask.id)
          ? updatedTask
          : task
      );

      const success = await persistTasks(nextTasks);

      if (success) {
        setSelectedDate(date);
        closeForm();
      }

      return;
    }

    const newTask = {
      id: String(Date.now()),
      title,
      date,
      completed: false,
      completedAt: null,
    };

    const success = await persistTasks([...tasks, newTask]);

    if (success) {
      setSelectedDate(date);
      closeForm();
    }
  }

  async function toggleTask(task) {
    const completed = task.completed !== true;

    const updatedTask = {
      ...task,
      id: String(task.id),
      completed,
      completedAt: completed
        ? new Date().toISOString()
        : null,
    };

    const nextTasks = tasks.map((item) =>
      String(item.id) === String(task.id)
        ? updatedTask
        : item
    );

    await persistTasks(nextTasks);
  }

  async function deleteTask(task) {
    const confirmed = window.confirm(
      `Delete "${task.title || "this task"}"?`
    );

    if (!confirmed) return;

    const nextTasks = tasks.filter(
      (item) => String(item.id) !== String(task.id)
    );

    await persistTasks(nextTasks);
  }

  function selectDate(dateKey) {
    setSelectedDate(dateKey);
  }

  return (
    <div
      className="taskbar-calendar-view"
      style={{
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        className="calendar-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <CalendarDays size={22} />

          <div>
            <h2 style={{ margin: 0 }}>Calendar</h2>

            <p
              style={{
                margin: "4px 0 0",
                opacity: 0.75,
              }}
            >
              {monthTaskCount} scheduled task
              {monthTaskCount === 1 ? "" : "s"} this month
            </p>
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
            onClick={() => openAddForm(selectedDate || todayKey)}
            className="view-button"
            disabled={saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Plus size={16} />
            Add Task
          </button>

          <button
            type="button"
            onClick={goToday}
            className="view-button"
          >
            Today
          </button>

          <button
            type="button"
            onClick={goPreviousMonth}
            aria-label="Previous month"
            className="icon-button"
          >
            <ChevronLeft size={18} />
          </button>

          <strong
            style={{
              minWidth: "145px",
              textAlign: "center",
            }}
          >
            {MONTHS[month]} {year}
          </strong>

          <button
            type="button"
            onClick={goNextMonth}
            aria-label="Next month"
            className="icon-button"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: "14px",
            padding: "10px 12px",
            borderRadius: "10px",
            background: "rgba(255, 70, 70, 0.12)",
            border: "1px solid rgba(255, 70, 70, 0.28)",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "30px 0", opacity: 0.7 }}>
          Loading calendar...
        </div>
      ) : (
        <div
          className="calendar-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: "8px",
          }}
        >
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="calendar-weekday"
              style={{
                padding: "8px 6px",
                textAlign: "center",
                fontSize: "12px",
                fontWeight: 700,
                opacity: 0.7,
              }}
            >
              {day.slice(0, 3)}
            </div>
          ))}

          {monthDays.map((cell) => {
            const dayTasks = tasksByDate[cell.key] || [];
            const isToday = cell.key === todayKey;
            const isSelected = cell.key === selectedDate;
            return (
              <div
                key={cell.key}
                className="calendar-cell"
                onClick={() => selectDate(cell.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectDate(cell.key);
                  }
                }}
                style={{
                  minHeight: "120px",
                  padding: "8px",
                  border: isSelected
                    ? "2px solid rgba(255,255,255,0.45)"
                    : "1px solid rgba(255,255,255,0.10)",
                  borderRadius: "12px",
                  opacity: cell.currentMonth ? 1 : 0.4,
                  background: isToday
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(255,255,255,0.025)",
                  boxSizing: "border-box",
                  cursor: "pointer",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "5px",
                    marginBottom: "6px",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "13px",
                      borderRadius: "50%",
                      minWidth: "25px",
                      height: "25px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isToday
                        ? "rgba(255,255,255,0.14)"
                        : "transparent",
                    }}
                  >
                    {cell.date.getDate()}
                  </strong>

                  {isToday && (
                    <span
                      style={{
                        fontSize: "10px",
                        opacity: 0.75,
                      }}
                    >
                      TODAY
                    </span>
                  )}

                  {cell.currentMonth && (
                    <button
                      type="button"
                      aria-label={`Add task on ${formatShortDate(
                        cell.key
                      )}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openAddForm(cell.key);
                      }}
                      style={{
                        width: "26px",
                        height: "26px",
                        padding: 0,
                        borderRadius: "7px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        boxSizing: "border-box",
                        background: "var(--taskbar-theme-gradient)",
                        border: "1px solid var(--taskbar-theme-main)",
                        color: "#ffffff",
                        boxShadow:
                          "0 4px 12px var(--taskbar-theme-shadow)",
                        transition:
                          "transform 0.2s ease, box-shadow 0.2s ease",
                      }}
                    >
                      <Plus size={14} color="#ffffff" />
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "5px",
                  }}
                >
                  {dayTasks.slice(0, 3).map((task) => (
                    <div
                      key={`${cell.key}-${task.id}`}
                      onClick={(event) => event.stopPropagation()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        lineHeight: 1.25,
                        minWidth: 0,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTask(task)}
                        aria-label={
                          task.completed
                            ? "Mark task incomplete"
                            : "Mark task complete"
                        }
                        style={{
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          minWidth: "16px",
                          cursor: "pointer",
                          display: "inline-flex",
                        }}
                      >
                        {task.completed ? (
                          <CheckCircle2 size={12} />
                        ) : (
                          <Circle size={12} />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(cell.key);
                          openEditForm(task);
                        }}
                        title="Edit task"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          border: 0,
                          borderRadius: "6px",
                          background: "#242424",
                          padding: "5px 7px",
                          textAlign: "left",
                          cursor: "pointer",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "#ffffff",
                          fontWeight: 600,
                          lineHeight: 1.25,
                          textDecoration: task.completed
                            ? "line-through"
                            : "none",
                          boxSizing: "border-box",
                        }}
                      >
                        {task.title || "Task"}
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteTask(task)}
                        aria-label={`Delete ${task.title || "task"}`}
                        title="Delete task"
                        style={{
                          flex: "0 0 auto",
                          width: "24px",
                          height: "24px",
                          padding: 0,
                          border: 0,
                          borderRadius: "6px",
                          background: "#3a1f1f",
                          color: "#ffffff",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}

                  {dayTasks.length > 3 && (
                    <span
                      style={{
                        fontSize: "10px",
                        opacity: 0.65,
                      }}
                    >
                      +{dayTasks.length - 3} more
                    </span>
                  )}


                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedDate && (
        <section
          style={{
            marginTop: "18px",
            padding: "16px",
            borderRadius: "14px",
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.025)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "12px",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>
                {formatShortDate(selectedDate)}
              </h3>
              <p
                style={{
                  margin: "4px 0 0",
                  opacity: 0.65,
                  fontSize: "12px",
                }}
              >
                {selectedTasks.length} task
                {selectedTasks.length === 1 ? "" : "s"}
              </p>
            </div>

            <button
              type="button"
              className="view-button"
              onClick={() => openAddForm(selectedDate)}
              disabled={saving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Plus size={15} />
              Add Task
            </button>
          </div>

          {selectedTasks.length === 0 ? (
            <div style={{ opacity: 0.65, fontSize: "13px" }}>
              No tasks for this date.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "8px" }}>
              {selectedTasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleTask(task)}
                    aria-label={
                      task.completed
                        ? "Mark task incomplete"
                        : "Mark task complete"
                    }
                    style={{
                      border: 0,
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                      display: "inline-flex",
                    }}
                  >
                    {task.completed ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Circle size={18} />
                    )}
                  </button>

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        textDecoration: task.completed
                          ? "line-through"
                          : "none",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {task.title || "Task"}
                    </div>

                    <div
                      style={{
                        fontSize: "11px",
                        opacity: 0.6,
                        marginTop: "3px",
                      }}
                    >
                      {formatShortDate(task.date)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditForm(task)}
                    aria-label="Edit task"
                    title="Edit task"
                    style={{
                      minWidth: "44px",
                      minHeight: "44px",
                      border: 0,
                      borderRadius: "8px",
                      background: "rgba(255,255,255,0.08)",
                      color: "#ffffff",
                      padding: "8px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteTask(task)}
                    aria-label="Delete task"
                    title="Delete task"
                    style={{
                      minWidth: "44px",
                      minHeight: "44px",
                      border: 0,
                      borderRadius: "8px",
                      background: "#3a1f1f",
                      color: "#ffffff",
                      padding: "8px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <p
        style={{
          margin: "14px 0 0",
          fontSize: "12px",
          opacity: 0.65,
        }}
      >
        Calendar shows only tasks from the existing TASKBAR To-Do system.
      </p>

      {showForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-task-dialog-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(0,0,0,0.65)",
            boxSizing: "border-box",
          }}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(460px, 100%)",
              padding: "20px",
              borderRadius: "16px",
              background: "var(--taskbar-card-bg, #171717)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                marginBottom: "18px",
              }}
            >
              <h3
                id="calendar-task-dialog-title"
                style={{ margin: 0 }}
              >
                {editingTask ? "Edit Task" : "Add Task"}
              </h3>

              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                disabled={saving}
                style={{
                  border: 0,
                  background: "transparent",
                  padding: "6px",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <label
              style={{
                display: "grid",
                gap: "7px",
                marginBottom: "14px",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                Task title
              </span>

              <input
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Enter task"
                autoFocus
                disabled={saving}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "10px 12px",
                  boxSizing: "border-box",
                  borderRadius: "9px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "inherit",
                  fontSize: "16px",
                }}
              />
            </label>

            <label
              style={{
                display: "grid",
                gap: "7px",
                marginBottom: "18px",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                Date
              </span>

              <input
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                disabled={saving}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "10px 12px",
                  boxSizing: "border-box",
                  borderRadius: "9px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "inherit",
                  fontSize: "16px",
                }}
              />
            </label>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="view-button"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="view-button"
              >
                {saving
                  ? "Saving..."
                  : editingTask
                    ? "Save Changes"
                    : "Add Task"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default CalendarView;
