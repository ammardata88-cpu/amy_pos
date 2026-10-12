/* AMY console - shell: sidebar, top bar, routing table, start-up */
(function(){
"use strict";
var AMY = window.AMY, h = AMY.h, t = AMY.t, lb = AMY.lb, V = AMY.views, $ = AMY.$;
var bySlug = {};
Object.keys(AMY.cfg.docs).forEach(function(dt){ bySlug[AMY.cfg.docs[dt].slug] = dt });

function can(dt){ if(!dt) return true; var p = AMY.boot.perms[dt]; return !!(p && p.read) }
function path(to){ return to==="company" ? "/companies/"+encodeURIComponent(AMY.boot.company) : to }
function isOn(to){
  var raw = (AMY.curRoute && AMY.curRoute.raw) || "/", p = path(to);
  if(p==="/") return raw==="/" || raw==="";
  if(to==="company") return raw.indexOf("/companies/")===0;
  return raw===p || raw.indexOf(p+"/")===0;
}
function visible(it){
  if(it.admin && !AMY.boot.is_admin) return false;
  if(it.app && !AMY.boot.apps[it.app]) return false;
  return can(it.dt);
}
var opened = {};
AMY.renderNav = function(){
  var nav = $("nav"); AMY.clear(nav);
  AMY.cfg.nav.forEach(function(g){
    if(!g.k){
      nav.appendChild(h("button",{class:"ni"+(isOn(g.to)?" on":""),type:"button",title:lb(g.l),onclick:function(){ AMY.go(g.to) }}, AMY.icon(g.icon), h("span",{text:lb(g.l)})));
      return;
    }
    var kids = g.k.filter(visible); if(!kids.length) return;
    var active = kids.some(function(k){ return !k.ext && isOn(k.to) });
    var box = h("div",{class:"grp"+((active||opened[g.id])?" open":"")});
    var head = h("button",{class:"gh",type:"button",title:lb(g.l),onclick:function(){
      if(document.body.classList.contains("rail") && window.innerWidth>900){ document.body.classList.remove("rail"); try{ localStorage.setItem("amy_rail","0") }catch(e){} }
      opened[g.id] = !box.classList.contains("open"); box.classList.toggle("open") }},
      AMY.icon(g.icon), h("span",{text:lb(g.l)}), AMY.icon("chev","chev"));
    var sub = h("div",{class:"sub"});
    kids.forEach(function(k){
      sub.appendChild(h("button",{class:"ni"+(!k.ext && isOn(k.to)?" on":""),type:"button",onclick:function(){ if(k.ext) location.href=k.ext; else AMY.go(path(k.to)) }}, h("span",{text:lb(k.l)})));
    });
    box.appendChild(head); box.appendChild(sub); nav.appendChild(box);
  });
};

AMY.dispatch = function(p, root){
  var s = p.seg, V = AMY.views;
  if(!s.length) return V.dashboard(root);
  if(s[0]==="reports") return V.reportsHub(root);
  if(s[0]==="report") return V.report(s[1], root);
  if(s[0]==="users"){ if(!AMY.boot.is_admin) return root.appendChild(AMY.emptyBox(t("noperm"),"")); return V.users(root) }
  if(s[0]==="settings") return V.settings(root);
  if(s[0]==="chart"){ if(!can("Account")) return root.appendChild(AMY.emptyBox(t("noperm"),"")); return V.coa(root) }
  if(s[0]==="tax-types"){ if(!can("Sales Taxes and Charges Template")) return root.appendChild(AMY.emptyBox(t("noperm"),"")); return V.taxTypes(root) }
  if(s[0]==="vat"){ if(!can("Sales Invoice")||!can("Purchase Invoice")) return root.appendChild(AMY.emptyBox(t("noperm"),"")); return V.vat(root) }
  if(s[0]==="expenses"){ if(!can("Journal Entry")) return root.appendChild(AMY.emptyBox(t("noperm"),"")); return V.expenses(root, s[1]==="new") }
  if(s[0]==="e-invoicing"){ if(!AMY.boot.is_admin||!AMY.boot.apps.zatca) return root.appendChild(AMY.emptyBox(t("noperm"),"")); return V.einvoice(root) }
  if(s[0]==="setup"){ if(!AMY.boot.is_admin) return root.appendChild(AMY.emptyBox(t("noperm"),"")); return V.setup(root) }
  var dt = bySlug[s[0]];
  if(dt){
    if(!can(dt)) return root.appendChild(AMY.emptyBox(t("noperm"),""));
    return s[1]? V.form(dt, s[1], p, root) : V.list(dt, root, p);
  }
  root.appendChild(AMY.emptyBox(t("notFound"), t("notFoundSub")));
};

/* ---------- top bar ---------- */
function closeMenus(){ ["newMenu","uMenu"].forEach(function(i){ $(i).classList.remove("open") }) }
function toggle(id, e){ e.stopPropagation(); var o = $(id).classList.contains("open"); closeMenus(); if(!o) $(id).classList.add("open") }
function chrome(){
  var T = AMY.lang==="ar"; var b = AMY.boot;
  document.documentElement.lang = AMY.lang; document.documentElement.dir = T? "rtl" : "ltr";
  $("newTxt").textContent = t("new"); $("posTxt").textContent = t("pos");
  $("posTop").classList.toggle("hide", !b.apps.pos_next);
  $("lang").textContent = T? "EN" : "عربي";
  $("company").textContent = b.company || "";
  var np = $("newPop"); AMY.clear(np);
  [["/sales-invoices/new",["فاتورة مبيعات","Sales invoice"],"sales","Sales Invoice"],["/purchase-invoices/new",["فاتورة مشتريات","Purchase invoice"],"buy","Purchase Invoice"],
   ["/payments/new",["سند قبض / دفع","Payment"],"cash","Payment Entry"],["/customers/new",["عميل","Customer"],"user","Customer"],["/suppliers/new",["مورد","Supplier"],"buy","Supplier"],
   ["/items/new",["منتج","Item"],"tag","Item"],["/stock-entries/new",["حركة مخزون","Stock entry"],"stock","Stock Entry"],["/expenses/new",["مصروف","Expense"],"cash","Journal Entry"]].forEach(function(x){
    if(!(b.perms[x[3]] && b.perms[x[3]].create)) return;
    np.appendChild(h("button",{type:"button",onclick:function(){ closeMenus(); AMY.go(x[0]) }}, AMY.icon(x[2]), lb(x[1])));
  });
  var up = $("uPop"); AMY.clear(up);
  up.appendChild(h("div",{class:"who"}, h("b",{text:b.user.full_name}), h("span",{text:b.user.name})));
  up.appendChild(h("hr"));
  up.appendChild(h("button",{type:"button",onclick:function(){ location.href="/app" }}, AMY.icon("grid"), t("desk")));
  up.appendChild(h("button",{type:"button",onclick:function(){
    AMY.call("logout",{}).then(function(){ location.href="/amy-login" },function(){ location.href="/amy-login" }) }}, AMY.icon("out"), t("signout")));
  $("uBtn").textContent = (b.user.full_name||"?").trim().charAt(0).toUpperCase();
  if(b.logo){ var lg = document.querySelector(".sh .logo img"); lg.src = b.logo; lg.style.objectFit="contain"; lg.style.background="#fff" }
}
$("newBtn").addEventListener("click",function(e){ toggle("newMenu",e) });
$("uBtn").addEventListener("click",function(e){ toggle("uMenu",e) });
document.addEventListener("click", closeMenus);
$("menuBtn").addEventListener("click",function(){ document.body.classList.toggle("nav-open") });
$("scrim").addEventListener("click",function(){ document.body.classList.remove("nav-open") });
$("railBtn").addEventListener("click",function(){ var r = document.body.classList.toggle("rail"); try{ localStorage.setItem("amy_rail", r?"1":"0") }catch(e){} });
try{ if(localStorage.getItem("amy_rail")==="1") document.body.classList.add("rail") }catch(e){}
$("lang").addEventListener("click",function(){
  AMY.lang = AMY.lang==="ar"? "en" : "ar"; try{ localStorage.setItem("amy_lang", AMY.lang) }catch(e){}
  chrome(); AMY.render();
});

/* ---------- start ---------- */
AMY.rest("bootstrap",{}).then(function(b){
  AMY.boot = b; chrome(); AMY.render();
}).catch(function(e){
  AMY.clear($("view")); $("view").appendChild(h("div",{class:"err",text:(e&&e.message)||t("err")}));
});
})();
