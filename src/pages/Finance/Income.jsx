import React, { useEffect, useMemo, useState } from "react";
import {
  getIncome,
} from "../../utils/db";
import {
  getItemsFromFirestore,
  saveItemsToFirestore,
  deleteItemFromFirestore,
} from "../../firebase/firestore";
import {
  Wallet,
  Plus,
  Edit3,
  Trash2,
  X,
  Save,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  IndianRupee,
  FileText,
} from "lucide-react";

const INCOME_COLLECTION = "income";
const EXPENSE_COLLECTION = "expenses";
const FINANCE_EVENT = "taskbar-finance-updated";

function notifyFinanceUpdated() {
  window.dispatchEvent(new Event(FINANCE_EVENT));
}

const emptyForm = {
  source: "",
  amount: "",
  date: new Date().toISOString().split("T")[0],
  category: "Salary",
  notes: "",
};

const categories = [
  "Salary",
  "Freelance",
  "Business",
  "Investment",
  "Gift",
  "Other",
];

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date) {
  if (!date) return "-";

  return new Date(`${date}T00:00:00`).toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function createId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export default function Income() {
  const [incomeList, setIncomeList] = useState([]);
  const [expenseList, setExpenseList] = useState([]);

  const [form, setForm] = useState(emptyForm);

  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(true);

  /*
   * =========================================================
   * LOAD FINANCE DATA FROM FIREBASE
   * =========================================================
   */

  async function loadFinanceData() {
    try {
      setLoading(true);

      const [storedIncome, storedExpenses] =
        await Promise.all([
          getIncome(),
          getItemsFromFirestore(EXPENSE_COLLECTION),
        ]);

      setIncomeList(
        Array.isArray(storedIncome)
          ? storedIncome
          : []
      );

      setExpenseList(
        Array.isArray(storedExpenses)
          ? storedExpenses
          : []
      );
    } catch (error) {
      console.error(
        "Failed to load finance data:",
        error
      );

      setIncomeList([]);
      setExpenseList([]);
    } finally {
      setLoading(false);
    }
  }

  /*
   * =========================================================
   * FINANCE SYNC EVENT
   * =========================================================
   */

  useEffect(() => {
    loadFinanceData();

    const handleFinanceUpdate = () => {
      loadFinanceData();
    };

    window.addEventListener(
      FINANCE_EVENT,
      handleFinanceUpdate
    );

    return () => {
      window.removeEventListener(
        FINANCE_EVENT,
        handleFinanceUpdate
      );
    };
  }, []);

  /*
   * =========================================================
   * SAVE INCOME TO FIREBASE
   * =========================================================
   */

  async function persistIncome(nextList) {
    await saveItemsToFirestore(
      INCOME_COLLECTION,
      nextList
    );

    setIncomeList(nextList);

    notifyFinanceUpdated();
  }

  /*
   * =========================================================
   * TOTAL INCOME
   * =========================================================
   */

  const totalIncome = useMemo(() => {
    return incomeList.reduce(
      (total, item) =>
        total + Number(item.amount || 0),
      0
    );
  }, [incomeList]);

  /*
   * =========================================================
   * SELECTED MONTH
   * =========================================================
   */

  const getMonthStart = (date) =>
    new Date(date.getFullYear(), date.getMonth(), 1);

  const [selectedMonth, setSelectedMonth] = useState(() =>
    getMonthStart(new Date())
  );

  function changeMonth(offset) {
    setSelectedMonth(
      (previous) =>
        new Date(
          previous.getFullYear(),
          previous.getMonth() + offset,
          1
        )
    );
  }

  function goToCurrentMonth() {
    setSelectedMonth(getMonthStart(new Date()));
  }

  const selectedMonthLabel = useMemo(() => {
    return selectedMonth.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  }, [selectedMonth]);

  const isCurrentMonth =
    selectedMonth.getMonth() === new Date().getMonth() &&
    selectedMonth.getFullYear() === new Date().getFullYear();

  /*
   * =========================================================
   * SELECTED MONTH INCOME
   * =========================================================
   */

  const selectedMonthIncomeList = useMemo(() => {
    return incomeList.filter((item) => {
      if (!item.date) return false;

      const date = new Date(`${item.date}T00:00:00`);

      return (
        date.getMonth() === selectedMonth.getMonth() &&
        date.getFullYear() === selectedMonth.getFullYear()
      );
    });
  }, [incomeList, selectedMonth]);

  const selectedMonthIncome = useMemo(() => {
    return selectedMonthIncomeList.reduce(
      (total, item) => total + Number(item.amount || 0),
      0
    );
  }, [selectedMonthIncomeList]);

  /*
   * =========================================================
   * SELECTED MONTH EXPENSES
   * =========================================================
   */

  const selectedMonthExpenses = useMemo(() => {
    return expenseList
      .filter((item) => {
        if (!item.date) return false;

        const date = new Date(`${item.date}T00:00:00`);

        return (
          date.getMonth() === selectedMonth.getMonth() &&
          date.getFullYear() === selectedMonth.getFullYear()
        );
      })
      .reduce(
        (total, item) =>
          total + Number(item.amount || 0),
        0
      );
  }, [expenseList, selectedMonth]);

  /*
   * =========================================================
   * SELECTED MONTH BALANCE
   * =========================================================
   */

  const selectedMonthBalance =
    selectedMonthIncome -
    selectedMonthExpenses;

  /*
   * =========================================================
   * SAVINGS RATE
   * =========================================================
   */

  const savingsRate =
    selectedMonthIncome > 0
      ? Math.max(
          (selectedMonthBalance /
            selectedMonthIncome) *
            100,
          0
        )
      : 0;

  /*
   * =========================================================
   * ANNUAL INCOME
   * =========================================================
   */

  const selectedYear = selectedMonth.getFullYear();

  const annualIncome = useMemo(() => {
    return incomeList
      .filter((item) => {
        if (!item.date) return false;

        return (
          new Date(`${item.date}T00:00:00`).getFullYear() ===
          selectedYear
        );
      })
      .reduce(
        (total, item) =>
          total + Number(item.amount || 0),
        0
      );
  }, [incomeList, selectedYear]);

  /*
   * =========================================================
   * INCOME COUNT
   * =========================================================
   */

  const incomeCount = incomeList.length;

  const selectedMonthIncomeCount =
    selectedMonthIncomeList.length;

  /*
   * =========================================================
   * SORT SELECTED MONTH INCOME
   * =========================================================
   */

  const sortedIncome = useMemo(() => {
    return [...selectedMonthIncomeList].sort((a, b) => {
      return (
        new Date(`${b.date}T00:00:00`) -
        new Date(`${a.date}T00:00:00`)
      );
    });
  }, [selectedMonthIncomeList]);

  /*
   * =========================================================
   * ADD FORM
   * =========================================================
   */

  function openAddForm() {
    setEditingId(null);

    setForm({
      ...emptyForm,
      date: new Date()
        .toISOString()
        .split("T")[0],
    });

    setShowForm(true);
  }

  /*
   * =========================================================
   * EDIT FORM
   * =========================================================
   */

  function openEditForm(item) {
    setEditingId(item.id);

    setForm({
      source: item.source || "",
      amount: item.amount || "",
      date:
        item.date ||
        new Date()
          .toISOString()
          .split("T")[0],
      category: item.category || "Salary",
      notes: item.notes || "",
    });

    setShowForm(true);
  }

  /*
   * =========================================================
   * CLOSE FORM
   * =========================================================
   */

  function closeForm() {
    setShowForm(false);

    setEditingId(null);

    setForm({
      ...emptyForm,
      date: new Date()
        .toISOString()
        .split("T")[0],
    });
  }

  /*
   * =========================================================
   * FORM CHANGE
   * =========================================================
   */

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  /*
   * =========================================================
   * SUBMIT INCOME
   * =========================================================
   */

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.source.trim()) {
      alert("Please enter income source.");
      return;
    }

    if (
      !form.amount ||
      Number(form.amount) <= 0
    ) {
      alert("Please enter a valid amount.");
      return;
    }

    if (!form.date) {
      alert("Please select a date.");
      return;
    }

    /*
     * UPDATE
     */

    if (editingId) {
      const existingIncome = incomeList.find(
        (item) => item.id === editingId
      );

      if (!existingIncome) {
        return;
      }

      const updatedIncome = {
        ...existingIncome,
        source: form.source.trim(),
        amount: Number(form.amount),
        date: form.date,
        category: form.category,
        notes: form.notes.trim(),
        updatedAt: new Date().toISOString(),
      };

      const nextList = incomeList.map(
        (item) =>
          item.id === editingId
            ? updatedIncome
            : item
      );

      try {
        await persistIncome(nextList);

        closeForm();
      } catch (error) {
        console.error(
          "Failed to update income:",
          error
        );

        alert(
          "Income could not be updated. Please try again."
        );
      }

      return;
    }

    /*
     * ADD
     */

    const newIncome = {
      id: createId(),
      source: form.source.trim(),
      amount: Number(form.amount),
      date: form.date,
      category: form.category,
      notes: form.notes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextList = [
      newIncome,
      ...incomeList,
    ];

    try {
      await persistIncome(nextList);

      closeForm();
    } catch (error) {
      console.error(
        "Failed to save income:",
        error
      );

      alert(
        "Income could not be saved. Please try again."
      );
    }
  }

  /*
   * =========================================================
   * DELETE INCOME
   * =========================================================
   */

  async function deleteIncome(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this income?"
    );

    if (!confirmed) return;

    try {
      await deleteItemFromFirestore(
        INCOME_COLLECTION,
        id
      );

      const nextList = incomeList.filter(
        (item) => item.id !== id
      );

      setIncomeList(nextList);

      notifyFinanceUpdated();
    } catch (error) {
      console.error(
        "Failed to delete income:",
        error
      );

      alert(
        "Income could not be deleted. Please try again."
      );
    }
  }

  return (
    <div className="finance-page page-container">
      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="page-header">
        <div className="page-header-left">
          <div className="page-header-icon">
            <Wallet size={23} />
          </div>

          <div>
            <h1 className="page-title">
              Income
            </h1>

            <p className="page-subtitle">
              Track your income and earnings.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="primary-button primary-btn"
          onClick={openAddForm}
        >
          <Plus size={18} />
          Add Income
        </button>
      </div>

      {/* =====================================================
          SUMMARY CARDS
          ===================================================== */}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <TrendingUp size={22} />
          </div>

          <div>
            <span className="stat-label">
              {selectedMonthLabel}
            </span>

            <strong className="stat-value">
              {formatCurrency(selectedMonthIncome)}
            </strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <IndianRupee size={22} />
          </div>

          <div>
            <span className="stat-label">
              Annual Income
            </span>

            <strong className="stat-value">
              {formatCurrency(annualIncome)}
            </strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <CalendarDays size={22} />
          </div>

          <div>
            <span className="stat-label">
              Month Entries
            </span>

            <strong className="stat-value">
              {selectedMonthIncomeCount}
            </strong>
          </div>
        </div>
      </div>

      {/* =====================================================
          MONTH NAVIGATION
          ===================================================== */}

      <div className="content-card finance-card">
        <div
          className="section-header"
          style={{
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 className="section-title">
              {selectedMonthLabel}
            </h2>

            <p className="section-description">
              View income recorded for this month only.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginLeft: "auto",
            }}
          >
            <button
              type="button"
              className="secondary-button secondary-btn"
              onClick={() => changeMonth(-1)}
              aria-label="Previous month"
            >
              ‹
            </button>

            <button
              type="button"
              className="secondary-button secondary-btn"
              onClick={goToCurrentMonth}
              disabled={isCurrentMonth}
            >
              Current Month
            </button>

            <button
              type="button"
              className="secondary-button secondary-btn"
              onClick={() => changeMonth(1)}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================
          MONTHLY MONEY FLOW
          ===================================================== */}

      <div className="content-card finance-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">
              Monthly Money Flow
            </h2>

            <p className="section-description">
              Income is automatically compared
              with your expenses.
            </p>
          </div>
        </div>

        <div className="money-flow">
          <div className="flow-box flow-income">
            <span className="flow-label">
              Selected Month Income
            </span>

            <div className="flow-value">
              {formatCurrency(
                selectedMonthIncome
              )}
            </div>
          </div>

          <div className="flow-box flow-expense">
            <span className="flow-label">
              Selected Month Expenses
            </span>

            <div className="flow-value">
              {formatCurrency(
                selectedMonthExpenses
              )}
            </div>
          </div>

          <div className="flow-box flow-balance">
            <span className="flow-label">
              Remaining Balance
            </span>

            <div
              className={`flow-value ${
                selectedMonthBalance < 0
                  ? "negative-value"
                  : "positive-value"
              }`}
            >
              {formatCurrency(
                selectedMonthBalance
              )}
            </div>
          </div>
        </div>

        {/* =================================================
            SAVINGS PROGRESS
            ================================================= */}

        <div className="progress-section">
          <div className="progress-header">
            <span className="progress-label">
              Savings Rate
            </span>

            <span className="progress-value">
              {selectedMonthIncome > 0
                ? `${savingsRate.toFixed(1)}%`
                : "0%"}
            </span>
          </div>

          <div className="progress-track">
            <div
              className="finance-progress-fill"
              style={{
                width: `${Math.min(
                  Math.max(
                    savingsRate,
                    0
                  ),
                  100
                )}%`,
              }}
            />
          </div>
        </div>

        {selectedMonthBalance < 0 && (
          <div className="finance-alert">
            <div className="finance-alert-icon">
              <TrendingDown size={20} />
            </div>

            <div>
              <div className="finance-alert-title">
                Expenses are higher than income
              </div>

              <div className="finance-alert-text">
                Your current month expenses are
                greater than your income. Review
                your Expenses and Budget pages.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================
          INCOME HISTORY
          ===================================================== */}

      <div className="content-card list-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">
              Income History — {selectedMonthLabel}
            </h2>

            <p className="section-description">
              Your recorded income entries.
            </p>
          </div>

          <span className="list-count">
            {incomeCount}{" "}
            {incomeCount === 1
              ? "entry"
              : "entries"}
          </span>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Wallet size={25} />
            </div>

            <h3 className="empty-state-title">
              Loading income
            </h3>

            <p className="empty-state-text">
              Loading your income data from Firebase.
            </p>
          </div>
        ) : sortedIncome.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Wallet size={25} />
            </div>

            <h3 className="empty-state-title">
              No income recorded
            </h3>

            <p className="empty-state-text">
              Add your first income entry to start
              tracking.
            </p>

            <button
              type="button"
              className="primary-button primary-btn"
              onClick={openAddForm}
            >
              <Plus size={18} />
              Add Income
            </button>
          </div>
        ) : (
          <div className="finance-list income-list">
            {sortedIncome.map((item) => (
              <div
                className="finance-list-item income-item"
                key={item.id}
              >
                <div className="item-left income-main">
                  <div className="item-icon income-icon">
                    <TrendingUp size={20} />
                  </div>

                  <div className="item-info">
                    <h3 className="item-title">
                      {item.source}
                    </h3>

                    <div className="item-meta income-meta">
                      <span className="category-badge">
                        {item.category}
                      </span>

                      <span>•</span>

                      <span>
                        {formatDate(item.date)}
                      </span>
                    </div>

                    {item.notes && (
                      <p className="income-notes">
                        <FileText size={14} />
                        {item.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="item-right income-right">
                  <strong className="item-amount">
                    {formatCurrency(
                      item.amount
                    )}
                  </strong>

                  <div className="income-actions">
                    <button
                      type="button"
                      className="edit-btn"
                      title="Edit"
                      onClick={() =>
                        openEditForm(item)
                      }
                    >
                      <Edit3 size={17} />
                    </button>

                    <button
                      type="button"
                      className="delete-btn"
                      title="Delete"
                      onClick={() =>
                        deleteIncome(item.id)
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =====================================================
          ADD / EDIT MODAL
          ===================================================== */}

      {showForm && (
        <div
          className="modal-overlay finance-modal-overlay"
          onMouseDown={closeForm}
        >
          <div
            className="modal-card finance-modal"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div
              className="modal-header"
            >
              <div style={{ minWidth: 0 }}>
                <h2 className="modal-title">
                  {editingId
                    ? "Edit Income"
                    : "Add Income"}
                </h2>

                <p className="section-description">
                  {editingId
                    ? "Update this income entry."
                    : "Record a new income entry."}
                </p>
              </div>

              <button
                type="button"
                className="icon-button close-btn"
                onClick={closeForm}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">
                  Income Source
                </label>

                <input
                  type="text"
                  name="source"
                  value={form.source}
                  onChange={handleChange}
                  placeholder="Example: Salary"
                  autoFocus
                />
              </div>

              <div className="form-row form-grid">
                <div className="form-group">
                  <label className="form-label">
                    <IndianRupee size={16} />
                    Amount
                  </label>

                  <input
                    type="number"
                    name="amount"
                    value={form.amount}
                    onChange={handleChange}
                    placeholder="50000"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <CalendarDays size={16} />
                    Date
                  </label>

                  <input
                    type="date"
                    name="date"
                    value={form.date}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Category
                </label>

                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                >
                  {categories.map(
                    (category) => (
                      <option
                        key={category}
                        value={category}
                      >
                        {category}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  <FileText size={16} />
                  Notes
                </label>

                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Optional notes..."
                  rows="4"
                />
              </div>

              <div className="modal-actions button-row">
                <button
                  type="button"
                  className="secondary-button secondary-btn"
                  onClick={closeForm}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button primary-btn save-btn"
                >
                  <Save size={18} />

                  {editingId
                    ? "Update Income"
                    : "Save Income"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}