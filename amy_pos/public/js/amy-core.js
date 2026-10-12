/* AMY console - core: i18n, DOM helper, API, router, UI primitives */
(function(){
"use strict";
var AMY = window.AMY = {csrf:"", lang:"ar", boot:null, cfg:{}, views:{}};
try{ AMY.lang = localStorage.getItem("amy_lang") || "ar" }catch(e){}
if(AMY.lang!=="ar" && AMY.lang!=="en") AMY.lang="ar";

/* ---------- i18n ---------- */
var I = {
 ar:{save:"حفظ",saveSubmit:"حفظ واعتماد",submit:"اعتماد",cancel:"إلغاء المستند",del:"حذف",new:"جديد",edit:"تعديل",print:"طباعة",close:"إغلاق",back:"رجوع",
  search:"بحث",all:"الكل",rows:"سجل",of:"من",prev:"السابق",next:"التالي",noData:"لا توجد بيانات",noDataSub:"ابدأ بإضافة أول سجل.",loading:"جاري التحميل…",
  saved:"تم الحفظ",submitted:"تم الاعتماد",cancelled:"تم الإلغاء",deleted:"تم الحذف",
  confirmDel:"حذف هذا السجل؟",confirmDelSub:"لا يمكن التراجع عن الحذف.",confirmCancel:"إلغاء هذا المستند؟",confirmCancelSub:"سيتم عكس قيوده المحاسبية والمخزنية.",confirmSubmit:"اعتماد المستند؟",confirmSubmitSub:"بعد الاعتماد لا يمكن تعديله، ويمكن إلغاؤه فقط.",
  yes:"نعم، تابع",no:"تراجع",draft:"مسودة",submittedS:"معتمد",cancelledS:"ملغى",
  addRow:"إضافة سطر",item:"الصنف",qty:"الكمية",rate:"السعر",amount:"الإجمالي",uom:"الوحدة",warehouse:"المستودع",
  net:"الإجمالي قبل الضريبة",tax:"الضريبة",grand:"الإجمالي النهائي",discount:"الخصم",
  returnDoc:"مرتجع",makePay:"تسجيل دفعة",dup:"نسخ",pickOne:"اختر…",
  home:"الرئيسية",desk:"النظام الكامل",pos:"الكاشير",signout:"تسجيل الخروج",hello:"أهلاً، ",
  err:"حدث خطأ غير متوقع",req:"هذا الحقل مطلوب",notFound:"غير موجود",notFoundSub:"قد يكون المستند حُذف أو ليس لديك صلاحية عرضه.",
  upload:"رفع صورة",remove:"إزالة",enabled:"مفعّل",disabled:"موقوف",page:"صفحة",export:"تصدير",
  from:"من تاريخ",to:"إلى تاريخ",run:"تشغيل التقرير",company:"الشركة",noperm:"غير متاح لصلاحياتك"},
 en:{save:"Save",saveSubmit:"Save & submit",submit:"Submit",cancel:"Cancel document",del:"Delete",new:"New",edit:"Edit",print:"Print",close:"Close",back:"Back",
  search:"Search",all:"All",rows:"records",of:"of",prev:"Previous",next:"Next",noData:"Nothing here yet",noDataSub:"Add your first record to get started.",loading:"Loading…",
  saved:"Saved",submitted:"Submitted",cancelled:"Cancelled",deleted:"Deleted",
  confirmDel:"Delete this record?",confirmDelSub:"This cannot be undone.",confirmCancel:"Cancel this document?",confirmCancelSub:"Its accounting and stock entries will be reversed.",confirmSubmit:"Submit this document?",confirmSubmitSub:"After submitting it can no longer be edited, only cancelled.",
  yes:"Yes, continue",no:"Go back",draft:"Draft",submittedS:"Submitted",cancelledS:"Cancelled",
  addRow:"Add row",item:"Item",qty:"Qty",rate:"Rate",amount:"Amount",uom:"Unit",warehouse:"Warehouse",
  net:"Subtotal",tax:"Tax",grand:"Total",discount:"Discount",
  returnDoc:"Return",makePay:"Record payment",dup:"Duplicate",pickOne:"Select…",
  home:"Home",desk:"Full system",pos:"POS",signout:"Sign out",hello:"Hello, ",
  err:"Something went wrong",req:"This field is required",notFound:"Not found",notFoundSub:"The document may have been deleted, or you may not have access to it.",
  upload:"Upload image",remove:"Remove",enabled:"Active",disabled:"Inactive",page:"Page",export:"Export",
  from:"From date",to:"To date",run:"Run report",company:"Company",noperm:"Not available for your role"}
};
AMY.t = function(k){ return (I[AMY.lang]&&I[AMY.lang][k]) || I.en[k] || k };
AMY.lb = function(v){ if(v==null) return ""; if(Array.isArray(v)) return v[AMY.lang==="ar"?0:1] || v[0] || ""; return String(v) };
AMY.locale = function(){ return AMY.lang==="ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US" };

/* ---------- DOM ---------- */
AMY.h = function(tag, props){
  var e = document.createElement(tag), a = arguments, i;
  if(props) for(var k in props){
    var v = props[k]; if(v==null || v===false) continue;
    if(k==="class") e.className = v;
    else if(k==="text") e.textContent = v;
    else if(k.slice(0,2)==="on" && typeof v==="function") e.addEventListener(k.slice(2), v);
    else if(k==="style") e.style.cssText = v;
    else if(k==="value") e.value = v;
    else e.setAttribute(k, v===true? "" : v);
  }
  function add(c){
    if(c==null || c===false) return;
    if(Array.isArray(c)) return c.forEach(add);
    e.appendChild(c.nodeType? c : document.createTextNode(String(c)));
  }
  for(i=2;i<a.length;i++) add(a[i]);
  return e;
};
var h = AMY.h;
AMY.$ = function(id){ return document.getElementById(id) };
AMY.clear = function(n){ while(n.firstChild) n.removeChild(n.firstChild); return n };

/* ---------- icons ---------- */
var IC = {
 home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 sales:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
 stock:'<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
 buy:'<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z"/><circle cx="6.5" cy="18.5" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/>',
 acc:'<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 14.5h2"/>',
 rep:'<path d="M4 20V11M10 20V4M16 20v-7M22 20H2"/>',
 set:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
 users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.6"/><path d="M16.5 14.2a5.2 5.2 0 0 1 5 5.8"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
 edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
 trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
 print:'<path d="M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z"/>',
 check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
 chev:'<path d="M6 9l6 6 6-6"/>', chevL:'<path d="M15 6l-6 6 6 6"/>', chevR:'<path d="M9 6l6 6-6 6"/>',
 download:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', upload:'<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
 tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
 warehouse:'<path d="M3 9l9-6 9 6v11H3z"/><path d="M8 20v-7h8v7"/>',
 building:'<path d="M5 21V4h9v17M14 9h5v12M3 21h18M8 8h3M8 12h3M8 16h3"/>',
 shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
 card:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
 percent:'<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
 undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
 layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
 more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
 cart:'<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.5 12h11L21 7H6"/>',
 cash:'<rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/>',
 bag:'<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
 book:'<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h12"/>',
 out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>', swap:'<path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/>',
 gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8h14v-8M12 8c-2.5 0-4-1-4-2.5S9.5 3 12 8zM12 8c2.5 0 4-1 4-2.5S14.5 3 12 8z"/>'
};
AMY.icon = function(n, cls){
  var d = document.createElement("span");
  d.innerHTML = '<svg class="i '+(cls||"")+'" viewBox="0 0 24 24" aria-hidden="true">'+(IC[n]||"")+'</svg>';
  return d.firstChild;
};
AMY.ic = AMY.icon;

/* ---------- format ---------- */
AMY.num = function(v, d){
  v = Number(v||0);
  return v.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:d==null?2:d});
};
AMY.money = function(v, cur){ return AMY.num(v,2) + (cur? " "+cur : "") };
AMY.date = function(s){
  if(!s) return "";
  var d = new Date(String(s).slice(0,10)+"T00:00:00");
  if(isNaN(d)) return s;
  return d.toLocaleDateString(AMY.locale(),{day:"numeric",month:"short",year:"numeric"});
};
AMY.cur = function(){ return (AMY.boot && AMY.boot.currency) || "" };
var ST = {
 "Paid":["ok","مدفوعة","Paid"],"Unpaid":["warn","غير مدفوعة","Unpaid"],"Overdue":["bad","متأخرة","Overdue"],"Partly Paid":["warn","مدفوعة جزئيًا","Partly paid"],
 "Draft":["","مسودة","Draft"],"Submitted":["info","معتمدة","Submitted"],"Cancelled":["bad","ملغاة","Cancelled"],"Return":["info","مرتجع","Return"],
 "Credit Note Issued":["info","إشعار دائن","Credit note"],"Debit Note Issued":["info","إشعار مدين","Debit note"],"Completed":["ok","مكتمل","Completed"],
 "Accepted":["ok","مقبولة","Accepted"],"Accepted with warnings":["ok","مقبولة بتحذيرات","With warnings"],"Rejected":["bad","مرفوضة","Rejected"],
 "Ready For Batch":["warn","بانتظار الإرسال","Queued"],"Resend":["warn","إعادة إرسال","Resend"],"Corrected":["info","مصححة","Corrected"],
 "Duplicate":["bad","مكررة","Duplicate"],"Clearance switched off":["","التصريح متوقف","Clearance off"],"Pending":["warn","قيد الانتظار","Pending"],
 "Open":["warn","مفتوح","Open"],"Closed":["","مغلق","Closed"],"Unreconciled":["warn","غير مسوّى","Unreconciled"],
 "Active":["ok","نشط","Active"],"Inactive":["","موقوف","Inactive"]
};
AMY.statusPill = function(s){
  var m = ST[s]; if(!m) return h("span",{class:"pill",text:s||""});
  return h("span",{class:"pill "+m[0],text:AMY.lang==="ar"?m[1]:m[2]});
};
AMY.statusText = function(s){ var m=ST[s]; return m? (AMY.lang==="ar"?m[1]:m[2]) : (s||"") };
AMY.docPill = function(n){
  n = Number(n||0);
  return n===1 ? h("span",{class:"pill info",text:AMY.t("submittedS")}) : n===2 ? h("span",{class:"pill bad",text:AMY.t("cancelledS")}) : h("span",{class:"pill",text:AMY.t("draft")});
};
AMY.fmt = function(type, v, row, cur){
  if(v==null || v==="") return h("span",{class:"mut",text:"—"});
  switch(type){
   case "money": return h("span",{class:"num",text:AMY.money(v)});
   case "float": return h("span",{class:"num",text:AMY.num(v,3)});
   case "int": return h("span",{class:"num",text:AMY.num(v,0)});
   case "date": return h("span",{text:AMY.date(v)});
   case "status": return AMY.statusPill(v);
   case "docstatus": return AMY.docPill(v);
   case "check": return h("span",{class:"pill "+(Number(v)?"ok":""),text:Number(v)?AMY.t("enabled"):AMY.t("disabled")});
   case "num": return h("span",{class:"num",text:String(v)});
   default: return document.createTextNode(String(v));
  }
};

