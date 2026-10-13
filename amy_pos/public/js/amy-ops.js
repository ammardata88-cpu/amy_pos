/* AMY console - expenses and e-invoicing (ZATCA) pages */
(function(){
"use strict";
var AMY = window.AMY, h = AMY.h, V = AMY.views;
function L(a, e){ return AMY.lang === "ar" ? a : e }
function call(fn, args){ return AMY.call("amy_pos.ops." + fn, args) }
function fld(label, el, hint){ return h("div", {class: "field"}, h("label", {text: label}), el, hint ? h("div", {class: "mut", style: "font-size:var(--t-sm);margin-top:4px", text: hint}) : null) }
function busy(btn, p){
  btn.disabled = true;
  return p.then(function(r){ btn.disabled = false; return r }, function(e){ btn.disabled = false; throw e });
}
function sel(opts, value, onch){
  var s = h("select", {class: "in"});
  opts.forEach(function(o){ var op = h("option", {value: o[0], text: o[1]}); if(String(o[0]) === String(value)) op.selected = true; s.appendChild(op) });
  s.addEventListener("change", function(){ onch(s.value) });
  return s;
}
function txt(type, value, onch, ltr){
  var i = h("input", {class: "in", type: type || "text", value: value == null ? "" : value, autocomplete: "off"});
  if(ltr) i.setAttribute("dir", "ltr");
  i.addEventListener("input", function(){ onch(i.value) });
  return i;
}

/* ================= expenses ================= */
V.expenses = function(root, openNew){
  var title = L("المصروفات", "Expenses"), body = h("tbody"), st = {q: "", start: 0}, opts = null;
  var canNew = AMY.boot.perms["Journal Entry"] && AMY.boot.perms["Journal Entry"].create;
  AMY.setTitle(title);
  var month = h("b", {class: "num", text: "—"});
  root.appendChild(AMY.pageHeader({
    title: title, sub: L("سجّل مصروفات الشركة من الصندوق أو البنك، وتُرحَّل للمحاسبة تلقائيًا.", "Record company spending from cash or bank. It posts to accounting automatically."),
    actions: canNew ? [h("button", {class: "btn p", type: "button", onclick: function(){ edit() }}, AMY.icon("plus"), L("مصروف جديد", "New expense"))] : []
  }));
  root.appendChild(h("div", {class: "note ok", style: "margin-bottom:18px"}, h("span", {text: L("مصروفات هذا الشهر: ", "This month: ")}), month));
  var search = h("input", {class: "in", type: "search", placeholder: L("بحث بالرقم أو البيان أو المرجع", "Search number, note or reference"), style: "max-width:360px;margin-bottom:14px"});
  var tm; search.addEventListener("input", function(){ clearTimeout(tm); tm = setTimeout(function(){ st.q = search.value; load() }, 250) });
  root.appendChild(search);
  var head = [L("التاريخ", "Date"), L("الرقم", "Number"), L("الحساب", "Account"), L("دُفع من", "Paid from"), L("البيان", "Note"), L("المبلغ", "Amount"), L("الحالة", "Status")];
  root.appendChild(h("div", {class: "card flush"}, h("div", {class: "scroll"}, h("table", {class: "tbl"},
    h("thead", null, h("tr", null, head.map(function(x, i){ return h("th", {class: i === 5 ? "end" : "", text: x}) }))), body))));
  function acctName(n){ return n ? n.replace(/ - [A-Za-z0-9]+$/, "") : "" }
  function load(){
    AMY.clear(body); body.appendChild(h("tr", null, h("td", {colspan: 7}, h("div", {class: "sk", style: "width:60%"}))));
    call("expense_list", {search: st.q, start: 0, limit: 50}).then(function(r){
      AMY.clear(body); month.textContent = AMY.money(r.month_total, AMY.cur());
      if(!r.rows.length){ body.appendChild(h("tr", null, h("td", {colspan: 7, class: "mut", style: "padding:28px;text-align:center", text: L("لا توجد مصروفات بعد. اضغط «مصروف جديد» لتسجيل أول مصروف.", "No expenses yet. Choose “New expense” to record the first one.")}))); return }
      r.rows.forEach(function(x){
        body.appendChild(h("tr", {class: "go", onclick: function(){ AMY.go("/journal-entries/" + encodeURIComponent(x.name)) }},
          h("td", {text: AMY.date(x.posting_date)}), h("td", {class: "num", text: x.name}),
          h("td", {text: acctName(x.account)}), h("td", {text: acctName(x.paid_from)}),
          h("td", {text: [x.note, x.bill_no].filter(Boolean).join(" · ")}),
          h("td", {class: "end num", text: AMY.money(x.total_debit)}), h("td", null, AMY.docPill(x.docstatus))));
      });
    }).catch(function(e){ AMY.clear(body); AMY.fail(e) });
  }
  function edit(){
    var data = {date: new Date().toISOString().slice(0, 10), expense_account: "", pay_account: "", amount: "", vat: "none", cost_center: "", reference: "", notes: ""};
    AMY.drawer(L("مصروف جديد", "New expense"), function(dw){
      dw.body.appendChild(h("div", {class: "sk", style: "width:60%"}));
      (opts ? Promise.resolve(opts) : call("expense_options", {})).then(function(o){
        opts = o; AMY.clear(dw.body);
        if(o.pay_accounts.length) data.pay_account = o.pay_accounts[0].name;
        var info = h("div", {class: "note", style: "margin-top:6px"});
        function calc(){
          var a = Number(data.amount) || 0, r = o.vat_rate || 15, net = a, vat = 0;
          if(data.vat === "incl"){ net = Math.round(a / (1 + r / 100) * 100) / 100; vat = Math.round((a - net) * 100) / 100 }
          else if(data.vat === "excl"){ vat = Math.round(a * r) / 100 }
          info.textContent = a > 0 ? L("الصافي ", "Net ") + AMY.money(net) + L(" · الضريبة ", " · VAT ") + AMY.money(vat) + L(" · المدفوع ", " · Paid ") + AMY.money(net + vat) : "";
        }
        var acc = AMY.link({doctype: "Account", filters: {company: o.company, root_type: "Expense", is_group: 0, disabled: 0}, placeholder: L("اختر نوع المصروف", "Choose a type"), onChange: function(v){ data.expense_account = v }});
        dw.body.appendChild(fld(L("التاريخ", "Date"), txt("date", data.date, function(v){ data.date = v })));
        dw.body.appendChild(fld(L("نوع المصروف", "Expense type"), acc, L("مثل الإيجار أو الكهرباء أو الرواتب.", "For example rent, electricity or salaries.")));
        dw.body.appendChild(fld(L("دُفع من", "Paid from"), sel(o.pay_accounts.map(function(a){ return [a.name, a.account_name + (a.account_type === "Bank" ? L(" (بنك)", " (bank)") : L(" (نقدي)", " (cash)"))] }), data.pay_account, function(v){ data.pay_account = v })));
        dw.body.appendChild(fld(L("المبلغ", "Amount"), txt("number", "", function(v){ data.amount = v; calc() }, true)));
        if(o.vat_ready) dw.body.appendChild(fld(L("ضريبة القيمة المضافة", "VAT"), sel([["none", L("بدون ضريبة", "No VAT")], ["incl", L("المبلغ شامل " + o.vat_rate + "%", "Amount includes " + o.vat_rate + "%")], ["excl", L("أضف " + o.vat_rate + "% على المبلغ", "Add " + o.vat_rate + "% on top")]], data.vat, function(v){ data.vat = v; calc() })));
        dw.body.appendChild(info);
        if(o.cost_centers.length > 1) dw.body.appendChild(fld(L("مركز التكلفة", "Cost center"), AMY.link({doctype: "Cost Center", filters: {company: o.company, is_group: 0}, placeholder: o.default_cost_center || "", onChange: function(v){ data.cost_center = v }})));
        dw.body.appendChild(fld(L("رقم فاتورة المورد / المرجع", "Receipt or reference no."), txt("text", "", function(v){ data.reference = v }, true)));
        dw.body.appendChild(fld(L("ملاحظات", "Notes"), txt("text", "", function(v){ data.notes = v })));
      }).catch(function(e){ dw.close(); AMY.fail(e) });
      dw.footer.appendChild(h("div", {style: "display:contents"},
        h("button", {class: "btn g", type: "button", onclick: dw.close, text: AMY.t("close")}),
        h("button", {class: "btn p", type: "button", text: AMY.t("save"), onclick: function(ev){
          busy(ev.currentTarget, call("expense_save", {data: data})).then(function(){ AMY.toast(AMY.t("saved"), "ok"); dw.close(); load() }).catch(AMY.fail);
        }})));
    });
  }
  load();
  if(openNew && canNew) setTimeout(function(){ edit() }, 0);
};

/* ================= e-invoicing (ZATCA) ================= */
V.einvoice = function(root){
  var title = L("الفوترة الإلكترونية (ZATCA)", "E-invoicing (ZATCA)"), box = h("div");
  AMY.setTitle(title);
  root.appendChild(AMY.pageHeader({title: title, sub: L("اربط منشأتك بهيئة الزكاة والضريبة والجمارك خطوة بخطوة، دون مغادرة النظام.", "Connect your business to ZATCA step by step, without leaving the console."),
    actions: [h("a", {class: "btn g", href: "#/zatca"}, AMY.icon("list"), L("سجل الفواتير المرسلة", "Sent invoices"))]}));
  root.appendChild(box);
  var STEPS = {
    settings: [L("بيانات المنشأة", "Business details"), L("الاسم والرقم الضريبي والعنوان.", "Name, VAT number and address.")],
    cli: [L("تثبيت أدوات التوقيع", "Signing tools"), L("تُنزَّل مرة واحدة على الخادم.", "Installed once on the server.")],
    onboard: [L("تسجيل الجهاز", "Register the device"), L("باستخدام رمز OTP من بوابة فاتورة.", "With the OTP from the Fatoora portal.")],
    production: [L("شهادة التشغيل", "Production certificate"), L("بعد نجاح فحوصات الامتثال.", "After the compliance checks pass.")],
    enabled: [L("تفعيل الإرسال", "Switch on"), L("تُرسل الفواتير تلقائيًا بعد اعتمادها.", "Invoices are sent as soon as they are submitted.")]
  };
  var ST = {Accepted: ["ok", L("مقبولة", "Accepted")], "Accepted with warnings": ["warn", L("مقبولة بتحذيرات", "Accepted with warnings")], Rejected: ["bad", L("مرفوضة", "Rejected")], "Ready For Batch": ["info", L("بانتظار الإرسال", "Waiting to send")], Resend: ["warn", L("إعادة إرسال", "Resend")], Pending: ["", L("قيد المعالجة", "Pending")]};
  function paint(s){
    AMY.clear(box);
    if(!s.installed){ box.appendChild(AMY.emptyBox(L("تطبيق الفوترة غير مثبت", "E-invoicing app is not installed"), L("هذا الموقع لا يحتوي على ksa_compliance.", "This site does not have ksa_compliance."))); return }
    var done = s.steps.filter(function(x){ return x.ok }).length, next = s.steps.filter(function(x){ return !x.ok })[0];
    box.appendChild(h("div", {class: "note " + (next ? "warn" : "ok")}, h("b", {text: next ? L("أكملت " + done + " من 5 خطوات", done + " of 5 steps done") : L("الفوترة الإلكترونية تعمل", "E-invoicing is live")})));
    var ul = h("ul", {class: "chk-list"});
    s.steps.forEach(function(x){ var t = STEPS[x.key]; ul.appendChild(h("li", {class: x.ok ? "ok" : "no"}, h("i", null, AMY.icon(x.ok ? "check" : "clock")), h("span", null, h("b", {text: t[0]}), " — ", t[1]))) });
    box.appendChild(ul);
    details(s); if(s.settings) onboarding(s); recent(s);
  }
  function details(s){
    var cur = s.settings, data = {};
    ["seller_name", "vat_registration_number", "company_unit", "company_unit_serial", "company_category", "company_address", "fatoora_server", "sync_with_zatca", "type_of_business_transactions"].forEach(function(k){
      data[k] = cur ? cur[k] : (s.suggest[k] || (k === "fatoora_server" ? "Sandbox" : k === "sync_with_zatca" ? "Live" : k === "type_of_business_transactions" ? "Let the system decide (both)" : ""));
    });
    var card = h("div", {class: "card sec", style: "margin-top:28px"});
    card.appendChild(h("div", {class: "sl"}, h("h3", {text: STEPS.settings[0]}), h("p", {class: "mut", text: STEPS.settings[1]})));
    var g = h("div", {class: "fgrid"});
    g.appendChild(fld(L("اسم البائع", "Seller name"), txt("text", data.seller_name, function(v){ data.seller_name = v })));
    g.appendChild(fld(L("الرقم الضريبي (15 رقمًا)", "VAT number (15 digits)"), txt("text", data.vat_registration_number, function(v){ data.vat_registration_number = v }, true)));
    g.appendChild(fld(L("اسم الوحدة", "Unit name"), txt("text", data.company_unit, function(v){ data.company_unit = v })));
    g.appendChild(fld(L("الرقم التسلسلي للوحدة", "Unit serial"), txt("text", data.company_unit_serial, function(v){ data.company_unit_serial = v }, true)));
    g.appendChild(fld(L("نشاط المنشأة", "Business category"), txt("text", data.company_category, function(v){ data.company_category = v })));
    g.appendChild(fld(L("عنوان المنشأة", "Business address"), s.addresses.length ? sel(s.addresses.map(function(a){ return [a, a] }), data.company_address, function(v){ data.company_address = v }) : h("div", {class: "err", text: L("أضف عنوانًا للشركة أولًا (إعدادات › بيانات الشركة).", "Add a company address first (Settings › Company).")})));
    g.appendChild(fld(L("بيئة فاتورة", "Fatoora environment"), sel([["Sandbox", L("تجريبية (Sandbox)", "Sandbox")], ["Simulation", L("محاكاة (Simulation)", "Simulation")], ["Production", L("إنتاج (Production)", "Production")]], data.fatoora_server, function(v){ data.fatoora_server = v })));
    g.appendChild(fld(L("طريقة الإرسال", "Sending"), sel([["Live", L("فوري", "Live")], ["Batches", L("دفعات", "Batches")]], data.sync_with_zatca, function(v){ data.sync_with_zatca = v })));
    g.appendChild(fld(L("نوع الفواتير", "Invoice types"), sel([["Let the system decide (both)", L("تلقائي (الاثنان)", "Automatic (both)")], ["Simplified Tax Invoices", L("مبسطة B2C", "Simplified B2C")], ["Standard Tax Invoices", L("ضريبية B2B", "Standard B2B")]], data.type_of_business_transactions, function(v){ data.type_of_business_transactions = v })));
    card.appendChild(h("div", {class: "sb"}, g, h("div", {style: "margin-top:16px"}, h("button", {class: "btn p", type: "button", text: AMY.t("save"), onclick: function(ev){
      busy(ev.currentTarget, call("zatca_save", {data: data})).then(function(r){ AMY.toast(AMY.t("saved"), "ok"); paint(r) }).catch(AMY.fail);
    }}))));
    box.appendChild(card);
  }
  function stepCard(titleTxt, desc, ok, build){
    var c = h("div", {class: "card sec"});
    c.appendChild(h("div", {class: "sl"}, h("h3", {text: titleTxt}), h("p", {class: "mut", text: desc}), ok ? h("span", {class: "pill ok", text: L("تم", "Done")}) : null));
    var b = h("div", {class: "sb"}); build(b); c.appendChild(b); box.appendChild(c);
  }
  function runBtn(label, step, extra, cls){
    return h("button", {class: "btn " + (cls || "p"), type: "button", text: label, onclick: function(ev){
      var args = Object.assign({step: step}, extra ? extra() : {});
      busy(ev.currentTarget, call("zatca_step", args)).then(function(r){ AMY.toast(L("تم تنفيذ الخطوة", "Step completed"), "ok"); paint(r) }).catch(AMY.fail);
    }});
  }
  function onboarding(s){
    var ok = {}; s.steps.forEach(function(x){ ok[x.key] = x.ok });
    box.appendChild(h("div", {class: "hd", style: "margin-top:36px"}, h("h2", {text: L("خطوات الربط", "Connection steps")})));
    stepCard(STEPS.cli[0], STEPS.cli[1], ok.cli, function(b){
      b.appendChild(h("div", {style: "display:flex;gap:10px;flex-wrap:wrap"}, runBtn(L("تثبيت الأدوات", "Install tools"), "cli_setup"), runBtn(L("فحص الأدوات", "Check tools"), "cli_check", null, "g")));
      b.appendChild(h("div", {class: "mut", style: "margin-top:8px;font-size:var(--t-sm)", text: L("قد يستغرق التثبيت دقيقة أو أكثر.", "Installation can take a minute or more.")}));
    });
    var otp1 = ""; stepCard(STEPS.onboard[0], STEPS.onboard[1], ok.onboard, function(b){
      b.appendChild(fld(L("رمز OTP", "OTP"), txt("text", "", function(v){ otp1 = v }, true), L("يُولَّد من بوابة فاتورة (fatoora.zatca.gov.sa) ويصلح لفترة قصيرة.", "Generated on the Fatoora portal and valid for a short time.")));
      b.appendChild(h("div", {style: "margin-top:14px"}, runBtn(L("تسجيل الجهاز", "Register"), "onboard", function(){ return {otp: otp1} })));
    });
    var cc = {simplified_customer: "", standard_customer: "", item: "", tax_category: ""};
    stepCard(L("فحوصات الامتثال", "Compliance checks"), L("ينشئ النظام فواتير تجريبية ويرسلها للتحقق.", "The system creates sample invoices and sends them for validation."), ok.production || false, function(b){
      var g = h("div", {class: "fgrid"});
      g.appendChild(fld(L("عميل (مبسطة)", "Customer (simplified)"), AMY.link({doctype: "Customer", onChange: function(v){ cc.simplified_customer = v }})));
      g.appendChild(fld(L("عميل (ضريبية)", "Customer (standard)"), AMY.link({doctype: "Customer", onChange: function(v){ cc.standard_customer = v }})));
      g.appendChild(fld(L("منتج للتجربة", "Sample item"), AMY.link({doctype: "Item", onChange: function(v){ cc.item = v }})));
      g.appendChild(fld(L("فئة الضريبة", "Tax category"), AMY.link({doctype: "Tax Category", onChange: function(v){ cc.tax_category = v }})));
      b.appendChild(g); b.appendChild(h("div", {style: "margin-top:16px"}, runBtn(L("تشغيل الفحوصات", "Run checks"), "compliance", function(){ return cc })));
    });
    var otp2 = ""; stepCard(STEPS.production[0], STEPS.production[1], ok.production, function(b){
      b.appendChild(fld(L("رمز OTP", "OTP"), txt("text", "", function(v){ otp2 = v }, true)));
      b.appendChild(h("div", {style: "margin-top:14px"}, runBtn(L("الحصول على الشهادة", "Get certificate"), "production", function(){ return {otp: otp2} })));
    });
    stepCard(STEPS.enabled[0], STEPS.enabled[1], ok.enabled, function(b){
      var on = !!Number(s.settings.enable_zatca_integration);
      b.appendChild(h("button", {class: "btn " + (on ? "g" : "p"), type: "button", text: on ? L("إيقاف الإرسال", "Switch off") : L("تفعيل الإرسال", "Switch on"), onclick: function(ev){
        busy(ev.currentTarget, call("zatca_save", {data: {enable_zatca_integration: on ? 0 : 1}})).then(function(r){ AMY.toast(AMY.t("saved"), "ok"); paint(r) }).catch(AMY.fail);
      }}));
    });
  }
  function recent(s){
    var keys = Object.keys(s.counts || {}); if(!keys.length) return;
    box.appendChild(h("div", {class: "hd", style: "margin-top:36px"}, h("h2", {text: L("آخر 30 يومًا", "Last 30 days")})));
    var row = h("div", {style: "display:flex;gap:28px;flex-wrap:wrap"});
    keys.forEach(function(k){ var m = ST[k] || ["", k]; row.appendChild(h("a", {class: "lnkc", href: "#/zatca", style: "min-width:150px"}, h("span", {class: "pill " + m[0], text: m[1]}), h("b", {class: "num", style: "display:block;font-size:24px;margin-top:6px", text: String(s.counts[k])}))) });
    box.appendChild(row);
  }
  box.appendChild(h("div", {class: "sk", style: "width:60%"}));
  call("zatca_status", {}).then(paint).catch(function(e){ AMY.clear(box); AMY.fail(e) });
};

/* ================= navigation ================= */
AMY.cfg.nav.forEach(function(g){
  if(g.id !== "acc") return;
  g.k.forEach(function(k){ if(k.to === "/zatca"){ k.to = "/e-invoicing"; k.dt = null; k.admin = 1; k.app = "zatca" } });
  var i = g.k.findIndex(function(k){ return k.to === "/journal-entries" });
  g.k.splice(i < 0 ? 0 : i, 0, {to: "/expenses", l: ["المصروفات", "Expenses"], dt: "Journal Entry"});
});
AMY.cfg.settings.forEach(function(s){ if(s.href === "/app/zatca-business-settings"){ delete s.href; s.to = "/e-invoicing" } });
})();
