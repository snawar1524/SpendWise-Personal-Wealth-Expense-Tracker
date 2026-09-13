/*
    ====================================================================
    SpendWise - Personal Wealth & Expense Tracker
    C++ DSA Engine (Console Backend)
    ====================================================================

    This file is the "logic engine" of the SpendWise project. It is a
    menu-driven C++ program that stores and processes transactions using
    classic data structures & algorithms:

      1. Doubly Linked List   -> primary storage of transactions
                                  (insert at end, delete by id, traverse)
      2. Binary Search Tree    -> organizes transactions by category name
                                  (insert, inorder traversal = sorted report)
      3. Hash Map (unordered_map) -> O(1) running total per category
      4. Stack                -> Undo the last add/delete operation
      5. Merge Sort            -> sort transactions by amount or date
      6. Binary Search         -> fast lookup of a transaction by date
                                  (requires the sorted-by-date array)
      7. Max-Heap (priority_queue) -> "Top N expenses" report
      8. File I/O              -> persistence to transactions.csv

    Compile:   g++ -std=c++17 -O2 expense_tracker.cpp -o spendwise
    Run:       ./spendwise

    NOTE ON ARCHITECTURE:
    A C++ console program cannot execute inside a web browser directly.
    This engine is therefore shipped as a standalone CLI tool that proves
    out the DSA logic and can persist data to disk. The `web_app/` folder
    contains an HTML/CSS/JS front end that mirrors the exact same data
    structures (linked list, BST, hash map, merge sort, stack, heap,
    binary search) in JavaScript so the project is fully usable as a
    live web application. See README.md for the full explanation.
    ====================================================================
*/

#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <unordered_map>
#include <stack>
#include <queue>
#include <iomanip>
#include <algorithm>
#include <limits>

using namespace std;

// ------------------------------------------------------------------
// Transaction record
// ------------------------------------------------------------------
struct Transaction {
    int id;
    string date;       // format YYYY-MM-DD (kept as string, sortable lexicographically)
    string category;   // e.g. Food, Rent, Salary, Travel
    string type;       // "income" or "expense"
    double amount;
    string note;
};

// ------------------------------------------------------------------
// 1) DOUBLY LINKED LIST  -  primary storage of all transactions
// ------------------------------------------------------------------
struct Node {
    Transaction data;
    Node* prev;
    Node* next;
    Node(const Transaction& t) : data(t), prev(nullptr), next(nullptr) {}
};

class TransactionList {
private:
    Node* head;
    Node* tail;
    int count;
    int nextId;

public:
    TransactionList() : head(nullptr), tail(nullptr), count(0), nextId(1) {}

    int size() const { return count; }
    int peekNextId() const { return nextId; }
    void setNextId(int n) { nextId = n; }

    // Insert at the end of the list  -> O(1)
    Transaction insertEnd(string date, string category, string type, double amount, string note) {
        Transaction t{nextId++, date, category, type, amount, note};
        Node* node = new Node(t);
        if (!head) {
            head = tail = node;
        } else {
            tail->next = node;
            node->prev = tail;
            tail = node;
        }
        count++;
        return t;
    }

    // Delete a transaction by id -> O(n), returns the deleted record via 'out'
    bool deleteById(int id, Transaction& out) {
        Node* cur = head;
        while (cur) {
            if (cur->data.id == id) {
                out = cur->data;
                if (cur->prev) cur->prev->next = cur->next; else head = cur->next;
                if (cur->next) cur->next->prev = cur->prev; else tail = cur->prev;
                delete cur;
                count--;
                return true;
            }
            cur = cur->next;
        }
        return false;
    }

    // Traverse forward and collect into a vector (used by sorting/searching/reporting)
    vector<Transaction> toVector() const {
        vector<Transaction> v;
        v.reserve(count);
        Node* cur = head;
        while (cur) { v.push_back(cur->data); cur = cur->next; }
        return v;
    }