/* ---------- API ---------- */
function plain(html){ var d=document.createElement("div"); d.innerHTML=html; return (d.textContent||"").trim() }
function errMsg(j){
  try{
    if(j._server_messages){
      var arr = JSON.parse(j._server_messages), out=[];
      arr.forEach(function(s){ try{ var o=JSON.parse(s); out.push(plain(o.message||"")) }catch(e){ out.push(plain(s)) } });
      if(out.length) return out.join("\n");
    }
    if(j.exception){ var x=String(j.exception); return x.slice(x.lastIndexOf(":")+1).trim() || x }
  }catch(e){}
  return AMY.t("err");
}
AMY.call = function(method, args){
  return fetch("/api/method/"+method,{method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json","Accept":"application/json","X-Frappe-CSRF-Token":AMY.csrf},
    body:JSON.stringify(args||{})})
  .then(function(r){
    return r.json().catch(function(){return {}}).then(function(j){
      if(r.status===401 || (r.status===403 && !j._server_messages)){ location.href="/login?redirect-to="+encodeURIComponent("/amy"+location.hash); throw {silent:1} }
      if(!r.ok){ var e=new Error(errMsg(j)); e.status=r.status; throw e }
      return j.message;
    });
  });
};
AMY.rest = function(fn, args){ return AMY.call("amy_pos.rest."+fn, args) };
AMY.upload = function(file, opts){
  var fd = new FormData(); fd.append("file", file, file.name); fd.append("is_private","0");
  if(opts){ for(var k in opts) fd.append(k, opts[k]) }
  return fetch("/api/method/upload_file",{method:"POST",credentials:"same-origin",headers:{"X-Frappe-CSRF-Token":AMY.csrf},body:fd})
    .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(errMsg(j)); return j.message }) });
};

