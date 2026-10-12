/* AMY console - list and form engines (driven by AMY.cfg.docs) */
(function(){
"use strict";
var AMY = window.AMY, h = AMY.h, lb = AMY.lb, t = AMY.t;
var V = AMY.views;

function cfgOf(dt){ return AMY.cfg.docs[dt] }
function canCreate(dt){ var p = AMY.boot.perms[dt]; return !!(p && p.create) }
function route(cfg, name){ return "/"+cfg.slug+(name? "/"+encodeURIComponent(name) : "") }

AMY.pageHeader = function(o){
  var left = h("div",null,
    o.crumbs? h("div",{class:"crumb"}, o.crumbs.map(function(c,i){
      return [i? AMY.icon(AMY.lang==="ar"?"chevL":"chevR") : null, c.href? h("a",{href:c.href,text:c.text}) : h("span",{text:c.text})] })) : null,
    h("h1",null, o.title, o.pill? h("span",{style:"margin-inline-start:12px;vertical-align:middle;font-size:14px"}, o.pill) : null),
    o.sub? h("p",{text:o.sub}) : null);
  return h("div",{class:"ph"}, left, h("div",{class:"acts"}, o.actions||[]));
};
AMY.emptyBox = function(title, sub){ return h("div",{class:"empty"}, h("b",{text:title}), h("span",{text:sub||""})) };

/* =============================================================== LIST */
V.list = function(dt, root, p){
  var cfg = cfgOf(dt), st = {page:0, size:20, search:"", chip:0, sort:cfg.order||"modified desc", total:0};
  var fields = ["name","docstatus"].concat(cfg.fields||[]);
  cfg.cols.forEach(function(c){ if(fields.indexOf(c.f)<0) fields.push(c.f) });
  AMY.setTitle(lb(cfg.plural));
  var actions = [];
  if(cfg.listActions) cfg.listActions.forEach(function(a){ actions.push(a()) });
  if(canCreate(dt) && !cfg.noNew) actions.push(h("a",{class:"btn p",href:"#"+route(cfg,"new")}, AMY.icon("plus"), lb(cfg.newLabel||[ "جديد","New"])));
  root.appendChild(AMY.pageHeader({title:lb(cfg.plural), sub:cfg.sub?lb(cfg.sub):"", actions:actions}));
  var body = h("tbody"), thead = h("thead"), foot = h("div",{class:"foot"}), card = h("div",{class:"card flush"});
  var search = h("input",{class:"in",type:"search",placeholder:t("search")+"…","aria-label":t("search")});
  var timer; search.addEventListener("input",function(){ clearTimeout(timer); timer=setTimeout(function(){ st.search=search.value.trim(); st.page=0; load() },300) });
  var chipsEl = h("div",{class:"chips"});
  function drawChips(){
    AMY.clear(chipsEl);
    (cfg.chips||[]).forEach(function(c,i){
      chipsEl.appendChild(h("button",{class:"cp"+(st.chip===i?" on":""),type:"button",onclick:function(){ st.chip=i; st.page=0; drawChips(); load() },text:lb(c.l)}));
    });
  }
  card.appendChild(h("div",{class:"tools"}, h("div",{class:"search"}, AMY.icon("search"), search), chipsEl));
  card.appendChild(h("div",{class:"scroll"}, h("table",{class:"tbl"}, thead, body)));
  card.appendChild(foot); root.appendChild(card);
  function open(row){ if(cfg.open) cfg.open(row); else AMY.go(route(cfg,row.name)) }
  function drawHead(){
    AMY.clear(thead); var tr = h("tr");
    cfg.cols.forEach(function(c){
      var sortable = c.sort!==false && c.t!=="status" && c.t!=="check";
      var th = h("th",{class:(sortable?"srt ":"")+(c.end?"end":""),style:c.w?"width:"+c.w:""}, lb(c.l));
      if(sortable) th.addEventListener("click",function(){ var f=c.sf||c.f; st.sort = st.sort===f+" asc" ? f+" desc" : f+" asc"; load() });
      tr.appendChild(th);
    });
    thead.appendChild(tr);
  }
  function skeleton(){
    AMY.clear(body);
    for(var i=0;i<6;i++){ var tr=h("tr"); cfg.cols.forEach(function(){ tr.appendChild(h("td",null,h("div",{class:"sk",style:"width:"+(50+Math.random()*40)+"%"}))) }); body.appendChild(tr) }
  }
  function load(){
    skeleton();
    var filters = {}, chip = (cfg.chips||[])[st.chip];
    if(chip && chip.filters) filters = JSON.parse(JSON.stringify(chip.filters));
    var bf = typeof cfg.baseFilters==="function"? cfg.baseFilters() : cfg.baseFilters; if(bf) for(var k in bf) filters[k]=bf[k];
    AMY.rest("list_docs",{doctype:dt,fields:fields,filters:filters,search:st.search,search_fields:cfg.search||["name"],
      order_by:st.sort,start:st.page*st.size,limit:st.size}).then(function(r){
      st.total = r.total; AMY.clear(body);
      if(!r.rows.length){
        var td = h("td",{colspan:cfg.cols.length}, AMY.emptyBox(st.search? t("noData") : t("noData"), st.search? "" : t("noDataSub")));
        body.appendChild(h("tr",null,td));
      }
      r.rows.forEach(function(row){
        var tr = h("tr",{class:"go",tabindex:"0",onclick:function(){ open(row) },onkeydown:function(e){ if(e.key==="Enter") open(row) }});
        cfg.cols.forEach(function(c,i){
          var td = h("td",{class:(c.t==="money"||c.t==="float"||c.t==="int"?"num end ":"")+(c.end?"end ":"")+(i===0?"nm":"")});
          if(c.render) td.appendChild(c.render(row)); else td.appendChild(AMY.fmt(c.t||"text", row[c.f], row));
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      drawFoot();
    }).catch(function(e){ AMY.clear(body); body.appendChild(h("tr",null,h("td",{colspan:cfg.cols.length},h("div",{class:"err",text:e.message||t("err")})))); AMY.fail(e) });
  }
  function drawFoot(){
    AMY.clear(foot);
    var from = st.total? st.page*st.size+1 : 0, to = Math.min(st.total,(st.page+1)*st.size), pages = Math.ceil(st.total/st.size);
    foot.appendChild(h("span",null, from+"–"+to+" "+t("of")+" "+st.total+" "+t("rows")));
    foot.appendChild(h("div",{class:"pager"},
      h("button",{class:"btn g s",type:"button",disabled:st.page<=0,onclick:function(){ st.page--; load() }}, AMY.icon(AMY.lang==="ar"?"chevR":"chevL"), t("prev")),
      h("span",{class:"num",text:(st.page+1)+" / "+Math.max(1,pages)}),
      h("button",{class:"btn g s",type:"button",disabled:st.page+1>=pages,onclick:function(){ st.page++; load() }}, t("next"), AMY.icon(AMY.lang==="ar"?"chevL":"chevR"))));
  }
  drawChips(); drawHead(); load();
};

/* =============================================================== FORM */
var KEYS_ITEM = ["item_name","description","uom","stock_uom","conversion_factor","price_list_rate","rate","discount_percentage","warehouse","income_account","expense_account","cost_center","item_tax_template"];

V.form = function(dt, name, p, root){
  var cfg = cfgOf(dt), isNew = name==="new";
  AMY.setTitle(lb(cfg.label));
  root.appendChild(h("div",{class:"card"}, h("div",{class:"sk",style:"width:30%;height:22px"}), h("div",{class:"sk",style:"width:80%;margin-top:18px"}), h("div",{class:"sk",style:"width:60%;margin-top:12px"})));
  var load;
  if(isNew){
    if(p.q.make==="return" || p.q.make==="pay" || p.q.make==="from"){
      load = (p.q.make==="from"? AMY.rest("make_from",{doctype:p.q.dt,name:p.q.src,target:dt}) : AMY.rest(p.q.make==="return"?"make_return":"make_payment",{doctype:p.q.dt||dt,name:p.q.src})).then(function(d){ return {doc:d,can:{read:1,write:1,create:1}} });
    } else if(p.q.copy){
      load = AMY.rest("get_doc",{doctype:dt,name:p.q.copy}).then(function(r){
        var d=r.doc; ["name","docstatus","creation","modified","owner","modified_by","amended_from","status","outstanding_amount","paid_amount"].forEach(function(k){ delete d[k] });
        (cfg.tables||[]).forEach(function(tb){ (d[tb.f]||[]).forEach(function(r){ delete r.name; delete r.parent }) });
        if(d.posting_date!==undefined) d.posting_date = new Date().toISOString().slice(0,10); if(d.transaction_date!==undefined) d.transaction_date = new Date().toISOString().slice(0,10); return {doc:d,can:{read:1,write:1,create:1}} });
    } else {
      load = AMY.rest("new_defaults",{doctype:dt}).then(function(d){
        (cfg.tables||[]).forEach(function(tb){ d[tb.f]=d[tb.f]||[] });
        if(cfg.defaults) cfg.defaults(d, p.q);
        return {doc:d,can:{read:1,write:1,create:1}} });
    }
  } else load = AMY.rest("get_doc",{doctype:dt,name:name});
  load.then(function(r){ AMY.clear(root); build(r.doc, r.can, root) })
    .catch(function(e){ AMY.clear(root); root.appendChild(AMY.pageHeader({title:lb(cfg.plural),crumbs:[{text:lb(cfg.plural),href:"#"+route(cfg)}]}));
      root.appendChild(h("div",{class:"card"}, AMY.emptyBox(t("notFound"), e.message||t("notFoundSub")))); AMY.fail(e) });

  function build(doc, can, root){
    var submittable = !!cfg.submittable;
    var ro = !isNew && (submittable ? doc.docstatus!==0 : !can.write);
    var saved = isNew? null : doc.name;
    var ctl = {}, wraps = {}, secs = [], previewT, totalsEl = h("div"), tableEls = {};
    var form = {doc:doc, ro:ro, isNew:isNew, can:can, set:setVal, ctl:ctl, preview:schedulePreview, cfg:cfg, redraw:function(f){ if(tableEls[f]) tableEls[f].redraw() }};

    /* ----- controls ----- */
    function changed(f){
      if(cfg.onChange) cfg.onChange(f, doc, form);
      updateDeps();
    }
    function setVal(f, v){ doc[f]=v; if(ctl[f] && ctl[f].set) ctl[f].set(v); updateDeps() }
    function control(fd, container, rowObj, rowRender){
      var obj = rowObj || doc, f = fd.f, v = obj[f];
      var dis = ro || fd.ro || (fd.newOnly && !isNew) || (fd.roIf && fd.roIf(doc));
      var el, api = {};
      var upd = function(val){ obj[f]=val; if(rowObj){ if(fd.onRow) fd.onRow(val, obj, form); } else changed(f) };
      switch(fd.t){
       case "check":
        var cb = h("input",{type:"checkbox",disabled:dis}); cb.checked = !!Number(v||0);
        cb.addEventListener("change",function(){ upd(cb.checked?1:0) });
        el = h("label",{class:"chk"}, cb, h("span",{text:lb(fd.l)})); api.set=function(x){ cb.checked=!!Number(x||0) }; api.inline = true; break;
       case "text":
        el = h("textarea",{class:"ta",disabled:dis}); el.value = v||"";
        el.addEventListener("input",function(){ upd(el.value) }); api.set=function(x){ el.value=x||"" }; break;
       case "select":
        el = h("select",{class:"sel",disabled:dis});
        (fd.opts||[]).forEach(function(o){ var val = Array.isArray(o)?o[0]:o, label = Array.isArray(o)? lb(o[1]) : o; el.appendChild(h("option",{value:val,text:label})) });
        el.value = v==null? "" : v; if(v==null && fd.opts && !fd.blank){ var o0=fd.opts[0]; obj[f]= Array.isArray(o0)?o0[0]:o0; el.value=obj[f] }
        el.addEventListener("change",function(){ upd(el.value) }); api.set=function(x){ el.value=x==null?"":x }; break;
       case "link":
        el = AMY.link({doctype: typeof fd.dt==="function"? function(){ return fd.dt(doc) } : fd.dt, value:v, disabled:dis,
          filters: fd.filters? function(){ return fd.filters(doc, obj) } : null,
          onChange:function(val, it){ upd(val); if(fd.after) fd.after(val, it, obj, form) }});
        api.set=function(x){ el.set(x) }; break;
       case "date":
        el = h("input",{class:"in",type:"date",disabled:dis}); el.value = v? String(v).slice(0,10) : "";
        el.addEventListener("change",function(){ upd(el.value) }); api.set=function(x){ el.value=x?String(x).slice(0,10):"" }; break;
       case "int": case "float": case "money": case "percent":
        el = h("input",{class:"in num",type:"number",step:fd.t==="int"?"1":"any",inputmode:"decimal",disabled:dis,dir:"ltr"});
        el.value = v==null||v===""? "" : v;
        el.addEventListener("input",function(){ upd(el.value===""? null : Number(el.value)) }); api.set=function(x){ el.value=x==null?"":x }; break;
       case "image":
        var img = h("img",{style:"width:84px;height:84px;object-fit:contain;border:1px solid var(--line);border-radius:12px;background:#fff"}), file = h("input",{type:"file",accept:"image/*",class:"hide"});
        var show = function(x){ if(x){ img.src=x; img.classList.remove("hide") } else img.classList.add("hide") }; show(v);
        el = h("div",{style:"display:flex;gap:14px;align-items:center"}, img,
          dis? null : h("div",{style:"display:flex;gap:8px;flex-wrap:wrap"},
            h("button",{class:"btn g s",type:"button",onclick:function(){ file.click() }}, AMY.icon("upload"), t("upload")),
            h("button",{class:"btn g s",type:"button",onclick:function(){ obj[f]=""; show(""); changed(f) }}, t("remove"))), file);
        file.addEventListener("change",function(){ if(!file.files[0]) return;
          AMY.upload(file.files[0],{doctype:dt,fieldname:f}).then(function(r){ obj[f]=r.file_url; show(r.file_url); changed(f) }).catch(AMY.fail) });
        api.set=show; break;
       case "ro":
        el = h("div",{class:"in",style:"display:flex;align-items:center;background:#F6F8FB;overflow:hidden;white-space:nowrap"}); el.appendChild(AMY.fmt(fd.ft||"text", v, obj));
        api.set=function(x){ AMY.clear(el); el.appendChild(AMY.fmt(fd.ft||"text", x, obj)) }; break;
       default:
        el = h("input",{class:"in",type:"text",disabled:dis,autocomplete:"off"}); el.value = v==null?"":v;
        if(fd.dir) el.setAttribute("dir",fd.dir);
        el.addEventListener("input",function(){ upd(el.value) }); api.set=function(x){ el.value=x==null?"":x };
      }
      api.el = el; if(!rowObj) ctl[f] = api;
      return api;
    }
    function fieldWrap(fd){
      var c = control(fd), w = h("div",{class:"field s"+(fd.span||1)});
      if(!c.inline) w.appendChild(h("label",null, lb(fd.l), fd.req? h("span",{class:"rq",text:"*"}) : null));
      w.appendChild(c.el); if(fd.hint) w.appendChild(h("small",{class:"mut",text:lb(fd.hint)}));
      wraps[fd.f] = {el:w, dep:fd.dep}; return w;
    }
    function updateDeps(){ secs.forEach(function(x){ x.el.classList[x.show(doc,isNew)?"remove":"add"]("hide") }); for(var k in wraps){ if(wraps[k].dep) wraps[k].el.classList[wraps[k].dep(doc)?"remove":"add"]("hide") } }

    /* ----- child tables ----- */
    function recalcRow(r){ if(r.qty!=null && r.rate!=null) r.amount = (Number(r.qty)||0)*(Number(r.rate)||0)*(r.discount_percentage? (1-Number(r.discount_percentage)/100):1) }
    function tableControl(tb){
      var rows = doc[tb.f] = doc[tb.f] || [];
      var box = h("div"), tbody = h("tbody"), editable = !ro && !tb.ro, tools = editable && !tb.fixed;
      var tbl = h("table",{class:"itbl"}, h("thead",null, h("tr",null, tb.cols.map(function(c){ return h("th",{style:c.w?"width:"+c.w:"",text:lb(c.l)}) }), (tools||tb.open)? h("th",{style:"width:44px"}) : null)), tbody);
      function addRow(){ var r = tb.newRow? tb.newRow(doc) : {}; rows.push(r); draw(); var first = tbody.lastChild && tbody.lastChild.querySelector("input"); if(first) first.focus() }
      function draw(){
        AMY.clear(tbody);
        rows.forEach(function(r,ri){
          var tr = h("tr");
          tb.cols.forEach(function(c){
            var td = h("td");
            if(c.t==="calc"){
              var span = h("div",{class:"in num",style:"display:flex;align-items:center;background:#F6F8FB",dir:"ltr"}, AMY.money(r[c.f]||0)); r["_"+c.f+"El"]=span; td.appendChild(span);
            } else {
              var cd = Object.assign({}, c, {dt: c.dt, onRow:function(val, row){
                if(c.f==="item_code") return;
                if(["qty","rate","discount_percentage"].indexOf(c.f)>=0){ recalcRow(row); if(row._amountEl) row._amountEl.textContent = AMY.money(row.amount||0); schedulePreview() }
                if(tb.onRowChange) tb.onRowChange(c.f, row, form);
              }, after:function(val, it, row){
                if(c.f==="item_code" && val) itemPicked(row, val, draw);
                else if(tb.afterLink) tb.afterLink(c.f, val, row, form);
              }});
              var ctrl = control(cd, null, r);
              td.appendChild(ctrl.el);
              if(c.f==="item_code" && r._stock!=null) td.appendChild(h("small",{class:"mut",text:(AMY.lang==="ar"?"المتاح: ":"In stock: ")+AMY.num(r._stock)}));
            }
            tr.appendChild(td);
          });
          if(tools) tr.appendChild(h("td",null, h("button",{class:"x",type:"button","aria-label":t("remove"),onclick:function(){ rows.splice(ri,1); draw(); schedulePreview() }}, AMY.icon("x"))));
          else if(tb.open){ var op = tb.open(r); tr.appendChild(h("td",null, op? h("a",{class:"x",href:"#"+op,title:t("openRec")},AMY.icon("chevL")) : null)) }
          tbody.appendChild(tr);
        });
        if(!rows.length) tbody.appendChild(h("tr",null,h("td",{colspan:tb.cols.length+1,class:"mut",style:"text-align:center;padding:22px"},t("noData"))));
      }
      draw();
      box.appendChild(h("div",{class:"scroll"}, tbl));
      if(tools) box.appendChild(h("div",{style:"margin-top:12px"}, h("button",{class:"btn g s",type:"button",onclick:addRow}, AMY.icon("plus"), t("addRow"))));
      tableEls[tb.f] = {redraw:draw};
      return box;
    }
    function itemPicked(row, code, redraw){
      if(!cfg.invoice){ if(cfg.itemPicked) cfg.itemPicked(row, code, doc, redraw); return }
      var party = doc.customer || doc.supplier || doc.party_name;
      AMY.rest("item_details",{item_code:code,doctype:dt,party:party,qty:row.qty||1,warehouse:doc.set_warehouse||null,
        price_list:doc.selling_price_list||doc.buying_price_list||null,currency:doc.currency}).then(function(d){
        KEYS_ITEM.forEach(function(k){ if(d[k]!=null) row[k]=d[k] });
        row.item_code = code; row.qty = row.qty||1; row._stock = d.actual_qty; recalcRow(row); redraw(); schedulePreview();
      }).catch(AMY.fail);
    }

    /* ----- totals ----- */
    function drawTotals(pv){
      AMY.clear(totalsEl);
      var cur = doc.currency || AMY.cur();
      if(!cfg.invoice) return;
      var src = pv || (ro? {net_total:doc.net_total,taxes:(doc.taxes||[]).map(function(x){return {description:x.description,amount:x.tax_amount}}),grand_total:doc.grand_total,discount:doc.discount_amount} : null);
      if(!src){ var s=0; (doc.items||[]).forEach(function(r){ s += Number(r.amount)||0 }); src={net_total:s,taxes:[],grand_total:s} }
      var box = h("div",{class:"tot"});
      box.appendChild(h("div",{class:"r"}, h("span",{text:t("net")}), h("b",{class:"num",text:AMY.money(src.net_total,cur)})));
      (src.taxes||[]).forEach(function(x){ box.appendChild(h("div",{class:"r"}, h("span",{text:x.description||t("tax")}), h("b",{class:"num",text:AMY.money(x.amount,cur)}))) });
      box.appendChild(h("div",{class:"r g"}, h("span",{text:t("grand")}), h("b",{class:"num",text:AMY.money(src.grand_total,cur)})));
      if(ro && doc.outstanding_amount!=null){ box.appendChild(h("div",{class:"r"}, h("span",{text:AMY.lang==="ar"?"المتبقي":"Outstanding"}), h("b",{class:"num",style:Number(doc.outstanding_amount)>0?"color:var(--warn)":"color:var(--ok)",text:AMY.money(doc.outstanding_amount,cur)}))) }
      totalsEl.appendChild(box);
    }
    function schedulePreview(){
      if(!cfg.invoice || ro){ return }
      drawTotals(null); clearTimeout(previewT);
      previewT = setTimeout(function(){
        var rows = (doc.items||[]).filter(function(r){ return r.item_code });
        if(!rows.length) return;
        AMY.rest("preview",{doctype:dt,data:strip(doc)}).then(function(pv){ if(pv){ drawTotals(pv); (doc.items||[]).filter(function(r){return r.item_code}).forEach(function(r,i){ if(pv.rows[i]!=null){ r.amount=pv.rows[i]; if(r._amountEl) r._amountEl.textContent=AMY.money(r.amount) } }) } }).catch(function(){});
      }, 600);
    }

    /* ----- sections ----- */
    var head = AMY.pageHeader({
      crumbs:[{text:lb(cfg.plural),href:"#"+route(cfg)}, {text:isNew? t("new") : (cfg.titleOf? cfg.titleOf(doc) : doc.name)}],
      title: isNew? lb(cfg.newTitle||cfg.label) : (cfg.titleOf? cfg.titleOf(doc) : doc.name),
      pill: !isNew && submittable? AMY.docPill(doc.docstatus) : null,
      sub: !isNew && cfg.subOf? cfg.subOf(doc) : ""});
    root.appendChild(head);
    AMY.setTitle(isNew? lb(cfg.newTitle||cfg.label) : doc.name);
    var errBox = h("div",{class:"err hide"}); root.appendChild(errBox);
    (cfg.sections||[]).forEach(function(sec){
      var card = h("div",{class:"card sec"});
      if(sec.show) secs.push({el:card,show:sec.show});
      if(sec.title) card.appendChild(h("h2",{text:lb(sec.title)}));
      var grid = h("div",{class:"fgrid"});
      sec.fields.forEach(function(fd){
        if(fd.t==="table"){
          var tb = (cfg.tables||[]).filter(function(x){return x.f===fd.f})[0];
          grid.appendChild(h("div",{class:"s4"}, tableControl(tb)));
        } else grid.appendChild(fieldWrap(fd));
      });
      card.appendChild(grid);
      if(sec.totals){ card.appendChild(totalsEl); }
      root.appendChild(card);
    });
    if(cfg.panels) cfg.panels.forEach(function(pn){ if(!isNew) pn(doc, root, form) });
    if(!isNew && AMY.relatedPanel) AMY.relatedPanel(dt, doc, root);
    updateDeps(); drawTotals(null);

    /* ----- action bar ----- */
    var bar = h("div",{class:"bar"}), stEl = h("div",{class:"st"});
    bar.appendChild(stEl);
    function validate(){
      var missing = [];
      function chk(fd, obj){ if(fd.req && (obj[fd.f]==null || obj[fd.f]==="") && (!fd.dep || fd.dep(doc))) missing.push(lb(fd.l)) }
      (cfg.sections||[]).forEach(function(sec){ (sec.fields||[]).forEach(function(fd){ if(fd.t!=="table") chk(fd, doc) }) });
      (cfg.tables||[]).forEach(function(tb){ var n=0; (doc[tb.f]||[]).forEach(function(r){ if(r[tb.key||"item_code"]) n++; tb.cols.forEach(function(c){ if(c.req && r[tb.key||"item_code"]) chk(c, r) }) }); if(tb.min && n<tb.min) missing.push(lb(tb.l)) });
      if(missing.length){ errBox.textContent = (AMY.lang==="ar"?"أكمل الحقول المطلوبة: ":"Complete the required fields: ")+missing.join("، "); errBox.classList.remove("hide"); errBox.scrollIntoView({block:"center",behavior:"smooth"}); return false }
      errBox.classList.add("hide"); return true;
    }
    function strip(d){
      var c = JSON.parse(JSON.stringify(d));
      (cfg.tables||[]).forEach(function(tb){ (c[tb.f]||[]).forEach(function(r){ for(var k in r){ if(k.charAt(0)==="_") delete r[k] } }) });
      return c;
    }
    function doSave(submit){
      if(!validate()) return;
      var go = function(){
        setBusy(true);
        AMY.rest("save_doc",{doctype:dt,data:strip(doc),submit:submit?1:0}).then(function(r){
          AMY.toast(submit? t("submitted") : t("saved"),"ok");
          if(isNew) location.replace("#"+route(cfg,r.doc.name)); else AMY.render();
        }).catch(function(e){ setBusy(false); AMY.fail(e) });
      };
      if(submit) AMY.confirm({title:t("confirmSubmit"),text:t("confirmSubmitSub")}).then(function(ok){ if(ok) go() }); else go();
    }
    function setBusy(b){ bar.querySelectorAll("button").forEach(function(x){ x.disabled=b }) }
    function act(label, icon, cls, fn){ return h("button",{class:"btn "+cls,type:"button",onclick:fn}, icon?AMY.icon(icon):null, label) }
    function afterAct(fn){ setBusy(true); fn().then(function(){ AMY.render() }).catch(function(e){ setBusy(false); AMY.fail(e) }) }

    if(!isNew){
      stEl.appendChild(h("span",{class:"num",text:doc.modified? (AMY.lang==="ar"?"آخر تعديل ":"Edited ")+AMY.date(doc.modified):""}));
    }
    var btns = [];
    if(!isNew && cfg.print){ btns.push(act(t("print"),"print","g",function(){ window.open(["Sales Invoice","Purchase Invoice","Quotation","Sales Order","Purchase Order","Payment Entry"].indexOf(dt)<0? "/printview?doctype="+encodeURIComponent(dt)+"&name="+encodeURIComponent(doc.name)+"&trigger_print=1&no_letterhead=0" : "/amy-print?dt="+encodeURIComponent(dt)+"&name="+encodeURIComponent(doc.name)+"&lang="+AMY.lang,"_blank") })) }
    if(!isNew && canCreate(dt)){ btns.push(act(t("dup"),"copy","g",function(){ AMY.go(route(cfg,"new")+"?copy="+encodeURIComponent(doc.name)) })) }
    if(!isNew && cfg.convert && doc.docstatus===1){
      cfg.convert.forEach(function(c){
        var tc = AMY.cfg.docs[c.to];
        if(!tc || !canCreate(c.to)) return;
        btns.push(act(lb(c.l),c.icon||"sales","p",function(){ AMY.go("/"+tc.slug+"/new?make=from&dt="+encodeURIComponent(dt)+"&src="+encodeURIComponent(doc.name)) }));
      });
    }
    if(!isNew && cfg.invoice && !cfg.isOrder && doc.docstatus===1 && !doc.is_return && canCreate(dt)){
      btns.push(act(t("returnDoc"),"undo","g",function(){ AMY.go(route(cfg,"new")+"?make=return&dt="+encodeURIComponent(dt)+"&src="+encodeURIComponent(doc.name)) }));
    }
    if(!isNew && cfg.invoice && doc.docstatus===1 && Number(doc.outstanding_amount)>0 && AMY.boot.perms["Payment Entry"] && AMY.boot.perms["Payment Entry"].create){
      btns.push(act(t("makePay"),"cash","p",function(){ AMY.go("/payments/new?make=pay&dt="+encodeURIComponent(dt)+"&src="+encodeURIComponent(doc.name)) }));
    }
    if(!isNew && submittable && doc.docstatus===1 && can.cancel){
      btns.push(act(t("cancel"),"x","d",function(){ AMY.confirm({title:t("confirmCancel"),text:t("confirmCancelSub"),danger:1}).then(function(ok){ if(ok) afterAct(function(){ return AMY.rest("cancel_doc",{doctype:dt,name:doc.name}).then(function(){ AMY.toast(t("cancelled"),"ok") }) }) }) }));
    }
    if(!isNew && (!submittable || doc.docstatus!==1) && can.delete && !cfg.noDelete){
      btns.push(act(t("del"),"trash","d",function(){ AMY.confirm({title:t("confirmDel"),text:t("confirmDelSub"),danger:1}).then(function(ok){ if(ok) setBusy(true), AMY.rest("delete_doc",{doctype:dt,name:doc.name}).then(function(){ AMY.toast(t("deleted"),"ok"); location.hash="#"+route(cfg) }).catch(function(e){ setBusy(false); AMY.fail(e) }) }) }));
    }
    if(!ro){
      if(submittable){
        btns.push(act(t("save"),"check","g",function(){ doSave(false) }));
        btns.push(act(t("saveSubmit"),"check","p",function(){ doSave(true) }));
      } else btns.push(act(t("save"),"check","p",function(){ doSave(false) }));
    }
    btns.forEach(function(b){ bar.appendChild(b) });
    root.appendChild(bar);
    if(cfg.afterBuild) cfg.afterBuild(doc, form, root);
    schedulePreview();
  }
};
})();
