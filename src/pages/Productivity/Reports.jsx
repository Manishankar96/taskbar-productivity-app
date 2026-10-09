import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  BarChart3,
  Flame,
  History,
  RefreshCw,
} from "lucide-react";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

import {
  getTopics,
  getGoals,
  getWater,
  getStudySessions,
  getActivities,
  getTodoList,
  getAssessments,
  getStreak,
  getDailyReports,
  ensureDailyReportHistory,
  deleteItem,
  getApplications,
  getInterviews,
  deleteApplication,
  deleteInterview,
} from "../../utils/db";

import {
  getItemsFromFirestore,
  subscribeToFirestoreCollection,
} from "../../firebase/firestore";


/* =========================================================
   HELPERS
========================================================= */

function getToday() {
  const date = new Date();

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}


function getDateDaysAgo(days) {
  const date = new Date();

  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}


function getLastDays(count) {
  const dates = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    dates.push(getDateDaysAgo(i));
  }

  return dates;
}


function formatDate(dateString) {
  return new Date(
    `${dateString}T00:00:00`
  ).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}


function shortDate(dateString) {
  return new Date(
    `${dateString}T00:00:00`
  ).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}


function weekday(dateString) {
  return new Date(
    `${dateString}T00:00:00`
  ).toLocaleDateString("en-IN", {
    weekday: "short",
  });
}


function safeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}


function formatMinutes(minutes) {
  const value = safeNumber(minutes);

  if (value <= 0) {
    return "0m";
  }

  const hours = Math.floor(value / 60);
  const mins = Math.round(value % 60);

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }

  return `${mins}m`;
}


function formatLitres(ml) {
  return `${(safeNumber(ml) / 1000).toFixed(1)} L`;
}


function sumField(items, fields) {
  if (!Array.isArray(items)) {
    return 0;
  }

  return items.reduce((total, item) => {
    for (const field of fields) {
      if (item?.[field] !== undefined) {
        return total + safeNumber(item[field]);
      }
    }

    return total;
  }, 0);
}


/* =========================================================
   STUDY TIME
   Study Time comes ONLY from Study Sessions.
========================================================= */

function getStudyMinutesForDate(studySessions, date) {
  if (!Array.isArray(studySessions)) {
    return 0;
  }

  return studySessions
    .filter((session) => session?.date === date)
    .reduce((total, session) => {
      return (
        total +
        Math.max(
          0,
          safeNumber(
            session?.duration ??
              session?.minutes ??
              session?.time
          )
        )
      );
    }, 0);
}


/* =========================================================
   WATER
========================================================= */

function getWaterForDate(waterRows, date) {
  if (!Array.isArray(waterRows)) {
    return 0;
  }

  const rows = waterRows.filter(
    (row) => row && row.date === date
  );

  const dailyRecord = rows.find(
    (row) =>
      row.consumed !== undefined ||
      row.consumedMl !== undefined
  );

  if (dailyRecord) {
    return Math.max(
      0,
      safeNumber(
        dailyRecord.consumed ??
          dailyRecord.consumedMl
      )
    );
  }

  return rows.reduce((total, row) => {
    return (
      total +
      safeNumber(
        row.amountMl ??
          row.amount ??
          row.water ??
          row.quantity ??
          row.ml
      )
    );
  }, 0);
}


function getWaterTargetForDate(waterRows, date) {
  if (!Array.isArray(waterRows)) {
    return 0;
  }

  return Math.max(
    ...waterRows
      .filter((row) => row?.date === date)
      .map((row) =>
        safeNumber(
          row?.target ??
            row?.targetMl ??
            row?.dailyTargetMl
        )
      ),
    0
  );
}


/* =========================================================
   TOPICS / TASKS
========================================================= */

function isCompleted(item) {
  return (
    item?.completed === true ||
    item?.status === "completed" ||
    item?.isCompleted === true
  );
}


