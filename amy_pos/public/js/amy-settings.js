/* AMY console - General settings (tabs on top) and the Subscription page */
(function(){
"use strict";
var AMY = window.AMY, h = AMY.h, lb = AMY.lb, t = AMY.t, V = AMY.views;
function ar(){ return AMY.lang==="ar" }
function can(dt){ var p = AMY.boot.perms[dt]; return !!(p && p.read) }

/* ---------- tabs ---------- */
var TABS = [
 {to:"/settings", l:["بيانات الشركة","Company info"], m:["settings","companies"], pick:function(p){ return p.seg[0]==="settings" && p.seg[1]!=="more" || p.seg[0]==="companies" }},
 {to:"/users", l:["المستخدمون والصلاحيات","Users & roles"], m:["users"], admin:1},
 {to:"/warehouses", l:["الفروع والمخازن","Sites"], m:["warehouses"], dt:"Warehouse"},
 {to:"/tax-types", l:["الضرائب","Taxes"], m:["tax-types","sales-taxes"], dt:"Sales Taxes and Charges Template"},
 {to:"/payment-methods", l:["طرق الدفع","Payment methods"], m:["payment-methods"], dt:"Mode of Payment"},
 {to:"/fiscal-years", l:["الفترة المالية","Fiscal year"], m:["fiscal-years"], dt:"Fiscal Year"},
 {to:"/e-invoicing", l:["الفوترة الإلكترونية","E-invoicing"], m:["e-invoicing"], admin:1, app:"zatca"},
 {to:"/industry", l:["نوع النشاط","Business type"], m:["industry"], admin:1},
 {to:"/setup", l:["التهيئة السريعة","Quick setup"], m:["setup"], admin:1},
 {to:"/settings/more", l:["إعدادات إضافية","More settings"], m:[], pick:function(p){ return p.seg[0]==="settings" && p.seg[1]==="more" }}
];
function shown(x){
  if(x.admin && !AMY.boot.is_admin) return false;
  if(x.app && !AMY.boot.apps[x.app]) return false;
  if(x.dt && !can(x.dt)) return false;
  return true;
}
function bar(){
  var el = document.getElementById("settabs");
  if(!el){
    el = h("nav",{id:"settabs",class:"tabs stabs","aria-label":"settings"});
    var view = AMY.$("view"); view.parentNode.insertBefore(el, view);
  }
  return el;
}
AMY.decorate = function(p){
  var el = bar(), seg = p.seg, hit = null;
  TABS.forEach(function(x){ if(!hit && (x.pick? x.pick(p) : (x.m.indexOf(seg[0])>=0 && seg.length<=1))) hit = x });
  /* company route only counts when it is the user's own company */
  if(hit && seg[0]==="companies" && seg[1] && seg[1]!==AMY.boot.company) hit = null;
  /* sub-pages (e.g. one warehouse) keep the tab bar but the list tabs only on their list */
  if(!hit && seg.length>1 && TABS.some(function(x){ return x.m.indexOf(seg[0])>=0 && seg[0]!=="settings" && seg[0]!=="companies" })) hit = TABS.filter(function(x){ return x.m.indexOf(seg[0])>=0 })[0];
  AMY.clear(el);
  if(!hit){ el.style.display = "none"; return }
  el.style.display = "";
  TABS.filter(shown).forEach(function(x){
    el.appendChild(h("button",{class:"tab"+(x===hit?" on":""),type:"button",onclick:function(){ AMY.go(x.to) }}, lb(x.l)));
  });
  var on = el.querySelector(".tab.on"); if(on && on.scrollIntoView){ try{ on.scrollIntoView({block:"nearest",inline:"center"}) }catch(e){} }
};

/* ---------- General = company info form ---------- */
V.generalSettings = function(root, p){
  if(!AMY.boot.company || !can("Company")) return V.settings(root);
  var q = {}; for(var k in p.q) q[k] = p.q[k]; q.__plain = 1;
  return V.form("Company", AMY.boot.company, {seg:["companies",AMY.boot.company], q:q, raw:p.raw}, root);
};

/* ---------- Subscription ---------- */
function fmtDate(s){ if(!s) return "—"; try{ return new Date(s+"T00:00:00").toLocaleDateString(AMY.locale(),{year:"numeric",month:"long",day:"numeric"}) }catch(e){ return s } }
var S = {
 ar:{title:"الاشتراك",sub:"باقتك الحالية، مدة الاشتراك والمستخدمون.",plan:"الباقة الحالية",active:"فعّال",expiring:"ينتهي قريبًا",expired:"منتهي",suspended:"موقوف",
  from:"بداية الاشتراك",to:"نهاية الاشتراك",left:"المتبقي",days:"يوم",open:"اشتراك مفتوح بدون تاريخ انتهاء",users:"المستخدمون",of:"من",unl:"غير محدود",
  feats:"ما يشمله اشتراكك",price:"قيمة الاشتراك",month:"شهريًا",year:"سنويًا",renew:"تجديد أو ترقية الباقة",contact:"تواصل معنا",wa:"واتساب",mail:"البريد",
  warnE:"اشتراكك ينتهي خلال {n} يوم. جدّده حتى لا تتوقف الخدمة.",warnX:"انتهى اشتراكك. تواصل معنا للتجديد.",warnS:"الاشتراك موقوف. تواصل معنا.",renewShort:"تجديد",
  hint:"لا يتوقف شيء من بياناتك عند انتهاء الاشتراك. نحتفظ بها لك."},
 en:{title:"Subscription",sub:"Your plan, how long it runs and how many users it covers.",plan:"Current plan",active:"Active",expiring:"Ending soon",expired:"Expired",suspended:"Suspended",
  from:"Started",to:"Ends",left:"Remaining",days:"days",open:"Open subscription with no end date",users:"Users",of:"of",unl:"Unlimited",
  feats:"What your plan includes",price:"Plan price",month:"per month",year:"per year",renew:"Renew or upgrade",contact:"Contact us",wa:"WhatsApp",mail:"Email",
  warnE:"Your subscription ends in {n} days. Renew to keep the service running.",warnX:"Your subscription has ended. Contact us to renew.",warnS:"Your subscription is paused. Contact us.",renewShort:"Renew",
  hint:"Your data is never deleted when a subscription ends. We keep it safe for you."}
};
function s(k){ return S[AMY.lang][k] }
var PILL = {active:"ok",expiring:"warn",expired:"bad",suspended:"bad"};

V.subscription = function(root){
  AMY.setTitle(s("title"));
  root.appendChild(AMY.pageHeader({title:s("title"), sub:s("sub")}));
  var box = h("div",{class:"sbx"}, h("div",{class:"card"}, h("div",{class:"sk",style:"width:40%;height:24px"}), h("div",{class:"sk",style:"width:80%;margin-top:18px"})));
  root.appendChild(box);
  AMY.call("amy_pos.plan.subscription",{}).then(function(x){ paint(x) }).catch(function(e){ AMY.clear(box); box.appendChild(h("div",{class:"err",text:e.message||t("err")})); AMY.fail(e) });

  function paint(x){
    AMY.clear(box);
    var pct = x.total_days? Math.max(0, Math.min(100, Math.round((x.total_days - (x.days_left||0)) / x.total_days * 100))) : 0;
    var tone = PILL[x.status] || "ok";
    var hero = h("section",{class:"sub-hero"},
      h("div",{class:"sub-top"},
        h("div",null, h("div",{class:"sub-k",text:s("plan")}), h("h2",{class:"sub-plan",text:lb(x.plan_name)})),
        h("span",{class:"pill "+tone,text:s(x.status)})));
    if(x.end){
      hero.appendChild(h("div",{class:"sub-left"}, h("b",{text:AMY.num(Math.max(0,x.days_left),0)}), h("span",{text:s("days")+" "+s("left")})));
      hero.appendChild(h("div",{class:"meter sub-meter"+(tone==="ok"?"":" "+tone)}, h("i",{style:"width:"+pct+"%"})));
      hero.appendChild(h("div",{class:"sub-dates"}, h("span",null,h("small",{text:s("from")}),h("b",{text:fmtDate(x.start)})), h("span",null,h("small",{text:s("to")}),h("b",{text:fmtDate(x.end)}))));
    } else hero.appendChild(h("p",{class:"mut",style:"margin:14px 0 0",text:s("open")}));
    box.appendChild(hero);

    var grid = h("div",{class:"sub-grid"}), lim = x.users_limit;
    var u = h("section",{class:"sub-card"}, h("div",{class:"sub-k",text:s("users")}),
      h("div",{class:"sub-big"}, h("b",{text:AMY.num(x.users_used,0)}), h("span",{text:" "+s("of")+" "+(lim? AMY.num(lim,0) : s("unl"))})));
    if(lim) u.appendChild(h("div",{class:"meter",style:"margin-top:12px"}, h("i",{style:"width:"+Math.min(100,Math.round(x.users_used/lim*100))+"%;background:"+(x.users_used>=lim?"var(--bad)":"var(--brand)")})));
    u.appendChild(h("a",{class:"sub-lnk",href:"#/users",text:s("users")}));
    grid.appendChild(u);
    if(x.price!=null){
      grid.appendChild(h("section",{class:"sub-card"}, h("div",{class:"sub-k",text:s("price")}),
        h("div",{class:"sub-big"}, h("b",{text:AMY.num(x.price,x.price%1?2:0)}), h("span",{text:" "+x.currency+" "+(x.period==="year"?s("year"):s("month"))}))));
    }
    box.appendChild(grid);

    var fl = h("ul",{class:"sub-feats"});
    x.features.forEach(function(f){ fl.appendChild(h("li",null, AMY.icon("check"), h("span",{text:lb(f)}))) });
    box.appendChild(h("section",{class:"sub-card wide"}, h("div",{class:"sub-k",text:s("feats")}), fl));

    var sup = x.support||{}, acts = h("div",{class:"sub-acts"});
    if(sup.whatsapp) acts.appendChild(h("a",{class:"btn p",href:"https://wa.me/"+String(sup.whatsapp).replace(/\D/g,""),target:"_blank",rel:"noopener",text:s("renew")+" · "+s("wa")}));
    if(sup.email) acts.appendChild(h("a",{class:"btn"+(sup.whatsapp?"":" p"),href:"mailto:"+sup.email+"?subject="+encodeURIComponent("AMY - "+s("renew")),text:(sup.whatsapp?"":s("renew")+" · ")+sup.email}));
    box.appendChild(h("section",{class:"sub-card wide"}, h("div",{class:"sub-k",text:s("contact")}), acts, h("p",{class:"mut sub-hint",text:s("hint")})));
  }
};

/* ---------- soft banner when expiring / expired ---------- */
AMY.subBanner = function(){
  var sb = AMY.boot && AMY.boot.sub, old = document.getElementById("subbar");
  if(old) old.remove();
  if(!sb || !AMY.boot.is_admin || sb.status==="active") return;
  var msg = sb.status==="expiring"? s("warnE").replace("{n}", sb.days_left) : sb.status==="expired"? s("warnX") : s("warnS");
  var el = h("div",{id:"subbar",class:"subbar "+(sb.status==="expiring"?"warn":"bad"),role:"status"},
    h("span",{text:msg}), h("a",{href:"#/subscription",text:s("renewShort")}));
  var anchor = document.getElementById("settabs") || AMY.$("view"); anchor.parentNode.insertBefore(el, anchor);
};
var prevDeco = AMY.decorate;
AMY.decorate = function(p, root){ prevDeco(p, root); AMY.subBanner() };
})();
