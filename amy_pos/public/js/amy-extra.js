/* AMY console - more screens: quotations, orders, POS, promotions, brands, cost centres */
(function(){
"use strict";
var AMY = window.AMY, docs = AMY.cfg.docs, h = AMY.h;
var ALL = ["الكل","All"];
function whs(doc){ return {company:doc.company, is_group:0} }
function master(dt, o){ docs[dt] = o }

function itemCols(withWh){
  var c = [
   {f:"item_code",t:"link",dt:"Item",l:["الصنف","Item"],w:"28%",req:1},
   {f:"qty",t:"float",l:["الكمية","Qty"],w:"9%",req:1},
   {f:"uom",t:"link",dt:"UOM",l:["الوحدة","Unit"],w:"12%"},
   {f:"rate",t:"money",l:["السعر","Rate"],w:"13%",req:1},
   {f:"discount_percentage",t:"percent",l:["خصم %","Disc %"],w:"9%"},
   {f:"amount",t:"calc",l:["الإجمالي","Amount"],w:"14%"}];
  if(withWh) c.push({f:"warehouse",t:"link",dt:"Warehouse",l:["المستودع","Warehouse"],w:"18%",filters:whs});
  return c;
}
var moreSection = {title:["إضافات","More"],fields:[
  {f:"discount_amount",t:"money",l:["خصم إضافي","Extra discount"]},
  {f:"apply_discount_on",t:"select",l:["يُطبّق على","Apply on"],opts:[["Grand Total",["الإجمالي النهائي","Grand total"]],["Net Total",["الإجمالي قبل الضريبة","Net total"]]]},
  {f:"terms",t:"text",l:["الشروط والملاحظات","Terms & notes"],span:2}]};
function previewOn(extra){
  return function(f, doc, form){
    if(f==="taxes_and_charges") doc.taxes = [];
    if(["taxes_and_charges","discount_amount","apply_discount_on"].concat(extra).indexOf(f)>=0) form.preview();
  };
}

/* ---------- Quotation ---------- */
docs["Quotation"] = {
 slug:"quotations", icon:"list", label:["عرض سعر","Quotation"], plural:["عروض الأسعار","Quotations"],
 newLabel:["عرض سعر جديد","New quotation"], newTitle:["عرض سعر جديد","New quotation"],
 submittable:true, invoice:true, isOrder:true, order:"creation desc", print:true, search:["name","customer_name","party_name"],
 convert:[{to:"Sales Order",l:["تحويل لأمر بيع","Make sales order"],icon:"list"},{to:"Sales Invoice",l:["تحويل لفاتورة","Make invoice"],icon:"sales"}],
 fields:["customer_name","transaction_date","valid_till","grand_total","status"],
 cols:[{f:"name",l:["الرقم","No."],t:"num"},{f:"customer_name",l:["العميل","Customer"]},{f:"transaction_date",l:["التاريخ","Date"],t:"date"},{f:"valid_till",l:["صالح حتى","Valid until"],t:"date"},
  {f:"grand_total",l:["الإجمالي","Total"],t:"money",end:1},{f:"status",l:["الحالة","Status"],t:"status"}],
 chips:[{l:ALL,filters:{}},{l:["مفتوحة","Open"],filters:{status:"Open"}},{l:["مسودات","Drafts"],filters:{docstatus:0}},{l:["تم تحويلها","Ordered"],filters:{status:["in",["Ordered","Partially Ordered"]]}}],
 sections:[
  {fields:[
   {f:"party_name",t:"link",dt:"Customer",l:["العميل","Customer"],req:1,span:2},
   {f:"transaction_date",t:"date",l:["التاريخ","Date"],req:1},{f:"valid_till",t:"date",l:["صالح حتى","Valid until"]},
   {f:"selling_price_list",t:"link",dt:"Price List",l:["قائمة الأسعار","Price list"],filters:function(){ return {selling:1} }},
   {f:"taxes_and_charges",t:"link",dt:"Sales Taxes and Charges Template",l:["قالب الضريبة","Tax template"],span:2,filters:function(d){ return {company:d.company} }}]},
  {title:["الأصناف","Items"],totals:true,fields:[{t:"table",f:"items"}]}, moreSection],
 tables:[{f:"items",l:["الأصناف","Items"],min:1,cols:itemCols(false),newRow:function(){ return {qty:1} }}],
 onChange:previewOn(["selling_price_list","party_name"])
};

/* ---------- Sales Order ---------- */
docs["Sales Order"] = {
 slug:"sales-orders", icon:"list", label:["أمر بيع","Sales order"], plural:["أوامر البيع","Sales orders"],
 newLabel:["أمر بيع جديد","New sales order"], newTitle:["أمر بيع جديد","New sales order"],
 submittable:true, invoice:true, isOrder:true, order:"creation desc", print:true, search:["name","customer_name"],
 convert:[{to:"Sales Invoice",l:["إنشاء فاتورة","Make invoice"],icon:"sales"}],
 fields:["customer_name","transaction_date","delivery_date","grand_total","status","per_billed"],
 cols:[{f:"name",l:["الرقم","No."],t:"num"},{f:"customer_name",l:["العميل","Customer"]},{f:"transaction_date",l:["التاريخ","Date"],t:"date"},{f:"delivery_date",l:["التسليم","Delivery"],t:"date"},
  {f:"grand_total",l:["الإجمالي","Total"],t:"money",end:1},{f:"per_billed",l:["تمت فوترته %","Billed %"],t:"num",end:1},{f:"status",l:["الحالة","Status"],t:"status"}],
 chips:[{l:ALL,filters:{}},{l:["بانتظار الفوترة","To bill"],filters:{docstatus:1,status:["in",["To Deliver and Bill","To Bill"]]}},{l:["مسودات","Drafts"],filters:{docstatus:0}},{l:["مكتملة","Completed"],filters:{status:"Completed"}}],
 sections:[
  {fields:[
   {f:"customer",t:"link",dt:"Customer",l:["العميل","Customer"],req:1,span:2},
   {f:"transaction_date",t:"date",l:["التاريخ","Date"],req:1},{f:"delivery_date",t:"date",l:["تاريخ التسليم","Delivery date"],req:1},
   {f:"set_warehouse",t:"link",dt:"Warehouse",l:["المستودع","Warehouse"],span:2,filters:whs},
   {f:"selling_price_list",t:"link",dt:"Price List",l:["قائمة الأسعار","Price list"],filters:function(){ return {selling:1} }},
   {f:"taxes_and_charges",t:"link",dt:"Sales Taxes and Charges Template",l:["قالب الضريبة","Tax template"],filters:function(d){ return {company:d.company} }}]},
  {title:["الأصناف","Items"],totals:true,fields:[{t:"table",f:"items"}]}, moreSection],
 tables:[{f:"items",l:["الأصناف","Items"],min:1,cols:itemCols(true),newRow:function(){ return {qty:1} }}],
 onChange:previewOn(["selling_price_list","customer"])
};

/* ---------- Purchase Order ---------- */
docs["Purchase Order"] = {
 slug:"purchase-orders", icon:"buy", label:["أمر شراء","Purchase order"], plural:["أوامر الشراء","Purchase orders"],
 newLabel:["أمر شراء جديد","New purchase order"], newTitle:["أمر شراء جديد","New purchase order"],
 submittable:true, invoice:true, isOrder:true, order:"creation desc", print:true, search:["name","supplier_name"],
 convert:[{to:"Purchase Invoice",l:["إنشاء فاتورة مشتريات","Make purchase invoice"],icon:"buy"}],
 fields:["supplier_name","transaction_date","schedule_date","grand_total","status","per_received"],
 cols:[{f:"name",l:["الرقم","No."],t:"num"},{f:"supplier_name",l:["المورد","Supplier"]},{f:"transaction_date",l:["التاريخ","Date"],t:"date"},{f:"schedule_date",l:["الاستلام المتوقع","Expected"],t:"date"},
  {f:"grand_total",l:["الإجمالي","Total"],t:"money",end:1},{f:"per_received",l:["تم استلامه %","Received %"],t:"num",end:1},{f:"status",l:["الحالة","Status"],t:"status"}],
 chips:[{l:ALL,filters:{}},{l:["بانتظار الاستلام","To receive"],filters:{docstatus:1,status:["in",["To Receive and Bill","To Receive","To Bill"]]}},{l:["مسودات","Drafts"],filters:{docstatus:0}},{l:["مكتملة","Completed"],filters:{status:"Completed"}}],
 sections:[
  {fields:[
   {f:"supplier",t:"link",dt:"Supplier",l:["المورد","Supplier"],req:1,span:2},
   {f:"transaction_date",t:"date",l:["التاريخ","Date"],req:1},{f:"schedule_date",t:"date",l:["تاريخ الاستلام","Required by"],req:1},
   {f:"set_warehouse",t:"link",dt:"Warehouse",l:["المستودع","Warehouse"],span:2,filters:whs},
   {f:"buying_price_list",t:"link",dt:"Price List",l:["قائمة الأسعار","Price list"],filters:function(){ return {buying:1} }},
   {f:"taxes_and_charges",t:"link",dt:"Purchase Taxes and Charges Template",l:["قالب الضريبة","Tax template"],filters:function(d){ return {company:d.company} }}]},
  {title:["الأصناف","Items"],totals:true,fields:[{t:"table",f:"items"}]}, moreSection],
 tables:[{f:"items",l:["الأصناف","Items"],min:1,cols:itemCols(true),newRow:function(){ return {qty:1} }}],
 onChange:previewOn(["buying_price_list","supplier"])
};

/* ---------- POS profile (the till's settings) ---------- */
docs["POS Profile"] = {
 slug:"pos-profiles", icon:"cart", label:["ملف نقطة بيع","POS profile"], plural:["ملفات نقاط البيع","POS profiles"],
 sub:["كل كاشير يعمل على ملف: مستودعه وطرق الدفع والعميل الافتراضي ومن يحق له استخدامه.","Each till works from a profile: its warehouse, payment methods, default customer and who may use it."],
 newLabel:["ملف جديد","New profile"], newTitle:["ملف نقطة بيع جديد","New POS profile"],
 search:["name","warehouse"], fields:["company","warehouse","customer","selling_price_list","disabled"],
 cols:[{f:"name",l:["الملف","Profile"]},{f:"warehouse",l:["المستودع","Warehouse"]},{f:"customer",l:["العميل الافتراضي","Default customer"]},{f:"selling_price_list",l:["قائمة الأسعار","Price list"]},
  {f:"disabled",l:["الحالة","Status"],render:function(r){ return AMY.statusPill(Number(r.disabled)?"Inactive":"Active") }}],
 chips:[{l:["النشطة","Active"],filters:{disabled:0}},{l:ALL,filters:{}}],
 sections:[
  {title:["الأساسيات","Basics"],fields:[
   {f:"name",t:"data",l:["اسم الملف","Profile name"],req:1,span:2,newOnly:1,hint:["مثال: كاشير الفرع الرئيسي","e.g. Main branch till"]},
   {f:"warehouse",t:"link",dt:"Warehouse",l:["المستودع","Warehouse"],req:1,span:2,filters:whs},
   {f:"customer",t:"link",dt:"Customer",l:["العميل الافتراضي (نقدي)","Default customer (walk-in)"],span:2},
   {f:"selling_price_list",t:"link",dt:"Price List",l:["قائمة الأسعار","Price list"],filters:function(){ return {selling:1} }},
   {f:"taxes_and_charges",t:"link",dt:"Sales Taxes and Charges Template",l:["قالب الضريبة","Tax template"],filters:function(d){ return {company:d.company} }},
   {f:"disabled",t:"check",l:["موقوف","Disabled"]}]},
  {title:["طرق الدفع","Payment methods"],fields:[{t:"table",f:"payments"}]},
  {title:["الكاشيرية المسموح لهم","Allowed cashiers"],fields:[{t:"table",f:"applicable_for_users"}]},
  {title:["سلوك الكاشير","Till behaviour"],fields:[
   {f:"allow_rate_change",t:"check",l:["السماح بتعديل السعر","Allow editing the price"]},
   {f:"allow_discount_change",t:"check",l:["السماح بتعديل الخصم","Allow editing the discount"]},
   {f:"allow_partial_payment",t:"check",l:["السماح بدفع جزئي","Allow partial payment"]},
   {f:"posa_block_sale_beyond_available_qty",t:"check",l:["منع البيع بأكثر من الرصيد","Block sales above stock"]},
   {f:"hide_images",t:"check",l:["إخفاء صور المنتجات","Hide item images"]},
   {f:"hide_unavailable_items",t:"check",l:["إخفاء المنتجات غير المتوفرة","Hide out-of-stock items"]},
   {f:"print_receipt_on_order_complete",t:"check",l:["طباعة الإيصال بعد البيع","Print receipt after sale"]},
   {f:"ignore_pricing_rule",t:"check",l:["تجاهل العروض","Ignore promotions"]}]},
  {title:["الحسابات","Accounting"],fields:[
   {f:"income_account",t:"link",dt:"Account",l:["حساب الإيراد","Income account"],filters:function(d){ return {company:d.company,is_group:0,root_type:"Income"} }},
   {f:"expense_account",t:"link",dt:"Account",l:["حساب تكلفة البضاعة","Cost of goods account"],filters:function(d){ return {company:d.company,is_group:0,root_type:"Expense"} }},
   {f:"cost_center",t:"link",dt:"Cost Center",l:["مركز التكلفة","Cost center"],filters:function(d){ return {company:d.company,is_group:0} }},
   {f:"write_off_account",t:"link",dt:"Account",l:["حساب فروق التقريب","Write-off account"],req:1,filters:function(d){ return {company:d.company,is_group:0} }},
   {f:"write_off_cost_center",t:"link",dt:"Cost Center",l:["مركز تكلفة الفروق","Write-off cost center"],req:1,filters:function(d){ return {company:d.company,is_group:0} }},
   {f:"write_off_limit",t:"money",l:["حد الفروق المسموح","Write-off limit"]}]}],
 tables:[
  {f:"payments",key:"mode_of_payment",min:1,l:["طرق الدفع","Payment methods"],newRow:function(){ return {} },cols:[
   {f:"mode_of_payment",t:"link",dt:"Mode of Payment",l:["طريقة الدفع","Method"],w:"46%",req:1},
   {f:"default",t:"check",l:["الافتراضية","Default"],w:"18%"},{f:"allow_in_returns",t:"check",l:["تقبل في المرتجعات","Allow in returns"],w:"22%"}]},
  {f:"applicable_for_users",key:"user",l:["الكاشيرية","Cashiers"],newRow:function(){ return {} },cols:[
   {f:"user",t:"link",dt:"User",l:["المستخدم","User"],w:"60%",req:1},{f:"default",t:"check",l:["افتراضي","Default"],w:"20%"}]}]
};
function shifts(dt, slug, ar, en, cols){
  docs[dt] = {slug:slug, icon:"clock", label:[ar,en], plural:[ar,en], noNew:1, noDelete:1, search:["name","user","pos_profile"],
   fields:["user","pos_profile","period_start_date","period_end_date","status"].filter(function(f){ return cols.indexOf(f)>=0 || f==="user"||f==="pos_profile"||f==="period_start_date" }),
   cols:[{f:"name",l:["الرقم","No."],t:"num"},{f:"user",l:["الكاشير","Cashier"]},{f:"pos_profile",l:["الملف","Profile"]},{f:"period_start_date",l:["بداية الوردية","Opened"],t:"date"}].concat(cols.indexOf("status")>=0?[{f:"status",l:["الحالة","Status"],t:"status"}]:[]).concat(cols.indexOf("grand_total")>=0?[{f:"grand_total",l:["إجمالي المبيعات","Sales total"],t:"money",end:1}]:[]),
   sections:[{fields:[{f:"user",t:"ro",l:["الكاشير","Cashier"]},{f:"pos_profile",t:"ro",l:["الملف","Profile"]},{f:"period_start_date",t:"ro",l:["بداية الوردية","Opened"]},{f:"period_end_date",t:"ro",l:["نهاية الوردية","Closed"]}]}]};
  if(cols.indexOf("grand_total")>=0){ docs[dt].fields.push("grand_total"); docs[dt].sections[0].fields.push({f:"grand_total",t:"ro",l:["إجمالي المبيعات","Sales total"]},{f:"total_quantity",t:"ro",l:["إجمالي الكميات","Total qty"]}) }
  if(cols.indexOf("status")>=0) docs[dt].fields.push("status");
}
shifts("POS Opening Shift","pos-shifts","ورديات الكاشير","Cashier shifts",["status"]);
shifts("POS Closing Shift","pos-closings","إغلاق الورديات","Shift closings",["grand_total"]);

/* ---------- promotions ---------- */
docs["Pricing Rule"] = {
 slug:"promotions", icon:"gift", label:["عرض","Promotion"], plural:["العروض والخصومات","Promotions & discounts"],
 sub:["خصومات تلقائية على منتجات أو فئات أو ماركات.","Automatic discounts on items, categories or brands."],
 newLabel:["عرض جديد","New promotion"], newTitle:["عرض جديد","New promotion"],
 search:["name","title"], fields:["title","apply_on","discount_percentage","valid_from","valid_upto","disable","selling"],
 cols:[{f:"title",l:["العرض","Promotion"]},{f:"apply_on",l:["يطبق على","Applies to"]},{f:"discount_percentage",l:["الخصم %","Discount %"],t:"num"},{f:"valid_upto",l:["ينتهي","Ends"],t:"date"},
  {f:"disable",l:["الحالة","Status"],render:function(r){ return AMY.statusPill(Number(r.disable)?"Inactive":"Active") }}],
 chips:[{l:["النشطة","Active"],filters:{disable:0}},{l:ALL,filters:{}}],
 defaults:function(d){ d.selling = 1; d.price_or_product_discount = "Price"; d.rate_or_discount = "Discount Percentage"; d.apply_on = "Item Code"; d.valid_from = new Date().toISOString().slice(0,10); d.items = []; d.item_groups = []; d.brands = [] },
 sections:[
  {title:["العرض","Promotion"],fields:[
   {f:"title",t:"data",l:["اسم العرض","Promotion name"],req:1,span:2},
   {f:"apply_on",t:"select",l:["يُطبّق على","Applies to"],opts:[["Item Code",["منتجات محددة","Specific items"]],["Item Group",["فئات منتجات","Item categories"]],["Brand",["ماركات","Brands"]]]},
   {f:"disable",t:"check",l:["موقوف","Disabled"]},
   {f:"discount_percentage",t:"percent",l:["نسبة الخصم %","Discount %"],req:1},
   {f:"min_qty",t:"float",l:["أقل كمية للتطبيق","Minimum quantity"]},
   {f:"valid_from",t:"date",l:["يبدأ من","Starts"]},{f:"valid_upto",t:"date",l:["ينتهي في","Ends"]}]},
  {title:["المنتجات","Items"],show:function(d){ return d.apply_on==="Item Code" },fields:[{t:"table",f:"items"}]},
  {title:["الفئات","Categories"],show:function(d){ return d.apply_on==="Item Group" },fields:[{t:"table",f:"item_groups"}]},
  {title:["الماركات","Brands"],show:function(d){ return d.apply_on==="Brand" },fields:[{t:"table",f:"brands"}]},
  {title:["لمن ينطبق","Who gets it"],fields:[
   {f:"applicable_for",t:"select",l:["ينطبق على","Applies for"],blank:1,opts:[["",["كل العملاء","All customers"]],["Customer",["عميل محدد","One customer"]],["Customer Group",["مجموعة عملاء","Customer group"]]]},
   {f:"customer",t:"link",dt:"Customer",l:["العميل","Customer"],dep:function(d){ return d.applicable_for==="Customer" }},
   {f:"customer_group",t:"link",dt:"Customer Group",l:["مجموعة العملاء","Customer group"],dep:function(d){ return d.applicable_for==="Customer Group" }},
   {f:"pos_only",t:"check",l:["في نقاط البيع فقط","POS only"]}]}],
 tables:[
  {f:"items",key:"item_code",l:["المنتجات","Items"],newRow:function(){ return {} },cols:[{f:"item_code",t:"link",dt:"Item",l:["المنتج","Item"],req:1}]},
  {f:"item_groups",key:"item_group",l:["الفئات","Categories"],newRow:function(){ return {} },cols:[{f:"item_group",t:"link",dt:"Item Group",l:["الفئة","Category"],req:1}]},
  {f:"brands",key:"brand",l:["الماركات","Brands"],newRow:function(){ return {} },cols:[{f:"brand",t:"link",dt:"Brand",l:["الماركة","Brand"],req:1}]}]
};

/* ---------- small masters ---------- */
master("Brand",{slug:"brands",icon:"tag",label:["ماركة","Brand"],plural:["الماركات","Brands"],newLabel:["ماركة جديدة","New brand"],newTitle:["ماركة جديدة","New brand"],
 search:["name"],fields:["description"],cols:[{f:"name",l:["الماركة","Brand"]},{f:"description",l:["الوصف","Description"]}],
 sections:[{fields:[{f:"brand",t:"data",l:["اسم الماركة","Brand name"],req:1,newOnly:1,span:2},{f:"description",t:"text",l:["الوصف","Description"],span:4},{f:"image",t:"image",l:["الشعار","Logo"],span:4}]}]});
master("Territory",{slug:"territories",icon:"globe",label:["منطقة","Territory"],plural:["المناطق","Territories"],newLabel:["منطقة جديدة","New territory"],newTitle:["منطقة جديدة","New territory"],
 search:["name"],fields:["parent_territory","is_group"],cols:[{f:"name",l:["المنطقة","Territory"]},{f:"parent_territory",l:["تتبع","Parent"]}],
 sections:[{fields:[{f:"territory_name",t:"data",l:["اسم المنطقة","Name"],req:1,newOnly:1,span:2},{f:"parent_territory",t:"link",dt:"Territory",l:["تتبع","Parent"],req:1,filters:function(){ return {is_group:1} }},{f:"is_group",t:"check",l:["منطقة رئيسية","Is a parent"]}]}]});
master("Cost Center",{slug:"cost-centers",icon:"building",label:["مركز تكلفة","Cost center"],plural:["مراكز التكلفة","Cost centers"],newLabel:["مركز جديد","New cost center"],newTitle:["مركز تكلفة جديد","New cost center"],
 search:["name","cost_center_name"],fields:["cost_center_name","parent_cost_center","is_group","disabled"],baseFilters:function(){ return {company:AMY.boot.company} },
 cols:[{f:"name",l:["المركز","Cost center"]},{f:"parent_cost_center",l:["يتبع","Parent"]},{f:"is_group",l:["رئيسي","Group"],t:"check"}],
 sections:[{fields:[{f:"cost_center_name",t:"data",l:["اسم المركز","Name"],req:1,newOnly:1,span:2},
  {f:"parent_cost_center",t:"link",dt:"Cost Center",l:["يتبع","Parent"],req:1,filters:function(d){ return {company:d.company||AMY.boot.company,is_group:1} }},
  {f:"is_group",t:"check",l:["مركز رئيسي","Is a parent"]},{f:"disabled",t:"check",l:["موقوف","Disabled"]}]}]});

/* ---------- navigation (replaces the first draft) ---------- */
AMY.cfg.nav = [
 {to:"/",icon:"home",l:["الرئيسية","Home"]},
 {id:"sales",icon:"sales",l:["المبيعات والعملاء","Sales & customers"],k:[
  {to:"/quotations",l:["عروض الأسعار","Quotations"],dt:"Quotation"},
  {to:"/sales-orders",l:["أوامر البيع","Sales orders"],dt:"Sales Order"},
  {to:"/sales-invoices",l:["فواتير المبيعات","Sales invoices"],dt:"Sales Invoice"},
  {to:"/customers",l:["العملاء","Customers"],dt:"Customer"},
  {to:"/payments",l:["المدفوعات والمقبوضات","Payments"],dt:"Payment Entry"},
  {to:"/promotions",l:["العروض والخصومات","Promotions"],dt:"Pricing Rule"}]},
 {id:"pos",icon:"cart",l:["نقاط البيع","Point of sale"],k:[
  {to:"/pos",l:["فتح الكاشير","Open the till"],ext:"/pos",app:"pos_next"},
  {to:"/pos-profiles",l:["ملفات نقاط البيع","POS profiles"],dt:"POS Profile"},
  {to:"/pos-shifts",l:["ورديات الكاشير","Cashier shifts"],dt:"POS Opening Shift"},
  {to:"/pos-closings",l:["إغلاق الورديات","Shift closings"],dt:"POS Closing Shift"}]},
 {id:"stock",icon:"stock",l:["المنتجات والمخزون","Products & stock"],k:[
  {to:"/items",l:["المنتجات","Items"],dt:"Item"},
  {to:"/item-groups",l:["الفئات","Categories"],dt:"Item Group"},
  {to:"/brands",l:["الماركات","Brands"],dt:"Brand"},
  {to:"/warehouses",l:["المستودعات","Warehouses"],dt:"Warehouse"},
  {to:"/stock-entries",l:["حركات المخزون","Stock entries"],dt:"Stock Entry"},
  {to:"/stock-counts",l:["جرد المخزون","Stock counts"],dt:"Stock Reconciliation"},
  {to:"/price-lists",l:["قوائم الأسعار","Price lists"],dt:"Price List"}]},
 {id:"buy",icon:"buy",l:["المشتريات والموردين","Purchases & suppliers"],k:[
  {to:"/purchase-orders",l:["أوامر الشراء","Purchase orders"],dt:"Purchase Order"},
  {to:"/purchase-invoices",l:["فواتير المشتريات","Purchase invoices"],dt:"Purchase Invoice"},
  {to:"/suppliers",l:["الموردون","Suppliers"],dt:"Supplier"}]},
 {id:"acc",icon:"acc",l:["المحاسبة","Accounting"],k:[
  {to:"/journal-entries",l:["القيود اليومية","Journal entries"],dt:"Journal Entry"},
  {to:"/accounts",l:["شجرة الحسابات","Chart of accounts"],dt:"Account"},
  {to:"/cost-centers",l:["مراكز التكلفة","Cost centers"],dt:"Cost Center"},
  {to:"/zatca",l:["الفوترة الإلكترونية","E-invoicing"],dt:"Sales Invoice Additional Fields",app:"zatca"}]},
 {to:"/reports",icon:"rep",l:["التقارير","Reports"]},
 {id:"set",icon:"set",l:["الإعدادات","Settings"],k:[
  {to:"/settings",l:["كل الإعدادات","All settings"]},
  {to:"/users",l:["المستخدمون والصلاحيات","Users & roles"],admin:1},
  {to:"company",l:["بيانات الشركة","Company"],dt:"Company"},
  {to:"/sales-taxes",l:["الضرائب","Taxes"],dt:"Sales Taxes and Charges Template"},
  {to:"/payment-methods",l:["طرق الدفع","Payment methods"],dt:"Mode of Payment"},
  {to:"/territories",l:["المناطق","Territories"],dt:"Territory"}]}
];
/* more tiles on the settings page */
AMY.cfg.settings.splice(2,0,
 {to:"/pos-profiles",icon:"cart",l:["ملفات نقاط البيع","POS profiles"],d:["مستودع الكاشير وطرق الدفع ومن يستخدمه.","Till warehouse, payment methods and cashiers."],dt:"POS Profile"},
 {to:"/promotions",icon:"gift",l:["العروض والخصومات","Promotions"],d:["خصومات تلقائية على المنتجات.","Automatic discounts on products."],dt:"Pricing Rule"},
 {to:"/brands",icon:"tag",l:["الماركات","Brands"],d:["ماركات المنتجات.","Product brands."],dt:"Brand"},
 {to:"/cost-centers",icon:"building",l:["مراكز التكلفة","Cost centers"],d:["توزيع الإيرادات والمصروفات.","Split income and expenses."],dt:"Cost Center"},
 {to:"/territories",icon:"globe",l:["المناطق","Territories"],d:["مناطق العملاء.","Customer regions."],dt:"Territory"});

/* ---------- quick setup: make the system ready to trade in one click ---------- */
var V = AMY.views;
function setupText(ar){ return ar? {
  title:"التهيئة السريعة", sub:"يفحص النظام ويضيف الناقص فقط: ضريبة 15%، طرق الدفع، المستودع، ملف الكاشير. لا يغيّر أي شيء موجود.",
  run:"جهّز النظام تلقائيًا", running:"جارٍ التجهيز…", ready:"النظام جاهز للبيع والشراء.", done:"تم التجهيز", missing:" بنود تحتاج تجهيز",
  zatca:"ربط الفوترة الإلكترونية مع هيئة الزكاة خطوة منفصلة تتم مرة واحدة.", zbtn:"فتح إعداد الفوترة الإلكترونية", fail:"تعذّر تجهيز بعض البنود، راجع سجل الأخطاء."
 } : {
  title:"Quick setup", sub:"Checks the system and adds only what is missing: 15% VAT, payment methods, warehouse, the till profile. Nothing existing is changed.",
  run:"Set up automatically", running:"Setting up…", ready:"The system is ready to sell and buy.", done:"Set up", missing:" items need setup",
  zatca:"Connecting e-invoicing to the tax authority is a separate one-time step.", zbtn:"Open e-invoicing setup", fail:"Some items could not be set up. Check the error log."
 };
}
V.setup = function(root){
  var ar = AMY.lang==="ar", T = setupText(ar), box = h("div");
  AMY.setTitle(T.title);
  root.appendChild(AMY.pageHeader({title:T.title, sub:T.sub}));
  root.appendChild(box);
  function paint(st){
    AMY.clear(box);
    var bad = st.checks.filter(function(x){ return !x.ok }).length;
    box.appendChild(h("div",{class:"note "+(bad?"warn":"ok")}, h("b",{text:bad? bad+T.missing : T.ready}),
      bad? h("button",{class:"btn p",type:"button",onclick:run},AMY.icon("check"),T.run) : null));
    var ul = h("ul",{class:"chk-list"});
    st.checks.forEach(function(x){ ul.appendChild(h("li",{class:x.ok?"ok":"no"}, h("i",null,AMY.icon(x.ok?"check":"clock")), h("span",{text:ar?x.ar:x.en}))) });
    box.appendChild(ul);
    if(st.zatca) box.appendChild(h("div",{class:"hd",style:"margin-top:36px"},h("h2",{text:"ZATCA"}),h("p",{class:"mut",text:T.zatca}),h("a",{class:"btn g",href:"#/e-invoicing"},AMY.icon("shield"),T.zbtn)));
  }
  function run(){
    var b = box.querySelector(".note .btn"); if(b){ b.disabled = true; b.lastChild.textContent = T.running }
    AMY.rest("quick_setup",{}).then(function(st){ paint(st); if(st.errors && st.errors.length) AMY.toast(T.fail,"bad"); else AMY.toast(T.done,"ok") }).catch(function(e){ AMY.fail(e); load() });
  }
  function load(){ AMY.rest("setup_status",{}).then(paint).catch(AMY.fail) }
  load();
};
var dash = V.dashboard;
V.dashboard = function(root){
  dash(root);
  if(!AMY.boot.is_admin) return;
  AMY.rest("setup_status",{}).then(function(st){
    var bad = st.checks.filter(function(x){ return !x.ok }).length; if(!bad) return;
    var ar = AMY.lang==="ar", T = setupText(ar);
    var n = h("div",{class:"note warn",style:"margin-bottom:28px"}, h("b",{text:bad+T.missing}), h("a",{class:"btn p",href:"#/setup"},AMY.icon("check"),T.run));
    root.insertBefore(n, root.children[1] || null);
  }).catch(function(){});
};
AMY.cfg.nav.forEach(function(g){ if(g.id==="set") g.k.splice(1,0,{to:"/setup",l:["التهيئة السريعة","Quick setup"],admin:1}) });
AMY.cfg.settings.unshift({to:"/setup",icon:"check",l:["التهيئة السريعة","Quick setup"],d:["جهّز الضريبة وطرق الدفع والمستودع وملف الكاشير بضغطة.","Set up VAT, payment methods, warehouse and the till in one click."],admin:1});

/* ---------- command palette (Ctrl K): jump to any page, create anything, find records ---------- */
(function(){
  var ar = function(){ return AMY.lang==="ar" };
  var RECORDS = [["Customer","customers","customer_name",["name","customer_name","mobile_no"]],["Item","items","item_name",["name","item_name","item_code"]],
    ["Supplier","suppliers","supplier_name",["name","supplier_name"]],["Sales Invoice","sales-invoices","customer_name",["name","customer_name"]]];
  function pages(){
    var out = [];
    Object.keys(AMY.cfg.docs).forEach(function(dt){
      var c = AMY.cfg.docs[dt], p = AMY.boot.perms[dt]; if(!p || !p.read) return;
      out.push({t:AMY.lb(c.plural), hint:ar()?"صفحة":"Page", go:"/"+c.slug, icon:c.icon||"list"});
      if(p.create && !c.noNew) out.push({t:AMY.lb(c.newLabel||c.label), hint:ar()?"إنشاء":"Create", go:"/"+c.slug+"/new", icon:"plus"});
    });
    [["/reports",["التقارير","Reports"]],["/settings",["الإعدادات","Settings"]],["/users",["المستخدمون والصلاحيات","Users & roles"]],["/setup",["التهيئة السريعة","Quick setup"]],["/expenses",["المصروفات","Expenses"]],["/chart",["شجرة الحسابات","Chart of accounts"]],["/vat",["الإقرار الضريبي","VAT return"]],["/tax-types",["أنواع الضريبة","Tax types"]],["/industry",["نوع النشاط","Business type"]],["/e-invoicing",["الفوترة الإلكترونية","E-invoicing"]]].forEach(function(x){
      if((x[0]==="/users"||x[0]==="/setup"||x[0]==="/e-invoicing"||x[0]==="/industry") && !AMY.boot.is_admin) return;
      out.push({t:AMY.lb(x[1]), hint:ar()?"صفحة":"Page", go:x[0], icon:x[0]==="/reports"?"rep":"set"});
    });
    return out;
  }
  function open(){
    var ov = h("div",{class:"ov pal"}), box = h("div",{class:"palbox"}), inp = h("input",{class:"palin",type:"text",placeholder:ar()?"ابحث عن صفحة أو عميل أو منتج أو فاتورة…":"Search pages, customers, items, invoices…",autocomplete:"off"}), list = h("div",{class:"pall"});
    box.appendChild(h("div",{class:"palhd"},AMY.icon("search"),inp,h("kbd",{text:"Esc"}))); box.appendChild(list); ov.appendChild(box); document.body.appendChild(ov);
    var items = [], sel = 0, token = 0, all = pages();
    function close(){ document.removeEventListener("keydown",key,true); ov.remove() }
    function pick(i){ var it = items[i]; if(!it) return; close(); AMY.go(it.go) }
    function draw(){
      AMY.clear(list);
      if(!items.length){ list.appendChild(h("div",{class:"palno",text:ar()?"لا نتائج":"No results"})); return }
      items.forEach(function(it,i){
        list.appendChild(h("button",{type:"button",class:i===sel?"on":"",onclick:function(){ pick(i) },onmousemove:function(){ if(sel!==i){ sel=i; draw() } }},
          AMY.icon(it.icon||"list"), h("span",{class:"t",text:it.t}), it.sub? h("span",{class:"mut",text:it.sub}) : null, h("em",{text:it.hint})));
      });
      var on = list.querySelector(".on"); if(on && on.scrollIntoView) on.scrollIntoView({block:"nearest"});
    }
    function run(){
      var q = inp.value.trim().toLowerCase(), my = ++token;
      items = (q? all.filter(function(x){ return x.t.toLowerCase().indexOf(q)>=0 }) : all.filter(function(x){ return x.hint===(ar()?"صفحة":"Page") }).slice(0,8)).slice(0,8);
      sel = 0; draw();
      if(q.length<2) return;
      RECORDS.forEach(function(r){
        if(!(AMY.boot.perms[r[0]] && AMY.boot.perms[r[0]].read)) return;
        AMY.rest("list_docs",{doctype:r[0],fields:["name",r[2]],search:q,search_fields:r[3],limit:4}).then(function(res){
          if(my!==token) return;
          res.rows.forEach(function(x){ items.push({t:x[r[2]]||x.name, sub:x[r[2]] && x[r[2]]!==x.name? x.name : "", hint:AMY.lb(AMY.cfg.docs[r[0]].label), go:"/"+r[1]+"/"+encodeURIComponent(x.name), icon:AMY.cfg.docs[r[0]].icon}) });
          draw();
        }).catch(function(){});
      });
    }
    function key(e){
      if(e.key==="Escape"){ e.preventDefault(); close() }
      else if(e.key==="ArrowDown"){ e.preventDefault(); sel = Math.min(items.length-1, sel+1); draw() }
      else if(e.key==="ArrowUp"){ e.preventDefault(); sel = Math.max(0, sel-1); draw() }
      else if(e.key==="Enter"){ e.preventDefault(); pick(sel) }
    }
    ov.addEventListener("mousedown",function(e){ if(e.target===ov) close() });
    document.addEventListener("keydown",key,true); inp.addEventListener("input",run); run(); inp.focus();
  }
  var host = document.querySelector(".top>.in"), anchor = document.getElementById("ptitle");
  if(host && anchor){
    var b = h("button",{type:"button",class:"palbtn",id:"palBtn",onclick:open}, AMY.icon("search"), h("span",{id:"palTxt"}), h("kbd",{text:"Ctrl K"}));
    host.insertBefore(b, anchor);
    var setTxt = function(){ document.getElementById("palTxt").textContent = ar()? "ابحث أو انتقل إلى…" : "Search or jump to…" };
    setTxt(); document.getElementById("lang").addEventListener("click",function(){ setTimeout(setTxt,0) });
  }
  document.addEventListener("keydown",function(e){ if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="k"){ e.preventDefault(); if(!document.querySelector(".pal")) open() } });
})();

/* ---------- related documents: everything a record is tied to, one click away ---------- */
var REL = {
 payments:["الدفعات والمقبوضات","Payments"], returns:["المرتجعات","Returns"], original:["الفاتورة الأصلية","Original invoice"], source:["المستند المصدر","Source document"],
 zatca:["الفوترة الإلكترونية","E-invoicing"], orders:["أوامر","Orders"], invoices:["الفواتير","Invoices"], quotes:["عروض الأسعار","Quotations"],
 sold:["آخر مبيعات المنتج","Recent sales"], bought:["آخر مشتريات المنتج","Recent purchases"], shifts:["آخر الورديات","Recent shifts"]};
AMY.relatedPanel = function(dt, doc, root){
  if(["Sales Invoice","Purchase Invoice","Sales Order","Purchase Order","Quotation","Customer","Supplier","Item","POS Profile"].indexOf(dt)<0) return;
  var ar = AMY.lang==="ar", host = h("div");
  root.appendChild(host);
  AMY.rest("related",{doctype:dt,name:doc.name}).then(function(r){
    var cur = (AMY.boot && AMY.boot.currency) || "";
    if(r.summary && r.summary.length){
      var inv = dt==="Customer"? "/sales-invoices" : "/purchase-invoices", strip = h("div",{class:"gd k4 sm",style:"grid-template-columns:repeat(2,1fr);margin-bottom:8px"});
      r.summary.forEach(function(x){
        strip.appendChild(h("div",{class:"card kpi"}, h("div",{class:"l",text:x.k==="billed"? (ar?"إجمالي الفواتير":"Total billed") : (ar?"المستحق (غير مسدد)":"Outstanding")}),
          h("div",{class:"v"},AMY.num(x.v,x.v>=1000?0:2),h("small",{text:cur})), h("div",{class:"c",text:x.n+" "+(ar?"فاتورة":"invoices")})));
      });
      host.appendChild(strip);
    }
    (r.groups||[]).forEach(function(g){
      var c = AMY.cfg.docs[g.dt]; if(!c) return;
      var title = REL[g.key]? AMY.lb(REL[g.key]) : AMY.lb(c.plural);
      if(g.key==="orders"||g.key==="invoices") title = AMY.lb(c.plural);
      var tb = h("tbody");
      g.rows.forEach(function(x){
        tb.appendChild(h("tr",{class:"go",onclick:function(){ AMY.go("/"+c.slug+"/"+encodeURIComponent(x.name)) }},
          h("td",{class:"nm num",text:x.name}), h("td",{class:"mut",text:x.title||""}), h("td",{class:"mut",text:x.date? AMY.date(x.date) : ""}),
          h("td",{class:"num end",text:x.amount? AMY.num(x.amount,2)+" "+cur : ""}),
          h("td",null, x.status? AMY.statusPill(x.status) : AMY.docPill(x.docstatus))));
      });
      host.appendChild(h("div",{class:"card flush sec rel"}, h("div",{class:"hd"},h("h2",null,h("span",{text:title}))), h("div",{class:"scroll"},h("table",{class:"tbl"},tb))));
    });
  }).catch(function(){});
};
})();
