const STORAGE_KEY = "dingtou-plan-v1";

const typeLabels = {
  Index: "指数",
  Bond: "债券",
  Gold: "黄金",
  MoneyMarket: "货币",
  Dividend: "红利",
  Other: "其他",
};

const state = {
  ym: getCurrentYM(),
  workdayOnly: true,
  items: [],
  editingId: null,
};

const els = {
  ym: document.getElementById("ym"),
  workdayOnly: document.getElementById("workdayOnly"),
  itemForm: document.getElementById("itemForm"),
  editingId: document.getElementById("editingId"),
  name: document.getElementById("name"),
  type: document.getElementById("type"),
  cadence: document.getElementById("cadence"),
  amount: document.getElementById("amount"),
  daysPlannedWrap: document.getElementById("daysPlannedWrap"),
  daysPlanned: document.getElementById("daysPlanned"),
  note: document.getElementById("note"),
  submitBtn: document.getElementById("submitBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  formError: document.getElementById("formError"),
  itemsTbody: document.getElementById("itemsTbody"),
  totalMonthly: document.getElementById("totalMonthly"),
  totalAnnual: document.getElementById("totalAnnual"),
};

function getCurrentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseYM(ym) {
  const [year, month] = ym.split("-").map(Number);
  return { year, month };
}

function daysInMonth(ym) {
  const { year, month } = parseYM(ym);
  return new Date(year, month, 0).getDate();
}

function workdaysInMonth(ym) {
  const { year, month } = parseYM(ym);
  const total = daysInMonth(ym);
  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    const dow = new Date(year, month - 1, day).getDay();
    if (dow >= 1 && dow <= 5) count += 1;
  }
  return count;
}

function money(n) {
  return `¥${n.toFixed(2)}`;
}

function percent(n) {
  return `${(n * 100).toFixed(2)}%`;
}

function generateId() {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.ym === "string") state.ym = parsed.ym;
    if (typeof parsed.workdayOnly === "boolean") state.workdayOnly = parsed.workdayOnly;
    if (Array.isArray(parsed.items)) state.items = parsed.items;
  } catch (_err) {
    // 忽略损坏数据，使用默认值
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ym: state.ym,
      workdayOnly: state.workdayOnly,
      items: state.items,
    })
  );
}

function computeDerived() {
  const dim = daysInMonth(state.ym);
  const wim = workdaysInMonth(state.ym);

  const rows = state.items.map((item) => {
    let monthlyContribution = 0;

    if (item.cadence === "monthly") {
      monthlyContribution = item.amount;
    } else {
      const cap = state.workdayOnly ? wim : dim;
      const investableDays = Math.min(item.daysPlanned, cap);
      monthlyContribution = item.amount * investableDays;
    }

    const annualContribution = monthlyContribution * 12;

    return {
      ...item,
      monthlyContribution,
      annualContribution,
    };
  });

  const totalMonthly = rows.reduce((sum, row) => sum + row.monthlyContribution, 0);
  const totalAnnual = rows.reduce((sum, row) => sum + row.annualContribution, 0);

  const enrichedRows = rows.map((row) => ({
    ...row,
    share: totalMonthly > 0 ? row.monthlyContribution / totalMonthly : 0,
  }));

  return { rows: enrichedRows, totalMonthly, totalAnnual };
}

function render() {
  els.ym.value = state.ym;
  els.workdayOnly.checked = state.workdayOnly;
  toggleDaysPlanned();

  const derived = computeDerived();
  els.totalMonthly.textContent = money(derived.totalMonthly);
  els.totalAnnual.textContent = money(derived.totalAnnual);

  if (derived.rows.length === 0) {
    els.itemsTbody.innerHTML = `<tr><td colspan="9">暂无条目，请先新增。</td></tr>`;
  } else {
    els.itemsTbody.innerHTML = derived.rows
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${typeLabels[row.type] || row.type}</td>
          <td>${row.cadence === "monthly" ? "按月" : "按天"}</td>
          <td>${money(row.amount)}</td>
          <td>${row.cadence === "daily" ? row.daysPlanned : "-"}</td>
          <td>${money(row.monthlyContribution)}</td>
          <td>${money(row.annualContribution)}</td>
          <td>${percent(row.share)}</td>
          <td>
            <button type="button" class="op-btn" data-action="edit" data-id="${row.id}">编辑</button>
            <button type="button" data-action="delete" data-id="${row.id}">删除</button>
          </td>
        </tr>
      `
      )
      .join("");
  }
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toggleDaysPlanned() {
  const isDaily = els.cadence.value === "daily";
  els.daysPlannedWrap.hidden = !isDaily;
  els.daysPlanned.required = isDaily;
}

function resetForm() {
  state.editingId = null;
  els.editingId.value = "";
  els.itemForm.reset();
  els.type.value = "Index";
  els.cadence.value = "monthly";
  toggleDaysPlanned();
  els.submitBtn.textContent = "新增条目";
  els.cancelEditBtn.hidden = true;
  els.formError.textContent = "";
}

function validateForm(payload) {
  if (!payload.name.trim()) return "名称为必填项";
  if (!(payload.amount > 0)) return "金额必须大于 0";
  if (payload.cadence === "daily") {
    if (!Number.isInteger(payload.daysPlanned) || payload.daysPlanned < 1 || payload.daysPlanned > 31) {
      return "按天条目的计划天数必须在 1-31 之间";
    }
  }
  return "";
}

function bindEvents() {
  els.ym.addEventListener("change", (e) => {
    state.ym = e.target.value || getCurrentYM();
    saveState();
    render();
  });

  els.workdayOnly.addEventListener("change", (e) => {
    state.workdayOnly = Boolean(e.target.checked);
    saveState();
    render();
  });

  els.cadence.addEventListener("change", toggleDaysPlanned);

  els.itemForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const payload = {
      id: state.editingId || generateId(),
      name: els.name.value.trim(),
      type: els.type.value,
      cadence: els.cadence.value,
      amount: Number(els.amount.value),
      daysPlanned: Number(els.daysPlanned.value),
      note: els.note.value.trim(),
    };

    const error = validateForm(payload);
    if (error) {
      els.formError.textContent = error;
      return;
    }

    els.formError.textContent = "";

    if (state.editingId) {
      state.items = state.items.map((item) => (item.id === state.editingId ? payload : item));
    } else {
      state.items.push(payload);
    }

    saveState();
    render();
    resetForm();
  });

  els.cancelEditBtn.addEventListener("click", resetForm);

  els.itemsTbody.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "delete") {
      state.items = state.items.filter((item) => item.id !== id);
      saveState();
      render();
      if (state.editingId === id) resetForm();
      return;
    }

    if (action === "edit") {
      const item = state.items.find((it) => it.id === id);
      if (!item) return;

      state.editingId = item.id;
      els.editingId.value = item.id;
      els.name.value = item.name;
      els.type.value = item.type;
      els.cadence.value = item.cadence;
      els.amount.value = String(item.amount);
      els.daysPlanned.value = item.cadence === "daily" ? String(item.daysPlanned) : "";
      els.note.value = item.note || "";
      toggleDaysPlanned();
      els.submitBtn.textContent = "保存修改";
      els.cancelEditBtn.hidden = false;
      els.formError.textContent = "";
    }
  });
}

function init() {
  loadState();
  bindEvents();
  render();
}

init();