/* ---------- toast / modal / drawer ---------- */
AMY.toast = function(msg, type){
  var box = AMY.$("toasts"), t = h("div",{class:"toast "+(type||""),text:msg,role:"status"});
  box.appendChild(t); setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t) }, type==="bad"?7000:3200);
};
AMY.fail = function(e){ if(e && e.silent) return; AMY.toast((e&&e.message)||AMY.t("err"),"bad") };
AMY.confirm = function(o){
  return new Promise(function(res){
    var ov, done=function(v){ if(ov.parentNode) ov.parentNode.removeChild(ov); res(v) };
    ov = h("div",{class:"ov",onclick:function(e){ if(e.target===ov) done(false) }},
      h("div",{class:"dlg",role:"dialog"},
        h("h3",{text:o.title}), h("p",{text:o.text||""}),
        h("div",{class:"row"},
          h("button",{class:"btn g",type:"button",onclick:function(){done(false)},text:AMY.t("no")}),
          h("button",{class:"btn "+(o.danger?"d":"p"),type:"button",onclick:function(){done(true)},text:o.ok||AMY.t("yes")}))));
    document.body.appendChild(ov);
  });
};
AMY.drawer = function(title, build){
  var ov, body = h("div",{class:"body"}), foot = h("div",{class:"dfoot"}), api = {body:body, footer:foot, close:function(){ if(ov.parentNode) ov.parentNode.removeChild(ov) }};
  ov = h("div",{class:"ov drawer",onclick:function(e){ if(e.target===ov) api.close() }},
    h("div",{class:"dlg",role:"dialog"},
      h("div",{class:"ph",style:"margin-bottom:12px"}, h("h3",{text:title,style:"margin:0;font-size:19px"}),
        h("button",{class:"icobtn",type:"button","aria-label":AMY.t("close"),onclick:api.close, style:"color:var(--mut)"},AMY.icon("x"))),
      body, foot));
  document.body.appendChild(ov); build(api); return api;
};