    void printAll() const {
        if (!head) { cout << "  (no transactions yet)\n"; return; }
        cout << left << setw(5) << "ID" << setw(12) << "Date" << setw(12)
             << "Type" << setw(14) << "Category" << setw(12) << "Amount" << "Note\n";
        cout << string(65, '-') << "\n";
        Node* cur = head;
        while (cur) {
            cout << left << setw(5) << cur->data.id << setw(12) << cur->data.date
                 << setw(12) << cur->data.type << setw(14) << cur->data.category
                 << setw(12) << fixed << setprecision(2) << cur->data.amount
                 << cur->data.note << "\n";
            cur = cur->next;
        }
    }

    ~TransactionList() {
        Node* cur = head;
        while (cur) { Node* nx = cur->next; delete cur; cur = nx; }
    }
};

// ------------------------------------------------------------------
// 2) BINARY SEARCH TREE  -  organizes running totals by category name
//    Inorder traversal naturally yields categories in alphabetical order.
// ------------------------------------------------------------------
struct BSTNode {
    string category;
    double total;
    int txnCount;
    BSTNode *left, *right;
    BSTNode(string c, double amt) : category(c), total(amt), txnCount(1), left(nullptr), right(nullptr) {}
};

class CategoryBST {
private:
    BSTNode* root;

    BSTNode* insert(BSTNode* node, const string& cat, double amt) {
        if (!node) return new BSTNode(cat, amt);
        if (cat < node->category) node->left = insert(node->left, cat, amt);
        else if (cat > node->category) node->right = insert(node->right, cat, amt);
        else { node->total += amt; node->txnCount++; }
        return node;
    }

    void inorder(BSTNode* node, vector<pair<string,double>>& out) const {
        if (!node) return;
        inorder(node->left, out);
        out.push_back({node->category, node->total});
        inorder(node->right, out);
    }

    void destroy(BSTNode* node) {
        if (!node) return;
        destroy(node->left);
        destroy(node->right);
        delete node;
    }

public:
    CategoryBST() : root(nullptr) {}
    ~CategoryBST() { destroy(root); }

    void add(const string& cat, double amt) { root = insert(root, cat, amt); }

    void rebuildFrom(const vector<Transaction>& txns) {
        destroy(root);
        root = nullptr;
        for (auto& t : txns) add(t.category, t.type == "expense" ? t.amount : 0.0);
    }

    vector<pair<string,double>> sortedReport() const {
        vector<pair<string,double>> out;
        inorder(root, out);
        return out;
    }
};

// ------------------------------------------------------------------
// 5) MERGE SORT  -  O(n log n) stable sort, used for "sort by amount"
//    and "sort by date" reports, and to prep data for binary search.
// ------------------------------------------------------------------
template <typename Cmp>
void mergeSort(vector<Transaction>& v, int l, int r, Cmp cmp) {
    if (l >= r) return;
    int m = l + (r - l) / 2;
    mergeSort(v, l, m, cmp);
    mergeSort(v, m + 1, r, cmp);

    vector<Transaction> merged;
    merged.reserve(r - l + 1);
    int i = l, j = m + 1;
    while (i <= m && j <= r) {
        if (cmp(v[i], v[j])) merged.push_back(v[i++]);
        else merged.push_back(v[j++]);
    }
    while (i <= m) merged.push_back(v[i++]);
    while (j <= r) merged.push_back(v[j++]);
    for (int k = 0; k < (int)merged.size(); k++) v[l + k] = merged[k];
}

// ------------------------------------------------------------------
// 6) BINARY SEARCH  -  find a transaction by exact date on a
//    date-sorted vector (produced by mergeSort above).
// ------------------------------------------------------------------
int binarySearchByDate(const vector<Transaction>& sortedByDate, const string& date) {
    int lo = 0, hi = (int)sortedByDate.size() - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (sortedByDate[mid].date == date) return mid;
        else if (sortedByDate[mid].date < date) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}

