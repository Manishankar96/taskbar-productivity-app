import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Target,
  TrendingUp,
} from "lucide-react";

import {
  getItemsFromFirestore,
} from "../firebase/firestore";

import {
  createDailyReview,
  formatStudyTime,
} from "../services/dailyReviewService";

function StatCard({ icon: Icon, label, value, secondary }) {
  return (
    <div className="section-card" style={{ padding: "20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        <Icon size={20} />
        <span style={{ fontWeight: 600 }}>{label}</span>
      </div>

      <div style={{ fontSize: "28px", fontWeight: 700 }}>
        {value}
      </div>

      {secondary && (
        <div className="home-subtitle" style={{ marginTop: "6px" }}>
          {secondary}
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, summary }) {
  if (!summary) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "14px 0",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div>
        <strong>{label}</strong>
        <div className="home-subtitle" style={{ marginTop: "4px" }}>
          {summary.completed} completed • {summary.pending} pending
        </div>
      </div>

      <span style={{ fontWeight: 700 }}>{summary.total}</span>
    </div>
  );
}

const COLLECTIONS = {
  tasks: "todoList",
  learning: "topics",
  goals: "goals",
  assessments: "assessments",
  timetable: "timetable",
  applications: "applications",
  interviews: "interviews",
  studySessions: "studySessions",
  activities: "activities",
};

function DailyReview() {
  const [data, setData] = useState({
    tasks: [],
    learning: [],
    goals: [],
    assessments: [],
    timetable: [],
    applications: [],
    interviews: [],
    studySessions: [],
    activities: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const entries = await Promise.all(
          Object.entries(COLLECTIONS).map(async ([key, collectionName]) => {
            const items = await getItemsFromFirestore(collectionName);
            return [key, Array.isArray(items) ? items : []];
          })
        );

        if (cancelled) {
          return;
        }

        setData(Object.fromEntries(entries));
      } catch (loadError) {
        console.error("Failed to load Daily Review data:", loadError);

        if (!cancelled) {
          setError("Unable to load Daily Review data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const review = useMemo(
    () =>
      createDailyReview({
        ...data,
        today,
      }),
    [data, today]
  );

  if (loading) {
    return (
      <div
        className="page-container"
        style={{
          width: "100%",
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "24px",
        }}
      >
        <div className="section-card" style={{ padding: "24px" }}>
          Loading Daily Review...
        </div>
      </div>
    );
  }

  return (
    <div
      className="page-container"
      style={{
        width: "100%",
        maxWidth: "1400px",
        margin: "0 auto",
        padding: "24px",
      }}
    >
      <div
        className="section-card"
        style={{
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <TrendingUp size={24} />
          <h1 style={{ margin: 0 }}>Daily Review</h1>
        </div>

        <p className="home-subtitle" style={{ margin: 0 }}>
          Review your TASKBAR progress for {review.date}.
        </p>

        {error && (
          <p
            className="home-subtitle"
            style={{ margin: "12px 0 0", color: "#ff8a8a" }}
          >
            {error}
          </p>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={review.overall.completed}
          secondary={`${review.overall.completionPercentage}% of tracked items`}
        />

        <StatCard
          icon={ClipboardCheck}
          label="Pending"
          value={review.overall.pending}
          secondary={`${review.overall.total} tracked items`}
        />

        <StatCard
          icon={Clock3}
          label="Study Time"
          value={formatStudyTime(review.study.minutes)}
          secondary={`${review.study.sessionCount} session${
            review.study.sessionCount === 1 ? "" : "s"
          }`}
        />

        <StatCard
          icon={Target}
          label="Progress"
          value={`${review.overall.completionPercentage}%`}
          secondary="Today's completion"
        />
      </div>

      <div
        className="section-card"
        style={{
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "8px",
          }}
        >
          <Activity size={22} />
          <h2 style={{ margin: 0 }}>Today's Activity</h2>
        </div>

        <ReviewRow label="Tasks" summary={review.tasks} />
        <ReviewRow label="Learning" summary={review.learning} />
        <ReviewRow label="Goals" summary={review.goals} />
        <ReviewRow label="Assessments" summary={review.assessments} />
        <ReviewRow label="Timetable" summary={review.timetable} />
        <ReviewRow label="Activities" summary={review.activities} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "16px",
        }}
      >
        <StatCard
          icon={BookOpen}
          label="Study Sessions"
          value={review.study.sessionCount}
          secondary={formatStudyTime(review.study.minutes)}
        />

        <StatCard
          icon={BriefcaseBusiness}
          label="Career Activity"
          value={review.applications.total + review.interviews.total}
          secondary={`${review.applications.completed} applications completed • ${review.interviews.completed} interviews completed`}
        />
      </div>
    </div>
  );
}

export default DailyReview;
