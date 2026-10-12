/* AMY console - dashboard, reports, users, settings hub */
(function(){
"use strict";
var AMY = window.AMY, h = AMY.h, lb = AMY.lb, t = AMY.t, V = AMY.views;
function svgEl(tag, a){ var e=document.createElementNS("http://www.w3.org/2000/svg",tag); for(var k in a) e.setAttribute(k,a[k]); return e }
var D = {
 ar:{today:"مبيعات اليوم",month:"مبيعات الشهر",purch:"مشتريات الشهر",stock:"قيمة المخزون",inv:"فاتورة",chart:"المبيعات آخر 14 يوم",d14:"إجمالي 14 يوم",
  debt:"الذمم",recv:"مستحق من العملاء",pay:"مستحق للموردين",top:"الأكثر مبيعًا هذا الشهر",low:"مخزون يحتاج انتباه",z:"الفوترة الإلكترونية (ZATCA)",zacc:"مقبولة",
  recent:"آخر الفواتير",all:"عرض الكل",cInv:"الفاتورة",cCust:"العميل",cDate:"التاريخ",cAmt:"المبلغ",cSt:"الحالة",cZ:"ZATCA",neg:"رصيد سالب",outq:"نفد",qty:"الكمية",
  sub:"هذه نظرة سريعة على نشاط شركتك اليوم."},
 en:{today:"Sales today",month:"Sales this month",purch:"Purchases this month",stock:"Stock value",inv:"invoices",chart:"Sales, last 14 days",d14:"14-day total",
  debt:"Balances",recv:"Owed by customers",pay:"Owed to suppliers",top:"Top sellers this month",low:"Stock needing attention",z:"E-invoicing (ZATCA)",zacc:"accepted",
  recent:"Recent invoices",all:"View all",cInv:"Invoice",cCust:"Customer",cDate:"Date",cAmt:"Amount",cSt:"Status",cZ:"ZATCA",neg:"Negative stock",outq:"Out of stock",qty:"Qty",
  sub:"A quick look at how your business is doing today."}
};
function d(k){ return D[AMY.lang][k] }

/* =============================================================== DASHBOARD */
V.dashboard = function(root){
  AMY.setTitle(t("home"));
  var name = (AMY.boot.user.full_name||"").split(" ")[0];
  root.appendChild(AMY.pageHeader({title:t("hello")+name, sub:new Date().toLocaleDateString(AMY.locale(),{weekday:"long",year:"numeric",month:"long",day:"numeric"})}));
  var kp = h("section",{class:"gd k4"}), r1 = h("section",{class:"gd c21 mt"}), r2 = h("section",{class:"gd mt"}), r3 = h("section",{class:"gd c3 mt"});
  [kp,r1,r2,r3].forEach(function(x){ root.appendChild(x) });
  [0,1,2,3].forEach(function(){ kp.appendChild(h("div",{class:"card"},h("div",{class:"sk",style:"width:40%"}),h("div",{class:"sk",style:"width:60%;height:26px;margin-top:14px"}))) });
  AMY.call("amy_pos.api.dashboard",{}).then(function(x){ paint(x) }).catch(function(e){ AMY.clear(kp); kp.appendChild(h("div",{class:"err",style:"grid-column:1/-1",text:e.message||t("err")})); AMY.fail(e) });

  function kpi(label, value, sub, icon, cur, to){
    var v = h("div",{class:"v",text:value==null?"—":AMY.num(value,value>=1000?0:2)}); if(value!=null) v.appendChild(h("small",{text:cur}));
    return h(to?"a":"div",{class:"card kpi"+(to?" lnkc":""),href:to?"#"+to:null}, h("div",{class:"top2"}, h("span",{class:"l",text:label}), h("span",{class:"chip"},AMY.icon(icon))), v, h("div",{class:"c",text:sub||" "}));
  }
  function paint(x){
    var cur = x.currency||"", s = x.sales, p = x.purchases;
    [kp,r1,r2,r3].forEach(AMY.clear);
    kp.appendChild(kpi(d("today"), s&&s.today.value, s? s.today.count+" "+d("inv") : t("noperm"), "cash", cur, "/sales-invoices"));
    kp.appendChild(kpi(d("month"), s&&s.month.value, s? s.month.count+" "+d("inv") : t("noperm"), "sales", cur, "/sales-invoices"));
    kp.appendChild(kpi(d("purch"), p&&p.month.value, p? p.month.count+" "+d("inv") : t("noperm"), "bag", cur, "/purchase-invoices"));
    kp.appendChild(kpi(d("stock"), x.stock_value, " ", "stock", cur, "/report/stock-balance"));

    /* chart */
    var area = h("div",{class:"areawrap"}), big = h("div",{class:"big"});
    if(x.series){
      var tot = x.series.reduce(function(a,y){ return a+y.total },0);
      big.appendChild(h("div",{class:"n"}, AMY.num(tot,0), h("small",{text:cur}))); big.appendChild(h("div",{class:"mut",text:d("d14")}));
      chart(area, x.series, cur);
    } else area.appendChild(h("div",{class:"empty",text:t("noperm")}));
    r1.appendChild(h("div",{class:"card"}, h("h2",{text:d("chart")}), big, area));
    var db = h("div");
    if(s||p){
      var mx = Math.max(s?s.receivable.value:0, p?p.payable.value:0, 1);
      [[d("recv"),s&&s.receivable,"#1B7A4B","/report/receivable"],[d("pay"),p&&p.payable,"#C98A1B","/report/payable"]].forEach(function(y){
        var m = h("div",{class:"meter"}, h("i",{style:"width:"+(y[1]?Math.max(2,y[1].value/mx*100):0)+"%;background:"+y[2]}));
        db.appendChild(h("div",{class:"split lnkc",onclick:function(){ AMY.go(y[3]) }}, h("div",{class:"row"}, h("span",{text:y[0]}), h("b",{text:y[1]? AMY.num(y[1].value,0)+" "+cur : "—"})), m,
          h("div",{class:"mut",style:"font-size:13px;margin-top:6px",text:y[1]? y[1].count+" "+d("inv") : ""})));
      });
    } else db.appendChild(h("div",{class:"empty",text:t("noperm")}));
    r1.appendChild(h("div",{class:"card"}, h("h2",{text:d("debt")}), db));

    /* recent */
    var tb = h("tbody");
    if(x.recent==null) tb.appendChild(h("tr",null,h("td",{colspan:6,class:"empty",text:t("noperm")})));
    else if(!x.recent.length) tb.appendChild(h("tr",null,h("td",{colspan:6},AMY.emptyBox(t("noData"),t("noDataSub")))));
    else x.recent.forEach(function(r){
      var tr = h("tr",{class:"go",onclick:function(){ AMY.go("/sales-invoices/"+encodeURIComponent(r.name)) }},
        h("td",{class:"nm num",text:r.name}), h("td",{text:r.customer_name||"—"}), h("td",{class:"mut",text:AMY.date(r.posting_date)}),
        h("td",{class:"num end",text:AMY.num(r.base_grand_total,2)+" "+cur}), h("td",null,AMY.statusPill(r.status)), h("td",null, r.zatca? AMY.statusPill(r.zatca) : h("span",{class:"mut",text:"—"})));
      tb.appendChild(tr);
    });
    r2.appendChild(h("div",{class:"card flush"}, h("div",{class:"hd"}, h("h2",{style:"margin:0"}, h("span",{text:d("recent")}), h("a",{href:"#/sales-invoices",text:d("all")}))),
      h("div",{class:"scroll"}, h("table",{class:"tbl"}, h("thead",null,h("tr",null,[d("cInv"),d("cCust"),d("cDate"),d("cAmt"),d("cSt"),d("cZ")].map(function(c,i){ return h("th",{class:i===3?"end":"",text:c}) }))), tb))));
    if(x.zatca!=null){
      var zb = h("div"); donut(zb, x.zatca); r3.appendChild(h("div",{class:"card"}, h("h2",{text:d("z")}), zb));
    }
    r3.appendChild(h("div",{class:"card"}, h("h2",{text:d("top")}), topList(x, cur)));
    var lw = h("tbody");
    if(x.low_stock==null) lw.appendChild(h("tr",null,h("td",{class:"empty",text:t("noperm")})));
    else if(!x.low_stock.length) lw.appendChild(h("tr",null,h("td",{class:"empty",text:t("noData")})));
    else x.low_stock.forEach(function(r){ var q=Number(r.actual_qty);
      lw.appendChild(h("tr",{class:"go",onclick:function(){ AMY.go("/items/"+encodeURIComponent(r.item_code)) }},
        h("td",null,h("div",{class:"nm",text:r.item_name||r.item_code}),h("div",{class:"mut",style:"font-size:13px",text:r.warehouse})),
        h("td",null,h("span",{class:"pill "+(q<0?"bad":"warn"),text:q<0?d("neg"):(q===0?d("outq"):d("qty"))})), h("td",{class:"num end",text:AMY.num(q)}))); });
    r3.appendChild(h("div",{class:"card"}, h("h2",{text:d("low")}), h("div",{class:"scroll"},h("table",{class:"tbl"},lw))));
  }
  function topList(x, cur){
    var ul = h("ul",{class:"hb"});
    if(x.top_items==null) ul.appendChild(h("li",{class:"empty",text:t("noperm")}));
    else if(!x.top_items.length) ul.appendChild(h("li",{class:"empty",text:t("noData")}));
    else { var m=Math.max.apply(null,x.top_items.map(function(y){return Number(y.amount)}).concat([1]));
      x.top_items.forEach(function(r){ ul.appendChild(h("li",{class:"lnkc",onclick:function(){ AMY.go("/items/"+encodeURIComponent(r.item_code)) }}, h("div",{class:"r"}, h("span",{text:r.item_name||r.item_code}), h("span",{class:"num",style:"font-weight:600",text:AMY.num(r.amount,0)+" "+cur})),
        h("div",{class:"meter"},h("i",{style:"width:"+Math.max(3,Number(r.amount)/m*100)+"%;background:#0B7CA4"})))) }); }
    return ul;
  }
  function chart(box, series, cur){
    var W=600,H=190,P=8, max=Math.max.apply(null,series.map(function(y){return y.total}).concat([1]));
    var pts = series.map(function(y,i){ return [P+i*(W-2*P)/(series.length-1), H-P-(y.total/max)*(H-2*P-14)] });
    var dd="M"+pts[0][0]+","+pts[0][1];
    for(var i=1;i<pts.length;i++){ dd+=" L"+pts[i][0]+","+pts[i][1] }
    var svg = svgEl("svg",{viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"none"}), defs=svgEl("defs",{}), gr=svgEl("linearGradient",{id:"ag",x1:"0",y1:"0",x2:"0",y2:"1"});
    gr.appendChild(svgEl("stop",{offset:"0","stop-color":"#10AFD7","stop-opacity":".3"})); gr.appendChild(svgEl("stop",{offset:"1","stop-color":"#10AFD7","stop-opacity":"0"}));
    defs.appendChild(gr); svg.appendChild(defs);
    [0.25,0.5,0.75,1].forEach(function(f){ var y=H-P-f*(H-2*P-14); svg.appendChild(svgEl("line",{x1:0,x2:W,y1:y,y2:y,stroke:"#E7EAEE","stroke-width":1,"vector-effect":"non-scaling-stroke"})) });
    svg.appendChild(svgEl("path",{d:dd,fill:"none",stroke:"#0B7CA4","stroke-width":1.75,"stroke-linecap":"round","stroke-linejoin":"round","vector-effect":"non-scaling-stroke"}));
    svg.appendChild(svgEl("line",{x1:0,x2:W,y1:H-P,y2:H-P,stroke:"#111C26","stroke-width":1,"vector-effect":"non-scaling-stroke"}));
    box.appendChild(svg);
    var xl = h("div",{class:"xl"}); [0,4,8,13].forEach(function(i){ xl.appendChild(h("span",{text:series[i].date.slice(5)})) }); box.appendChild(xl);
    var tip = h("div",{class:"tip"}); box.appendChild(tip);
    svg.addEventListener("mousemove",function(e){
      var rc=svg.getBoundingClientRect(), i=Math.round((e.clientX-rc.left)/rc.width*(series.length-1)); i=Math.max(0,Math.min(series.length-1,i));
      tip.style.display="block"; tip.style.left=(pts[i][0]/W*rc.width)+"px"; tip.style.top=(pts[i][1]/H*rc.height+6)+"px"; tip.textContent=series[i].date+"  ·  "+AMY.num(series[i].total)+" "+cur;
    });
    svg.addEventListener("mouseleave",function(){ tip.style.display="none" });
  }
  function donut(body, zt){
    var keys=Object.keys(zt), total=keys.reduce(function(a,k){ return a+zt[k] },0);
    if(!total){ body.appendChild(h("div",{class:"empty",text:t("noData")})); return }
    var col={"Accepted":"#0F7A55","Accepted with warnings":"#7BC8A4","Rejected":"#B42318","Duplicate":"#E07A6F","Ready For Batch":"#E5A33A","Resend":"#F0C36D","Pending":"#C9D1DC","Corrected":"#0A8FB3","Clearance switched off":"#94A3B8"};
    var svg=svgEl("svg",{viewBox:"0 0 42 42"}), R=15.9155, off=0;
    svg.appendChild(svgEl("circle",{cx:21,cy:21,r:R,fill:"none",stroke:"#EEF1F6","stroke-width":5}));
    keys.forEach(function(k){ var pc=zt[k]/total*100; svg.appendChild(svgEl("circle",{cx:21,cy:21,r:R,fill:"none",stroke:col[k]||"#94A3B8","stroke-width":5,"stroke-dasharray":pc+" "+(100-pc),"stroke-dashoffset":-off})); off+=pc });
    var acc=(zt["Accepted"]||0)+(zt["Accepted with warnings"]||0);
    var dn=h("div",{class:"donut"}, svg, h("div",{class:"mid"}, h("div",null,h("b",{text:Math.round(acc/total*100)+"%"}),h("br"),h("span",{text:d("zacc")}))));
    var lg=h("ul",{class:"leg"}); keys.forEach(function(k){ lg.appendChild(h("li",{class:"lnkc",onclick:function(){ AMY.go("/zatca") }},h("i",{style:"background:"+(col[k]||"#94A3B8")}),h("span",{text:AMY.statusText(k)}),h("b",{text:String(zt[k])}))) });
    body.appendChild(h("div",{class:"donutw"},dn,lg));
  }
};

/* =============================================================== REPORTS */
var COLAR = {"Invoice":"الفاتورة","Customer":"العميل","Customer Name":"اسم العميل","Supplier":"المورد","Supplier Name":"اسم المورد","Posting Date":"التاريخ","Net Total":"الصافي","Grand Total":"الإجمالي","Total Tax":"الضريبة","Total Taxes":"الضريبة","Total":"الإجمالي","Outstanding Amount":"المتبقي","Paid Amount":"المدفوع","Due Date":"الاستحقاق","Item Code":"رمز الصنف","Item Name":"اسم الصنف","Item":"الصنف","Warehouse":"المستودع","Balance Qty":"الكمية","Balance Value":"القيمة","Valuation Rate":"سعر التقييم","Voucher Type":"نوع المستند","Voucher No":"رقم المستند","Account":"الحساب","Debit":"مدين","Credit":"دائن","Balance":"الرصيد","Party":"الطرف","Party Type":"نوع الطرف","Currency":"العملة","Company":"الشركة","Status":"الحالة","Territory":"المنطقة","Customer Group":"مجموعة العميل","Item Group":"فئة الصنف","Brand":"الماركة","Remarks":"ملاحظات","Mode of Payment":"طريقة الدفع","Cost Center":"مركز التكلفة","Debit (Transaction)":"مدين","Credit (Transaction)":"دائن","Balance (Dr - Cr)":"الرصيد","Against Account":"الحساب المقابل","Opening Qty":"كمية أول المدة","In Qty":"وارد","Out Qty":"صادر","Stock UOM":"الوحدة","Invoiced Amount":"المفوتر","Age (Days)":"العمر (أيام)","0-30":"0-30","31-60":"31-60","61-90":"61-90","91-120":"91-120","120-Above":"أكثر من 120","Posting Time":"الوقت","Qty":"الكمية","Rate":"السعر","Amount":"المبلغ","UOM":"الوحدة","Description":"الوصف","Tax Id":"الرقم الضريبي","Receivable Account":"حساب المدينين","Payable Account":"حساب الدائنين","Voucher Subtype":"النوع","Sales Invoice":"فاتورة المبيعات","Purchase Invoice":"فاتورة المشتريات"};
function colLabel(l){ return AMY.lang==="ar" && COLAR[l]? COLAR[l] : l }
function parseCol(c){
  if(typeof c!=="string") return {label:colLabel(c.label||c.fieldname), f:c.fieldname, type:c.fieldtype||"Data", options:c.options, width:c.width};
  var p=c.split(":"), ty=(p[1]||"Data").split("/");
  return {label:colLabel(p[0]), f:p[0], type:ty[0], options:ty[1], width:p[2]};
}
V.report = function(slug, root){
  var rc = AMY.cfg.reports[slug]; if(!rc){ root.appendChild(AMY.emptyBox(t("notFound"))); return }
  AMY.setTitle(lb(rc.label));
  var today = new Date().toISOString().slice(0,10), ms = today.slice(0,8)+"01", vals={};
  var defs = {today:today, monthStart:ms, yearStart:today.slice(0,4)+"-01-01", company:AMY.boot.company};
  var fbox = h("div",{class:"fgrid",style:"grid-template-columns:repeat(auto-fit,minmax(180px,1fr))"}), out = h("div");
  (rc.filters||[]).forEach(function(f){
    vals[f.f] = f.def in defs ? defs[f.def] : (f.def!=null? f.def : "");
    var c;
    if(f.t==="date"){ c = h("input",{class:"in",type:"date",value:vals[f.f]}); c.addEventListener("change",function(){ vals[f.f]=c.value }) }
    else if(f.t==="link"){ var lk = AMY.link({doctype:f.dt,value:vals[f.f],onChange:function(v){ vals[f.f]=v }}); c=lk }
    else if(f.t==="select"){ c = h("select",{class:"sel"}, f.opts.map(function(o){ return h("option",{value:o[0],text:lb(o[1])}) })); c.value=vals[f.f]; c.addEventListener("change",function(){ vals[f.f]=c.value }) }
    else { c = h("input",{class:"in",type:"text",value:vals[f.f]}); c.addEventListener("input",function(){ vals[f.f]=c.value }) }
    fbox.appendChild(h("div",{class:"field"}, h("label",{text:lb(f.l)}), c));
  });
  var runBtn = h("button",{class:"btn p",type:"button",onclick:run}, AMY.icon("rep"), t("run"));
  var csvBtn = h("button",{class:"btn g",type:"button",onclick:function(){ csv() }}, AMY.icon("download"), t("export")), prBtn = h("button",{class:"btn g",type:"button",onclick:function(){ window.print() }}, AMY.icon("print"), t("print"));
  root.appendChild(AMY.pageHeader({title:lb(rc.label), sub:rc.sub?lb(rc.sub):"", crumbs:[{text:AMY.lang==="ar"?"التقارير":"Reports",href:"#/reports"},{text:lb(rc.label)}], actions:[prBtn, csvBtn, runBtn]}));
  root.appendChild(h("div",{class:"card noprint"}, fbox)); root.appendChild(h("div",{class:"mt"}, out));
  var last=null;
  function run(){
    AMY.clear(out); out.appendChild(h("div",{class:"card"},h("div",{class:"sk",style:"width:50%"}),h("div",{class:"sk",style:"width:90%;margin-top:14px"}),h("div",{class:"sk",style:"width:70%;margin-top:14px"})));
    var f = {}; for(var k in vals) if(vals[k]!=="" && vals[k]!=null) f[k]=vals[k];
    if(rc.extra) for(var e in rc.extra) f[e]=rc.extra[e];
    AMY.call("frappe.desk.query_report.run",{report_name:rc.name,filters:f}).then(function(r){
      last = r; AMY.clear(out);
      var cols = (r.columns||[]).map(parseCol).filter(function(c){ return !c.hidden });
      var rows = (r.result||[]).filter(function(x){ return x!=null });
      if(!rows.length){ out.appendChild(h("div",{class:"card"},AMY.emptyBox(t("noData"),""))); return }
      var isNum = function(c){ return /Currency|Float|Int|Percent/.test(c.type) };
      var get = function(row,c,i){ return Array.isArray(row)? row[i] : row[c.f] };
      var sortI = -1, sortD = 1, q = "";
      var kp = h("div",{class:"rkpi"}), box = h("div"), qi = h("input",{class:"in",type:"search",placeholder:AMY.lang==="ar"?"بحث في النتائج":"Filter results",style:"max-width:280px"}), tmq;
      qi.addEventListener("input",function(){ clearTimeout(tmq); tmq=setTimeout(function(){ q=qi.value.trim().toLowerCase(); paintTable() },150) });
      /* summary strip: row count plus the totals of the first money columns */
      kp.appendChild(h("div",null,h("span",{text:t("rows")}),h("b",{class:"num",text:AMY.num(rows.length,0)})));
      var shownK = 0;
      cols.forEach(function(c,i){
        if(c.type!=="Currency" || shownK>=3) return;
        var tot = rows.reduce(function(a,r){ return a+(Number(get(r,c,i))||0) },0);
        kp.appendChild(h("div",null,h("span",{text:c.label}),h("b",{class:"num",text:AMY.num(tot,2)}))); shownK++;
      });
      out.appendChild(kp);
      out.appendChild(h("div",{class:"rbar noprint"},qi,h("span",{class:"sp"})));
      out.appendChild(box);
      function paintTable(){
        AMY.clear(box);
        var list = rows.map(function(r,ix){ return {r:r,ix:ix} });
        if(q) list = list.filter(function(o){ return cols.some(function(c,i){ var v = get(o.r,c,i); return v!=null && String(v).toLowerCase().indexOf(q)>=0 }) });
        if(sortI>=0){ var sc = cols[sortI]; list.sort(function(x,y){ var a=get(x.r,sc,sortI), b=get(y.r,sc,sortI); if(isNum(sc)) return ((Number(a)||0)-(Number(b)||0))*sortD; return String(a==null?"":a).localeCompare(String(b==null?"":b))*sortD }) }
        var th = h("tr"); cols.forEach(function(c,i){ th.appendChild(h("th",{class:(isNum(c)?"end ":"")+"srt"+(sortI===i?" on":""),onclick:function(){ if(sortI===i) sortD=-sortD; else { sortI=i; sortD=1 } paintTable() }},c.label,sortI===i? h("i",{class:"sa",text:sortD>0?"▲":"▼"}) : null)) });
        var tb = h("tbody"), sums = cols.map(function(){ return 0 });
        list.slice(0,500).forEach(function(o){
          var row = o.r, isArr = Array.isArray(row), tr=h("tr");
          cols.forEach(function(c,i){
            var v = isArr? row[i] : row[c.f], num = isNum(c);
            if(c.type==="Currency" && v!=null && v!=="") sums[i] += Number(v)||0;
            var td = h("td",{class:num?"num end":""});
            if(v==null||v==="") td.appendChild(h("span",{class:"mut",text:"—"}));
            else if(c.type==="Currency"){ var nv = Number(v); td.appendChild(h("span",{class:nv<0?"neg":"",text:AMY.num(v,2)})) }
            else if(c.type==="Float"||c.type==="Percent") td.appendChild(document.createTextNode(AMY.num(v,3)));
            else if(c.type==="Int") td.appendChild(document.createTextNode(AMY.num(v,0)));
            else if(c.type==="Date") td.appendChild(document.createTextNode(AMY.date(v)));
            else {
              var ldt = c.type==="Link"? c.options : (c.type==="Dynamic Link"? (function(){ var k = cols.findIndex(function(z){ return z.f===c.options }); return k>=0? (isArr? row[k] : row[c.options]) : "" })() : ""),
                  lc = ldt && AMY.cfg.docs[ldt], lp = ldt && AMY.boot.perms[ldt], sv = typeof v==="object"? "" : String(v);
              if(lc && lp && lp.read && sv) td.appendChild(h("a",{class:"xl-link",href:"#/"+lc.slug+"/"+encodeURIComponent(sv),text:sv}));
              else td.appendChild(document.createTextNode(sv));
            }
            tr.appendChild(td);
          });
          tb.appendChild(tr);
        });
        var hasSum = cols.some(function(c){ return c.type==="Currency" });
        var tf = hasSum && list.length<=500 ? h("tfoot",null,h("tr",null,cols.map(function(c,i){ return h("td",{class:c.type==="Currency"?"num end":"",text:c.type==="Currency"? AMY.num(sums[i],2) : (i===0? (AMY.lang==="ar"?"الإجمالي":"Total") : "")}) }))) : null;
        box.appendChild(h("div",{class:"card flush rpt"}, h("div",{class:"scroll"}, h("table",{class:"tbl"}, h("thead",null,th), tb, tf)),
          h("div",{class:"foot"},h("span",{text:list.length+" "+t("rows")+(list.length>500?" ("+(AMY.lang==="ar"?"أول 500":"first 500")+")":"")}))));
      }
      paintTable();
    }).catch(function(e){ AMY.clear(out); out.appendChild(h("div",{class:"err",text:e.message||t("err")})); AMY.fail(e) });
  }
  function csv(){
    if(!last) return;
    var cols=(last.columns||[]).map(parseCol), lines=[cols.map(function(c){return '"'+String(c.label).replace(/"/g,'""')+'"'}).join(",")];
    (last.result||[]).forEach(function(row){ if(!row) return; var isArr=Array.isArray(row);
      lines.push(cols.map(function(c,i){ var v=isArr?row[i]:row[c.f]; var t = String(v==null?"":v); if(/^[=+\-@\t\r]/.test(t) && isNaN(Number(t))) t = "'"+t; return '"'+t.replace(/"/g,'""')+'"' }).join(",")) });
    var a=h("a",{href:URL.createObjectURL(new Blob(["﻿"+lines.join("\n")],{type:"text/csv;charset=utf-8"})),download:rc.name+".csv"}); document.body.appendChild(a); a.click(); a.remove();
  }
  run();
};
V.reportsHub = function(root){
  var ar = AMY.lang==="ar";
  AMY.setTitle(ar?"التقارير":"Reports");
  root.appendChild(AMY.pageHeader({title:ar?"التقارير":"Reports", sub:ar?"اختر تقريرًا لعرضه أو طباعته أو تصديره.":"Pick a report to view, print or export."}));
  if(AMY.boot.perms["Sales Invoice"] && AMY.boot.perms["Sales Invoice"].read && AMY.boot.perms["Purchase Invoice"] && AMY.boot.perms["Purchase Invoice"].read){
    root.appendChild(h("a",{class:"rfeat",href:"#/vat"}, h("div",null,h("b",{text:ar?"الإقرار الضريبي":"VAT return"}),h("span",{text:ar?"ضريبة المخرجات والمدخلات وصافي المستحق للهيئة، جاهز للمراجعة والتقديم.":"Output and input VAT and the net due to ZATCA, ready to review and file."})),
      h("span",{class:"go"},ar?"افتح الإقرار":"Open the return",AMY.icon(ar?"chevL":"chevR"))));
  }
  var groups = [
    ["sales",ar?"المبيعات والمشتريات":"Sales & purchases",["sales-register","purchase-register","receivable","payable"]],
    ["acc",ar?"المحاسبة":"Accounting",["profit-loss","general-ledger"]],
    ["stock",ar?"المخزون":"Stock",["stock-balance"]]];
  var used = {};
  groups.forEach(function(g){
    var ks = g[2].filter(function(k){ return AMY.cfg.reports[k] }); if(!ks.length) return;
    root.appendChild(h("h3",{class:"rh",text:g[1]}));
    var hub=h("div",{class:"hub"});
    ks.forEach(function(k){ used[k]=1; var r=AMY.cfg.reports[k];
      hub.appendChild(h("button",{class:"hubi",type:"button",onclick:function(){ AMY.go("/report/"+k) }}, h("span",{class:"chip"},AMY.icon(r.icon||"rep")), h("div",null,h("b",{text:lb(r.label)}),h("span",{class:"d",text:lb(r.sub||"")})))) });
    root.appendChild(hub);
  });
  var rest = Object.keys(AMY.cfg.reports).filter(function(k){ return !used[k] });
  if(rest.length){ var hb=h("div",{class:"hub",style:"margin-top:34px"}); rest.forEach(function(k){ var r=AMY.cfg.reports[k]; hb.appendChild(h("button",{class:"hubi",type:"button",onclick:function(){ AMY.go("/report/"+k) }}, h("span",{class:"chip"},AMY.icon(r.icon||"rep")), h("div",null,h("b",{text:lb(r.label)}),h("span",{class:"d",text:lb(r.sub||"")})))) }); root.appendChild(hb) }
};

/* =============================================================== USERS */
var ROLES = [
 ["admin",["مدير النظام","Administrator"],["كل الصلاحيات بما فيها المستخدمين والإعدادات","Full access including users and settings"]],
 ["manager",["مدير","Manager"],["المبيعات والمشتريات والمخزون والأصناف","Sales, purchasing, stock and items"]],
 ["sales",["مبيعات","Sales"],["فواتير المبيعات والعملاء","Sales invoices and customers"]],
 ["cashier",["كاشير","Cashier"],["نقاط البيع وفواتير المبيعات","POS and sales invoices"]],
 ["purchasing",["مشتريات","Purchasing"],["فواتير المشتريات والموردين","Purchase invoices and suppliers"]],
 ["warehouse",["أمين مستودع","Storekeeper"],["المخزون والأصناف والجرد","Stock, items and counts"]],
 ["accountant",["محاسب","Accountant"],["القيود والمدفوعات والتقارير المالية","Journals, payments and financial reports"]]
];
function roleLabel(k){ var r=ROLES.filter(function(x){return x[0]===k})[0]; return r? lb(r[1]) : (AMY.lang==="ar"?"مخصص":"Custom") }
V.users = function(root){
  AMY.setTitle(AMY.lang==="ar"?"المستخدمون والصلاحيات":"Users & roles");
  var body = h("tbody"), card = h("div",{class:"card flush"});
  root.appendChild(AMY.pageHeader({title:AMY.lang==="ar"?"المستخدمون والصلاحيات":"Users & roles",
    sub:AMY.lang==="ar"?"أضف فريقك وحدد ما يستطيع كل شخص رؤيته وفعله.":"Add your team and choose what each person can see and do.",
    actions:[h("button",{class:"btn p",type:"button",onclick:function(){ edit(null) }}, AMY.icon("plus"), AMY.lang==="ar"?"مستخدم جديد":"New user")]}));
  card.appendChild(h("div",{class:"scroll"}, h("table",{class:"tbl"}, h("thead",null,h("tr",null,[AMY.lang==="ar"?"المستخدم":"User",AMY.lang==="ar"?"الدور":"Role",AMY.lang==="ar"?"الحالة":"Status",AMY.lang==="ar"?"آخر دخول":"Last sign-in"].map(function(x){ return h("th",{text:x}) }))), body)));
  root.appendChild(card);
  function load(){
    AMY.clear(body); for(var i=0;i<4;i++) body.appendChild(h("tr",null,h("td",{colspan:4},h("div",{class:"sk",style:"width:60%"}))));
    AMY.rest("list_users",{}).then(function(us){
      AMY.clear(body);
      us.forEach(function(u){
        var ini=(u.full_name||u.name).trim().charAt(0).toUpperCase();
        body.appendChild(h("tr",{class:"go",onclick:function(){ edit(u) }},
          h("td",null,h("div",{style:"display:flex;gap:12px;align-items:center"}, h("span",{class:"av",style:"cursor:default;width:36px;height:36px;flex:none",text:ini}), h("div",null,h("div",{class:"nm",text:u.full_name||u.name}),h("div",{class:"mut",style:"font-size:13px;direction:ltr;text-align:start",text:u.name})))),
          h("td",null,h("span",{class:"pill info",text:roleLabel(u.amy_role)})),
          h("td",null,AMY.statusPill(u.enabled?"Active":"Inactive")),
          h("td",{class:"mut",text:u.last_login? AMY.date(u.last_login) : "—"})));
      });
    }).catch(function(e){ AMY.clear(body); body.appendChild(h("tr",null,h("td",{colspan:4},h("div",{class:"err",text:e.message||t("err")})))); AMY.fail(e) });
  }
  function edit(u){
    var isNew=!u, data = u? {email:u.name,first_name:u.first_name||"",last_name:u.last_name||"",mobile_no:u.mobile_no||"",amy_role:u.amy_role==="custom"?"":u.amy_role,enabled:u.enabled,language:u.language||"ar"} : {email:"",first_name:"",last_name:"",mobile_no:"",amy_role:"sales",enabled:1,language:"ar",password:""};
    AMY.drawer(isNew? (AMY.lang==="ar"?"مستخدم جديد":"New user") : (u.full_name||u.name), function(dw){
      function fld(label, el){ return h("div",{class:"field"},h("label",{text:label}),el) }
      function inp(k,type,ro){ var e=h("input",{class:"in",type:type||"text",value:data[k]||"",disabled:ro,autocomplete:"off"}); if(type==="email"||k==="mobile_no") e.setAttribute("dir","ltr"); e.addEventListener("input",function(){ data[k]=e.value }); return e }
      var roleBox = h("div",{style:"display:flex;flex-direction:column;gap:8px"});
      function drawRoles(){ AMY.clear(roleBox); ROLES.forEach(function(r){
        var on = data.amy_role===r[0];
        roleBox.appendChild(h("button",{type:"button",class:"hubi",style:"padding:12px 14px;"+(on?"border-color:var(--brand2);box-shadow:0 0 0 4px var(--brand-r)":""),onclick:function(){ data.amy_role=r[0]; drawRoles() }},
          h("div",null,h("b",{text:lb(r[1])}),h("span",{class:"d",text:lb(r[2])})))) }) }
      drawRoles();
      var en = h("label",{class:"chk"}, h("input",{type:"checkbox",checked:!!Number(data.enabled),onchange:function(e){ data.enabled=e.target.checked?1:0 }}), h("span",{text:AMY.lang==="ar"?"الحساب مفعّل":"Account is active"}));
      dw.body.appendChild(fld(AMY.lang==="ar"?"البريد الإلكتروني (اسم الدخول)":"Email (sign-in name)", inp("email","email",!isNew)));
      dw.body.appendChild(h("div",{class:"fgrid",style:"grid-template-columns:1fr 1fr"}, fld(AMY.lang==="ar"?"الاسم الأول":"First name",inp("first_name")), fld(AMY.lang==="ar"?"اسم العائلة":"Last name",inp("last_name"))));
      dw.body.appendChild(fld(AMY.lang==="ar"?"الجوال":"Mobile", inp("mobile_no","tel")));
      dw.body.appendChild(fld(isNew? (AMY.lang==="ar"?"كلمة المرور":"Password") : (AMY.lang==="ar"?"كلمة مرور جديدة (اتركها فارغة للإبقاء)":"New password (leave blank to keep)"), inp("password","password")));
      dw.body.appendChild(fld(AMY.lang==="ar"?"الدور":"Role", roleBox));
      dw.body.appendChild(en);
      dw.footer.appendChild(h("div",{style:"display:contents"},
        h("button",{class:"btn g",type:"button",onclick:dw.close,text:t("close")}),
        h("button",{class:"btn p",type:"button",onclick:function(ev){
          var b=ev.currentTarget; b.disabled=true;
          AMY.rest("save_user",{data:data}).then(function(){ AMY.toast(t("saved"),"ok"); dw.close(); load() }).catch(function(e){ b.disabled=false; AMY.fail(e) });
        },text:t("save")})));
    });
  }
  load();
};

/* =============================================================== SETTINGS HUB */
V.settings = function(root){
  var ar = AMY.lang==="ar";
  AMY.setTitle(ar?"الإعدادات":"Settings");
  root.appendChild(AMY.pageHeader({title:ar?"الإعدادات":"Settings", sub:ar?"كل ما يخص شركتك وفريقك في مكان واحد.":"Everything about your company and team in one place."}));
  var items = AMY.cfg.settings, hub = h("div",{class:"hub"}), P = AMY.boot.perms;
  items.forEach(function(it){
    if(it.dt && !(P[it.dt] && P[it.dt].read)) return;
    if(it.admin && !AMY.boot.is_admin) return;
    if(it.app && !AMY.boot.apps[it.app]) return;
    hub.appendChild(h("button",{class:"hubi",type:"button",onclick:function(){ if(it.href && it.href.charAt(0)==="/"){ location.href=it.href } else AMY.go(it.to==="company"? "/companies/"+encodeURIComponent(AMY.boot.company) : it.to) }},
      h("span",{class:"chip"},AMY.icon(it.icon)), h("div",null,h("b",{text:lb(it.l)}),h("span",{class:"d",text:lb(it.d)}))));
  });
  root.appendChild(hub);
};
})();
