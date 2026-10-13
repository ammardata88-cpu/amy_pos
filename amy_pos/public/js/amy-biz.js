/* AMY console - business types and the scenarios they need:
   retail, restaurant, pharmacy, wholesale (units, batches and expiry, bundles, credit and payment terms) */
(function(){
"use strict";
var AMY = window.AMY, docs = AMY.cfg.docs, h = AMY.h, V = AMY.views;
function L(a, e){ return AMY.lang === "ar" ? a : e }
function ind(){ return (AMY.boot && AMY.boot.industry) || "retail" }
var ALL = ["الكل", "All"];
function iso(d){ return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) }
function plus(n){ var d = new Date(); d.setDate(d.getDate() + n); return iso(d) }

/* ---------- Item: units, reorder, batches, item tax ---------- */
(function(){
  var it = docs["Item"]; if(!it) return;
  var first = it.sections[0].fields;
  first.splice(5, 0,
    {f:"brand", t:"link", dt:"Brand", l:["الماركة","Brand"]},
    {f:"max_discount", t:"percent", l:["أقصى خصم %","Max discount %"], hint:["يمنع الكاشير من تجاوز هذه النسبة","Stops cashiers going beyond this"]});
  var at = it.sections.length - 1; /* before barcodes */
  it.sections.splice(at, 0,
    {title:["وحدات القياس والتحويل","Units & conversion"], fields:[
      {f:"sales_uom", t:"link", dt:"UOM", l:["وحدة البيع الافتراضية","Default selling unit"]},
      {f:"purchase_uom", t:"link", dt:"UOM", l:["وحدة الشراء الافتراضية","Default buying unit"]},
      {t:"table", f:"uoms"}]},
    {title:["حد الطلب","Reorder level"], show:function(d){ return Number(d.is_stock_item) }, fields:[{t:"table", f:"reorder_levels"}]},
    {title:["الدفعات وتاريخ الصلاحية","Batches & expiry"], show:function(d){ return ind() === "pharmacy" || Number(d.has_batch_no) }, fields:[
      {f:"has_batch_no", t:"check", l:["يُتتبَّع بالدفعات (رقم تشغيلة)","Track by batch"]},
      {f:"create_new_batch", t:"check", l:["إنشاء دفعة جديدة عند كل استلام","Create a new batch on each receipt"], dep:function(d){ return Number(d.has_batch_no) }},
      {f:"has_expiry_date", t:"check", l:["له تاريخ صلاحية","Has an expiry date"], dep:function(d){ return Number(d.has_batch_no) }},
      {f:"shelf_life_in_days", t:"int", l:["مدة الصلاحية (أيام)","Shelf life (days)"], dep:function(d){ return Number(d.has_batch_no) && Number(d.has_expiry_date) }}]},
    {title:["ضريبة المنتج","Item tax"], fields:[{t:"table", f:"taxes"}]});
  it.tables.push(
    {f:"uoms", key:"uom", l:["وحدات التحويل","Conversions"], cols:[
      {f:"uom", t:"link", dt:"UOM", l:["الوحدة","Unit"], w:"45%"},
      {f:"conversion_factor", t:"float", l:["عدد الوحدات الأساسية في الواحدة","Base units per one"], w:"45%"}], newRow:function(){ return {conversion_factor:1} }},
    {f:"reorder_levels", key:"warehouse", l:["حد الطلب","Reorder"], cols:[
      {f:"warehouse", t:"link", dt:"Warehouse", l:["المستودع","Warehouse"], w:"34%", filters:function(){ return {company:AMY.boot.company, is_group:0} }},
      {f:"warehouse_reorder_level", t:"float", l:["الحد الأدنى","Minimum"], w:"22%"},
      {f:"warehouse_reorder_qty", t:"float", l:["كمية الطلب","Order qty"], w:"22%"},
      {f:"material_request_type", t:"select", l:["النوع","Type"], w:"18%", opts:[["Purchase",["شراء","Purchase"]],["Transfer",["تحويل","Transfer"]]]}],
      newRow:function(){ return {material_request_type:"Purchase"} }},
    {f:"taxes", key:"item_tax_template", l:["ضريبة المنتج","Item tax"], cols:[
      {f:"item_tax_template", t:"link", dt:"Item Tax Template", l:["قالب ضريبة المنتج (مثل صفر أو معفى)","Item tax template (such as zero or exempt)"], w:"90%"}]});
  var d0 = it.defaults;
  it.defaults = function(d){
    if(d0) d0(d);
    if(ind() === "pharmacy"){ d.has_batch_no = 1; d.create_new_batch = 1; d.has_expiry_date = 1 }
    if(ind() === "restaurant"){ d.is_stock_item = 0 }
  };
})();

/* ---------- parties: payment terms and credit ---------- */
(function(){
  var c = docs["Customer"], s = docs["Supplier"];
  if(c){
    c.sections.splice(1, 0, {title:["الائتمان وشروط السداد","Credit & payment terms"], fields:[
      {f:"payment_terms", t:"link", dt:"Payment Terms Template", l:["شروط السداد","Payment terms"], hint:["مثل: آجل 30 يومًا","For example: net 30 days"]},
      {t:"table", f:"credit_limits"}]});
    c.tables = (c.tables || []).concat([{f:"credit_limits", key:"credit_limit", l:["حد الائتمان","Credit limit"], cols:[
      {f:"credit_limit", t:"money", l:["حد الائتمان (المبلغ المسموح به غير المسدد)","Credit limit (largest unpaid balance allowed)"], w:"90%"}],
      newRow:function(){ return {company:AMY.boot.company, credit_limit:0} }}]);
  }
  if(s){
    s.sections.splice(1, 0, {title:["شروط السداد","Payment terms"], fields:[{f:"payment_terms", t:"link", dt:"Payment Terms Template", l:["شروط السداد","Payment terms"]}]});
  }
  ["Sales Invoice", "Purchase Invoice"].forEach(function(dt){
    var d = docs[dt]; if(!d) return;
    var f = d.sections[0].fields, i = f.findIndex(function(x){ return x.f === "due_date" });
    f.splice(i < 0 ? f.length : i + 1, 0, {f:"payment_terms_template", t:"link", dt:"Payment Terms Template", l:["شروط السداد (البيع الآجل)","Payment terms (credit sale)"]});
  });
})();

/* ---------- new records: batches, bundles, payment terms ---------- */
function daysLeft(d){ return Math.round((new Date(String(d).slice(0, 10) + "T00:00:00") - new Date(new Date().toDateString())) / 86400000) }
docs["Batch"] = {
  slug:"batches", icon:"layers", label:["دفعة","Batch"], plural:["الدفعات وتواريخ الصلاحية","Batches & expiry"], noNew:1, noDelete:1,
  search:["name","item","batch_id"], order:"expiry_date asc", fields:["item","expiry_date","batch_qty","manufacturing_date","disabled"],
  cols:[{f:"name", l:["رقم الدفعة","Batch"], t:"num"}, {f:"item", l:["المنتج","Item"]},
    {f:"expiry_date", l:["تاريخ الانتهاء","Expiry"], render:function(r){
      if(!r.expiry_date) return h("span", {class:"mut", text:"—"});
      var n = daysLeft(r.expiry_date), cls = n < 0 ? "bad" : n <= 60 ? "warn" : "ok";
      return h("span", {class:"pill " + cls, text:AMY.date(r.expiry_date) + (n < 0 ? "  ·  " + L("منتهية", "Expired") : n <= 90 ? "  ·  " + n + L(" يوم", " d") : "")});
    }},
    {f:"batch_qty", l:["الكمية","Qty"], t:"float", end:1}],
  chips:[{l:["بها رصيد","In stock"], filters:{disabled:0, batch_qty:[">", 0]}},
    {l:["تنتهي خلال 30 يومًا","Expiring in 30 days"], filters:{batch_qty:[">", 0], expiry_date:["between", [plus(0), plus(30)]]}},
    {l:["تنتهي خلال 90 يومًا","Expiring in 90 days"], filters:{batch_qty:[">", 0], expiry_date:["between", [plus(0), plus(90)]]}},
    {l:["منتهية وبها رصيد","Expired with stock"], filters:{batch_qty:[">", 0], expiry_date:["<", plus(0)]}}, {l:ALL, filters:{}}],
  sections:[{fields:[
    {f:"name", t:"ro", l:["رقم الدفعة","Batch"]}, {f:"item", t:"ro", l:["المنتج","Item"], span:2},
    {f:"manufacturing_date", t:"date", l:["تاريخ الإنتاج","Manufactured"]}, {f:"expiry_date", t:"date", l:["تاريخ الانتهاء","Expiry date"]},
    {f:"batch_qty", t:"ro", ft:"float", l:["الكمية المتاحة","Quantity on hand"]}, {f:"disabled", t:"check", l:["موقوفة","Disabled"]}]}]
};
docs["Product Bundle"] = {
  slug:"bundles", icon:"gift", label:["باقة","Bundle"], plural:["الباقات والعروض المركّبة","Bundles & combos"], newLabel:["باقة جديدة","New bundle"], newTitle:["باقة جديدة","New bundle"],
  search:["name","description"], fields:["new_item_code","description","disabled"], order:"creation desc",
  cols:[{f:"name", l:["المنتج الرئيسي","Bundle item"]}, {f:"description", l:["الوصف","Description"]}, {f:"disabled", l:["الحالة","Status"], render:function(r){ return AMY.statusPill(Number(r.disabled) ? "Inactive" : "Active") }}],
  sections:[
    {title:["الباقة","Bundle"], fields:[
      {f:"new_item_code", t:"link", dt:"Item", l:["المنتج الرئيسي (يُباع باسمه)","Bundle item (sold under this name)"], req:1, newOnly:1, span:2,
        hint:["يجب أن يكون منتجًا غير مخزني، مثل «وجبة اقتصادية». أنشئه أولًا من المنتجات.","Must be a non-stock item such as “Value meal”. Create it under Items first."]},
      {f:"description", t:"data", l:["الوصف","Description"], span:2}, {f:"disabled", t:"check", l:["موقوفة","Disabled"]}]},
    {title:["محتويات الباقة","What's inside"], fields:[{t:"table", f:"items"}]}],
  tables:[{f:"items", min:1, l:["المحتويات","Contents"], cols:[
    {f:"item_code", t:"link", dt:"Item", l:["المنتج","Item"], w:"50%", req:1}, {f:"qty", t:"float", l:["الكمية","Qty"], w:"20%", req:1},
    {f:"uom", t:"link", dt:"UOM", l:["الوحدة","Unit"], w:"22%"}], newRow:function(){ return {qty:1} }}]
};
docs["Payment Terms Template"] = {
  slug:"payment-terms", icon:"clock", label:["شرط سداد","Payment terms"], plural:["شروط السداد","Payment terms"], newLabel:["شرط سداد جديد","New terms"], newTitle:["شرط سداد جديد","New payment terms"],
  search:["name","template_name"], fields:["template_name"], order:"creation desc", cols:[{f:"name", l:["الشرط","Terms"]}],
  defaults:function(d){ if(!(d.terms||[]).length) d.terms = [{invoice_portion:100, due_date_based_on:"Day(s) after invoice date", credit_days:30}] },
  sections:[
    {title:["الشرط","Terms"], fields:[{f:"template_name", t:"data", l:["الاسم","Name"], req:1, newOnly:1, span:2, hint:["مثل: آجل 30 يومًا، أو 50% مقدمًا و50% بعد 15 يومًا","For example: net 30, or 50% upfront and 50% after 15 days"]}]},
    {title:["الدفعات","Instalments"], fields:[{t:"table", f:"terms"}]}],
  tables:[{f:"terms", key:"invoice_portion", min:1, l:["الدفعات","Instalments"], cols:[
    {f:"invoice_portion", t:"percent", l:["نسبة من الفاتورة %","Share of invoice %"], w:"25%", req:1},
    {f:"due_date_based_on", t:"select", l:["يُحسب الاستحقاق","Due"], w:"45%", opts:[["Day(s) after invoice date",["يوم بعد تاريخ الفاتورة","Days after invoice date"]],["Day(s) after the end of the invoice month",["يوم بعد نهاية شهر الفاتورة","Days after month end"]],["Month(s) after the end of the invoice month",["شهر بعد نهاية شهر الفاتورة","Months after month end"]]]},
    {f:"credit_days", t:"int", l:["المدة","Period"], w:"20%"}],
    newRow:function(d){ return {invoice_portion:(d.terms||[]).length ? 0 : 100, due_date_based_on:"Day(s) after invoice date", credit_days:30} }}]
};

/* ---------- business type page ---------- */
var TYPES = [
  ["retail", ["تجزئة عامة","General retail"], ["سوبرماركت، ملابس، إلكترونيات، مكتبات.","Supermarkets, clothing, electronics, stationery."], [["باركود متعدد ووحدات (قطعة/كرتون)","Several barcodes and units (piece/carton)"],["خصومات وعروض وباقات","Discounts, promotions and bundles"],["حد طلب وتنبيه نقص المخزون","Reorder levels and low-stock alerts"]]],
  ["restaurant", ["مطاعم وكافيهات","Restaurants & cafés"], ["بيع الوجبات والمشروبات بسرعة.","Selling meals and drinks quickly."], [["الأصناف تُباع دون رصيد افتتاحي","Items sell without opening stock"],["وجبات مركّبة (كومبو) من عدة أصناف","Combo meals made of several items"],["السماح بالبيع قبل جرد المواد الخام","Sell before raw materials are counted"]]],
  ["pharmacy", ["صيدليات","Pharmacies"], ["أدوية بتواريخ صلاحية وأرقام تشغيلة.","Medicines with expiry dates and batch numbers."], [["تتبع الدفعات وتاريخ الانتهاء لكل صنف","Batch and expiry tracking per item"],["البيع من الأقرب انتهاءً أولًا تلقائيًا","Sells the earliest-expiring batch first"],["قائمة الدفعات التي تنتهي قريبًا","A list of batches about to expire"],["ضريبة بنسبة صفر للأدوية عبر ضريبة المنتج","Zero VAT for medicines through item tax"]]],
  ["wholesale", ["جملة وتوزيع","Wholesale & distribution"], ["عملاء بالآجل وفروع ومخازن متعددة.","Credit customers, branches and several warehouses."], [["حد ائتمان وشروط سداد لكل عميل","Credit limit and payment terms per customer"],["بيع بالكرتون والقطعة بأسعار مختلفة","Selling by carton and by piece at different prices"],["عروض أسعار وأوامر بيع وتحويل بين المخازن","Quotations, sales orders and warehouse transfers"],["كشف حساب العميل والمورد","Customer and supplier statements"]]]
];
V.industry = function(root){
  var title = L("نوع النشاط", "Business type");
  AMY.setTitle(title);
  root.appendChild(AMY.pageHeader({title:title, sub:L("اختر نشاطك لتظهر لك الحقول والصفحات المناسبة فقط. تستطيع تغييره في أي وقت دون فقدان بيانات.", "Choose your business so you see the fields and pages that fit. You can change it any time without losing data.")}));
  var grid = h("div", {class:"typegrid"});
  function paint(){
    AMY.clear(grid);
    TYPES.forEach(function(t){
      var on = ind() === t[0];
      var card = h("button", {type:"button", class:"typec" + (on ? " on" : ""), onclick:function(){
        if(on) return;
        card.disabled = true;
        AMY.call("amy_pos.ops.industry_set", {industry:t[0]}).then(function(){
          AMY.boot.industry = t[0]; AMY.toast(L("تم ضبط النشاط: ", "Business type set: ") + AMY.lb(t[1]), "ok"); if(AMY.renderNav) AMY.renderNav(); paint();
        }).catch(function(e){ card.disabled = false; AMY.fail(e) });
      }}, h("b", {text:AMY.lb(t[1])}), h("span", {class:"d", text:AMY.lb(t[2])}),
        h("ul", null, t[3].map(function(x){ return h("li", {text:AMY.lb(x)}) })),
        on ? h("span", {class:"pill ok", text:L("النشاط الحالي", "Current")}) : null);
      grid.appendChild(card);
    });
  }
  paint(); root.appendChild(grid);
};

/* ---------- navigation, settings, reports ---------- */
AMY.cfg.nav.forEach(function(g){
  if(g.id === "stock"){
    g.k.push({to:"/batches", l:["الدفعات وتواريخ الصلاحية","Batches & expiry"], dt:"Batch", ind:["pharmacy"]});
    g.k.push({to:"/bundles", l:["الباقات والعروض المركّبة","Bundles & combos"], dt:"Product Bundle"});
  }
});
AMY.cfg.settings.splice(1, 0,
  {to:"/industry", icon:"building", l:["نوع النشاط","Business type"], d:["تجزئة أو مطعم أو صيدلية أو جملة، لتظهر لك الحقول المناسبة.", "Retail, restaurant, pharmacy or wholesale, so you see the right fields."], admin:1},
  {to:"/payment-terms", icon:"clock", l:["شروط السداد","Payment terms"], d:["آجل 30 يومًا أو دفعات، تُستخدم في فواتير الآجل.", "Net 30 or instalments, used on credit invoices."], dt:"Payment Terms Template"});
var R = AMY.cfg.reports;
function stmt(party, label, sub){
  return {name:"General Ledger", icon:"book", label:label, sub:sub, filters:[
    {f:"company", t:"link", dt:"Company", l:["الشركة","Company"], def:"company"},
    {f:"party", t:"link", dt:party, l:party === "Customer" ? ["العميل","Customer"] : ["المورد","Supplier"], list:1},
    {f:"from_date", t:"date", l:["من تاريخ","From"], def:"yearStart"}, {f:"to_date", t:"date", l:["إلى تاريخ","To"], def:"today"}],
    extra:{party_type:party, group_by:"Group by Voucher (Consolidated)"}};
}
R["customer-statement"] = stmt("Customer", ["كشف حساب عميل","Customer statement"], ["الفواتير والدفعات والرصيد لعميل في فترة.","Invoices, payments and balance for a customer."]);
R["supplier-statement"] = stmt("Supplier", ["كشف حساب مورد","Supplier statement"], ["الفواتير والدفعات والرصيد لمورد في فترة.","Invoices, payments and balance for a supplier."]);
})();
