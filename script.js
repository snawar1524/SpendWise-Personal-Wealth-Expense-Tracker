/* ==========================================================================
   SpendWise — script.js
   Every data structure here mirrors the C++ engine in /cpp_backend on
   purpose, so the two halves of the project teach the same DSA concepts:

     1. Doubly Linked List  -> TransactionList   (primary storage)
     2. Binary Search Tree  -> CategoryBST       (category report, sorted)
     3. Hash Map            -> categoryTotals    (plain JS object, O(1))
     4. Stack                -> undoStack         (array used as a stack)
     5. Merge Sort           -> mergeSort()       (sort by amount/date)
     6. Binary Search        -> binarySearchDate()(find txns on a date)
     7. Binary Max-Heap      -> MaxHeap class     (top-N expenses)
     8. Persistence          -> localStorage      (stand-in for file I/O)
   ========================================================================== */

/* -------------------------- 1) DOUBLY LINKED LIST ------------------------ */
class Node {
  constructor(txn) {
    this.data = txn;
    this.prev = null;
    this.next = null;
  }
}

class TransactionList {
  constructor() {
    this.head = null;
    this.tail = null;
    this.count = 0;
    this.nextId = 1;
  }

  insertEnd(date, category, type, amount, note) {
    const txn = { id: this.nextId++, date, category, type, amount, note };
    const node = new Node(txn);
    if (!this.head) {
      this.head = this.tail = node;
    } else {
      this.tail.next = node;
      node.prev = this.tail;
      this.tail = node;
    }
    this.count++;
    return txn;
  }

  deleteById(id) {
    let cur = this.head;
    while (cur) {
      if (cur.data.id === id) {
        if (cur.prev) cur.prev.next = cur.next; else this.head = cur.next;
        if (cur.next) cur.next.prev = cur.prev; else this.tail = cur.prev;
        this.count--;
        return cur.data;
      }
      cur = cur.next;
    }
    return null;
  }

  toArray() {
    const arr = [];
    let cur = this.head;
    while (cur) { arr.push(cur.data); cur = cur.next; }
    return arr;
  }

  loadFromArray(txns) {
    this.head = this.tail = null;
    this.count = 0;
    let maxId = 0;
    for (const t of txns) {
      const node = new Node(t);
      if (!this.head) this.head = this.tail = node;
      else { this.tail.next = node; node.prev = this.tail; this.tail = node; }
      this.count++;
      maxId = Math.max(maxId, t.id);
    }
    this.nextId = maxId + 1;
  }
}

/* --------------------------- 2) BINARY SEARCH TREE ------------------------ */
class BSTNode {
  constructor(category, amount) {
    this.category = category;
    this.total = amount;
    this.txnCount = 1;
    this.left = null;
    this.right = null;
  }
}

class CategoryBST {
  constructor() { this.root = null; }

  insert(node, category, amount) {
    if (!node) return new BSTNode(category, amount);
    if (category < node.category) node.left = this.insert(node.left, category, amount);
    else if (category > node.category) node.right = this.insert(node.right, category, amount);
    else { node.total += amount; node.txnCount++; }
    return node;
  }

  add(category, amount) { this.root = this.insert(this.root, category, amount); }

  inorder(node, out) {
    if (!node) return;
    this.inorder(node.left, out);
    out.push({ category: node.category, total: node.total, count: node.txnCount });
    this.inorder(node.right, out);
  }

  rebuildFrom(txns) {
    this.root = null;
    for (const t of txns) {
      if (t.type === 'expense') this.add(t.category, t.amount);
      else this.add(t.category, 0); // still register the category node
    }
  }

  sortedReport() {
    const out = [];
    this.inorder(this.root, out);
    return out;
  }
}

/* ------------------------------ 5) MERGE SORT ----------------------------- */
// cmp(a, b) returns true if a should come BEFORE b
function mergeSort(arr, cmp) {
  if (arr.length <= 1) return arr.slice();
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid), cmp);
  const right = mergeSort(arr.slice(mid), cmp);

  const merged = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (cmp(left[i], right[j])) merged.push(left[i++]);
    else merged.push(right[j++]);
  }
  while (i < left.length) merged.push(left[i++]);
  while (j < right.length) merged.push(right[j++]);
  return merged;
}

/* ------------------------------ 6) BINARY SEARCH --------------------------- */
// Requires txns sorted ascending by date string (YYYY-MM-DD sorts lexicographically).
// Returns ALL matches on that date (first found, then expands both directions),
// mirroring a classic binary-search-then-scan pattern used on sorted data with duplicates.
function binarySearchDate(sortedByDate, date) {
  let lo = 0, hi = sortedByDate.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedByDate[mid].date === date) { found = mid; break; }
    else if (sortedByDate[mid].date < date) lo = mid + 1;
    else hi = mid - 1;
  }
  if (found === -1) return [];
  let start = found, end = found;
  while (start > 0 && sortedByDate[start - 1].date === date) start--;
  while (end < sortedByDate.length - 1 && sortedByDate[end + 1].date === date) end++;
  return sortedByDate.slice(start, end + 1);
}

