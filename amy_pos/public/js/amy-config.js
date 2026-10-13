/* AMY console - what each screen contains. Labels are [Arabic, English]. */
(function(){
"use strict";
var AMY = window.AMY, docs = {};
AMY.cfg.docs = docs;

function whs(doc){ return {company:doc.company, is_group:0} }
function chips(list){ return list }
var ALL = ["الكل","All"];

/* ---------- shared pieces ---------- */
function invoiceItemCols(){
  return [
   {f:"item_code",t:"link",dt:"Item",l:["الصنف","Item"],w:"26%",req:1},
   {f:"qty",t:"float",l:["الكمية","Qty"],w:"9%",req:1},
   {f:"uom",t:"link",dt:"UOM",l:["الوحدة","Unit"],w:"11%"},
   {f:"rate",t:"money",l:["السعر","Rate"],w:"12%",req:1},
   {f:"discount_percentage",t:"percent",l:["خصم %","Disc %"],w:"8%"},
   {f:"amount",t:"calc",l:["الإجمالي","Amount"],w:"13%"},
   {f:"warehouse",t:"link",dt:"Warehouse",l:["المستودع","Warehouse"],w:"21%",filters:function(doc){ return whs(doc) }},
   {f:"batch_no",t:"link",dt:"Batch",l:["الدفعة","Batch"],w:"14%",show:function(doc){ return (AMY.boot.industry==="pharmacy") || (doc.items||[]).some(function(r){ return r.batch_no }) },filters:function(doc, row){ return row && row.item_code? {item:row.item_code} : {} }}
  ];
}
function invoicePanel(party){
  return function(doc, root){
    var h = AMY.h, body = h("tbody"), card = h("div",{class:"card flush sec"});
    var isC = party==="customer", dt = isC? "Sales Invoice" : "Purchase Invoice", slug = isC? "sales-invoices" : "purchase-invoices";
    if(!(AMY.boot.perms[dt] && AMY.boot.perms[dt].read)) return;
    card.appendChild(h("div",{class:"hd"}, h("h2",{style:"margin:0"}, h("span",{text:AMY.lang==="ar"?"آخر الفواتير":"Recent invoices"}))));
    card.appendChild(h("div",{class:"scroll"}, h("table",{class:"tbl"}, body)));
    root.appendChild(card);
    var f = {docstatus:["<",2]}; f[party] = doc.name;
    AMY.rest("list_docs",{doctype:dt,fields:["name","posting_date","grand_total","outstanding_amount","status"],filters:f,order_by:"creation desc",limit:8}).then(function(r){
      if(!r.rows.length) body.appendChild(h("tr",null,h("td",{class:"empty",text:AMY.t("noData")})));
      r.rows.forEach(function(x){
        body.appendChild(h("tr",{class:"go",onclick:function(){ AMY.go("/"+slug+"/"+encodeURIComponent(x.name)) }},
          h("td",{class:"nm num",text:x.name}), h("td",{class:"mut",text:AMY.date(x.posting_date)}),
          h("td",{class:"num end",text:AMY.money(x.grand_total)}), h("td",null,AMY.statusPill(x.status))));
      });
    }).catch(function(){});
  };
}

/* ---------- Sales Invoice ---------- */
docs["Sales Invoice"] = {
 slug:"sales-invoices", icon:"sales", label:["فاتورة مبيعات","Sales invoice"], plural:["فواتير المبيعات","Sales invoices"],
 newLabel:["فاتورة جديدة","New invoice"], newTitle:["فاتورة مبيعات جديدة","New sales invoice"],
 submittable:true, invoice:true, print:true, search:["name","customer_name"], order:"creation desc",
 fields:["customer_name","posting_date","grand_total","outstanding_amount","status","is_return"],
 cols:[{f:"name",l:["رقم الفاتورة","Invoice"],t:"num"},{f:"customer_name",l:["العميل","Customer"]},{f:"posting_date",l:["التاريخ","Date"],t:"date"},
  {f:"grand_total",l:["الإجمالي","Total"],t:"money",end:1},{f:"outstanding_amount",l:["المتبقي","Outstanding"],t:"money",end:1},{f:"status",l:["الحالة","Status"],t:"status"}],
 chips:[{l:ALL,filters:{}},{l:["غير مدفوعة","Unpaid"],filters:{docstatus:1,status:["in",["Unpaid","Overdue","Partly Paid"]]}},
  {l:["مدفوعة","Paid"],filters:{status:"Paid"}},{l:["مسودات","Drafts"],filters:{docstatus:0}},{l:["مرتجعات","Returns"],filters:{is_return:1}}],
 sections:[
  {fields:[
   {f:"customer",t:"link",dt:"Customer",l:["العميل","Customer"],req:1,span:2},
   {f:"posting_date",t:"date",l:["التاريخ","Date"],req:1},{f:"due_date",t:"date",l:["تاريخ الاستحقاق","Due date"]},
   {f:"set_warehouse",t:"link",dt:"Warehouse",l:["المستودع","Warehouse"],span:2,filters:whs},
   {f:"selling_price_list",t:"link",dt:"Price List",l:["قائمة الأسعار","Price list"],filters:function(){ return {selling:1} }},
   {f:"taxes_and_charges",t:"link",dt:"Sales Taxes and Charges Template",l:["قالب الضريبة","Tax template"],filters:function(doc){ return {company:doc.company} }},
   {f:"update_stock",t:"check",l:["خصم المخزون مع الفاتورة","Deduct stock with this invoice"],span:2},
   {f:"return_against",t:"ro",l:["مرتجع على فاتورة","Return against"],dep:function(d){ return d.is_return }}]},
  {title:["الأصناف","Items"],totals:true,fields:[{t:"table",f:"items"}]},
  {title:["إضافات","More"],fields:[
   {f:"discount_amount",t:"money",l:["خصم إضافي","Extra discount"]},
   {f:"apply_discount_on",t:"select",l:["يُطبّق على","Apply on"],opts:[["Grand Total",["الإجمالي النهائي","Grand total"]],["Net Total",["الإجمالي قبل الضريبة","Net total"]]]},
   {f:"remarks",t:"text",l:["ملاحظات","Notes"],span:2}]}],
 tables:[{f:"items",l:["الأصناف","Items"],min:1,cols:invoiceItemCols(),newRow:function(){ return {qty:1} }}],
 onChange:function(f, doc, form){
  if(f==="taxes_and_charges") doc.taxes = [];
  if(["taxes_and_charges","discount_amount","apply_discount_on","selling_price_list","customer"].indexOf(f)>=0) form.preview();
 }
};

/* ---------- Purchase Invoice ---------- */
docs["Purchase Invoice"] = {
 slug:"purchase-invoices", icon:"buy", label:["فاتورة مشتريات","Purchase invoice"], plural:["فواتير المشتريات","Purchase invoices"],
 newLabel:["فاتورة جديدة","New invoice"], newTitle:["فاتورة مشتريات جديدة","New purchase invoice"],
 submittable:true, invoice:true, print:true, search:["name","supplier_name","bill_no"], order:"creation desc",
 fields:["supplier_name","posting_date","grand_total","outstanding_amount","status","is_return","bill_no"],
 cols:[{f:"name",l:["رقم الفاتورة","Invoice"],t:"num"},{f:"supplier_name",l:["المورد","Supplier"]},{f:"bill_no",l:["فاتورة المورد","Supplier ref."],t:"num"},
  {f:"posting_date",l:["التاريخ","Date"],t:"date"},{f:"grand_total",l:["الإجمالي","Total"],t:"money",end:1},{f:"outstanding_amount",l:["المتبقي","Outstanding"],t:"money",end:1},{f:"status",l:["الحالة","Status"],t:"status"}],
 chips:[{l:ALL,filters:{}},{l:["غير مدفوعة","Unpaid"],filters:{docstatus:1,status:["in",["Unpaid","Overdue","Partly Paid"]]}},
  {l:["مدفوعة","Paid"],filters:{status:"Paid"}},{l:["مسودات","Drafts"],filters:{docstatus:0}},{l:["مرتجعات","Returns"],filters:{is_return:1}}],
 sections:[
  {fields:[
   {f:"supplier",t:"link",dt:"Supplier",l:["المورد","Supplier"],req:1,span:2},
   {f:"posting_date",t:"date",l:["التاريخ","Date"],req:1},{f:"due_date",t:"date",l:["تاريخ الاستحقاق","Due date"]},
   {f:"bill_no",t:"data",l:["رقم فاتورة المورد","Supplier invoice no."]},{f:"bill_date",t:"date",l:["تاريخ فاتورة المورد","Supplier invoice date"]},
   {f:"set_warehouse",t:"link",dt:"Warehouse",l:["المستودع","Warehouse"],filters:whs},
   {f:"buying_price_list",t:"link",dt:"Price List",l:["قائمة الأسعار","Price list"],filters:function(){ return {buying:1} }},
   {f:"taxes_and_charges",t:"link",dt:"Purchase Taxes and Charges Template",l:["قالب الضريبة","Tax template"],span:2,filters:function(doc){ return {company:doc.company} }},
   {f:"update_stock",t:"check",l:["إضافة للمخزون مع الفاتورة","Add to stock with this invoice"],span:2}]},
  {title:["الأصناف","Items"],totals:true,fields:[{t:"table",f:"items"}]},
  {title:["إضافات","More"],fields:[
   {f:"discount_amount",t:"money",l:["خصم إضافي","Extra discount"]},
   {f:"apply_discount_on",t:"select",l:["يُطبّق على","Apply on"],opts:[["Grand Total",["الإجمالي النهائي","Grand total"]],["Net Total",["الإجمالي قبل الضريبة","Net total"]]]},
   {f:"remarks",t:"text",l:["ملاحظات","Notes"],span:2}]}],
 tables:[{f:"items",l:["الأصناف","Items"],min:1,cols:invoiceItemCols(),newRow:function(){ return {qty:1} }}],
 onChange:function(f, doc, form){
  if(f==="taxes_and_charges") doc.taxes = [];
  if(["taxes_and_charges","discount_amount","apply_discount_on","buying_price_list","supplier"].indexOf(f)>=0) form.preview();
 }
};

/* ---------- Payments ---------- */
docs["Payment Entry"] = {
 slug:"payments", icon:"cash", label:["سند","Payment"], plural:["المدفوعات والمقبوضات","Payments"],
 newLabel:["سند جديد","New payment"], newTitle:["سند قبض / دفع جديد","New payment"],
 submittable:true, print:true, search:["name","party_name","party","reference_no"], order:"creation desc",
 fields:["payment_type","party","party_name","posting_date","mode_of_payment","paid_amount"],
 cols:[{f:"name",l:["رقم السند","Voucher"],t:"num"},
  {f:"payment_type",l:["النوع","Type"],render:function(r){ return AMY.h("span",{class:"pill "+(r.payment_type==="Receive"?"ok":"warn"),text:r.payment_type==="Receive"?(AMY.lang==="ar"?"قبض":"Received"):(AMY.lang==="ar"?"دفع":"Paid")}) }},
  {f:"party_name",l:["الطرف","Party"],render:function(r){ return document.createTextNode(r.party_name||r.party||"") }},
  {f:"posting_date",l:["التاريخ","Date"],t:"date"},{f:"mode_of_payment",l:["طريقة الدفع","Method"]},
  {f:"paid_amount",l:["المبلغ","Amount"],t:"money",end:1},{f:"docstatus",l:["الحالة","Status"],t:"docstatus"}],
 chips:[{l:ALL,filters:{}},{l:["قبض","Received"],filters:{payment_type:"Receive"}},{l:["دفع","Paid"],filters:{payment_type:"Pay"}},{l:["مسودات","Drafts"],filters:{docstatus:0}}],
 sections:[
  {fields:[
   {f:"payment_type",t:"select",l:["نوع السند","Type"],newOnly:1,opts:[["Receive",["قبض من عميل","Receive from customer"]],["Pay",["دفع لمورد","Pay supplier"]]]},
   {f:"party_type",t:"select",l:["نوع الطرف","Party type"],newOnly:1,opts:[["Customer",["عميل","Customer"]],["Supplier",["مورد","Supplier"]]]},
   {f:"party",t:"link",dt:function(d){ return d.party_type||"Customer" },l:["الطرف","Party"],req:1,span:2,newOnly:1},
   {f:"posting_date",t:"date",l:["التاريخ","Date"],req:1},
   {f:"mode_of_payment",t:"link",dt:"Mode of Payment",l:["طريقة الدفع","Payment method"],req:1},
   {f:"paid_amount",t:"money",l:["المبلغ","Amount"],req:1},
   {f:"reference_no",t:"data",l:["رقم المرجع / الشيك","Reference no."]},
   {f:"reference_date",t:"date",l:["تاريخ المرجع","Reference date"]},
   {f:"remarks",t:"text",l:["ملاحظات","Notes"],span:4}]},
  {title:["الفواتير المسددة","Settled invoices"],show:function(d){ return (d.references||[]).length>0 },fields:[{t:"table",f:"references"}]}],
 tables:[{f:"references",l:["الفواتير","Invoices"],fixed:1,key:"reference_name",open:function(r){ var c = AMY.cfg.docs[r.reference_doctype]; return c && r.reference_name? "/"+c.slug+"/"+encodeURIComponent(r.reference_name) : "" },cols:[
  {f:"reference_doctype",t:"data",l:["النوع","Type"],ro:1,w:"18%"},{f:"reference_name",t:"data",l:["الفاتورة","Invoice"],ro:1,w:"24%"},
  {f:"total_amount",t:"money",l:["الإجمالي","Total"],ro:1,w:"18%"},{f:"outstanding_amount",t:"money",l:["المتبقي","Outstanding"],ro:1,w:"18%"},
  {f:"allocated_amount",t:"money",l:["المسدد الآن","Allocated"],w:"18%"}]}],
 onChange:function(f, doc, form){
  if(f==="payment_type"){ form.set("party_type", doc.payment_type==="Receive"?"Customer":"Supplier"); form.set("party",""); doc.references=[] }
  if(f==="party_type"){ form.set("party","") }
  if(f==="paid_amount"){ doc.received_amount = doc.paid_amount }
 }
};

/* ---------- Customer / Supplier ---------- */
var partyContact = [
  {f:"_mobile",t:"data",l:["الجوال","Mobile"],dir:"ltr"},{f:"_email",t:"data",l:["البريد الإلكتروني","Email"],dir:"ltr"},
  {f:"_address_line1",t:"data",l:["العنوان","Address"],span:2},{f:"_city",t:"data",l:["المدينة","City"]},{f:"_country",t:"link",dt:"Country",l:["الدولة","Country"]}];
docs["Customer"] = {
 slug:"customers", icon:"users", label:["عميل","Customer"], plural:["العملاء","Customers"], newLabel:["عميل جديد","New customer"], newTitle:["عميل جديد","New customer"],
 search:["name","customer_name","mobile_no","tax_id"], fields:["customer_name","customer_group","mobile_no","email_id","tax_id","disabled","loyalty_program"],
 cols:[{f:"customer_name",l:["العميل","Customer"]},{f:"mobile_no",l:["الجوال","Mobile"],t:"num"},{f:"tax_id",l:["الرقم الضريبي","Tax ID"],t:"num"},{f:"customer_group",l:["المجموعة","Group"]},{f:"disabled",l:["الحالة","Status"],render:function(r){ return AMY.statusPill(Number(r.disabled)?"Inactive":"Active") }}],
 chips:[{l:["النشطون","Active"],filters:{disabled:0}},{l:ALL,filters:{}},{l:["الموقوفون","Inactive"],filters:{disabled:1}}],
 sections:[
  {title:["بيانات العميل","Customer details"],fields:[
   {f:"customer_name",t:"data",l:["اسم العميل","Customer name"],req:1,span:2},
   {f:"customer_type",t:"select",l:["النوع","Type"],opts:[["Company",["شركة","Company"]],["Individual",["فرد","Individual"]]]},
   {f:"customer_group",t:"link",dt:"Customer Group",l:["المجموعة","Group"],req:1},
   {f:"loyalty_program",t:"link",dt:"Loyalty Program",l:["برنامج الولاء","Loyalty program"]},
   {f:"territory",t:"link",dt:"Territory",l:["المنطقة","Territory"],req:1},
   {f:"tax_id",t:"data",l:["الرقم الضريبي","Tax ID"],dir:"ltr"},
   {f:"default_price_list",t:"link",dt:"Price List",l:["قائمة الأسعار","Price list"]},
   {f:"disabled",t:"check",l:["موقوف","Inactive"]}]},
  {title:["التواصل والعنوان","Contact & address"],fields:partyContact}],
 panels:[invoicePanel("customer")]
};
docs["Supplier"] = {
 slug:"suppliers", icon:"buy", label:["مورد","Supplier"], plural:["الموردون","Suppliers"], newLabel:["مورد جديد","New supplier"], newTitle:["مورد جديد","New supplier"],
 search:["name","supplier_name","mobile_no","tax_id"], fields:["supplier_name","supplier_group","mobile_no","email_id","tax_id","disabled"],
 cols:[{f:"supplier_name",l:["المورد","Supplier"]},{f:"mobile_no",l:["الجوال","Mobile"],t:"num"},{f:"tax_id",l:["الرقم الضريبي","Tax ID"],t:"num"},{f:"supplier_group",l:["المجموعة","Group"]},{f:"disabled",l:["الحالة","Status"],render:function(r){ return AMY.statusPill(Number(r.disabled)?"Inactive":"Active") }}],
 chips:[{l:["النشطون","Active"],filters:{disabled:0}},{l:ALL,filters:{}},{l:["الموقوفون","Inactive"],filters:{disabled:1}}],
 sections:[
  {title:["بيانات المورد","Supplier details"],fields:[
   {f:"supplier_name",t:"data",l:["اسم المورد","Supplier name"],req:1,span:2},
   {f:"supplier_type",t:"select",l:["النوع","Type"],opts:[["Company",["شركة","Company"]],["Individual",["فرد","Individual"]]]},
   {f:"supplier_group",t:"link",dt:"Supplier Group",l:["المجموعة","Group"],req:1},
   {f:"tax_id",t:"data",l:["الرقم الضريبي","Tax ID"],dir:"ltr"},
   {f:"disabled",t:"check",l:["موقوف","Inactive"]}]},
  {title:["التواصل والعنوان","Contact & address"],fields:partyContact}],
 panels:[invoicePanel("supplier")]
};

/* ---------- Item ---------- */
docs["Item"] = {
 slug:"items", icon:"tag", label:["منتج","Item"], plural:["المنتجات","Items"], newLabel:["منتج جديد","New item"], newTitle:["منتج جديد","New item"],
 search:["name","item_name","item_code","description"], fields:["item_name","item_group","stock_uom","standard_rate","is_stock_item","disabled"],
 cols:[{f:"item_code",l:["الرمز","Code"],t:"num"},{f:"item_name",l:["المنتج","Item"]},{f:"item_group",l:["الفئة","Category"]},{f:"stock_uom",l:["الوحدة","Unit"]},
  {f:"standard_rate",l:["سعر البيع","Price"],t:"money",end:1},{f:"disabled",l:["الحالة","Status"],render:function(r){ return AMY.statusPill(Number(r.disabled)?"Inactive":"Active") }}],
 chips:[{l:["النشطة","Active"],filters:{disabled:0}},{l:["مخزنية","Stock items"],filters:{disabled:0,is_stock_item:1}},{l:["خدمات","Services"],filters:{disabled:0,is_stock_item:0}},{l:ALL,filters:{}},{l:["الموقوفة","Inactive"],filters:{disabled:1}}],
 defaults:function(d){ d._new = 1 },
 sections:[
  {title:["بيانات المنتج","Item details"],fields:[
   {f:"item_code",t:"data",l:["رمز المنتج","Item code"],req:1,newOnly:1,hint:["رمز فريد لا يتغير بعد الحفظ","Unique code, fixed after saving"]},
   {f:"item_name",t:"data",l:["اسم المنتج","Item name"],req:1,span:2},
   {f:"item_group",t:"link",dt:"Item Group",l:["الفئة","Category"],req:1},
   {f:"stock_uom",t:"link",dt:"UOM",l:["وحدة القياس","Unit"],req:1,newOnly:1},
   {f:"is_stock_item",t:"check",l:["يُخزَّن في المستودع","Track stock"]},
   {f:"disabled",t:"check",l:["موقوف","Inactive"]},
   {f:"description",t:"text",l:["الوصف","Description"],span:4},
   {f:"image",t:"image",l:["صورة المنتج","Image"],span:4}]},
  {title:["الأسعار","Pricing"],fields:[
   {f:"standard_rate",t:"money",l:["سعر البيع","Selling price"]},
   {f:"valuation_rate",t:"money",l:["تكلفة الوحدة","Unit cost"],newOnly:1,dep:function(d){ return d._new }},
   {f:"opening_stock",t:"float",l:["رصيد افتتاحي","Opening stock"],dep:function(d){ return d._new && Number(d.is_stock_item) }},
   {f:"_warehouse",t:"link",dt:"Warehouse",l:["مستودع الرصيد الافتتاحي","Opening stock warehouse"],filters:function(d){ return {company:d.company||AMY.boot.company,is_group:0} },dep:function(d){ return d._new && Number(d.opening_stock)>0 }}]},
  {title:["الباركود","Barcodes"],fields:[{t:"table",f:"barcodes"}]}],
 tables:[{f:"barcodes",key:"barcode",l:["الباركود","Barcodes"],cols:[{f:"barcode",t:"data",l:["الباركود","Barcode"],dir:"ltr"}],newRow:function(){ return {} }}],
 panels:[function(doc, root){
  var h=AMY.h, body=h("tbody"), card=h("div",{class:"card flush sec"});
  if(!(AMY.boot.perms["Bin"] && AMY.boot.perms["Bin"].read)) return;
  card.appendChild(h("div",{class:"hd"},h("h2",{style:"margin:0"},h("span",{text:AMY.lang==="ar"?"الرصيد في المستودعات":"Stock by warehouse"}))));
  card.appendChild(h("div",{class:"scroll"},h("table",{class:"tbl"},h("thead",null,h("tr",null,[AMY.lang==="ar"?"المستودع":"Warehouse",AMY.lang==="ar"?"الرصيد":"On hand",AMY.lang==="ar"?"محجوز":"Reserved",AMY.lang==="ar"?"القيمة":"Value"].map(function(x,i){ return h("th",{class:i?"end":"",text:x}) }))),body)));
  root.appendChild(card);
  AMY.rest("list_docs",{doctype:"Bin",fields:["warehouse","actual_qty","reserved_qty","stock_value"],filters:{item_code:doc.name},limit:50}).then(function(r){
    if(!r.rows.length) body.appendChild(h("tr",null,h("td",{colspan:4,class:"empty",text:AMY.t("noData")})));
    r.rows.forEach(function(x){ body.appendChild(h("tr",null,h("td",{text:x.warehouse}),h("td",{class:"num end",text:AMY.num(x.actual_qty)}),h("td",{class:"num end",text:AMY.num(x.reserved_qty)}),h("td",{class:"num end",text:AMY.num(x.stock_value,0)}))) });
  }).catch(function(){});
 }]
};

/* ---------- small masters ---------- */
function master(dt, o){ docs[dt] = o }
master("Item Group",{slug:"item-groups",icon:"layers",label:["فئة","Category"],plural:["فئات المنتجات","Item categories"],newLabel:["فئة جديدة","New category"],newTitle:["فئة جديدة","New category"],
 search:["name"],fields:["parent_item_group","is_group"],
 cols:[{f:"name",l:["الفئة","Category"]},{f:"parent_item_group",l:["تتبع","Parent"]},{f:"is_group",l:["مجموعة","Group"],t:"check"}],
 sections:[{fields:[{f:"item_group_name",t:"data",l:["اسم الفئة","Category name"],req:1,span:2,newOnly:1},{f:"parent_item_group",t:"link",dt:"Item Group",l:["تتبع فئة","Parent category"],req:1,filters:function(){ return {is_group:1} }},{f:"is_group",t:"check",l:["فئة رئيسية (تحتها فئات)","Has sub-categories"]}]}]});
master("Warehouse",{slug:"warehouses",icon:"warehouse",label:["مستودع","Warehouse"],plural:["المستودعات","Warehouses"],newLabel:["مستودع جديد","New warehouse"],newTitle:["مستودع جديد","New warehouse"],
 search:["name","warehouse_name"],fields:["warehouse_name","parent_warehouse","is_group","disabled"],
 cols:[{f:"name",l:["المستودع","Warehouse"]},{f:"parent_warehouse",l:["يتبع","Parent"]},{f:"is_group",l:["مجموعة","Group"],t:"check"},{f:"disabled",l:["الحالة","Status"],render:function(r){ return AMY.statusPill(Number(r.disabled)?"Inactive":"Active") }}],
 chips:[{l:["النشطة","Active"],filters:{disabled:0}},{l:ALL,filters:{}}],
 sections:[{fields:[{f:"warehouse_name",t:"data",l:["اسم المستودع","Warehouse name"],req:1,span:2,newOnly:1},
  {f:"parent_warehouse",t:"link",dt:"Warehouse",l:["يتبع","Parent"],filters:function(d){ return {company:d.company,is_group:1} }},
  {f:"is_group",t:"check",l:["مجموعة مستودعات","Group"]},{f:"disabled",t:"check",l:["موقوف","Inactive"]}]}]});
master("UOM",{slug:"units",icon:"list",label:["وحدة","Unit"],plural:["وحدات القياس","Units"],newLabel:["وحدة جديدة","New unit"],newTitle:["وحدة جديدة","New unit"],
 search:["name"],fields:["enabled","must_be_whole_number"],cols:[{f:"name",l:["الوحدة","Unit"]},{f:"must_be_whole_number",l:["أعداد صحيحة فقط","Whole numbers"],t:"check"},{f:"enabled",l:["مفعّلة","Enabled"],t:"check"}],
 sections:[{fields:[{f:"uom_name",t:"data",l:["اسم الوحدة","Unit name"],req:1,newOnly:1,span:2},{f:"must_be_whole_number",t:"check",l:["أعداد صحيحة فقط","Whole numbers only"]},{f:"enabled",t:"check",l:["مفعّلة","Enabled"]}]}]});
master("Customer Group",{slug:"customer-groups",icon:"users",label:["مجموعة عملاء","Customer group"],plural:["مجموعات العملاء","Customer groups"],newLabel:["مجموعة جديدة","New group"],newTitle:["مجموعة عملاء جديدة","New customer group"],
 search:["name"],fields:["parent_customer_group","is_group"],cols:[{f:"name",l:["المجموعة","Group"]},{f:"parent_customer_group",l:["تتبع","Parent"]}],
 sections:[{fields:[{f:"customer_group_name",t:"data",l:["الاسم","Name"],req:1,newOnly:1,span:2},{f:"parent_customer_group",t:"link",dt:"Customer Group",l:["تتبع","Parent"],req:1,filters:function(){ return {is_group:1} }},{f:"is_group",t:"check",l:["مجموعة رئيسية","Is a parent group"]}]}]});
master("Supplier Group",{slug:"supplier-groups",icon:"buy",label:["مجموعة موردين","Supplier group"],plural:["مجموعات الموردين","Supplier groups"],newLabel:["مجموعة جديدة","New group"],newTitle:["مجموعة موردين جديدة","New supplier group"],
 search:["name"],fields:["parent_supplier_group","is_group"],cols:[{f:"name",l:["المجموعة","Group"]},{f:"parent_supplier_group",l:["تتبع","Parent"]}],
 sections:[{fields:[{f:"supplier_group_name",t:"data",l:["الاسم","Name"],req:1,newOnly:1,span:2},{f:"parent_supplier_group",t:"link",dt:"Supplier Group",l:["تتبع","Parent"],req:1,filters:function(){ return {is_group:1} }},{f:"is_group",t:"check",l:["مجموعة رئيسية","Is a parent group"]}]}]});
master("Price List",{slug:"price-lists",icon:"tag",label:["قائمة أسعار","Price list"],plural:["قوائم الأسعار","Price lists"],newLabel:["قائمة جديدة","New list"],newTitle:["قائمة أسعار جديدة","New price list"],
 search:["name"],fields:["currency","enabled","buying","selling"],cols:[{f:"name",l:["القائمة","List"]},{f:"currency",l:["العملة","Currency"]},{f:"selling",l:["بيع","Selling"],t:"check"},{f:"buying",l:["شراء","Buying"],t:"check"},{f:"enabled",l:["مفعّلة","Enabled"],t:"check"}],
 sections:[{fields:[{f:"price_list_name",t:"data",l:["اسم القائمة","List name"],req:1,newOnly:1,span:2},{f:"currency",t:"link",dt:"Currency",l:["العملة","Currency"],req:1},
  {f:"selling",t:"check",l:["للبيع","Selling"]},{f:"buying",t:"check",l:["للشراء","Buying"]},{f:"enabled",t:"check",l:["مفعّلة","Enabled"]}]}]});
master("Mode of Payment",{slug:"payment-methods",icon:"card",label:["طريقة دفع","Payment method"],plural:["طرق الدفع","Payment methods"],newLabel:["طريقة جديدة","New method"],newTitle:["طريقة دفع جديدة","New payment method"],
 search:["name"],fields:["type","enabled"],cols:[{f:"name",l:["الطريقة","Method"]},{f:"type",l:["النوع","Type"]},{f:"enabled",l:["مفعّلة","Enabled"],t:"check"}],
 sections:[{fields:[{f:"mode_of_payment",t:"data",l:["اسم الطريقة","Name"],req:1,newOnly:1,span:2},
  {f:"type",t:"select",l:["النوع","Type"],opts:[["Cash",["نقدي","Cash"]],["Bank",["بنكي / شبكة","Bank / card"]],["General",["عام","General"]]]},{f:"enabled",t:"check",l:["مفعّلة","Enabled"]},
  {title:null,t:"table",f:"accounts"}]}],
 tables:[{f:"accounts",key:"company",l:["الحسابات","Accounts"],cols:[{f:"company",t:"link",dt:"Company",l:["الشركة","Company"],w:"35%",req:1},
  {f:"default_account",t:"link",dt:"Account",l:["الحساب","Account"],req:1,filters:function(d,row){ return {company:row.company||d.company||AMY.boot.company,account_type:["in",["Bank","Cash"]],is_group:0} }}],
  newRow:function(){ return {company:AMY.boot.company} }}]});
function taxTemplate(dt, slug, label, plural, purchase){
  master(dt,{slug:slug,icon:"percent",label:label,plural:plural,newLabel:["قالب جديد","New template"],newTitle:["قالب ضريبة جديد","New tax template"],
   search:["name","title"],fields:["title","is_default","disabled"],cols:[{f:"name",l:["القالب","Template"]},{f:"is_default",l:["افتراضي","Default"],t:"check"},{f:"disabled",l:["موقوف","Disabled"],t:"check"}],
   sections:[{fields:[{f:"title",t:"data",l:["اسم القالب","Template name"],req:1,newOnly:1,span:2},{f:"is_default",t:"check",l:["افتراضي","Default"]},{f:"disabled",t:"check",l:["موقوف","Disabled"]}]},
    {title:["بنود الضريبة","Tax lines"],fields:[{t:"table",f:"taxes"}]}],
   tables:[{f:"taxes",key:"account_head",l:["البنود","Lines"],cols:[
    {f:"charge_type",t:"select",l:["طريقة الحساب","Charge type"],w:"24%",opts:[["On Net Total",["على الصافي","On net total"]],["On Previous Row Total",["على إجمالي السطر السابق","On previous row total"]],["Actual",["مبلغ ثابت","Fixed amount"]]]},
    {f:"account_head",t:"link",dt:"Account",l:["حساب الضريبة","Tax account"],w:"30%",req:1,filters:function(d){ return {company:d.company||AMY.boot.company,is_group:0} }},
    {f:"description",t:"data",l:["الوصف","Description"],w:"26%",req:1},{f:"rate",t:"percent",l:["النسبة %","Rate %"],w:"12%"}],
    newRow:function(){ return purchase? {charge_type:"On Net Total",category:"Total",add_deduct_tax:"Add"} : {charge_type:"On Net Total"} }}]});
}
taxTemplate("Sales Taxes and Charges Template","sales-taxes",["قالب ضريبة مبيعات","Sales tax template"],["ضرائب المبيعات","Sales taxes"],false);
taxTemplate("Purchase Taxes and Charges Template","purchase-taxes",["قالب ضريبة مشتريات","Purchase tax template"],["ضرائب المشتريات","Purchase taxes"],true);

/* ---------- stock ---------- */
function stockRow(doc){ return {qty:1,s_warehouse:doc.from_warehouse||"",t_warehouse:doc.to_warehouse||""} }
docs["Stock Entry"] = {
 slug:"stock-entries", icon:"stock", label:["حركة مخزون","Stock entry"], plural:["حركات المخزون","Stock entries"],
 newLabel:["حركة جديدة","New entry"], newTitle:["حركة مخزون جديدة","New stock entry"], submittable:true, print:true, search:["name"],order:"creation desc",
 fields:["stock_entry_type","posting_date","from_warehouse","to_warehouse"],
 cols:[{f:"name",l:["الرقم","No."],t:"num"},{f:"stock_entry_type",l:["النوع","Type"],render:function(r){ var m={"Material Receipt":["استلام","Receipt"],"Material Issue":["صرف","Issue"],"Material Transfer":["تحويل","Transfer"]}[r.stock_entry_type]; return document.createTextNode(m? AMY.lb(m) : r.stock_entry_type||"") }},
  {f:"posting_date",l:["التاريخ","Date"],t:"date"},{f:"from_warehouse",l:["من","From"]},{f:"to_warehouse",l:["إلى","To"]},{f:"docstatus",l:["الحالة","Status"],t:"docstatus"}],
 chips:[{l:ALL,filters:{}},{l:["استلام","Receipts"],filters:{stock_entry_type:"Material Receipt"}},{l:["صرف","Issues"],filters:{stock_entry_type:"Material Issue"}},{l:["تحويل","Transfers"],filters:{stock_entry_type:"Material Transfer"}},{l:["مسودات","Drafts"],filters:{docstatus:0}}],
 sections:[
  {fields:[{f:"stock_entry_type",t:"select",l:["نوع الحركة","Type"],req:1,newOnly:1,span:2,opts:[["Material Receipt",["استلام مخزون (إضافة)","Receipt (add stock)"]],["Material Issue",["صرف مخزون (خصم)","Issue (remove stock)"]],["Material Transfer",["تحويل بين مستودعات","Transfer between warehouses"]]]},
   {f:"posting_date",t:"date",l:["التاريخ","Date"],req:1},
   {f:"from_warehouse",t:"link",dt:"Warehouse",l:["من مستودع","From warehouse"],filters:whs,dep:function(d){ return d.stock_entry_type!=="Material Receipt" }},
   {f:"to_warehouse",t:"link",dt:"Warehouse",l:["إلى مستودع","To warehouse"],filters:whs,dep:function(d){ return d.stock_entry_type!=="Material Issue" }}]},
  {title:["الأصناف","Items"],fields:[{t:"table",f:"items"}]},
  {fields:[{f:"remarks",t:"text",l:["ملاحظات","Notes"],span:4}]}],
 tables:[{f:"items",l:["الأصناف","Items"],min:1,newRow:stockRow,cols:[
  {f:"item_code",t:"link",dt:"Item",l:["الصنف","Item"],w:"30%",req:1},{f:"qty",t:"float",l:["الكمية","Qty"],w:"10%",req:1},
  {f:"basic_rate",t:"money",l:["تكلفة الوحدة","Unit cost"],w:"13%"},
  {f:"s_warehouse",t:"link",dt:"Warehouse",l:["من","From"],w:"23%",filters:whs},{f:"t_warehouse",t:"link",dt:"Warehouse",l:["إلى","To"],w:"23%",filters:whs}]}],
 onChange:function(f, doc, form){
  if(f==="from_warehouse"||f==="to_warehouse"||f==="stock_entry_type"){
   (doc.items||[]).forEach(function(r){ if(f==="from_warehouse") r.s_warehouse=doc.from_warehouse; if(f==="to_warehouse") r.t_warehouse=doc.to_warehouse });
   form.redraw("items");
  }
 },
 itemPicked:function(row, code, doc, redraw){ if(!row.qty) row.qty=1; redraw() }
};
docs["Stock Reconciliation"] = {
 slug:"stock-counts", icon:"list", label:["جرد مخزون","Stock count"], plural:["جرد المخزون","Stock counts"],
 newLabel:["جرد جديد","New count"], newTitle:["جرد مخزون جديد","New stock count"], submittable:true, print:true, search:["name"], order:"creation desc",
 fields:["posting_date","purpose"],
 cols:[{f:"name",l:["الرقم","No."],t:"num"},{f:"posting_date",l:["التاريخ","Date"],t:"date"},{f:"purpose",l:["الغرض","Purpose"]},{f:"docstatus",l:["الحالة","Status"],t:"docstatus"}],
 sections:[
  {fields:[{f:"posting_date",t:"date",l:["التاريخ","Date"],req:1},
   {f:"purpose",t:"select",l:["الغرض","Purpose"],opts:[["Stock Reconciliation",["جرد وتسوية","Count & adjust"]],["Opening Stock",["رصيد افتتاحي","Opening stock"]]]},
   {f:"set_warehouse",t:"link",dt:"Warehouse",l:["المستودع","Warehouse"],span:2,filters:whs}]},
  {title:["الأصناف","Items"],fields:[{t:"table",f:"items"}]}],
 tables:[{f:"items",l:["الأصناف","Items"],min:1,newRow:function(doc){ return {warehouse:doc.set_warehouse||""} },cols:[
  {f:"item_code",t:"link",dt:"Item",l:["الصنف","Item"],w:"34%",req:1},{f:"warehouse",t:"link",dt:"Warehouse",l:["المستودع","Warehouse"],w:"26%",req:1,filters:whs},
  {f:"qty",t:"float",l:["الكمية الفعلية","Counted qty"],w:"14%",req:1},{f:"valuation_rate",t:"money",l:["تكلفة الوحدة","Unit cost"],w:"16%"}]}]
};

/* ---------- accounting ---------- */
docs["Journal Entry"] = {
 slug:"journal-entries", icon:"book", label:["قيد يومية","Journal entry"], plural:["القيود اليومية","Journal entries"],
 newLabel:["قيد جديد","New entry"], newTitle:["قيد يومية جديد","New journal entry"], submittable:true, print:true, search:["name","user_remark"], order:"creation desc",
 fields:["posting_date","voucher_type","total_debit","user_remark"],
 cols:[{f:"name",l:["رقم القيد","Entry"],t:"num"},{f:"posting_date",l:["التاريخ","Date"],t:"date"},{f:"voucher_type",l:["النوع","Type"]},{f:"user_remark",l:["البيان","Remark"]},{f:"total_debit",l:["المبلغ","Amount"],t:"money",end:1},{f:"docstatus",l:["الحالة","Status"],t:"docstatus"}],
 sections:[
  {fields:[{f:"voucher_type",t:"select",l:["النوع","Type"],opts:[["Journal Entry",["قيد يومية","Journal entry"]],["Cash Entry",["قيد نقدي","Cash entry"]],["Bank Entry",["قيد بنكي","Bank entry"]],["Opening Entry",["قيد افتتاحي","Opening entry"]]]},
   {f:"posting_date",t:"date",l:["التاريخ","Date"],req:1},{f:"user_remark",t:"data",l:["البيان","Remark"],span:2}]},
  {title:["الحسابات","Accounts"],fields:[{t:"table",f:"accounts"}]}],
 tables:[{f:"accounts",key:"account",min:2,l:["الحسابات","Accounts"],newRow:function(){ return {} },cols:[
  {f:"account",t:"link",dt:"Account",l:["الحساب","Account"],w:"44%",req:1,filters:function(d){ return {company:d.company,is_group:0} }},
  {f:"debit_in_account_currency",t:"money",l:["مدين","Debit"],w:"18%"},{f:"credit_in_account_currency",t:"money",l:["دائن","Credit"],w:"18%"},
  {f:"user_remark",t:"data",l:["بيان","Note"],w:"20%"}]}]
};
docs["Account"] = {
 slug:"accounts", icon:"list", label:["حساب","Account"], plural:["شجرة الحسابات","Chart of accounts"],
 newLabel:["حساب جديد","New account"], newTitle:["حساب جديد","New account"], search:["name","account_name","account_number"], order:"lft asc",
 fields:["account_name","root_type","account_type","is_group","parent_account","account_number"],
 cols:[{f:"account_number",l:["الرقم","No."],t:"num"},{f:"name",l:["الحساب","Account"]},{f:"root_type",l:["التصنيف","Class"]},{f:"account_type",l:["النوع","Type"]},{f:"is_group",l:["مجموعة","Group"],t:"check"}],
 baseFilters:function(){ return {company:AMY.boot.company} },
 sections:[{fields:[{f:"account_name",t:"data",l:["اسم الحساب","Account name"],req:1,span:2,newOnly:1},{f:"account_number",t:"data",l:["رقم الحساب","Number"],dir:"ltr"},
  {f:"parent_account",t:"link",dt:"Account",l:["الحساب الرئيسي","Parent account"],req:1,span:2,filters:function(d){ return {company:d.company,is_group:1} }},
  {f:"account_type",t:"select",l:["نوع الحساب","Account type"],blank:1,opts:[["",["—","—"]],["Bank",["بنك","Bank"]],["Cash",["صندوق","Cash"]],["Receivable",["مدينون","Receivable"]],["Payable",["دائنون","Payable"]],["Income Account",["إيراد","Income"]],["Expense Account",["مصروف","Expense"]],["Tax",["ضريبة","Tax"]],["Stock",["مخزون","Stock"]]]},
  {f:"is_group",t:"check",l:["حساب رئيسي (تحته حسابات)","Group account"]}]}]
};

/* ---------- company ---------- */
docs["Company"] = {
 slug:"companies", icon:"building", label:["الشركة","Company"], plural:["الشركة","Company"], noDelete:1, search:["name"], fields:["company_name"], cols:[{f:"name",l:["الشركة","Company"]}],
 sections:[
  {title:["بيانات الشركة","Company details"],fields:[
   {f:"company_logo",t:"image",l:["شعار الشركة","Logo"],span:4},
   {f:"tax_id",t:"data",l:["الرقم الضريبي","Tax number"],dir:"ltr"},{f:"company_name",t:"data",l:["اسم الشركة","Company name"],ro:1},
   {f:"email",t:"data",l:["البريد الإلكتروني","Email"],dir:"ltr"},{f:"phone_no",t:"data",l:["رقم الجوال","Mobile"],dir:"ltr"},
   {f:"website",t:"data",l:["الموقع الإلكتروني","Website"],dir:"ltr"},{f:"amy_activity",t:"data",l:["النشاط","Activity"]},
   {f:"amy_address",t:"text",l:["العنوان","Address"],span:2},{f:"registration_details",t:"data",l:["السجل التجاري","Commercial register"],dir:"ltr"},
   {f:"abbr",t:"data",l:["الاختصار","Abbreviation"],ro:1},{f:"default_currency",t:"data",l:["العملة","Currency"],ro:1}]}]
};

/* ---------- ZATCA ---------- */
docs["Sales Invoice Additional Fields"] = {
 slug:"zatca", icon:"shield", label:["فاتورة إلكترونية","E-invoice"], plural:["الفوترة الإلكترونية (ZATCA)","E-invoicing (ZATCA)"], noNew:1,
 sub:["حالة إرسال الفواتير إلى هيئة الزكاة والضريبة والجمارك.","Status of invoices sent to the tax authority."],
 search:["sales_invoice"], fields:["sales_invoice","invoice_doctype","integration_status","creation"], baseFilters:{is_latest:1},
 cols:[{f:"sales_invoice",l:["الفاتورة","Invoice"],t:"num"},{f:"integration_status",l:["حالة الإرسال","Status"],t:"status"},{f:"creation",l:["التاريخ","Date"],t:"date"}],
 chips:[{l:ALL,filters:{}},{l:["مقبولة","Accepted"],filters:{integration_status:["in",["Accepted","Accepted with warnings"]]}},
  {l:["بانتظار الإرسال","Queued"],filters:{integration_status:["in",["Ready For Batch","Resend","Pending"]]}},{l:["مرفوضة","Rejected"],filters:{integration_status:"Rejected"}}],
 open:function(row){ AMY.go((row.invoice_doctype==="Purchase Invoice"?"/purchase-invoices/":"/sales-invoices/")+encodeURIComponent(row.sales_invoice)) }
};

/* ---------- reports ---------- */
var co = {f:"company",t:"link",dt:"Company",l:["الشركة","Company"],def:"company"}, fd = {f:"from_date",t:"date",l:["من تاريخ","From"],def:"monthStart"}, td = {f:"to_date",t:"date",l:["إلى تاريخ","To"],def:"today"};
AMY.cfg.reports = {
 "sales-register":{name:"Sales Register",icon:"sales",label:["سجل المبيعات","Sales register"],sub:["كل فواتير المبيعات في فترة.","All sales invoices in a period."],filters:[co,fd,td]},
 "purchase-register":{name:"Purchase Register",icon:"buy",label:["سجل المشتريات","Purchase register"],sub:["كل فواتير المشتريات في فترة.","All purchase invoices in a period."],filters:[co,fd,td]},
 "stock-balance":{name:"Stock Balance",icon:"stock",label:["أرصدة المخزون","Stock balance"],sub:["الكمية والقيمة لكل صنف ومستودع.","Quantity and value per item and warehouse."],filters:[co,{f:"from_date",t:"date",l:["من تاريخ","From"],def:"yearStart"},td]},
 "receivable":{name:"Accounts Receivable",icon:"users",label:["ذمم العملاء","Receivables"],sub:["ما على العملاء من مبالغ مستحقة.","What customers owe you."],filters:[co,{f:"report_date",t:"date",l:["حتى تاريخ","As of"],def:"today"}],extra:{ageing_based_on:"Due Date",range:"30, 60, 90, 120"}},
 "payable":{name:"Accounts Payable",icon:"buy",label:["ذمم الموردين","Payables"],sub:["ما عليك من مبالغ للموردين.","What you owe suppliers."],filters:[co,{f:"report_date",t:"date",l:["حتى تاريخ","As of"],def:"today"}],extra:{ageing_based_on:"Due Date",range:"30, 60, 90, 120"}},
 "profit-loss":{name:"Profit and Loss Statement",icon:"rep",label:["الأرباح والخسائر","Profit & loss"],sub:["الإيرادات والمصروفات وصافي الربح.","Income, expenses and net profit."],filters:[co,{f:"period_start_date",t:"date",l:["من تاريخ","From"],def:"yearStart"},{f:"period_end_date",t:"date",l:["إلى تاريخ","To"],def:"today"}],extra:{filter_based_on:"Date Range",periodicity:"Monthly",accumulated_values:0}},
 "general-ledger":{name:"General Ledger",icon:"book",label:["دفتر الأستاذ","General ledger"],sub:["كل الحركات المحاسبية بالتفصيل.","Every accounting entry in detail."],filters:[co,fd,td],extra:{group_by:"Group by Voucher (Consolidated)"}}
};

/* ---------- settings hub ---------- */
AMY.cfg.settings = [
 {to:"company",icon:"building",l:["بيانات الشركة","Company"],d:["الاسم والشعار والرقم الضريبي.","Name, logo and tax ID."],dt:"Company"},
 {to:"/users",icon:"users",l:["المستخدمون والصلاحيات","Users & roles"],d:["أضف فريقك وحدد صلاحيات كل فرد.","Add your team and set their access."],admin:1},
 {to:"/sales-taxes",icon:"percent",l:["ضرائب المبيعات","Sales taxes"],d:["قوالب ضريبة القيمة المضافة للبيع.","VAT templates for sales."],dt:"Sales Taxes and Charges Template"},
 {to:"/purchase-taxes",icon:"percent",l:["ضرائب المشتريات","Purchase taxes"],d:["قوالب ضريبة القيمة المضافة للشراء.","VAT templates for purchases."],dt:"Purchase Taxes and Charges Template"},
 {to:"/payment-methods",icon:"card",l:["طرق الدفع","Payment methods"],d:["نقدي وشبكة وتحويل وحساب كل منها.","Cash, card, transfer and their accounts."],dt:"Mode of Payment"},
 {to:"/price-lists",icon:"tag",l:["قوائم الأسعار","Price lists"],d:["أسعار البيع والشراء.","Selling and buying prices."],dt:"Price List"},
 {to:"/warehouses",icon:"warehouse",l:["المستودعات","Warehouses"],d:["أماكن تخزين البضاعة.","Where your stock is kept."],dt:"Warehouse"},
 {to:"/item-groups",icon:"layers",l:["فئات المنتجات","Item categories"],d:["تصنيف المنتجات.","Organise your items."],dt:"Item Group"},
 {to:"/units",icon:"list",l:["وحدات القياس","Units"],d:["قطعة وكيلو ولتر وغيرها.","Piece, kilo, litre and more."],dt:"UOM"},
 {to:"/customer-groups",icon:"users",l:["مجموعات العملاء","Customer groups"],d:["تصنيف العملاء.","Organise your customers."],dt:"Customer Group"},
 {to:"/supplier-groups",icon:"buy",l:["مجموعات الموردين","Supplier groups"],d:["تصنيف الموردين.","Organise your suppliers."],dt:"Supplier Group"},
 {to:"/accounts",icon:"book",l:["شجرة الحسابات","Chart of accounts"],d:["حسابات الشركة المحاسبية.","Your accounting accounts."],dt:"Account"},
 {href:"/app/zatca-business-settings",icon:"shield",l:["ربط الفوترة الإلكترونية","E-invoicing setup"],d:["التسجيل والربط مع هيئة الزكاة (مرة واحدة).","One-time registration with the tax authority."],app:"zatca",admin:1}
];

/* ---------- sidebar ---------- */
AMY.cfg.nav = [
 {to:"/",icon:"home",l:["الرئيسية","Home"]},
 {id:"sales",icon:"sales",l:["المبيعات والعملاء","Sales & Customers"],k:[
  {to:"/pos",l:["نقاط البيع","POS"],ext:"/amy-pos",dt:"Sales Invoice"},
  {to:"/sales-invoices",l:["فواتير المبيعات","Sales invoices"],dt:"Sales Invoice"},
  {to:"/customers",l:["العملاء","Customers"],dt:"Customer"},
  {to:"/payments",l:["المدفوعات والمقبوضات","Payments"],dt:"Payment Entry"}]},
 {id:"stock",icon:"stock",l:["المنتجات والمخزون","Products & Stock"],k:[
  {to:"/items",l:["المنتجات","Items"],dt:"Item"},
  {to:"/item-groups",l:["الفئات","Categories"],dt:"Item Group"},
  {to:"/warehouses",l:["المستودعات","Warehouses"],dt:"Warehouse"},
  {to:"/stock-entries",l:["حركات المخزون","Stock entries"],dt:"Stock Entry"},
  {to:"/stock-counts",l:["جرد المخزون","Stock counts"],dt:"Stock Reconciliation"}]},
 {id:"buy",icon:"buy",l:["المشتريات والموردين","Purchases & Suppliers"],k:[
  {to:"/purchase-invoices",l:["فواتير المشتريات","Purchase invoices"],dt:"Purchase Invoice"},
  {to:"/suppliers",l:["الموردون","Suppliers"],dt:"Supplier"}]},
 {id:"acc",icon:"acc",l:["المحاسبة","Accounting"],k:[
  {to:"/journal-entries",l:["القيود اليومية","Journal entries"],dt:"Journal Entry"},
  {to:"/accounts",l:["شجرة الحسابات","Chart of accounts"],dt:"Account"},
  {to:"/zatca",l:["الفوترة الإلكترونية","E-invoicing"],dt:"Sales Invoice Additional Fields",app:"zatca"}]},
 {to:"/reports",icon:"rep",l:["التقارير","Reports"]},
 {id:"set",icon:"set",l:["الإعدادات","Settings"],k:[
  {to:"/settings",l:["عام","General"],alias:["/users","/tax-types","/sales-taxes","/payment-methods","/warehouses","/e-invoicing","/industry","/setup","/companies"]},
  {to:"/subscription",l:["الاشتراك","Subscription"],admin:1}]}
];
})();