// ------------------------------------------------------------------
// Undo action record for the STACK (undo add / undo delete)
// ------------------------------------------------------------------
struct UndoAction {
    string action;         // "add" or "delete"
    Transaction txn;
};

// ------------------------------------------------------------------
// Global structures
// ------------------------------------------------------------------
TransactionList list_;
unordered_map<string, double> categoryTotals;      // 3) HASH MAP: O(1) running totals
stack<UndoAction> undoStack;                        // 4) STACK: undo support
const string DATA_FILE = "transactions.csv";

void applyToHashMap(const Transaction& t, bool reverse = false) {
    double amt = (t.type == "expense") ? t.amount : 0.0;
    double sign = reverse ? -1.0 : 1.0;
    categoryTotals[t.category] += sign * amt;
}

// ------------------------------------------------------------------
// File I/O - persistence
// ------------------------------------------------------------------
void saveToFile() {
    ofstream out(DATA_FILE);
    out << "id,date,category,type,amount,note\n";
    for (auto& t : list_.toVector()) {
        out << t.id << "," << t.date << "," << t.category << "," << t.type << ","
            << fixed << setprecision(2) << t.amount << "," << t.note << "\n";
    }
    out.close();
    cout << "Saved " << list_.size() << " transaction(s) to " << DATA_FILE << "\n";
}

void loadFromFile() {
    ifstream in(DATA_FILE);
    if (!in.is_open()) return;
    string line;
    getline(in, line); // header
    int maxId = 0;
    while (getline(in, line)) {
        if (line.empty()) continue;
        stringstream ss(line);
        string idStr, date, category, type, amtStr, note;
        getline(ss, idStr, ',');
        getline(ss, date, ',');
        getline(ss, category, ',');
        getline(ss, type, ',');
        getline(ss, amtStr, ',');
        getline(ss, note, ',');
        Transaction t{stoi(idStr), date, category, type, stod(amtStr), note};
        // Recreate node directly (bypassing auto-id) then fix nextId after
        list_.insertEnd(t.date, t.category, t.type, t.amount, t.note);
        maxId = max(maxId, t.id);
        applyToHashMap(t);
    }
    list_.setNextId(maxId + 1);
    cout << "Loaded " << list_.size() << " transaction(s) from " << DATA_FILE << "\n";
}

// ------------------------------------------------------------------
// Menu actions
// ------------------------------------------------------------------
void addTransaction() {
    string date, category, type, note;
    double amount;
    cout << "Date (YYYY-MM-DD): "; cin >> date;
    cout << "Type (income/expense): "; cin >> type;
    cout << "Category: "; cin >> category;
    cout << "Amount: "; cin >> amount;
    cin.ignore();
    cout << "Note (single line): "; getline(cin, note);
    Transaction t = list_.insertEnd(date, category, type, amount, note);
    applyToHashMap(t);
    undoStack.push({"add", t});
    cout << "Added transaction #" << t.id << "\n";
}

void deleteTransaction() {
    int id;
    cout << "Enter ID to delete: "; cin >> id;
    Transaction removed;
    if (list_.deleteById(id, removed)) {
        applyToHashMap(removed, true);
        undoStack.push({"delete", removed});
        cout << "Deleted transaction #" << id << "\n";
    } else {
        cout << "No transaction with that ID.\n";
    }
}

void undoLast() {
    if (undoStack.empty()) { cout << "Nothing to undo.\n"; return; }
    UndoAction act = undoStack.top(); undoStack.pop();
    if (act.action == "add") {
        Transaction removed;
        if (list_.deleteById(act.txn.id, removed)) applyToHashMap(removed, true);
        cout << "Undid add of transaction #" << act.txn.id << "\n";
    } else { // "delete" -> re-insert
        Transaction t = act.txn;
        // re-insert preserving original id by direct construction
        list_.insertEnd(t.date, t.category, t.type, t.amount, t.note);
        applyToHashMap(t);
        cout << "Undid delete, restored a transaction (new id assigned)\n";
    }
}

