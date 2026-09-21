import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import { getDeadlineInfo } from "../../services/deadlineService";

function DeadlineIndicator({ date, completed = false, today }) {
  if (!date) {
    return null;
  }

  if (completed) {
    return (
      <span className="planner-deadline planner-deadline-complete">
        <CheckCircle2 size={15} />
        Completed
      </span>
    );
  }

  // `today` is retained as a supported prop for compatibility with the
  // existing Daily Planner. The service uses the current local date/time
  // for accurate deadline intelligence.
  const info = getDeadlineInfo(date);

  const className = [
    "planner-deadline",
    `planner-deadline-${info.status}`,
  ].join(" ");

  const icon =
    info.status === "overdue" ? (
      <AlertCircle size={15} />
    ) : (
      <Clock3 size={15} />
    );

  return (
    <span className={className} title={info.targetDate ? info.targetDate.toLocaleString("en-IN") : undefined}>
      {icon}
      {info.label}
    </span>
  );
}

export default DeadlineIndicator;
