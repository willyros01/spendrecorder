/* =====================================================================
   SpendRecorder — STORAGE: SQLite on the phone, one transaction per change
   =====================================================================
   The database is the only source of truth. The screens show a read copy
   that is rebuilt FROM THE DATABASE after every successful commit; nothing
   is ever written to that copy directly.

   Every change is a list of operations committed in ONE SQLite transaction
   (executeSet with transaction:true): BEGIN … COMMIT, or ROLLBACK if any
   statement fails. The app only says "saved" after COMMIT returns. If it
   fails, nothing changes and a dialog says what was NOT saved.

   Tables
     expenses    one row per expense
     receipts    the receipt photo of an expense   → expenses ON DELETE CASCADE
     categories  ordered category list
     vendors     vendor list
     settings    home currency, recent currencies, last-known rates,
                 terms acceptance

   Phone app: @capacitor-community/sqlite (plain database in
   Library/CapacitorDatabase, included in the iPhone's iCloud Backup).
   Web browser (the Safari test page only): the same operations applied to
   one JSON snapshot in localStorage, written whole or not at all, under its
   OWN key so it can never touch the Expense Ledger web app's data
   (both live on willyros01.github.io and would otherwise share storage). */

var CapNS = window.Capacitor || null;
var isNative = !!(CapNS && CapNS.isNativePlatform && CapNS.isNativePlatform());
var NativePlugins = (isNative && CapNS.Plugins) || {};
var SQL = NativePlugins.CapacitorSQLite || null;
var FS = NativePlugins.Filesystem || null;
var ShareP = NativePlugins.Share || null;

var DBNAME = "spendrecorder";
var SCHEMA_VERSION = 1;
var WEB_KEY = "spendrecorder_db";

var SCHEMA = [
  "CREATE TABLE IF NOT EXISTS expenses (" +
  " id TEXT PRIMARY KEY NOT NULL, date TEXT NOT NULL, amount REAL NOT NULL CHECK (amount > 0)," +
  " currency TEXT NOT NULL, vendor TEXT NOT NULL, category TEXT NOT NULL, comments TEXT," +
  " home TEXT NOT NULL, rate REAL NOT NULL CHECK (rate > 0)," +
  " rate_date TEXT, rate_source TEXT, amount_home REAL NOT NULL, created_at INTEGER, updated_at INTEGER);",
  "CREATE INDEX IF NOT EXISTS expenses_by_date ON expenses(date);",
  "CREATE TABLE IF NOT EXISTS receipts (" +
  " expense_id TEXT PRIMARY KEY NOT NULL REFERENCES expenses(id) ON DELETE CASCADE, data TEXT NOT NULL);",
  "CREATE TABLE IF NOT EXISTS categories (pos INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE);",
  "CREATE TABLE IF NOT EXISTS vendors (name TEXT PRIMARY KEY NOT NULL);",
  "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT);"
].join("\n");

var UPSERT_EXPENSE =
  "INSERT INTO expenses (id, date, amount, currency, vendor, category, comments," +
  " home, rate, rate_date, rate_source, amount_home, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)" +
  " ON CONFLICT(id) DO UPDATE SET date=excluded.date, amount=excluded.amount, currency=excluded.currency," +
  " vendor=excluded.vendor, category=excluded.category, comments=excluded.comments," +
  " home=excluded.home, rate=excluded.rate," +
  " rate_date=excluded.rate_date, rate_source=excluded.rate_source, amount_home=excluded.amount_home," +
  " updated_at=excluded.updated_at;";
/* Note: an upsert, never INSERT OR REPLACE — REPLACE deletes the row first,
   which would cascade and silently drop the receipt photo. */

function expenseValues(e){
  var now = Date.now();
  return [e.id, e.date, Number(e.amount), e.currency, e.vendor, e.category, e.comments || "", e.home, Number(e.rate),
          e.rateDate || null, e.rateSource || null, Number(e.amountHome), e.createdAt || now, e.updatedAt || now];
}

/* ---------- operations (what a commit is made of) ----------
   { op:"putEntry", entry, receipt }   receipt: undefined = keep, null = remove, "data:…" = store
   { op:"deleteEntries", ids }
   { op:"setCategories", list }        { op:"setVendors", list }      { op:"addVendor", name }
   { op:"setting", key, value }        value null removes the setting */

var receiptCache = new Map();          // expense id -> data URL, read-only copy of the receipts table
var commitChain = Promise.resolve();
var storageBlocked = "";

function rowsOf(res){
  return ((res && res.values) || []).filter(function(r){ return !(r && Object.prototype.hasOwnProperty.call(r, "ios_columns")); });
}
function q(statement, values){
  return SQL.query({ database: DBNAME, statement: statement, values: values || [], readonly: false }).then(rowsOf);
}