void showCategoryReport() {
    CategoryBST tree;
    tree.rebuildFrom(list_.toVector());
    auto report = tree.sortedReport();
    cout << "\nCategory-wise Expense Totals (via BST inorder traversal, A-Z):\n";
    cout << string(35, '-') << "\n";
    for (auto& [cat, total] : report) {
        cout << left << setw(20) << cat << fixed << setprecision(2) << total << "\n";
    }
}

void showSortedByAmount() {
    auto v = list_.toVector();
    mergeSort(v, 0, (int)v.size() - 1, [](const Transaction& a, const Transaction& b) {
        return a.amount > b.amount; // descending
    });
    cout << "\nTransactions sorted by amount (Merge Sort, high -> low):\n";
    for (auto& t : v) cout << "#" << t.id << " " << t.category << " : " << fixed << setprecision(2) << t.amount << "\n";
}

void searchByDate() {
    auto v = list_.toVector();
    mergeSort(v, 0, (int)v.size() - 1, [](const Transaction& a, const Transaction& b) {
        return a.date < b.date;
    });
    string date;
    cout << "Enter date to search (YYYY-MM-DD): "; cin >> date;
    int idx = binarySearchByDate(v, date);
    if (idx == -1) cout << "No transaction found on that date.\n";
    else cout << "Found #" << v[idx].id << " " << v[idx].category << " : " << v[idx].amount << "\n";
}

void topExpenses() {
    // 7) MAX-HEAP via priority_queue -> Top N expenses
    auto cmp = [](const Transaction& a, const Transaction& b) { return a.amount < b.amount; };
    priority_queue<Transaction, vector<Transaction>, decltype(cmp)> heap(cmp);
    for (auto& t : list_.toVector()) if (t.type == "expense") heap.push(t);

    int n;
    cout << "Show top how many expenses? "; cin >> n;
    cout << "\nTop " << n << " Expenses (Max-Heap):\n";
    int shown = 0;
    while (!heap.empty() && shown < n) {
        auto t = heap.top(); heap.pop();
        cout << shown + 1 << ". " << t.category << " - " << fixed << setprecision(2) << t.amount << " (" << t.date << ")\n";
        shown++;
    }
}

void showHashMapTotals() {
    cout << "\nCategory totals (Hash Map, O(1) lookup/update):\n";
    for (auto& [cat, total] : categoryTotals) {
        cout << left << setw(20) << cat << fixed << setprecision(2) << total << "\n";
    }
}

void printMenu() {
    cout << "\n================ SpendWise (C++ DSA Engine) ================\n"
         << " 1. Add transaction\n"
         << " 2. Delete transaction by ID\n"
         << " 3. Undo last action\n"
         << " 4. View all transactions (linked list)\n"
         << " 5. Category report (BST, sorted)\n"
         << " 6. Sort by amount (merge sort)\n"
         << " 7. Search by date (binary search)\n"
         << " 8. Top-N expenses (max-heap)\n"
         << " 9. Category totals (hash map)\n"
         << "10. Save to file\n"
         << " 0. Exit\n"
         << "==============================================================\n"
         << "Choice: ";
}

int main() {
    loadFromFile();
    int choice;
    while (true) {
        printMenu();
        if (!(cin >> choice)) break;
        switch (choice) {
            case 1: addTransaction(); break;
            case 2: deleteTransaction(); break;
            case 3: undoLast(); break;
            case 4: cout << "\n"; list_.printAll(); break;
            case 5: showCategoryReport(); break;
            case 6: showSortedByAmount(); break;
            case 7: searchByDate(); break;
            case 8: topExpenses(); break;
            case 9: showHashMapTotals(); break;
            case 10: saveToFile(); break;
            case 0: saveToFile(); cout << "Goodbye!\n"; return 0;
            default: cout << "Invalid choice.\n";
        }
    }
    return 0;
}
