import { useEffect, useState } from "react";

import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import {
  Home as HomeIcon,
  BookOpen,
  CalendarDays,
  Target,
  Droplets,
  Activity,
  ClipboardCheck,
  Zap,
  BarChart3,
  UserCircle,
  StickyNote,
  ListTodo,
  Bell,
  Clock3,
  BriefcaseBusiness,
  HeartPulse,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Wallet,
  TrendingUp,
  TrendingDown,
  Settings as SettingsIcon,
  Plus,
  MoreHorizontal,
} from "lucide-react";

import "./styles/Career.css";
import "./styles/Finance.css";
import "./styles/Study.css";
import "./styles/Wellness.css";
import "./styles/Productivity.css";

import Home from "./pages/Home";
import Learning from "./pages/Study/Learning";
import Timetable from "./pages/Study/Timetable";
import Goals from "./pages/Study/Goals";

import Water from "./pages/Wellness/Water";
import Activities from "./pages/Wellness/Activities";

import Assessments from "./pages/Study/Assessments";
import QuickTasks from "./pages/Productivity/QuickTasks";
import Reports from "./pages/Productivity/Reports";
import DailyReview from "./pages/DailyReview";
import WeeklyReview from "./pages/WeeklyReview";
import Profile from "./pages/Profile";

import QuickNotes from "./pages/Productivity/QuickNotes";
import DailyTargets from "./pages/Productivity/DailyTargets";
import Reminders from "./pages/Productivity/Reminders";
import TodoList from "./pages/Productivity/TodoList";

import StudySessions from "./pages/Study/StudySessions";

import JobPreparation from "./pages/Career/JobPreparation";
import Applications from "./pages/Career/Applications";
import SavedJobs from "./pages/Career/SavedJobs";
import Resumes from "./pages/Career/Resumes";
import Interviews from "./pages/Career/Interviews";
import Projects from "./pages/Career/Projects";

import Income from "./pages/Finance/Income";
import Expenses from "./pages/Finance/Expenses";
import Budget from "./pages/Finance/Budget";

import Settings from "./pages/Settings";
import CalendarView from "./components/calendar/CalendarView";

import {
  ensureDailyReportHistory,
  createDailyReportForDate,
} from "./utils/db";

