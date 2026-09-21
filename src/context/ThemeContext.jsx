import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

const ThemeContext = createContext(null);

const PAGE_BACKGROUND_KEY =
  "taskbar-custom-page-background";

const THEME_KEY =
  "taskbar-theme";

const DEFAULT_THEME = "default";

/*
=========================================================
TASKBAR THEME OPTIONS
=========================================================

default       → Red + Black
blue-cyan     → Blue + Cyan
purple-pink   → Purple + Pink
green-teal    → Green + Teal
orange-gold   → Orange + Gold
red-violet    → Red + Violet
cyan-purple   → Cyan + Purple
*/

export const TASKBAR_THEMES = [
  {
    id: "default",
    name: "Red + Black",
    description: "TASKBAR default theme",
    colors: ["#050505", "#8b0000"],
  },
  {
    id: "blue-cyan",
    name: "Blue + Cyan",
    description: "Blue and cyan gradient",
    colors: ["#0066ff", "#00e5ff"],
  },
  {
    id: "purple-pink",
    name: "Purple + Pink",
    description: "Purple and pink gradient",
    colors: ["#6a00ff", "#ff1493"],
  },
  {
    id: "green-teal",
    name: "Green + Teal",
    description: "Green and teal gradient",
    colors: ["#00a86b", "#00c9a7"],
  },
  {
    id: "orange-gold",
    name: "Orange + Gold",
    description: "Orange and gold gradient",
    colors: ["#ff6600", "#ffd700"],
  },
  {
    id: "red-violet",
    name: "Red + Violet",
    description: "Red and violet gradient",
    colors: ["#ff0000", "#8a2be2"],
  },
  {
    id: "cyan-purple",
    name: "Cyan + Purple",
    description: "Cyan and purple gradient",
    colors: ["#00ffff", "#8000ff"],
  },
];

function getStoredBackground() {
  try {
    return (
      localStorage.getItem(PAGE_BACKGROUND_KEY) ||
      ""
    );
  } catch (error) {
    console.error(
      "Failed to read TASKBAR background:",
      error
    );

    return "";
  }
}

function getStoredTheme() {
  try {
    const storedTheme =
      localStorage.getItem(THEME_KEY);

    const isValidTheme =
      TASKBAR_THEMES.some(
        (item) => item.id === storedTheme
      );

    return isValidTheme
      ? storedTheme
      : DEFAULT_THEME;
  } catch (error) {
    console.error(
      "Failed to read TASKBAR theme:",
      error
    );

    return DEFAULT_THEME;
  }
}

export function ThemeProvider({ children }) {
  const [customBackground, setCustomBackgroundState] =
    useState(getStoredBackground);

  const [theme, setThemeState] =
    useState(getStoredTheme);

  /*
  ========================================================
  LOAD BACKGROUND + THEME CHANGES
  ========================================================
  */

  useEffect(() => {
    function loadBackground() {
      setCustomBackgroundState(
        getStoredBackground()
      );
    }

    function loadTheme() {
      setThemeState(
        getStoredTheme()
      );
    }

    window.addEventListener(
      "taskbar-background-changed",
      loadBackground
    );

    window.addEventListener(
      "taskbar-theme-changed",
      loadTheme
    );

    window.addEventListener(
      "storage",
      loadBackground
    );

    window.addEventListener(
      "storage",
      loadTheme
    );

    return () => {
      window.removeEventListener(
        "taskbar-background-changed",
        loadBackground
      );

      window.removeEventListener(
        "taskbar-theme-changed",
        loadTheme
      );

      window.removeEventListener(
        "storage",
        loadBackground
      );

      window.removeEventListener(
        "storage",
        loadTheme
      );
    };
  }, []);

  /*
  ========================================================
  APPLY THEME + BACKGROUND
  ========================================================
  */

  useEffect(() => {
    const root =
      document.documentElement;

    root.setAttribute(
      "data-taskbar-theme",
      theme
    );

    if (customBackground) {
      root.style.setProperty(
        "--taskbar-custom-background",
        `url("${customBackground}")`
      );

      root.classList.add(
        "taskbar-custom-background"
      );
    } else {
      root.style.removeProperty(
        "--taskbar-custom-background"
      );

      root.classList.remove(
        "taskbar-custom-background"
      );
    }

    return () => {
      root.style.removeProperty(
        "--taskbar-custom-background"
      );

      root.classList.remove(
        "taskbar-custom-background"
      );
    };
  }, [theme, customBackground]);

  /*
  ========================================================
  SET THEME
  ========================================================
  */

  function setTheme(newTheme) {
    const isValidTheme =
      TASKBAR_THEMES.some(
        (item) => item.id === newTheme
      );

    if (!isValidTheme) {
      console.warn(
        `Invalid TASKBAR theme: ${newTheme}`
      );

      return;
    }

    try {
      localStorage.setItem(
        THEME_KEY,
        newTheme
      );

      setThemeState(newTheme);

      window.dispatchEvent(
        new Event(
          "taskbar-theme-changed"
        )
      );
    } catch (error) {
      console.error(
        "Failed to save TASKBAR theme:",
        error
      );
    }
  }

  /*
  ========================================================
  SET CUSTOM IMAGE BACKGROUND
  ========================================================
  */

  function setCustomBackground(imageData) {
    if (!imageData) {
      return;
    }

    try {
      localStorage.setItem(
        PAGE_BACKGROUND_KEY,
        imageData
      );

      setCustomBackgroundState(
        imageData
      );

      window.dispatchEvent(
        new Event(
          "taskbar-background-changed"
        )
      );
    } catch (error) {
      console.error(
        "Failed to save TASKBAR background:",
        error
      );
    }
  }

  /*
  ========================================================
  REMOVE CUSTOM IMAGE BACKGROUND
  ========================================================
  */

  function removeCustomBackground() {
    try {
      localStorage.removeItem(
        PAGE_BACKGROUND_KEY
      );

      setCustomBackgroundState("");

      window.dispatchEvent(
        new Event(
          "taskbar-background-changed"
        )
      );
    } catch (error) {
      console.error(
        "Failed to remove TASKBAR background:",
        error
      );
    }
  }

  /*
  ========================================================
  RESTORE DEFAULT BACKGROUND + THEME
  ========================================================
  */

  function restoreDefaultBackground() {
    removeCustomBackground();

    setTheme(
      DEFAULT_THEME
    );
  }

  /*
  ========================================================
  CONTEXT
  ========================================================
  */

  return (
    <ThemeContext.Provider
      value={{
        theme,

        setTheme,

        themes:
          TASKBAR_THEMES,

        customBackground,

        setCustomBackground,

        removeCustomBackground,

        restoreDefaultBackground,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context =
    useContext(ThemeContext);

  if (!context) {
    throw new Error(
      "useTheme must be used inside ThemeProvider."
    );
  }

  return context;
}

export default ThemeContext;