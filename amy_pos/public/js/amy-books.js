/* AMY console - chart of accounts, tax types and the VAT return */
(function(){
"use strict";
var AMY = window.AMY, h = AMY.h, V = AMY.views;
function L(a, e){ return AMY.lang === "ar" ? a : e }
function call(fn, args){ return AMY.call("amy_pos.books." + fn, args) }
function fld(label, el, hint){ return h("div", {class: "field"}, h("label", {text: label}), el, hint ? h("div", {class: "mut", style: "font-size:12.5px;margin-top:4px", text: hint}) : null) }
function busy(btn, p){ btn.disabled = true; return p.then(function(r){ btn.disabled = false; return r }, function(e){ btn.disabled = false; throw e }) }
function can(dt, p){ var x = AMY.boot.perms[dt]; return !!(x && x[p || "read"]) }
function txt(type, value, onch, ltr){
  var i = h("input", {class: "in", type: type || "text", value: value == null ? "" : value, autocomplete: "off"});
  if(ltr) i.setAttribute("dir", "ltr");
  i.addEventListener("input", function(){ onch(i.value) });
  return i;
}
function sel(opts, value, onch){
  var s = h("select", {class: "in"});
  opts.forEach(function(o){ var op = h("option", {value: o[0], text: o[1]}); if(String(o[0]) === String(value)) op.selected = true; s.appendChild(op) });
  s.addEventListener("change", function(){ onch(s.value) });
  return s;
}
function check(label, on, onch){ return h("label", {class: "chk"}, h("input", {type: "checkbox", checked: !!on, onchange: function(e){ onch(e.target.checked ? 1 : 0) }}), h("span", {text: label})) }
function save(name, text, mime){
  var a = h("a", {href: URL.createObjectURL(new Blob(["﻿" + text], {type: mime || "text/csv;charset=utf-8"})), download: name});
  document.body.appendChild(a); a.click(); a.remove();
}
function cell(v){ var t = String(v == null ? "" : v); if(/^[=+\-@\t\r]/.test(t) && isNaN(Number(t))) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"' }
function parseCsv(text){
  var rows = [], row = [], f = "", q = false, i, c;
  text = String(text).replace(/^﻿/, "");
  for(i = 0; i < text.length; i++){
    c = text[i];
    if(q){ if(c === '"'){ if(text[i + 1] === '"'){ f += '"'; i++ } else q = false } else f += c }
    else if(c === '"') q = true;
    else if(c === ","){ row.push(f); f = "" }
    else if(c === "\n" || c === "\r"){ if(c === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if(row.length > 1 || row[0] !== "") rows.push(row); row = [] }
    else f += c;
  }
  if(f !== "" || row.length){ row.push(f); rows.push(row) }
  return rows;
}

/* ===================================================== chart of accounts */
var ROOT = {Asset: ["الأصول", "Assets"], Liability: ["الالتزامات", "Liabilities"], Equity: ["حقوق الملكية", "Equity"], Income: ["الإيرادات", "Income"], Expense: ["المصروفات", "Expenses"]};
var ATYPE = {"": ["", ""], Bank: ["بنك", "Bank"], Cash: ["صندوق", "Cash"], Receivable: ["مدينون", "Receivable"], Payable: ["دائنون", "Payable"], "Income Account": ["إيراد", "Income"], "Expense Account": ["مصروف", "Expense"], Tax: ["ضريبة", "Tax"], Stock: ["مخزون", "Stock"], "Cost of Goods Sold": ["تكلفة مبيعات", "COGS"], Fixed: ["أصل ثابت", "Fixed asset"], Equity: ["حقوق ملكية", "Equity"], "Round Off": ["فروق تقريب", "Round off"], Depreciation: ["إهلاك", "Depreciation"], "Current Asset": ["أصل متداول", "Current asset"], "Current Liability": ["التزام متداول", "Current liability"], Chargeable: ["رسوم", "Chargeable"]};
var TYPE_OPTS = [["", "—"], ["Bank", "بنك"], ["Cash", "صندوق"], ["Receivable", "مدينون"], ["Payable", "دائنون"], ["Income Account", "إيراد"], ["Expense Account", "مصروف"], ["Cost of Goods Sold", "تكلفة مبيعات"], ["Tax", "ضريبة"], ["Stock", "مخزون"], ["Fixed Asset", "أصل ثابت"], ["Equity", "حقوق ملكية"], ["Round Off", "فروق تقريب"], ["Current Asset", "أصل متداول"], ["Current Liability", "التزام متداول"]];

V.coa = function(root){
  var title = L("شجرة الحسابات", "Chart of accounts");
  AMY.setTitle(title);
  var st = {q: "", cls: "", disabled: false, open: {}, init: false}, data = null;
  var canNew = can("Account", "create"), canEdit = can("Account", "write");
  var tree = h("div", {class: "coa"}), sum = h("div", {class: "coa-sum"});
  var acts = [];
  acts.push(h("button", {class: "btn g", type: "button", onclick: exportCsv}, AMY.icon("download"), L("تصدير نسخة", "Export backup")));
  if(canNew){
    acts.push(h("button", {class: "btn g", type: "button", onclick: importFile}, AMY.icon("undo"), L("استرداد من ملف", "Restore from file")));
    acts.push(h("button", {class: "btn p", type: "button", onclick: function(){ edit(null, "") }}, AMY.icon("plus"), L("حساب جديد", "New account")));
  }
  root.appendChild(AMY.pageHeader({title: title, sub: L("نظّم حسابات شركتك كما تريد: أضف وعدّل وانقل وعطّل، أو احفظ نسخة واسترجعها.", "Shape your accounts your way: add, edit, move or disable them, and back them up or restore them."), actions: acts}));
  root.appendChild(sum);
  var search = h("input", {class: "in", type: "search", placeholder: L("ابحث بالاسم أو الرقم", "Search by name or number"), style: "max-width:320px"});
  var tm; search.addEventListener("input", function(){ clearTimeout(tm); tm = setTimeout(function(){ st.q = search.value.trim().toLowerCase(); draw() }, 150) });
  var chips = h("div", {class: "seg"});
  function drawChips(){
    AMY.clear(chips);
    [["", L("الكل", "All")]].concat(Object.keys(ROOT).map(function(k){ return [k, AMY.lb(ROOT[k])] })).forEach(function(c){
      chips.appendChild(h("button", {type: "button", class: st.cls === c[0] ? "on" : "", text: c[1], onclick: function(){ st.cls = c[0]; drawChips(); draw() }}));
    });
  }
  drawChips();
  var bar = h("div", {class: "coa-bar"}, search, chips, h("span", {class: "sp"}),
    check(L("إظهار المعطّلة", "Show disabled"), 0, function(v){ st.disabled = !!v; draw() }),
    h("button", {class: "btn g s", type: "button", text: L("فتح الكل", "Expand all"), onclick: function(){ data.rows.forEach(function(a){ if(Number(a.is_group)) st.open[a.name] = 1 }); draw() }}),
    h("button", {class: "btn g s", type: "button", text: L("طيّ الكل", "Collapse all"), onclick: function(){ st.open = {}; draw() }}));
  root.appendChild(bar); root.appendChild(h("div", {class: "card flush"}, tree));

  function load(){
    AMY.clear(tree); tree.appendChild(h("div", {style: "padding:20px"}, h("div", {class: "sk", style: "width:55%"}), h("div", {class: "sk", style: "width:80%;margin-top:14px"}), h("div", {class: "sk", style: "width:65%;margin-top:14px"})));
    call("coa_tree", {}).then(function(d){
      data = d;
      if(!st.init){ st.init = true; d.rows.forEach(function(a){ if(!a.parent_account) st.open[a.name] = 1 }) }
      summary(); draw();
    }).catch(function(e){ AMY.clear(tree); AMY.fail(e) });
  }
  function summary(){
    AMY.clear(sum);
    if(!data.balances) return;
    var tot = {};
    data.rows.forEach(function(a){ if(!a.parent_account && a.balance != null) tot[a.root_type] = (tot[a.root_type] || 0) + a.balance });
    Object.keys(ROOT).forEach(function(k){
      if(tot[k] == null) return;
      sum.appendChild(h("button", {type: "button", class: "kpi2" + (st.cls === k ? " on" : ""), onclick: function(){ st.cls = st.cls === k ? "" : k; drawChips(); summary(); draw() }},
        h("span", {text: AMY.lb(ROOT[k])}), h("b", {class: "num", text: AMY.num(tot[k], 0)})));
    });
  }
  function draw(){
    if(!data) return;
    AMY.clear(tree);
    var kids = {}, byName = {};
    data.rows.forEach(function(a){ byName[a.name] = a; (kids[a.parent_account || ""] = kids[a.parent_account || ""] || []).push(a) });
    var match = null;
    if(st.q){
      match = {};
      data.rows.forEach(function(a){
        if((a.account_name || "").toLowerCase().indexOf(st.q) >= 0 || (a.account_number || "").toLowerCase().indexOf(st.q) >= 0 || a.name.toLowerCase().indexOf(st.q) >= 0){
          var p = a, n = 0; while(p && n < 30){ match[p.name] = 1; p = byName[p.parent_account]; n++ }
        }
      });
    }
    var shown = 0;
    function show(a){
      if(!st.disabled && Number(a.disabled)) return false;
      if(st.cls && a.root_type !== st.cls) return false;
      if(match && !match[a.name]) return false;
      return true;
    }
    function walk(a, depth){
      if(!show(a)) return;
      shown++;
      var isG = Number(a.is_group), ch = (kids[a.name] || []).filter(show), open = match ? true : !!st.open[a.name];
      var row = h("div", {class: "tr" + (isG ? " g" : "") + (Number(a.disabled) ? " off" : ""), style: "--d:" + depth});
      var caret = isG ? h("button", {type: "button", class: "car" + (open ? " open" : ""), "aria-label": "toggle", onclick: function(){ st.open[a.name] = !st.open[a.name]; draw() }}, AMY.icon("chev")) : h("span", {class: "car sp"});
      row.appendChild(h("div", {class: "nm"}, caret,
        a.account_number ? h("span", {class: "no num", text: a.account_number}) : null,
        h("span", {class: "t", text: a.account_name || a.name, title: a.name})));
      row.appendChild(h("div", {class: "ty"}, a.account_type ? h("span", {class: "tag", text: AMY.lb(ATYPE[a.account_type] || [a.account_type, a.account_type])}) : null,
        Number(a.disabled) ? h("span", {class: "tag off", text: L("معطّل", "Disabled")}) : null,
        a.account_type === "Tax" && Number(a.tax_rate) ? h("span", {class: "tag num", text: a.tax_rate + "%"}) : null));
      row.appendChild(h("div", {class: "bl num", text: a.balance == null ? "" : AMY.num(a.balance, 2)}));
      var ac = h("div", {class: "ac"});
      if(canNew && isG) ac.appendChild(h("button", {type: "button", class: "icobtn", title: L("حساب فرعي", "Add child"), onclick: function(){ edit(null, a.name) }}, AMY.icon("plus")));
      if(canEdit) ac.appendChild(h("button", {type: "button", class: "icobtn", title: L("تعديل", "Edit"), onclick: function(){ edit(a) }}, AMY.icon("edit")));
      row.appendChild(ac);
      tree.appendChild(row);
      if(isG && open) ch.forEach(function(c){ walk(c, depth + 1) });
    }
    (kids[""] || []).forEach(function(a){ walk(a, 0) });
    if(!shown) tree.appendChild(AMY.emptyBox(L("لا توجد حسابات مطابقة", "No matching accounts"), ""));
  }
  function edit(a, parent){
    var isNew = !a;
    var d = isNew ? {account_name: "", account_number: "", parent_account: parent || "", account_type: "", is_group: 0, tax_rate: 0, disabled: 0}
      : {name: a.name, account_name: a.account_name, account_number: a.account_number || "", parent_account: a.parent_account || "", account_type: a.account_type || "", is_group: Number(a.is_group), tax_rate: a.tax_rate || 0, disabled: Number(a.disabled)};
    AMY.drawer(isNew ? L("حساب جديد", "New account") : (a.account_name || a.name), function(dw){
      var taxBox = h("div");
      function drawTax(){ AMY.clear(taxBox); if(d.account_type === "Tax") taxBox.appendChild(fld(L("نسبة الضريبة %", "Tax rate %"), txt("number", d.tax_rate, function(v){ d.tax_rate = v }, true))) }
      var parentLink = a && !a.parent_account ? h("div", {class: "mut", text: L("حساب جذري", "Root account")}) : AMY.link({doctype: "Account", value: d.parent_account, filters: {company: data.company, is_group: 1}, onChange: function(v){ d.parent_account = v }});
      dw.body.appendChild(fld(L("اسم الحساب", "Account name"), txt("text", d.account_name, function(v){ d.account_name = v })));
      dw.body.appendChild(fld(L("رقم الحساب", "Account number"), txt("text", d.account_number, function(v){ d.account_number = v }, true)));
      dw.body.appendChild(fld(L("الحساب الرئيسي", "Parent account"), parentLink, isNew ? "" : L("غيّر الحساب الرئيسي لنقل هذا الحساب في الشجرة.", "Change the parent to move this account in the tree.")));
      dw.body.appendChild(fld(L("نوع الحساب", "Account type"), sel(TYPE_OPTS.map(function(o){ return [o[0], o[1]] }), d.account_type, function(v){ d.account_type = v; drawTax() })));
      drawTax(); dw.body.appendChild(taxBox);
      dw.body.appendChild(check(L("حساب رئيسي (تحته حسابات)", "Group account (has sub-accounts)"), d.is_group, function(v){ d.is_group = v }));
      if(!isNew) dw.body.appendChild(check(L("معطّل (لا يُستخدم في القيود الجديدة)", "Disabled (not used in new entries)"), d.disabled, function(v){ d.disabled = v }));
      var foot = [];
      if(!isNew && can("Account", "delete") && a.parent_account) foot.push(h("button", {class: "btn d", type: "button", text: AMY.t("delete") || L("حذف", "Delete"), onclick: function(){
        AMY.confirm({title: L("حذف الحساب؟", "Delete account?"), text: L("لا يمكن حذف حساب عليه حركات. عطّله بدلًا من ذلك.", "An account with entries can't be deleted. Disable it instead."), danger: 1, ok: L("حذف", "Delete")}).then(function(ok){
          if(ok) call("coa_delete", {name: a.name}).then(function(){ AMY.toast(L("تم الحذف", "Deleted"), "ok"); dw.close(); load() }).catch(AMY.fail);
        });
      }}));
      foot.push(h("button", {class: "btn g", type: "button", onclick: dw.close, text: AMY.t("close")}));
      foot.push(h("button", {class: "btn p", type: "button", text: AMY.t("save"), onclick: function(ev){
        busy(ev.currentTarget, call("coa_save", {data: d})).then(function(){ AMY.toast(AMY.t("saved"), "ok"); dw.close(); load() }).catch(AMY.fail);
      }}));
      dw.footer.appendChild(h("div", {style: "display:contents"}, foot));
    });
  }
  function exportCsv(){
    call("coa_export", {}).then(function(r){
      var lines = [r.columns.map(cell).join(",")];
      r.rows.forEach(function(x){ lines.push(x.map(cell).join(",")) });
      save("chart-of-accounts-" + new Date().toISOString().slice(0, 10) + ".csv", lines.join("\n"));
      AMY.toast(L("تم حفظ النسخة", "Backup saved"), "ok");
    }).catch(AMY.fail);
  }
  function importFile(){
    var inp = h("input", {type: "file", accept: ".csv,text/csv", style: "display:none"});
    inp.addEventListener("change", function(){
      var f = inp.files[0]; if(!f) return;
      var rd = new FileReader();
      rd.onload = function(){
        var rows = parseCsv(rd.result); if(rows.length < 2){ AMY.toast(L("الملف فارغ", "The file is empty"), "bad"); return }
        var head = rows[0].map(function(x){ return String(x).trim() }), objs = rows.slice(1).map(function(r){ var o = {}; head.forEach(function(k, i){ o[k] = r[i] }); return o });
        call("coa_import", {rows: objs, dry: 1}).then(function(p){
          AMY.confirm({title: L("استرداد الحسابات", "Restore accounts"), text: L("سيُنشأ ", "Will create ") + p.created.length + L(" حساب جديد وسيُترك ", " new accounts and leave ") + p.skipped + L(" موجود كما هو.", " existing ones untouched.") + (p.errors.length ? "\n" + p.errors.slice(0, 4).join("\n") : ""), ok: L("استرداد", "Restore")}).then(function(ok){
            if(ok) call("coa_import", {rows: objs, dry: 0}).then(function(r){ AMY.toast(L("تم إنشاء ", "Created ") + r.created.length + L(" حساب", " accounts"), r.errors.length ? "bad" : "ok"); load() }).catch(AMY.fail);
          });
        }).catch(AMY.fail);
      };
      rd.readAsText(f);
    });
    document.body.appendChild(inp); inp.click(); setTimeout(function(){ inp.remove() }, 60000);
  }
  load();
};

/* ===================================================== tax types */
var CLS = {
  standard: [["خاضعة للنسبة الأساسية", "Standard rate"], ["مبيعات ومشتريات خاضعة (15%).", "Taxable sales and purchases (15%)."]],
  zero: [["نسبة صفر", "Zero-rated"], ["خاضعة لكن بنسبة 0% داخل المملكة.", "Taxable at 0% inside the Kingdom."]],
  export: [["صادرات", "Exports"], ["بيع لعملاء خارج المملكة بنسبة 0%.", "Sales to customers outside the Kingdom at 0%."]],
  exempt: [["معفاة", "Exempt"], ["توريدات معفاة من الضريبة.", "Supplies exempt from VAT."]],
  import: [["استيراد", "Imports"], ["مشتريات مستوردة (الاحتساب العكسي).", "Imported purchases (reverse charge)."]],
  out: [["خارج النطاق", "Out of scope"], ["لا تدخل ضمن الإقرار الضريبي.", "Not part of the VAT return."]]
};
V.taxTypes = function(root){
  var title = L("أنواع الضريبة", "Tax types"), box = h("div"), state = null;
  AMY.setTitle(title);
  root.appendChild(AMY.pageHeader({title: title, sub: L("عرّف كل نوع ضريبة ونسبته وحسابه. الإقرار الضريبي يجمع المبالغ حسب هذه الأنواع.", "Define each tax type, its rate and its account. The VAT return totals by these types."),
    actions: [h("a", {class: "btn g", href: "#/vat"}, AMY.icon("rep"), L("الإقرار الضريبي", "VAT return"))]}));
  root.appendChild(box);
  function paint(s){
    state = s; AMY.clear(box);
    [["sales", L("ضرائب المبيعات", "Sales taxes"), L("تُحسب على فواتير البيع وتُسجَّل في حساب ضريبة المخرجات.", "Applied to sales invoices and posted to the output VAT account.")],
     ["purchase", L("ضرائب المشتريات", "Purchase taxes"), L("تُحسب على فواتير الشراء وتُسجَّل في حساب ضريبة المدخلات.", "Applied to purchase invoices and posted to the input VAT account.")]].forEach(function(k){
      var rows = s[k[0]], hd = h("div", {class: "hd", style: "margin-top:" + (k[0] === "sales" ? "8" : "40") + "px"}, h("h2", {text: k[1]}), h("p", {class: "mut", text: k[2]}));
      box.appendChild(hd);
      var tb = h("tbody");
      if(!rows.length) tb.appendChild(h("tr", null, h("td", {colspan: 5, class: "mut", style: "padding:22px;text-align:center", text: L("لا توجد أنواع بعد.", "None yet.")})));
      rows.forEach(function(r){
        var acc = r.rows.map(function(x){ return x.account }).join("، ");
        tb.appendChild(h("tr", {class: s.can[k[0]] ? "go" : "", onclick: function(){ if(s.can[k[0]]) edit(k[0], r) }},
          h("td", null, h("b", {text: r.title}), r.default ? h("span", {class: "tag", style: "margin-inline-start:8px", text: L("افتراضي", "Default")}) : null, Number(r.disabled) ? h("span", {class: "tag off", style: "margin-inline-start:8px", text: L("معطّل", "Disabled")}) : null),
          h("td", null, h("span", {class: "pill " + (r.vat_class === "standard" ? "ok" : r.vat_class === "out" ? "" : "info"), text: AMY.lb(CLS[r.vat_class][0])}), r.classified ? null : h("div", {class: "mut", style: "font-size:12px", text: L("صُنّف تلقائيًا حسب النسبة", "Classified by rate")})),
          h("td", {class: "num end", text: AMY.num(r.rate, 2) + "%"}),
          h("td", {text: acc.replace(/ - [A-Za-z0-9]+$/, ""), title: acc}),
          h("td", {class: "end"}, s.can[k[0]] ? h("span", {class: "mut"}, AMY.icon("edit")) : null)));
      });
      box.appendChild(h("div", {class: "card flush"}, h("div", {class: "scroll"}, h("table", {class: "tbl"},
        h("thead", null, h("tr", null, [L("الاسم", "Name"), L("التصنيف في الإقرار", "VAT return class"), L("النسبة", "Rate"), L("الحساب", "Account"), ""].map(function(x, i){ return h("th", {class: i === 2 ? "end" : "", text: x}) }))), tb))));
      if(s.can[k[0]]) box.appendChild(h("div", {style: "margin-top:12px"}, h("button", {class: "btn g", type: "button", onclick: function(){ edit(k[0], null) }}, AMY.icon("plus"), L("نوع ضريبة جديد", "New tax type"))));
    });
    box.appendChild(h("div", {class: "hd", style: "margin-top:40px"}, h("h2", {text: L("كيف تظهر في الإقرار؟", "How they appear in the return")})));
    var g = h("div", {class: "cls-grid"});
    Object.keys(CLS).forEach(function(k){ g.appendChild(h("div", {class: "cls"}, h("b", {text: AMY.lb(CLS[k][0])}), h("span", {text: AMY.lb(CLS[k][1])}))) });
    box.appendChild(g);
  }
  function edit(kind, r){
    var isNew = !r;
    var d = isNew ? {kind: kind, title: "", vat_class: "standard", rate: 15, account: "", default: 0, disabled: 0}
      : {kind: kind, name: r.name, title: r.title, vat_class: r.vat_class, rate: r.rate, account: r.rows[0] ? r.rows[0].account : "", default: r.default, disabled: Number(r.disabled)};
    var classes = state.classes.filter(function(c){ return kind === "sales" ? c !== "import" : c !== "export" });
    AMY.drawer(isNew ? L("نوع ضريبة جديد", "New tax type") : r.title, function(dw){
      var rate = txt("number", d.rate, function(v){ d.rate = v }, true);
      dw.body.appendChild(fld(L("الاسم", "Name"), txt("text", d.title, function(v){ d.title = v }), L("مثل: ضريبة 15% أو صادرات 0%.", "For example: VAT 15% or Exports 0%.")));
      dw.body.appendChild(fld(L("التصنيف في الإقرار", "VAT return class"), sel(classes.map(function(c){ return [c, AMY.lb(CLS[c][0])] }), d.vat_class, function(v){
        d.vat_class = v; if(v !== "standard"){ d.rate = 0; rate.value = 0 } else if(!Number(d.rate)){ d.rate = 15; rate.value = 15 }
      }), L("يحدد في أي بند يظهر هذا النوع.", "Decides which box this type is reported in.")));
      dw.body.appendChild(fld(L("النسبة %", "Rate %"), rate));
      dw.body.appendChild(fld(L("حساب الضريبة", "Tax account"), AMY.link({doctype: "Account", value: d.account, filters: {company: AMY.boot.company, is_group: 0, account_type: "Tax"}, onChange: function(v){ d.account = v }}), kind === "sales" ? L("حساب ضريبة المخرجات.", "Output VAT account.") : L("حساب ضريبة المدخلات.", "Input VAT account.")));
      dw.body.appendChild(check(L("استخدمه افتراضيًا في الفواتير الجديدة", "Use by default on new invoices"), d.default, function(v){ d.default = v }));
      if(!isNew) dw.body.appendChild(check(L("معطّل", "Disabled"), d.disabled, function(v){ d.disabled = v }));
      var foot = [];
      if(!isNew && can(kind === "sales" ? "Sales Taxes and Charges Template" : "Purchase Taxes and Charges Template", "delete")) foot.push(h("button", {class: "btn d", type: "button", text: L("حذف", "Delete"), onclick: function(){
        AMY.confirm({title: L("حذف نوع الضريبة؟", "Delete tax type?"), text: L("لا يمكن حذف نوع مستخدم في فواتير. عطّله بدلًا من ذلك.", "A type used on invoices can't be deleted. Disable it instead."), danger: 1, ok: L("حذف", "Delete")}).then(function(ok){
          if(ok) call("tax_type_delete", {kind: kind, name: r.name}).then(function(s){ AMY.toast(L("تم الحذف", "Deleted"), "ok"); dw.close(); paint(s) }).catch(AMY.fail);
        });
      }}));
      foot.push(h("button", {class: "btn g", type: "button", onclick: dw.close, text: AMY.t("close")}));
      foot.push(h("button", {class: "btn p", type: "button", text: AMY.t("save"), onclick: function(ev){
        busy(ev.currentTarget, call("tax_type_save", {data: d})).then(function(s){ AMY.toast(AMY.t("saved"), "ok"); dw.close(); paint(s) }).catch(AMY.fail);
      }}));
      dw.footer.appendChild(h("div", {style: "display:contents"}, foot));
    });
  }
  box.appendChild(h("div", {class: "sk", style: "width:60%"}));
  call("tax_types", {}).then(paint).catch(function(e){ AMY.clear(box); AMY.fail(e) });
};

/* ===================================================== VAT return */
function iso(d){ return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) }
function period(kind){
  var n = new Date(), y = n.getFullYear(), m = n.getMonth(), q = Math.floor(m / 3);
  switch(kind){
    case "month": return [iso(new Date(y, m, 1)), iso(n)];
    case "lastMonth": return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "quarter": return [iso(new Date(y, q * 3, 1)), iso(n)];
    case "lastQuarter": return [iso(new Date(y, q * 3 - 3, 1)), iso(new Date(y, q * 3, 0))];
    case "year": return [iso(new Date(y, 0, 1)), iso(n)];
  }
  return null;
}
V.vat = function(root){
  var title = L("الإقرار الضريبي", "VAT return");
  AMY.setTitle(title);
  var cur = "month", range = period("month"), res = null, out = h("div", {class: "vat"});
  var from = h("input", {class: "in", type: "date", value: range[0]}), to = h("input", {class: "in", type: "date", value: range[1]});
  var seg = h("div", {class: "seg"});
  var PRESETS = [["month", L("هذا الشهر", "This month")], ["lastMonth", L("الشهر الماضي", "Last month")], ["quarter", L("هذا الربع", "This quarter")], ["lastQuarter", L("الربع الماضي", "Last quarter")], ["year", L("هذه السنة", "This year")], ["custom", L("مخصص", "Custom")]];
  function drawSeg(){
    AMY.clear(seg);
    PRESETS.forEach(function(p){ seg.appendChild(h("button", {type: "button", class: cur === p[0] ? "on" : "", text: p[1], onclick: function(){
      cur = p[0]; if(p[0] !== "custom"){ var r = period(p[0]); from.value = r[0]; to.value = r[1]; run() } drawSeg() } })) });
  }
  drawSeg();
  from.addEventListener("change", function(){ cur = "custom"; drawSeg() }); to.addEventListener("change", function(){ cur = "custom"; drawSeg() });
  root.appendChild(AMY.pageHeader({title: title, sub: L("ضريبة القيمة المضافة المحسوبة من الفواتير المعتمدة، جاهزة للمراجعة والتقديم.", "VAT calculated from submitted invoices, ready to review and file."),
    actions: [h("button", {class: "btn g noprint", type: "button", onclick: exportCsv}, AMY.icon("download"), L("تصدير", "Export")), h("button", {class: "btn p noprint", type: "button", onclick: function(){ window.print() }}, AMY.icon("print"), L("طباعة / PDF", "Print / PDF"))]}));
  root.appendChild(h("div", {class: "vat-ctl noprint"}, seg, h("div", {class: "rng"}, h("label", {text: L("من", "From")}), from, h("label", {text: L("إلى", "To")}), to,
    h("button", {class: "btn p s", type: "button", text: L("احسب", "Calculate"), onclick: run}))));
  root.appendChild(out);

  var SALES = [["standard", L("المبيعات الخاضعة للنسبة الأساسية", "Standard-rated sales")], ["zero", L("المبيعات بنسبة صفر (محلية)", "Zero-rated domestic sales")], ["export", L("الصادرات", "Exports")], ["exempt", L("المبيعات المعفاة", "Exempt sales")], ["out", L("خارج النطاق", "Out of scope")]];
  var BUY = [["standard", L("المشتريات المحلية الخاضعة للنسبة الأساسية", "Standard-rated domestic purchases")], ["import", L("الواردات (الاحتساب العكسي)", "Imports (reverse charge)")], ["zero", L("المشتريات بنسبة صفر", "Zero-rated purchases")], ["exempt", L("المشتريات المعفاة", "Exempt purchases")], ["out", L("خارج النطاق", "Out of scope")]];
  function money(v){ return AMY.num(v, 2) }
  function section(name, defs, boxes, startNo){
    var tb = h("tbody"), t = {amount: 0, adjust: 0, vat: 0};
    defs.forEach(function(d, i){
      var b = boxes[d[0]]; t.amount += b.amount; t.adjust += b.adjust; t.vat += b.vat;
      var tr = h("tr", {class: b.count ? "go" : "mt0", onclick: function(){ if(b.count) drill(d[1], b) }},
        h("td", {class: "no num", text: String(startNo + i)}), h("td", null, h("span", {text: d[1]}), b.count ? h("small", {class: "mut", text: " · " + b.count + L(" مستند", " docs")}) : null),
        h("td", {class: "num end", text: money(b.amount)}), h("td", {class: "num end", text: money(b.adjust)}), h("td", {class: "num end", text: money(b.vat)}));
      tb.appendChild(tr);
    });
    tb.appendChild(h("tr", {class: "tot"}, h("td"), h("td", {text: L("الإجمالي", "Total")}), h("td", {class: "num end", text: money(t.amount)}), h("td", {class: "num end", text: money(t.adjust)}), h("td", {class: "num end", text: money(t.vat)})));
    return h("div", {class: "vat-sec"}, h("h3", {text: name}), h("div", {class: "scroll"}, h("table", {class: "tbl vt"},
      h("thead", null, h("tr", null, h("th"), h("th", {text: L("البند", "Item")}), h("th", {class: "end", text: L("المبلغ (قبل الضريبة)", "Amount (before VAT)")}), h("th", {class: "end", text: L("التعديلات (مرتجعات)", "Adjustments (returns)")}), h("th", {class: "end", text: L("مبلغ الضريبة", "VAT amount")}))), tb)));
  }
  function paint(r){
    res = r; AMY.clear(out);
    var net = r.net_vat, pay = net >= 0;
    out.appendChild(h("div", {class: "vat-hero " + (pay ? "pay" : "ref")},
      h("div", {class: "vmain"}, h("span", {class: "lb", text: pay ? L("صافي الضريبة المستحقة للهيئة", "Net VAT payable to ZATCA") : L("صافي الضريبة المستردة", "Net VAT refundable")}),
        h("b", {class: "num", text: money(Math.abs(net))}), h("small", {text: r.currency})),
      h("div", {class: "vparts"},
        h("div", null, h("span", {text: L("ضريبة المخرجات (المبيعات)", "Output VAT (sales)")}), h("b", {class: "num", text: money(r.output_vat)})),
        h("div", null, h("span", {text: L("ضريبة المدخلات (المشتريات)", "Input VAT (purchases)")}), h("b", {class: "num", text: money(r.input_vat)}))),
      h("div", {class: "vmeta"}, h("span", {text: r.company}), r.tax_id ? h("span", {class: "num", text: L("الرقم الضريبي ", "VAT no ") + r.tax_id}) : null, h("span", {class: "num", text: AMY.date(r.from) + " — " + AMY.date(r.to)}))));
    if(r.drafts) out.appendChild(h("div", {class: "note warn noprint", style: "margin:18px 0"}, h("b", {text: r.drafts + L(" فاتورة مبيعات مسودة في هذه الفترة لم تُحتسب. اعتمدها أولًا إن كانت نهائية.", " draft sales invoices in this period are not counted. Submit them first if they are final.")}), h("a", {class: "btn g s", href: "#/sales-invoices"}, L("افتح الفواتير", "Open invoices"))));
    out.appendChild(section(L("ضريبة المخرجات: المبيعات", "Output VAT: sales"), SALES, r.sales, 1));
    out.appendChild(section(L("ضريبة المدخلات: المشتريات", "Input VAT: purchases"), BUY, r.purchase, 6));
    out.appendChild(h("div", {class: "vat-net"}, h("span", {text: L("صافي الضريبة = ضريبة المخرجات − ضريبة المدخلات", "Net VAT = output VAT − input VAT")}), h("b", {class: "num", text: money(net) + " " + r.currency})));
    if(r.ledger_net != null){
      var diff = Math.round((r.output_vat - r.input_vat - r.ledger_net) * 100) / 100;
      out.appendChild(h("div", {class: "note " + (Math.abs(diff) < 0.05 ? "ok" : "warn"), style: "margin-top:18px"}, h("b", {text: Math.abs(diff) < 0.05
        ? L("الإقرار يطابق دفتر الأستاذ لحسابات الضريبة.", "The return matches the ledger's tax accounts.")
        : L("فرق ", "Difference ") + money(diff) + L(" بين الإقرار وحسابات الضريبة في دفتر الأستاذ، راجع القيود اليدوية على حسابات الضريبة.", " between the return and the ledger's tax accounts. Check manual entries on tax accounts.")})));
    }
    out.appendChild(h("p", {class: "mut noprint", style: "margin-top:14px;font-size:12.5px", text: L("اضغط على أي بند لعرض الفواتير التي كوّنته. التصنيف يُحدد من أنواع الضريبة في الإعدادات.", "Select a row to see the invoices behind it. Classification comes from the tax types in Settings.")}));
  }
  function drill(name, b){
    AMY.drawer(name, function(dw){
      var tb = h("tbody");
      b.docs.forEach(function(d){
        tb.appendChild(h("tr", null, h("td", null, h("a", {class: "xl-link", href: "#/" + (b._k === "p" ? "purchase-invoices" : "sales-invoices") + "/" + encodeURIComponent(d.name), onclick: dw.close, text: d.name})),
          h("td", {text: AMY.date(d.date)}), h("td", {text: d.party || ""}), h("td", {class: "num end", text: money(d.net)}), h("td", {class: "num end", text: money(d.vat)})));
      });
      dw.body.appendChild(h("div", {class: "scroll"}, h("table", {class: "tbl"}, h("thead", null, h("tr", null, [L("الفاتورة", "Invoice"), L("التاريخ", "Date"), L("الطرف", "Party"), L("الصافي", "Net"), L("الضريبة", "VAT")].map(function(x, i){ return h("th", {class: i > 2 ? "end" : "", text: x}) }))), tb)));
      if(b.count > b.docs.length) dw.body.appendChild(h("p", {class: "mut", text: L("تم عرض أول ", "Showing the first ") + b.docs.length + L(" مستند.", " documents.")}));
      dw.footer.appendChild(h("button", {class: "btn g", type: "button", onclick: dw.close, text: AMY.t("close")}));
    });
  }
  function exportCsv(){
    if(!res) return;
    var lines = [[L("البند", "Item"), L("المبلغ", "Amount"), L("التعديلات", "Adjustments"), L("الضريبة", "VAT")].map(cell).join(",")];
    SALES.forEach(function(d){ var b = res.sales[d[0]]; lines.push([L("مبيعات: ", "Sales: ") + d[1], b.amount, b.adjust, b.vat].map(cell).join(",")) });
    BUY.forEach(function(d){ var b = res.purchase[d[0]]; lines.push([L("مشتريات: ", "Purchases: ") + d[1], b.amount, b.adjust, b.vat].map(cell).join(",")) });
    lines.push([L("ضريبة المخرجات", "Output VAT"), "", "", res.output_vat].map(cell).join(","));
    lines.push([L("ضريبة المدخلات", "Input VAT"), "", "", res.input_vat].map(cell).join(","));
    lines.push([L("صافي الضريبة", "Net VAT"), "", "", res.net_vat].map(cell).join(","));
    save("vat-return-" + res.from + "_" + res.to + ".csv", lines.join("\n"));
  }
  function run(){
    AMY.clear(out); out.appendChild(h("div", {class: "card"}, h("div", {class: "sk", style: "width:40%"}), h("div", {class: "sk", style: "width:90%;margin-top:14px"}), h("div", {class: "sk", style: "width:70%;margin-top:14px"})));
    call("vat_return", {from_date: from.value, to_date: to.value}).then(function(r){
      Object.keys(r.purchase).forEach(function(k){ r.purchase[k]._k = "p" });
      paint(r);
    }).catch(function(e){ AMY.clear(out); out.appendChild(h("div", {class: "err", text: e.message || AMY.t("err")})); AMY.fail(e) });
  }
  run();
};

/* ===================================================== navigation */
AMY.cfg.nav.forEach(function(g){
  if(g.id === "acc"){
    g.k.forEach(function(k){ if(k.to === "/accounts"){ k.to = "/chart"; k.dt = "Account" } });
    g.k.push({to: "/vat", l: ["الإقرار الضريبي", "VAT return"], dt: "Sales Invoice"});
  }
  if(g.id === "set"){
    var i = g.k.findIndex(function(k){ return k.to === "/sales-taxes" });
    if(i >= 0) g.k.splice(i, 1, {to: "/tax-types", l: ["أنواع الضريبة", "Tax types"], dt: "Sales Taxes and Charges Template"});
  }
});
AMY.cfg.settings.forEach(function(s){
  if(s.to === "/accounts") s.to = "/chart";
  if(s.to === "/sales-taxes"){ s.to = "/tax-types"; s.l = ["أنواع الضريبة", "Tax types"]; s.d = ["كل نوع ضريبة ونسبته وحسابه، وكيف يظهر في الإقرار.", "Each tax type, its rate, its account and how it shows in the return."] }
});
AMY.cfg.settings = AMY.cfg.settings.filter(function(s){ return s.to !== "/purchase-taxes" });
})();