/* ------------------------------ 7) BINARY MAX-HEAP -------------------------- */
class MaxHeap {
  constructor() { this.data = []; }
  size() { return this.data.length; }

  push(item) {
    this.data.push(item);
    let i = this.data.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].amount >= this.data[i].amount) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let largest = i;
        if (l < this.data.length && this.data[l].amount > this.data[largest].amount) largest = l;
        if (r < this.data.length && this.data[r].amount > this.data[largest].amount) largest = r;
        if (largest === i) break;
        [this.data[largest], this.data[i]] = [this.data[i], this.data[largest]];
        i = largest;
      }
    }
    return top;
  }
}

/* ------------------------------ GLOBAL STATE -------------------------------- */
const list = new TransactionList();
let categoryTotals = {};      // 3) HASH MAP: category -> running expense total
const undoStack = [];         // 4) STACK: {action:'add'|'delete', txn}
const STORAGE_KEY = 'spendwise_transactions_v1';
const BUDGET_KEY = 'spendwise_monthly_budget_v1';

function applyToHashMap(txn, reverse = false) {
  const sign = reverse ? -1 : 1;
  const amt = txn.type === 'expense' ? txn.amount : 0;
  categoryTotals[txn.category] = (categoryTotals[txn.category] || 0) + sign * amt;
}

function rebuildHashMap() {
  categoryTotals = {};
  for (const t of list.toArray()) applyToHashMap(t);
}

/* ------------------------------ PERSISTENCE --------------------------------- */
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.toArray()));
}

function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const txns = JSON.parse(raw);
    list.loadFromArray(txns);
    rebuildHashMap();
  } catch (e) {
    console.error('Failed to parse saved data', e);
  }
}

function getBudget() {
  return parseFloat(localStorage.getItem(BUDGET_KEY) || '0');
}
function setBudget(val) {
  localStorage.setItem(BUDGET_KEY, String(val));
}

/* ------------------------------ RENDERING ----------------------------------- */
const $ = (sel) => document.querySelector(sel);

function fmt(n) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderSummary() {
  const txns = list.toArray();
  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  $('#stat-income').textContent = fmt(income);
  $('#stat-expense').textContent = fmt(expense);
  $('#stat-balance').textContent = fmt(balance);
  $('#stat-balance').parentElement.classList.toggle('negative', balance < 0);

  const budget = getBudget();
  const budgetBanner = $('#budget-banner');
  if (budget > 0) {
    const pct = Math.min(100, (expense / budget) * 100);
    $('#budget-bar-fill').style.width = pct + '%';
    $('#budget-bar-fill').classList.toggle('over', expense > budget);
    $('#budget-text').textContent =
      `₹${fmt(expense)} of ₹${fmt(budget)} monthly budget spent (${pct.toFixed(0)}%)`;
    budgetBanner.classList.toggle('over', expense > budget);
    budgetBanner.style.display = 'flex';
  } else {
    budgetBanner.style.display = 'none';
  }
}

function renderTable(txns) {
  const tbody = $('#txn-table-body');
  tbody.innerHTML = '';
  if (txns.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No transactions yet — add your first one above.</td></tr>`;
    return;
  }
  for (const t of txns) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.date}</td>
      <td><span class="pill pill-${t.type}">${t.type}</span></td>
      <td>${escapeHtml(t.category)}</td>
      <td class="amount ${t.type === 'income' ? 'credit' : 'debit'}">${t.type === 'income' ? '+' : '−'}₹${fmt(t.amount)}</td>
      <td class="note">${escapeHtml(t.note || '')}</td>
      <td><button class="icon-btn del-btn" data-id="${t.id}" title="Delete">✕</button></td>
    `;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(parseInt(btn.dataset.id, 10)));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderCategoryReport() {
  const tree = new CategoryBST();
  tree.rebuildFrom(list.toArray());
  const report = tree.sortedReport().filter(r => r.total > 0);
  const wrap = $('#category-report');
  wrap.innerHTML = '';
  if (report.length === 0) {
    wrap.innerHTML = `<p class="muted">Add some expenses to see the category breakdown (built with a BST inorder traversal).</p>`;
    return;
  }
  const max = Math.max(...report.map(r => r.total));
  for (const r of report) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    const pct = (r.total / max) * 100;
    row.innerHTML = `
      <div class="bar-label">${escapeHtml(r.category)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="bar-value">₹${fmt(r.total)}</div>
    `;
    wrap.appendChild(row);
  }
}

