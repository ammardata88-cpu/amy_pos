/* AMY till - one-screen point of sale. Talks to amy_pos.pos only; invoices are normal Sales Invoices. */
(function(){
"use strict";
var AMY = window.AMY, h = AMY.h, $ = AMY.$, num = AMY.num;
var ar = AMY.lang === "ar";
function L(a, e){ return ar ? a : e }
function call(fn, args){ return AMY.call("amy_pos.pos." + fn, args || {}) }
function rnd(v){ return Math.round((Number(v) || 0) * 100) / 100 }

var S = {boot: null, cart: [], customer: null, disc: {mode: "pct", value: 0}, tot: null, group: "", q: "", items: [], more: false, start: 0, seq: 0};
var HOLD_KEY = "amy_pos_hold";
function held(){ try{ return JSON.parse(localStorage.getItem(HOLD_KEY) || "[]") }catch(e){ return [] } }
function setHeld(a){ try{ localStorage.setItem(HOLD_KEY, JSON.stringify(a.slice(0, 20))) }catch(e){} }

/* ---------- totals ---------- */
function est(){
  var gross = 0;
  S.cart.forEach(function(l){ gross += l.qty * l.price * (1 - (l.discount || 0) / 100) });
  var d = S.disc.mode === "pct" ? gross * Math.min(Number(S.disc.value) || 0, 100) / 100 : Math.min(Number(S.disc.value) || 0, gross);
  var net = gross - d, vat = net * (S.boot.vat_rate || 0) / 100;
  return {net: rnd(net), vat: rnd(vat), total: rnd(net + vat), discount: rnd(d), est: true};
}
function T(){ return S.tot && !S.tot.stale ? S.tot : est() }
function payload(){
  var d = {customer: S.customer && S.customer.name, items: S.cart.map(function(l){ return {item_code: l.code, qty: l.qty, price: l.price, discount: l.discount || 0} })};
  if(Number(S.disc.value) > 0){ if(S.disc.mode === "pct") d.discount_percent = Number(S.disc.value); else d.discount_amount = Number(S.disc.value) }
  return d;
}
var timer;
function refreshTotals(){
  if(S.tot) S.tot.stale = true;
  clearTimeout(timer);
  if(!S.cart.length){ S.tot = null; paintCart(); return }
  var my = ++S.seq;
  timer = setTimeout(function(){
    call("totals", {data: payload(), profile: S.boot.profile}).then(function(t){ if(my === S.seq){ S.tot = t; paintCart() } }).catch(function(){ if(my === S.seq){ S.tot = null; paintCart() } });
  }, 280);
  paintCart();
}

/* ---------- cart ---------- */
function add(it){
  var f = S.cart.filter(function(l){ return l.code === it.code })[0];
  if(f) f.qty += 1; else S.cart.push({code: it.code, name: it.name, price: it.price, qty: 1, discount: 0, uom: it.uom, stock: it.stock});
  if(S.cart.length === 1 && !f) S.cart[0].price = it.price;
  refreshTotals();
  if(!it.price) editLine(S.cart.filter(function(l){ return l.code === it.code })[0]);
}
function paintCart(){
  var box = $("lines"); if(!box) return; AMY.clear(box);
  if(!S.cart.length){
    box.appendChild(h("div", {class: "empty-cart"}, h("div", null, AMY.icon("cart", ""), h("div", {text: L("السلة فارغة. اضغط على صنف أو امسح الباركود.", "The cart is empty. Tap an item or scan a barcode."), style: "margin-top:8px"}))));
  }
  S.cart.forEach(function(l){
    var tot = rnd(l.qty * l.price * (1 - (l.discount || 0) / 100));
    box.appendChild(h("div", {class: "line"},
      h("div", {class: "pt", onclick: function(){ editLine(l) }, title: L("تعديل", "Edit")}, h("b", {text: l.name}),
        h("span", {text: num(l.price) + (l.uom ? " / " + l.uom : "")}), l.discount ? h("span", {class: "dc", text: "  -" + l.discount + "%"}) : null),
      h("div", {class: "step"}, h("button", {type: "button", "aria-label": "-", onclick: function(){ l.qty = rnd(l.qty - 1); if(l.qty <= 0) S.cart.splice(S.cart.indexOf(l), 1); refreshTotals() }, text: "−"}),
        h("b", {text: num(l.qty)}), h("button", {type: "button", "aria-label": "+", onclick: function(){ l.qty = rnd(l.qty + 1); refreshTotals() }, text: "+"})),
      h("div", {class: "amt", text: num(tot)})));
  });
  var t = T(), cur = S.boot.currency;
  var sm = $("sum"); AMY.clear(sm);
  if(S.cart.length){
    if(t.discount > 0) sm.appendChild(h("div", {class: "srow"}, h("span", {text: L("الخصم", "Discount")}), h("span", {text: "-" + num(t.discount)})));
    if(S.boot.vat_rate) sm.appendChild(h("div", {class: "srow"}, h("span", {text: L("قبل الضريبة", "Before VAT")}), h("span", {text: num(t.net)})));
    if(S.boot.vat_rate) sm.appendChild(h("div", {class: "srow"}, h("span", {text: L("الضريبة ", "VAT ") + S.boot.vat_rate + "%"}), h("span", {text: num(t.vat)})));
    sm.appendChild(h("div", {class: "srow g"}, h("span", {text: L("الإجمالي", "Total")}), h("span", {text: num(t.total) + " " + cur})));
  }
  var n = S.cart.reduce(function(a, l){ return a + l.qty }, 0);
  $("payTxt").textContent = S.cart.length ? L("دفع ", "Pay ") + num(t.total) : L("دفع", "Pay");
  $("pay").disabled = !S.cart.length; $("mpay").disabled = !S.cart.length;
  $("mtot").textContent = num(t.total) + " " + cur; $("mcnt").textContent = num(n);
  $("clr").disabled = !S.cart.length; $("hold").disabled = !S.cart.length;
}
function editLine(l){
  if(!l) return;
  AMY.drawer(l.name, function(dw){
    function fld(label, el){ return h("div", {class: "field", style: "margin-bottom:12px"}, h("label", {text: label}), el) }
    var q = h("input", {class: "in", type: "number", step: "any", value: l.qty, inputmode: "decimal"});
    var p = h("input", {class: "in", type: "number", step: "any", value: l.price, inputmode: "decimal"});
    var d = h("input", {class: "in", type: "number", step: "any", value: l.discount || 0, inputmode: "decimal"});
    dw.body.appendChild(fld(L("الكمية", "Quantity"), q)); dw.body.appendChild(fld(L("السعر", "Price"), p)); dw.body.appendChild(fld(L("خصم %", "Discount %"), d));
    dw.footer.appendChild(h("div", {style: "display:contents"},
      h("button", {class: "btn d", type: "button", text: L("حذف السطر", "Remove"), onclick: function(){ S.cart.splice(S.cart.indexOf(l), 1); refreshTotals(); dw.close() }}),
      h("button", {class: "btn p", type: "button", text: AMY.t("save"), onclick: function(){
        var nq = Number(q.value); if(!(nq > 0)) return AMY.toast(L("الكمية غير صحيحة", "Invalid quantity"), "bad");
        l.qty = nq; l.price = Math.max(0, Number(p.value) || 0); l.discount = Math.min(100, Math.max(0, Number(d.value) || 0));
        refreshTotals(); dw.close();
      }})));
    setTimeout(function(){ q.focus(); q.select() }, 50);
  });
}

/* ---------- items ---------- */
function loadItems(append){
  if(!append){ S.start = 0 }
  var my = ++loadItems.n;
  return call("items", {profile: S.boot.profile, search: S.q, group: S.group, start: S.start}).then(function(r){
    if(my !== loadItems.n) return;
    S.items = append ? S.items.concat(r) : r; S.more = r.length >= 60; paintItems();
  }).catch(AMY.fail);
}
loadItems.n = 0;
function paintItems(){
  var g = $("grid"); AMY.clear(g);
  if(!S.items.length) g.appendChild(h("div", {class: "pempty", text: S.q ? L("لا توجد نتائج.", "No results.") : L("لا توجد أصناف للبيع بعد. أضف أصنافك من الكونسول.", "No items for sale yet. Add items from the console.")}));
  S.items.forEach(function(it){
    var st = it.stock == null ? null : (it.stock <= 0 ? ["out", L("نفد", "Out")] : (it.stock <= 5 ? ["low", L("متبقي ", "Left ") + num(it.stock)] : ["", num(it.stock)]));
    g.appendChild(h("button", {class: "pcard", type: "button", onclick: function(){ add(it); if(!/Mobi/.test(navigator.userAgent)) $("q").focus() }},
      h("div", {class: "pim"}, it.image ? h("img", {src: it.image, alt: "", loading: "lazy"}) : (it.name || "?").trim().charAt(0).toUpperCase()),
      h("div", {class: "bd"}, h("div", {class: "pnm", text: it.name}), h("div", {class: "pr", text: it.price ? num(it.price) : "—"}), st ? h("div", {class: "pst " + st[0], text: st[1]}) : null)));
  });
  if(S.more) g.appendChild(h("button", {class: "btn g more", type: "button", text: L("عرض المزيد", "Load more"), onclick: function(){ S.start += 60; loadItems(true) }}));
}
function paintGroups(){
  var c = $("chips"); AMY.clear(c);
  [["", L("الكل", "All")]].concat((S.boot.groups || []).map(function(g){ return [g, g] })).forEach(function(g){
    c.appendChild(h("button", {class: "pchip" + (S.group === g[0] ? " on" : ""), type: "button", text: g[1], onclick: function(){ S.group = g[0]; paintGroups(); loadItems() }}));
  });
}

/* ---------- customer ---------- */
function pickCustomer(){
  AMY.drawer(L("العميل", "Customer"), function(dw){
    var inp = h("input", {class: "in", type: "search", placeholder: L("ابحث بالاسم أو الجوال", "Search by name or mobile"), autocomplete: "off"}), list = h("div", {class: "lst"}), tm;
    function show(rows){
      AMY.clear(list);
      list.appendChild(h("button", {class: "btn g", type: "button", style: "width:100%;margin:12px 0", text: L("عميل نقدي (بدون اسم)", "Walk-in customer"), onclick: function(){ S.customer = null; paintCust(); refreshTotals(); dw.close() }}));
      rows.forEach(function(c){
        list.appendChild(h("div", {class: "it"}, h("div", null, h("b", {text: c.customer_name || c.name}), c.mobile_no ? h("small", {text: c.mobile_no}) : null),
          h("button", {class: "btn s p", type: "button", text: L("اختيار", "Select"), onclick: function(){ S.customer = {name: c.name, label: c.customer_name || c.name}; paintCust(); refreshTotals(); dw.close() }})));
      });
    }
    function find(){ call("customers", {q: inp.value}).then(show).catch(AMY.fail) }
    inp.addEventListener("input", function(){ clearTimeout(tm); tm = setTimeout(find, 250) });
    dw.body.appendChild(inp); dw.body.appendChild(list); find();
    var nm = h("input", {class: "in", placeholder: L("اسم العميل الجديد", "New customer name")}), mb = h("input", {class: "in", placeholder: L("الجوال (اختياري)", "Mobile (optional)"), inputmode: "tel", dir: "ltr"});
    dw.footer.appendChild(h("div", {style: "display:flex;gap:8px;width:100%;flex-wrap:wrap"}, h("div", {style: "flex:1;min-width:140px"}, nm), h("div", {style: "flex:1;min-width:120px"}, mb),
      h("button", {class: "btn p", type: "button", text: L("إضافة", "Add"), onclick: function(){
        if(!nm.value.trim()) return nm.focus();
        call("quick_customer", {name: nm.value, mobile: mb.value}).then(function(c){ S.customer = {name: c.name, label: c.customer_name}; paintCust(); refreshTotals(); dw.close() }).catch(AMY.fail);
      }})));
  });
}
function paintCust(){ $("cust").textContent = S.customer ? S.customer.label : L("عميل نقدي", "Walk-in customer") }

/* ---------- hold ---------- */
function hold(){
  if(!S.cart.length) return;
  var a = held(); a.unshift({id: Date.now(), time: new Date().toISOString(), cart: S.cart, customer: S.customer, disc: S.disc}); setHeld(a);
  reset(); AMY.toast(L("تم تعليق الفاتورة", "Sale put on hold"), "ok"); paintHold();
}
function paintHold(){ var n = held().length; var b = $("heldN"); b.textContent = n; b.style.display = n ? "" : "none" }
function showHeld(){
  AMY.drawer(L("فواتير معلّقة", "Held sales"), function(dw){
    var box = h("div", {class: "lst"}); dw.body.appendChild(box);
    function draw(){
      AMY.clear(box); var a = held();
      if(!a.length) box.appendChild(h("div", {class: "pempty", text: L("لا توجد فواتير معلّقة.", "Nothing on hold.")}));
      a.forEach(function(x){
        var total = rnd(x.cart.reduce(function(s, l){ return s + l.qty * l.price * (1 - (l.discount || 0) / 100) }, 0));
        box.appendChild(h("div", {class: "it"}, h("div", null, h("b", {text: x.cart.length + L(" صنف · ", " items · ") + num(total)}), h("small", {text: new Date(x.time).toLocaleTimeString(AMY.locale(), {hour: "2-digit", minute: "2-digit"}) + (x.customer ? " · " + x.customer.label : "")})),
          h("div", {style: "display:flex;gap:6px"},
            h("button", {class: "btn s d", type: "button", text: L("حذف", "Delete"), onclick: function(){ setHeld(held().filter(function(y){ return y.id !== x.id })); draw(); paintHold() }}),
            h("button", {class: "btn s p", type: "button", text: L("استكمال", "Resume"), onclick: function(){
              if(S.cart.length) hold();
              setHeld(held().filter(function(y){ return y.id !== x.id })); S.cart = x.cart; S.customer = x.customer; S.disc = x.disc || {mode: "pct", value: 0};
              paintCust(); paintDisc(); refreshTotals(); paintHold(); dw.close();
            }}))));
      });
    }
    draw();
  });
}
function reset(){ S.cart = []; S.customer = null; S.disc = {mode: "pct", value: 0}; S.tot = null; paintCust(); paintDisc(); paintCart() }

/* ---------- discount ---------- */
function paintDisc(){
  var m = $("dmode"), v = $("dval"); if(!m) return;
  m.textContent = S.disc.mode === "pct" ? "%" : S.boot.currency; v.value = Number(S.disc.value) ? S.disc.value : "";
}

/* ---------- pay ---------- */
function pay(){
  if(!S.cart.length) return;
  var total = T().total, modes = S.boot.payments, amounts = {};
  if(!modes.length) return AMY.toast(L("لا توجد طرق دفع مفعّلة. افتح الإعدادات > إعداد سريع.", "No payment methods are set up. Open Settings > Quick setup."), "bad");
  var first = modes.filter(function(m){ return m.default })[0] || modes[0];
  modes.forEach(function(m){ amounts[m.mode] = 0 }); amounts[first.mode] = total;
  AMY.drawer(L("الدفع", "Payment"), function(dw){
    var sum = h("div", {class: "paysum"}), rows = h("div"), quick = h("div", {class: "quick"}), inputs = {}, go;
    function paid(){ return rnd(modes.reduce(function(s, m){ return s + (Number(amounts[m.mode]) || 0) }, 0)) }
    function cashAmt(){ return modes.reduce(function(s, m){ return s + (m.type === "Cash" ? (Number(amounts[m.mode]) || 0) : 0) }, 0) }
    function calc(){
      var p = paid(), diff = rnd(p - total), chg = diff > 0 ? diff : 0, bad = diff < 0 || (chg > 0 && chg > cashAmt());
      AMY.clear(sum);
      sum.appendChild(h("div", null, h("small", {text: L("المطلوب", "Due")}), h("div", {class: "pbig", text: num(total)})));
      sum.appendChild(h("div", {class: "rest " + (bad ? "bad" : "ok")}, h("small", {text: diff < 0 ? L("المتبقي", "Remaining") : L("الباقي للعميل", "Change")}), h("b", {text: num(Math.abs(diff))})));
      go.disabled = bad || p <= 0;
    }
    modes.forEach(function(m){
      var i = h("input", {class: "in", type: "number", step: "any", inputmode: "decimal", value: amounts[m.mode] || "", dir: "ltr"});
      i.addEventListener("input", function(){ amounts[m.mode] = Number(i.value) || 0; calc() });
      i.addEventListener("focus", function(){ i.select() });
      inputs[m.mode] = i;
      rows.appendChild(h("div", {class: "mode"}, h("label", {text: m.mode}),
        h("div", {style: "display:flex;gap:6px"}, i, h("button", {class: "btn g", type: "button", title: L("الباقي", "Rest"), text: "=", onclick: function(){
          amounts[m.mode] = 0; var rest = rnd(total - paid()); amounts[m.mode] = rest > 0 ? rest : 0; i.value = amounts[m.mode] || ""; calc();
        }}))));
    });
    var cashMode = modes.filter(function(m){ return m.type === "Cash" })[0];
    if(cashMode){
      var opts = [total]; [5, 10, 50, 100, 200, 500].forEach(function(s){ var v = Math.ceil(total / s) * s; if(v > total && opts.indexOf(v) < 0) opts.push(v) });
      opts.slice(0, 5).forEach(function(v){
        quick.appendChild(h("button", {class: "btn g", type: "button", text: v === total ? L("المبلغ بالضبط", "Exact") : num(v), onclick: function(){
          modes.forEach(function(m){ amounts[m.mode] = 0; inputs[m.mode].value = "" }); amounts[cashMode.mode] = v; inputs[cashMode.mode].value = v; calc();
        }}));
      });
    }
    go = h("button", {class: "btn p", type: "button", style: "height:52px;width:100%;font-size:var(--t-md)", text: L("تأكيد الدفع", "Confirm payment"), onclick: function(){
      go.disabled = true;
      var pays = modes.map(function(m){ return {mode: m.mode, amount: Number(amounts[m.mode]) || 0} }).filter(function(x){ return x.amount > 0 });
      call("checkout", {data: payload(), payments: pays, profile: S.boot.profile}).then(function(r){ done(dw, r) }).catch(function(e){ go.disabled = false; AMY.fail(e) });
    }});
    dw.body.appendChild(sum); if(quick.childNodes.length) dw.body.appendChild(quick); dw.body.appendChild(rows);
    dw.footer.appendChild(go); calc();
    setTimeout(function(){ var i = inputs[first.mode]; if(i){ i.focus(); i.select() } }, 60);
  });
}
function done(dw, r){
  AMY.clear(dw.body); AMY.clear(dw.footer);
  dw.body.appendChild(h("div", {class: "done"}, h("div", {class: "tick"}, AMY.icon("check")), h("h3", {text: L("تمت العملية", "Sale completed"), style: "margin:0 0 4px;font-size:var(--t-lg)"}),
    h("div", {class: "mut", text: r.name}), h("div", {class: "pbig", style: "margin-top:12px", text: num(r.total)}),
    r.change > 0 ? h("div", null, h("div", {class: "mut", style: "margin-top:12px", text: L("الباقي للعميل", "Change due")}), h("div", {class: "chg", text: num(r.change)})) : null));
  var url = "/amy-print?dt=Sales%20Invoice&name=" + encodeURIComponent(r.name) + "&lang=" + AMY.lang;
  dw.footer.appendChild(h("div", {style: "display:flex;gap:8px;width:100%"},
    h("a", {class: "btn g", style: "flex:1;height:48px", href: url + "&fmt=receipt", target: "_blank", rel: "noopener"}, AMY.icon("print"), L("إيصال", "Receipt")),
    h("a", {class: "btn g", style: "flex:1;height:48px", href: url, target: "_blank", rel: "noopener"}, L("فاتورة A4", "A4 invoice")),
    h("button", {class: "btn p", type: "button", style: "flex:1.4;height:48px", text: L("بيع جديد", "New sale"), onclick: function(){ dw.close(); newSale() }})));
  reset(); loadItems();
}
function newSale(){ document.body.classList.remove("cartopen"); if(!/Mobi/.test(navigator.userAgent)) $("q").focus() }

/* ---------- recent / today ---------- */
function showRecent(){
  AMY.drawer(L("مبيعات اليوم", "Today's sales"), function(dw){
    dw.body.appendChild(h("div", {class: "sk", style: "width:60%"}));
    Promise.all([call("today"), call("recent")]).then(function(x){
      AMY.clear(dw.body); var t = x[0];
      dw.body.appendChild(h("div", {class: "paysum"}, h("div", null, h("small", {text: L("عدد العمليات", "Sales")}), h("b", {style: "font-size:var(--t-num)", text: num(t.count)})),
        h("div", {class: "rest"}, h("small", {text: L("الإجمالي", "Total")}), h("b", {text: num(t.total)}))));
      t.methods.forEach(function(m){ dw.body.appendChild(h("div", {class: "sumrow"}, h("span", {text: m.mode}), h("b", {text: num(m.amount)}))) });
      var lst = h("div", {class: "lst", style: "margin-top:16px"}); dw.body.appendChild(lst);
      x[1].forEach(function(r){
        lst.appendChild(h("div", {class: "it"}, h("div", null, h("b", {text: r.name}), h("small", {text: (r.customer_name || "") + " · " + String(r.posting_time || "").slice(0, 5)})),
          h("div", {style: "display:flex;gap:6px;align-items:center"}, h("b", {text: num(r.rounded_total || r.grand_total)}),
            h("a", {class: "btn s g", href: "/amy-print?dt=Sales%20Invoice&name=" + encodeURIComponent(r.name) + "&fmt=receipt&lang=" + AMY.lang, target: "_blank", rel: "noopener", text: L("طباعة", "Print")}),
            h("a", {class: "btn s g", href: "/amy#/sales-invoices/" + encodeURIComponent(r.name), target: "_blank", rel: "noopener", text: L("فتح / مرتجع", "Open / return")}))));
      });
    }).catch(function(e){ dw.close(); AMY.fail(e) });
  });
}

/* ---------- shell ---------- */
function build(){
  var b = S.boot, root = AMY.clear($("till"));
  document.documentElement.lang = AMY.lang; document.documentElement.dir = ar ? "rtl" : "ltr";
  document.title = "AMY - " + L("الكاشير", "Till");
  var q = h("input", {class: "in", id: "q", type: "search", placeholder: L("ابحث أو امسح الباركود  (F2)", "Search or scan a barcode  (F2)"), autocomplete: "off", autofocus: true});
  var tm;
  q.addEventListener("input", function(){ clearTimeout(tm); tm = setTimeout(function(){ S.q = q.value.trim(); loadItems() }, 250) });
  q.addEventListener("keydown", function(e){
    if(e.key !== "Enter" || !q.value.trim()) return;
    e.preventDefault(); var code = q.value.trim();
    call("scan", {code: code, profile: b.profile}).then(function(it){
      if(it){ add(it); q.value = ""; S.q = ""; loadItems() }
      else if(S.items.length === 1){ add(S.items[0]); q.value = ""; S.q = ""; loadItems() }
      else AMY.toast(L("لم يتم العثور على الصنف", "Item not found"), "bad");
    }).catch(AMY.fail);
  });
  var heldN = h("span", {class: "badge", id: "heldN", style: "display:none"});
  root.appendChild(h("header", {class: "tbar"},
    h("div", {class: "brand"}, h("img", {src: b.logo || "/assets/amy_pos/images/amy-logo.png", alt: ""}), h("div", null, h("span", {text: "AMY"}), h("small", {text: b.company}))),
    h("div", {class: "tsearch"}, AMY.icon("search"), q), h("span", {class: "psp"}),
    h("button", {class: "btn g", type: "button", onclick: showHeld, title: "F8"}, AMY.icon("clock"), h("span", {class: "lbl", text: L("المعلّقة", "Held")}), heldN),
    h("button", {class: "btn g", type: "button", onclick: showRecent}, AMY.icon("list"), h("span", {class: "lbl", text: L("اليوم", "Today")})),
    h("button", {class: "btn g", type: "button", id: "lang", text: ar ? "EN" : "عربي", onclick: function(){ try{ localStorage.setItem("amy_lang", ar ? "en" : "ar") }catch(e){} location.reload() }}),
    h("a", {class: "btn g", href: "/amy"}, AMY.icon("grid"), h("span", {class: "lbl", text: L("الكونسول", "Console")}))));
  var left = h("section", {class: "tleft"}, h("div", {class: "pchips", id: "chips"}), h("div", {class: "grid", id: "grid"}));
  var disc = h("div", {class: "dscr"},
    h("span", {class: "mut", style: "font-size:var(--t-sm)", text: L("خصم", "Discount")}),
    h("input", {class: "in", id: "dval", type: "number", step: "any", min: "0", inputmode: "decimal", dir: "ltr", oninput: function(e){ S.disc.value = e.target.value; refreshTotals() }}),
    h("button", {class: "btn g s", id: "dmode", type: "button", onclick: function(){ S.disc.mode = S.disc.mode === "pct" ? "amt" : "pct"; paintDisc(); refreshTotals() }}));
  var cart = h("aside", {class: "tcart"},
    h("div", {class: "ctop"}, h("b", {text: L("السلة", "Cart")}), h("button", {class: "icobtn", type: "button", "aria-label": AMY.t("close"), onclick: function(){ document.body.classList.remove("cartopen") }}, AMY.icon("x"))),
    h("div", {class: "crow"}, h("button", {class: "btn g cust", type: "button", id: "cust", onclick: pickCustomer}), h("button", {class: "btn g", type: "button", id: "hold", title: "F8", text: L("تعليق", "Hold"), onclick: hold}),
      h("button", {class: "btn g", type: "button", id: "clr", text: L("مسح", "Clear"), onclick: function(){ AMY.confirm({title: L("مسح السلة؟", "Clear the cart?"), sub: "", ok: L("نعم، امسح", "Yes, clear")}).then(function(ok){ if(ok) reset() }) }})),
    h("div", {class: "lines", id: "lines"}),
    h("div", {class: "tsum"}, disc, h("div", {id: "sum", style: "display:flex;flex-direction:column;gap:6px"})),
    h("div", {class: "tact"}, h("button", {class: "btn p payb", type: "button", id: "pay", onclick: pay, style: "grid-column:1/-1"}, h("span", {id: "payTxt", class: "n"}))));
  root.appendChild(h("div", {class: "tmain"}, left, cart));
  root.appendChild(h("div", {class: "minibar"}, h("div", null, h("small", {class: "mut", text: L("الإجمالي", "Total")}), h("div", {id: "mtot", style: "font-weight:600;font-size:var(--t-md)"})),
    h("button", {class: "btn p", type: "button", id: "mpay", onclick: function(){ document.body.classList.add("cartopen") }}, AMY.icon("cart"), L("السلة ", "Cart "), h("span", {class: "badge", id: "mcnt", style: "background:#fff;color:var(--brand)"}))));
  paintGroups(); paintCust(); paintDisc(); paintCart(); paintHold();
  document.addEventListener("keydown", function(e){
    if(e.key === "F2"){ e.preventDefault(); $("q").focus(); $("q").select() }
    else if(e.key === "F9"){ e.preventDefault(); pay() }
    else if(e.key === "F8"){ e.preventDefault(); if(S.cart.length) hold(); else showHeld() }
  });
  window.addEventListener("beforeunload", function(e){ if(S.cart.length){ e.preventDefault(); e.returnValue = "" } });
  loadItems();
}

function setupScreen(msg){
  AMY.clear($("till")).appendChild(h("div", {class: "setup"}, h("div", {style: "max-width:420px"}, h("h2", {text: L("الكاشير يحتاج إعداداً بسيطاً", "The till needs a quick setup"), style: "margin:0 0 8px"}),
    h("p", {class: "mut", text: msg || L("لم نجد ملف نقطة بيع لحسابك. افتح الإعدادات > إعداد سريع وسيتم تجهيز كل شيء تلقائياً.", "We could not find a POS profile for your account. Open Settings > Quick setup and everything will be prepared automatically.")}),
    h("a", {class: "btn p", href: "/amy#/setup", text: L("إعداد سريع", "Quick setup")}))));
}

document.documentElement.lang = AMY.lang; document.documentElement.dir = ar ? "rtl" : "ltr";
AMY.clear($("till")).appendChild(h("div", {class: "setup"}, h("div", {class: "mut", text: L("جاري تجهيز الكاشير…", "Preparing the till…")})));
call("boot").then(function(b){
  if(!b || !b.ready) return setupScreen();
  S.boot = b; build();
}).catch(function(e){ if(e && e.silent) return; setupScreen((e && e.message) || ""); });
})();