/* ---------- link field ---------- */
AMY.link = function(o){
  var val = o.value || "", dd = h("div",{class:"dd"}), timer, hl=-1, items=[];
  var inp = h("input",{class:"in",type:"text",autocomplete:"off",placeholder:o.placeholder||AMY.t("pickOne"),value:val,disabled:o.disabled});
  var wrap = h("div",{class:"lk"}, inp, dd);
  function open(v){ wrap.classList[v?"add":"remove"]("open") }
  function pick(it){ val = it.value; inp.value = it.value; open(false); if(o.onChange) o.onChange(val, it) }
  function render(list){
    AMY.clear(dd); items=list; hl=-1;
    if(!list.length){ dd.appendChild(h("div",{class:"none",text:AMY.t("noData")})); return }
    list.forEach(function(it,i){
      dd.appendChild(h("button",{type:"button",onmousedown:function(e){ e.preventDefault(); pick(it) }},
        h("span",{text:it.value}), it.description? h("small",{text:it.description}) : null));
    });
  }
  function fetchList(){
    var f = typeof o.filters==="function"? o.filters() : o.filters;
    AMY.call("frappe.desk.search.search_link",{doctype:typeof o.doctype==="function"? o.doctype() : o.doctype,txt:inp.value===val?"":inp.value,page_length:12,filters:f||null})
      .then(function(r){
        render((r||[]).map(function(x){ return {value:x.value,description:plain(x.description||x.label||"").replace(new RegExp("^"+String(x.value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"[,\\s]*"),"")} }));
        open(true);
      }).catch(function(){});
  }
  inp.addEventListener("focus",function(){ inp.select(); fetchList() });
  inp.addEventListener("input",function(){ clearTimeout(timer); timer=setTimeout(fetchList,220) });
  inp.addEventListener("blur",function(){ setTimeout(function(){ open(false); if(inp.value!==val){ if(inp.value===""){ val=""; if(o.onChange) o.onChange("",null) } else inp.value=val } },150) });
  inp.addEventListener("keydown",function(e){
    var b = dd.querySelectorAll("button");
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); if(!b.length) return; hl=(hl+(e.key==="ArrowDown"?1:-1)+b.length)%b.length; b.forEach(function(x,i){ x.classList[i===hl?"add":"remove"]("on") }); b[hl].scrollIntoView({block:"nearest"}) }
    else if(e.key==="Enter" && hl>=0){ e.preventDefault(); pick(items[hl]) }
    else if(e.key==="Escape") open(false);
  });
  wrap.get = function(){ return val };
  wrap.set = function(v){ val=v||""; inp.value=val };
  wrap.input = inp;
  return wrap;
};

/* ---------- router ---------- */
AMY.parse = function(){
  var raw = (location.hash||"#/").replace(/^#/,"") || "/", q={}, qi = raw.indexOf("?");
  if(qi>=0){ raw.slice(qi+1).split("&").forEach(function(p){ var kv=p.split("="); if(kv[0]) q[decodeURIComponent(kv[0])]=decodeURIComponent(kv[1]||"") }); raw = raw.slice(0,qi) }
  var seg = raw.split("/").filter(Boolean).map(decodeURIComponent);
  return {seg:seg, q:q, raw:raw};
};
AMY.go = function(path){ if(location.hash==="#"+path) AMY.render(); else location.hash = "#"+path };
AMY.href = function(){ return "#/"+Array.prototype.map.call(arguments,encodeURIComponent).join("/") };
AMY.setTitle = function(t){ AMY.$("ptitle").textContent = t||""; document.title = (t? t+" · ":"")+"AMY" };
AMY.render = function(){
  var p = AMY.parse(), root = AMY.$("view");
  AMY.clear(root); document.body.classList.remove("nav-open");
  window.scrollTo(0,0);
  AMY.curRoute = p;
  try{ AMY.dispatch(p, root) }catch(e){ root.appendChild(h("div",{class:"err",text:(e&&e.message)||AMY.t("err")})); if(window.console) console.error(e) }
  if(AMY.renderNav) AMY.renderNav();
};
window.addEventListener("hashchange", function(){ AMY.render() });
})();
