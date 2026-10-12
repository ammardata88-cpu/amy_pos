/* AMY console - printable documents (A4 invoice and 80mm receipt). Stand-alone: no ERPNext print engine. */
(function(){
"use strict";
var q = new URLSearchParams(location.search);
var dt = q.get("dt") || "", name = q.get("name") || "";
var fmt = q.get("fmt") === "receipt" ? "receipt" : "a4";
var lang = q.get("lang") || (function(){ try{ return localStorage.getItem("amy_lang") }catch(e){ return null } })() || "ar";
if(lang !== "en") lang = "ar";
var ar = lang === "ar";
document.documentElement.lang = lang; document.documentElement.dir = ar ? "rtl" : "ltr";

function h(tag, props){
  var e = document.createElement(tag);
  if(props) for(var k in props){
    var v = props[k]; if(v == null || v === false) continue;
    if(k === "text") e.textContent = v; else if(k === "class") e.className = v;
    else if(k.slice(0,2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for(var i = 2; i < arguments.length; i++){
    var c = arguments[i]; if(c == null || c === false) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}
function n2(v){ return Number(v || 0).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}) }
function qty(v){ return Number(v || 0).toLocaleString("en-US", {maximumFractionDigits: 3}) }
function dte(s){ return s ? String(s).slice(0, 10) : "" }
function L(a, e){ return ar ? a : e }

var TITLES = {
  "Sales Invoice": ["فاتورة ضريبية", "Tax invoice"],
  "Purchase Invoice": ["فاتورة مشتريات", "Purchase invoice"],
  "Quotation": ["عرض سعر", "Quotation"],
  "Sales Order": ["أمر بيع", "Sales order"],
  "Purchase Order": ["أمر شراء", "Purchase order"],
  "Payment Entry": ["سند", "Payment voucher"]
};
function title(d){
  var z = d.zatca;
  if(d.doctype === "Sales Invoice"){
    if(d.is_return) return [L("إشعار دائن", "Credit note"), L("إشعار دائن لفاتورة ضريبية", "Credit note for tax invoice")];
    if(z) return z.simplified ? [L("فاتورة ضريبية مبسطة", "Simplified tax invoice"), "Simplified Tax Invoice"] : [L("فاتورة ضريبية", "Tax invoice"), "Tax Invoice"];
  }
  if(d.doctype === "Payment Entry") return [d.payment_type === "Receive" ? L("سند قبض", "Receipt voucher") : L("سند دفع", "Payment voucher"), "Payment Entry"];
  if(d.doctype === "Purchase Invoice" && d.is_return) return [L("إشعار مدين", "Debit note"), ""];
  var t = TITLES[d.doctype] || [d.doctype, d.doctype];
  return [L(t[0], t[1]), ar ? t[1] : ""];
}

var sheet = document.getElementById("sheet"), bar = document.getElementById("bar");
function fail(msg){ sheet.remove(); document.body.appendChild(h("div", {class: "err", text: msg})) }
function toolbar(){
  function mode(f, a, e){ return h("button", {type: "button", class: fmt === f ? "on" : "", text: L(a, e), onclick: function(){ q.set("fmt", f); location.search = q.toString() }}) }
  bar.appendChild(mode("a4", "A4", "A4"));
  if(dt === "Sales Invoice" || dt === "Payment Entry") bar.appendChild(mode("receipt", "إيصال 80mm", "Receipt 80mm"));
  bar.appendChild(h("button", {type: "button", text: ar ? "EN" : "عربي", onclick: function(){ q.set("lang", ar ? "en" : "ar"); location.search = q.toString() }}));
  bar.appendChild(h("span", {class: "sp"}));
  bar.appendChild(h("button", {type: "button", text: L("رجوع", "Back"), onclick: function(){ if(history.length > 1) history.back(); else window.close() }}));
  bar.appendChild(h("button", {type: "button", class: "p", text: L("طباعة", "Print"), onclick: function(){ window.print() }}));
}

function render(r){
  var d = r.doc, co = r.company, rc = fmt === "receipt", t = title(d);
  var party = d.customer_name || d.supplier_name || d.party_name || d.party || "";
  var cur = d.currency || co.currency || "";
  sheet.className = "sheet" + (rc ? " rc" : "");
  document.title = t[0] + " " + d.name;

  var head = h("div", {class: "hd"},
    h("div", {class: "co"}, co.logo ? h("img", {src: co.logo, alt: ""}) : null,
      h("div", null, h("b", {text: co.name}),
        co.address ? h("span", {text: co.address}) : null,
        co.phone ? h("span", {class: "num", text: co.phone}) : null,
        co.tax_id ? h("span", null, L("الرقم الضريبي: ", "VAT no: "), h("b", {class: "num", text: co.tax_id})) : null)),
    h("div", {class: "ti"}, h("h1", {text: t[0]}), t[1] ? h("small", {text: t[1]}) : null,
      d.docstatus === 0 ? h("small", {text: L("مسودة — غير معتمدة", "Draft — not submitted")}) : null,
      d.docstatus === 2 ? h("small", {text: L("ملغاة", "Cancelled")}) : null));
  sheet.appendChild(head);

  var rows = [[L("رقم المستند", "Number"), d.name], [L("التاريخ", "Date"), dte(d.posting_date || d.transaction_date)]];
  if(d.posting_time && rc) rows.push([L("الوقت", "Time"), String(d.posting_time).slice(0, 5)]);
  if(party) rows.push([d.doctype === "Purchase Invoice" || d.doctype === "Purchase Order" ? L("المورد", "Supplier") : L("العميل", "Customer"), party]);
  if(d.tax_id) rows.push([L("الرقم الضريبي للطرف", "Party VAT no"), d.tax_id]);
  if(d.due_date && !rc) rows.push([L("الاستحقاق", "Due date"), dte(d.due_date)]);
  if(d.valid_till) rows.push([L("صالح حتى", "Valid until"), dte(d.valid_till)]);
  if(d.delivery_date || d.schedule_date) rows.push([L("التسليم", "Delivery"), dte(d.delivery_date || d.schedule_date)]);
  if(d.return_against) rows.push([L("مرتجع على", "Return of"), d.return_against]);
  if(d.mode_of_payment) rows.push([L("طريقة الدفع", "Method"), d.mode_of_payment]);
  if(d.reference_no) rows.push([L("المرجع", "Reference"), d.reference_no]);
  if(d.po_no) rows.push([L("أمر الشراء", "PO no"), d.po_no]);
  var meta = h("div", {class: "meta"});
  rows.forEach(function(x){ meta.appendChild(h("div", null, h("span", {text: x[0]}), h("b", {text: x[1]}))) });
  sheet.appendChild(meta);

  if(d.items && d.items.length){
    var tb = h("table"), hr = h("tr");
    (rc ? [L("الصنف", "Item"), L("كمية", "Qty"), L("المبلغ", "Amt")] : ["#", L("الصنف", "Item"), L("الكمية", "Qty"), L("السعر", "Price"), L("الخصم", "Disc."), L("الإجمالي", "Amount")])
      .forEach(function(x, i, a){ hr.appendChild(h("th", {class: i >= (rc ? 1 : 2) ? "e" : "", text: x})) });
    tb.appendChild(h("thead", null, hr));
    var bd = h("tbody");
    d.items.forEach(function(i, k){
      var nm = h("td", null, i.item_name || i.item_code, (!rc && i.description && i.description !== i.item_name && i.description.length < 160) ? h("small", {text: i.description.replace(/<[^>]*>/g, "")}) : null);
      if(rc) bd.appendChild(h("tr", null, nm, h("td", {class: "e num", text: qty(i.qty) + " × " + n2(i.rate)}), h("td", {class: "e num", text: n2(i.amount)})));
      else bd.appendChild(h("tr", null, h("td", {class: "num", text: String(k + 1)}), nm,
        h("td", {class: "e num", text: qty(i.qty) + (i.uom ? " " + i.uom : "")}), h("td", {class: "e num", text: n2(i.rate)}),
        h("td", {class: "e num", text: i.discount_percentage ? qty(i.discount_percentage) + "%" : "—"}), h("td", {class: "e num", text: n2(i.amount)})));
    });
    tb.appendChild(bd); sheet.appendChild(tb);
  }
  if(d.references && d.references.length){
    var rt = h("table"); rt.appendChild(h("thead", null, h("tr", null, h("th", {text: L("المستند", "Document")}), h("th", {class: "e", text: L("المسدد", "Allocated")}))));
    var rb = h("tbody"); d.references.forEach(function(x){ rb.appendChild(h("tr", null, h("td", {text: x.reference_name}), h("td", {class: "e num", text: n2(x.allocated_amount)}))) });
    rt.appendChild(rb); sheet.appendChild(rt);
  }

  var tot = h("div", {class: "tot"});
  function line(a, v, g){ tot.appendChild(h("div", {class: g ? "g" : ""}, h("span", {text: a}), h("b", {class: "num", text: n2(v) + (g ? " " + cur : "")}))) }
  if(d.doctype === "Payment Entry"){ line(L("المبلغ", "Amount"), d.paid_amount, true) }
  else {
    line(L("المجموع قبل الضريبة", "Subtotal"), d.net_total != null ? d.net_total : d.total);
    if(d.discount_amount) line(L("الخصم", "Discount"), d.discount_amount);
    (d.taxes || []).forEach(function(x){ if(x.tax_amount) line((x.description || L("ضريبة", "Tax")) + (x.rate ? " " + qty(x.rate) + "%" : ""), x.tax_amount) });
    line(L("الإجمالي", "Total"), d.rounded_total || d.grand_total, true);
    (d.payments || []).forEach(function(p){ line(p.mode_of_payment, p.amount) });
    if(d.change_amount) line(L("الباقي", "Change"), d.change_amount);
    if(d.outstanding_amount) line(L("المتبقي", "Outstanding"), d.outstanding_amount);
  }
  var bot = h("div", {class: "bot"});
  var z = d.zatca;
  if(z && z.qr) bot.appendChild(h("div", {class: "qr"}, h("img", {src: z.qr, alt: "QR"}), h("span", {text: L("رمز الفوترة الإلكترونية", "E-invoice QR")})));
  bot.appendChild(tot); sheet.appendChild(bot);
  if(d.in_words && !rc) sheet.appendChild(h("div", {class: "words", text: d.in_words}));
  if(d.remarks && !rc) sheet.appendChild(h("div", {class: "note", text: String(d.remarks).replace(/<[^>]*>/g, "")}));
  sheet.appendChild(h("div", {class: "ft", text: L("شكرًا لتعاملكم معنا", "Thank you for your business")}));
}

if(!dt || !name){ fail(L("مستند غير محدد", "No document selected")) }
else {
  toolbar();
  fetch("/api/method/amy_pos.ops.print_data", {
    method: "POST", credentials: "same-origin",
    headers: {"Content-Type": "application/json", "Accept": "application/json", "X-Frappe-CSRF-Token": window.AMY_BOOT.csrf},
    body: JSON.stringify({doctype: dt, name: name})
  }).then(function(r){
    if(r.status === 401) { location.href = "/amy-login?next=" + encodeURIComponent(location.pathname + location.search); return null }
    return r.json().then(function(j){ if(!r.ok) throw new Error(L("لا يمكن عرض هذا المستند", "This document cannot be shown")); return j.message });
  }).then(function(m){
    if(!m) return;
    render(m);
    if(q.get("print") === "1") setTimeout(function(){ window.print() }, 450);
  }).catch(function(e){ fail(e.message) });
}
})();