import Login from "./pages/Login";
import { useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import PinLock from "./pages/PinLock";
import ForgotPin from "./pages/ForgotPin";
import PinSetup from "./pages/PinSetup";
import { getPinStatus } from "./utils/pinLock";

import { testFirestore } from "./firebase/firestoreTest";
import { getItemsFromFirestore } from "./firebase/firestore";

import {
  initializeSmartNotifications,
  cancelSmartNotifications,
} from "./utils/notificationService";

/* =========================================================
   FIRESTORE TEST
   ========================================================= */

function FirestoreTest() {
  useEffect(() => {
    testFirestore();
  }, []);

  return null;
}

/* =========================================================
   FIREBASE DATA SOURCE
   ========================================================= */

/*
   TASKBAR now uses Firebase Firestore as its persistent
   application data source.

   Individual pages access data through src/utils/db.js,
   which now reads and writes directly to Firestore.

   The old IndexedDB -> Firestore synchronization loop is
   intentionally removed from App.jsx so the application does
   not maintain a second persistent data store.
*/

/* =========================================================
   DAILY REPORT MANAGER
   ========================================================= */

function DailyReportManager() {
  useEffect(() => {
    let cancelled = false;

    async function updateDailyReports() {
      try {
        await ensureDailyReportHistory();

        if (cancelled) {
          return;
        }

        const previousDate =
          getPreviousLocalDateKey();

        await createDailyReportForDate(
          previousDate
        );
      } catch (error) {
        console.error(
          "Failed to update daily reports:",
          error
        );
      }
    }

    updateDailyReports();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

/* =========================================================
   SMART NOTIFICATION MANAGER
   ========================================================= */

function SmartNotificationManager() {
  const { user } = useAuth();

  const [remindersEnabled, setRemindersEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem("taskbar-settings");

      if (!stored) {
        return true;
      }

      const parsed = JSON.parse(stored);

      return parsed?.remindersEnabled !== false;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    function handleSettingsChange(event) {
      if (
        event?.detail?.name ===
        "remindersEnabled"
      ) {
        setRemindersEnabled(
          event.detail.value !== false
        );

        return;
      }

      try {
        const stored =
          localStorage.getItem(
            "taskbar-settings"
          );

        const parsed =
          stored
            ? JSON.parse(stored)
            : {};

        setRemindersEnabled(
          parsed?.remindersEnabled !== false
        );
      } catch {
        setRemindersEnabled(true);
      }
    }

    window.addEventListener(
      "taskbar-settings-changed",
      handleSettingsChange
    );

    return () => {
      window.removeEventListener(
        "taskbar-settings-changed",
        handleSettingsChange
      );
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    async function updateNotifications() {
      try {
        if (!remindersEnabled) {
          await cancelSmartNotifications();

          if (!cancelled) {
            console.log(
              "⏸️ Taskbar reminders and smart notifications are OFF."
            );
          }

          return;
        }

        console.log(
          "🔔 Starting Taskbar smart notifications..."
        );

        const result =
          await initializeSmartNotifications();

        if (cancelled) {
          return;
        }

        if (result.enabled) {
          console.log(
            `✅ Taskbar smart notifications active. Scheduled: ${result.scheduled}`
          );

          if (
            Array.isArray(
              result.plan
            )
          ) {
            console.log(
              "📋 Today's smart notification plan:",
              result.plan
            );
          }
        } else {
          console.log(
            "ℹ️ Taskbar smart notifications are not enabled."
          );
        }
      } catch (error) {
        console.error(
          "❌ Taskbar smart notification initialization failed:",
          error
        );
      }
    }

    updateNotifications();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    remindersEnabled,
  ]);

  return null;
}

/* =========================================================
   GET PREVIOUS LOCAL DATE
   ========================================================= */

function getPreviousLocalDateKey() {
  const date =
    new Date();

  date.setDate(
    date.getDate() - 1
  );

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* =========================================================
   DAILY REVIEW ROUTE
   ========================================================= */

function DailyReviewRoute() {
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

  useEffect(() => {
    let cancelled = false;

    async function loadDailyReviewData() {
      try {
        const [
          tasks,
          learning,
          goals,
          assessments,
          timetable,
          applications,
          interviews,
          studySessions,
          activities,
        ] = await Promise.all([
          getItemsFromFirestore("todoList"),
          getItemsFromFirestore("topics"),
          getItemsFromFirestore("goals"),
          getItemsFromFirestore("assessments"),
          getItemsFromFirestore("timetable"),
          getItemsFromFirestore("applications"),
          getItemsFromFirestore("interviews"),
          getItemsFromFirestore("studySessions"),
          getItemsFromFirestore("activities"),
        ]);

        if (cancelled) {
          return;
        }

        setData({
          tasks: Array.isArray(tasks) ? tasks : [],
          learning: Array.isArray(learning) ? learning : [],
          goals: Array.isArray(goals) ? goals : [],
          assessments: Array.isArray(assessments) ? assessments : [],
          timetable: Array.isArray(timetable) ? timetable : [],
          applications: Array.isArray(applications) ? applications : [],
          interviews: Array.isArray(interviews) ? interviews : [],
          studySessions: Array.isArray(studySessions) ? studySessions : [],
          activities: Array.isArray(activities) ? activities : [],
        });
      } catch (error) {
        console.error("Failed to load Daily Review data:", error);
      }
    }

    loadDailyReviewData();

    return () => {
      cancelled = true;
    };
  }, []);

  return <DailyReview {...data} />;
}

/* =========================================================
   NAVIGATION
   ========================================================= */

const navigation = [
  {
    type: "single",
    label: "Home",
    path: "/",
    icon: HomeIcon,
  },

  {
    type: "group",
    id: "study",
    label: "Study",
    icon: BookOpen,

    items: [
      {
        label: "Learning",
        path: "/learning",
        icon: BookOpen,
      },
      {
        label: "Timetable",
        path: "/timetable",
        icon: CalendarDays,
      },
      {
        label: "Calendar View",
        path: "/calendar",
        icon: CalendarDays,
      },
      {
        label: "Assessments",
        path: "/assessments",
        icon: ClipboardCheck,
      },
      {
        label: "Study Sessions",
        path: "/study-sessions",
        icon: Clock3,
      },
    ],
  },

  {
    type: "group",
    id: "career",
    label: "Career",
    icon: BriefcaseBusiness,

    items: [
      {
        label: "Job Preparation",
        path: "/job-preparation",
        icon: BriefcaseBusiness,
      },
      {
        label: "Applications",
        path: "/applications",
        icon: ClipboardCheck,
      },
      {
        label: "Saved Jobs",
        path: "/saved-jobs",
        icon: BriefcaseBusiness,
      },
      {
        label: "Resumes",
        path: "/resumes",
        icon: BookOpen,
      },
      {
        label: "Interviews",
        path: "/interviews",
        icon: CalendarDays,
      },
      {
        label: "Projects",
        path: "/projects",
        icon: Zap,
      },
    ],
  },

  {
    type: "group",
    id: "productivity",
    label: "Productivity",
    icon: Target,

    items: [
      {
        label: "To-Do List",
        path: "/todo-list",
        icon: ListTodo,
      },
      {
        label: "Goals",
        path: "/goals",
        icon: Target,
      },
      {
        label: "Quick Notes",
        path: "/quick-notes",
        icon: StickyNote,
      },
      {
        label: "Reminders",
        path: "/reminders",
        icon: Bell,
      },
    ],
  },

  {
    type: "group",
    id: "wellness",
    label: "Wellness",
    icon: HeartPulse,

    items: [
      {
        label: "Water",
        path: "/water",
        icon: Droplets,
      },
      {
        label: "Activities",
        path: "/activities",
        icon: Activity,
      },
    ],
  },

  {
    type: "group",
    id: "finance",
    label: "Finance",
    icon: Wallet,

    items: [
      {
        label: "Income",
        path: "/income",
        icon: TrendingUp,
      },
      {
        label: "Expenses",
        path: "/expenses",
        icon: TrendingDown,
      },
      {
        label: "Budget",
        path: "/budget",
        icon: Wallet,
      },
    ],
  },

  {
    type: "group",
    id: "insights",
    label: "Insights",
    icon: BarChart3,

    items: [
      {
        label: "Reports",
        path: "/reports",
        icon: BarChart3,
      },
      {
        label: "Daily Review",
        path: "/daily-review",
        icon: ClipboardCheck,
      },
      {
        label: "Weekly Review",
        path: "/weekly-review",
        icon: CalendarDays,
      },
    ],
  },

  {
    type: "single",
    label: "Settings",
    path: "/settings",
    icon: SettingsIcon,
  },
];

/* =========================================================
   MOBILE NAVIGATION
   ========================================================= */

const mobilePrimaryNavigation = [
  { label: "Home", path: "/", icon: HomeIcon },
  { label: "Study", path: "/learning", icon: BookOpen },
  { label: "Career", path: "/job-preparation", icon: BriefcaseBusiness },
];

const mobileMoreNavigation = [
  { label: "Quick Tasks", path: "/quick-tasks", icon: ListTodo },
  { label: "Quick Notes", path: "/quick-notes", icon: StickyNote },
  { label: "Reminders", path: "/reminders", icon: Bell },
  { label: "Timetable", path: "/timetable", icon: CalendarDays },
  { label: "Calendar", path: "/calendar", icon: CalendarDays },
  { label: "Assessments", path: "/assessments", icon: ClipboardCheck },
  { label: "Study Sessions", path: "/study-sessions", icon: Clock3 },
  { label: "To-Do List", path: "/todo-list", icon: ListTodo },
  { label: "Water", path: "/water", icon: Droplets },
  { label: "Activities", path: "/activities", icon: Activity },
  { label: "Income", path: "/income", icon: TrendingUp },
  { label: "Expenses", path: "/expenses", icon: TrendingDown },
  { label: "Budget", path: "/budget", icon: Wallet },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Daily Review", path: "/daily-review", icon: ClipboardCheck },
  { label: "Weekly Review", path: "/weekly-review", icon: CalendarDays },
  { label: "Settings", path: "/settings", icon: SettingsIcon },
];

/* Mobile top navigation uses the same main navigation structure as desktop.
   Every section starts collapsed and opens vertically inside the dropdown. */
function MobileMainMenu({ isOpen, openGroups, onToggleGroup, onNavigate }) {
  if (!isOpen) return null;

  return (
    <div className="mobile-main-menu" role="navigation" aria-label="Main navigation">
      <div className="mobile-main-menu-inner">
        {navigation.map((item) => {
          if (item.type === "single") {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) => `mobile-main-link ${isActive ? "active" : ""}`}
                onClick={onNavigate}
              >
                <span className="mobile-main-link-left"><Icon size={20} /><span>{item.label}</span></span>
                <ChevronRight size={18} />
              </NavLink>
            );
          }

          const Icon = item.icon;
          const expanded = Boolean(openGroups[item.id]);

          return (
            <div className={`mobile-main-group ${expanded ? "open" : ""}`} key={item.id}>
              <button
                type="button"
                className="mobile-main-link mobile-main-group-button"
                onClick={() => onToggleGroup(item.id)}
                aria-expanded={expanded}
              >
                <span className="mobile-main-link-left"><Icon size={20} /><span>{item.label}</span></span>
                {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>

              {expanded && (
                <div className="mobile-main-submenu">
                  {item.items.map(({ label, path, icon: SubIcon }) => (
                    <NavLink
                      key={path}
                      to={path}
                      className={({ isActive }) => `mobile-main-sub-link ${isActive ? "active" : ""}`}
                      onClick={onNavigate}
                    >
                      <SubIcon size={16} />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   SIDEBAR GROUP
   ========================================================= */

function SidebarGroup({
  group,
  isOpen,
  onToggle,
  onNavigate,
}) {
  const location =
    useLocation();

  const hasActiveItem =
    group.items.some(
      (item) =>
        location.pathname ===
          item.path ||
        location.pathname.startsWith(
          `${item.path}/`
        )
    );

  return (
    <div className="sidebar-group">
      <button
        type="button"
        className={`sidebar-group-header ${
          hasActiveItem
            ? "has-active-item"
            : ""
        }`}
        onClick={() =>
          onToggle(group.id)
        }
        aria-expanded={
          isOpen
        }
      >
        <span className="sidebar-group-title">
          <group.icon size={19} />

          <span>
            {group.label}
          </span>
        </span>

        {isOpen ? (
          <ChevronDown
            size={17}
          />
        ) : (
          <ChevronRight
            size={17}
          />
        )}
      </button>

      {isOpen && (
        <div className="sidebar-group-items">
          {group.items.length ===
          0 ? (
            <div className="sidebar-coming-soon">
              Coming soon
            </div>
          ) : (
            group.items.map(
              ({
                label,
                path,
                icon: Icon,
              }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({
                    isActive,
                  }) =>
                    `sidebar-link sidebar-sub-link ${
                      isActive
                        ? "active"
                        : ""
                    }`
                  }
                  onClick={
                    onNavigate
                  }
                >
                  <Icon size={17} />

                  <span>
                    {label}
                  </span>
                </NavLink>
              )
            )
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   MOBILE MORE MENU
   ========================================================= */

function MobileMoreMenu({
  isOpen,
  onClose,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="mobile-more-menu"
      role="dialog"
      aria-modal="true"
      aria-label="More navigation"
    >
      <div className="mobile-more-menu-header">
        <div>
          <h2>
            More
          </h2>

          <span>
            Taskbar
          </span>
        </div>

        <button
          type="button"
          className="mobile-more-close"
          onClick={onClose}
          aria-label="Close more menu"
        >
          <X size={22} />
        </button>
      </div>

      <nav className="mobile-more-menu-list">
        {mobileMoreNavigation.map(
          ({
            label,
            path,
            icon: Icon,
          }) => (
            <NavLink
              key={path}
              to={path}
              end={
                path ===
                "/profile"
              }
              className={({
                isActive,
              }) =>
                `mobile-more-link ${
                  isActive
                    ? "active"
                    : ""
                }`
              }
              onClick={onClose}
            >
              <span className="mobile-more-link-icon">
                <Icon size={20} />
              </span>

              <span>
                {label}
              </span>
            </NavLink>
          )
        )}
      </nav>
    </div>
  );
}
/* =========================================================
   MOBILE BOTTOM NAVIGATION
   ========================================================= */

function MobileBottomNavigation({ onMore, moreOpen, onAdd, addOpen }) {
  const location = useLocation();
  const studyPaths = ["/learning", "/timetable", "/calendar", "/assessments", "/study-sessions"];
  const careerPaths = ["/job-preparation", "/applications", "/saved-jobs", "/resumes", "/interviews", "/projects"];
  const isMoreRoute = mobileMoreNavigation.some((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));

  return (
    <nav className="mobile-bottom-navigation" aria-label="Mobile navigation">
      {mobilePrimaryNavigation.map(({ label, path, icon: Icon }) => {
        const isActive =
          path === "/"
            ? location.pathname === "/"
            : path === "/learning"
              ? studyPaths.some((itemPath) => location.pathname === itemPath || location.pathname.startsWith(`${itemPath}/`))
              : path === "/job-preparation"
                ? careerPaths.some((itemPath) => location.pathname === itemPath || location.pathname.startsWith(`${itemPath}/`))
                : location.pathname === path || location.pathname.startsWith(`${path}/`);
        return (
          <NavLink key={path} to={path} end={path === "/"} className={`mobile-bottom-nav-item ${isActive ? "active" : ""}`}>
            <Icon size={21} /><span>{label}</span>
          </NavLink>
        );
      })}
      <button type="button" className={`mobile-bottom-nav-item mobile-bottom-add ${addOpen ? "active" : ""}`} onClick={onAdd} aria-expanded={addOpen} aria-label="Add to TASKBAR">
        {addOpen ? <X size={21} /> : <Plus size={22} />}<span>Add</span>
      </button>
      <button type="button" className={`mobile-bottom-nav-item ${moreOpen || isMoreRoute ? "active" : ""}`} onClick={onMore} aria-expanded={moreOpen} aria-label="Open more navigation">
        {moreOpen ? <X size={21} /> : <MoreHorizontal size={24} />}<span>More</span>
      </button>
    </nav>
  );
}

/* =========================================================
   BACKGROUND
   ========================================================= */

function PageBackground() {
  const location =
    useLocation();

  const isProfilePage =
    location.pathname ===
    "/profile";

  const [
    backgroundImage,
    setBackgroundImage,
  ] = useState(() => {
    try {
      return (
        localStorage.getItem(
          "taskbar-custom-page-background"
        ) ||
        "/spiderman-bg.jpg"
      );
    } catch {
      return "/spiderman-bg.jpg";
    }
  });

  useEffect(() => {
    function loadBackground() {
      try {
        setBackgroundImage(
          localStorage.getItem(
            "taskbar-custom-page-background"
          ) ||
            "/spiderman-bg.jpg"
        );
      } catch {
        setBackgroundImage(
          "/spiderman-bg.jpg"
        );
      }
    }

    loadBackground();

    window.addEventListener(
      "taskbar-background-changed",
      loadBackground
    );

    window.addEventListener(
      "storage",
      loadBackground
    );

    return () => {
      window.removeEventListener(
        "taskbar-background-changed",
        loadBackground
      );

      window.removeEventListener(
        "storage",
        loadBackground
      );
    };
  }, []);

  if (isProfilePage) {
    return null;
  }

  return (
    <div
      className="taskbar-spiderman-background"
      style={{
        "--taskbar-page-background": `url("${backgroundImage}")`,
      }}
      aria-hidden="true"
    />
  );
}

function AddActionMenu({ isOpen, onClose }) {
  if (!isOpen) return null;

  const actions = [
    { label: "Add Task", description: "Create a quick task", path: "/quick-tasks", icon: ListTodo },
    { label: "Add Goal", description: "Create a new goal", path: "/goals", icon: Target },
    { label: "Add Schedule", description: "Plan a timetable item", path: "/timetable", icon: CalendarDays },
    { label: "Add Note", description: "Write a quick note", path: "/quick-notes", icon: StickyNote },
  ];

  return (
    <div className="taskbar-add-menu-overlay" role="dialog" aria-modal="true" aria-label="Add to TASKBAR" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="taskbar-add-menu">
        <div className="taskbar-add-menu-header">
          <div>
            <span className="taskbar-add-menu-eyebrow">TASKBAR</span>
            <h2>Add something</h2>
            <p>Choose what you want to add.</p>
          </div>
          <button type="button" className="taskbar-add-menu-close" onClick={onClose} aria-label="Close add menu"><X size={21} /></button>
        </div>
        <div className="taskbar-add-menu-grid">
          {actions.map(({ label, description, path, icon: Icon }) => (
            <NavLink key={path} to={path} className="taskbar-add-action" onClick={onClose}>
              <span className="taskbar-add-action-icon"><Icon size={21} /></span>
              <span className="taskbar-add-action-copy"><strong>{label}</strong><small>{description}</small></span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   APP LAYOUT
   ========================================================= */

function AppHeader({ isProfilePage, onMenuToggle, sidebarOpen, mobileMainMenuOpen }) {
  const location = useLocation();

  const [headerProfile, setHeaderProfile] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadHeaderProfile() {
      try {
        const items = await getItemsFromFirestore("profile");
        const profile = Array.isArray(items) ? items[0] || null : items || null;

        if (active) {
          setHeaderProfile(profile);
        }
      } catch (error) {
        console.error("Failed to load header profile:", error);
      }
    }

    loadHeaderProfile();

    const handleProfileChanged = (event) => {
      if (active && event?.detail) {
        setHeaderProfile(event.detail);
      }
    };

    window.addEventListener("taskbar-profile-changed", handleProfileChanged);

    return () => {
      active = false;
      window.removeEventListener("taskbar-profile-changed", handleProfileChanged);
    };
  }, []);
  const pageTitles = {
    "/": "Home", "/learning": "Learning", "/timetable": "Timetable",
    "/calendar": "Calendar", "/assessments": "Assessments", "/study-sessions": "Study Sessions",
    "/todo-list": "To-Do List", "/goals": "Goals", "/quick-notes": "Quick Notes",
    "/reminders": "Reminders", "/water": "Water", "/activities": "Activities",
    "/income": "Income", "/expenses": "Expenses", "/budget": "Budget", "/reports": "Reports",
    "/daily-review": "Daily Review", "/weekly-review": "Weekly Review",
    "/job-preparation": "Job Preparation", "/applications": "Applications", "/saved-jobs": "Saved Jobs",
    "/resumes": "Resumes", "/interviews": "Interviews", "/projects": "Projects",
    "/settings": "Settings", "/profile": "Profile",
  };
  const exactTitle = pageTitles[location.pathname];
  const fallbackPath = Object.keys(pageTitles).filter((path) => path !== "/" && location.pathname.startsWith(`${path}/`)).sort((a,b) => b.length-a.length)[0];
  const title = exactTitle || pageTitles[fallbackPath] || "TASKBAR";

  return (
    <header className={`taskbar-header ${isProfilePage ? "profile-header" : ""}`}>
      <div className="taskbar-header-left">
        <button type="button" className="taskbar-header-menu" onClick={onMenuToggle} aria-label={(sidebarOpen || mobileMainMenuOpen) ? "Close navigation" : "Open navigation"} aria-expanded={sidebarOpen || mobileMainMenuOpen}>
          {sidebarOpen || mobileMainMenuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <div className="taskbar-header-brand">
          <span className="taskbar-header-logo-mark" aria-hidden="true"><Zap size={30} fill="currentColor" /></span>
          <strong>TASKBAR</strong>
          <span>{title}</span>
        </div>
      </div>
      <div className="taskbar-header-right">
        <div className="taskbar-header-page-title">{title}</div>
        <NavLink to="/reminders" className="taskbar-header-notification" aria-label="Open reminders">
          <Bell size={25} />
          <span className="taskbar-notification-dot" aria-hidden="true" />
        </NavLink>
        <NavLink to="/profile" className={`taskbar-header-profile ${isProfilePage ? "active" : ""}`} aria-label="Open profile">
          <span className="taskbar-header-avatar" aria-hidden="true">
            {headerProfile?.photo ? (
              <img src={headerProfile.photo} alt="" />
            ) : (
              (headerProfile?.name?.trim()?.charAt(0) || "P").toUpperCase()
            )}
          </span>

          <span className="taskbar-header-profile-copy">
            <strong>{headerProfile?.name?.trim() || "Profile"}</strong>
          </span>
        </NavLink>
      </div>
    </header>
  );
}

function AppLayout() {
  const location =
    useLocation();

  const [
    sidebarOpen,
    setSidebarOpen,
  ] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth >= 701
      : true
  );

  const [
    addMenuOpen,
    setAddMenuOpen,
  ] = useState(false);

  const [
    mobileMoreOpen,
    setMobileMoreOpen,
  ] = useState(false);

  const [
    mobileMainMenuOpen,
    setMobileMainMenuOpen,
  ] = useState(false);

  const [
    mobileMainOpenGroups,
    setMobileMainOpenGroups,
  ] = useState({
    study: false,
    career: false,
    productivity: false,
    wellness: false,
    finance: false,
    insights: false,
  });

  const [
    openGroups,
    setOpenGroups,
  ] = useState({
    study: true,
    career: true,
    productivity: true,
    wellness: false,
    finance: false,
    insights: true,
  });

  const isProfilePage =
    location.pathname ===
    "/profile";

  useEffect(() => {
    setMobileMoreOpen(false);
    setAddMenuOpen(false);
    setMobileMainMenuOpen(false);
    setMobileMainOpenGroups({
      study: false,
      career: false,
      productivity: false,
      wellness: false,
      finance: false,
      insights: false,
    });
  }, [location.pathname]);

  function toggleGroup(
    groupId
  ) {
    setOpenGroups(
      (previous) => ({
        ...previous,
        [groupId]:
          !previous[
            groupId
          ],
      })
    );
  }

  function toggleMobileMainGroup(groupId) {
    setMobileMainOpenGroups((previous) => ({
      ...previous,
      [groupId]: !previous[groupId],
    }));
  }

  function closeMobileMainMenu() {
    setMobileMainMenuOpen(false);
  }

  function handleHeaderMenuToggle() {
    if (typeof window !== "undefined" && window.innerWidth <= 700) {
      setMobileMainMenuOpen((previous) => !previous);
      setMobileMoreOpen(false);
      setAddMenuOpen(false);
      return;
    }

    setSidebarOpen((previous) => !previous);
  }

  function closeSidebar() {
    if (typeof window !== "undefined" && window.innerWidth <= 700) {
      setSidebarOpen(false);
    }
  }

  function toggleMobileMore() {
    setMobileMoreOpen(
      (previous) =>
        !previous
    );
  }

  function closeMobileMore() {
    setMobileMoreOpen(false);
  }

  return (
    <>
      <PageBackground />

      <AppHeader
        isProfilePage={isProfilePage}
        onMenuToggle={handleHeaderMenuToggle}
        sidebarOpen={sidebarOpen}
        mobileMainMenuOpen={mobileMainMenuOpen}
      />

      <MobileMainMenu
        isOpen={mobileMainMenuOpen}
        openGroups={mobileMainOpenGroups}
        onToggleGroup={toggleMobileMainGroup}
        onNavigate={closeMobileMainMenu}
      />

      <MobileMoreMenu
        isOpen={
          mobileMoreOpen
        }
        onClose={
          closeMobileMore
        }
      />

      <AddActionMenu
        isOpen={addMenuOpen}
        onClose={() => setAddMenuOpen(false)}
      />

      <div
        className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"} ${isProfilePage ? "profile-route-active" : "normal-route-active"}`}
      >
        {/* =================================================
            SIDEBAR
        ================================================= */}

        <aside
          className={`sidebar ${
            sidebarOpen
              ? "sidebar-mobile-open"
              : ""
          }`}
        >
          <div className="sidebar-brand">
            <h1>
              Taskbar
            </h1>

            <span>
              Personal Dashboard
            </span>
          </div>

          <nav className="sidebar-nav">
            {navigation.map(
              (item) => {
                if (
                  item.type ===
                  "single"
                ) {
                  const Icon =
                    item.icon;

                  return (
                    <NavLink
                      key={
                        item.path
                      }
                      to={
                        item.path
                      }
                      end={
                        item.path ===
                        "/"
                      }
                      className={({
                        isActive,
                      }) =>
                        `sidebar-link ${
                          isActive
                            ? "active"
                            : ""
                        }`
                      }
                      onClick={
                        closeSidebar
                      }
                    >
                      <Icon
                        size={19}
                      />

                      <span>
                        {
                          item.label
                        }
                      </span>
                    </NavLink>
                  );
                }

                return (
                  <SidebarGroup
                    key={item.id}
                    group={item}
                    isOpen={
                      openGroups[
                        item.id
                      ]
                    }
                    onToggle={
                      toggleGroup
                    }
                    onNavigate={
                      closeSidebar
                    }
                  />
                );
              }
            )}
          </nav>
        </aside>

        {/* =================================================
            MAIN CONTENT
        ================================================= */}

        <main
          className={`main-content ${
            isProfilePage
              ? "profile-main-content"
              : "normal-main-content"
          }`}
        >
          <Routes>
            {/* HOME */}

            <Route
              path="/"
              element={
                <Home />
              }
            />

            {/* STUDY */}

            <Route
              path="/learning"
              element={
                <Learning />
              }
            />

            <Route
              path="/timetable"
              element={
                <Timetable />
              }
            />

            <Route
              path="/assessments"
              element={
                <Assessments />
              }
            />

            <Route
              path="/study-sessions"
              element={
                <StudySessions />
              }
            />

            {/* PRODUCTIVITY */}

            <Route
              path="/todo-list"
              element={
                <TodoList />
              }
            />

            <Route
              path="/goals"
              element={
                <Goals />
              }
            />

            <Route
              path="/quick-notes"
              element={
                <QuickNotes />
              }
            />

            <Route
              path="/reminders"
              element={
                <Reminders />
              }
            />

            {/* Existing Quick Tasks page
                remains available by URL for now */}

            <Route
              path="/quick-tasks"
              element={
                <QuickTasks />
              }
            />

            {/* Existing Daily Targets page
                remains available by URL for now */}

            <Route
              path="/daily-targets"
              element={
                <DailyTargets />
              }
            />

            {/* WELLNESS */}

            <Route
              path="/water"
              element={
                <Water />
              }
            />

            <Route
              path="/activities"
              element={
                <Activities />
              }
            />

            {/* CALENDAR */}

            <Route
              path="/calendar"
              element={
                <CalendarView />
              }
            />

            {/* INSIGHTS */}

            <Route
              path="/insights"
              element={
                <Reports />
              }
            />

            {/* Keep existing Reports route available */}

            <Route
              path="/reports"
              element={
                <Reports />
              }
            />

            <Route
              path="/daily-review"
              element={
                <DailyReviewRoute />
              }
            />

            <Route
              path="/weekly-review"
              element={
                <WeeklyReview />
              }
            />

            {/* PROFILE */}

            <Route
              path="/profile"
              element={
                <Profile />
              }
            />

            {/* SETTINGS */}

            <Route
              path="/settings"
              element={
                <Settings />
              }
            />

            {/* CAREER */}

            <Route
              path="/career"
              element={
                <Navigate
                  to="/job-preparation"
                  replace
                />
              }
            />

            <Route
              path="/job-preparation"
              element={
                <JobPreparation />
              }
            />

            <Route
              path="/applications"
              element={
                <Applications />
              }
            />

            <Route
              path="/saved-jobs"
              element={
                <SavedJobs />
              }
            />

            <Route
              path="/resumes"
              element={
                <Resumes />
              }
            />

            <Route
              path="/interviews"
              element={
                <Interviews />
              }
            />

            <Route
              path="/projects"
              element={
                <Projects />
              }
            />

            {/* FINANCE */}

            <Route
              path="/finance"
              element={
                <Navigate
                  to="/income"
                  replace
                />
              }
            />

            <Route
              path="/income"
              element={
                <Income />
              }
            />

            <Route
              path="/expenses"
              element={
                <Expenses />
              }
            />

            <Route
              path="/budget"
              element={
                <Budget />
              }
            />
          </Routes>
        </main>
      </div>

      {/* =================================================
          MOBILE BOTTOM NAVIGATION
      ================================================= */}

      <MobileBottomNavigation
        onMore={toggleMobileMore}
        moreOpen={mobileMoreOpen}
        onAdd={() => setAddMenuOpen((previous) => !previous)}
        addOpen={addMenuOpen}
      />
    </>
  );
}
/* =========================================================
   PIN GATE
   ========================================================= */

function PinGate() {
  const { user } = useAuth();
  const [pinState, setPinState] = useState("checking");

  useEffect(() => {
    let cancelled = false;

    const checkPin = async () => {
      if (!user) {
        return;
      }

      setPinState("checking");

      try {
        const pinStatus = await getPinStatus();

        if (cancelled) {
          return;
        }

        if (!pinStatus.exists) {
          setPinState("setup");
        } else if (!pinStatus.enabled) {
          setPinState("unlocked");
        } else {
          setPinState("locked");
        }
      } catch (error) {
        console.error("PIN status check failed:", error);

        if (!cancelled) {
          setPinState("setup");
        }
      }
    };

    checkPin();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (pinState === "checking") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0f0f",
          color: "#fff",
          fontSize: "18px",
        }}
      >
        Loading Taskbar...
      </div>
    );
  }

  if (pinState === "setup") {
    return (
      <PinSetup
        onComplete={() => {
          setPinState("unlocked");
        }}
      />
    );
  }

  if (pinState === "locked") {
    return (
      <PinLock
        onSuccess={() => {
          setPinState("unlocked");
        }}
        onForgotPin={() => {
          setPinState("forgot");
        }}
      />
    );
  }

  if (pinState === "forgot") {
    return (
      <ForgotPin
        onBack={() => {
          setPinState("locked");
        }}
        onComplete={() => {
          setPinState("locked");
        }}
      />
    );
  }

  return (
    <>
      <FirestoreTest />
      <DailyReportManager />
      <SmartNotificationManager />
      <AppLayout />
    </>
  );
}

/* =========================================================
   PROTECTED APP
   ========================================================= */

function ProtectedApp() {
  const {
    user,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0f0f",
          color: "#fff",
          fontSize: "18px",
        }}
      >
        Loading Taskbar...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <PinGate />;
}

/* =========================================================
   MAIN APP
   ========================================================= */

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/*"
            element={<ProtectedApp />}
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
