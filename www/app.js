"use strict";
/* SpendRecorder — the app (React, compiled to www/app.js at build time).
   Made from Expense Ledger build v13. Storage is in www/storage.js. */
const { useState, useEffect, useMemo, useCallback, useRef } = React;
const APP_VERSION = "1.0.2";
const APP_NAME = "SpendRecorder";
const DEFAULT_CATEGORIES = ["Food & Dining", "Transportation", "Accommodation", "Utilities", "Office & Supplies", "Health & Wellness", "Entertainment", "Other"];
const UNDO_WINDOW_MS = 6000;
const DEFAULT_HOME = "CAD";
const START_CURRENCY = "CAD"; // every new expense starts in Canadian Dollar
const FETCH_TIMEOUT_MS = 8000; // a weak signal never leaves "Saving…" hanging
const CURRENCIES = [
    ["PHP", "Philippine Peso"], ["USD", "US Dollar"], ["CAD", "Canadian Dollar"], ["EUR", "Euro"],
    ["GBP", "British Pound"], ["JPY", "Japanese Yen"], ["AUD", "Australian Dollar"], ["NZD", "New Zealand Dollar"],
    ["CHF", "Swiss Franc"], ["CNY", "Chinese Yuan"], ["HKD", "Hong Kong Dollar"], ["SGD", "Singapore Dollar"],
    ["INR", "Indian Rupee"], ["IDR", "Indonesian Rupiah"], ["MYR", "Malaysian Ringgit"], ["THB", "Thai Baht"],
    ["VND", "Vietnamese Dong"], ["KRW", "South Korean Won"], ["TWD", "Taiwan Dollar"], ["AED", "UAE Dirham"],
    ["SAR", "Saudi Riyal"], ["QAR", "Qatari Riyal"], ["KWD", "Kuwaiti Dinar"], ["BHD", "Bahraini Dinar"],
    ["OMR", "Omani Rial"], ["ILS", "Israeli Shekel"], ["TRY", "Turkish Lira"], ["ZAR", "South African Rand"],
    ["EGP", "Egyptian Pound"], ["NGN", "Nigerian Naira"], ["KES", "Kenyan Shilling"], ["GHS", "Ghanaian Cedi"],
    ["MAD", "Moroccan Dirham"], ["MXN", "Mexican Peso"], ["BRL", "Brazilian Real"], ["ARS", "Argentine Peso"],
    ["CLP", "Chilean Peso"], ["COP", "Colombian Peso"], ["PEN", "Peruvian Sol"], ["UYU", "Uruguayan Peso"],
    ["NOK", "Norwegian Krone"], ["SEK", "Swedish Krona"], ["DKK", "Danish Krone"], ["PLN", "Polish Zloty"],
    ["CZK", "Czech Koruna"], ["HUF", "Hungarian Forint"], ["RON", "Romanian Leu"], ["BGN", "Bulgarian Lev"],
    ["ISK", "Icelandic Krona"], ["RUB", "Russian Ruble"], ["UAH", "Ukrainian Hryvnia"],
    ["PKR", "Pakistani Rupee"], ["BDT", "Bangladeshi Taka"], ["LKR", "Sri Lankan Rupee"], ["NPR", "Nepalese Rupee"],
    ["MMK", "Myanmar Kyat"], ["KHR", "Cambodian Riel"], ["LAK", "Lao Kip"], ["BND", "Brunei Dollar"],
    ["FJD", "Fijian Dollar"], ["PGK", "Papua New Guinean Kina"], ["XPF", "CFP Franc"], ["JMD", "Jamaican Dollar"],
    ["TTD", "Trinidad & Tobago Dollar"], ["BBD", "Barbadian Dollar"], ["BSD", "Bahamian Dollar"], ["DOP", "Dominican Peso"],
    ["GTQ", "Guatemalan Quetzal"], ["HNL", "Honduran Lempira"], ["CRC", "Costa Rican Colon"], ["PAB", "Panamanian Balboa"],
    ["BOB", "Bolivian Boliviano"], ["PYG", "Paraguayan Guarani"], ["XOF", "West African CFA Franc"],
    ["XAF", "Central African CFA Franc"], ["ETB", "Ethiopian Birr"], ["TZS", "Tanzanian Shilling"], ["UGX", "Ugandan Shilling"],
    ["RWF", "Rwandan Franc"], ["ZMW", "Zambian Kwacha"], ["BWP", "Botswana Pula"], ["MUR", "Mauritian Rupee"],
    ["DZD", "Algerian Dinar"], ["TND", "Tunisian Dinar"], ["LYD", "Libyan Dinar"], ["JOD", "Jordanian Dinar"],
    ["LBP", "Lebanese Pound"], ["IQD", "Iraqi Dinar"], ["IRR", "Iranian Rial"], ["AFN", "Afghan Afghani"],
    ["AZN", "Azerbaijani Manat"], ["GEL", "Georgian Lari"], ["AMD", "Armenian Dram"], ["KZT", "Kazakhstani Tenge"],
    ["UZS", "Uzbekistani Som"], ["MNT", "Mongolian Tugrik"], ["RSD", "Serbian Dinar"], ["MKD", "Macedonian Denar"],
    ["ALL", "Albanian Lek"], ["BAM", "Bosnia-Herzegovina Mark"], ["MDL", "Moldovan Leu"], ["BYN", "Belarusian Ruble"],
];
// (Croatian Kuna and Venezuelan Bolivar removed: both currencies no longer exist, so they could
//  only ever save with a placeholder rate.)
CURRENCIES.sort((a, b) => a[0].localeCompare(b[0]));
const CURRENCY_CODES = CURRENCIES.map(c => c[0]);
const CURRENCY_NAMES = Object.fromEntries(CURRENCIES);
function curName(code) { return CURRENCY_NAMES[code] || code; }
const PALETTE = ["#0F766E", "#B45309", "#7C3AED", "#BE123C", "#0369A1", "#15803D", "#A21CAF", "#C2410C", "#1D4ED8", "#0F9B8E", "#92400E", "#5B21B6"];
function colorFor(name) { let h = 0; for (let i = 0; i < name.length; i++)
    h = name.charCodeAt(i) + ((h << 5) - h); return PALETTE[Math.abs(h) % PALETTE.length]; }
function safeJSON(s, dflt) { try {
    const v = JSON.parse(s);
    return v == null ? dflt : v;
}
catch (e) {
    return dflt;
} }
/* Dates are the phone's LOCAL date. (Expense Ledger used the UTC date, so after
   8 pm in Toronto a new expense defaulted to tomorrow.) */
function localDateStr(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function todayStr() { return localDateStr(new Date()); }
function emptyForm(defaultCategory) {
    return { date: todayStr(), amount: "", currency: START_CURRENCY, vendor: "", category: defaultCategory || "Other",
        comments: "", receipt: null, receiptDirty: false, rateFixed: null };
}
// Pinned to en-CA rather than the device locale. Dollar-family currencies get an
// unambiguous prefix (C$, US$, A$ …) so they can never be mistaken for each other.
const DOLLAR_PREFIX = { CAD: "C$", USD: "US$", AUD: "A$", NZD: "NZ$", HKD: "HK$", SGD: "S$", MXN: "MX$",
    TWD: "NT$", BSD: "B$", BBD: "Bds$", JMD: "J$", TTD: "TT$", FJD: "FJ$", BND: "B$" };
function fmtAmount(n, code) {
    try {
        const parts = new Intl.NumberFormat("en-CA", { style: "currency", currency: code }).formatToParts(Number(n) || 0);
        return parts.map(p => p.type === "currency" && (p.value === "$" || p.value === code) && DOLLAR_PREFIX[code] ? DOLLAR_PREFIX[code] : p.value).join("");
    }
    catch (e) {
        return `${code} ${(Number(n) || 0).toFixed(2)}`;
    }
}
function fmtRate(v) {
    if (!(v > 0))
        return "—";
    if (v >= 100)
        return v.toFixed(2);
    if (v >= 1)
        return v.toFixed(4);
    return Number(v.toPrecision(4)).toString();
}
function monthLabel(ym) { const [y, m] = ym.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-CA", { month: "long", year: "numeric" }); }
function monthLabelOf(ym) { const [y, m] = ym.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-CA", { month: "short", year: "numeric" }); }
function dedupKey(en) { return `${en.date}|${en.vendor.trim().toLowerCase()}|${en.currency}|${Number(en.amount).toFixed(2)}`; }
// Vendors and categories are always listed A to Z (ignoring capitals), including right after adding one.
function byName(a, b) { return a.localeCompare(b, "en", { sensitivity: "base" }); }
function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function compressImage(file, maxWidth = 600, quality = 0.5) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.onerror = () => reject(new Error("Could not read image"));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
    });
}
async function compressImageSafe(file) {
    const attempts = [[600, 0.5], [450, 0.35], [320, 0.25]];
    for (const [w, q] of attempts) {
        const dataUrl = await compressImage(file, w, q);
        if (dataUrl.length < 650000)
            return dataUrl;
    }
    return null;
}
/* ===================== exchange rates: source currency -> home currency =====================
   Tried in this order; every result says where it came from:
     1. Frankfurter — the rate for the expense's own date ("frankfurter", with the date it applies to)
     2. Frankfurter — the nearest date within 10 days     ("frankfurter")
     3. ExchangeRate-API — today's rate, labelled as TODAY's, never as the expense's date ("today")
     4. The last rate downloaded for that pair, kept in the database ("cached")
     5. A 1:1 placeholder, clearly labelled ("placeholder")
   Plus "manual" (typed by you) and "home" (no conversion needed). */
