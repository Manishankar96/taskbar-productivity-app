import { ArrowRight, CheckSquare, Clock3 } from "lucide-react";

function NextAction({ tasks = [], timetable = [], today }) {
  const safeToday =
    today ||
    new Date().toISOString().split("T")[0];

  // --------------------------------------------------
  // FIND PENDING TASKS
  // --------------------------------------------------

  const pendingTasks = tasks
    .filter(
      (task) =>
        task &&
        !task.completed &&
        task.date
    )
    .slice()
    .sort((a, b) => {
      const aDate = String(a.date || "");
      const bDate = String(b.date || "");

      const aOverdue = aDate < safeToday;
      const bOverdue = bDate < safeToday;

      // Overdue tasks come first.
      if (aOverdue !== bOverdue) {
        return aOverdue ? -1 : 1;
      }

      // Then tasks with the nearest date.
      if (aDate !== bDate) {
        return aDate.localeCompare(bDate);
      }

      // Finally sort alphabetically.
      return String(a.title || "").localeCompare(
        String(b.title || "")
      );
    });

  const nextTask = pendingTasks[0];

  // --------------------------------------------------
  // FIND SCHEDULED ACTIVITIES
  // --------------------------------------------------

  const todaySchedule = timetable
    .filter(
      (entry) =>
        entry &&
        entry.day
    )
    .slice()
    .sort((a, b) =>
      String(a.startTime || "").localeCompare(
        String(b.startTime || "")
      )
    );

  // --------------------------------------------------
  // NOTHING TO DO
  // --------------------------------------------------

  if (
    !nextTask &&
    todaySchedule.length === 0
  ) {
    return (
      <div className="planner-next-action planner-next-action-empty">
        <CheckSquare size={20} />

        <div>
          <strong>
            Nothing urgent right now
          </strong>

          <span>
            Your scheduled work is clear.
          </span>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // NEXT SCHEDULED ACTIVITY
  // --------------------------------------------------

  if (
    !nextTask &&
    todaySchedule[0]
  ) {
    const entry = todaySchedule[0];

    return (
      <div className="planner-next-action">
        <Clock3 size={20} />

        <div>
          <small>
            Next scheduled activity
          </small>

          <strong>
            {entry.activity ||
              entry.title ||
              "Scheduled activity"}
          </strong>

          <span>
            {entry.startTime || ""}

            {entry.endTime
              ? ` – ${entry.endTime}`
              : ""}
          </span>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // NEXT TASK
  // --------------------------------------------------

  return (
    <div className="planner-next-action">
      <CheckSquare size={20} />

      <div>
        <small
          style={{
            display: "block",
            marginBottom: "6px",
          }}
        >
          What should I do now?
        </small>

        <strong
          style={{
            display: "block",
            color: "var(--taskbar-theme-main)",
          }}
        >
          {nextTask.title ||
            "Complete this task"}
        </strong>

        <span>
          {nextTask.source ||
            "To-Do"}
        </span>
      </div>

      <ArrowRight size={18} />
    </div>
  );
}

export default NextAction;