function normalizeDateKey(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);

    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return `${parsed.getFullYear()}-${String(
      parsed.getMonth() + 1
    ).padStart(2, "0")}-${String(
      parsed.getDate()
    ).padStart(2, "0")}`;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(
      value.getMonth() + 1
    ).padStart(2, "0")}-${String(
      value.getDate()
    ).padStart(2, "0")}`;
  }

  return "";
}


function isDateForItem(item, date) {
  return [
    item?.date,
    item?.dueDate,
    item?.completedAt,
  ].some((value) => normalizeDateKey(value) === date);
}


/* =========================================================
   REPORTS
========================================================= */

function Reports() {
  const location = useLocation();
  const isInsightsPage = location.pathname === "/insights";

  const [topics, setTopics] = useState([]);
  const [goals, setGoals] = useState([]);
  const [water, setWater] = useState([]);
  const [studySessions, setStudySessions] = useState([]);
  const [activities, setActivities] = useState([]);
  const [todoList, setTodoList] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [incomeList, setIncomeList] = useState([]);
  const [expenseList, setExpenseList] = useState([]);
  const [jobPreparationData, setJobPreparationData] = useState({
    tasks: [],
  });
  const [applicationsList, setApplicationsList] = useState([]);
  const [savedJobsList, setSavedJobsList] = useState([]);
  const [interviewsList, setInterviewsList] = useState([]);

  const [streak, setStreak] = useState({
    current: 0,
    best: 0,
  });

  const [dailyReports, setDailyReports] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [tab, setTab] = useState("Daily");
  const HISTORY_CATEGORIES = [
    "Learning",
    "Goals",
    "Tasks",
    "Assessments",
    "Study Sessions",
    "Activities",
    "Career Applications",
  ];

  const [selectedHistoryCategory, setSelectedHistoryCategory] =
    useState("Learning");

  const [historyViewMode, setHistoryViewMode] = useState("category");
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(getToday());

  const [today, setToday] = useState(getToday());
  const [historyClock, setHistoryClock] = useState(Date.now());

  /* =======================================================
     HISTORY RETENTION

     Completed items stay in History for 50 days from their
     original completion timestamp. After 50 full days the
     original Firestore document is permanently deleted.

     This cleanup runs while the app is open. It also runs when
     Reports loads, so expired records are removed on the next
     app/session open even if the app was closed at the exact
     50-day boundary.
  ======================================================= */

  const HISTORY_DELAY_DAYS = 2;
  const HISTORY_RETENTION_DAYS = 50;
  const HISTORY_RETENTION_MS =
    HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  function getCompletionTimestampForCleanup(item) {
    const value = item?.completedAtTimestamp || item?.completedAt;
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.getTime();
  }

  async function cleanupExpiredHistory() {
    const cutoff = Date.now() - HISTORY_RETENTION_MS;

    const [
      topicData,
      goalData,
      todoData,
      assessmentData,
      studyData,
      activityData,
      applicationData,
      interviewData,
    ] = await Promise.all([
      getTopics(),
      getGoals(),
      getTodoList(),
      getAssessments(),
      getStudySessions(),
      getActivities(),
      getApplications(),
      getInterviews(),
    ]);

    const cleanupJobs = [];

    const addExpiredJobs = (items, storeName, deleteFn = null) => {
      if (!Array.isArray(items)) return;

      items.forEach((item) => {
        const completedTime = getCompletionTimestampForCleanup(item);
        if (completedTime === null || completedTime > cutoff) return;

        const id = String(item?.id ?? "").trim();
        if (!id) return;

        cleanupJobs.push(
          (deleteFn ? deleteFn(id) : deleteItem(storeName, id))
            .catch((error) => {
              console.error(
                `History cleanup failed for ${storeName}/${id}:`,
                error
              );
            })
        );
      });
    };

    addExpiredJobs(topicData, "topics");
    addExpiredJobs(goalData, "goals");
    addExpiredJobs(todoData, "todoList");
    addExpiredJobs(assessmentData, "assessments");
    addExpiredJobs(studyData, "studySessions");
    addExpiredJobs(activityData, "activities");
    addExpiredJobs(applicationData, "applications", deleteApplication);
    addExpiredJobs(interviewData, "interviews", deleteInterview);

    if (cleanupJobs.length > 0) {
      await Promise.all(cleanupJobs);
    }
  }


  /* =======================================================
     REFRESH THE 2-DAY HISTORY BOUNDARY
  ======================================================= */

  useEffect(() => {
    const timer = setInterval(() => {
      setHistoryClock(Date.now());
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);


  /* =======================================================
     AUTOMATIC 50-DAY CLEANUP
  ======================================================= */

  useEffect(() => {
    let mounted = true;

    const runCleanup = async () => {
      try {
        await cleanupExpiredHistory();
        if (mounted) {
          setHistoryClock(Date.now());
        }
      } catch (error) {
        console.error("Automatic 50-day History cleanup error:", error);
      }
    };

    runCleanup();
    const timer = setInterval(runCleanup, 5 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);


  /* =======================================================
     DETECT NEW DAY
  ======================================================= */

  useEffect(() => {
    const timer = setInterval(() => {
      const newToday = getToday();

      setToday((oldToday) =>
        oldToday === newToday ? oldToday : newToday
      );
    }, 30000);

    return () => clearInterval(timer);
  }, []);


  /* =======================================================
     LOAD DATA
======================================================= */

  async function loadReports(showRefresh = false) {
    try {
      if (showRefresh) {
        setRefreshing(true);
      }

      /*
        Historical reports are rebuilt for previous dates.
        Today's report is intentionally calculated live below.
      */
      await ensureDailyReportHistory();

      const [
        topicData,
        goalData,
        waterData,
        studyData,
        activityData,
        personalTodoData,
        assessmentData,
        streakData,
        reportData,
        incomeData,
        expenseData,
        jobPreparationDataFromFirestore,
        applicationsData,
        savedJobsData,
        interviewsData,
      ] = await Promise.all([
        getTopics(),
        getGoals(),
        getWater(),
        getStudySessions(),
        getActivities(),
        getTodoList(),
        getAssessments(),
        getStreak(),
        getDailyReports(),
        getItemsFromFirestore("income"),
        getItemsFromFirestore("expenses"),
        getItemsFromFirestore("jobPreparation"),
        getApplications(),
        getItemsFromFirestore("savedJobs"),
        getInterviews(),
      ]);

      setTopics(
        Array.isArray(topicData) ? topicData : []
      );

      setGoals(
        Array.isArray(goalData) ? goalData : []
      );

      setWater(
        Array.isArray(waterData) ? waterData : []
      );

      setStudySessions(
        Array.isArray(studyData) ? studyData : []
      );

      setActivities(
        Array.isArray(activityData) ? activityData : []
      );

      setTodoList(
        Array.isArray(personalTodoData) ? personalTodoData : []
      );

      setAssessments(
        Array.isArray(assessmentData) ? assessmentData : []
      );

      setIncomeList(
        Array.isArray(incomeData) ? incomeData : []
      );

      setExpenseList(
        Array.isArray(expenseData) ? expenseData : []
      );

      const jobPreparationItems = Array.isArray(
        jobPreparationDataFromFirestore
      )
        ? jobPreparationDataFromFirestore
        : [];

      const jobPreparationObject =
        jobPreparationItems.length === 1 &&
        Array.isArray(jobPreparationItems[0]?.tasks)
          ? jobPreparationItems[0]
          : {
              tasks: jobPreparationItems.flatMap((item) =>
                Array.isArray(item?.tasks) ? item.tasks : []
              ),
            };

      setJobPreparationData(jobPreparationObject);
      setApplicationsList(
        Array.isArray(applicationsData) ? applicationsData : []
      );
      setSavedJobsList(
        Array.isArray(savedJobsData) ? savedJobsData : []
      );
      setInterviewsList(
        Array.isArray(interviewsData) ? interviewsData : []
      );

      if (
        Array.isArray(streakData) &&
        streakData.length > 0
      ) {
        setStreak(streakData[0]);
      } else {
        setStreak({
          current: 0,
          best: 0,
        });
      }

      setDailyReports(
        Array.isArray(reportData) ? reportData : []
      );
    } catch (error) {
      console.error("Reports loading error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }


  /* =======================================================
     INITIAL LOAD
======================================================= */

  useEffect(() => {
    const unsubscribers = [];
    let mounted = true;

    const normalizeJobPreparation = (items) => {
      const rows = Array.isArray(items) ? items : [];

      if (rows.length === 1 && Array.isArray(rows[0]?.tasks)) {
        return rows[0];
      }

      return {
        tasks: rows.flatMap((item) =>
          Array.isArray(item?.tasks) ? item.tasks : []
        ),
      };
    };

    const addListener = (collectionName, callback) => {
      try {
        const unsubscribe = subscribeToFirestoreCollection(
          collectionName,
          (items) => {
            if (!mounted) return;
            callback(Array.isArray(items) ? items : []);
          },
          (error) => {
            console.error(
              `Reports Firestore listener error (${collectionName}):`,
              error
            );
          }
        );

        if (typeof unsubscribe === "function") {
          unsubscribers.push(unsubscribe);
        }
      } catch (error) {
        console.error(
          `Reports could not subscribe to ${collectionName}:`,
          error
        );
      }
    };

    addListener("income", (items) => setIncomeList(items));
    addListener("expenses", (items) => setExpenseList(items));
    addListener("jobPreparation", (items) =>
      setJobPreparationData(normalizeJobPreparation(items))
    );
    addListener("applications", (items) => setApplicationsList(items));
    addListener("savedJobs", (items) => setSavedJobsList(items));
    addListener("interviews", (items) => setInterviewsList(items));

    return () => {
      mounted = false;
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.error("Reports listener cleanup error:", error);
        }
      });
    };
  }, []);


  /* =======================================================
     AUTO SYNC

     Water, Learning, Tasks, Activities and Study Sessions
     can change from another page. Re-read the data so the
     Daily score and today's History stay synchronized.
======================================================= */

  useEffect(() => {
    const timer = setInterval(() => {
      loadReports();
    }, 5000);

    const refreshFinance = () => loadReports();
    const refreshCareer = () => loadReports();

    window.addEventListener("taskbar-finance-updated", refreshFinance);
    window.addEventListener("taskbarJobPreparationUpdated", refreshCareer);
    window.addEventListener("taskbarApplicationsUpdated", refreshCareer);
    window.addEventListener("taskbarSavedJobsUpdated", refreshCareer);
    window.addEventListener("taskbarInterviewsUpdated", refreshCareer);
    window.addEventListener("storage", refreshFinance);

    return () => {
      clearInterval(timer);
      window.removeEventListener(
        "taskbar-finance-updated",
        refreshFinance
      );
      window.removeEventListener(
        "taskbarJobPreparationUpdated",
        refreshCareer
      );
      window.removeEventListener(
        "taskbarApplicationsUpdated",
        refreshCareer
      );
      window.removeEventListener(
        "taskbarSavedJobsUpdated",
        refreshCareer
      );
      window.removeEventListener(
        "taskbarInterviewsUpdated",
        refreshCareer
      );
      window.removeEventListener("storage", refreshFinance);
    };
  }, []);


  /* =======================================================
     DAILY LIVE DATA
======================================================= */

  const daily = useMemo(() => {
    const waterToday = getWaterForDate(
      water,
      today
    );

    const waterTarget = getWaterTargetForDate(
      water,
      today
    );

    const activityToday = activities.filter(
      (item) => item?.date === today
    );

    const studyMinutes =
      getStudyMinutesForDate(
        studySessions,
        today
      );

    const learningCompleted =
      topics.filter(
        (topic) =>
          isDateForItem(topic, today) &&
          isCompleted(topic)
      ).length;

    /*
      Daily Tasks use the Central To-Do list.
    */
    const dailyTaskMap = new Map();

    todoList.forEach((task) => {
      const taskDate = normalizeDateKey(
        task?.date ?? task?.dueDate
      );

      if (taskDate !== today) return;

      const id = `todo-${String(task?.id ?? task?.title ?? Math.random())}`;

      dailyTaskMap.set(id, {
        ...task,
        date: taskDate,
        completed: isCompleted(task),
      });
    });

    const todayTasks = Array.from(dailyTaskMap.values());

    const tasksCompleted =
      todayTasks.filter(isCompleted).length;

    const goalValues = goals.map((goal) => {
      if (goal?.status === "completed") {
        return 100;
      }

      return Math.min(
        100,
        Math.max(
          0,
          safeNumber(goal?.progress)
        )
      );
    });

    const avgGoal =
      goalValues.length > 0
        ? Math.round(
            goalValues.reduce(
              (sum, value) => sum + value,
              0
            ) / goalValues.length
          )
        : 0;

    const waterPercentage =
      waterTarget > 0
        ? Math.min(
            100,
            Math.round(
              (waterToday / waterTarget) * 100
            )
          )
        : 0;

    const taskCompletionRate =
      todayTasks.length > 0
        ? Math.round(
            (tasksCompleted /
              todayTasks.length) *
              100
          )
        : tasksCompleted > 0
          ? 100
          : 0;

    /*
      SAME formula used by db.js for historical reports.
    */
    const productivityScore = Math.min(
      100,
      Math.max(
        0,
        Math.round(
          learningCompleted > 0 ? 25 : 0
        ) +
          Math.round(avgGoal * 0.20) +
          Math.round(
            taskCompletionRate * 0.20
          ) +
          Math.round(
            waterPercentage * 0.15
          ) +
          (activityToday.length > 0 &&
          sumField(
            activityToday,
            ["duration", "minutes", "time"]
          ) > 0
            ? 10
            : 0) +
          (studyMinutes > 0 ? 10 : 0)
      )
    );

    return {
      waterToday,
      waterTarget,
      studyMinutes,
      activityToday,
      activityMinutes: sumField(
        activityToday,
        ["duration", "minutes", "time"]
      ),
      learningCompleted,
      tasksCompleted,
      avgGoal,
      productivityScore,
    };
  }, [
    today,
    topics,
    goals,
    water,
    studySessions,
    activities,
    todoList,
  ]);


  /* =======================================================
     TODAY LIVE REPORT

     This object is NOT stored in IndexedDB.
     It is created from the latest dashboard data.
======================================================= */

  const todayLiveReport = useMemo(() => {
    return {
      id: `live-${today}`,
      date: today,

      learning: {
        completed: daily.learningCompleted,
      },

      summary: {
        topicsCompleted:
          daily.learningCompleted,
        tasksCompleted:
          daily.tasksCompleted,
        avgGoalProgress:
          daily.avgGoal,
        studyMinutes:
          daily.studyMinutes,
        screenMinutes:
          daily.screenMinutes,
        waterConsumed:
          daily.waterToday,
        activityMinutes:
          daily.activityMinutes,
        productivityScore:
          daily.productivityScore,
      },

      productivityScore:
        daily.productivityScore,

      water: {
        consumedMl:
          daily.waterToday,
        target:
          daily.waterTarget,
      },
    };
  }, [today, daily]);


  /* =======================================================
     TASKBAR HISTORY

     Single History rule:
     - An item becomes completed in its original section.
     - It stays there for a full 2 days.
     - After 2 full days it appears in Reports -> History.
     - It is permanently deleted 50 days after completion.

     Applications and Interviews are both included.
  ======================================================= */

  const HISTORY_DELAY_MS = HISTORY_DELAY_DAYS * 24 * 60 * 60 * 1000;

  function getHistoryCompletedAt(item) {
    return item?.completedAt || item?.completedAtTimestamp || null;
  }

  function isHistoryEligible(item) {
    const completedAt = getHistoryCompletedAt(item);
    if (!completedAt) return false;

    const completedDate = new Date(completedAt);
    if (Number.isNaN(completedDate.getTime())) return false;

    return historyClock - completedDate.getTime() >= HISTORY_DELAY_MS;
  }

  function isCompletedForHistory(item, category) {
    // A real completion timestamp is the strongest signal because the
    // 2-day countdown must start from the exact completion moment.
    if (item?.completedAt || item?.completedAtTimestamp) return true;

    if (category === "Career Applications") {
      return Boolean(
        isCompleted(item) ||
        item?.followUpCompleted === true ||
        [
          "Completed",
          "Passed",
          "Failed",
          "Cancelled",
          "Selected",
          "Rejected",
          "Withdrawn",
        ].includes(item?.status)
      );
    }

    return isCompleted(item);
  }

  function isHistoryItem(item, category) {
    if (!isCompletedForHistory(item, category)) return false;
    if (!isHistoryEligible(item)) return false;

    // Prefer the explicit historyCategory written by the source page.
    if (item?.historyCategory) {
      if (item.historyCategory === category) return true;

      // Backward compatibility for old records that used separate
      // Applications / Interviews categories.
      if (
        category === "Career Applications" &&
        ["Applications", "Interviews"].includes(item.historyCategory)
      ) {
        return true;
      }

      return false;
    }

    // Older records may have no historyCategory. Completion + the
    // correct source collection is enough to place them into History.
    return true;
  }

  const historyItemsByCategory = useMemo(() => {
    return {
      Learning: topics.filter((item) => isHistoryItem(item, "Learning")),
      Goals: goals.filter((item) => isHistoryItem(item, "Goals")),
      Tasks: todoList.filter((item) => isHistoryItem(item, "Tasks")),
      Assessments: assessments.filter((item) => isHistoryItem(item, "Assessments")),
      "Study Sessions": studySessions.filter((item) =>
        isHistoryItem(item, "Study Sessions")
      ),
      Activities: activities.filter((item) =>
        isHistoryItem(item, "Activities")
      ),
      "Career Applications": [
        ...applicationsList
          .filter((item) => isHistoryItem(item, "Career Applications"))
          .map((item) => ({
            ...item,
            historyType: "Application",
          })),
        ...interviewsList
          .filter((item) => isHistoryItem(item, "Career Applications"))
          .map((item) => ({
            ...item,
            historyType: "Interview",
          })),
      ],
    };
  }, [
    topics,
    goals,
    todoList,
    assessments,
    studySessions,
    activities,
    applicationsList,
    interviewsList,
    historyClock,
  ]);

  const selectedHistoryItems =
    historyItemsByCategory[selectedHistoryCategory] || [];

  const HISTORY_META = {
    Learning: { icon: "📚" },
    Goals: { icon: "🎯" },
    Tasks: { icon: "✅" },
    Assessments: { icon: "📝" },
    "Study Sessions": { icon: "⏱️" },
    Activities: { icon: "🏃" },
    "Career Applications": { icon: "💼" },
  };

  function getHistoryCategoryIcon(category) {
    return HISTORY_META[category]?.icon || "📌";
  }

  function getHistoryTitle(item, category) {
    if (item?.historyType === "Interview") return item?.role || item?.title || "Interview";
    if (item?.historyType === "Application") return item?.role || item?.title || "Job Application";
    return item?.title || item?.name || item?.topic || item?.activity || item?.task || item?.goalTitle || item?.assessmentTitle || item?.subject || item?.role || item?.company || `${category} item`;
  }

  function getHistoryCompletedDate(item) {
    const value = getHistoryCompletedAt(item);
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getHistoryDateKey(item) {
    const date = getHistoryCompletedDate(item);
    if (date) return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    return normalizeDateKey(item?.date || item?.dueDate || item?.completedAt);
  }

  function formatHistoryDate(dateKey) {
    if (!dateKey) return "Date not set";
    return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  }

  function formatHistoryTime(item) {
    const date = getHistoryCompletedDate(item);
    return date ? date.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" }) : "";
  }

  function getHistoryRelativeText(item) {
    const date = getHistoryCompletedDate(item);
    if (!date) return "Completed";
    const now = new Date();
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = Math.round((a-b)/(24*60*60*1000));
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff > 1) return `${diff} days ago`;
    return "Completed";
  }

  function getHistorySubtitle(item, category) {
    if (item?.historyType === "Interview") return `Interview • ${item?.status || "Completed"}`;
    if (item?.historyType === "Application") return `Application • ${item?.status || "Completed"}`;
    if (category === "Learning") return item?.skill || item?.status || "Learning topic";
    if (category === "Goals") return item?.skill || item?.status || "Goal";
    if (category === "Tasks") return item?.type || item?.source || (item?.goalTitle ? `Goal task • ${item.goalTitle}` : item?.topic ? `Learning task • ${item.topic}` : "Task");
    if (category === "Assessments") return item?.status || item?.type || "Assessment";
    if (category === "Study Sessions") return item?.topic || item?.subject || item?.skill || "Study session";
    if (category === "Activities") return item?.type || item?.category || "Activity";
    return category;
  }

  function getHistoryDetails(item, category) {
    const details=[];
    if (category === "Learning") { if (item?.skill) details.push(`Skill: ${item.skill}`); if (item?.timeSpent !== undefined) details.push(`Time spent: ${item.timeSpent}`); }
    if (category === "Goals") { if (item?.skill) details.push(`Skill: ${item.skill}`); if (item?.targetDate) details.push(`Target: ${item.targetDate}`); }
    if (category === "Tasks") { if (item?.goalTitle) details.push(`Goal: ${item.goalTitle}`); if (item?.topic) details.push(`Learning: ${item.topic}`); if (item?.date || item?.dueDate) details.push(`Task date: ${item.date || item.dueDate}`); }
    if (category === "Assessments") { if (item?.score !== undefined) details.push(`Score: ${item.score}`); if (item?.result) details.push(`Result: ${item.result}`); if (item?.date) details.push(`Assessment date: ${item.date}`); }
    if (category === "Study Sessions") { const m=item?.actualMinutes ?? item?.durationMinutes ?? item?.duration ?? item?.minutes; if (m !== undefined) details.push(`Duration: ${m} min`); if (item?.skill) details.push(`Skill: ${item.skill}`); if (item?.notes) details.push(`Notes: ${item.notes}`); }
    if (category === "Activities") { const d=item?.duration ?? item?.minutes ?? item?.time; if (d !== undefined) details.push(`Duration: ${d} min`); if (item?.type) details.push(`Type: ${item.type}`); if (item?.notes) details.push(`Notes: ${item.notes}`); }
    if (category === "Career Applications") {
      if (item?.company) details.push(`Company: ${item.company}`);
      if (item?.role) details.push(`Role: ${item.role}`);
      if (item?.status) details.push(`Status: ${item.status}`);
      if (item?.historyType === "Interview" && item?.date) details.push(`Interview date: ${item.date}`);
      if (item?.historyType === "Application" && item?.date) details.push(`Application date: ${item.date}`);
    }
    return details;
  }

  const availableHistoryDates = useMemo(() => {
    const dates = new Set();
    Object.entries(historyItemsByCategory).forEach(([category, items]) => {
      items.forEach((item) => {
        const date = getHistoryDateKey(item);
        if (date) dates.add(date);
      });
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [historyItemsByCategory]);

  useEffect(() => {
    if (!selectedHistoryDate && availableHistoryDates.length > 0) {
      setSelectedHistoryDate(availableHistoryDates[0]);
    }
  }, [availableHistoryDates, selectedHistoryDate]);

  const selectedDayWiseItems = useMemo(() => {
    const rows = [];
    Object.entries(historyItemsByCategory).forEach(([category, items]) => {
      items.forEach((item) => {
        if (getHistoryDateKey(item) === selectedHistoryDate) {
          rows.push({ ...item, historyCategory: category });
        }
      });
    });
    return rows.sort(
      (a, b) =>
        (getHistoryCompletedDate(b)?.getTime() || 0) -
        (getHistoryCompletedDate(a)?.getTime() || 0)
    );
  }, [historyItemsByCategory, selectedHistoryDate]);

  useEffect(() => {
    if (!HISTORY_CATEGORIES.includes(selectedHistoryCategory)) {
      setSelectedHistoryCategory("Learning");
    }
  }, [selectedHistoryCategory]);

  /* =======================================================
     GOALS + CENTRAL TO-DO INSIGHTS

     Uses the same task sources as the central To-Do page.
     Today's tasks are counted separately from overdue tasks.
  ======================================================= */

  const goalsAndTodoInsights = useMemo(() => {
    const goalTotal = goals.length;
    const goalCompleted = goals.filter(
      (goal) => goal?.status === "completed"
    ).length;

    const goalProgress = goalTotal > 0
      ? Math.round((goalCompleted / goalTotal) * 100)
      : 0;

    const centralTasks = [];
    const seenIds = new Set();

    const addTask = (task) => {
      if (!task) return;
      const id = String(task.id ?? "");
      if (id && seenIds.has(id)) return;
      if (id) seenIds.add(id);
      centralTasks.push(task);
    };

    todoList.forEach((task) => addTask({
      id: task?.id,
      title: task?.title ?? task?.text ?? "Task",
      date: task?.date ?? task?.dueDate,
      completed: isCompleted(task),
    }));

    topics.forEach((topic) => {
      if (topic?.plannedDate) {
        addTask({
          id: `learning-${topic?.id}`,
          title: topic?.title ?? topic?.name ?? "Learning task",
          date: topic.plannedDate,
          completed: topic?.status === "completed",
        });
      }
    });

    goals.forEach((goal) => {
      if (goal?.targetDate) {
        addTask({
          id: `goal-${goal?.id}`,
          title: goal?.title ?? goal?.name ?? "Goal",
          date: goal.targetDate,
          completed: goal?.status === "completed",
        });
      }
    });

    assessments.forEach((assessment) => {
      if (assessment?.date) {
        addTask({
          id: `assessment-${assessment?.id}`,
          title: assessment?.title ?? assessment?.name ?? "Assessment",
          date: assessment.date,
          completed: isCompleted(assessment),
        });
      }
    });

    const todayLong = new Date(`${today}T00:00:00`)
      .toLocaleDateString("en-IN", { weekday: "long" })
      .toLowerCase();
    const todayShort = weekday(today).toLowerCase();

    const preparationTasks = Array.isArray(jobPreparationData?.tasks)
      ? jobPreparationData.tasks
      : [];

    preparationTasks.forEach((task) => {
      if (task?.dueDate) {
        addTask({
          id: `job-prep-${task?.id}`,
          title: task?.title ?? task?.name ?? "Job preparation task",
          date: task.dueDate,
          completed: task?.completed === true,
        });
      }
    });

    applicationsList.forEach((application) => {
      if (application?.followUpDate) {
        addTask({
          id: `application-follow-up-${application?.id}`,
          title: `Follow up: ${application?.role ?? "Application"} – ${application?.company ?? ""}`,
          date: application.followUpDate,
          completed:
            ["Selected", "Rejected", "Withdrawn"].includes(application?.status) ||
            application?.followUpCompleted === true,
        });
      }
    });

    savedJobsList.forEach((job) => {
      if (job?.actionDate === today) {
        addTask({
          id: `saved-job-action-${job?.id}`,
          title: `Apply: ${job?.role ?? "Job"} – ${job?.company ?? ""}`,
          date: job.actionDate,
          completed: job?.actionCompleted === true,
        });
      }
    });

    interviewsList.forEach((interview) => {
      if (interview?.date) {
        addTask({
          id: `interview-${interview?.id}`,
          title: `Interview: ${interview?.role ?? "Interview"} – ${interview?.company ?? ""}`,
          date: interview.date,
          completed: ["Completed", "Passed", "Failed", "Cancelled"].includes(
            interview?.status
          ),
        });
      }
    });

    const datedTasks = centralTasks.filter((task) => task.date);
    const todayTasks = datedTasks.filter((task) => task.date === today);
    const overdueTasks = datedTasks.filter(
      (task) => task.date < today && !task.completed
    );

    const completedToday = todayTasks.filter((task) => task.completed).length;
    const pendingToday = todayTasks.filter((task) => !task.completed).length;

    const completionRate = todayTasks.length > 0
      ? Math.round((completedToday / todayTasks.length) * 100)
      : 0;

    return {
      goalTotal,
      goalCompleted,
      goalProgress,
      todayTotal: todayTasks.length,
      completedToday,
      pendingToday,
      overdueCount: overdueTasks.length,
      completionRate,
    };
  }, [
    goals,
    todoList,
    topics,
    assessments,
    jobPreparationData,
    applicationsList,
    savedJobsList,
    interviewsList,
    today,
  ]);


  /* =======================================================
     PRODUCTIVITY
======================================================= */

  const financeInsights = useMemo(() => {
    const monthKey = today.slice(0, 7);

    const monthIncome = incomeList
      .filter((item) =>
        String(item?.date || "").startsWith(monthKey)
      )
      .reduce(
        (total, item) =>
          total + safeNumber(item?.amount),
        0
      );

    const monthExpenses = expenseList
      .filter((item) =>
        String(item?.date || "").startsWith(monthKey)
      )
      .reduce(
        (total, item) =>
          total + safeNumber(item?.amount),
        0
      );

    const balance =
      monthIncome - monthExpenses;

    const savingsRate =
      monthIncome > 0
        ? Math.round(
            (balance / monthIncome) * 1000
          ) / 10
        : 0;

    const expenseRate =
      monthIncome > 0
        ? Math.round(
            (monthExpenses / monthIncome) * 1000
          ) / 10
        : 0;

    return {
      monthIncome,
      monthExpenses,
      balance,
      savingsRate,
      expenseRate,
    };
  }, [incomeList, expenseList, today]);


  const careerInsights = useMemo(() => {
    const preparationTasks = Array.isArray(jobPreparationData?.tasks)
      ? jobPreparationData.tasks
      : [];

    const preparationCompleted = preparationTasks.filter(
      (task) => task?.completed === true
    ).length;

    const preparationProgress =
      preparationTasks.length > 0
        ? Math.round((preparationCompleted / preparationTasks.length) * 100)
        : 0;

    const applicationStatusCounts = applicationsList.reduce(
      (counts, application) => {
        const status = String(application?.status || "").trim();
        if (status) {
          counts[status] = (counts[status] || 0) + 1;
        }
        return counts;
      },
      {}
    );

    const interviewActiveCount = interviewsList.filter(
      (interview) =>
        !["Completed", "Passed", "Failed", "Cancelled"].includes(
          interview?.status
        )
    ).length;

    return {
      preparationTotal: preparationTasks.length,
      preparationCompleted,
      preparationProgress,
      applicationsTotal: applicationsList.length,
      underReview: applicationStatusCounts["Under Review"] || 0,
      interviewApplications: applicationStatusCounts.Interview || 0,
      selected: applicationStatusCounts.Selected || 0,
      rejected: applicationStatusCounts.Rejected || 0,
      savedJobs: savedJobsList.length,
      interviewsTotal: interviewsList.length,
      activeInterviews: interviewActiveCount,
    };
  }, [
    jobPreparationData,
    applicationsList,
    savedJobsList,
    interviewsList,
  ]);


  const productivityScore =
    daily.productivityScore;


  const productivityMessage =
    useMemo(() => {
      if (productivityScore >= 90) {
        return "Excellent day! 🔥";
      }

      if (productivityScore >= 75) {
        return "Great work today! 💪";
      }

      if (productivityScore >= 50) {
        return "Good progress. Keep going! 👍";
      }

      if (productivityScore >= 25) {
        return "You can do better tomorrow. 🌱";
      }

      return "Let's make today productive! 🚀";
    }, [productivityScore]);


  /* =======================================================
     WEEKLY
======================================================= */

  const weekDates = useMemo(
    () => getLastDays(7),
    [today]
  );


  const weeklyChart = useMemo(() => {
    return weekDates.map((date) => {
      const study =
        getStudyMinutesForDate(
          studySessions,
          date
        );

      const activity = sumField(
        activities.filter(
          (item) => item?.date === date
        ),
        ["duration", "minutes", "time"]
      );

      const waterMl =
        getWaterForDate(
          water,
          date
        );

      return {
        day: weekday(date),
        studyTime:
          Math.round((study / 60) * 10) / 10,
        activity:
          Math.round((activity / 60) * 10) / 10,
        water:
          Math.round((waterMl / 1000) * 10) / 10,
      };
    });
  }, [
    weekDates,
    studySessions,
    activities,
    water,
  ]);


  const weeklyWater = useMemo(
    () =>
      weekDates.reduce(
        (total, date) =>
          total +
          getWaterForDate(
            water,
            date
          ),
        0
      ),
    [weekDates, water]
  );


  const weeklyStudy = useMemo(
    () =>
      weekDates.reduce(
        (total, date) =>
          total +
          getStudyMinutesForDate(
            studySessions,
            date
          ),
        0
      ),
    [studySessions, weekDates]
  );


  const weeklyActivities = useMemo(
    () =>
      sumField(
        activities.filter(
          (item) =>
            weekDates.includes(
              item?.date
            )
        ),
        ["duration", "minutes", "time"]
      ),
    [activities, weekDates]
  );


  const weeklyTopics =
    topics.filter(
      (topic) => {
        const completedDate =
          normalizeDateKey(topic?.completedAt);

        const itemDate =
          normalizeDateKey(
            topic?.date ??
            topic?.plannedDate
          );

        return (
          weekDates.includes(completedDate || itemDate) &&
          isCompleted(topic)
        );
      }
    ).length;


  /*
   * Tasks are read from the Central To-Do list first.
   *
   * The old code compared an ISO timestamp such as
   * 2026-09-21T10:30:00.000Z directly with a date key
   * such as 2026-09-21, so completed tasks were missed.
   *
   * We normalize both values to the same local date key.
   */
  const weeklyTasks = useMemo(() => {
    const centralCompletedTasks = todoList.filter((task) => {
      const completedDate = normalizeDateKey(
        task?.completedAt
      );

      const taskDate = normalizeDateKey(
        task?.date ?? task?.dueDate
      );

      const taskDateForReport =
        completedDate || taskDate;

      return (
        weekDates.includes(taskDateForReport) &&
        isCompleted(task)
      );
    });

    return centralCompletedTasks.length;
  }, [todoList, weekDates]);


  /* =======================================================
     MONTHLY
======================================================= */

  const monthDates = useMemo(() => {
    const dates = [];
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth =
      new Date(
        year,
        month + 1,
        0
      ).getDate();

    for (
      let day = 1;
      day <= daysInMonth;
      day += 1
    ) {
      dates.push(
        `${year}-${String(
          month + 1
        ).padStart(2, "0")}-${String(
          day
        ).padStart(2, "0")}`
      );
    }

    return dates;
  }, [today]);


  const monthlyChart = useMemo(() => {
    return monthDates.map((date) => {
      const study =
        getStudyMinutesForDate(
          studySessions,
          date
        );

      const activity = sumField(
        activities.filter(
          (item) => item?.date === date
        ),
        ["duration", "minutes", "time"]
      );

      const waterMl =
        getWaterForDate(
          water,
          date
        );

      return {
        day: shortDate(date),
        studyTime: Math.round(study),
        activity: Math.round(activity),
        water:
          Math.round(
            waterMl / 100
          ) / 10,
      };
    });
  }, [
    monthDates,
    studySessions,
    activities,
    water,
  ]);


  /* =======================================================
     REFRESH
======================================================= */

  async function handleRefresh() {
    await loadReports(true);
  }


  /* =======================================================
     LOADING
======================================================= */

  if (loading) {
    return (
      <div className="reports-page">
        <div className="page-header">
          <div>
            <h1>{isInsightsPage ? "💡 Insights" : "📊 Reports"}</h1>
            <p>Loading your reports...</p>
          </div>

          <BarChart3 size={42} />
        </div>
      </div>
    );
  }


  /* =======================================================
     INSIGHTS MODE

     /insights answers: "What does my data tell me?"
     /reports keeps the detailed historical report views.
  ======================================================= */

  if (isInsightsPage) {
    const totalStudyMinutes = studySessions.reduce((total, session) => {
      const minutes = safeNumber(
        session?.actualMinutes ??
        session?.durationMinutes ??
        session?.minutes
      );
      return total + minutes;
    }, 0);

    const todayWater = getWaterForDate(water, today);
    const observations = [
      {
        icon: "🎯",
        title: "Goal momentum",
        value: `${goalsAndTodoInsights.goalProgress}%`,
        text: goalsAndTodoInsights.goalTotal > 0
          ? `${goalsAndTodoInsights.goalCompleted} of ${goalsAndTodoInsights.goalTotal} goals are completed.`
          : "No goals are recorded yet.",
      },
      {
        icon: "✅",
        title: "Today's task pattern",
        value: `${goalsAndTodoInsights.completionRate}%`,
        text: goalsAndTodoInsights.todayTotal > 0
          ? `${goalsAndTodoInsights.completedToday} completed and ${goalsAndTodoInsights.pendingToday} still pending today.`
          : "No dated tasks are scheduled for today.",
      },
      {
        icon: "📚",
        title: "Learning activity",
        value: `${totalStudyMinutes} min`,
        text: `${studySessions.length} study session${studySessions.length === 1 ? "" : "s"} are recorded in your data.`,
      },
      {
        icon: "💧",
        title: "Water pattern",
        value: `${Math.round(todayWater)} ml`,
        text: "Today's recorded water intake can be compared with your daily target on the Water page.",
      },
      {
        icon: "💼",
        title: "Career preparation",
        value: `${careerInsights.preparationProgress}%`,
        text: `${careerInsights.preparationCompleted} of ${careerInsights.preparationTotal} preparation tasks are completed.`,
      },
      {
        icon: "💰",
        title: "Monthly balance",
        value: `₹${Math.round(financeInsights.balance).toLocaleString("en-IN")}`,
        text: `Income ₹${Math.round(financeInsights.monthIncome).toLocaleString("en-IN")} minus expenses ₹${Math.round(financeInsights.monthExpenses).toLocaleString("en-IN")}.`,
      },
    ];

    return (
      <div className="reports-page insights-page">
        <div className="page-header">
          <div>
            <h1>💡 Insights</h1>
            <p>What does your data tell you?</p>
          </div>
          <button type="button" onClick={handleRefresh} disabled={refreshing} className="add-topic-button">
            <RefreshCw size={18} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <section className="insights-intro-card">
          <strong>Your current patterns</strong>
          <p>These are observations generated from the data already stored in TASKBAR. Detailed history and charts remain in Reports.</p>
        </section>

        <section className="insights-grid">
          {observations.map((item) => (
            <article className="insight-card" key={item.title}>
              <div className="insight-card-icon" aria-hidden="true">{item.icon}</div>
              <div className="insight-card-body">
                <span>{item.title}</span>
                <strong>{item.value}</strong>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="insights-next-card">
          <h2>Useful next checks</h2>
          <ul>
            <li>{goalsAndTodoInsights.overdueCount > 0 ? `${goalsAndTodoInsights.overdueCount} dated tasks are overdue.` : "There are no overdue dated tasks right now."}</li>
            <li>{streak.current > 0 ? `Your current dashboard streak is ${streak.current} day${streak.current === 1 ? "" : "s"}.` : "Your current dashboard streak has no active days recorded."}</li>
            <li>Use Reports for Daily, Weekly, Monthly and History views when you want the underlying data rather than observations.</li>
          </ul>
        </section>
      </div>
    );
  }

  /* =======================================================
     UI
======================================================= */

  return (
    <div className="reports-page">

      {/* HEADER */}

      <div className="page-header">

        <div>
          <h1>📊 Reports</h1>

          <p>
            Analyze your learning, habits
            and daily productivity.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            background: "#ffffff",
            cursor: refreshing
              ? "default"
              : "pointer",
          }}
        >
          <RefreshCw size={18} />

          {refreshing
            ? "Refreshing..."
            : "Refresh"}
        </button>

      </div>


      {/* TABS */}

      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        {[
          "Daily",
          "Weekly",
          "Monthly",
          "History",
        ].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              border:
                tab === item
                  ? "1px solid #2563eb"
                  : "1px solid #e2e8f0",
              background:
                tab === item
                  ? "#2563eb"
                  : "#ffffff",
              color:
                tab === item
                  ? "#ffffff"
                  : "#334155",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {item}
          </button>
        ))}
      </div>


      {/* ===================================================
          DAILY
      =================================================== */}

      {tab === "Daily" && (
        <>
          <section className="report-overview">

            <div className="report-card">
              <BarChart3 size={25} />

              <span>
                Productivity Score
              </span>

              <strong>
                {productivityScore}%
              </strong>

              <small>
                {productivityMessage}
              </small>
            </div>


            <div className="report-card">
              <span>Learning</span>

              <strong>
                {daily.learningCompleted}
              </strong>

              <small>
                completed topics
              </small>
            </div>


            <div className="report-card">
              <span>Study Time</span>

              <strong>
                {formatMinutes(
                  daily.studyMinutes
                )}
              </strong>

              <small>
                from Study Sessions
              </small>
            </div>


            <div className="report-card">
              <span>Water</span>

              <strong>
                {formatLitres(
                  daily.waterToday
                )}
              </strong>
            </div>


            <div className="report-card">
              <span>Activities</span>

              <strong>
                {formatMinutes(
                  daily.activityMinutes
                )}
              </strong>
            </div>


            <div className="report-card">
              <span>Tasks</span>

              <strong>
                {daily.tasksCompleted}
              </strong>

              <small>
                completed today
              </small>
            </div>


            <div className="report-card">
              <Flame size={25} />

              <span>
                Learning Streak
              </span>

              <strong>
                {safeNumber(
                  streak.current ??
                    streak.currentStreak
                )}{" "}
                days
              </strong>

              <small>
                Best:{" "}
                {safeNumber(
                  streak.best ??
                    streak.bestStreak
                )}{" "}
                days
              </small>
            </div>

          </section>


          {/* GOAL + WATER */}

          <section
            className="reports-grid"
            style={{
              marginTop: "24px",
            }}
          >

            <div className="report-panel">

              <div className="section-heading">

                <div>
                  <h2>
                    🎯 Goal Progress
                  </h2>

                  <p>
                    Current progress across
                    your goals.
                  </p>
                </div>

              </div>

              <div className="report-large-number">
                {daily.avgGoal}%
              </div>

              <p className="report-description">
                Average goal progress.
              </p>

              <div className="report-progress">

                <div
                  className="report-progress-bar"
                  style={{
                    width:
                      `${daily.avgGoal}%`,
                  }}
                />

              </div>

            </div>


            <div className="report-panel">

              <div className="section-heading">

                <div>
                  <h2>💧 Water</h2>

                  <p>
                    Today's water intake.
                  </p>
                </div>

              </div>

              <div className="report-large-number">
                {daily.waterTarget > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (
                          daily.waterToday /
                          daily.waterTarget
                        ) *
                          100
                      )
                    )
                  : 0}%
              </div>

              <p className="report-description">
                Stay hydrated throughout
                the day.
              </p>

            </div>

          </section>


          {/* STUDY */}

          <section
            className="reports-grid"
            style={{
              marginTop: "24px",
            }}
          >

            <div className="report-panel">

              <div className="section-heading">

                <div>
                  <h2>
                    📚 Study Time
                  </h2>

                  <p>
                    Your intentional study
                    sessions for today.
                  </p>
                </div>

              </div>

              <div className="report-large-number">
                {formatMinutes(
                  daily.studyMinutes
                )}
              </div>

              <p className="report-description">
                Study time is calculated
                only from Study Sessions.
              </p>

            </div>

          </section>


          {/* FINANCE INSIGHTS */}

          <section
            className="report-panel"
            style={{ marginTop: "24px" }}
          >
            <div className="section-heading">
              <div>
                <h2>💰 Finance Overview</h2>
                <p>
                  Current month's income, expenses and balance.
                </p>
              </div>
            </div>

            <div className="report-mini-stats">
              <div>
                <span>Income</span>
                <strong>
                  ₹
                  {financeInsights.monthIncome.toLocaleString(
                    "en-IN",
                    { maximumFractionDigits: 2 }
                  )}
                </strong>
              </div>

              <div>
                <span>Expenses</span>
                <strong>
                  ₹
                  {financeInsights.monthExpenses.toLocaleString(
                    "en-IN",
                    { maximumFractionDigits: 2 }
                  )}
                </strong>
              </div>

              <div>
                <span>Balance</span>
                <strong>
                  ₹
                  {financeInsights.balance.toLocaleString(
                    "en-IN",
                    { maximumFractionDigits: 2 }
                  )}
                </strong>
              </div>

              <div>
                <span>Savings Rate</span>
                <strong>
                  {financeInsights.savingsRate}%
                </strong>
              </div>

              <div>
                <span>Expenses / Income</span>
                <strong>
                  {financeInsights.expenseRate}%
                </strong>
              </div>
            </div>
          </section>


          {/* CAREER INSIGHTS */}

          <section
            className="report-panel"
            style={{ marginTop: "24px" }}
          >
            <div className="section-heading">
              <div>
                <h2>💼 Career Overview</h2>
                <p>
                  Your current job preparation and job-search activity.
                </p>
              </div>
            </div>

            <div className="report-mini-stats">
              <div>
                <span>Preparation Tasks</span>
                <strong>
                  {careerInsights.preparationCompleted}/
                  {careerInsights.preparationTotal}
                </strong>
              </div>

              <div>
                <span>Preparation Progress</span>
                <strong>{careerInsights.preparationProgress}%</strong>
              </div>

              <div>
                <span>Applications</span>
                <strong>{careerInsights.applicationsTotal}</strong>
              </div>

              <div>
                <span>Under Review</span>
                <strong>{careerInsights.underReview}</strong>
              </div>

              <div>
                <span>Interview Stage</span>
                <strong>{careerInsights.interviewApplications}</strong>
              </div>

              <div>
                <span>Selected</span>
                <strong>{careerInsights.selected}</strong>
              </div>

              <div>
                <span>Saved Jobs</span>
                <strong>{careerInsights.savedJobs}</strong>
              </div>

              <div>
                <span>Interviews</span>
                <strong>{careerInsights.activeInterviews}</strong>
              </div>
            </div>
          </section>


          {/* GOALS + CENTRAL TO-DO PRODUCTIVITY */}

          <section
            className="reports-grid"
            style={{ marginTop: "24px" }}
          >

            <div className="report-panel">
              <div className="section-heading">
                <div>
                  <h2>🎯 Goals Progress</h2>
                  <p>Progress based on your current goals.</p>
                </div>
              </div>

              <div className="report-mini-stats">
                <div>
                  <span>Completed</span>
                  <strong>
                    {goalsAndTodoInsights.goalCompleted}/
                    {goalsAndTodoInsights.goalTotal}
                  </strong>
                </div>

                <div>
                  <span>Completion</span>
                  <strong>{goalsAndTodoInsights.goalProgress}%</strong>
                </div>
              </div>

              <div className="report-progress" style={{ marginTop: "18px" }}>
                <div
                  className="report-progress-bar"
                  style={{ width: `${goalsAndTodoInsights.goalProgress}%` }}
                />
              </div>
            </div>


            <div className="report-panel">
              <div className="section-heading">
                <div>
                  <h2>✅ Central To-Do</h2>
                  <p>Today's tasks plus missed scheduled tasks.</p>
                </div>
              </div>

              <div className="report-mini-stats">
                <div>
                  <span>Completed Today</span>
                  <strong>{goalsAndTodoInsights.completedToday}</strong>
                </div>

                <div>
                  <span>Pending Today</span>
                  <strong>{goalsAndTodoInsights.pendingToday}</strong>
                </div>

                <div>
                  <span>Overdue / Missed</span>
                  <strong>{goalsAndTodoInsights.overdueCount}</strong>
                </div>

                <div>
                  <span>Today's Completion</span>
                  <strong>{goalsAndTodoInsights.completionRate}%</strong>
                </div>
              </div>
            </div>

          </section>


          <section
            className="report-panel"
            style={{ marginTop: "24px" }}
          >
            <div className="section-heading">
              <div>
                <h2>📈 Overall Productivity Summary</h2>
                <p>
                  A live summary of today's central tasks and your current goal progress.
                </p>
              </div>
            </div>

            <div className="report-mini-stats">
              <div>
                <span>Tasks Today</span>
                <strong>{goalsAndTodoInsights.todayTotal}</strong>
              </div>

              <div>
                <span>Completed</span>
                <strong>{goalsAndTodoInsights.completedToday}</strong>
              </div>

              <div>
                <span>Pending</span>
                <strong>{goalsAndTodoInsights.pendingToday}</strong>
              </div>

              <div>
                <span>Missed</span>
                <strong>{goalsAndTodoInsights.overdueCount}</strong>
              </div>

              <div>
                <span>Goal Progress</span>
                <strong>{goalsAndTodoInsights.goalProgress}%</strong>
              </div>

              <div>
                <span>Productivity Score</span>
                <strong>{productivityScore}%</strong>
              </div>
            </div>
          </section>


          {/* 7 DAY SUMMARY */}

          <section
            className="report-panel"
            style={{
              marginTop: "24px",
            }}
          >

            <div className="section-heading">

              <div>
                <h2>
                  📅 7-Day Summary
                </h2>

                <p>
                  Compare your recent study time,
                  activity and water intake.
                </p>
              </div>

            </div>


            <div className="report-chart">

              <ResponsiveContainer
                width="100%"
                height={320}
              >

                <BarChart data={weeklyChart}>

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis dataKey="day" />

                  <YAxis />

                  <Tooltip />

                  <Legend />

                  <Bar
                    dataKey="studyTime"
                    name="Study Time (h)"
                    fill="#9333ea"
                  />

                  <Bar
                    dataKey="activity"
                    name="Activity (h)"
                    fill="#22c55e"
                  />

                  <Bar
                    dataKey="water"
                    name="Water (L)"
                    fill="#06b6d4"
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>


            <div className="report-mini-stats">

              <div>
                <span>Study Time</span>

                <strong>
                  {formatMinutes(
                    weeklyStudy
                  )}
                </strong>
              </div>

              <div>
                <span>Activities</span>

                <strong>
                  {formatMinutes(
                    weeklyActivities
                  )}
                </strong>
              </div>

              <div>
                <span>Water</span>

                <strong>
                  {formatLitres(
                    weeklyWater
                  )}
                </strong>
              </div>

              <div>
                <span>Topics</span>

                <strong>
                  {weeklyTopics}
                </strong>
              </div>

              <div>
                <span>Tasks</span>

                <strong>
                  {weeklyTasks}
                </strong>
              </div>

            </div>

          </section>
        </>
      )}


      {/* ===================================================
          WEEKLY
      =================================================== */}

      {tab === "Weekly" && (
        <section className="report-panel">

          <div className="section-heading">

            <div>
              <h2>📈 Weekly Report</h2>

              <p>
                Your activity over the
                last 7 days.
              </p>
            </div>

          </div>


          <div className="report-mini-stats">

            <div>
              <span>Study Time</span>

              <strong>
                {formatMinutes(
                  weeklyStudy
                )}
              </strong>
            </div>

            <div>
              <span>Activities</span>

              <strong>
                {formatMinutes(
                  weeklyActivities
                )}
              </strong>
            </div>

            <div>
              <span>Water</span>

              <strong>
                {formatLitres(
                  weeklyWater
                )}
              </strong>
            </div>

            <div>
              <span>Topics</span>

              <strong>
                {weeklyTopics}
              </strong>
            </div>

            <div>
              <span>Tasks</span>

              <strong>
                {weeklyTasks}
              </strong>
            </div>

          </div>


          <div
            className="report-chart"
            style={{
              marginTop: "24px",
            }}
          >

            <ResponsiveContainer
              width="100%"
              height={360}
            >

              <LineChart data={weeklyChart}>

                <CartesianGrid
                  strokeDasharray="3 3"
                />

                <XAxis dataKey="day" />

                <YAxis />

                <Tooltip />

                <Legend />

                <Line
                  type="monotone"
                  dataKey="studyTime"
                  name="Study Time (h)"
                  stroke="#9333ea"
                  strokeWidth={3}
                />

                <Line
                  type="monotone"
                  dataKey="activity"
                  name="Activity (h)"
                  stroke="#22c55e"
                  strokeWidth={3}
                />

                <Line
                  type="monotone"
                  dataKey="water"
                  name="Water (L)"
                  stroke="#06b6d4"
                  strokeWidth={3}
                />

              </LineChart>

            </ResponsiveContainer>

          </div>

        </section>
      )}


      {/* ===================================================
          MONTHLY
      =================================================== */}

      {tab === "Monthly" && (
        <section className="report-panel">

          <div className="section-heading">

            <div>
              <h2>📊 Monthly Report</h2>

              <p>
                Overview of this month's
                activity.
              </p>
            </div>

          </div>


          <div className="report-mini-stats">

            <div>
              <span>Study Time</span>

              <strong>
                {formatMinutes(
                  monthlyChart.reduce(
                    (total, item) =>
                      total +
                      safeNumber(
                        item.studyTime
                      ),
                    0
                  )
                )}
              </strong>
            </div>

            <div>
              <span>Activities</span>

              <strong>
                {formatMinutes(
                  monthlyChart.reduce(
                    (total, item) =>
                      total +
                      safeNumber(
                        item.activity
                      ),
                    0
                  )
                )}
              </strong>
            </div>

          </div>


          <div className="report-chart">

            <ResponsiveContainer
              width="100%"
              height={400}
            >

              <BarChart
                data={monthlyChart}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                />

                <XAxis
                  dataKey="day"
                  interval="preserveStartEnd"
                />

                <YAxis />

                <Tooltip />

                <Legend />

                <Bar
                  dataKey="studyTime"
                  name="Study Time (min)"
                  fill="#9333ea"
                />

                <Bar
                  dataKey="activity"
                  name="Activity (min)"
                  fill="#22c55e"
                />

              </BarChart>

            </ResponsiveContainer>

          </div>

        </section>
      )}


      {/* ===================================================
          HISTORY
      =================================================== */}

      {tab === "History" && (
        <section className="reports-history">
          <div className="report-panel">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"16px",flexWrap:"wrap"}}>
              <div>
                <h2 style={{margin:0}}>🗂️ History</h2>
                <p style={{margin:"8px 0 0",color:"#64748b"}}>Completed items stay in their original Completed section for 2 full days, then appear here. History is permanently cleaned up 50 days after the original completion time.</p>
              </div>
              <button type="button" onClick={()=>setHistoryViewMode(m=>m==="category"?"daywise":"category")} style={{display:"inline-flex",alignItems:"center",gap:"8px",padding:"11px 16px",borderRadius:"12px",border:"1px solid #475569",background:historyViewMode==="daywise"?"#2563eb":"rgba(255,255,255,.04)",color:"#fff",fontWeight:700,cursor:"pointer"}}>
                📅 {historyViewMode === "daywise" ? "Category View" : "Day Wise"}
              </button>
            </div>

            {historyViewMode === "category" ? (
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"12px",marginTop:"24px"}}>
                  {HISTORY_CATEGORIES.map(category=>{
                    const count=historyItemsByCategory[category]?.length||0;
                    const active=selectedHistoryCategory===category;
                    return <button key={category} type="button" onClick={()=>setSelectedHistoryCategory(category)} style={{minHeight:"105px",padding:"16px",borderRadius:"16px",border:active?"1px solid #2563eb":"1px solid rgba(148,163,184,.35)",background:active?"rgba(37,99,235,.18)":"rgba(255,255,255,.03)",color:"#fff",textAlign:"left",cursor:"pointer",boxShadow:active?"0 8px 25px rgba(37,99,235,.18)":"none"}}>
                      <div style={{fontSize:"25px"}}>{getHistoryCategoryIcon(category)}</div>
                      <div style={{marginTop:"8px",fontWeight:800}}>{category}</div>
                      <div style={{marginTop:"4px",color:"#94a3b8",fontSize:"13px"}}>{count} completed</div>
                    </button>;
                  })}
                </div>

                {selectedHistoryItems.length === 0 ? <div className="empty-state" style={{marginTop:"24px"}}><div style={{fontSize:"42px"}}>{getHistoryCategoryIcon(selectedHistoryCategory)}</div><h3>No {selectedHistoryCategory} history</h3><p>Completed items will appear here automatically.</p></div> :
                  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.6fr) minmax(260px,.8fr)",gap:"20px",marginTop:"24px"}}>
                    <div style={{display:"grid",gap:"12px"}}>
                      {selectedHistoryItems.map(item=>{
                        const date=getHistoryCompletedDate(item), details=getHistoryDetails(item,selectedHistoryCategory);
                        return <article key={`${selectedHistoryCategory}-${item.id}`} style={{padding:"18px",borderRadius:"16px",border:"1px solid rgba(148,163,184,.25)",background:"rgba(255,255,255,.035)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",gap:"14px"}}>
                            <div><strong style={{fontSize:"17px"}}>{getHistoryCategoryIcon(selectedHistoryCategory)} {getHistoryTitle(item,selectedHistoryCategory)}</strong><div style={{marginTop:"8px",color:"#94a3b8",fontSize:"13px"}}>{getHistorySubtitle(item,selectedHistoryCategory)}</div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:"8px",marginTop:"12px"}}><span style={{padding:"5px 9px",borderRadius:"999px",background:"rgba(34,197,94,.12)",color:"#86efac",fontSize:"12px",fontWeight:700}}>✓ Completed</span>{date&&<span style={{padding:"5px 9px",borderRadius:"999px",background:"rgba(255,255,255,.06)",color:"#cbd5e1",fontSize:"12px"}}>📅 {date.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</span>}{date&&<span style={{padding:"5px 9px",borderRadius:"999px",background:"rgba(255,255,255,.06)",color:"#cbd5e1",fontSize:"12px"}}>🕐 {formatHistoryTime(item)}</span>}</div>
                              {details.length>0&&<div style={{marginTop:"10px",display:"flex",flexWrap:"wrap",gap:"10px",color:"#cbd5e1",fontSize:"13px"}}>{details.map(d=><span key={d}>{d}</span>)}</div>}
                            </div><span style={{color:"#64748b",fontSize:"13px",whiteSpace:"nowrap"}}>{getHistoryRelativeText(item)}</span>
                          </div>
                        </article>;
                      })}
                    </div>
                    <div><div style={{padding:"20px",borderRadius:"18px",border:"1px solid rgba(148,163,184,.25)",background:"rgba(255,255,255,.035)"}}><h3 style={{marginTop:0}}>{getHistoryCategoryIcon(selectedHistoryCategory)} History Summary</h3><div className="report-mini-stats" style={{marginTop:"16px"}}><div><span>Total</span><strong>{selectedHistoryItems.length}</strong></div><div><span>History delay</span><strong>2 days</strong></div><div><span>Retention</span><strong>50 days</strong></div></div><p style={{marginTop:"18px",color:"#94a3b8",lineHeight:1.6}}>Completed items stay in their original Completed section for 2 full days, then appear in History. They are permanently deleted 50 days after the original completion time.</p></div></div>
                  </div>}
              </>
            ) : (
              <div style={{ marginTop: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
                  <div>
                    <h2 style={{ margin: 0 }}>📅 Day Wise History</h2>
                    <p style={{ margin: "6px 0 0", color: "#94a3b8" }}>Choose a date to see everything completed on that day.</p>
                  </div>

                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 12px", borderRadius: "12px", border: "1px solid rgba(148,163,184,.35)", background: "rgba(255,255,255,.04)", color: "#cbd5e1", fontWeight: 700 }}>
                    📅
                    <input
                      type="date"
                      value={selectedHistoryDate}
                      min={availableHistoryDates.length ? availableHistoryDates[availableHistoryDates.length - 1] : undefined}
                      max={today}
                      onChange={(event) => setSelectedHistoryDate(event.target.value)}
                      style={{ border: "none", outline: "none", background: "transparent", color: "inherit", fontWeight: 700, cursor: "pointer" }}
                    />
                  </label>
                </div>

                <div style={{ padding: "16px 18px", marginBottom: "18px", borderRadius: "16px", border: "1px solid rgba(37,99,235,.25)", background: "rgba(37,99,235,.08)" }}>
                  <strong>📅 {formatHistoryDate(selectedHistoryDate)}</strong>
                  <span style={{ marginLeft: "10px", color: "#94a3b8" }}>
                    {selectedDayWiseItems.length} completed item{selectedDayWiseItems.length === 1 ? "" : "s"}
                  </span>
                </div>

                {selectedDayWiseItems.length === 0 ? (
                  <div className="empty-state">
                    <div style={{ fontSize: "44px" }}>📅</div>
                    <h3>No history for this date</h3>
                    <p>Choose another date from the calendar.</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {selectedDayWiseItems.map((item) => {
                      const details = getHistoryDetails(item, item.historyCategory);
                      const date = getHistoryCompletedDate(item);
                      return (
                        <article key={`${item.historyCategory}-${item.id}-${selectedHistoryDate}`} style={{ padding: "18px", borderRadius: "16px", border: "1px solid rgba(148,163,184,.22)", background: "rgba(255,255,255,.025)" }}>
                          <strong style={{ fontSize: "16px" }}>
                            {getHistoryCategoryIcon(item.historyCategory)} {getHistoryTitle(item, item.historyCategory)}
                          </strong>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "10px" }}>
                            <span style={{ padding: "4px 8px", borderRadius: "999px", background: "rgba(255,255,255,.06)", color: "#cbd5e1", fontSize: "11px", fontWeight: 700 }}>{item.historyCategory}</span>
                            <span style={{ padding: "4px 8px", borderRadius: "999px", background: "rgba(34,197,94,.10)", color: "#86efac", fontSize: "11px", fontWeight: 700 }}>✓ Completed</span>
                            {date && <span style={{ padding: "4px 8px", borderRadius: "999px", background: "rgba(255,255,255,.06)", color: "#cbd5e1", fontSize: "11px" }}>🕐 {formatHistoryTime(item)}</span>}
                          </div>
                          <div style={{ marginTop: "9px", color: "#94a3b8", fontSize: "13px" }}>{getHistorySubtitle(item, item.historyCategory)}</div>
                          {details.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "9px", color: "#cbd5e1", fontSize: "13px" }}>{details.map((detail) => <span key={detail}>{detail}</span>)}</div>}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}


      {/* FOOTER */}

      <div
        className="reports-footer"
        style={{
          marginTop: "24px",
          marginBottom: "20px",
          textAlign: "center",
        }}
      >

        <p>
          Reports update automatically when
          your dashboard data changes.
        </p>

      </div>

    </div>
  );
}


export default Reports;
