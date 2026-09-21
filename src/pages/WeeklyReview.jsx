import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ListTodo,
  Target,
} from "lucide-react";

import { getItemsFromFirestore } from "../firebase/firestore";

const COLLECTIONS = [
  "todoList",
  "topics",
  "goals",
  "assessments",
  "timetable",
  "applications",
  "interviews",
  "studySessions",
  "activities",
];

/* =========================================================
   DATE HELPERS
========================================================= */

function getLocalDateKey(date = new Date()) {
  const value =
    date instanceof Date
      ? date
      : new Date(date);

  return `${value.getFullYear()}-${String(
    value.getMonth() + 1
  ).padStart(2, "0")}-${String(
    value.getDate()
  ).padStart(2, "0")}`;
}

function getStartOfWeek(date = new Date()) {
  const value = new Date(date);

  const day = value.getDay();

  const difference =
    day === 0
      ? -6
      : 1 - day;

  value.setDate(
    value.getDate() + difference
  );

  value.setHours(
    0,
    0,
    0,
    0
  );

  return value;
}

function addDays(date, amount) {
  const value = new Date(date);

  value.setDate(
    value.getDate() + amount
  );

  return value;
}

function getEndOfWeek(date = new Date()) {
  return addDays(
    getStartOfWeek(date),
    6
  );
}

/* =========================================================
   ITEM DATE
========================================================= */

