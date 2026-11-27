/* MEDIX interaction polish: keyboard and navigation accessibility. */
(function(){
  'use strict';
  function syncNavigationState(){
    document.querySelectorAll('#app-sidebar .sidebar-item').forEach(function(item){
      if(item.classList.contains('active')) item.setAttribute('aria-current','page');
      else item.removeAttribute('aria-current');
    });
  }
  document.addEventListener('click',function(event){
    if(event.target.closest('#app-sidebar .sidebar-item')) window.setTimeout(syncNavigationState,0);
  });
  document.addEventListener('keydown',function(event){
    if(event.key!=='Escape') return;
    var sidebar=document.getElementById('app-sidebar');
    if(sidebar && sidebar.classList.contains('medix-sidebar-open') && window.innerWidth<1024){
      if(typeof window.toggleSidebarMenu==='function') window.toggleSidebarMenu(false);
    }
  });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',syncNavigationState,{once:true});
  else syncNavigationState();
})();
