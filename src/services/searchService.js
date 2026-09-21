/**
 * TASKBAR - Global Search Service
 *
 * This service searches existing TASKBAR data.
 *
 * IMPORTANT:
 * - No new database is created.
 * - No Firebase data is changed.
 * - No existing collection names are changed.
 * - This file only receives data and returns matching results.
 */

/**
 * Convert any value into safe searchable text.
 */
function toSearchText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

/**
 * Get useful searchable fields from an item.
 */
function getItemText(item) {
  if (!item || typeof item !== "object") {
    return "";
  }

  const fields = [
    item.title,
    item.name,
    item.task,
    item.description,
    item.notes,
    item.note,
    item.topic,
    item.subject,
    item.goal,
    item.project,
    item.projectName,
    item.company,
    item.role,
    item.position,
    item.jobTitle,
    item.skill,
    item.category,
    item.cuisine,
    item.activity,
    item.type,
    item.source,
    item.status,
    item.location,
    item.email,
    item.url,
  ];

  return fields
    .map(toSearchText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Get a readable title for a result.
 */
function getResultTitle(item) {
  if (!item || typeof item !== "object") {
    return "Untitled";
  }

  return (
    toSearchText(item.title) ||
    toSearchText(item.name) ||
    toSearchText(item.task) ||
    toSearchText(item.topic) ||
    toSearchText(item.subject) ||
    toSearchText(item.goal) ||
    toSearchText(item.project) ||
    toSearchText(item.projectName) ||
    toSearchText(item.company) ||
    toSearchText(item.role) ||
    toSearchText(item.position) ||
    toSearchText(item.activity) ||
    "Untitled"
  );
}

/**
 * Calculate how relevant an item is to the search query.
 *
 * Higher score = stronger match.
 */
function calculateScore(item, query) {
  if (!item || !query) {
    return 0;
  }

  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) {
    return 0;
  }

  const title = getResultTitle(item).toLowerCase();
  const searchableText = getItemText(item);

  if (!searchableText.includes(normalizedQuery)) {
    return 0;
  }

  let score = 10;

  // Exact title match.
  if (title === normalizedQuery) {
    score += 100;
  }

  // Title starts with the query.
  if (title.startsWith(normalizedQuery)) {
    score += 50;
  }

  // Title contains the query.
  if (title.includes(normalizedQuery)) {
    score += 30;
  }

  // Exact word match.
  const words = searchableText.split(/\s+/);

  if (words.includes(normalizedQuery)) {
    score += 20;
  }

  // Shorter titles are slightly preferred when the match is otherwise equal.
  if (title.length > 0) {
    score += Math.max(0, 10 - Math.min(title.length, 10));
  }

  return score;
}

/**
 * Normalize one search source.
 *
 * Example:
 *
 * {
 *   source: "Tasks",
 *   items: todos
 * }
 */
function normalizeSource(source) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const name =
    toSearchText(source.name) ||
    toSearchText(source.source) ||
    "TASKBAR";

  const items = Array.isArray(source.items)
    ? source.items
    : [];

  return {
    name,
    items,
  };
}

/**
 * Search multiple TASKBAR data sources.
 *
 * @param {string} query
 * @param {Array} sources
 * @param {number} limit
 *
 * @returns {Array}
 *
 * Example:
 *
 * searchAll("java", [
 *   { name: "Tasks", items: todos },
 *   { name: "Goals", items: goals },
 *   { name: "Learning", items: topics }
 * ]);
 */
export function searchAll(query, sources = [], limit = 20) {
  const normalizedQuery = toSearchText(query).toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  if (!Array.isArray(sources)) {
    return [];
  }

  const safeLimit =
    Number.isFinite(Number(limit)) && Number(limit) > 0
      ? Math.floor(Number(limit))
      : 20;

  const results = [];

  sources.forEach((rawSource) => {
    const source = normalizeSource(rawSource);

    if (!source) {
      return;
    }

    source.items.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        return;
      }

      const score = calculateScore(item, normalizedQuery);

      if (score <= 0) {
        return;
      }

      results.push({
        id:
          item.id !== undefined && item.id !== null
            ? String(item.id)
            : `${source.name}-${index}`,

        title: getResultTitle(item),

        source: source.name,

        score,

        item,
      });
    });
  });

  return results
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (a.source !== b.source) {
        return a.source.localeCompare(b.source);
      }

      return a.title.localeCompare(b.title);
    })
    .slice(0, safeLimit);
}

/**
 * Search one TASKBAR data source.
 */
export function searchSource(query, items = [], sourceName = "TASKBAR", limit = 20) {
  return searchAll(
    query,
    [
      {
        name: sourceName,
        items,
      },
    ],
    limit
  );
}

/**
 * Search a single item.
 *
 * Useful when another component needs to check
 * whether a specific record matches the query.
 */
export function itemMatchesSearch(item, query) {
  const normalizedQuery = toSearchText(query).toLowerCase();

  if (!normalizedQuery) {
    return false;
  }

  return getItemText(item).includes(normalizedQuery);
}

/**
 * Get the searchable text for an item.
 *
 * Exported so UI components can optionally display
 * or reuse the same search logic.
 */
export function getSearchableText(item) {
  return getItemText(item);
}

/**
 * Default export.
 */
export default searchAll;
