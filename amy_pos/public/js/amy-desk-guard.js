/* Customers use the AMY console; only System Managers may stay in the ERPNext desk. */
(function(){
  try{
    var roles = (window.frappe && frappe.boot && frappe.boot.user && frappe.boot.user.roles) || [];
    if(!roles.length || roles.indexOf("System Manager") >= 0) return;
    if(frappe.boot.sysdefaults && frappe.boot.sysdefaults.amy_desk_open === "1") return;
    location.replace("/amy");
  }catch(e){}
})();