function getDateFromItem(item) {
  const value =
    item?.date ||
    item?.plannedDate ||
    item?.targetDate ||
    item?.dueDate ||
    item?.actionDate ||
    item?.followUpDate ||
    item?.completedDate ||
    item?.createdAt;

  if (!value) {
    return null;
  }

  const text = String(value);

  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(text)
      ? new Date(
          `${text}T00:00:00`
        )
      : new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

/* =========================================================
   WEEK CHECK
========================================================= */

function isInWeek(
  item,
  start,
  end
) {
  const date =
    getDateFromItem(item);

  if (!date) {
    return false;
  }

  return (
    date >= start &&
    date <= end
  );
}

/* =========================================================
   GENERAL COMPLETION
========================================================= */

function isCompleted(item) {
  return Boolean(
    item?.completed ??
      item?.isCompleted ??
      item?.done ??
      item?.status === "completed"
  );
}

/* =========================================================
   ACTIVITY COMPLETION
========================================================= */

/*
 * Activities are logged records.
 *
 * Unlike Tasks, Goals and Assessments,
 * an Activity does not need a completed flag.
 *
 * If the Activity exists in the selected week,
 * it means the user recorded that activity.
 *
 * Therefore:
 *
 * Activity exists = completed Activity
 */
function isActivityCompleted(activity) {
  if (
    !activity ||
    typeof activity !== "object"
  ) {
    return false;
  }

  return Boolean(
    activity.date ||
      activity.createdAt ||
      activity.completedAt
  );
}

/* =========================================================
   STUDY MINUTES
========================================================= */

function getStudyMinutes(item) {
  const minutes = Number(
    item?.duration ??
      item?.minutes ??
      item?.time ??
      0
  );

  return Number.isFinite(minutes) &&
    minutes > 0
    ? minutes
    : 0;
}

/* =========================================================
   FORMAT MINUTES
========================================================= */

function formatMinutes(minutes) {
  const total = Math.max(
    0,
    Math.round(minutes)
  );

  const hours =
    Math.floor(total / 60);

  const remaining =
    total % 60;

  if (hours === 0) {
    return `${remaining} min`;
  }

  if (remaining === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remaining} min`;
}

/* =========================================================
   FORMAT DATE
========================================================= */

function formatDate(date) {
  return date.toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
    }
  );
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  icon: Icon,
  title,
  value,
  detail,
}) {
  return (
    <div
      className="section-card"
      style={{
        padding: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "10px",
        }}
      >
        <Icon size={22} />

        <strong>
          {title}
        </strong>
      </div>

      <div
        style={{
          fontSize: "28px",
          fontWeight: 700,
        }}
      >
        {value}
      </div>

      <div
        style={{
          opacity: 0.7,
          marginTop: "4px",
        }}
      >
        {detail}
      </div>
    </div>
  );
}

/* =========================================================
   ACTIVITY ROW
========================================================= */

function ActivityRow({
  label,
  completed,
  total,
  icon: Icon,
}) {
  const percentage =
    total > 0
      ? Math.round(
          (completed / total) *
            100
        )
      : 0;

  return (
    <div
      style={{
        padding: "14px 0",
        borderBottom:
          "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Icon size={19} />

          <span>
            {label}
          </span>
        </div>

        <strong>
          {completed}/{total}
        </strong>
      </div>

      <div
        style={{
          height: "7px",
          borderRadius: "999px",
          background:
            "rgba(255,255,255,0.08)",
          overflow: "hidden",
          marginTop: "9px",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            borderRadius: "999px",
            background: "currentColor",
            opacity: 0.9,
          }}
        />
      </div>
    </div>
  );
}

/* =========================================================
   WEEKLY REVIEW
========================================================= */

export default function WeeklyReview() {
  const [data, setData] =
    useState({});

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /* =======================================================
     LOAD FIRESTORE DATA
  ======================================================= */

  useEffect(() => {
    let active = true;

    async function loadWeekData() {
      try {
        setLoading(true);

        setError("");

        const entries =
          await Promise.all(
            COLLECTIONS.map(
              async (collection) => {
                const items =
                  await getItemsFromFirestore(
                    collection
                  );

                return [
                  collection,
                  Array.isArray(items)
                    ? items
                    : [],
                ];
              }
            )
          );

        if (active) {
          setData(
            Object.fromEntries(
              entries
            )
          );
        }
      } catch (loadError) {
        console.error(
          "Failed to load weekly review:",
          loadError
        );

        if (active) {
          setError(
            "Unable to load this week's review."
          );

          setData({});
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadWeekData();

    return () => {
      active = false;
    };
  }, []);

  /* =======================================================
     CURRENT WEEK
  ======================================================= */

  const today =
    getLocalDateKey();

  const weekStart =
    useMemo(
      () =>
        getStartOfWeek(),
      []
    );

  const weekEnd =
    useMemo(
      () =>
        getEndOfWeek(),
      []
    );

  /* =======================================================
     WEEKLY SUMMARY
  ======================================================= */

  const summary =
    useMemo(() => {
      const todoList =
        Array.isArray(
          data.todoList
        )
          ? data.todoList
          : [];

      const topics =
        Array.isArray(
          data.topics
        )
          ? data.topics
          : [];

      const goals =
        Array.isArray(
          data.goals
        )
          ? data.goals
          : [];

      const assessments =
        Array.isArray(
          data.assessments
        )
          ? data.assessments
          : [];

      const applications =
        Array.isArray(
          data.applications
        )
          ? data.applications
          : [];

      const interviews =
        Array.isArray(
          data.interviews
        )
          ? data.interviews
          : [];

      const studySessions =
        Array.isArray(
          data.studySessions
        )
          ? data.studySessions
          : [];

      const activities =
        Array.isArray(
          data.activities
        )
          ? data.activities
          : [];

      /* =================================================
         WEEKLY COLLECTIONS
      ================================================= */

      const weeklyTasks =
        todoList.filter(
          (item) =>
            isInWeek(
              item,
              weekStart,
              weekEnd
            )
        );

      const weeklyTopics =
        topics.filter(
          (item) =>
            isInWeek(
              item,
              weekStart,
              weekEnd
            )
        );

      const weeklyGoals =
        goals.filter(
          (item) =>
            isInWeek(
              item,
              weekStart,
              weekEnd
            )
        );

      const weeklyAssessments =
        assessments.filter(
          (item) =>
            isInWeek(
              item,
              weekStart,
              weekEnd
            )
        );

      const weeklyApplications =
        applications.filter(
          (item) =>
            isInWeek(
              item,
              weekStart,
              weekEnd
            )
        );

      const weeklyInterviews =
        interviews.filter(
          (item) =>
            isInWeek(
              item,
              weekStart,
              weekEnd
            )
        );

      const weeklyActivities =
        activities.filter(
          (item) =>
            isInWeek(
              item,
              weekStart,
              weekEnd
            )
        );

      const weeklyStudySessions =
        studySessions.filter(
          (item) =>
            isInWeek(
              item,
              weekStart,
              weekEnd
            )
        );

      /* =================================================
         COMPLETED COUNTS
      ================================================= */

      const completedTasks =
        weeklyTasks.filter(
          isCompleted
        ).length;

      const completedTopics =
        weeklyTopics.filter(
          isCompleted
        ).length;

      const completedGoals =
        weeklyGoals.filter(
          isCompleted
        ).length;

      const completedAssessments =
        weeklyAssessments.filter(
          isCompleted
        ).length;

      /*
       * IMPORTANT:
       *
       * Activities are logs.
       * A logged activity counts as completed.
       */
      const completedActivities =
        weeklyActivities.filter(
          isActivityCompleted
        ).length;

      /* =================================================
         STUDY TIME
      ================================================= */

      const studyMinutes =
        weeklyStudySessions.reduce(
          (
            total,
            item
          ) =>
            total +
            getStudyMinutes(
              item
            ),
          0
        );

      /* =================================================
         TOTAL TRACKED
      ================================================= */

      const totalTracked =
        weeklyTasks.length +
        weeklyTopics.length +
        weeklyGoals.length +
        weeklyAssessments.length +
        weeklyActivities.length;

      /* =================================================
         TOTAL COMPLETED
      ================================================= */

      const totalCompleted =
        completedTasks +
        completedTopics +
        completedGoals +
        completedAssessments +
        completedActivities;

      /* =================================================
         COMPLETION PERCENTAGE
      ================================================= */

      const completionPercentage =
        totalTracked > 0
          ? Math.round(
              (totalCompleted /
                totalTracked) *
                100
            )
          : 0;

      /* =================================================
         DAILY DATA
      ================================================= */

      const daily =
        Array.from(
          { length: 7 },
          (_, index) => {
            const date =
              addDays(
                weekStart,
                index
              );

            const key =
              getLocalDateKey(
                date
              );

            const dayTasks =
              weeklyTasks.filter(
                (item) =>
                  getLocalDateKey(
                    getDateFromItem(
                      item
                    )
                  ) === key
              );

            const dayStudy =
              weeklyStudySessions
                .filter(
                  (item) =>
                    getLocalDateKey(
                      getDateFromItem(
                        item
                      )
                    ) === key
                )
                .reduce(
                  (
                    total,
                    item
                  ) =>
                    total +
                    getStudyMinutes(
                      item
                    ),
                  0
                );

            return {
              key,

              label:
                date.toLocaleDateString(
                  "en-IN",
                  {
                    weekday:
                      "short",
                  }
                ),

              dateLabel:
                formatDate(
                  date
                ),

              tasks:
                dayTasks.length,

              completed:
                dayTasks.filter(
                  isCompleted
                ).length,

              studyMinutes:
                dayStudy,

              isToday:
                key === today,
            };
          }
        );

      return {
        weeklyTasks,

        weeklyTopics,

        weeklyGoals,

        weeklyAssessments,

        weeklyApplications,

        weeklyInterviews,

        weeklyActivities,

        weeklyStudySessions,

        completedTasks,

        completedTopics,

        completedGoals,

        completedAssessments,

        completedActivities,

        studyMinutes,

        totalTracked,

        totalCompleted,

        completionPercentage,

        daily,
      };
    }, [
      data,
      today,
      weekStart,
      weekEnd,
    ]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="home-page">
        <p className="loading-text">
          Loading weekly review...
        </p>
      </div>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="home-page">

      {/* HEADER */}

      <header className="home-header">

        <div>

          <p className="home-greeting">
            Weekly Review 📊
          </p>

          <h1>
            Your week at a glance
          </h1>

          <p className="home-subtitle">
            {formatDate(
              weekStart
            )}{" "}
            –{" "}
            {formatDate(
              weekEnd
            )}
          </p>

        </div>

      </header>

      {/* ERROR */}

      {error && (
        <div
          className="section-card"
          style={{
            padding: "16px",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      {/* =================================================
          STAT CARDS
      ================================================= */}

      <section
        className="two-column"
        style={{
          marginBottom: "20px",
        }}
      >

        <StatCard
          icon={CheckCircle2}
          title="Completion"
          value={`${summary.completionPercentage}%`}
          detail={`${summary.totalCompleted} of ${summary.totalTracked} tracked items completed`}
        />

        <StatCard
          icon={Clock3}
          title="Study Time"
          value={formatMinutes(
            summary.studyMinutes
          )}
          detail={`${summary.weeklyStudySessions.length} study sessions`}
        />

        <StatCard
          icon={ListTodo}
          title="Tasks"
          value={
            summary.completedTasks
          }
          detail={`${summary.weeklyTasks.length} tasks this week`}
        />

        <StatCard
          icon={Activity}
          title="Activities"
          value={
            summary.completedActivities
          }
          detail={`${summary.weeklyActivities.length} activities this week`}
        />

      </section>

      {/* =================================================
          WEEK AT A GLANCE
      ================================================= */}

      <section
        className="section-card"
        style={{
          padding: "24px",
          marginBottom: "20px",
        }}
      >

        <div className="section-title">

          <CalendarDays size={22} />

          <h2>
            Week at a Glance
          </h2>

        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(7, minmax(0, 1fr))",
            gap: "10px",
            marginTop: "18px",
          }}
        >

          {summary.daily.map(
            (day) => (
              <div
                key={day.key}
                style={{
                  padding:
                    "14px 8px",
                  textAlign:
                    "center",
                  borderRadius:
                    "12px",

                  background:
                    day.isToday
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.04)",

                  border:
                    day.isToday
                      ? "1px solid rgba(255,255,255,0.2)"
                      : "1px solid rgba(255,255,255,0.06)",
                }}
              >

                <strong>
                  {day.label}
                </strong>

                <div
                  style={{
                    fontSize:
                      "12px",
                    opacity: 0.65,
                    marginTop:
                      "3px",
                  }}
                >
                  {day.dateLabel}
                </div>

                <div
                  style={{
                    marginTop:
                      "12px",
                    fontSize:
                      "18px",
                    fontWeight: 700,
                  }}
                >
                  {day.completed}/
                  {day.tasks}
                </div>

                <div
                  style={{
                    fontSize:
                      "12px",
                    opacity: 0.7,
                    marginTop:
                      "4px",
                  }}
                >
                  {formatMinutes(
                    day.studyMinutes
                  )}
                </div>

              </div>
            )
          )}

        </div>

      </section>

      {/* =================================================
          ACTIVITY PROGRESS + CAREER
      ================================================= */}

      <section
        className="two-column"
        style={{
          marginBottom: "20px",
        }}
      >

        {/* ACTIVITY PROGRESS */}

        <div
          className="section-card"
          style={{
            padding: "24px",
          }}
        >

          <div className="section-title">

            <BarChart3 size={22} />

            <h2>
              Activity Progress
            </h2>

          </div>

          <div
            style={{
              marginTop: "12px",
            }}
          >

            <ActivityRow
              label="Tasks"
              completed={
                summary.completedTasks
              }
              total={
                summary.weeklyTasks.length
              }
              icon={CheckCircle2}
            />

            <ActivityRow
              label="Learning"
              completed={
                summary.completedTopics
              }
              total={
                summary.weeklyTopics.length
              }
              icon={BookOpen}
            />

            <ActivityRow
              label="Goals"
              completed={
                summary.completedGoals
              }
              total={
                summary.weeklyGoals.length
              }
              icon={Target}
            />

            <ActivityRow
              label="Assessments"
              completed={
                summary.completedAssessments
              }
              total={
                summary.weeklyAssessments.length
              }
              icon={ClipboardCheck}
            />

            <ActivityRow
              label="Activities"
              completed={
                summary.completedActivities
              }
              total={
                summary.weeklyActivities.length
              }
              icon={Activity}
            />

          </div>

        </div>

        {/* CAREER */}

        <div
          className="section-card"
          style={{
            padding: "24px",
          }}
        >

          <div className="section-title">

            <BriefcaseBusiness
              size={22}
            />

            <h2>
              Career This Week
            </h2>

          </div>

          <div
            style={{
              display: "grid",
              gap: "14px",
              marginTop: "18px",
            }}
          >

            <div>

              <strong>
                Applications
              </strong>

              <div
                style={{
                  fontSize:
                    "26px",
                  fontWeight: 700,
                  marginTop:
                    "4px",
                }}
              >
                {
                  summary
                    .weeklyApplications
                    .length
                }
              </div>

            </div>

            <div>

              <strong>
                Interviews
              </strong>

              <div
                style={{
                  fontSize:
                    "26px",
                  fontWeight: 700,
                  marginTop:
                    "4px",
                }}
              >
                {
                  summary
                    .weeklyInterviews
                    .length
                }
              </div>

            </div>

            <div>

              <strong>
                Study Sessions
              </strong>

              <div
                style={{
                  fontSize:
                    "26px",
                  fontWeight: 700,
                  marginTop:
                    "4px",
                }}
              >
                {
                  summary
                    .weeklyStudySessions
                    .length
                }
              </div>

            </div>

          </div>

        </div>

      </section>

      {/* =================================================
          WEEKLY SUMMARY
      ================================================= */}

      <section
        className="section-card"
        style={{
          padding: "24px",
        }}
      >

        <div className="section-title">

          <ClipboardCheck
            size={22}
          />

          <h2>
            Weekly Summary
          </h2>

        </div>

        <div
          style={{
            marginTop: "16px",
            lineHeight: 1.7,
          }}
        >

          <p
            style={{
              margin:
                "0 0 8px",
            }}
          >
            You completed{" "}
            <strong>
              {summary.totalCompleted}
            </strong>{" "}
            of{" "}
            <strong>
              {summary.totalTracked}
            </strong>{" "}
            tracked items this week.
          </p>

          <p
            style={{
              margin:
                "0 0 8px",
            }}
          >
            Total study time:{" "}
            <strong>
              {formatMinutes(
                summary.studyMinutes
              )}
            </strong>
            .
          </p>

          <p
            style={{
              margin: 0,
            }}
          >
            Career activity:{" "}
            <strong>
              {
                summary
                  .weeklyApplications
                  .length
              }
            </strong>{" "}
            applications and{" "}
            <strong>
              {
                summary
                  .weeklyInterviews
                  .length
              }
            </strong>{" "}
            interviews.
          </p>

        </div>

      </section>

    </div>
  );
}