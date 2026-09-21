import { useMemo } from "react";
import {
  Archive as ArchiveIcon,
  Clock3,
  Trash2,
} from "lucide-react";

import {
  ARCHIVE_RETENTION_DAYS,
  cleanupArchive,
  getArchiveAge,
  getArchiveDaysRemaining,
} from "../services/archiveService";

function getTitle(item) {
  return (
    item?.title ||
    item?.name ||
    item?.task ||
    item?.topic ||
    item?.subject ||
    "Archived item"
  );
}

function ArchiveCard({
  item,
  onDelete,
}) {
  const age = getArchiveAge(item);
  const remaining =
    getArchiveDaysRemaining(item);

  return (
    <div
      className="section-card"
      style={{
        padding: "18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: "17px",
            }}
          >
            {getTitle(item)}
          </h3>

          <div
            className="home-subtitle"
            style={{
              marginTop: "8px",
            }}
          >
            Archived {age} day
            {age === 1 ? "" : "s"} ago
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            onDelete?.(item)
          }
          title="Delete archive item"
          aria-label="Delete archive item"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          marginTop: "14px",
          fontSize: "13px",
        }}
      >
        <Clock3 size={15} />

        <span>
          {remaining > 0
            ? `${remaining} day${
                remaining === 1
                  ? ""
                  : "s"
              } remaining`
            : "Expires now"}
        </span>
      </div>
    </div>
  );
}

/**
 * Archive page.
 *
 * `items` must come from the existing TASKBAR
 * storage layer.
 *
 * `onDelete` is supplied by the parent so this
 * component never decides how persistent storage
 * works.
 */
function Archive({
  items = [],
  onDelete,
}) {
  const retainedItems = useMemo(
    () =>
      cleanupArchive(items),
    [items]
  );

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
          <ArchiveIcon size={26} />

          <h1 style={{ margin: 0 }}>
            Archive
          </h1>
        </div>

        <p
          className="home-subtitle"
          style={{ margin: 0 }}
        >
          Archived history is retained for{" "}
          {ARCHIVE_RETENTION_DAYS} days.
          Older archived records are removed
          during archive cleanup.
        </p>
      </div>

      {retainedItems.length === 0 ? (
        <div
          className="section-card"
          style={{
            padding: "32px",
            textAlign: "center",
          }}
        >
          <ArchiveIcon
            size={32}
            style={{
              marginBottom: "10px",
            }}
          />

          <h2
            style={{
              margin: "0 0 8px",
            }}
          >
            Archive is empty
          </h2>

          <p
            className="home-subtitle"
            style={{ margin: 0 }}
          >
            Archived items will appear here.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          {retainedItems.map(
            (item, index) => (
              <ArchiveCard
                key={
                  item?.id ??
                  `archive-${index}`
                }
                item={item}
                onDelete={onDelete}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

export default Archive;