/* ======================= SQLite (phone) ======================= */
function sqliteOpen(){
  if (!SQL) return Promise.reject(new Error("the database component is missing from this build"));
  return Promise.resolve()
    .then(function(){ return SQL.checkConnectionsConsistency({ dbNames: [], openModes: [] }).catch(function(){}); })
    .then(function(){
      return SQL.createConnection({ database: DBNAME, version: 1, encrypted: false, mode: "no-encryption", readonly: false })
        .catch(function(e){ if (!/already exists/i.test((e && e.message) || "")) throw e; });
    })
    .then(function(){ return SQL.open({ database: DBNAME, readonly: false }); })
    .then(function(){
      return SQL.execute({ database: DBNAME, statements: "PRAGMA foreign_keys = ON;\nPRAGMA synchronous = FULL;", transaction: false, readonly: false });
    })
    .then(function(){ return q("PRAGMA quick_check;"); })
    .then(function(r){
      var v = r[0] ? r[0][Object.keys(r[0])[0]] : "ok";
      if (String(v).toLowerCase() !== "ok") throw new Error("the database failed its integrity check (" + v + ")");
    })
    .then(function(){ return SQL.execute({ database: DBNAME, statements: SCHEMA, transaction: true, readonly: false }); })
    .then(function(){
      return SQL.executeSet({ database: DBNAME, transaction: true, readonly: false, set: [
        { statement: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);", values: ["schema_version", String(SCHEMA_VERSION)] }
      ]});
    });
}