function currentSortedView() {
  const sortBy = $('#sort-select').value;
  const txns = list.toArray();
  if (sortBy === 'amount-desc') {
    return mergeSort(txns, (a, b) => a.amount > b.amount);
  } else if (sortBy === 'amount-asc') {
    return mergeSort(txns, (a, b) => a.amount < b.amount);
  } else if (sortBy === 'date-desc') {
    return mergeSort(txns, (a, b) => a.date > b.date);
  } else if (sortBy === 'date-asc') {
    return mergeSort(txns, (a, b) => a.date < b.date);
  }
  return txns; // 'none' -> linked-list insertion order
}

function renderAll() {
  renderSummary();
  renderTable(currentSortedView());
  renderCategoryReport();
  renderTopExpenses();
  $('#undo-btn').disabled = undoStack.length === 0;
}

/* --------------------------- TOP EXPENSES (HEAP) ---------------------------- */
function renderTopExpenses() {
  const n = parseInt($('#top-n').value, 10) || 5;
  const heap = new MaxHeap();
  for (const t of list.toArray()) if (t.type === 'expense') heap.push(t);

  const results = [];
  while (results.length < n && heap.size() > 0) results.push(heap.pop());

  const wrap = $('#top-expenses');
  wrap.innerHTML = '';
  if (results.length === 0) {
    wrap.innerHTML = `<p class="muted">No expenses recorded yet.</p>`;
    return;
  }
  results.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'top-row';
    div.innerHTML = `<span class="rank">#${i + 1}</span>
      <span class="top-cat">${escapeHtml(t.category)}</span>
      <span class="top-date">${t.date}</span>
      <span class="top-amt">₹${fmt(t.amount)}</span>`;
    wrap.appendChild(div);
  });
}

/* -------------------------------- ACTIONS ----------------------------------- */
function addTransaction(date, type, category, amount, note) {
  const txn = list.insertEnd(date, category, type, amount, note);
  applyToHashMap(txn);
  undoStack.push({ action: 'add', txn });
  saveToStorage();
  renderAll();
}

function deleteTransaction(id) {
  const removed = list.deleteById(id);
  if (removed) {
    applyToHashMap(removed, true);
    undoStack.push({ action: 'delete', txn: removed });
    saveToStorage();
    renderAll();
  }
}

function undoLast() {
  if (undoStack.length === 0) return;
  const act = undoStack.pop();
  if (act.action === 'add') {
    const removed = list.deleteById(act.txn.id);
    if (removed) applyToHashMap(removed, true);
  } else {
    // undo a delete -> re-insert (gets a new id, matching the C++ CLI behavior)
    const txn = list.insertEnd(act.txn.date, act.txn.category, act.txn.type, act.txn.amount, act.txn.note);
    applyToHashMap(txn);
  }
  saveToStorage();
  renderAll();
}

function searchByDate(date) {
  const sorted = mergeSort(list.toArray(), (a, b) => a.date < b.date);
  const matches = binarySearchDate(sorted, date);
  const wrap = $('#search-results');
  wrap.innerHTML = '';
  if (matches.length === 0) {
    wrap.innerHTML = `<p class="muted">No transactions found on ${date}.</p>`;
    return;
  }
  renderTable(matches);
  $('#search-note').textContent = `Showing ${matches.length} result(s) for ${date} (binary search). Clear the search box and press Search again with it empty to see all transactions.`;
}

/* ------------------------------- INIT --------------------------------------- */
function init() {
  loadFromStorage();
  renderAll();

  $('#txn-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = $('#f-date').value;
    const type = $('#f-type').value;
    const category = $('#f-category').value.trim();
    const amount = parseFloat($('#f-amount').value);
    const note = $('#f-note').value.trim();
    if (!date || !category || isNaN(amount) || amount <= 0) return;
    addTransaction(date, type, category, amount, note);
    e.target.reset();
    $('#f-date').value = date; // keep date for quick multi-entry
  });

  $('#undo-btn').addEventListener('click', undoLast);
  $('#sort-select').addEventListener('change', () => renderTable(currentSortedView()));
  $('#top-n').addEventListener('change', renderTopExpenses);

  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = $('#search-date').value;
    if (!date) { renderTable(currentSortedView()); $('#search-note').textContent = ''; return; }
    searchByDate(date);
  });

  $('#budget-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = parseFloat($('#budget-input').value) || 0;
    setBudget(val);
    renderSummary();
  });
  $('#budget-input').value = getBudget() || '';

  $('#f-date').valueAsDate = new Date();
}

document.addEventListener('DOMContentLoaded', init);
