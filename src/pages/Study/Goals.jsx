import { useEffect, useMemo, useState } from "react";
import Modal from "../../components/common/Modal";

import {
  Target,
  Plus,
  X,
  Pencil,
  Trash2,
  CalendarDays,
  Clock,
  CheckCircle,
  Link as LinkIcon,
  Circle,
} from "lucide-react";

import {
  getGoals,
  saveGoals,
  getTopics,
} from "../../utils/db";

import {
  calculateDaysRemaining,
  calculatePercentage,
} from "../../utils/calculations";

import {
  getItemsFromFirestore,
  saveItemToFirestore,
  deleteItemFromFirestore,
} from "../../firebase/firestore";

// ========================================
// LEARNING SKILLS
// ========================================

const LEARNING_SKILLS = [
  "Java",
  "SQL",
  "Spring",
  "Spring Boot",
  "Hibernate",
  "JavaScript",
  "React",
  "HTML",
  "CSS",
  "Python",
  "Data Analysis",
  "Machine Learning",
  "Git & GitHub",
];

// ========================================
// PERSONAL SKILLS
// ========================================

const HISTORY_CATEGORY = "Goals";
const HISTORY_DELAY_MS = 2 * 24 * 60 * 60 * 1000;

function getCompletionTimestamp(goal) {
  const value = goal?.completedAtTimestamp || goal?.completedAt;
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isCompletedForHistory(goal, now = Date.now()) {
  const timestamp = getCompletionTimestamp(goal);
  return (
    goal?.status === "completed" &&
    timestamp !== null &&
    now - timestamp >= HISTORY_DELAY_MS
  );
}

const PERSONAL_SKILLS = [
  "Communication",
  "English",
  "Time Management",
  "Problem Solving",
  "Discipline",
  "Fitness",
  "Reading",
  "Writing",
];

// ========================================
// GOALS COMPONENT
// ========================================

function Goals() {
  const [goals, setGoals] = useState([]);
  const [historyClock, setHistoryClock] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setHistoryClock(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  const [topics, setTopics] = useState([]);
  const [goalTasks, setGoalTasks] = useState([]);

  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);

  const [goalForm, setGoalForm] = useState({
    title: "",
    description: "",
    skill: "",
    targetDate: "",
    status: "pending",
  });

  // ========================================
  // LOAD DATA
  // ========================================

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const savedGoals = await getGoals();
        const savedTopics = await getTopics();
        const savedTodoList = await getItemsFromFirestore("todoList");

        if (!mounted) {
          return;
        }

        const normalizedGoals = (
          Array.isArray(savedGoals)
            ? savedGoals
            : []
        ).map((goal) => {
          if (goal?.status !== "completed") {
            return goal;
          }

          return {
            ...goal,
            historyCategory:
              goal.historyCategory || HISTORY_CATEGORY,
            completedAt:
              goal.completedAt ||
              null,
            completedAtTimestamp:
              goal.completedAtTimestamp ||
              (goal.completedAt ? new Date(goal.completedAt).toISOString() : null),
          };
        });

        const needsHistoryMigration =
          normalizedGoals.some((goal, index) =>
            goal?.status === "completed" &&
            Boolean(goal?.completedAt || goal?.completedAtTimestamp) &&
            (
              !savedGoals[index]?.historyCategory ||
              !savedGoals[index]?.completedAt ||
              !savedGoals[index]?.completedAtTimestamp
            )
          );

        if (needsHistoryMigration) {
          await saveGoals(normalizedGoals);
        }

        setGoals(normalizedGoals);

        setTopics(
          Array.isArray(savedTopics)
            ? savedTopics
            : []
        );

        setGoalTasks(
          Array.isArray(savedTodoList)
            ? savedTodoList.filter(
                (task) =>
                  task?.goalId !== undefined &&
                  task?.goalId !== null
              )
            : []
        );
      } catch (error) {
        console.error(
          "Failed to load Goals:",
          error
        );

        if (mounted) {
          setGoals([]);
          setTopics([]);
          setGoalTasks([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    // ========================================
    // REFRESH TOPICS WHEN LEARNING CHANGES
    // ========================================

    async function refreshTopics() {
      try {
        const savedTopics = await getTopics();

        if (mounted) {
          setTopics(
            Array.isArray(savedTopics)
              ? savedTopics
              : []
          );
        }
      } catch (error) {
        console.error(
          "Failed to refresh topics:",
          error
        );
      }
    }

    window.addEventListener(
      "learningTopicsUpdated",
      refreshTopics
    );

    // ========================================
    // REFRESH GOAL TASKS
    // ========================================

    async function refreshGoalTasks() {
      try {
        const savedTodoList =
          await getItemsFromFirestore("todoList");

        if (mounted) {
          setGoalTasks(
            Array.isArray(savedTodoList)
              ? savedTodoList.filter(
                  (task) =>
                    task?.goalId !== undefined &&
                    task?.goalId !== null
                )
              : []
          );
        }
      } catch (error) {
        console.error(
          "Failed to refresh goal tasks:",
          error
        );
      }
    }

    window.addEventListener(
      "todoListUpdated",
      refreshGoalTasks
    );

    window.addEventListener(
      "focus",
      refreshGoalTasks
    );

    return () => {
      mounted = false;

      window.removeEventListener(
        "learningTopicsUpdated",
        refreshTopics
      );

      window.removeEventListener(
        "todoListUpdated",
        refreshGoalTasks
      );

      window.removeEventListener(
        "focus",
        refreshGoalTasks
      );
    };
  }, []);

  // ========================================
  // AVAILABLE TOPIC SKILLS
  // ========================================

  const topicSkills = useMemo(() => {
    return topics
      .map((topic) => topic.skill)
      .filter(
        (skill) =>
          typeof skill === "string" &&
          skill.trim() !== ""
      );
  }, [topics]);

  // ========================================
  // ALL LEARNING SKILLS
  // ========================================

  const allLearningSkills = useMemo(() => {
    return [
      ...new Set([
        ...LEARNING_SKILLS,
        ...topicSkills,
      ]),
    ];
  }, [topicSkills]);

  // ========================================
  // TASK COMPLETION NORMALIZATION
  // ========================================

  // Prefer the explicit `completed` value when present. Older tasks may
  // also contain a stale `status: "completed"`, which must not override
  // `completed: false`.
  function isTaskCompleted(task) {
    if (typeof task?.completed === "boolean") {
      return task.completed;
    }

    if (typeof task?.completed === "string") {
      return task.completed.trim().toLowerCase() === "true";
    }

    return task?.status === "completed";
  }

  // ========================================
  // CALCULATE GOAL STATUS FROM GOAL TASKS
  // ========================================

  function calculateGoalStatus(goal, allTasks = goalTasks) {
    if (!goal) {
      return "pending";
    }

    const tasksForGoal = allTasks.filter(
      (task) =>
        task &&
        task.goalId !== undefined &&
        task.goalId !== null &&
        String(task.goalId) === String(goal.id)
    );

    // No Goal Tasks = Pending
    if (tasksForGoal.length === 0) {
      return "pending";
    }

    const completedTasks = tasksForGoal.filter(isTaskCompleted).length;

    // All tasks completed = Completed
    if (completedTasks === tasksForGoal.length) {
      return "completed";
    }

    // At least one completed = In Progress
    if (completedTasks > 0) {
      return "in-progress";
    }

    // No tasks completed = Pending
    return "pending";
  }

  // ========================================
  // CALCULATE GOAL PROGRESS
  // ========================================

  function calculateGoalProgress(goal) {
    if (!goal) {
      return 0;
    }

    // Goal Tasks are the ONLY source of Goal progress.
    // The Goal status and Learning topic status must not
    // make a Goal show 100% when its Goal Tasks are incomplete.
    const tasksForGoal = goalTasks.filter(
      (task) =>
        task &&
        task.goalId !== undefined &&
        task.goalId !== null &&
        String(task.goalId) === String(goal.id)
    );

    // No linked Goal Tasks = no task progress.
    if (tasksForGoal.length === 0) {
      return 0;
    }

    const completedTasks = tasksForGoal.filter(isTaskCompleted).length;

    const percentage =
      (completedTasks / tasksForGoal.length) * 100;

    if (!Number.isFinite(percentage)) {
      return 0;
    }

    return Math.min(
      100,
      Math.max(0, Math.round(percentage))
    );
  }

  // ========================================
  // GET TOPIC STATISTICS
  // ========================================

  function getGoalTopicStats(goal) {
    if (!goal.skill) {
      return {
        total: 0,
        completed: 0,
      };
    }

    const skillTopics = topics.filter(
      (topic) =>
        typeof topic.skill === "string" &&
        topic.skill.toLowerCase() ===
          goal.skill.toLowerCase()
    );

    const completed =
      skillTopics.filter(
        (topic) =>
          topic.status === "completed"
      ).length;

    return {
      total: skillTopics.length,
      completed,
    };
  }

  // ========================================
  // OPEN ADD FORM
  // ========================================

  function openAddForm() {
    setEditingGoal(null);

    setGoalForm({
      title: "",
      description: "",
      skill: "",
      targetDate: "",
      status: "pending",
    });

    setShowForm(true);
  }

  // ========================================
  // OPEN EDIT FORM
  // ========================================

  function openEditForm(goal) {
    setEditingGoal(goal);

    setGoalForm({
      title: goal.title || "",
      description: goal.description || "",
      skill: goal.skill || "",
      targetDate: goal.targetDate || "",
      status: goal.status || "pending",
    });

    setShowForm(true);
  }

  // ========================================
  // CLOSE FORM
  // ========================================

  function closeForm() {
    setShowForm(false);
    setEditingGoal(null);

    setGoalForm({
      title: "",
      description: "",
      skill: "",
      targetDate: "",
      status: "pending",
    });
  }

  // ========================================
  // INPUT CHANGE
  // ========================================

  function handleChange(event) {
    const {
      name,
      value,
    } = event.target;

    setGoalForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  // ========================================
  // SAVE GOAL
  // ========================================

  async function handleSubmit(event) {
    event.preventDefault();

    if (!goalForm.title.trim()) {
      alert(
        "Please enter a Goal Title."
      );
      return;
    }

    if (!goalForm.skill) {
      alert(
        "Please select a Skill."
      );
      return;
    }

    if (!goalForm.targetDate) {
      alert(
        "Please select a Target Date."
      );
      return;
    }

    try {
      let updatedGoals = [];

      // ======================================
      // EDIT GOAL
      // ======================================

      if (editingGoal) {
        updatedGoals = goals.map(
          (goal) => {
            if (
              goal.id ===
              editingGoal.id
            ) {
              const updatedGoal = {
                ...goal,

                title:
                  goalForm.title.trim(),

                description:
                  goalForm.description.trim(),

                skill:
                  goalForm.skill,

                targetDate:
                  goalForm.targetDate,

                status: calculateGoalStatus(goal, goalTasks),
              };

              if (updatedGoal.status === "completed") {
                updatedGoal.historyCategory =
                  HISTORY_CATEGORY;
                updatedGoal.completedAt =
                  goal.completedAt ||
                  new Date().toISOString();
                updatedGoal.completedAtTimestamp =
                  goal.completedAtTimestamp ||
                  (goal.completedAt ? new Date(goal.completedAt).toISOString() : new Date().toISOString());
              } else {
                delete updatedGoal.historyCategory;
                delete updatedGoal.completedAt;
                delete updatedGoal.completedAtTimestamp;
              }

              return updatedGoal;
            }

            return goal;
          }
        );
      }

      // ======================================
      // ADD GOAL
      // ======================================

      else {
        const newGoal = {
          id: Date.now(),

          title:
            goalForm.title.trim(),

          description:
            goalForm.description.trim(),

          skill:
            goalForm.skill,

          targetDate:
            goalForm.targetDate,

          status: "pending",
        };

        updatedGoals = [
          ...goals,
          newGoal,
        ];
      }

      // ======================================
      // SAVE TO FIREBASE
      // ======================================

      await saveGoals(
        updatedGoals
      );

      // ======================================
      // UPDATE UI
      // ======================================

      setGoals(
        updatedGoals
      );

      closeForm();
    } catch (error) {
      console.error(
        "Goal save error:",
        error
      );

      alert(
        `Could not save goal.\n\n${
          error?.message ||
          "Unknown error"
        }`
      );
    }
  }

  // ========================================
  // DELETE GOAL
  // ========================================

  async function deleteGoal(goal) {
    const confirmed =
      window.confirm(
        `Delete "${goal.title}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      const updatedGoals =
        goals.filter(
          (item) =>
            item.id !== goal.id
        );

      // ======================================
      // SAVE UPDATED LIST TO FIREBASE
      // ======================================

      await saveGoals(
        updatedGoals
      );

      // ======================================
      // UPDATE UI
      // ======================================

      setGoals(
        updatedGoals
      );
    } catch (error) {
      console.error(
        "Delete goal error:",
        error
      );

      alert(
        `Could not delete goal.\n\n${
          error?.message ||
          "Unknown error"
        }`
      );
    }
  }

  // ========================================
  // UPDATE STATUS
  // ========================================

  async function updateGoalStatus(
    id,
    status
  ) {
    try {
      const updatedGoals =
        goals.map((goal) => {
          if (goal.id !== id) {
            return goal;
          }

          const updatedGoal = {
            ...goal,
            status,
          };

          if (status === "completed") {
            updatedGoal.historyCategory =
              HISTORY_CATEGORY;
            updatedGoal.completedAt =
              goal.completedAt ||
              new Date().toISOString();
          } else {
            delete updatedGoal.historyCategory;
            delete updatedGoal.completedAt;
                delete updatedGoal.completedAtTimestamp;
          }

          return updatedGoal;
        });

      // ======================================
      // SAVE TO FIREBASE
      // ======================================

      await saveGoals(
        updatedGoals
      );

      // ======================================
      // UPDATE UI
      // ======================================

      setGoals(
        updatedGoals
      );
    } catch (error) {
      console.error(
        "Update status error:",
        error
      );

      alert(
        `Could not update goal status.\n\n${
          error?.message ||
          "Unknown error"
        }`
      );
    }
  }

  // ========================================
  // ADD TASK TO GOAL
  // ========================================

  async function addGoalTask(goal) {
    const title =
      window.prompt(
        `Add a task for "${goal.title}"`
      );

    if (!title || !title.trim()) {
      return;
    }

    const task = {
      id: String(
        Date.now()
      ),

      title:
        title.trim(),

      date:
        goal.targetDate || "",

      completed: false,

      completedAt: null,

      goalId:
        goal.id,

      goalTitle:
        goal.title,

      source:
        "goal",

      type:
        "Goal Task",
    };

    try {
      const existingTodoList =
        await getItemsFromFirestore("todoList");

      const todos =
        Array.isArray(
          existingTodoList
        )
          ? existingTodoList
          : [];

      const updated = [
        ...todos,
        task,
      ];

      // ======================================
      // SAVE ONLY THE NEW TASK TO FIRESTORE
      // ======================================

      await saveItemToFirestore(
        "todoList",
        String(task.id),
        task
      );

      // ======================================
      // UPDATE GOAL TASKS + AUTOMATIC GOAL STATUS
      // ======================================

      const updatedGoalTasks = updated.filter(
        (item) =>
          item?.goalId !== undefined &&
          item?.goalId !== null
      );

      setGoalTasks(updatedGoalTasks);

      const newStatus = calculateGoalStatus(
        goal,
        updatedGoalTasks
      );

      const updatedGoals = goals.map(
        (item) => {
          if (String(item.id) !== String(goal.id)) {
            return item;
          }

          const updatedGoal = {
            ...item,
            status: newStatus,
          };

          if (newStatus === "completed") {
            updatedGoal.historyCategory =
              HISTORY_CATEGORY;
            updatedGoal.completedAt =
              item.completedAt ||
              new Date().toISOString();
          } else {
            delete updatedGoal.historyCategory;
            delete updatedGoal.completedAt;
                delete updatedGoal.completedAtTimestamp;
          }

          return updatedGoal;
        }
      );

      await saveGoals(updatedGoals);
      setGoals(updatedGoals);

      window.dispatchEvent(
        new Event(
          "todoListUpdated"
        )
      );
    } catch (error) {
      console.error(
        "Failed to add goal task:",
        error
      );

      alert(
        `Could not add goal task.\n\n${
          error?.message ||
          "Unknown error"
        }`
      );
    }
  }

  // ========================================
  // TOGGLE GOAL TASK
  // ========================================

  async function toggleGoalTask(
    task
  ) {
    try {
      const existingTodoList =
        await getItemsFromFirestore("todoList");

      const todos =
        Array.isArray(
          existingTodoList
        )
          ? existingTodoList
          : [];

      const updated =
        todos.map(
          (item) =>
            String(item.id) ===
            String(task.id)
              ? (() => {
                  const nextCompleted = !isTaskCompleted(item);
                  const completedAt = nextCompleted
                    ? new Date().toISOString()
                    : null;

                  return {
                    ...item,
                    completed: nextCompleted,
                    // Keep legacy status fields consistent with the boolean.
                    status: nextCompleted ? "completed" : "pending",
                    completedAt,
                  };
                })()
              : item
        );

      const changedTask =
        updated.find(
          (item) =>
            String(item.id) ===
            String(task.id)
        );

      if (changedTask) {
        await saveItemToFirestore(
          "todoList",
          String(
            changedTask.id
          ),
          changedTask
        );
      }

      const updatedGoalTasks = updated.filter(
        (item) =>
          item?.goalId !== undefined &&
          item?.goalId !== null
      );

      setGoalTasks(updatedGoalTasks);

      // Automatically calculate the Goal status from its tasks:
      // 0 completed -> Pending
      // some completed -> In Progress
      // all completed -> Completed
      const currentGoal = goals.find(
        (item) =>
          String(item.id) ===
          String(task.goalId)
      );

      if (currentGoal) {
        const newStatus = calculateGoalStatus(
          currentGoal,
          updatedGoalTasks
        );

        const updatedGoals = goals.map(
          (item) => {
            if (
              String(item.id) !==
              String(currentGoal.id)
            ) {
              return item;
            }

            const updatedGoal = {
              ...item,
              status: newStatus,
            };

            if (newStatus === "completed") {
              updatedGoal.historyCategory =
                HISTORY_CATEGORY;
              updatedGoal.completedAt =
                item.completedAt ||
                new Date().toISOString();
            } else {
              delete updatedGoal.historyCategory;
              delete updatedGoal.completedAt;
                delete updatedGoal.completedAtTimestamp;
            }

            return updatedGoal;
          }
        );

        await saveGoals(updatedGoals);
        setGoals(updatedGoals);
      }

      window.dispatchEvent(
        new Event(
          "todoListUpdated"
        )
      );
    } catch (error) {
      console.error(
        "Failed to update goal task:",
        error
      );

      alert(
        `Could not update goal task.\n\n${
          error?.message ||
          "Unknown error"
        }`
      );
    }
  }

  // ========================================
  // DELETE GOAL TASK
  // ========================================

  async function deleteGoalTask(
    task
  ) {
    const confirmed =
      window.confirm(
        `Delete goal task "${task.title}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      const existingTodoList =
        await getItemsFromFirestore("todoList");

      const todos =
        Array.isArray(
          existingTodoList
        )
          ? existingTodoList
          : [];

      const updated =
        todos.filter(
          (item) =>
            String(item.id) !==
            String(task.id)
        );

      await deleteItemFromFirestore(
        "todoList",
        String(task.id)
      );

      const updatedGoalTasks = updated.filter(
        (item) =>
          item?.goalId !== undefined &&
          item?.goalId !== null
      );

      setGoalTasks(updatedGoalTasks);

      // Recalculate the Goal status after deleting a Goal Task.
      const currentGoal = goals.find(
        (item) =>
          String(item.id) ===
          String(task.goalId)
      );

      if (currentGoal) {
        const newStatus = calculateGoalStatus(
          currentGoal,
          updatedGoalTasks
        );

        const updatedGoals = goals.map(
          (item) => {
            if (
              String(item.id) !==
              String(currentGoal.id)
            ) {
              return item;
            }

            const updatedGoal = {
              ...item,
              status: newStatus,
            };

            if (newStatus === "completed") {
              updatedGoal.historyCategory =
                HISTORY_CATEGORY;
              updatedGoal.completedAt =
                item.completedAt ||
                new Date().toISOString();
            } else {
              delete updatedGoal.historyCategory;
              delete updatedGoal.completedAt;
                delete updatedGoal.completedAtTimestamp;
            }

            return updatedGoal;
          }
        );

        await saveGoals(updatedGoals);
        setGoals(updatedGoals);
      }

      window.dispatchEvent(
        new Event(
          "todoListUpdated"
        )
      );
    } catch (error) {
      console.error(
        "Failed to delete goal task:",
        error
      );

      alert(
        `Could not delete goal task.\n\n${
          error?.message ||
          "Unknown error"
        }`
      );
    }
  }

  // ========================================
  // STATISTICS
  // ========================================

  const activeGoals = useMemo(
    () =>
      goals.filter(
        (goal) =>
          goal.status !== "completed" ||
          !isCompletedForHistory(goal, historyClock)
      ),
    [goals, historyClock]
  );

  const stats = useMemo(() => {
    const total =
      activeGoals.length;

    const completed = activeGoals.filter((goal) => goal.status === "completed").length;

    const pending =
      activeGoals.filter(
        (goal) =>
          goal.status ===
          "pending"
      ).length;

    const inProgress =
      activeGoals.filter(
        (goal) =>
          goal.status ===
          "in-progress"
      ).length;

    let averageProgress = 0;

    if (total > 0) {
      const totalProgress =
        activeGoals.reduce(
          (sum, goal) => {
            const progress =
              calculateGoalProgress(
                goal
              );

            return (
              sum +
              (
                Number.isFinite(
                  progress
                )
                  ? progress
                  : 0
              )
            );
          },
          0
        );

      averageProgress =
        Math.round(
          totalProgress /
            total
        );
    }

    if (
      !Number.isFinite(
        averageProgress
      )
    ) {
      averageProgress = 0;
    }

    return {
      total,
      completed,
      pending,
      inProgress,
      averageProgress,
    };
  }, [activeGoals, topics, goalTasks]);

  // ========================================
  // LOADING
  // ========================================

  if (loading) {
    return (
      <div className="goals-page">

        <h1>
          🎯 Goals
        </h1>

        <p>
          Loading goals...
        </p>

      </div>
    );
  }

  // ========================================
  // UI
  // ========================================

  return (
    <div className="goals-page">

      {/* ==================================
          HEADER
      ================================== */}

      <div className="page-header">

        <div>

          <h1>
            🎯 Goals
          </h1>

          <p>
            Track your goals and
            automatically measure
            your progress.
          </p>

        </div>

        <Target size={42} />

      </div>

      {/* ==================================
          STATISTICS
      ================================== */}

      <section className="goal-stats">

        <div className="goal-stat-card">

          <Target size={25} />

          <span>
            Total Goals
          </span>

          <strong>
            {stats.total}
          </strong>

        </div>

        <div className="goal-stat-card">

          <CheckCircle size={25} />

          <span>
            Completed
          </span>

          <strong>
            {stats.completed}
          </strong>

        </div>

        <div className="goal-stat-card">

          <Clock size={25} />

          <span>
            Pending
          </span>

          <strong>
            {stats.pending}
          </strong>

        </div>

        <div className="goal-stat-card">

          <Target size={25} />

          <span>
            Average Progress
          </span>

          <strong>
            {stats.averageProgress}%
          </strong>

        </div>

      </section>

      {/* ==================================
          ADD BUTTON
      ================================== */}

      <div
        className="goal-add-area"
        style={{
          position: "relative",
          zIndex: 1000,
        }}
      >

        <button
          type="button"
          className="primary-button"
          onClick={openAddForm}
          style={{
            position: "relative",
            zIndex: 1001,
            cursor: "pointer",
          }}
        >

          <Plus size={18} />

          Add Goal

        </button>

      </div>

      {/* ==================================
          FORM
      ================================== */}

      {showForm && (
        <Modal
          isOpen={showForm}
          onClose={closeForm}
          showCloseButton={false}
          className="goal-form-modal"
        >
          <section className="goal-form-card">


          <div className="goal-form-header">

            <div>

              <h2>
                {editingGoal
                  ? "Edit Goal"
                  : "Add Goal"}
              </h2>

              <p>
                Connect the goal to
                a learning or personal
                skill.
              </p>

            </div>

            <button
              type="button"
              className="close-button"
              onClick={closeForm}
            >

              <X size={20} />

            </button>

          </div>

          <form
            className="goal-form"
            onSubmit={handleSubmit}
          >

            {/* TITLE */}

            <div className="form-group">

              <label>
                Goal Title
              </label>

              <input
                type="text"
                name="title"
                value={
                  goalForm.title
                }
                onChange={
                  handleChange
                }
                placeholder="Example: Complete Spring Boot"
                required
              />

            </div>

            {/* DESCRIPTION */}

            <div className="form-group">

              <label>
                Description
              </label>

              <input
                type="text"
                name="description"
                value={
                  goalForm.description
                }
                onChange={
                  handleChange
                }
                placeholder="Describe your goal"
              />

            </div>

            {/* SKILL */}

            <div className="form-group">

              <label>

                <LinkIcon size={15} />

                Skill

              </label>

              <select
                name="skill"
                value={
                  goalForm.skill
                }
                onChange={
                  handleChange
                }
                required
              >

                <option value="">
                  Select a skill
                </option>

                <optgroup label="📚 Learning Skills">

                  {allLearningSkills.map(
                    (skill) => (
                      <option
                        key={`learning-${skill}`}
                        value={skill}
                      >
                        {skill}
                      </option>
                    )
                  )}

                </optgroup>

                <optgroup label="🌱 Personal Skills">

                  {PERSONAL_SKILLS.map(
                    (skill) => (
                      <option
                        key={`personal-${skill}`}
                        value={skill}
                      >
                        {skill}
                      </option>
                    )
                  )}

                </optgroup>

                <optgroup label="✨ Other">

                  <option value="Other">
                    Other Skill
                  </option>

                </optgroup>

              </select>

              <small>
                Goal progress is calculated from
                the Goal Tasks you add below.
              </small>

            </div>

            {/* TARGET DATE */}

            <div className="form-group">

              <label>
                Target Date
              </label>

              <input
                type="date"
                name="targetDate"
                value={
                  goalForm.targetDate
                }
                onChange={
                  handleChange
                }
                required
              />

            </div>

            {/* SUBMIT */}

            <button
              type="submit"
              className="primary-button"
            >

              {editingGoal
                ? "Save Changes"
                : "Add Goal"}

            </button>

          </form>

        </section>
        </Modal>
      )}

      {/* ==================================
          MY GOALS
      ================================== */}

      <section className="goals-section">

        <div className="section-heading">

          <div>

            <h2>
              My Goals
            </h2>

            <p>
              Track your targets and
              deadlines.
            </p>

          </div>

        </div>

        {/* ==================================
            EMPTY STATE
        ================================== */}

        {activeGoals.length === 0 ? (

          <div className="empty-state">

            <Target size={40} />

            <h3>
              No goals yet
            </h3>

            <p>
              Add your first goal
              to start tracking
              your progress.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={openAddForm}
            >

              <Plus size={18} />

              Add Goal

            </button>

          </div>

        ) : (

          <div className="goals-list">

            {activeGoals.map((goal) => {

              const progress =
                calculateGoalProgress(
                  goal
                );

              const topicStats =
                getGoalTopicStats(
                  goal
                );

              const daysRemaining =
                goal.targetDate
                  ? calculateDaysRemaining(
                      goal.targetDate
                    )
                  : 0;

              const tasksForGoal =
                goalTasks.filter(
                  (task) =>
                    String(
                      task.goalId
                    ) ===
                    String(
                      goal.id
                    )
                );

              return (

                <div
                  className="goal-card"
                  key={goal.id}
                >

                  {/* CARD HEADER */}

                  <div className="goal-card-header">

                    <div>

                      <h3>
                        {goal.title}
                      </h3>

                      <p>
                        {goal.description ||
                          "No description"}
                      </p>

                    </div>

                    <div className="goal-actions">

                      <button
                        type="button"
                        className="edit-button"
                        onClick={() =>
                          openEditForm(
                            goal
                          )
                        }
                        title="Edit goal"
                      >

                        <Pencil
                          size={17}
                        />

                      </button>

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() =>
                          deleteGoal(
                            goal
                          )
                        }
                        title="Delete goal"
                      >

                        <Trash2
                          size={17}
                        />

                      </button>

                    </div>

                  </div>

                  {/* SKILL */}

                  <div className="goal-skill">

                    <LinkIcon
                      size={16}
                    />

                    <span>

                      {goal.skill
                        ? `Linked to ${goal.skill}`
                        : "No skill linked"}

                    </span>

                  </div>

                  {/* PROGRESS HEADER */}

                  <div className="goal-progress-header">

                    <span>
                      Progress
                    </span>

                    <strong>
                      {progress}%
                    </strong>

                  </div>

                  {/* PROGRESS BAR */}

                  <div className="goal-progress">

                    <div
                      className="goal-progress-fill"
                      style={{
                        width:
                          `${progress}%`,
                      }}
                    />

                  </div>

                  {/* PROGRESS SOURCE */}

                  {tasksForGoal.length > 0 ? (
                    <p className="goal-topic-count">
                      {
                        tasksForGoal.filter(isTaskCompleted).length
                      }
                      {" "}of{" "}
                      {tasksForGoal.length} goal tasks completed
                    </p>
                  ) : topicStats.total > 0 ? (
                    <p className="goal-topic-count">
                      {topicStats.completed}
                      {" "}of{" "}
                      {topicStats.total}
                      {" "}
                      {goal.skill}
                      {" "}
                      topics completed
                    </p>
                  ) : (
                    <p className="goal-topic-count">
                      No Goal Tasks connected yet. Progress is 0%.
                    </p>
                  )}

                  {/* ==================================
                      GOAL TASK BREAKDOWN
                  ================================== */}

                  <div
                    style={{
                      marginTop: "16px",
                      paddingTop: "14px",
                      borderTop:
                        "1px solid rgba(255,255,255,0.10)",
                    }}
                  >

                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        alignItems:
                          "center",
                        gap: "10px",
                        marginBottom:
                          "10px",
                      }}
                    >

                      <div>

                        <strong>
                          Goal Tasks
                        </strong>

                        <span
                          style={{
                            marginLeft:
                              "8px",
                            opacity:
                              0.7,
                          }}
                        >
                          {
                            tasksForGoal.length
                          }
                        </span>

                      </div>

                      {tasksForGoal.length > 0 && (
                        <span
                          style={{
                            fontSize: "12px",
                            opacity: 0.7,
                            marginLeft: "auto",
                            marginRight: "8px",
                          }}
                        >
                          {
                            tasksForGoal.filter(isTaskCompleted).length
                          }
                          /{tasksForGoal.length} completed
                        </span>
                      )}

                      <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          addGoalTask(
                            goal
                          )
                        }
                        style={{
                          padding:
                            "7px 11px",
                          fontSize:
                            "13px",
                        }}
                      >

                        <Plus size={15} />

                        Add Task

                      </button>

                    </div>

                    {tasksForGoal.length ===
                    0 ? (

                      <p
                        style={{
                          margin: 0,
                          opacity:
                            0.65,
                        }}
                      >
                        No tasks yet.
                        Add smaller
                        tasks to
                        complete
                        this goal
                        step by step.
                      </p>

                    ) : (

                      <div
                        style={{
                          display:
                            "grid",
                          gap: "8px",
                        }}
                      >

                        {tasksForGoal.map(
                          (task) => (

                            <div
                              key={
                                task.id
                              }
                              style={{
                                display:
                                  "flex",
                                alignItems:
                                  "center",
                                justifyContent:
                                  "space-between",
                                gap: "10px",
                                padding:
                                  "9px 10px",
                                borderRadius:
                                  "10px",
                                background:
                                  "rgba(255,255,255,0.04)",
                              }}
                            >

                              <div
                                style={{
                                  display:
                                    "flex",
                                  flexDirection:
                                    "column",
                                  gap:
                                    "3px",
                                  minWidth:
                                    0,
                                }}
                              >

                                <span
                                  style={{
                                    textDecoration:
                                      task.completed
                                        ? "line-through"
                                        : "none",
                                    opacity:
                                      task.completed
                                        ? 0.6
                                        : 1,
                                  }}
                                >
                                  {
                                    task.title
                                  }
                                </span>

                                <small
                                  style={{
                                    opacity:
                                      0.55,
                                  }}
                                >
                                  Goal: {goal.title}
                                  {" • "}
                                  {task.date
                                    ? `Due: ${task.date}`
                                    : "No date"}
                                </small>

                              </div>

                              <div
                                style={{
                                  display:
                                    "flex",
                                  gap:
                                    "6px",
                                  flexShrink:
                                    0,
                                }}
                              >

                                <button
                                  type="button"
                                  className="edit-button"
                                  title={
                                    task.completed
                                      ? "Mark incomplete"
                                      : "Mark complete"
                                  }
                                  onClick={() =>
                                    toggleGoalTask(
                                      task
                                    )
                                  }
                                >

                                  {task.completed ? (
                                    <Circle
                                      size={
                                        16
                                      }
                                    />
                                  ) : (
                                    <CheckCircle
                                      size={
                                        16
                                      }
                                    />
                                  )}

                                </button>

                                <button
                                  type="button"
                                  className="delete-button"
                                  title="Delete goal task"
                                  onClick={() =>
                                    deleteGoalTask(
                                      task
                                    )
                                  }
                                >

                                  <Trash2
                                    size={
                                      16
                                    }
                                  />

                                </button>

                              </div>

                            </div>

                          )
                        )}

                      </div>

                    )}

                  </div>

                  {/* DETAILS */}

                  <div className="goal-details">

                    <div>

                      <CalendarDays
                        size={17}
                      />

                      <span>

                        Target:{" "}

                        {goal.targetDate}

                      </span>

                    </div>

                    <div>

                      <Clock
                        size={17}
                      />

                      <span>

                        {daysRemaining}{" "}
                        days remaining

                      </span>

                    </div>

                    {(() => {
                      // Goal status is derived from linked tasks only.
                      // With no linked tasks, calculateGoalStatus returns pending.
                      const displayStatus = calculateGoalStatus(
                        goal,
                        goalTasks
                      );

                      const statusConfig = {
                        pending: {
                          label: "Pending",
                          background: "rgba(255, 255, 255, 0.06)",
                          border: "rgba(255, 255, 255, 0.14)",
                          text: "#d1d5db",
                        },
                        "in-progress": {
                          label: "In Progress",
                          background: "rgba(59, 130, 246, 0.14)",
                          border: "rgba(59, 130, 246, 0.35)",
                          text: "#60a5fa",
                        },
                        completed: {
                          label: "Completed",
                          background: "rgba(34, 197, 94, 0.14)",
                          border: "rgba(34, 197, 94, 0.35)",
                          text: "#4ade80",
                        },
                      };

                      const config =
                        statusConfig[
                          displayStatus
                        ] ||
                        statusConfig.pending;

                      return (
                        <div
                          role="status"
                          aria-label={`Goal status: ${config.label}`}
                          title={
                            tasksForGoal.length > 0
                              ? "Status is automatically calculated from Goal Tasks"
                              : "Add Goal Tasks to automatically track this status"
                          }
                          style={{
                            minWidth: "128px",
                            height: "46px",
                            padding: "0 18px",
                            borderRadius: "12px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            boxSizing: "border-box",
                            background: config.background,
                            border: `1px solid ${config.border}`,
                            color: config.text,
                            fontSize: "14px",
                            fontWeight: 600,
                            letterSpacing: "0.1px",
                            cursor: "default",
                            userSelect: "none",
                          }}
                        >
                          <span
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background: config.text,
                              flexShrink: 0,
                            }}
                          />
                          {config.label}
                        </div>
                      );
                    })()}

                  </div>

                </div>

              );
            })}

          </div>

        )}

      </section>

    </div>
  );
}

export default Goals;