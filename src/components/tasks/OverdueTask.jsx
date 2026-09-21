import { CalendarClock, CheckCircle2, Trash2 } from "lucide-react";

function OverdueTask({
  task,
  onComplete,
  onReschedule,
  onDelete,
  canReschedule = true,
  canDelete = true,
}) {
  return (
    <div className="topic-row">
      <div className="topic-information">
        <strong>{task.title || "Overdue Task"}</strong>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span>⚠️ Overdue</span>
          {task.date && <span>• Due {task.date}</span>}
          {task.type && <span>• {task.type}</span>}
        </span>
      </div>

      <div className="topic-actions">
        <button
          type="button"
          className="edit-button"
          title="Complete task"
          onClick={onComplete}
        >
          <CheckCircle2 size={18} />
        </button>

        {canReschedule && (
          <button
            type="button"
            className="edit-button"
            title="Reschedule task"
            onClick={onReschedule}
          >
            <CalendarClock size={17} />
          </button>
        )}

        {canDelete && (
          <button
            type="button"
            className="delete-button"
            title="Delete task"
            onClick={onDelete}
          >
            <Trash2 size={17} />
          </button>
        )}
      </div>
    </div>
  );
}

export default OverdueTask;
