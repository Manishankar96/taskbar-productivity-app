import { Bell, CalendarDays, CheckCircle2, Clock3, ListChecks, Target } from "lucide-react";
import DeadlineIndicator from "./DeadlineIndicator";
import NextAction from "./NextAction";

function getReminderDate(reminder) {
  return reminder?.date || reminder?.reminderDate || reminder?.dueDate || "";
}

function isReminderToday(reminder, today) {
  const date = getReminderDate(reminder);
  if (!date) return false;
  return String(date).slice(0, 10) === today;
}

function isTaskForToday(task, today) {
  return task?.date === today;
}

function TodayPlanner({
  tasks = [],
  reminders = [],
  timetable = [],
  studySessions = [],
  currentGoal = null,
  today,
}) {
  const todayTasks = tasks.filter((task) => isTaskForToday(task, today));
  const overdueTasks = tasks.filter(
    (task) => task?.date && task.date < today && !task.completed
  );
  const todayPending = todayTasks.filter((task) => !task.completed);
  const todayCompleted = todayTasks.filter((task) => task.completed);
  const todayReminders = reminders.filter((reminder) => isReminderToday(reminder, today));

  const weekdayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const weekday = weekdayNames[new Date(`${today}T12:00:00`).getDay()];
  const todaySchedule = timetable
    .filter((entry) => entry?.day === weekday)
    .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));

  const todayStudyMinutes = studySessions.reduce((total, session) => {
    const sessionDate = session?.date || session?.startDate || session?.createdAt || "";
    if (String(sessionDate).slice(0, 10) !== today) return total;
    return total + Number(session?.minutes ?? session?.duration ?? session?.durationMinutes ?? 0) || 0;
  }, 0);

  const upcomingDeadlines = tasks
    .filter((task) => task?.date && !task.completed && task.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <section className="section-card daily-planner-card" style={{ marginBottom: "24px" }}>
      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <CalendarDays size={22} />
        <h2 style={{ margin: 0 }}>Today</h2>
      </div>

      <p className="home-subtitle" style={{ margin: "0 0 18px" }}>
        Everything important for today in one place.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        <div className="home-card">
          <ListChecks size={20} />
          <p>Tasks</p>
          <h2>{todayPending.length}</h2>
          <span>{todayCompleted.length} completed</span>
        </div>
        <div className="home-card">
          <Clock3 size={20} />
          <p>Study</p>
          <h2>{todayStudyMinutes}m</h2>
          <span>from Study Sessions</span>
        </div>
        <div className="home-card">
          <Bell size={20} />
          <p>Reminders</p>
          <h2>{todayReminders.length}</h2>
          <span>for today</span>
        </div>
        <div className="home-card">
          <Target size={20} />
          <p>Overdue</p>
          <h2>{overdueTasks.length}</h2>
          <span>need attention</span>
        </div>
      </div>

      <NextAction tasks={tasks} timetable={todaySchedule} today={today} />

      <div style={{ marginTop: "18px" }}>
        <h3>Today's Tasks</h3>
        {todayTasks.length === 0 ? (
          <p className="empty-topics">No tasks scheduled for today.</p>
        ) : (
          todayTasks.slice(0, 8).map((task) => (
            <div key={task.id} className="task-item" style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {task.completed ? <CheckCircle2 size={17} /> : <ListChecks size={17} />}
                {task.title}
              </span>
              <DeadlineIndicator date={task.date} completed={task.completed} today={today} />
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: "18px" }}>
        <h3>Upcoming Deadlines</h3>
        {upcomingDeadlines.length === 0 ? (
          <p className="empty-topics">No upcoming deadlines.</p>
        ) : (
          upcomingDeadlines.map((task) => (
            <div key={`deadline-${task.id}`} className="task-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <span>{task.title}</span>
              <DeadlineIndicator date={task.date} today={today} />
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: "18px" }}>
        <h3>Today's Schedule</h3>
        {todaySchedule.length === 0 ? (
          <p className="empty-topics">No timetable entries for today.</p>
        ) : (
          todaySchedule.slice(0, 6).map((entry) => (
            <div key={`planner-schedule-${entry.id}`} className="task-item">
              {entry.startTime || ""}{entry.endTime ? ` – ${entry.endTime}` : ""} • {entry.activity || entry.title || "Scheduled activity"}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: "18px" }}>
        <h3>Today's Reminders</h3>
        {todayReminders.length === 0 ? (
          <p className="empty-topics">No reminders for today.</p>
        ) : (
          todayReminders.slice(0, 6).map((reminder) => (
            <div key={`planner-reminder-${reminder.id}`} className="task-item">
              {reminder.title || reminder.name || "Reminder"}
            </div>
          ))
        )}
      </div>

      {currentGoal && (
        <div style={{ marginTop: "18px" }}>
          <h3>Current Goal</h3>
          <div className="task-item" style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <span>{currentGoal.title || currentGoal.name || "Current Goal"}</span>
            {currentGoal.targetDate && (
              <DeadlineIndicator date={currentGoal.targetDate} today={today} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default TodayPlanner;