async function getJSON(url) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS) : null;
    try {
        const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
        if (!res.ok)
            throw new Error("HTTP " + res.status);
        return await res.json();
    }
    finally {
        if (t)
            clearTimeout(t);
    }
}
async function frankfurterRate(currency, home, dateStr) {
    const latest = dateStr >= todayStr();
    const data = await getJSON(latest ? `https://api.frankfurter.app/latest?from=${currency}&to=${home}`
        : `https://api.frankfurter.app/${dateStr}?from=${currency}&to=${home}`);
    const r = data && data.rates && data.rates[home];
    if (!(r > 0))
        throw new Error("no rate");
    return { rate: r, usedDate: data.date || dateStr, source: "frankfurter" };
}
async function frankfurterNearby(currency, home, dateStr) {
    const target = new Date(dateStr + "T00:00:00");
    const start = new Date(target);
    start.setDate(start.getDate() - 10);
    const end = new Date(target);
    end.setDate(end.getDate() + 10);
    const today = new Date();
    const clampedEnd = end > today ? today : end;
    const data = await getJSON(`https://api.frankfurter.app/${localDateStr(start)}..${localDateStr(clampedEnd)}?from=${currency}&to=${home}`);
    const rates = data && data.rates;
    if (!rates)
        return null;
    let best = null, bestDiff = Infinity;
    for (const dt of Object.keys(rates)) {
        const diff = Math.abs(new Date(dt + "T00:00:00") - target);
        if (diff < bestDiff && rates[dt] && rates[dt][home] > 0) {
            bestDiff = diff;
            best = dt;
        }
    }
    return best ? { rate: rates[best][home], usedDate: best, source: "frankfurter" } : null;
}
async function exchangeRateApiToday(currency, home) {
    const data = await getJSON(`https://api.exchangerate-api.com/v4/latest/${currency}`);
    const r = data && data.rates && data.rates[home];
    if (!(r > 0))
        throw new Error("no rate");
    return { rate: r, usedDate: data.date || todayStr(), source: "today" };
}
function pairKey(currency, home) { return `${currency}>${home}`; }
async function fetchRateWithFallback(currency, home, dateStr, cache) {
    if (currency === home)
        return { rate: 1, usedDate: dateStr, source: "home" };
    try {
        return await frankfurterRate(currency, home, dateStr);
    }
    catch (e) { }
    try {
        const n = await frankfurterNearby(currency, home, dateStr);
        if (n)
            return n;
    }
    catch (e) { }
    try {
        return await exchangeRateApiToday(currency, home);
    }
    catch (e) { }
    const c = cache && cache[pairKey(currency, home)];
    if (c && c.rate > 0)
        return { rate: c.rate, usedDate: c.date, source: "cached" };
    return { rate: 1, usedDate: null, source: "placeholder" };
}
const isDownloaded = src => src === "frankfurter" || src === "today";
/* Where a rate came from, in plain words — always shown, never a hidden tooltip. */
function rateSourceLabel(source, usedDate, expenseDate) {
    switch (source) {
        case "home": return "home currency";
        case "frankfurter":
            return `Frankfurter · rate for ${usedDate}` + (expenseDate && usedDate && usedDate !== expenseDate ? ` (nearest to ${expenseDate})` : "");
        case "today":
            return `ExchangeRate-API · today's rate (${usedDate})` + (expenseDate && usedDate && usedDate !== expenseDate ? ` — not the rate for ${expenseDate}` : "");
        case "cached": return `last known rate, from ${usedDate || "an earlier day"} — no rate service reachable`;
        case "manual": return "your own rate";
        case "placeholder": return "no rate available — 1:1 placeholder, edit to fix";
        default: return source ? `${source}${usedDate ? " · " + usedDate : ""}` : "—";
    }
}
function rateLine(currency, home, rate) { return `1 ${currency} = ${fmtRate(rate)} ${home}`; }
/* ---------------- native share sheet / files ---------------- */
function utf8ToBase64(str) { return bytesToBase64(new TextEncoder().encode(str)); }
function bytesToBase64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000)
        s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
}
function isCancel(err) { return /cancel/i.test((err && (err.message || err.errorMessage)) || "") || (err && err.name === "AbortError"); }
async function shareFileNative(filename, base64, text) {
    await FS.writeFile({ path: filename, directory: "CACHE", data: base64 });
    const r = await FS.getUri({ path: filename, directory: "CACHE" });
    const opts = { title: filename, files: [r.uri] };
    if (text)
        opts.text = text;
    await ShareP.share(opts);
}
/* ===================== terms of use (first use; the app stays locked until accepted) ===================== */
const TERMS_VERSION = "1";
const TERMS_DATE = "October 9, 2026";
const TERMS = [
    ["1. Who provides SpendRecorder", "SpendRecorder is provided by Wilfredo Rosales, an individual developer (“we”, “us”). These terms are an agreement between you and us."],
    ["2. A free app", "SpendRecorder is free. There are no fees, subscriptions, advertising or in-app purchases."],
    ["3. Provided “as is”", "SpendRecorder is provided “as is” and “as available”, without any warranty or condition of any kind, express or implied, including any warranty of merchantability, fitness for a particular purpose, accuracy or non-infringement. We do not promise that SpendRecorder will be free of errors, will always work, or will never lose data."],
    ["4. You check the numbers", "SpendRecorder helps you record your own expenses. Exchange rates come from free third-party services (Frankfurter and ExchangeRate-API) and may be late, wrong or unavailable. You are responsible for checking every amount and exchange rate before you rely on it or share it. SpendRecorder does not move money."],
    ["5. Your data and copies", "SpendRecorder collects no personal information. Your data is kept only on your device. You are responsible for keeping your own copies (Export, on the Summary screen). Receipt photos are not included in exports. Data that is not copied is lost if you delete the app or lose your device."],
    ["6. No liability", "To the fullest extent permitted by law, we accept no liability of any kind for any loss or damage arising from your use of SpendRecorder or your inability to use it. This includes lost money, lost data, wrong calculations or exchange rates, and any direct, indirect, incidental, special or consequential damages, even if we were told such loss was possible. You use SpendRecorder entirely at your own risk."],
    ["7. Your rights under the law", "Some places do not allow certain warranties or liabilities to be excluded. Where that is the case, the exclusions in these terms apply only as far as the law allows. Nothing in these terms takes away rights you have by law that cannot be given up."],
    ["8. Apple", "These terms are between you and us, not Apple. Apple is not responsible for SpendRecorder or its content, has no obligation to provide maintenance or support for it, and is not responsible for any claim relating to it. Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them. Apple’s Licensed Application End User License Agreement also applies to your use of SpendRecorder."],
    ["9. Changes to these terms", "We may change these terms in a later version of SpendRecorder. If we do, SpendRecorder will show you the new terms and ask you to accept them before you can continue using it."],
    ["10. Governing law", "These terms are governed by the laws of the Province of Ontario and the federal laws of Canada that apply there, except where the law of the place you live requires otherwise."],
    ["11. Contact", "Questions about SpendRecorder or these terms: willyros01@gmail.com"],
];
function TermsGate({ mode, onAccept, onClose, storageError }) {
    const [checked, setChecked] = useState(false);
    const [declined, setDeclined] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => { window.scrollTo(0, 0); }, [declined]);
    if (declined) {
        return (React.createElement("div", { className: "termsgate" },
            React.createElement("div", { className: "tg" },
                React.createElement("h1", null,
                    APP_NAME,
                    " is locked"),
                React.createElement("p", null,
                    "You declined the Terms of Use. ",
                    APP_NAME,
                    " cannot be used unless you accept them."),
                React.createElement("p", null, "You can close the app now. If you change your mind, tap the button below to read the terms again."),
                React.createElement("button", { className: "btn btn-primary tgbtn", onClick: () => { setDeclined(false); setChecked(false); } }, "Read the terms again"))));
    }
    return (React.createElement("div", { className: "termsgate", role: "dialog", "aria-modal": "true" },
        React.createElement("div", { className: "tg" },
            React.createElement("h1", null,
                APP_NAME,
                " Terms of Use"),
            React.createElement("p", { className: "tsub" },
                "Version ",
                TERMS_VERSION,
                " \u00B7 Effective ",
                TERMS_DATE),
            mode === "accept" && React.createElement("p", null,
                React.createElement("b", null,
                    "Please read these terms. You must accept them to use ",
                    APP_NAME,
                    ".")),
            React.createElement("div", { className: "tbox" }, TERMS.map(([h, p]) => (React.createElement(React.Fragment, { key: h },
                React.createElement("h2", null, h),
                React.createElement("p", null, p))))),
            mode === "accept" ? (React.createElement(React.Fragment, null,
                storageError && React.createElement("p", { className: "tsub", style: { color: "var(--red)" } }, storageError),
                React.createElement("label", { className: "tagree" },
                    React.createElement("input", { type: "checkbox", checked: checked, onChange: e => setChecked(e.target.checked) }),
                    React.createElement("span", null,
                        "I have read and agree to the ",
                        APP_NAME,
                        " Terms of Use.")),
                React.createElement("p", { className: "tsub" },
                    "By tapping Accept, you agree to these terms. If you decline, ",
                    APP_NAME,
                    " stays locked."),
                React.createElement("div", { className: "btnrow2" },
                    React.createElement("button", { className: "btn btn-plain tgbtn", onClick: () => setDeclined(true) }, "Decline"),
                    React.createElement("button", { className: "btn btn-primary tgbtn", disabled: !checked || busy || !!storageError, onClick: async () => { setBusy(true); try {
                            await onAccept();
                        }
                        finally {
                            setBusy(false);
                        } } }, "Accept")))) : (React.createElement("button", { className: "btn btn-primary tgbtn", onClick: onClose }, "Close")))));
}
// ===================== UI primitives (iOS-style design language) =====================
function PageHead({ title, currency, home, live }) {
    return (React.createElement("div", { className: "pagehead" },
        React.createElement("h1", { className: "h1" }, title),
        React.createElement("div", { className: "rateblock" },
            live.offline && React.createElement("div", { className: "offbadge" }, live.offline),
            currency === home ? (React.createElement(React.Fragment, null,
                React.createElement("div", null,
                    "Home currency ",
                    React.createElement("span", { className: "ratenum" }, home)),
                React.createElement("div", { className: "ratesub" },
                    "totals shown in ",
                    home))) : (React.createElement(React.Fragment, null,
                React.createElement("div", null,
                    "1 ",
                    currency,
                    " = ",
                    React.createElement("span", { className: "ratenum" }, live.rate != null ? fmtRate(live.rate) : "…"),
                    " ",
                    home),
                React.createElement("div", { className: "ratesub" }, live.rate != null ? rateSourceLabel(live.source, live.date) : "looking up…"))))));
}
function SectionLabel({ children }) { return React.createElement("div", { className: "seclabel" }, children); }
function SummaryTable({ rows, home }) {
    if (rows.length === 0)
        return React.createElement("div", { className: "card empty" }, "Nothing to summarise yet.");
    return (React.createElement("div", { className: "card tblcard" },
        React.createElement("table", { className: "tbl" },
            React.createElement("thead", null,
                React.createElement("tr", null,
                    React.createElement("th", null, "Period"),
                    React.createElement("th", null, "#"),
                    React.createElement("th", null, "Original"),
                    React.createElement("th", null, home))),
            React.createElement("tbody", null, rows.map(r => (React.createElement("tr", { key: r.key },
                React.createElement("td", null, r.label),
                React.createElement("td", null, r.count),
                React.createElement("td", { className: "tnum" }, r.original),
                React.createElement("td", { className: "tnum" }, fmtAmount(r.home, home)))))))));
}
/* Receipt photos live in their own table and are read only when shown. */
function useReceipt(id, has, version) {
    const [src, setSrc] = useState(null);
    useEffect(() => {
        if (!has) {
            setSrc(null);
            return;
        }
        let live = true;
        Store.getReceipt(id).then(d => { if (live)
            setSrc(d); }).catch(() => { });
        return () => { live = false; };
    }, [id, has, version]);
    return src;
}
function ExpenseCard({ en, home, selectMode, selected, onToggle, onEdit, onShare, onDelete, onPhoto }) {
    const receipt = useReceipt(en.id, en.hasReceipt, en.updatedAt);
    return (React.createElement("div", { className: "card expcard" },
        React.createElement("div", { className: "exprow" },
            selectMode && (React.createElement("input", { type: "checkbox", className: "chk", checked: !!selected, onChange: onToggle })),
            en.hasReceipt && (receipt
                ? React.createElement("img", { src: receipt, alt: "Receipt", className: "thumb", onClick: () => onPhoto(receipt) })
                : React.createElement("div", { className: "thumb thumbph" })),
            React.createElement("div", { className: "expmain" },
                React.createElement("div", { className: "exp-title" }, en.vendor),
                React.createElement("div", { className: "exp-sub" },
                    en.date,
                    " \u00B7 ",
                    en.category)),
            React.createElement("div", { className: "expamt" },
                React.createElement("div", { className: "exp-amt" }, fmtAmount(en.amount, en.currency)),
                en.currency !== home && (React.createElement("div", { className: "exp-cad" }, en.amountH == null ? "no rate yet" : "≈ " + fmtAmount(en.amountH, home))))),
        en.currency !== en.home && (React.createElement("div", { className: "exp-rate" },
            rateLine(en.currency, en.home, en.rate),
            " \u00B7 ",
            rateSourceLabel(en.rateSource, en.rateDate, en.date))),
        en.converted && en.currency !== home && (React.createElement("div", { className: "exp-rate" },
            "Saved in ",
            en.home,
            "; shown in ",
            home,
            " at today's rate")),
        en.comments && React.createElement("div", { className: "exp-note" }, en.comments),
        React.createElement("div", { className: "btnrow" },
            React.createElement("button", { className: "btn btn-soft", onClick: () => onEdit(en) }, "Edit"),
            React.createElement("button", { className: "btn btn-soft", onClick: () => onShare(en) }, "Share"),
            React.createElement("button", { className: "btn btn-danger", onClick: () => onDelete(en.id) }, "Delete"))));
}
/* Searchable currency list, like Fairpot: home and recent first, then all. */
function CurrencyPicker({ title, selected, home, recent, onPick, onClose }) {
    const [q, setQ] = useState("");
    const query = q.trim().toLowerCase();
    const match = c => !query || c.toLowerCase().includes(query) || curName(c).toLowerCase().includes(query);
    const top = [home].concat(recent.filter(c => c !== home && CURRENCY_CODES.includes(c)));
    const all = CURRENCY_CODES.filter(match);
    const row = (code, keyPrefix) => (React.createElement("button", { type: "button", key: keyPrefix + code, className: "currow" + (code === selected ? " sel" : ""), onClick: () => onPick(code) },
        React.createElement("span", { className: "curcode" }, code),
        React.createElement("span", { className: "curname" },
            curName(code),
            code === home ? " (home)" : ""),
        code === selected && React.createElement("span", { className: "curtick" }, "\u2713")));
    return (React.createElement("div", { className: "overlay", onClick: onClose },
        React.createElement("div", { className: "sheet cursheet", onClick: e => e.stopPropagation() },
            React.createElement("div", { className: "sheethead" },
                React.createElement("div", { className: "cardtitle", style: { fontSize: 19 } }, title),
                React.createElement("button", { type: "button", className: "linkbtn", onClick: onClose }, "Close")),
            React.createElement("input", { type: "search", className: "fld", style: { marginTop: 10 }, placeholder: "Search code or name\u2026", value: q, onChange: e => setQ(e.target.value) }),
            React.createElement("div", { className: "curlist" },
                !query && React.createElement("div", { className: "curgrp" }, "Home and recent"),
                !query && top.map(c => row(c, "t")),
                !query && React.createElement("div", { className: "curgrp" }, "All currencies"),
                all.map(c => row(c, "a")),
                all.length === 0 && React.createElement("div", { className: "curgrp" },
                    "No currency matches \u201C",
                    q,
                    "\u201D")))));
}
function IconNew() {
    return (React.createElement("svg", { width: "25", height: "25", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" },
        React.createElement("circle", { cx: "12", cy: "12", r: "9" }),
        React.createElement("path", { d: "M12 8.2v7.6M8.2 12h7.6", strokeLinecap: "round" })));
}
function IconHistory() {
    return (React.createElement("svg", { width: "25", height: "25", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.1", strokeLinecap: "round" },
        React.createElement("path", { d: "M4 7.5h16M4 12h16M4 16.5h10" })));
}
function IconSummary() {
    return (React.createElement("svg", { width: "25", height: "25", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.1", strokeLinecap: "round" },
        React.createElement("path", { d: "M5 19v-7M10 19V5M15 19v-9M20 19v-4" })));
}
function TabBar({ tab, setTab }) {
    const items = [["new", "New", IconNew], ["history", "History", IconHistory], ["summary", "Summary", IconSummary]];
    return (React.createElement("nav", { className: "tabbar" }, items.map(([id, label, Ico]) => (React.createElement("button", { key: id, className: "tabitem" + (tab === id ? " on" : ""), onClick: () => setTab(id) },
        React.createElement(Ico, null),
        React.createElement("span", null, label))))));
}
function SpendRecorder() {
    // ---- committed data: a read copy of the database, replaced after every commit ----
    const [entries, setEntries] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [storageError, setStorageError] = useState("");
    const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
    const [vendors, setVendors] = useState([]);
    const [home, setHome] = useState(DEFAULT_HOME);
    const [rateCache, setRateCache] = useState({});
    const rateCacheRef = useRef({});
    const [recent, setRecent] = useState([]);
    const [termsOK, setTermsOK] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [toast, setToast] = useState("");
    const toastTimer = useRef(null);
    const showToast = useCallback((msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2600); }, []);
    const applyData = useCallback((d) => {
        const s = d.settings || {};
        setEntries(d.entries);
        setCategories(d.categories || DEFAULT_CATEGORIES);
        setVendors(d.vendors || []);
        setHome(s.home || DEFAULT_HOME);
        const rc = safeJSON(s.rate_cache, {});
        rateCacheRef.current = rc;
        setRateCache(rc);
        setRecent(safeJSON(s.recent_currencies, []));
        const t = safeJSON(s.terms, null);
        setTermsOK(!!(t && t.v === TERMS_VERSION));
        return d;
    }, []);
    const reload = useCallback(() => Store.load().then(applyData), [applyData]);
    /* Commit operations as ONE transaction. Only a successful commit counts; on
       failure nothing was changed and a dialog says so. Returns true/false. */
    const commitOps = useCallback(async (ops, what) => {
        try {
            await Store.commit(ops);
        }
        catch (e) {
            alert(`${what} was NOT saved.\n\n${(e && e.message) || "Storage error"}\n\nNothing was changed. Please try again.`);
            return false;
        }
        try {
            await reload();
        }
        catch (e) {
            showToast("Saved — but the screen couldn't refresh. Close and reopen the app.");
        }
        return true;
    }, [reload, showToast]);
    /* For caches only (downloaded rates): no dialog if it fails. */
    const commitQuiet = useCallback((ops) => Store.commit(ops).then(reload).catch(() => { }), [reload]);
    const [form, setForm] = useState(emptyForm());
    useEffect(() => {
        Store.open()
            .then(reload)
            .then(d => { setForm(emptyForm((d.categories || DEFAULT_CATEGORIES)[0])); })
            .catch(e => setStorageError((e && e.message) || "Your saved data could not be opened."))
            .finally(() => setLoaded(true));
    }, []);
    async function acceptTerms() {
        const rec = { v: TERMS_VERSION, at: new Date().toISOString(), app: APP_VERSION };
        await commitOps([{ op: "setting", key: "terms", value: JSON.stringify(rec) }], "Your acceptance of the terms");
    }
    // The dropdowns show the union of the stored list and every name that actually
    // appears in the expenses, so they are self-healing.
    const allVendors = useMemo(() => {
        const set = new Set(vendors);
        entries.forEach(e => { if (e.vendor && e.vendor.trim())
            set.add(e.vendor.trim()); });
        return Array.from(set).sort(byName);
    }, [vendors, entries]);
    const allCategories = useMemo(() => {
        const set = new Set(categories);
        entries.forEach(e => { if (e.category && e.category.trim())
            set.add(e.category.trim()); });
        return Array.from(set).sort(byName);
    }, [categories, entries]);
    const [preview, setPreview] = useState(null); // { rate, usedDate, source } for the form
    const [previewLoading, setPreviewLoading] = useState(false);
    const debounceRef = useRef(null);
    const [editingId, setEditingId] = useState(null);
    const [formError, setFormError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [imgError, setImgError] = useState("");
    const [picker, setPicker] = useState(null); // null | "entry" | "home"
    const [showNewVendor, setShowNewVendor] = useState(false);
    const [newVendorText, setNewVendorText] = useState("");
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [newCategoryText, setNewCategoryText] = useState("");
    const [showCatManager, setShowCatManager] = useState(false);
    const [showVendorManager, setShowVendorManager] = useState(false);
    const [catEdits, setCatEdits] = useState({});
    const [vendorEdits, setVendorEdits] = useState({});
    const [newCatText, setNewCatText] = useState("");
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("All");
    const [lightbox, setLightbox] = useState(null);
    const [selected, setSelected] = useState({});
    const [pendingDelete, setPendingDelete] = useState(null);
    const [committingIds, setCommittingIds] = useState([]); // deletes being written: stay hidden until done
    const pendingTimerRef = useRef(null);
    const [undoTick, setUndoTick] = useState(0);
    const [importing, setImporting] = useState(false);
    const [importSummary, setImportSummary] = useState(null);
    const fileInputRef = useRef(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    // ---- amounts in the home currency ----
    // Each expense keeps the rate it was saved with. One saved while a different
    // home currency was chosen is converted at today's rate in the totals (as Fairpot does).
    const [todayRates, setTodayRates] = useState({});
    useEffect(() => {
        const need = Array.from(new Set(entries.filter(e => e.home !== home && e.currency !== home).map(e => e.currency)))
            .filter(c => todayRates[pairKey(c, home)] === undefined);
        if (need.length === 0)
            return;
        let cancelled = false;
        (async () => {
            const got = {};
            for (const c of need) {
                const r = await fetchRateWithFallback(c, home, todayStr(), rateCacheRef.current);
                got[pairKey(c, home)] = r.source === "placeholder" ? null : r.rate;
            }
            if (!cancelled)
                setTodayRates(t => ({ ...t, ...got }));
        })();
        return () => { cancelled = true; };
    }, [entries, home]);
    const hiddenIds = useMemo(() => (pendingDelete ? pendingDelete.ids : []).concat(committingIds), [pendingDelete, committingIds]);
    const entriesH = useMemo(() => entries
        .filter(e => !hiddenIds.includes(e.id))
        .map(e => {
        let amountH, converted = false;
        if (e.home === home)
            amountH = e.amountHome;
        else if (e.currency === home)
            amountH = e.amount;
        else {
            const r = todayRates[pairKey(e.currency, home)];
            amountH = r ? e.amount * r : null;
            converted = true;
        }
        return { ...e, amountH, converted };
    }), [entries, home, todayRates, hiddenIds]);
    const H = e => e.amountH || 0;
    const fmtHome = n => fmtAmount(n, home);
    // A fixed rate on the form (your own rate, or the rate saved with the expense being
    // edited) applies only to the currency, date and home currency it was made for.
    const fixedRate = form.rateFixed && form.rateFixed.currency === form.currency && form.rateFixed.date === form.date && form.rateFixed.home === home
        ? form.rateFixed : null;
    useEffect(() => {
        if (!form.date || !form.currency)
            return;
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        if (form.currency === home) {
            setPreview({ rate: 1, usedDate: form.date, source: "home" });
            setPreviewLoading(false);
            return;
        }
        if (fixedRate) {
            setPreview({ rate: fixedRate.rate, usedDate: fixedRate.usedDate, source: fixedRate.source });
            setPreviewLoading(false);
            return;
        }
        setPreviewLoading(true);
        let cancelled = false;
        debounceRef.current = setTimeout(async () => {
            const r = await fetchRateWithFallback(form.currency, home, form.date, rateCacheRef.current);
            if (cancelled)
                return;
            setPreview(r);
            setPreviewLoading(false);
        }, 350);
        return () => { cancelled = true; clearTimeout(debounceRef.current); };
    }, [form.date, form.currency, home, rateCache, fixedRate && fixedRate.rate, fixedRate && fixedRate.source]);
    useEffect(() => {
        if (!pendingDelete)
            return;
        const id = setInterval(() => setUndoTick(t => t + 1), 100);
        return () => clearInterval(id);
    }, [pendingDelete]);
    function rateCacheOp(currency, r) {
        const next = { ...rateCacheRef.current, [pairKey(currency, home)]: { rate: r.rate, date: r.usedDate, source: r.source } };
        rateCacheRef.current = next;
        return { op: "setting", key: "rate_cache", value: JSON.stringify(next) };
    }
    const entryOps = list => list.map(en => ({ op: "putEntry", entry: { ...en, updatedAt: Date.now() }, receipt: undefined }));
    function setOwnRate() {
        if (form.currency === home) {
            setPicker("entry");
            return;
        }
        const cur = preview && preview.rate > 0 ? fmtRate(preview.rate) : "";
        const v = prompt(`Your own rate\n\n1 ${form.currency} = how many ${home}?`, cur);
        if (v === null)
            return;
        const n = parseFloat(String(v).replace(/,/g, ""));
        if (!(n > 0)) {
            showToast("That rate doesn't look right");
            return;
        }
        setForm(f => ({ ...f, rateFixed: { rate: n, source: "manual", usedDate: f.date, currency: f.currency, date: f.date, home } }));
        showToast(`Using your rate: ${rateLine(form.currency, home, n)}`);
    }
    function clearOwnRate() { setForm(f => ({ ...f, rateFixed: null })); }
    async function addCategory() {
        const name = newCatText.trim();
        if (!name || allCategories.includes(name))
            return;
        if (await commitOps([{ op: "setCategories", list: [...allCategories, name] }], "The new category"))
            setNewCatText("");
    }
    // "+ Add new category…" in the Category dropdown, the same way vendors are added.
    function handleCategorySelect(e) {
        const v = e.target.value;
        if (v === "__new__") {
            setShowNewCategory(true);
            setNewCategoryText("");
        }
        else {
            setShowNewCategory(false);
            setForm(f => ({ ...f, category: v }));
        }
    }
    async function confirmNewCategory() {
        const name = newCategoryText.trim();
        if (!name)
            return;
        if (!allCategories.includes(name)) {
            if (!(await commitOps([{ op: "setCategories", list: [...allCategories, name] }], "The new category")))
                return;
        }
        setForm(f => ({ ...f, category: name }));
        setNewCategoryText("");
        setShowNewCategory(false);
        showToast(`Added category "${name}"`);
    }
    async function renameCategory(oldName, newName) {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName)
            return;
        const affected = entries.filter(en => en.category === oldName).map(en => ({ ...en, category: trimmed }));
        const ok = await commitOps([
            { op: "setCategories", list: Array.from(new Set(allCategories.map(c => c === oldName ? trimmed : c))) },
            ...entryOps(affected)
        ], "The category rename");
        if (ok) {
            if (form.category === oldName)
                setForm(f => ({ ...f, category: trimmed }));
            showToast(`Renamed category to "${trimmed}"`);
        }
    }
    async function deleteCategory(name) {
        if (allCategories.length <= 1)
            return showToast("Keep at least one category");
        const fallback = allCategories.find(c => c !== name) || "Other";
        const affected = entries.filter(en => en.category === name).map(en => ({ ...en, category: fallback }));
        const ok = await commitOps([
            { op: "setCategories", list: allCategories.filter(c => c !== name) },
            ...entryOps(affected)
        ], "The category deletion");
        if (!ok)
            return;
        if (form.category === name)
            setForm(f => ({ ...f, category: fallback }));
        showToast(`Deleted "${name}" — entries moved to "${fallback}"`);
    }
    async function renameVendor(oldName, newName) {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName)
            return;
        const affected = entries.filter(en => en.vendor === oldName).map(en => ({ ...en, vendor: trimmed }));
        const ok = await commitOps([
            { op: "setVendors", list: Array.from(new Set(allVendors.map(v => v === oldName ? trimmed : v))) },
            ...entryOps(affected)
        ], "The vendor rename");
        if (ok) {
            if (form.vendor === oldName)
                setForm(f => ({ ...f, vendor: trimmed }));
            showToast(`Renamed vendor to "${trimmed}"`);
        }
    }
    async function deleteVendor(name) {
        const usedBy = entries.filter(en => en.vendor === name).length;
        if (usedBy > 0) {
            showToast(`"${name}" is on ${usedBy} ${usedBy === 1 ? "expense" : "expenses"} — rename it instead, or delete those entries first`);
            return;
        }
        if (await commitOps([{ op: "setVendors", list: allVendors.filter(v => v !== name) }], "The vendor removal"))
            showToast(`Removed "${name}" from vendor list`);
    }
    function handleVendorSelect(e) {
        const v = e.target.value;
        if (v === "__new__") {
            setShowNewVendor(true);
            setForm(f => ({ ...f, vendor: "" }));
        }
        else {
            setShowNewVendor(false);
            setForm(f => ({ ...f, vendor: v }));
        }
    }
    async function confirmNewVendor() {
        const name = newVendorText.trim();
        if (!name)
            return;
        if (!allVendors.includes(name)) {
            if (!(await commitOps([{ op: "addVendor", name }], "The new vendor")))
                return;
        }
        setForm(f => ({ ...f, vendor: name }));
        setNewVendorText("");
        setShowNewVendor(false);
    }
    const editIdRef = useRef(null);
    function startEdit(entry) {
        setEditingId(entry.id);
        editIdRef.current = entry.id;
        // The saved rate is kept unless you change the date or the currency.
        // (A placeholder or an old "last known" rate is looked up again instead.)
        const keep = entry.home === home && entry.currency !== home && entry.rateSource !== "placeholder" && entry.rateSource !== "cached"
            ? { rate: entry.rate, source: entry.rateSource, usedDate: entry.rateDate, currency: entry.currency, date: entry.date, home }
            : null;
        setForm({ date: entry.date, amount: String(entry.amount), currency: entry.currency || START_CURRENCY, vendor: entry.vendor, category: entry.category,
            comments: entry.comments || "", receipt: null, receiptDirty: false, rateFixed: keep });
        if (entry.hasReceipt) {
            Store.getReceipt(entry.id).then(d => {
                if (editIdRef.current === entry.id)
                    setForm(f => f.receiptDirty ? f : { ...f, receipt: d });
            }).catch(() => { });
        }
        setShowNewVendor(false);
        setShowNewCategory(false);
        setFormError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function cancelEdit() { setEditingId(null); editIdRef.current = null; setForm(emptyForm(allCategories[0])); setFormError(""); }
    async function handleReceiptChange(e) {
        const file = e.target.files && e.target.files[0];
        if (!file)
            return;
        setImgError("");
        try {
            const dataUrl = await compressImageSafe(file);
            if (!dataUrl) {
                setImgError("That photo is too large even after compression — try a clearer, closer shot.");
                return;
            }
            setForm(f => ({ ...f, receipt: dataUrl, receiptDirty: true }));
        }
        catch (err) {
            setImgError("Couldn't process that image — try a different photo.");
        }
        finally {
            e.target.value = "";
        }
    }
    async function handleSubmit(e) {
        e.preventDefault();
        if (submitting)
            return false;
        const amt = parseFloat(form.amount);
        if (!form.date) {
            setFormError("Pick a date.");
            return false;
        }
        if (!form.vendor.trim()) {
            setFormError("Enter a vendor.");
            return false;
        }
        if (!amt || amt <= 0) {
            setFormError("Enter an amount greater than zero.");
            return false;
        }
        setSubmitting(true);
        setFormError("");
        try {
            const r = form.currency === home ? { rate: 1, usedDate: form.date, source: "home" }
                : fixedRate ? { rate: fixedRate.rate, usedDate: fixedRate.usedDate, source: fixedRate.source }
                    : await fetchRateWithFallback(form.currency, home, form.date, rateCacheRef.current);
            const ops = [];
            if (isDownloaded(r.source))
                ops.push(rateCacheOp(form.currency, r));
            const amountHome = amt * r.rate;
            const vendorName = form.vendor.trim();
            if (!allVendors.includes(vendorName))
                ops.push({ op: "addVendor", name: vendorName });
            const receiptOp = form.receiptDirty ? (form.receipt || null) : undefined;
            const now = Date.now();
            let entry;
            if (editingId) {
                const old = entries.find(en => en.id === editingId);
                if (!old) {
                    setFormError("This expense no longer exists — it may have been deleted.");
                    return false;
                }
                entry = { ...old, date: form.date, amount: amt, currency: form.currency, vendor: vendorName, category: form.category,
                    comments: form.comments.trim(), home, amountHome, rate: r.rate, rateDate: r.usedDate, rateSource: r.source, updatedAt: now };
            }
            else {
                entry = { id: newId(), date: form.date, amount: amt, currency: form.currency, vendor: vendorName, category: form.category,
                    comments: form.comments.trim(), home, amountHome, rate: r.rate, rateDate: r.usedDate, rateSource: r.source,
                    createdAt: now, updatedAt: now };
            }
            ops.push({ op: "putEntry", entry, receipt: receiptOp });
            ops.push({ op: "setting", key: "recent_currencies", value: JSON.stringify([form.currency, ...recent.filter(c => c !== form.currency)].slice(0, 6)) });
            const ok = await commitOps(ops, editingId ? "The changes" : "The expense");
            if (!ok)
                return false;
            const verb = editingId ? "updated" : "added";
            showToast(r.source === "home" ? `Expense ${verb}` : `Expense ${verb} — ${rateSourceLabel(r.source, r.usedDate, form.date)}`);
            setForm(emptyForm(allCategories[0]));
            setEditingId(null);
            editIdRef.current = null;
            return true;
        }
        finally {
            setSubmitting(false);
        }
    }
    // ---- selection ----
    function toggleSelect(id) { setSelected(s => { const n = { ...s }; if (n[id])
        delete n[id];
    else
        n[id] = true; return n; }); }
    function selectAllVisible(ids, checked) { setSelected(s => { const n = { ...s }; ids.forEach(id => { if (checked)
        n[id] = true;
    else
        delete n[id]; }); return n; }); }
    function clearSelection() { setSelected({}); }
    // ---- delete with undo: hidden for 6 seconds, then committed to the database ----
    function softDelete(ids) {
        const present = ids.filter(id => entries.some(en => en.id === id));
        if (present.length === 0)
            return;
        if (pendingDelete)
            commitPendingDelete(pendingDelete);
        setSelected(s => { const n = { ...s }; present.forEach(id => delete n[id]); return n; });
        const expiresAt = Date.now() + UNDO_WINDOW_MS;
        const record = { ids: present, expiresAt };
        if (pendingTimerRef.current)
            clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = setTimeout(() => commitPendingDelete(record), UNDO_WINDOW_MS);
        setPendingDelete(record);
    }
    async function commitPendingDelete(record) {
        if (!record)
            return;
        setPendingDelete(cur => (cur && cur.expiresAt === record.expiresAt) ? null : cur);
        const n = record.ids.length;
        setCommittingIds(c => c.concat(record.ids));
        try {
            await commitOps([{ op: "deleteEntries", ids: record.ids }], n === 1 ? "The deletion" : `The deletion of ${n} expenses`);
        }
        finally {
            setCommittingIds(c => c.filter(id => !record.ids.includes(id)));
        }
    }
    function undoDelete() {
        if (!pendingDelete)
            return;
        if (pendingTimerRef.current)
            clearTimeout(pendingTimerRef.current);
        setPendingDelete(null);
        showToast("Restored");
    }
    function deleteEntry(id) { softDelete([id]); }
    function deleteSelected() { softDelete(Object.keys(selected)); }
    // ---- CSV / Excel import (one transaction: all rows or none) ----
    function pickField(row, candidates) {
        const keys = Object.keys(row);
        for (const c of candidates) {
            const found = keys.find(k => k.trim().toLowerCase() === c);
            if (found && String(row[found]).trim() !== "")
                return row[found];
        }
        return undefined;
    }
    function parseDateValue(v) {
        if (v instanceof Date && !isNaN(v))
            return localDateStr(v);
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()))
            return v.trim();
        const d = new Date(v);
        if (!isNaN(d))
            return localDateStr(d);
        return null;
    }
    async function handleImportFile(e) {
        const file = e.target.files && e.target.files[0];
        if (!file)
            return;
        setImporting(true);
        setImportSummary(null);
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array", cellDates: true });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
            const existingKeys = new Set(entries.map(dedupKey));
            const seenThisImport = new Set();
            const rateMemo = new Map();
            const toAdd = [];
            let skippedDup = 0, errored = 0;
            const newCats = new Set(allCategories);
            const newVendors = new Set(allVendors);
            for (const row of rows) {
                const rawDate = pickField(row, ["date"]);
                const rawVendor = pickField(row, ["vendor", "payee", "merchant"]);
                const rawAmount = pickField(row, ["amount (original)", "amount (php)", "original amount", "amount"]);
                const rawCurrency = pickField(row, ["currency", "currency code"]) || "PHP";
                const rawCategory = pickField(row, ["category"]) || "Other";
                const rawComments = pickField(row, ["comments", "notes", "comment"]) || "";
                const date = parseDateValue(rawDate);
                const amount = parseFloat(rawAmount);
                const currency = String(rawCurrency).trim().toUpperCase();
                const vendor = String(rawVendor || "").trim();
                if (!date || !vendor || !amount || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
                    errored++;
                    continue;
                }
                const key = `${date}|${vendor.toLowerCase()}|${currency}|${amount.toFixed(2)}`;
                if (existingKeys.has(key) || seenThisImport.has(key)) {
                    skippedDup++;
                    continue;
                }
                seenThisImport.add(key);
                const memoKey = `${currency}|${date}`;
                let r = rateMemo.get(memoKey);
                if (r === undefined) {
                    r = await fetchRateWithFallback(currency, home, date, rateCacheRef.current);
                    rateMemo.set(memoKey, r);
                    if (isDownloaded(r.source))
                        rateCacheOp(currency, r);
                }
                const now = Date.now();
                toAdd.push({
                    id: newId(), date, amount, currency, vendor, category: String(rawCategory).trim() || "Other",
                    comments: String(rawComments).trim(), home, amountHome: amount * r.rate, rate: r.rate, rateDate: r.usedDate,
                    rateSource: r.source, createdAt: now, updatedAt: now,
                });
                newCats.add(String(rawCategory).trim() || "Other");
                newVendors.add(vendor);
            }
            if (toAdd.length > 0) {
                const ops = toAdd.map(en => ({ op: "putEntry", entry: en, receipt: undefined }));
                ops.push({ op: "setCategories", list: Array.from(newCats) });
                ops.push({ op: "setVendors", list: Array.from(newVendors) });
                ops.push({ op: "setting", key: "rate_cache", value: JSON.stringify(rateCacheRef.current) });
                const ok = await commitOps(ops, `The import of ${toAdd.length} ${toAdd.length === 1 ? "entry" : "entries"}`);
                if (!ok) {
                    setImportSummary({ added: 0, skipped: 0, errored: 0, total: rows.length, saveError: true });
                    return;
                }
            }
            setImportSummary({ added: toAdd.length, skipped: skippedDup, errored, total: rows.length });
            showToast(`Imported ${toAdd.length} new ${toAdd.length === 1 ? "entry" : "entries"}`);
        }
        catch (err) {
            setImportSummary({ added: 0, skipped: 0, errored: 0, total: 0, fileError: true });
            showToast("Couldn't read that file — check it's a valid CSV or Excel file");
        }
        finally {
            setImporting(false);
            if (fileInputRef.current)
                fileInputRef.current.value = "";
        }
    }
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = entriesH.filter(en => {
            const matchesCat = categoryFilter === "All" || en.category === categoryFilter;
            const matchesSearch = !q || en.vendor.toLowerCase().includes(q) || en.category.toLowerCase().includes(q) || (en.comments || "").toLowerCase().includes(q);
            return matchesCat && matchesSearch;
        });
        // newest first; same date → most recently added first
        return list.slice().sort((a, b) => a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.createdAt || 0) - (a.createdAt || 0));
    }, [entriesH, search, categoryFilter]);
    const totalH = filtered.reduce((s, e) => s + H(e), 0);
    const byCategory = useMemo(() => {
        const map = {};
        filtered.forEach(e => { map[e.category] = (map[e.category] || 0) + H(e); });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [filtered]);
    const monthlyGroups = useMemo(() => {
        const map = {};
        filtered.forEach(e => {
            const ym = e.date.slice(0, 7);
            if (!map[ym])
                map[ym] = { total: 0, count: 0 };
            map[ym].total += H(e);
            map[ym].count += 1;
        });
        return Object.entries(map).sort((a, b) => a[0] < b[0] ? 1 : -1);
    }, [filtered]);
    const overallByVendor = useMemo(() => {
        const map = {};
        filtered.forEach(e => { map[e.vendor] = (map[e.vendor] || 0) + H(e); });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [filtered]);
    // ---- files out: the phone's share sheet (Mail, Messages, WhatsApp, Save to Files …) ----
    async function offerFile(filename, base64, mime, text) {
        if (Store.isNative && FS && ShareP) {
            try {
                await shareFileNative(filename, base64, text);
            }
            catch (err) {
                if (!isCancel(err))
                    showToast("Couldn't open the share sheet — " + ((err && err.message) || "unknown error"));
            }
            return;
        }
        // Safari test page
        const bin = atob(base64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++)
            u8[i] = bin.charCodeAt(i);
        const blob = new Blob([u8], { type: mime });
        try {
            const file = new File([blob], filename, { type: mime });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share(text ? { files: [file], title: filename, text } : { files: [file], title: filename });
                return;
            }
        }
        catch (err) {
            if (isCancel(err))
                return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    const exportRow = e => ({
        Date: e.date, Vendor: e.vendor || "", Category: e.category || "", "Amount (Original)": Number(e.amount || 0), Currency: e.currency,
        "Rate": Number((e.rate || 0).toFixed(6)), "Rate date": e.rateDate || "", "Rate source": rateSourceLabel(e.rateSource, e.rateDate, e.date),
        "Converted To": e.home, "Amount (Converted)": Number((e.amountHome || 0).toFixed(2)), [`Amount (${home})`]: Number(H(e).toFixed(2)),
        Comments: e.comments || ""
    });
    function buildCSV() {
        const rows = filtered.map(exportRow);
        const header = rows.length ? Object.keys(rows[0]) : Object.keys(exportRow({ date: "", amount: 0, currency: home, home, rate: 1 }));
        const cell = v => typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, '""')}"`;
        return [header.map(cell).join(","), ...rows.map(r => header.map(h => cell(r[h])).join(","))].join("\n");
    }
    const fileStamp = () => todayStr();
    async function shareViaMessaging() {
        try {
            await offerFile(`spendrecorder-${fileStamp()}.csv`, utf8ToBase64(buildCSV()), "text/csv", `${APP_NAME} export — ${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}, total ${fmtHome(totalH)}`);
            setShowExportMenu(false);
        }
        catch (err) {
            showToast("Couldn't open the share sheet — " + (err.message || "unknown error"));
        }
    }
    async function exportCSV() {
        try {
            await offerFile(`spendrecorder-${fileStamp()}.csv`, utf8ToBase64(buildCSV()), "text/csv");
            setShowExportMenu(false);
        }
        catch (err) {
            showToast("CSV export failed — " + (err.message || "unknown error"));
        }
    }
    async function exportExcel() {
        try {
            const T = `Total (${home})`;
            const ws = XLSX.utils.json_to_sheet(filtered.map(exportRow));
            ws["!cols"] = [{ wch: 11 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 9 }, { wch: 12 }, { wch: 11 }, { wch: 44 }, { wch: 11 }, { wch: 16 }, { wch: 14 }, { wch: 30 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Expenses");
            const monthlyData = monthlyGroups.map(([ym, g]) => ({ Month: monthLabel(ym), [T]: Number(g.total.toFixed(2)), "# Entries": g.count }));
            monthlyData.push({ Month: "Grand Total", [T]: Number(totalH.toFixed(2)), "# Entries": filtered.length });
            const ws2 = XLSX.utils.json_to_sheet(monthlyData);
            ws2["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 10 }];
            XLSX.utils.book_append_sheet(wb, ws2, "Monthly Summary");
            const ws3 = XLSX.utils.json_to_sheet(byCategory.map(([c, amt]) => ({ Category: c, [T]: Number(amt.toFixed(2)) })));
            ws3["!cols"] = [{ wch: 22 }, { wch: 14 }];
            XLSX.utils.book_append_sheet(wb, ws3, "By Category");
            const ws4 = XLSX.utils.json_to_sheet(overallByVendor.map(([v, amt]) => ({ Vendor: v, [T]: Number(amt.toFixed(2)) })));
            ws4["!cols"] = [{ wch: 22 }, { wch: 14 }];
            XLSX.utils.book_append_sheet(wb, ws4, "By Vendor");
            const b64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
            await offerFile(`spendrecorder-${fileStamp()}.xlsx`, b64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            setShowExportMenu(false);
        }
        catch (err) {
            showToast("Excel export failed — " + (err.message || "unknown error"));
        }
    }
    const allVisibleSelected = filtered.length > 0 && filtered.every(en => selected[en.id]);
    const selectedCount = Object.keys(selected).length;
    const undoPct = pendingDelete ? Math.max(0, Math.min(100, ((pendingDelete.expiresAt - Date.now()) / UNDO_WINDOW_MS) * 100)) : 0;
    const undoSecs = pendingDelete ? Math.max(0, Math.ceil((pendingDelete.expiresAt - Date.now()) / 1000)) : 0;
    // ============ tab nav, live header rate, period rollups, per-item share ============
    const [tab, setTab] = useState("new");
    const [selectMode, setSelectMode] = useState(false);
    const [liveRate, setLiveRate] = useState({ rate: null, source: null, date: null });
    const [netDown, setNetDown] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
    useEffect(() => {
        const up = () => setNetDown(false);
        const down = () => setNetDown(true);
        window.addEventListener("online", up);
        window.addEventListener("offline", down);
        return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
    }, []);
    // Header shows the rate for whichever foreign currency you use most (falls back to the form's).
    const displayCurrency = useMemo(() => {
        const counts = {};
        entries.forEach(e => { if (e.currency !== home)
            counts[e.currency] = (counts[e.currency] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (top)
            return top[0];
        return form.currency || home;
    }, [entries, form.currency, home]);
    useEffect(() => {
        if (displayCurrency === home) {
            setLiveRate({ rate: 1, source: "home", date: null });
            return;
        }
        let cancelled = false;
        setLiveRate({ rate: null, source: null, date: null });
        (async () => {
            const r = await fetchRateWithFallback(displayCurrency, home, todayStr(), rateCacheRef.current);
            if (!cancelled)
                setLiveRate({ rate: r.rate, source: r.source, date: r.usedDate });
            if (!cancelled && isDownloaded(r.source))
                commitQuiet([rateCacheOp(displayCurrency, r)]);
        })();
        return () => { cancelled = true; };
    }, [displayCurrency, home]);
    const live = { ...liveRate, offline: netDown ? "No connection · last known rates" : null };
    // The "Original" column only shows a figure when every entry in that period
    // shares one currency — summing across currencies would be meaningless.
    function buildPeriodRows(keyFn, labelFn) {
        const map = {};
        filtered.forEach(e => {
            const k = keyFn(e);
            if (!map[k])
                map[k] = { count: 0, home: 0, byCur: {} };
            map[k].count += 1;
            map[k].home += H(e);
            map[k].byCur[e.currency] = (map[k].byCur[e.currency] || 0) + Number(e.amount || 0);
        });
        return Object.entries(map).sort((a, b) => a[0] < b[0] ? 1 : -1).map(([k, v]) => {
            const curs = Object.keys(v.byCur);
            return { key: k, label: labelFn(k), count: v.count, home: v.home,
                original: curs.length === 1 ? fmtAmount(v.byCur[curs[0]], curs[0]) : "mixed" };
        });
    }
    const monthRows = useMemo(() => buildPeriodRows(e => e.date.slice(0, 7), monthLabelOf), [filtered]);
    const yearRows = useMemo(() => buildPeriodRows(e => e.date.slice(0, 4), k => k), [filtered]);
    async function shareEntry(en) {
        const text = [
            en.vendor,
            `${en.date} · ${en.category}`,
            en.currency === home ? fmtAmount(en.amount, en.currency) : `${fmtAmount(en.amount, en.currency)}  ≈ ${en.amountH == null ? "—" : fmtHome(en.amountH)}`,
            en.currency !== en.home ? `${rateLine(en.currency, en.home, en.rate)} (${rateSourceLabel(en.rateSource, en.rateDate, en.date)})` : "",
            en.comments || "",
        ].filter(Boolean).join("\n");
        try {
            if (Store.isNative && ShareP) {
                await ShareP.share({ title: en.vendor, text });
                return;
            }
            if (navigator.share) {
                await navigator.share({ title: en.vendor, text });
                return;
            }
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(text);
                showToast("Copied to clipboard");
                return;
            }
            showToast("Sharing isn't available on this device");
        }
        catch (e) { /* user cancelled the share sheet */ }
    }
    function editFromHistory(en) { startEdit(en); setTab("new"); }
    async function submitAndReturn(e) {
        const wasEditing = !!editingId;
        const ok = await handleSubmit(e);
        if (ok && wasEditing)
            setTab("history");
    }
    // ---- currencies ----
    function pickCurrency(code) {
        const mode = picker;
        setPicker(null);
        if (mode === "home") {
            changeHome(code);
            return;
        }
        setForm(f => ({ ...f, currency: code }));
    }
    async function changeHome(code) {
        if (code === home)
            return;
        if (!confirm(`Show all totals in ${code} (${curName(code)})?\n\nExpenses already saved keep their own rates. Ones saved with a different home currency are converted to ${code} at today's rate in the totals.`))
            return;
        if (await commitOps([{ op: "setting", key: "home", value: code }], "The home currency change"))
            showToast(`Home currency is now ${code}`);
    }
    // ---- Summary drill-downs ----
    const [openCat, setOpenCat] = useState(null);
    const catDetail = useMemo(() => {
        if (!openCat)
            return null;
        const list = filtered.filter(e => e.category === openCat);
        const months = {}, vens = {};
        list.forEach(e => {
            const ym = e.date.slice(0, 7);
            months[ym] = (months[ym] || 0) + H(e);
            vens[e.vendor] = (vens[e.vendor] || 0) + H(e);
        });
        return {
            count: list.length,
            months: Object.entries(months).sort((a, b) => a[0] < b[0] ? 1 : -1).map(([ym, amt]) => [monthLabelOf(ym), amt]),
            vendors: Object.entries(vens).sort((a, b) => b[1] - a[1]),
        };
    }, [openCat, filtered]);
    const [openMonth, setOpenMonth] = useState(null);
    const monthDetail = useMemo(() => {
        if (!openMonth)
            return null;
        const list = filtered.filter(e => e.date.slice(0, 7) === openMonth);
        const cats = {}, vens = {};
        list.forEach(e => {
            cats[e.category] = (cats[e.category] || 0) + H(e);
            vens[e.vendor] = (vens[e.vendor] || 0) + H(e);
        });
        return { count: list.length, cats: Object.entries(cats).sort((a, b) => b[1] - a[1]), vendors: Object.entries(vens).sort((a, b) => b[1] - a[1]) };
    }, [openMonth, filtered]);
    const [monthFilter, setMonthFilter] = useState(null);
    const [vendorFilter, setVendorFilter] = useState(null);
    const [drillChip, setDrillChip] = useState(null);
    const [openVendor, setOpenVendor] = useState(null);
    const vendorDetail = useMemo(() => {
        if (!openVendor)
            return null;
        const list = filtered.filter(e => e.vendor === openVendor);
        const months = {}, cats = {};
        list.forEach(e => {
            const ym = e.date.slice(0, 7);
            months[ym] = (months[ym] || 0) + H(e);
            cats[e.category] = (cats[e.category] || 0) + H(e);
        });
        return {
            count: list.length,
            months: Object.entries(months).sort((a, b) => a[0] < b[0] ? 1 : -1).map(([ym, amt]) => [monthLabelOf(ym), amt]),
            cats: Object.entries(cats).sort((a, b) => b[1] - a[1]),
        };
    }, [openVendor, filtered]);
    function drillToHistory(cat) { setCategoryFilter(cat); setMonthFilter(null); setVendorFilter(null); setDrillChip({ label: cat }); setTab("history"); }
    function drillMonthToHistory(ym) { setMonthFilter(ym); setVendorFilter(null); setCategoryFilter("All"); setDrillChip({ label: monthLabelOf(ym) }); setTab("history"); }
    function drillVendorToHistory(v) { setVendorFilter(v); setMonthFilter(null); setCategoryFilter("All"); setDrillChip({ label: v }); setTab("history"); }
    function clearDrill() { setDrillChip(null); setMonthFilter(null); setVendorFilter(null); setCategoryFilter("All"); }
    const histFiltered = useMemo(() => {
        let list = filtered;
        if (monthFilter)
            list = list.filter(e => e.date.slice(0, 7) === monthFilter);
        if (vendorFilter)
            list = list.filter(e => e.vendor === vendorFilter);
        return list;
    }, [filtered, monthFilter, vendorFilter]);
    const histTotal = useMemo(() => histFiltered.reduce((s, e) => s + H(e), 0), [histFiltered]);
    const storageBanner = storageError ? React.createElement("div", { className: "card importnote bad wide", style: { marginBottom: 12 } }, storageError) : null;
    const amt = parseFloat(form.amount || 0);
    // ---- first use: nothing else is shown until the terms are accepted ----
    if (!loaded)
        return React.createElement("div", { className: "wrap" },
            React.createElement("div", { className: "card empty", style: { marginTop: 40 } },
                "Loading ",
                APP_NAME,
                "\u2026"));
    if (!termsOK)
        return React.createElement(TermsGate, { mode: "accept", onAccept: acceptTerms, storageError: storageError });
    // ================================ render ================================
    return (React.createElement("div", null,
        tab === "new" && (React.createElement("div", { className: "wrap" },
            React.createElement(PageHead, { title: editingId ? "Edit" : "New", currency: displayCurrency, home: home, live: live }),
            storageBanner,
            React.createElement("form", { onSubmit: submitAndReturn, className: "newgrid" },
                editingId && (React.createElement("div", { className: "card notice wide", style: { marginBottom: 12 } },
                    React.createElement("span", null, "Editing an existing expense."),
                    React.createElement("button", { type: "button", className: "linkbtn", onClick: () => { cancelEdit(); setTab("history"); } }, "Cancel"))),
                React.createElement("div", { className: "card", style: { marginBottom: 12 } },
                    React.createElement("label", { className: "lbl" }, "Receipt photo"),
                    React.createElement("div", { className: "photorow" },
                        React.createElement("label", { className: "btn btn-soft photobtn" },
                            form.receipt ? "Replace photo" : "Add photo",
                            React.createElement("input", { type: "file", accept: "image/*", onChange: handleReceiptChange, style: { display: "none" } })),
                        form.receipt && (React.createElement(React.Fragment, null,
                            React.createElement("img", { src: form.receipt, alt: "Receipt preview", className: "thumb", onClick: () => setLightbox(form.receipt) }),
                            React.createElement("button", { type: "button", className: "btn btn-danger photobtn", onClick: () => setForm(f => ({ ...f, receipt: null, receiptDirty: true })) }, "Remove")))),
                    imgError && React.createElement("div", { className: "err" }, imgError)),
                React.createElement("div", { className: "card", style: { marginBottom: 12 } },
                    React.createElement("label", { className: "lbl" }, "Date"),
                    React.createElement("input", { type: "date", className: "fld", value: form.date, onChange: e => setForm({ ...form, date: e.target.value }) }),
                    React.createElement("label", { className: "lbl", style: { marginTop: 14 } }, "Amount"),
                    React.createElement("div", { style: { display: "flex", gap: 8 } },
                        React.createElement("button", { type: "button", className: "fld curbtn", onClick: () => setPicker("entry"), "aria-label": "Currency of this expense" }, form.currency),
                        React.createElement("input", { type: "number", inputMode: "decimal", step: "0.01", min: "0", placeholder: "0.00", className: "fld", value: form.amount, onChange: e => setForm({ ...form, amount: e.target.value }) })),
                    form.currency === home ? (React.createElement("div", { className: "hint" },
                        curName(home),
                        " \u2014 your home currency")) : (React.createElement("button", { type: "button", className: "ratebox", onClick: setOwnRate, disabled: previewLoading }, previewLoading || !preview ? React.createElement("span", null, "looking up the rate\u2026") : (React.createElement(React.Fragment, null,
                        React.createElement("span", { className: "rb-main" },
                            rateLine(form.currency, home, preview.rate),
                            form.amount ? `  ≈ ${fmtHome(amt * preview.rate)}` : ""),
                        React.createElement("span", { className: "rb-src" + (preview.source === "placeholder" || preview.source === "cached" || preview.source === "today" ? " warn" : "") },
                            rateSourceLabel(preview.source, preview.usedDate, form.date),
                            fixedRate && fixedRate.source !== "manual" ? " · saved with this expense" : ""),
                        React.createElement("span", { className: "rb-tap" }, "Tap to type your own rate"))))),
                    fixedRate && form.currency !== home && (React.createElement("button", { type: "button", className: "linkbtn", onClick: clearOwnRate }, fixedRate.source === "manual" ? "Use the looked-up rate instead" : "Look the rate up again")),
                    React.createElement("div", { className: "lblrow", style: { marginTop: 14 } },
                        React.createElement("label", { className: "lbl", style: { marginBottom: 0 } }, "Vendor"),
                        React.createElement("button", { type: "button", className: "linkbtn", onClick: () => setShowVendorManager(s => !s) }, "Manage")),
                    !showNewVendor ? (React.createElement("select", { className: "fld", value: allVendors.includes(form.vendor) ? form.vendor : "", onChange: handleVendorSelect },
                        React.createElement("option", { value: "", disabled: true }, form.vendor && !allVendors.includes(form.vendor) ? form.vendor : "Select vendor…"),
                        allVendors.map(v => React.createElement("option", { key: v, value: v }, v)),
                        React.createElement("option", { value: "__new__" }, "+ Add new vendor\u2026"))) : (React.createElement("div", { style: { display: "flex", gap: 8 } },
                        React.createElement("input", { autoFocus: true, type: "text", className: "fld", placeholder: "New vendor name", value: newVendorText, onChange: e => setNewVendorText(e.target.value), onKeyDown: e => { if (e.key === "Enter") {
                                e.preventDefault();
                                confirmNewVendor();
                            } } }),
                        React.createElement("button", { type: "button", className: "btn btn-soft", style: { width: "auto", padding: "0 16px" }, onClick: confirmNewVendor }, "Add"),
                        React.createElement("button", { type: "button", className: "btn btn-plain", style: { width: "auto", padding: "0 14px" }, onClick: () => { setShowNewVendor(false); setNewVendorText(""); } }, "\u2715"))),
                    showVendorManager && (React.createElement("div", { className: "manager" },
                        allVendors.length === 0 && React.createElement("div", { className: "hint" }, "No vendors yet \u2014 add one above."),
                        allVendors.map(v => (React.createElement("div", { key: v, className: "managerrow" },
                            React.createElement("input", { className: "fld", value: vendorEdits[v] ?? v, onChange: e => setVendorEdits({ ...vendorEdits, [v]: e.target.value }) }),
                            React.createElement("button", { type: "button", className: "linkbtn", onClick: () => { renameVendor(v, vendorEdits[v] ?? v); setVendorEdits(s => { const c = { ...s }; delete c[v]; return c; }); } }, "Save"),
                            React.createElement("button", { type: "button", className: "linkbtn danger", onClick: () => deleteVendor(v) }, "Delete")))))),
                    React.createElement("div", { className: "lblrow", style: { marginTop: 14 } },
                        React.createElement("label", { className: "lbl", style: { marginBottom: 0 } }, "Category"),
                        React.createElement("button", { type: "button", className: "linkbtn", onClick: () => setShowCatManager(s => !s) }, "Manage")),
                    !showNewCategory ? (React.createElement("select", { className: "fld", value: form.category, onChange: handleCategorySelect },
                        allCategories.map(c => React.createElement("option", { key: c, value: c }, c)),
                        React.createElement("option", { value: "__new__" }, "+ Add new category\u2026"))) : (React.createElement("div", { style: { display: "flex", gap: 8 } },
                        React.createElement("input", { autoFocus: true, type: "text", className: "fld", placeholder: "New category name", value: newCategoryText, onChange: e => setNewCategoryText(e.target.value), onKeyDown: e => { if (e.key === "Enter") {
                                e.preventDefault();
                                confirmNewCategory();
                            } } }),
                        React.createElement("button", { type: "button", className: "btn btn-soft", style: { width: "auto", padding: "0 16px" }, onClick: confirmNewCategory }, "Add"),
                        React.createElement("button", { type: "button", className: "btn btn-plain", style: { width: "auto", padding: "0 14px" }, onClick: () => { setShowNewCategory(false); setNewCategoryText(""); } }, "\u2715"))),
                    showCatManager && (React.createElement("div", { className: "manager" },
                        React.createElement("div", { className: "managerrow" },
                            React.createElement("input", { className: "fld", placeholder: "New category", value: newCatText, onChange: e => setNewCatText(e.target.value), onKeyDown: e => { if (e.key === "Enter") {
                                    e.preventDefault();
                                    addCategory();
                                } } }),
                            React.createElement("button", { type: "button", className: "linkbtn", onClick: addCategory }, "Add")),
                        allCategories.map(c => (React.createElement("div", { key: c, className: "managerrow" },
                            React.createElement("span", { className: "dot", style: { background: colorFor(c) } }),
                            React.createElement("input", { className: "fld", value: catEdits[c] ?? c, onChange: e => setCatEdits({ ...catEdits, [c]: e.target.value }) }),
                            React.createElement("button", { type: "button", className: "linkbtn", onClick: () => { renameCategory(c, catEdits[c] ?? c); setCatEdits(s => { const n = { ...s }; delete n[c]; return n; }); } }, "Save"),
                            React.createElement("button", { type: "button", className: "linkbtn danger", onClick: () => deleteCategory(c) }, "Delete")))))),
                    React.createElement("label", { className: "lbl", style: { marginTop: 14 } }, "Comments"),
                    React.createElement("textarea", { rows: 2, className: "fld", placeholder: "Optional notes", value: form.comments, onChange: e => setForm({ ...form, comments: e.target.value }) })),
                formError && React.createElement("div", { className: "card err wide", style: { marginBottom: 12 } }, formError),
                React.createElement("button", { type: "submit", className: "btn btn-primary wide", disabled: submitting || !!storageError }, submitting ? "Saving…" : editingId ? "Save changes" : "Add expense")))),
        tab === "history" && (React.createElement("div", { className: "wrap" },
            React.createElement(PageHead, { title: "History", currency: displayCurrency, home: home, live: live }),
            storageBanner,
            drillChip && (React.createElement("button", { className: "drillchip", onClick: clearDrill },
                "Showing: ",
                drillChip.label,
                " ",
                React.createElement("span", { className: "chipx" }, "\u2715"))),
            React.createElement("div", { className: "filters" },
                React.createElement("input", { type: "search", className: "fld", placeholder: "Search vendor, category, notes\u2026", value: search, onChange: e => setSearch(e.target.value) }),
                React.createElement("button", { className: "btn btn-soft", style: { width: "auto", padding: "0 16px" }, onClick: () => { setSelectMode(s => !s); clearSelection(); } }, selectMode ? "Done" : "Select")),
            React.createElement("div", { className: "filters" },
                React.createElement("select", { className: "fld", value: categoryFilter, onChange: e => { setCategoryFilter(e.target.value); setDrillChip(null); setMonthFilter(null); setVendorFilter(null); } },
                    React.createElement("option", { value: "All" }, "All categories"),
                    allCategories.map(c => React.createElement("option", { key: c, value: c }, c)))),
            histFiltered.length > 0 && (React.createElement("div", { className: "tally" },
                histFiltered.length,
                " ",
                histFiltered.length === 1 ? "entry" : "entries",
                " \u00B7 ",
                fmtHome(histTotal))),
            selectMode && selectedCount > 0 && (React.createElement("div", { className: "card selbar" },
                React.createElement("span", null,
                    selectedCount,
                    " selected"),
                React.createElement("div", { style: { display: "flex", gap: 8 } },
                    React.createElement("button", { className: "btn btn-soft", style: { width: "auto", padding: "8px 14px" }, onClick: () => selectAllVisible(histFiltered.map(f => f.id), !allVisibleSelected) }, allVisibleSelected ? "None" : "All"),
                    React.createElement("button", { className: "btn btn-danger", style: { width: "auto", padding: "8px 14px" }, onClick: deleteSelected }, "Delete")))),
            histFiltered.length === 0 ? (React.createElement("div", { className: "card empty" }, entriesH.length === 0 ? "No expenses yet. Add your first one from the New tab." : "Nothing matches your search or filters.")) : (React.createElement("div", { className: "explist" }, histFiltered.map(en => (React.createElement(ExpenseCard, { key: en.id, en: en, home: home, selectMode: selectMode, selected: !!selected[en.id], onToggle: () => toggleSelect(en.id), onEdit: editFromHistory, onShare: shareEntry, onDelete: deleteEntry, onPhoto: setLightbox }))))))),
        tab === "summary" && (React.createElement("div", { className: "wrap" },
            React.createElement(PageHead, { title: "Summary", currency: displayCurrency, home: home, live: live }),
            storageBanner,
            React.createElement("div", { className: "sumgrid" },
                React.createElement("div", { className: "sumcol" },
                    React.createElement(SectionLabel, null, "By month"),
                    monthRows.length === 0 ? React.createElement("div", { className: "card empty" }, "Nothing to summarise yet.") : (React.createElement("div", { className: "card tblcard" },
                        React.createElement("table", { className: "tbl" },
                            React.createElement("thead", null,
                                React.createElement("tr", null,
                                    React.createElement("th", null, "Period"),
                                    React.createElement("th", null, "#"),
                                    React.createElement("th", null, "Original"),
                                    React.createElement("th", null, home))),
                            React.createElement("tbody", null, monthRows.map(r => (React.createElement(React.Fragment, { key: r.key },
                                React.createElement("tr", { onClick: () => setOpenMonth(openMonth === r.key ? null : r.key), style: { cursor: "pointer" } },
                                    React.createElement("td", null,
                                        r.label,
                                        React.createElement("span", { className: "disclose" }, openMonth === r.key ? "▾" : "▸")),
                                    React.createElement("td", null, r.count),
                                    React.createElement("td", { className: "tnum" }, r.original),
                                    React.createElement("td", { className: "tnum" }, fmtHome(r.home))),
                                openMonth === r.key && monthDetail && (React.createElement("tr", { className: "drillrow" },
                                    React.createElement("td", { colSpan: "4" },
                                        React.createElement("div", { className: "drill" },
                                            React.createElement("div", { className: "drillhead" },
                                                monthDetail.count,
                                                " ",
                                                monthDetail.count === 1 ? "entry" : "entries",
                                                " in ",
                                                r.label),
                                            React.createElement("div", { className: "drillcols" },
                                                React.createElement("div", null,
                                                    React.createElement("div", { className: "drilllabel" }, "By category"),
                                                    monthDetail.cats.map(([cat, v]) => (React.createElement("div", { key: cat, className: "drillline" },
                                                        React.createElement("span", null,
                                                            React.createElement("span", { className: "dot", style: { background: colorFor(cat) } }),
                                                            cat),
                                                        React.createElement("span", { className: "tnum" }, fmtHome(v)))))),
                                                React.createElement("div", null,
                                                    React.createElement("div", { className: "drilllabel" }, "By vendor"),
                                                    monthDetail.vendors.map(([v, amt2]) => (React.createElement("div", { key: v, className: "drillline" },
                                                        React.createElement("span", null, v),
                                                        React.createElement("span", { className: "tnum" }, fmtHome(amt2))))))),
                                            React.createElement("button", { className: "btn btn-soft", style: { marginTop: 12 }, onClick: (e) => { e.stopPropagation(); drillMonthToHistory(r.key); } }, "View these in History")))))))))))),
                    React.createElement(SectionLabel, null, "By year"),
                    React.createElement(SummaryTable, { rows: yearRows, home: home }),
                    React.createElement(SectionLabel, null, "By category"),
                    byCategory.length === 0 ? React.createElement("div", { className: "card empty" }, "Nothing yet.") : (React.createElement("div", { className: "card tblcard" },
                        React.createElement("table", { className: "tbl" },
                            React.createElement("thead", null,
                                React.createElement("tr", null,
                                    React.createElement("th", null, "Category"),
                                    React.createElement("th", null, home))),
                            React.createElement("tbody", null, byCategory.map(([c, amt0]) => (React.createElement(React.Fragment, { key: c },
                                React.createElement("tr", { onClick: () => setOpenCat(openCat === c ? null : c), style: { cursor: "pointer" } },
                                    React.createElement("td", null,
                                        React.createElement("span", { className: "dot", style: { background: colorFor(c) } }),
                                        c,
                                        React.createElement("span", { className: "disclose" }, openCat === c ? "▾" : "▸")),
                                    React.createElement("td", { className: "tnum" }, fmtHome(amt0))),
                                openCat === c && catDetail && (React.createElement("tr", { className: "drillrow" },
                                    React.createElement("td", { colSpan: "2" },
                                        React.createElement("div", { className: "drill" },
                                            React.createElement("div", { className: "drillhead" },
                                                catDetail.count,
                                                " ",
                                                catDetail.count === 1 ? "entry" : "entries"),
                                            React.createElement("div", { className: "drillcols" },
                                                React.createElement("div", null,
                                                    React.createElement("div", { className: "drilllabel" }, "By month"),
                                                    catDetail.months.map(([label, v]) => (React.createElement("div", { key: label, className: "drillline" },
                                                        React.createElement("span", null, label),
                                                        React.createElement("span", { className: "tnum" }, fmtHome(v)))))),
                                                React.createElement("div", null,
                                                    React.createElement("div", { className: "drilllabel" }, "By vendor"),
                                                    catDetail.vendors.map(([v, amt2]) => (React.createElement("div", { key: v, className: "drillline" },
                                                        React.createElement("span", null, v),
                                                        React.createElement("span", { className: "tnum" }, fmtHome(amt2))))))),
                                            React.createElement("button", { className: "btn btn-soft", style: { marginTop: 12 }, onClick: (e) => { e.stopPropagation(); drillToHistory(c); } }, "View these in History"))))))))))))),
                React.createElement("div", { className: "sumcol" },
                    React.createElement(SectionLabel, null, "By vendor"),
                    overallByVendor.length === 0 ? React.createElement("div", { className: "card empty" }, "Nothing yet.") : (React.createElement("div", { className: "card tblcard" },
                        React.createElement("table", { className: "tbl" },
                            React.createElement("thead", null,
                                React.createElement("tr", null,
                                    React.createElement("th", null, "Vendor"),
                                    React.createElement("th", null, home))),
                            React.createElement("tbody", null, overallByVendor.map(([v, amt0]) => (React.createElement(React.Fragment, { key: v },
                                React.createElement("tr", { onClick: () => setOpenVendor(openVendor === v ? null : v), style: { cursor: "pointer" } },
                                    React.createElement("td", null,
                                        v,
                                        React.createElement("span", { className: "disclose" }, openVendor === v ? "▾" : "▸")),
                                    React.createElement("td", { className: "tnum" }, fmtHome(amt0))),
                                openVendor === v && vendorDetail && (React.createElement("tr", { className: "drillrow" },
                                    React.createElement("td", { colSpan: "2" },
                                        React.createElement("div", { className: "drill" },
                                            React.createElement("div", { className: "drillhead" },
                                                vendorDetail.count,
                                                " ",
                                                vendorDetail.count === 1 ? "entry" : "entries",
                                                " at ",
                                                v),
                                            React.createElement("div", { className: "drillcols" },
                                                React.createElement("div", null,
                                                    React.createElement("div", { className: "drilllabel" }, "By month"),
                                                    vendorDetail.months.map(([label, mv]) => (React.createElement("div", { key: label, className: "drillline" },
                                                        React.createElement("span", null, label),
                                                        React.createElement("span", { className: "tnum" }, fmtHome(mv)))))),
                                                React.createElement("div", null,
                                                    React.createElement("div", { className: "drilllabel" }, "By category"),
                                                    vendorDetail.cats.map(([cat, cv]) => (React.createElement("div", { key: cat, className: "drillline" },
                                                        React.createElement("span", null,
                                                            React.createElement("span", { className: "dot", style: { background: colorFor(cat) } }),
                                                            cat),
                                                        React.createElement("span", { className: "tnum" }, fmtHome(cv))))))),
                                            React.createElement("button", { className: "btn btn-soft", style: { marginTop: 12 }, onClick: (e) => { e.stopPropagation(); drillVendorToHistory(v); } }, "View these in History")))))))))))),
                    React.createElement(SectionLabel, null, "Home currency"),
                    React.createElement("div", { className: "card" },
                        React.createElement("div", { className: "lblrow", style: { marginBottom: 8 } },
                            React.createElement("div", { className: "cardtitle", style: { marginBottom: 0 } },
                                home,
                                " \u00B7 ",
                                curName(home)),
                            React.createElement("span", { className: "pill", style: { background: "var(--gray-bg)", color: "var(--gray-fg)", borderColor: "var(--gray-bd)", cursor: "default" } }, "this phone only")),
                        React.createElement("div", { className: "cardbody" }, "All totals are shown in this currency. Each expense keeps the rate it was saved with. Your data is stored only on this phone \u2014 no account, no cloud."),
                        React.createElement("button", { className: "btn btn-soft", style: { borderRadius: 10, padding: 13 }, onClick: () => setPicker("home"), disabled: !!storageError }, "Change home currency")),
                    React.createElement(SectionLabel, null, "Export & import"),
                    React.createElement("div", { className: "card" },
                        React.createElement("div", { className: "cardtitle" }, "Take your data with you"),
                        React.createElement("div", { className: "cardbody" }, "Save your expenses as an Excel or CSV file, or send them straight to Mail, Messages, WhatsApp and anything else on your device."),
                        React.createElement("div", { className: "btnrow2" },
                            React.createElement("button", { className: "btn btn-soft", onClick: () => fileInputRef.current && fileInputRef.current.click(), disabled: importing || !!storageError }, importing ? "Importing…" : "Import file"),
                            React.createElement("button", { className: "btn btn-primary", style: { borderRadius: 10, padding: 12 }, disabled: filtered.length === 0, onClick: () => setShowExportMenu(true) }, "Export")),
                        React.createElement("input", { ref: fileInputRef, type: "file", accept: ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel", onChange: handleImportFile, style: { display: "none" } }),
                        importSummary && (React.createElement("div", { className: "importnote " + (importSummary.fileError || importSummary.saveError ? "bad" : "good") },
                            importSummary.fileError
                                ? "Couldn't read that file — make sure it's a CSV or Excel file with Date, Vendor and Amount columns."
                                : importSummary.saveError ? "Nothing was imported — the save failed, so no rows were added. Please try again."
                                    : `${importSummary.added} added · ${importSummary.skipped} duplicates skipped · ${importSummary.errored} rows had missing or invalid data (out of ${importSummary.total}).`,
                            React.createElement("button", { className: "linkbtn", onClick: () => setImportSummary(null) }, "Dismiss")))),
                    React.createElement(SectionLabel, null, "Terms of use"),
                    React.createElement("div", { className: "card" },
                        React.createElement("div", { className: "cardbody" },
                            "You accepted the ",
                            APP_NAME,
                            " Terms of Use, version ",
                            TERMS_VERSION,
                            ". Questions: willyros01@gmail.com"),
                        React.createElement("button", { className: "btn btn-soft", style: { borderRadius: 10, padding: 13 }, onClick: () => setShowTerms(true) }, "Read the terms")))),
            React.createElement("div", { style: { textAlign: "center", color: "var(--stamp)", fontSize: 11, fontWeight: 600, padding: "22px 0 4px" } },
                APP_NAME,
                " \u00B7 version ",
                APP_VERSION,
                Store.isNative ? "" : " · browser test"))),
        React.createElement(TabBar, { tab: tab, setTab: setTab }),
        picker && (React.createElement(CurrencyPicker, { title: picker === "home" ? "Home currency" : "Currency of this expense", selected: picker === "home" ? home : form.currency, home: home, recent: recent, onPick: pickCurrency, onClose: () => setPicker(null) })),
        lightbox && (React.createElement("div", { className: "overlay", onClick: () => setLightbox(null) },
            React.createElement("img", { src: lightbox, alt: "Receipt", className: "lightboximg" }))),
        showExportMenu && (React.createElement("div", { className: "overlay", onClick: () => setShowExportMenu(false) },
            React.createElement("div", { className: "sheet", onClick: e => e.stopPropagation() },
                React.createElement("div", { className: "sheethead" },
                    React.createElement("div", null,
                        React.createElement("div", { className: "cardtitle", style: { fontSize: 19 } }, "Export"),
                        React.createElement("div", { className: "cardbody", style: { marginBottom: 0 } },
                            filtered.length,
                            " ",
                            filtered.length === 1 ? "entry" : "entries",
                            " \u00B7 ",
                            fmtHome(totalH))),
                    React.createElement("button", { className: "linkbtn", onClick: () => setShowExportMenu(false) }, "Close")),
                React.createElement("div", { className: "btnrow2", style: { marginTop: 14 } },
                    React.createElement("button", { className: "btn btn-soft", style: { padding: "18px 10px" }, onClick: exportExcel }, "Excel (.xlsx)"),
                    React.createElement("button", { className: "btn btn-soft", style: { padding: "18px 10px" }, onClick: exportCSV }, "CSV (.csv)")),
                React.createElement("button", { className: "btn btn-primary", style: { marginTop: 8 }, onClick: shareViaMessaging }, "Send via Mail, Messages, WhatsApp\u2026"),
                React.createElement("div", { className: "hint", style: { textAlign: "center", marginTop: 8 } }, "Opens your device's share sheet so you can pick where it goes.")))),
        showTerms && React.createElement(TermsGate, { mode: "view", onClose: () => setShowTerms(false) }),
        pendingDelete && (React.createElement("div", { className: "undobar" },
            React.createElement("div", { className: "undorow" },
                React.createElement("span", null,
                    pendingDelete.ids.length,
                    " deleted"),
                React.createElement("button", { className: "undobtn", onClick: undoDelete },
                    "Undo ",
                    undoSecs,
                    "s")),
            React.createElement("div", { className: "undotrack" },
                React.createElement("div", { className: "undofill", style: { width: undoPct + "%" } })))),
        toast && React.createElement("div", { className: "toast" }, toast)));
}
try {
    ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(SpendRecorder, null));
    window.__appRendered = true;
}
catch (err) {
    document.getElementById("root").innerHTML =
        '<div style="font-family:-apple-system,sans-serif;padding:24px;max-width:600px;margin:0 auto;">' +
            '<h2 style="color:#DC3B30;">Something went wrong loading the app</h2>' +
            '<p>Please copy the text below and share it so this can be fixed:</p>' +
            '<pre style="background:#E8E8EC;color:#111114;padding:12px;border-radius:10px;white-space:pre-wrap;font-size:12px;">' +
            (err && err.stack ? err.stack : String(err)) + '</pre></div>';
    console.error(err);
}
