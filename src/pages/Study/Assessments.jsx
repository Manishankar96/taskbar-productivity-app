import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Plus, Pencil, Trash2, X } from "lucide-react";
import { getAssessments, saveAssessments } from "../../utils/db";
import {
  calculateDaysRemaining,
  formatDaysRemaining,
} from "../../utils/calculations";
import Modal from "../../components/common/Modal";

const TYPES = [
  "Coding Assessment",
  "Interview",
  "Assignment",
  "Online Test",
  "Project Submission",
];

const HISTORY_CATEGORY = "Assessments";
const COMPLETED_TO_HISTORY_DAYS = 2;
const COMPLETED_TO_HISTORY_MS =
  COMPLETED_TO_HISTORY_DAYS * 24 * 60 * 60 * 1000;

function isHistoryEligible(assessment, now = Date.now()) {
  if (assessment?.status !== "completed") {
    return false;
  }

  const completedAt = assessment.completedAt
    ? new Date(assessment.completedAt).getTime()
    : NaN;

  return (
    Number.isFinite(completedAt) &&
    now - completedAt >= COMPLETED_TO_HISTORY_MS
  );
}

function isCompletedVisible(assessment, now = Date.now()) {
  if (assessment?.status !== "completed") {
    return true;
  }

  return !isHistoryEligible(assessment, now);
}

const emptyForm = {
  title: "",
  type: "Coding Assessment",
  date: "",
  status: "upcoming",
  notes: "",
};