function sqliteStatements(ops){
  var set = [];
  ops.forEach(function(o){
    if (o.op === "putEntry") {
      set.push({ statement: UPSERT_EXPENSE, values: expenseValues(o.entry) });
      if (o.receipt === null) set.push({ statement: "DELETE FROM receipts WHERE expense_id = ?;", values: [o.entry.id] });
      else if (typeof o.receipt === "string") set.push({ statement: "INSERT OR REPLACE INTO receipts (expense_id, data) VALUES (?, ?);", values: [o.entry.id, o.receipt] });
    } else if (o.op === "deleteEntries") {
      if (o.ids.length) set.push({ statement: "DELETE FROM expenses WHERE id IN (" + o.ids.map(function(){ return "?"; }).join(",") + ");", values: o.ids.slice() });
    } else if (o.op === "setCategories") {
      set.push({ statement: "DELETE FROM categories;", values: [] });
      o.list.forEach(function(c, i){ set.push({ statement: "INSERT OR IGNORE INTO categories (pos, name) VALUES (?, ?);", values: [i, c] }); });
    } else if (o.op === "setVendors") {
      set.push({ statement: "DELETE FROM vendors;", values: [] });
      o.list.forEach(function(v){ set.push({ statement: "INSERT OR IGNORE INTO vendors (name) VALUES (?);", values: [v] }); });
    } else if (o.op === "addVendor") {
      set.push({ statement: "INSERT OR IGNORE INTO vendors (name) VALUES (?);", values: [o.name] });
    } else if (o.op === "setting") {
      set.push(o.value === null
        ? { statement: "DELETE FROM settings WHERE key = ?;", values: [o.key] }
        : { statement: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);", values: [o.key, String(o.value)] });
    }
  });
  return set;
}
function sqliteCommit(ops){
  var set = sqliteStatements(ops);
  if (!set.length) return Promise.resolve();
  return SQL.executeSet({ database: DBNAME, set: set, transaction: true, readonly: false, returnMode: "no" });
}
function rowToEntry(e){
  return { id: e.id, date: e.date, amount: Number(e.amount), currency: e.currency, vendor: e.vendor, category: e.category,
           comments: e.comments || "", home: e.home, rate: Number(e.rate),
           rateDate: e.rate_date || null, rateSource: e.rate_source || null, amountHome: Number(e.amount_home),
           createdAt: Number(e.created_at) || 0, updatedAt: Number(e.updated_at) || 0, hasReceipt: !!Number(e.has_receipt) };
}
function sqliteLoad(){
  return Promise.all([
    q("SELECT e.*, (r.expense_id IS NOT NULL) AS has_receipt FROM expenses e LEFT JOIN receipts r ON r.expense_id = e.id;"),
    q("SELECT name FROM categories ORDER BY pos;"),
    q("SELECT name FROM vendors ORDER BY name;"),
    q("SELECT key, value FROM settings;")
  ]).then(function(r){
    var settings = {};
    r[3].forEach(function(x){ settings[x.key] = x.value; });
    var cats = r[1].map(function(x){ return x.name; });
    return { entries: r[0].map(rowToEntry), categories: cats.length ? cats : null,
             vendors: r[2].map(function(x){ return x.name; }), settings: settings };
  });
}
function sqliteReceipt(id){
  return q("SELECT data FROM receipts WHERE expense_id = ?;", [id]).then(function(r){ return r[0] ? r[0].data : null; });
}

/* ======================= web browser (test page) ======================= */
var webState = null, webStorageOK = true;
function webEmpty(){ return { entries: [], receipts: {}, categories: null, vendors: [], settings: {} }; }
function webCommit(ops){
  var next = JSON.parse(JSON.stringify(webState));       // work on a copy; the committed state is untouched
  ops.forEach(function(o){
    if (o.op === "putEntry") {
      var rec = Object.assign({}, o.entry); delete rec.hasReceipt; delete rec.amountH; delete rec.converted;
      ["id","date","currency","vendor","category","home"].forEach(function(k){ if (!rec[k]) throw new Error("the expense is missing its " + k); });
      if (!(Number(rec.amount) > 0)) throw new Error("an amount must be greater than zero");
      if (!(Number(rec.rate) > 0)) throw new Error("a rate must be greater than zero");
      var i = next.entries.findIndex(function(x){ return x.id === rec.id; });
      if (i >= 0) { rec.createdAt = next.entries[i].createdAt || rec.createdAt; next.entries[i] = rec; } else next.entries.push(rec);
      if (o.receipt === null) delete next.receipts[rec.id];
      else if (typeof o.receipt === "string") next.receipts[rec.id] = o.receipt;
    } else if (o.op === "deleteEntries") {
      next.entries = next.entries.filter(function(x){ return o.ids.indexOf(x.id) === -1; });
      o.ids.forEach(function(id){ delete next.receipts[id]; });           // cascade
    } else if (o.op === "setCategories") {
      var seen = {}; next.categories = o.list.filter(function(c){ if (seen[c]) return false; seen[c] = 1; return true; });
    } else if (o.op === "setVendors") {
      next.vendors = Array.from(new Set(o.list)).sort(function(a, b){ return a.localeCompare(b); });
    } else if (o.op === "addVendor") {
      if (next.vendors.indexOf(o.name) === -1) { next.vendors.push(o.name); next.vendors.sort(function(a, b){ return a.localeCompare(b); }); }
    } else if (o.op === "setting") {
      if (o.value === null) delete next.settings[o.key]; else next.settings[o.key] = String(o.value);
    }
  });
  if (webStorageOK) {
    try { window.localStorage.setItem(WEB_KEY, JSON.stringify(next)); }
    catch (e) { return Promise.reject(new Error("this browser’s storage is full")); }
  }
  webState = next;                                       // committed
  return Promise.resolve();
}
function webLoad(){
  var st = JSON.parse(JSON.stringify(webState));
  return Promise.resolve({
    entries: st.entries.map(function(e){ e.hasReceipt = !!st.receipts[e.id]; return e; }),
    categories: st.categories && st.categories.length ? st.categories : null,
    vendors: st.vendors, settings: st.settings
  });
}
function webOpen(){
  try { window.localStorage.setItem("_spendrecorder_test", "1"); window.localStorage.removeItem("_spendrecorder_test"); }
  catch (e) { webStorageOK = false; }
  webState = webEmpty();
  if (!webStorageOK) return Promise.resolve();
  var raw = null;
  try { raw = window.localStorage.getItem(WEB_KEY); } catch (e) {}
  if (raw) {
    try { webState = Object.assign(webEmpty(), JSON.parse(raw)); }
    catch (e) { return Promise.reject(new Error("the saved test data is damaged")); }
  }
  return Promise.resolve();
}

/* ======================= common entry points ======================= */
var Store = {
  isNative: isNative,
  open: function(){
    return (isNative ? sqliteOpen() : webOpen()).catch(function(e){
      storageBlocked = "Your saved data could not be opened (" + ((e && e.message) || "storage error") +
        "). To protect it, nothing will be saved until it opens. Close the app completely and open it again.";
      throw new Error(storageBlocked);
    });
  },
  /* Commit operations as one transaction; one commit at a time, in order. */
  commit: function(ops){
    var run = function(){
      if (storageBlocked) return Promise.reject(new Error(storageBlocked));
      return (isNative ? sqliteCommit(ops) : webCommit(ops)).then(function(){
        ops.forEach(function(o){
          if (o.op === "putEntry" && o.receipt !== undefined) receiptCache.delete(o.entry.id);
          if (o.op === "deleteEntries") o.ids.forEach(function(id){ receiptCache.delete(id); });
        });
      });
    };
    var p = commitChain.then(run, run);
    commitChain = p.catch(function(){});
    return p;
  },
  load: function(){ return isNative ? sqliteLoad() : webLoad(); },
  getReceipt: function(id){
    if (receiptCache.has(id)) return Promise.resolve(receiptCache.get(id));
    var p = isNative ? sqliteReceipt(id) : Promise.resolve(webState.receipts[id] || null);
    return p.then(function(d){ if (d) receiptCache.set(id, d); return d; });
  }
};
window.Store = Store;
