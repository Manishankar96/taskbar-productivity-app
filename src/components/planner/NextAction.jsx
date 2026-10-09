import { ArrowRight, CheckSquare } from "lucide-react";

function NextAction({ tasks = [], today }) {
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
  // NOTHING TO DO
  // --------------------------------------------------

  if (!nextTask) {
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
