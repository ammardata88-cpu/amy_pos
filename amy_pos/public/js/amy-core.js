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
  openRec:"فتح السجل",returnDoc:"مرتجع",makePay:"تسجيل دفعة",dup:"نسخ",pickOne:"اختر…",
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
  openRec:"Open record",returnDoc:"Return",makePay:"Record payment",dup:"Duplicate",pickOne:"Select…",
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
 home:'<path class="d" d="M4 11l8-7 8 7v8a1.5 1.5 0 0 1-1.5 1.5h-3V14h-7v6.5h-3A1.5 1.5 0 0 1 4 19z"/><path d="M3 11.5L12 3.5l9 8M5 10v9a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-9M9.5 20.5V14h5v6.5"/>',
 sales:'<path class="d" d="M5.5 3.5h13v17l-3.25-2-3.25 2-3.25-2-3.25 2z"/><path d="M5.5 3.5h13v17l-3.25-2-3.25 2-3.25-2-3.25 2zM9 8.5h6M9 12h6"/>',
 stock:'<path class="d" d="M12 3l8.5 4.7v8.6L12 21l-8.5-4.7V7.7z"/><path d="M12 3l8.5 4.7v8.6L12 21l-8.5-4.7V7.7zM3.5 7.7L12 12.5l8.5-4.8M12 12.5V21"/>',
 buy:'<path class="d" d="M2.5 6.5h10.5v10H2.5z"/><path d="M2.5 6.5H13v10H2.5zM13 9.5h4l3.5 3.5v3.5H13"/><circle cx="6.5" cy="18.5" r="1.7"/><circle cx="17.5" cy="18.5" r="1.7"/>',
 acc:'<path class="d" d="M3 9.5h18v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M5.5 5h13A2.5 2.5 0 0 1 21 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10A2.5 2.5 0 0 1 5.5 5zM3 10h18M16 15h2"/>',
 rep:'<path class="d" d="M4 12h4v8H4zM10 4h4v16h-4zM16 9h4v11h-4z"/><path d="M4 12h4v8H4zM10 4h4v16h-4zM16 9h4v11h-4z"/>',
 set:'<circle class="d" cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5l1.4 1-1.5 2.6-1.6-.6a7 7 0 0 1-1.7 1l-.3 1.7h-3l-.3-1.7a7 7 0 0 1-1.7-1l-1.6.6-1.5-2.6 1.4-1a7 7 0 0 1 0-2l-1.4-1 1.5-2.6 1.6.6a7 7 0 0 1 1.7-1l.3-1.7h3l.3 1.7a7 7 0 0 1 1.7 1l1.6-.6 1.5 2.6-1.4 1a7 7 0 0 1 0 2z" transform="translate(-.5 0)"/>',
 users:'<circle class="d" cx="9" cy="8" r="3.6"/><circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.4 3.4 0 0 1 0 6.6M18.5 14.6a6 6 0 0 1 3 5.4"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
 edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
 trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
 print:'<path d="M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z"/>',
 check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
 chev:'<path d="M6 9l6 6 6-6"/>', chevL:'<path d="M15 6l-6 6 6 6"/>', chevR:'<path d="M9 6l6 6-6 6"/>',
 download:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', upload:'<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
 tag:'<path class="d" d="M3.5 12.5V4.5h8l9 9-8 8z"/><path d="M3.5 12.5V4.5h8l9 9-8 8zM8 9h.01"/>',
 warehouse:'<path class="d" d="M3.5 9.5L12 4l8.5 5.5v10.5h-17z"/><path d="M3.5 9.5L12 4l8.5 5.5v10.5h-17zM8 20v-7h8v7M8 16.5h8"/>',
 building:'<path class="d" d="M5 21V4.5h9V21z"/><path d="M5 21V4.5h9V21M14 9.5h5V21M3 21h18M8.5 8.5h2M8.5 12h2M8.5 15.5h2"/>',
 shield:'<path class="d" d="M12 3l8 3v6c0 4.7-3.3 7.7-8 9-4.7-1.300-8-4.300-8-9V6z"/><path d="M12 3l8 3v6c0 4.7-3.3 7.7-8 9-4.700-1.300-8-4.300-8-9V6zM8.800 12l2.300 2.300 4.200-4.300"/>',
 card:'<rect class="d" x="2.5" y="5" width="19" height="14" rx="2.5"/><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
 percent:'<circle class="d" cx="7" cy="7" r="2.6"/><circle class="d" cx="17" cy="17" r="2.6"/><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="17" r="2.6"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
 undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
 layers:'<path class="d" d="M12 3.5l9 5-9 5-9-5z"/><path d="M12 3.5l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5"/>',
 more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
 cart:'<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.5 12h11L21 7H6"/>',
 cash:'<rect class="d" x="2.5" y="6" width="19" height="12" rx="2.5"/><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
 bag:'<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
 lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
 book:'<path class="d" d="M4.5 4.5h11A3.5 3.5 0 0 1 19 8v12H8a3.5 3.5 0 0 1-3.5-3.5z"/><path d="M4.5 4.5h11A3.5 3.5 0 0 1 19 8v12H8a3.5 3.5 0 0 1-3.5-3.5zM4.5 16.5A3.5 3.5 0 0 1 8 13h11"/>',
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
/* HTML to text without ever building live elements: a DOMParser document runs no scripts and loads no images. */
function plain(html){ try{ return (new DOMParser().parseFromString(String(html),"text/html").body.textContent||"").trim() }catch(e){ return "" } }
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
      if(r.status===401 || (r.status===403 && !j._server_messages)){ location.href="/amy-login?next="+encodeURIComponent("/amy"+location.hash); throw {silent:1} }
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
  var go = h("a",{class:"lkgo hide",target:"_self",title:AMY.t("openRec")}, AMY.icon("chevL"));
  var wrap = h("div",{class:"lk"}, inp, go, dd);
  function target(){
    var dt = typeof o.doctype==="function"? o.doctype() : o.doctype, c = AMY.cfg.docs && AMY.cfg.docs[dt], p = AMY.boot && AMY.boot.perms[dt];
    return (c && p && p.read && val)? "#/"+c.slug+"/"+encodeURIComponent(val) : "";
  }
  function showGo(){ var t = target(); go.classList[t?"remove":"add"]("hide"); if(t) go.setAttribute("href",t); wrap.classList[t?"add":"remove"]("hasgo") }
  function open(v){ wrap.classList[v?"add":"remove"]("open") }
  function pick(it){ val = it.value; inp.value = it.value; open(false); showGo(); if(o.onChange) o.onChange(val, it) }
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
  inp.addEventListener("blur",function(){ setTimeout(function(){ open(false); if(inp.value!==val){ if(inp.value===""){ val=""; showGo(); if(o.onChange) o.onChange("",null) } else inp.value=val } },150) });
  inp.addEventListener("keydown",function(e){
    var b = dd.querySelectorAll("button");
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); if(!b.length) return; hl=(hl+(e.key==="ArrowDown"?1:-1)+b.length)%b.length; b.forEach(function(x,i){ x.classList[i===hl?"add":"remove"]("on") }); b[hl].scrollIntoView({block:"nearest"}) }
    else if(e.key==="Enter" && hl>=0){ e.preventDefault(); pick(items[hl]) }
    else if(e.key==="Escape") open(false);
  });
  wrap.get = function(){ return val };
  wrap.set = function(v){ val=v||""; inp.value=val; showGo() };
  setTimeout(showGo,0);
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