function Assessments() {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    async function load() {
      try {
        const saved = await getAssessments();
        const list = Array.isArray(saved) ? saved : [];

        // Do NOT create a new completedAt timestamp while loading.
        // completedAt must represent the real moment the assessment
        // was changed to "completed". Creating it here would reset
        // the 48-hour History timer every time data is loaded.
        const normalized = list.map((assessment) => {
          if (assessment?.status !== "completed") {
            return assessment;
          }

          return {
            ...assessment,
            historyCategory:
              assessment.historyCategory || HISTORY_CATEGORY,
            completedAt: assessment.completedAt || null,
          };
        });

        // Only save the history category during normalization.
        // Never invent a completion timestamp for old records.
        const needsMigration = normalized.some(
          (assessment, index) =>
            assessment?.status === "completed" &&
            !list[index]?.historyCategory
        );

        if (needsMigration) {
          await saveAssessments(normalized);
        }

        setAssessments(normalized);
      } catch (error) {
        console.error("Failed to load assessments:", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  async function persist(updated) {
    setAssessments(updated);

    try {
      await saveAssessments(updated);
    } catch (error) {
      console.error("Failed to save assessments:", error);
    }
  }

  const activeAssessments = useMemo(
    () =>
      assessments.filter((assessment) =>
        isCompletedVisible(assessment, now)
      ),
    [assessments, now]
  );

  const stats = useMemo(() => {
    const upcoming = activeAssessments.filter(
      (a) => a.status === "upcoming"
    ).length;

    const missed = activeAssessments.filter(
      (a) => a.status === "missed"
    ).length;

    return {
      total: activeAssessments.length,
      upcoming,
      missed,
    };
  }, [activeAssessments]);

  const sorted = [...activeAssessments].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
  );

  function openAddForm() {
    setEditingItem(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEditForm(item) {
    setEditingItem(item);

    setForm({
      title: item.title,
      type: item.type,
      date: item.date,
      status: item.status,
      notes: item.notes || "",
    });

    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingItem(null);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.title.trim() || !form.date) {
      return;
    }

    if (editingItem) {
      const updatedAssessments = assessments.map((assessment) => {
        if (assessment.id !== editingItem.id) {
          return assessment;
        }

        const updated = {
          ...assessment,
          ...form,
          title: form.title.trim(),
        };

        if (form.status === "completed") {
          updated.historyCategory = HISTORY_CATEGORY;
          updated.completedAt =
            assessment.completedAt || new Date().toISOString();
        } else {
          delete updated.historyCategory;
          delete updated.completedAt;
        }

        return updated;
      });

      persist(updatedAssessments);
    } else {
      const newAssessment = {
        id: Date.now(),
        ...form,
        title: form.title.trim(),
      };

      if (form.status === "completed") {
        newAssessment.historyCategory = HISTORY_CATEGORY;
        newAssessment.completedAt = new Date().toISOString();
      }

      persist([...assessments, newAssessment]);
    }

    closeForm();
  }

  function deleteItem(item) {
    const confirmed = window.confirm(`Delete "${item.title}"?`);

    if (!confirmed) {
      return;
    }

    persist(
      assessments.filter(
        (assessment) => assessment.id !== item.id
      )
    );
  }

  function setStatus(id, status) {
    const updatedAssessments = assessments.map((assessment) => {
      if (assessment.id !== id) {
        return assessment;
      }

      const updated = {
        ...assessment,
        status,
      };

      if (status === "completed") {
        updated.historyCategory = HISTORY_CATEGORY;
        updated.completedAt =
          assessment.completedAt || new Date().toISOString();
      } else {
        delete updated.historyCategory;
        delete updated.completedAt;
      }

      return updated;
    });

    persist(updatedAssessments);
  }

  if (loading) {
    return (
      <div className="module-page">
        <h1>📝 Assessments</h1>
        <p>Loading assessments...</p>
      </div>
    );
  }

  return (
    <div className="module-page">
      <div className="page-header">
        <div>
          <h1>📝 Assessments</h1>
          <p>
            Track interviews, tests, and submissions with real deadlines.
          </p>
        </div>

        <button
          className="add-topic-button"
          onClick={openAddForm}
        >
          <Plus size={18} />
          Add Assessment
        </button>
      </div>

      <section className="stat-grid">
        <div className="stat-card">
          <ClipboardCheck size={25} />
          <span>Total</span>
          <strong>{stats.total}</strong>
        </div>

        <div className="stat-card">
          <span>Upcoming</span>
          <strong>{stats.upcoming}</strong>
        </div>

        <div className="stat-card">
          <span>Missed</span>
          <strong>{stats.missed}</strong>
        </div>
      </section>

      {showForm && (
        <Modal
          isOpen={showForm}
          onClose={closeForm}
          showCloseButton={false}
          className="assessments-form-modal"
        >
          <section className="module-form-card">
            <div className="add-topic-header">
              <h2>
                {editingItem
                  ? "Edit Assessment"
                  : "Add Assessment"}
              </h2>

              <button
                type="button"
                className="close-button"
                onClick={closeForm}
              >
                <X size={20} />
              </button>
            </div>

            <form
              className="grid-form"
              onSubmit={handleSubmit}
            >
              <div className="form-group">
                <label>Title</label>

                <input
                  type="text"
                  placeholder="Example: Backend Round 2"
                  value={form.title}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      title: e.target.value,
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label>Type</label>

                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      type: e.target.value,
                    })
                  }
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Date</label>

                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      date: e.target.value,
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label>Status</label>

                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value,
                    })
                  }
                >
                  <option value="upcoming">
                    Upcoming
                  </option>

                  <option value="completed">
                    Completed
                  </option>

                  <option value="missed">
                    Missed
                  </option>
                </select>
              </div>

              <div className="form-group">
                <label>Notes (optional)</label>

                <input
                  type="text"
                  placeholder="Prep links, contacts, etc."
                  value={form.notes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notes: e.target.value,
                    })
                  }
                />
              </div>

              <button
                type="submit"
                className="save-topic-button"
              >
                {editingItem
                  ? "Save Changes"
                  : "Add Assessment"}
              </button>
            </form>
          </section>
        </Modal>
      )}

      <section className="learning-section">
        <div className="topic-header">
          <div>
            <h2>All Assessments</h2>
            <p>Sorted by date.</p>
          </div>
        </div>

        <div className="topic-list">
          {sorted.map((item) => {
            const days = calculateDaysRemaining(item.date);

            const historyEligibleAt =
              item.status === "completed" && item.completedAt
                ? new Date(
                    new Date(item.completedAt).getTime() +
                      COMPLETED_TO_HISTORY_MS
                  )
                : null;

            return (
              <div
                className="topic-row"
                key={item.id}
              >
                <div className="topic-information">
                  <strong>{item.title}</strong>

                  <span>
                    {item.type} •{" "}
                    {new Date(
                      `${item.date}T00:00:00`
                    ).toLocaleDateString("en-IN")}{" "}
                    •{" "}
                    {item.status === "upcoming"
                      ? formatDaysRemaining(days)
                      : item.status === "completed" && historyEligibleAt
                        ? `completed • History after ${historyEligibleAt.toLocaleDateString(
                            "en-IN"
                          )}`
                        : item.status}
                  </span>
                </div>

                <div className="topic-actions">
                  <select
                    value={item.status}
                    onChange={(e) =>
                      setStatus(
                        item.id,
                        e.target.value
                      )
                    }
                  >
                    <option value="upcoming">
                      Upcoming
                    </option>

                    <option value="completed">
                      Completed
                    </option>

                    <option value="missed">
                      Missed
                    </option>
                  </select>

                  <button
                    className="edit-button"
                    onClick={() =>
                      openEditForm(item)
                    }
                  >
                    <Pencil size={17} />
                  </button>

                  <button
                    className="delete-button"
                    onClick={() =>
                      deleteItem(item)
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            );
          })}

          {sorted.length === 0 && (
            <p className="empty-topics">
              No assessments added yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export default Assessments;