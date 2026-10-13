/* Customers use the AMY console; only the provider owner may stay in the ERPNext desk. */
(function(){
  try{
    var roles = (window.frappe && frappe.boot && frappe.boot.user && frappe.boot.user.roles) || [];
    if(!roles.length || !frappe.boot.amy_console) return;
    location.replace("/amy");
  }catch(e){}
})();
