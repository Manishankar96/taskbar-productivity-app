import React, { useEffect, useMemo, useState } from "react";
import {
  WalletCards,
  Plus,
  Edit3,
  Trash2,
  X,
  Save,
  TrendingDown,
  TrendingUp,
  CalendarDays,
  IndianRupee,
  FileText,
} from "lucide-react";

import { getIncome } from "../../utils/db";
import {
  getItemsFromFirestore,
  saveItemsToFirestore,
  deleteItemFromFirestore,
} from "../../firebase/firestore";

const EXPENSE_COLLECTION = "expenses";
const FINANCE_EVENT = "taskbar-finance-updated";

const emptyForm = {
  name: "",
  amount: "",
  date: new Date().toISOString().split("T")[0],
  category: "Food",
  notes: "",
  investmentFrequency: "Monthly",
  recurringMonthly: false,
};

const categories = [
  "Food",
  "Travel",
  "Shopping",
  "Education",
  "Bills",
  "Health",
  "Entertainment",
  "Other",
  "Investment",
];

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date) {
  if (!date) return "-";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function Expenses() {
  const [expenseList, setExpenseList] = useState([]);
  const [incomeList, setIncomeList] = useState([]);

  const [form, setForm] = useState(emptyForm);

  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(true);

  // ONE shared month for the entire Expenses page.
  // Investment, income, expenses, overview, history and forms
  // all use this same selected month.
  const [selectedMonth, setSelectedMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );

  const selectedMonthKey = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = String(selectedMonth.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, [selectedMonth]);

  const selectedMonthLabel = useMemo(
    () =>
      selectedMonth.toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      }),
    [selectedMonth]
  );

  function shiftMonth(offset) {
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
    const now = new Date();
    setSelectedMonth(
      new Date(now.getFullYear(), now.getMonth(), 1)
    );
  }

  /* =========================================================
     LOAD FINANCE DATA FROM FIREBASE
     ========================================================= */

  async function loadFinanceData() {
    try {
      setLoading(true);

      const [expenses, income] = await Promise.all([
        getItemsFromFirestore(EXPENSE_COLLECTION),
        getIncome(),
      ]);

      setExpenseList(Array.isArray(expenses) ? expenses : []);
      setIncomeList(Array.isArray(income) ? income : []);
    } catch (error) {
      console.error("Failed to load finance data:", error);
      setExpenseList([]);
      setIncomeList([]);
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     SYNC FINANCE DATA
     ========================================================= */

  useEffect(() => {
    loadFinanceData();

    const handleFinanceUpdate = () => {
      loadFinanceData();
    };

    window.addEventListener(FINANCE_EVENT, handleFinanceUpdate);

    return () => {
      window.removeEventListener(FINANCE_EVENT, handleFinanceUpdate);
    };
  }, []);

  /* =========================================================
     SAVE EXPENSES TO FIREBASE
     ========================================================= */

  async function persistExpenses(nextList) {
    try {
      await saveItemsToFirestore(
        EXPENSE_COLLECTION,
        nextList
      );

      setExpenseList(nextList);

      window.dispatchEvent(new Event(FINANCE_EVENT));
    } catch (error) {
      console.error("Failed to save expenses:", error);

      alert("Failed to save expense. Please try again.");
    }
  }

  /* =========================================================
     TOTAL EXPENSES
     ========================================================= */

  const totalExpenses = useMemo(() => {
    return expenseList.reduce(
      (total, item) =>
        total + Number(item.amount || 0),
      0
    );
  }, [expenseList]);

  /* =========================================================
     CURRENT MONTH EXPENSES
     ========================================================= */

  const selectedMonthExpenses = useMemo(() => {
    return expenseList.filter((item) => {
      if (!item.date) return false;
      return String(item.date).startsWith(selectedMonthKey);
    });
  }, [expenseList, selectedMonthKey]);

  const selectedMonthExpenseTotal = useMemo(() => {
    return selectedMonthExpenses.reduce(
      (total, item) => total + Number(item.amount || 0),
      0
    );
  }, [selectedMonthExpenses]);

  const currentMonthExpenses = selectedMonthExpenseTotal;

  /* =========================================================
     CURRENT MONTH INCOME
     ========================================================= */

  const selectedMonthIncome = useMemo(() => {
    return incomeList
      .filter((item) => {
        if (!item.date) return false;
        return String(item.date).startsWith(selectedMonthKey);
      })
      .reduce(
        (total, item) => total + Number(item.amount || 0),
        0
      );
  }, [incomeList, selectedMonthKey]);

  const currentMonthIncome = selectedMonthIncome;

  /* =========================================================
     CURRENT MONTH BALANCE
     ========================================================= */

  const currentMonthBalance =
    currentMonthIncome -
    currentMonthExpenses;

  /* =========================================================
     SPENDING PERCENTAGE
     ========================================================= */

  const spendingPercentage =
    currentMonthIncome > 0
      ? Math.min(
          (currentMonthExpenses /
            currentMonthIncome) *
            100,
          100
        )
      : 0;

  /* =========================================================
     EXPENSE COUNT
     ========================================================= */

  const expenseCount = expenseList.length;

  /* =========================================================
     INVESTMENTS
     ---------------------------------------------------------
     Monthly Investment = actual investment added in the
     selected month.

     Annual Investment = cumulative investment actually added
     from January through the selected month of the selected
     year. It does NOT multiply monthly investments by 12.
     When you add another month's investment, that amount is
     added to the running annual total automatically.
     ========================================================= */

  const investmentItemsForSelectedMonth = useMemo(() => {
    const monthStart = new Date(
      selectedMonth.getFullYear(),
      selectedMonth.getMonth(),
      1
    );

    return expenseList.filter((item) => {
      if (item.category !== "Investment") return false;

      const startDateValue = item.recurringStartDate || item.date;
      if (!startDateValue) return false;

      const startDate = new Date(`${startDateValue}T00:00:00`);

      if (item.recurringMonthly) {
        return startDate <= monthStart;
      }

      return (
        startDate.getFullYear() === selectedMonth.getFullYear() &&
        startDate.getMonth() === selectedMonth.getMonth()
      );
    });
  }, [expenseList, selectedMonth]);

  const monthlyInvestment = useMemo(() => {
    return investmentItemsForSelectedMonth.reduce((total, item) => {
      const amount = Number(item.amount || 0);

      return (
        total +
        (item.investmentFrequency === "Annual"
          ? amount / 12
          : amount)
      );
    }, 0);
  }, [investmentItemsForSelectedMonth]);

  const annualInvestment = useMemo(() => {
    const selectedYear = selectedMonth.getFullYear();
    const selectedMonthIndex = selectedMonth.getMonth();

    return expenseList.reduce((total, item) => {
      if (item.category !== "Investment") return total;

      const startDateValue = item.recurringStartDate || item.date;
      if (!startDateValue) return total;

      const startDate = new Date(`${startDateValue}T00:00:00`);

      if (startDate.getFullYear() !== selectedYear) return total;
      if (startDate.getMonth() > selectedMonthIndex) return total;

      const monthlyAmount =
        item.investmentFrequency === "Annual"
          ? Number(item.amount || 0) / 12
          : Number(item.amount || 0);

      const monthsActive = item.recurringMonthly
        ? selectedMonthIndex - startDate.getMonth() + 1
        : 1;

      return total + monthlyAmount * monthsActive;
    }, 0);
  }, [expenseList, selectedMonth]);

  /* =========================================================
     SORT EXPENSES
     ========================================================= */

  const selectedMonthExpenseCount = selectedMonthExpenses.length;

  const sortedExpenses = useMemo(() => {
    return [...selectedMonthExpenses].sort((a, b) => {
      return (
        new Date(`${b.date}T00:00:00`) -
        new Date(`${a.date}T00:00:00`)
      );
    });
  }, [selectedMonthExpenses]);

  /* =========================================================
     ADD FORM
     ========================================================= */

  function openAddForm() {
    setEditingId(null);

    setForm({
      ...emptyForm,
      date: `${selectedMonthKey}-01`,
    });

    setShowForm(true);
  }

  /* =========================================================
     EDIT FORM
     ========================================================= */

  function openEditForm(item) {
    setEditingId(item.id);

    setForm({
      name: item.name || "",
      amount: item.amount || "",
      date:
        item.date ||
        new Date()
          .toISOString()
          .split("T")[0],
      category: item.category || "Food",
      notes: item.notes || "",
      investmentFrequency:
        item.investmentFrequency || "Monthly",
      recurringMonthly: Boolean(item.recurringMonthly),
    });

    setShowForm(true);
  }

  /* =========================================================
     CLOSE FORM
     ========================================================= */

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

  /* =========================================================
     FORM CHANGE
     ========================================================= */

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  /* =========================================================
     SUBMIT EXPENSE
     ========================================================= */

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      alert("Please enter expense name.");
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

    /* =======================================================
       UPDATE
       ======================================================= */

    if (editingId) {
      const nextList = expenseList.map(
        (item) =>
          item.id === editingId
            ? {
                ...item,
                name: form.name.trim(),
                amount: Number(form.amount),
                date: form.date,
                category: form.category,
                notes: form.notes.trim(),
                investmentFrequency:
                  form.category === "Investment"
                    ? form.investmentFrequency
                    : null,
                recurringMonthly:
                  form.category === "Investment"
                    ? Boolean(form.recurringMonthly)
                    : false,
                recurringStartDate:
                  form.category === "Investment" &&
                  Boolean(form.recurringMonthly)
                    ? (item.recurringStartDate || form.date)
                    : null,
                monthlyInvestment:
                  form.category === "Investment"
                    ? form.investmentFrequency === "Annual"
                      ? Number(form.amount) / 12
                      : Number(form.amount)
                    : 0,
                annualInvestment:
                  form.category === "Investment"
                    ? form.investmentFrequency === "Annual"
                      ? Number(form.amount)
                      : Number(form.amount) * 12
                    : 0,
                updatedAt:
                  new Date().toISOString(),
              }
            : item
      );

      await persistExpenses(nextList);
    }

    /* =======================================================
       ADD
       ======================================================= */

    else {
      const newExpense = {
        id: `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

        name: form.name.trim(),

        amount: Number(form.amount),

        date: form.date,

        category: form.category,

        notes: form.notes.trim(),

        investmentFrequency:
          form.category === "Investment"
            ? form.investmentFrequency
            : null,

        recurringMonthly:
          form.category === "Investment"
            ? Boolean(form.recurringMonthly)
            : false,

        recurringStartDate:
          form.category === "Investment" &&
          Boolean(form.recurringMonthly)
            ? form.date
            : null,

        monthlyInvestment:
          form.category === "Investment"
            ? form.investmentFrequency === "Annual"
              ? Number(form.amount) / 12
              : Number(form.amount)
            : 0,

        annualInvestment:
          form.category === "Investment"
            ? form.investmentFrequency === "Annual"
              ? Number(form.amount)
              : Number(form.amount) * 12
            : 0,

        createdAt:
          new Date().toISOString(),
      };

      await persistExpenses([
        newExpense,
        ...expenseList,
      ]);
    }

    closeForm();
  }

  /* =========================================================
     DELETE EXPENSE
     ========================================================= */

  async function deleteExpense(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this expense?"
    );

    if (!confirmed) return;

    try {
      await deleteItemFromFirestore(
        EXPENSE_COLLECTION,
        id
      );

      const nextList = expenseList.filter(
        (item) => item.id !== id
      );

      setExpenseList(nextList);

      window.dispatchEvent(
        new Event(FINANCE_EVENT)
      );
    } catch (error) {
      console.error(
        "Failed to delete expense:",
        error
      );

      alert(
        "Failed to delete expense. Please try again."
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
            <WalletCards size={23} />
          </div>

          <div>

            <h1 className="page-title">
              Expenses
            </h1>

            <p className="page-subtitle">
              Track your spending and expenses.
            </p>

          </div>

        </div>

        <button
          type="button"
          className="primary-button primary-btn"
          onClick={openAddForm}
        >
          <Plus size={18} />
          Add Expense
        </button>

      </div>

      {/* =====================================================
          SUMMARY CARDS
          ===================================================== */}

      <div className="stats-grid">

        <div className="stat-card">

          <div className="stat-icon">
            <TrendingDown size={22} />
          </div>

          <div>

            <span className="stat-label">
              Total Expenses
            </span>

            <strong className="stat-value">
              {formatCurrency(
                totalExpenses
              )}
            </strong>

          </div>

        </div>

        <div className="stat-card">

          <div className="stat-icon">
            <CalendarDays size={22} />
          </div>

          <div>

            <span className="stat-label">
              This Month
            </span>

            <strong className="stat-value">
              {formatCurrency(
                currentMonthExpenses
              )}
            </strong>

          </div>

        </div>

        <div className="stat-card">

          <div className="stat-icon">
            <IndianRupee size={22} />
          </div>

          <div>

            <span className="stat-label">
              Total Entries
            </span>

            <strong className="stat-value">
              {expenseCount}
            </strong>

          </div>

        </div>

      </div>

      {/* =====================================================
          INVESTMENT OVERVIEW
          ===================================================== */}

      <div className="content-card finance-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">
              Investment Overview
            </h2>
            <p className="section-description">
              Viewing {selectedMonthLabel}. Annual Investment is the
              cumulative amount actually invested from January through this month.
            </p>
          </div>
        </div>

        <div className="money-flow">
          <div className="flow-box flow-expense">
            <span className="flow-label">
              Monthly Investment
            </span>
            <div className="flow-value">
              {formatCurrency(monthlyInvestment)}
            </div>
          </div>

          <div className="flow-box flow-balance">
            <span className="flow-label">
              Annual Investment
            </span>
            <div className="flow-value positive-value">
              {formatCurrency(annualInvestment)}
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          MONTHLY SPENDING OVERVIEW
          ===================================================== */}

      <div className="content-card finance-card">

        <div className="section-header">

          <div>

            <h2 className="section-title">
              This Month&apos;s Spending Overview
            </h2>

            <p className="section-description">
              Expenses are automatically compared
              with your income.
            </p>

          </div>

        </div>

        <div className="money-flow">

          <div className="flow-box flow-income">

            <span className="flow-label">
              Monthly Income
            </span>

            <div className="flow-value">
              {formatCurrency(
                currentMonthIncome
              )}
            </div>

          </div>

          <div className="flow-box flow-expense">

            <span className="flow-label">
              Monthly Expenses
            </span>

            <div className="flow-value">
              {formatCurrency(
                currentMonthExpenses
              )}
            </div>

          </div>

          <div className="flow-box flow-balance">

            <span className="flow-label">
              Remaining Balance
            </span>

            <div
              className={`flow-value ${
                currentMonthBalance < 0
                  ? "negative-value"
                  : "positive-value"
              }`}
            >
              {formatCurrency(
                currentMonthBalance
              )}
            </div>

          </div>

        </div>

        {/* =================================================
            SPENDING PROGRESS
            UNIQUE CLASS — NOT .progress-bar
            ================================================= */}

        <div className="progress-section">

          <div className="progress-header">

            <span className="progress-label">
              Income Spent
            </span>

            <span className="progress-value">
              {currentMonthIncome > 0
                ? `${spendingPercentage.toFixed(
                    1
                  )}%`
                : "0%"}
            </span>

          </div>

          <div className="progress-track">

            <div
              className="finance-progress-fill"
              style={{
                width: `${spendingPercentage}%`,
              }}
            />

          </div>

        </div>

        {currentMonthBalance < 0 && (

          <div className="finance-alert">

            <div className="finance-alert-icon">
              <TrendingDown size={20} />
            </div>

            <div>

              <div className="finance-alert-title">
                Expenses are higher than income
              </div>

              <div className="finance-alert-text">
                Your current month expenses are greater
                than your income. Review your spending
                and Budget page.
              </div>

            </div>

          </div>

        )}

      </div>

      {/* =====================================================
          EXPENSE HISTORY
          ===================================================== */}

      <div className="content-card list-card">

        <div className="section-header">

          <div>
            <h2 className="section-title">
              Expense History
            </h2>

            <p className="section-description">
              Showing expenses for {selectedMonthLabel}.
            </p>
          </div>

          <span className="list-count">
            {selectedMonthExpenseCount}{" "}
            {selectedMonthExpenseCount === 1
              ? "entry"
              : "entries"}
          </span>

        </div>

        <div
          className="expense-history-month-navigator"
          style={{
            display: "grid",
            gridTemplateColumns: "44px minmax(0, 1fr) 44px",
            alignItems: "center",
            gap: "12px",
            width: "100%",
            marginBottom: "18px",
            padding: "6px",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "14px",
            background: "rgba(255,255,255,0.025)",
          }}
        >
          <button
            type="button"
            className="secondary-button secondary-btn"
            onClick={() => shiftMonth(-1)}
            title="Previous month"
            aria-label="Previous month"
            style={{
              width: "44px",
              minWidth: "44px",
              height: "40px",
              minHeight: "40px",
              padding: 0,
              borderRadius: "10px",
              fontSize: "22px",
              lineHeight: 1,
            }}
          >
            ‹
          </button>

          <div
            style={{
              minWidth: 0,
              textAlign: "center",
              padding: "5px 8px",
            }}
          >
            <div
              style={{
                color: "rgba(255,255,255,0.48)",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "3px",
              }}
            >
              Expense month
            </div>

            <strong
              style={{
                display: "block",
                color: "#fff",
                fontSize: "16px",
                fontWeight: 700,
                lineHeight: 1.3,
              }}
            >
              {selectedMonthLabel}
            </strong>

            <div
              style={{
                marginTop: "3px",
                color: "rgba(255,255,255,0.45)",
                fontSize: "12px",
              }}
            >
              {formatCurrency(selectedMonthExpenseTotal)} spent
            </div>
          </div>

          <button
            type="button"
            className="secondary-button secondary-btn"
            onClick={() => shiftMonth(1)}
            title="Next month"
            aria-label="Next month"
            style={{
              width: "44px",
              minWidth: "44px",
              height: "40px",
              minHeight: "40px",
              padding: 0,
              borderRadius: "10px",
              fontSize: "22px",
              lineHeight: 1,
            }}
          >
            ›
          </button>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "18px",
          }}
        >
          <button
            type="button"
            className="secondary-button secondary-btn"
            onClick={goToCurrentMonth}
            style={{
              minHeight: "38px",
              padding: "8px 14px",
              borderRadius: "10px",
              fontSize: "13px",
            }}
          >
            Current Month
          </button>
        </div>

        {loading ? (

          <div className="empty-state">

            <div className="empty-state-icon">
              <WalletCards size={25} />
            </div>

            <h3 className="empty-state-title">
              Loading expenses...
            </h3>

            <p className="empty-state-text">
              Fetching your finance data from Firebase.
            </p>

          </div>

        ) : sortedExpenses.length === 0 ? (

          <div className="empty-state">

            <div className="empty-state-icon">
              <WalletCards size={25} />
            </div>

            <h3 className="empty-state-title">
              No expenses recorded for {selectedMonthLabel}
            </h3>

            <p className="empty-state-text">
              There are no expense entries for this month.
              Add an expense or move to another month.
            </p>

            <button
              type="button"
              className="primary-button primary-btn"
              onClick={openAddForm}
            >
              <Plus size={18} />
              Add Expense
            </button>

          </div>

        ) : (

          <div className="finance-list expense-list">

            {sortedExpenses.map((item) => (

              <div
                className="finance-list-item expense-item"
                key={item.id}
              >

                <div className="item-left expense-main">

                  <div className="item-icon expense-icon">
                    <TrendingDown size={20} />
                  </div>

                  <div className="item-info">

                    <h3 className="item-title">
                      {item.name}
                    </h3>

                    <div className="item-meta expense-meta">

                      <span className="category-badge">
                        {item.category}
                      </span>

                      <span>•</span>

                      <span>
                        {formatDate(item.date)}
                      </span>

                    </div>

                    {item.notes && (

                      <p className="expense-notes">

                        <FileText size={14} />

                        {item.notes}

                      </p>

                    )}

                  </div>

                </div>

                <div className="item-right expense-right">

                  <strong className="item-amount">
                    {formatCurrency(
                      item.amount
                    )}
                  </strong>

                  <div className="expense-actions">

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
                        deleteExpense(item.id)
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
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            boxSizing: "border-box",
            overflowY: "auto",
          }}
          onMouseDown={closeForm}
        >

          <div
            className="modal-card finance-modal"
            style={{
              width: "min(480px, calc(100vw - 32px))",
              maxWidth: "480px",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              overflowX: "hidden",
              padding: "20px",
              boxSizing: "border-box",
              position: "relative",
              zIndex: 1,
            }}
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <h2 className="modal-title">

                  {editingId
                    ? "Edit Expense"
                    : "Add Expense"}

                </h2>

                <p className="section-description">

                  {editingId
                    ? "Update this expense entry."
                    : "Record a new expense entry."}

                </p>

              </div>

              <button
                type="button"
                className="icon-button close-btn"
                onClick={closeForm}
                title="Close"
                style={{
                  position: "static",
                  top: "auto",
                  right: "auto",
                  transform: "none",
                  flex: "0 0 36px",
                  width: "36px",
                  height: "36px",
                  minWidth: "36px",
                  margin: 0,
                  alignSelf: "center",
                }}
              >
                <X size={20} />
              </button>

            </div>

            <form onSubmit={handleSubmit}>

              <div className="form-group">

                <label className="form-label">
                  Expense Name
                </label>

                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Example: Grocery shopping"
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
                    placeholder="500"
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

              {form.category === "Investment" && (
                <div
                  className="investment-form-panel"
                  style={{
                    marginBottom: "20px",
                    padding: "18px",
                    border: "1px solid color-mix(in srgb, var(--taskbar-theme-main) 28%, rgba(255,255,255,0.08))",
                    borderRadius: "16px",
                    background: "linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), 0 14px 35px rgba(0,0,0,0.18)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      marginBottom: "18px",
                    }}
                  >
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        minWidth: "38px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "10px",
                        color: "var(--taskbar-theme-main)",
                        background: "color-mix(in srgb, var(--taskbar-theme-main) 10%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--taskbar-theme-main) 22%, transparent)",
                      }}
                    >
                      <TrendingUp size={19} />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: "#fff",
                          fontSize: "15px",
                          fontWeight: 700,
                          lineHeight: 1.35,
                        }}
                      >
                        Investment details
                      </div>
                      <div
                        style={{
                          marginTop: "3px",
                          color: "rgba(255,255,255,0.48)",
                          fontSize: "12px",
                          lineHeight: 1.45,
                        }}
                      >
                        Set the investment frequency and amount for this month.
                      </div>
                    </div>
                  </div>

                  <div
                    className="form-row form-grid"
                    style={{
                      gap: "14px",
                      marginBottom: "0",
                    }}
                  >
                    <div className="form-group" style={{ marginBottom: "16px" }}>
                      <label className="form-label">
                        Investment Type
                      </label>

                      <select
                        name="investmentFrequency"
                        value={form.investmentFrequency}
                        onChange={handleChange}
                      >
                        <option value="Monthly">
                          Monthly Investment
                        </option>
                        <option value="Annual">
                          Annual Investment
                        </option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: "16px" }}>
                      <label className="form-label">
                        {form.investmentFrequency === "Monthly"
                          ? "Monthly Investment Amount"
                          : "Annual Investment Amount"}
                      </label>

                      <input
                        type="number"
                        name="amount"
                        value={form.amount}
                        onChange={handleChange}
                        placeholder={
                          form.investmentFrequency === "Monthly"
                            ? "5000"
                            : "60000"
                        }
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "100%",
                      minHeight: "48px",
                      margin: "2px 0 16px",
                      padding: "10px 12px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "11px",
                      background: "rgba(255,255,255,0.025)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      name="recurringMonthly"
                      checked={form.recurringMonthly}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          recurringMonthly:
                            event.target.checked,
                        }))
                      }
                      style={{
                        width: "18px",
                        height: "18px",
                        minWidth: "18px",
                        minHeight: "18px",
                        margin: 0,
                        padding: 0,
                        flex: "0 0 18px",
                        accentColor: "var(--taskbar-theme-main)",
                        cursor: "pointer",
                      }}
                    />

                    <span
                      style={{
                        minWidth: 0,
                        color: "rgba(255,255,255,0.78)",
                        fontSize: "13px",
                        fontWeight: 600,
                        lineHeight: 1.4,
                      }}
                    >
                      Add this amount every month starting from{" "}
                      <strong style={{ color: "#fff" }}>
                        {selectedMonthLabel}
                      </strong>
                    </span>
                  </label>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: "10px",
                      alignItems: "stretch",
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        padding: "11px 13px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255,255,255,0.07)",
                        background: "rgba(0,0,0,0.14)",
                      }}
                    >
                      <div
                        style={{
                          color: "rgba(255,255,255,0.42)",
                          fontSize: "11px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: "4px",
                        }}
                      >
                        Investment month
                      </div>
                      <div
                        style={{
                          color: "#fff",
                          fontSize: "13px",
                          fontWeight: 650,
                        }}
                      >
                        {selectedMonthLabel}
                      </div>
                    </div>

                    <div
                      style={{
                        minWidth: "145px",
                        padding: "11px 13px",
                        borderRadius: "10px",
                        border: "1px solid color-mix(in srgb, var(--taskbar-theme-main) 20%, rgba(255,255,255,0.07))",
                        background: "color-mix(in srgb, var(--taskbar-theme-main) 5%, transparent)",
                        textAlign: "right",
                      }}
                    >
                      <div
                        style={{
                          color: "rgba(255,255,255,0.42)",
                          fontSize: "11px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: "4px",
                        }}
                      >
                        Calculation
                      </div>
                      <div
                        style={{
                          color: "var(--taskbar-theme-main)",
                          fontSize: "13px",
                          fontWeight: 700,
                          lineHeight: 1.35,
                        }}
                      >
                        {form.amount && Number(form.amount) > 0
                          ? form.investmentFrequency === "Monthly"
                            ? `Monthly: ${formatCurrency(
                                Number(form.amount)
                              )}`
                            : `Monthly: ${formatCurrency(
                                Number(form.amount) / 12
                              )}`
                          : "Enter amount"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                    ? "Update Expense"
                    : "Save Expense"}

                </button>

              </div>

            </form>

          </div>

        </div>
      )}

    </div>
  );
}