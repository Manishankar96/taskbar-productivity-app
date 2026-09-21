import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Pause,
  Play,
  RotateCcw,
  Target,
  TimerReset,
  X,
} from "lucide-react";

const DEFAULT_MINUTES = 50;
const FOCUS_MODE_STORAGE_KEY = "taskbar-focus-mode-session";

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeTasks(tasks) {
  if (!Array.isArray(tasks)) return [];

  return tasks.filter(
    (task) =>
      task &&
      !task.completed &&
      (task.title || task.activity || task.name)
  );
}

function FocusMode({ tasks = [], onSessionComplete }) {
  const availableTasks = useMemo(
    () => normalizeTasks(tasks),
    [tasks]
  );

  const TOTAL_SECONDS = DEFAULT_MINUTES * 60;

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(TOTAL_SECONDS);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [endAt, setEndAt] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  /*
   * Focus Mode is persisted in localStorage.
   *
   * IMPORTANT:
   * While the timer is running, endAt is the single source of truth.
   * We never subtract elapsed time from an already-decreased remainingSeconds.
   * This prevents the timer from losing time twice and allows a refresh to
   * continue from the correct point.
   */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FOCUS_MODE_STORAGE_KEY);

      if (!raw) {
        setHydrated(true);
        return;
      }

      const session = JSON.parse(raw);

      if (!session || !session.sessionStarted) {
        setHydrated(true);
        return;
      }

      const taskId = session.selectedTaskId;

      const savedRemaining = Math.max(
        0,
        Number(session.remainingSeconds) || TOTAL_SECONDS
      );

      const savedElapsed = Math.max(
        0,
        Number(session.elapsedSeconds) || 0
      );

      if (taskId !== undefined && taskId !== null) {
        setSelectedTaskId(String(taskId));
      }

      setSaved(Boolean(session.saved));
      setSessionStarted(true);

      if (session.finished) {
        setRemainingSeconds(0);
        setElapsedSeconds(
          Math.min(TOTAL_SECONDS, savedElapsed || TOTAL_SECONDS)
        );
        setFinished(true);
        setRunning(false);
        setEndAt(null);
        setHydrated(true);
        return;
      }

      if (session.running) {
        /*
         * New format:
         * endAt is the exact deadline of the running session.
         *
         * Legacy format:
         * If endAt is missing, preserve the currently saved remaining time
         * and continue from there instead of resetting to 50:00.
         */
        const restoredEndAt = Number(session.endAt);

        const usableEndAt =
          Number.isFinite(restoredEndAt) && restoredEndAt > 0
            ? restoredEndAt
            : Date.now() + savedRemaining * 1000;

        const currentRemaining = Math.max(
          0,
          Math.ceil((usableEndAt - Date.now()) / 1000)
        );

        const currentElapsed = Math.min(
          TOTAL_SECONDS,
          TOTAL_SECONDS - currentRemaining
        );

        if (currentRemaining <= 0) {
          setRemainingSeconds(0);
          setElapsedSeconds(TOTAL_SECONDS);
          setFinished(true);
          setRunning(false);
          setEndAt(null);

          window.localStorage.setItem(
            FOCUS_MODE_STORAGE_KEY,
            JSON.stringify({
              ...session,
              remainingSeconds: 0,
              elapsedSeconds: TOTAL_SECONDS,
              running: false,
              finished: true,
              sessionStarted: true,
              endAt: null,
              saved: Boolean(session.saved),
              restoredAt: Date.now(),
            })
          );
        } else {
          setRemainingSeconds(currentRemaining);
          setElapsedSeconds(currentElapsed);
          setFinished(false);
          setRunning(true);
          setEndAt(usableEndAt);

          window.localStorage.setItem(
            FOCUS_MODE_STORAGE_KEY,
            JSON.stringify({
              ...session,
              remainingSeconds: currentRemaining,
              elapsedSeconds: currentElapsed,
              running: true,
              finished: false,
              sessionStarted: true,
              endAt: usableEndAt,
              updatedAt: Date.now(),
            })
          );
        }

        setHydrated(true);
        return;
      }

      /*
       * Paused session:
       * keep the exact remaining time.
       */
      setRemainingSeconds(savedRemaining);
      setElapsedSeconds(
        Math.min(TOTAL_SECONDS, savedElapsed)
      );
      setFinished(false);
      setRunning(false);
      setEndAt(null);
      setHydrated(true);
    } catch (error) {
      console.error("Failed to restore Focus Mode session:", error);
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (
      !selectedTaskId &&
      availableTasks[0] &&
      !sessionStarted
    ) {
      setSelectedTaskId(String(availableTasks[0].id));
    }
  }, [
    availableTasks,
    selectedTaskId,
    sessionStarted,
  ]);

  /*
   * Persist state after the initial restore has completed.
   */
  useEffect(() => {
    if (
      !hydrated ||
      !sessionStarted ||
      !selectedTaskId
    ) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(
        FOCUS_MODE_STORAGE_KEY
      );

      const existing = raw ? JSON.parse(raw) : {};

      window.localStorage.setItem(
        FOCUS_MODE_STORAGE_KEY,
        JSON.stringify({
          ...existing,
          selectedTaskId,
          remainingSeconds,
          elapsedSeconds,
          running,
          finished,
          sessionStarted,
          saved,
          endAt: running ? endAt : null,
          updatedAt: Date.now(),
        })
      );
    } catch (error) {
      console.error(
        "Failed to persist Focus Mode session:",
        error
      );
    }
  }, [
    hydrated,
    selectedTaskId,
    remainingSeconds,
    elapsedSeconds,
    running,
    finished,
    sessionStarted,
    saved,
    endAt,
  ]);

  /*
   * Timer.
   *
   * endAt is the source of truth while running.
   *
   * A refresh, delayed interval, or browser tab suspension therefore
   * does not reset the 50-minute session.
   */
  useEffect(() => {
    if (!running || !endAt) {
      return undefined;
    }

    const tick = () => {
      const currentRemaining = Math.max(
        0,
        Math.ceil((endAt - Date.now()) / 1000)
      );

      const currentElapsed = Math.min(
        TOTAL_SECONDS,
        TOTAL_SECONDS - currentRemaining
      );

      setRemainingSeconds(currentRemaining);
      setElapsedSeconds(currentElapsed);

      if (currentRemaining <= 0) {
        setRunning(false);
        setFinished(true);
        setEndAt(null);

        try {
          const raw = window.localStorage.getItem(
            FOCUS_MODE_STORAGE_KEY
          );

          const existing = raw
            ? JSON.parse(raw)
            : {};

          window.localStorage.setItem(
            FOCUS_MODE_STORAGE_KEY,
            JSON.stringify({
              ...existing,
              remainingSeconds: 0,
              elapsedSeconds: TOTAL_SECONDS,
              running: false,
              finished: true,
              sessionStarted: true,
              endAt: null,
              updatedAt: Date.now(),
            })
          );
        } catch (error) {
          console.error(
            "Failed to persist completed Focus Mode:",
            error
          );
        }
      }
    };

    tick();

    const interval = window.setInterval(
      tick,
      1000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [running, endAt]);

  const selectedTask = useMemo(
    () =>
      availableTasks.find(
        (task) =>
          String(task.id) ===
          String(selectedTaskId)
      ) || null,
    [availableTasks, selectedTaskId]
  );

  const progress = Math.min(
    100,
    Math.max(
      0,
      ((TOTAL_SECONDS - remainingSeconds) /
        TOTAL_SECONDS) *
        100
    )
  );

  function handleStart() {
    if (!selectedTask || finished) {
      return;
    }

    const now = Date.now();

    /*
     * IMPORTANT:
     * Start/resume from the current remaining time.
     *
     * Example:
     * 50:00 -> pause at 43:20
     * Resume -> endAt is now + 43:20
     */
    const newEndAt =
      now + remainingSeconds * 1000;

    setSessionStarted(true);
    setSaved(false);
    setRunning(true);
    setEndAt(newEndAt);

    try {
      const raw = window.localStorage.getItem(
        FOCUS_MODE_STORAGE_KEY
      );

      const existing = raw
        ? JSON.parse(raw)
        : {};

      window.localStorage.setItem(
        FOCUS_MODE_STORAGE_KEY,
        JSON.stringify({
          ...existing,
          selectedTaskId: String(
            selectedTask.id
          ),
          remainingSeconds,
          elapsedSeconds,
          running: true,
          finished: false,
          sessionStarted: true,
          saved: false,
          endAt: newEndAt,
          updatedAt: now,
        })
      );
    } catch (error) {
      console.error(
        "Failed to start Focus Mode:",
        error
      );
    }
  }

  function handlePause() {
    if (!running || !endAt) {
      return;
    }

    try {
      const currentRemaining = Math.max(
        0,
        Math.ceil(
          (endAt - Date.now()) / 1000
        )
      );

      const currentElapsed = Math.min(
        TOTAL_SECONDS,
        TOTAL_SECONDS - currentRemaining
      );

      setRemainingSeconds(currentRemaining);
      setElapsedSeconds(currentElapsed);
      setRunning(false);
      setEndAt(null);

      const raw = window.localStorage.getItem(
        FOCUS_MODE_STORAGE_KEY
      );

      const existing = raw
        ? JSON.parse(raw)
        : {};

      window.localStorage.setItem(
        FOCUS_MODE_STORAGE_KEY,
        JSON.stringify({
          ...existing,
          selectedTaskId,
          remainingSeconds: currentRemaining,
          elapsedSeconds: currentElapsed,
          running: false,
          finished: currentRemaining <= 0,
          sessionStarted: true,
          saved: false,
          endAt: null,
          pausedAt: Date.now(),
          updatedAt: Date.now(),
        })
      );

      if (currentRemaining <= 0) {
        setFinished(true);
      }
    } catch (error) {
      console.error(
        "Failed to pause Focus Mode:",
        error
      );

      setRunning(false);
      setEndAt(null);
    }
  }

  function handleReset() {
    setRunning(false);
    setRemainingSeconds(TOTAL_SECONDS);
    setElapsedSeconds(0);
    setFinished(false);
    setSessionStarted(false);
    setSaving(false);
    setSaved(false);
    setEndAt(null);

    try {
      window.localStorage.removeItem(
        FOCUS_MODE_STORAGE_KEY
      );
    } catch (error) {
      console.error(
        "Failed to reset Focus Mode:",
        error
      );
    }
  }

  async function handleSaveSession() {
    if (
      !selectedTask ||
      elapsedSeconds <= 0 ||
      saving ||
      saved
    ) {
      return;
    }

    const minutes = Math.max(
      1,
      Math.round(elapsedSeconds / 60)
    );

    setSaving(true);

    try {
      if (
        typeof onSessionComplete ===
        "function"
      ) {
        await onSessionComplete({
          task: selectedTask,
          minutes,
          duration: minutes,
          elapsedSeconds,
          completed: finished,
        });
      }

      setSaved(true);

      try {
        const raw =
          window.localStorage.getItem(
            FOCUS_MODE_STORAGE_KEY
          );

        const existing = raw
          ? JSON.parse(raw)
          : {};

        window.localStorage.setItem(
          FOCUS_MODE_STORAGE_KEY,
          JSON.stringify({
            ...existing,
            selectedTaskId,
            remainingSeconds,
            elapsedSeconds,
            running: false,
            finished,
            sessionStarted: true,
            saved: true,
            endAt: null,
            updatedAt: Date.now(),
          })
        );
      } catch (error) {
        console.error(
          "Failed to update saved Focus Mode state:",
          error
        );
      }
    } catch (error) {
      console.error(
        "Failed to save Focus Mode session:",
        error
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCloseFocus() {
    setRunning(false);
    setFinished(true);
    setEndAt(null);

    try {
      const raw = window.localStorage.getItem(
        FOCUS_MODE_STORAGE_KEY
      );

      const existing = raw
        ? JSON.parse(raw)
        : {};

      window.localStorage.setItem(
        FOCUS_MODE_STORAGE_KEY,
        JSON.stringify({
          ...existing,
          selectedTaskId,
          remainingSeconds,
          elapsedSeconds,
          running: false,
          finished: true,
          sessionStarted: true,
          saved,
          endAt: null,
          updatedAt: Date.now(),
        })
      );
    } catch (error) {
      console.error(
        "Failed to persist closed Focus Mode state:",
        error
      );
    }
  }

  if (availableTasks.length === 0) {
    return (
      <section
        className="section-card focus-mode-card"
        style={{
          marginBottom: "24px",
          padding: "24px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <TimerReset size={24} />

          <div>
            <h2 style={{ margin: 0 }}>
              Focus Mode
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                opacity: 0.72,
              }}
            >
              No unfinished task is available for a
              focus session.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="section-card focus-mode-card"
      style={{
        marginBottom: "24px",
        padding: "24px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            minWidth: 0,
          }}
        >
          <TimerReset size={24} />

          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>
              Focus Mode
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                opacity: 0.72,
              }}
            >
              Select a task and focus for 50 minutes.
            </p>
          </div>
        </div>

        {sessionStarted && (
          <button
            type="button"
            onClick={handleCloseFocus}
            aria-label="Close focus session"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              opacity: 0.75,
            }}
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div
        className="focus-mode-layout"
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(0, 1fr) minmax(260px, 360px)",
          gap: "24px",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontWeight: 600,
            }}
          >
            <span>Select task</span>

            <select
              value={selectedTaskId}
              disabled={sessionStarted}
              onChange={(event) => {
                setSelectedTaskId(
                  event.target.value
                );

                handleReset();
              }}
              style={{
                width: "100%",
                minHeight: "44px",
                borderRadius: "10px",
                padding: "0 12px",
                border:
                  "1px solid rgba(255,255,255,0.14)",
                background:
                  "rgba(255,255,255,0.06)",
                color: "inherit",
              }}
            >
              {availableTasks.map((task) => (
                <option
                  key={task.id}
                  value={String(task.id)}
                >
                  {task.title ||
                    task.activity ||
                    task.name}
                </option>
              ))}
            </select>
          </label>

          {selectedTask && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "16px",
                borderRadius: "12px",
                background:
                  "rgba(255,255,255,0.04)",
                border:
                  "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <Target size={20} />

              <div
                style={{
                  minWidth: 0,
                }}
              >
                <strong
                  style={{
                    display: "block",
                  }}
                >
                  {selectedTask.title ||
                    selectedTask.activity ||
                    selectedTask.name}
                </strong>

                <span
                  style={{
                    opacity: 0.68,
                    fontSize: "13px",
                  }}
                >
                  {selectedTask.source ||
                    selectedTask.type ||
                    "TASKBAR task"}
                </span>
              </div>
            </div>
          )}

          <div
            style={{
              height: "7px",
              borderRadius: "999px",
              overflow: "hidden",
              background:
                "rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background:
                  "var(--taskbar-theme-gradient-horizontal)",
                transition:
                  "width 0.3s ease",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            {!running && !finished && (
              <button
                type="button"
                onClick={handleStart}
                className="add-topic-button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Play size={17} />

                {sessionStarted
                  ? "Resume Focus"
                  : "Start Focus"}
              </button>
            )}

            {running && (
              <button
                type="button"
                onClick={handlePause}
                className="add-topic-button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Pause size={17} />
                Pause
              </button>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="focus-reset-button"
              style={{
                width: "auto",
                minWidth: "96px",
                height: "40px",
                minHeight: "40px",
                padding: "9px 14px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                flex: "0 0 auto",
                flexShrink: 0,
                whiteSpace: "nowrap",
                boxSizing: "border-box",
                background:
                  "var(--taskbar-theme-gradient)",
                border:
                  "1px solid var(--taskbar-theme-main)",
                borderRadius: "10px",
                color: "#ffffff",
                boxShadow:
                  "0 6px 18px var(--taskbar-theme-shadow)",
                cursor: "pointer",
              }}
            >
              <RotateCcw
                size={17}
                color="#ffffff"
                strokeWidth={2}
              />

              <span
                style={{
                  color: "#ffffff",
                }}
              >
                Reset
              </span>
            </button>
          </div>
        </div>

        <div
          className="focus-mode-timer-panel"
          style={{
            minHeight: "240px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            borderRadius: "16px",
            padding: "24px",
            background:
              "rgba(255,255,255,0.04)",
            border:
              "1px solid rgba(255,255,255,0.10)",
            textAlign: "center",
          }}
        >
          <Clock3 size={22} />

          <div
            style={{
              fontSize:
                "clamp(48px, 8vw, 72px)",
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-2px",
            }}
          >
            {formatTime(remainingSeconds)}
          </div>

          {finished ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: 700,
                }}
              >
                <CheckCircle2 size={19} />
                Focus session finished
              </div>

              {elapsedSeconds > 0 &&
                !saved && (
                  <button
                    type="button"
                    onClick={handleSaveSession}
                    className="save-topic-button"
                    disabled={saving}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <CheckCircle2 size={17} />

                    {saving
                      ? "Saving..."
                      : "Save Study Session"}
                  </button>
                )}

              {saved && (
                <span
                  style={{
                    opacity: 0.72,
                    fontSize: "13px",
                  }}
                >
                  Focus time was added to Study
                  Sessions.
                </span>
              )}
            </>
          ) : (
            <span
              style={{
                opacity: 0.68,
                fontSize: "13px",
              }}
            >
              {running
                ? "Stay focused. TASKBAR is timing your session."
                : sessionStarted
                  ? "Paused"
                  : "Ready when you are."}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

export default FocusMode;