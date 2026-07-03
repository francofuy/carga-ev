(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`
<svg width="0" height="0" style="position:absolute">
  <defs>
    <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></symbol>
    <symbol id="i-home" viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9h12v-9" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-list" viewBox="0 0 24 24"><line x1="5" y1="7" x2="19" y2="7" stroke-width="1.7" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="1.7" stroke-linecap="round"/><line x1="5" y1="17" x2="19" y2="17" stroke-width="1.7" stroke-linecap="round"/></symbol>
    <symbol id="i-car" viewBox="0 0 24 24"><path d="M4 16V11.5L6.2 6.8A2 2 0 0 1 8 5.6h8a2 2 0 0 1 1.8 1.2L20 11.5V16" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><rect x="3" y="13" width="18" height="5.5" rx="2" stroke-width="1.6"/><circle cx="7.5" cy="19" r="1.6" stroke-width="1.5"/><circle cx="16.5" cy="19" r="1.6" stroke-width="1.5"/></symbol>
    <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.1" stroke-width="1.6"/><path d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.7 6.3l-1.7 1.7M8 16l-1.7 1.7M17.7 17.7 16 16M8 8 6.3 6.3" stroke-width="1.6" stroke-linecap="round"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="2" stroke-linecap="round"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></symbol>
  </defs>
</svg>`;function t(){if(document.getElementById(`icon-sprite`))return;let t=document.createElement(`div`);t.id=`icon-sprite`,t.innerHTML=e,document.body.prepend(t)}var n={inicio:`i-home`,cargas:`i-list`,vehiculo:`i-car`,ajustes:`i-gear`},r={inicio:`Inicio`,cargas:`Cargas`,vehiculo:`Vehículo`,ajustes:`Ajustes`};function i(e,t){e.innerHTML=`
    ${t.map(e=>`<div class="screen" data-screen="${e.id}">${e.render()}</div>`).join(``)}
    <div class="tabbar">${t.map(e=>`
      <button class="tab" data-tab="${e.id}">
        <svg><use href="#${n[e.id]}"/></svg>
        ${r[e.id]}
      </button>`).join(``)}</div>
  `;let i=e.querySelectorAll(`.screen`),a=e.querySelectorAll(`.tab`);function o(e){i.forEach(t=>t.classList.toggle(`active`,t.dataset.screen===e)),a.forEach(t=>t.classList.toggle(`active`,t.dataset.tab===e))}a.forEach(e=>{e.addEventListener(`click`,()=>o(e.dataset.tab))}),t.forEach(t=>{let n=e.querySelector(`.screen[data-screen="${t.id}"]`);n&&t.mount&&t.mount(n)}),o(t[0].id)}var a=null,o=1,s=new Map;function c(){return a||(a=new Worker(new URL(`/carga-ev/assets/worker-B0fC-UIr.js`,``+import.meta.url),{type:`module`}),a.addEventListener(`message`,e=>{let{id:t,result:n,error:r}=e.data,i=s.get(t);i&&(s.delete(t),r?i.reject(Error(r)):i.resolve(n))})),a}function l(e,t){let n=o++;return new Promise((r,i)=>{s.set(n,{resolve:r,reject:i}),c().postMessage({id:n,method:e,args:t})})}function u(e){return l(`getStatsSince`,{sinceIso:e})}function d(){let e=new Date;return new Date(e.getFullYear(),e.getMonth(),1).toISOString()}t(),i(document.querySelector(`#app`),[{id:`inicio`,render(){return`
      <div class="nav-title">Inicio</div>
      <div class="card">
        <div class="label">Gasto este mes</div>
        <div class="big-number" id="homeSpend">—</div>
        <div class="sub" id="homeCount">Cargando…</div>
      </div>
    `},async mount(e){let t=e.querySelector(`#homeSpend`),n=e.querySelector(`#homeCount`);try{let e=await u(d());t.textContent=`$ `+Math.round(e.totalCost).toLocaleString(`es-UY`),n.textContent=e.count===0?`Sin cargas todavía este mes`:`${e.count} carga${e.count===1?``:`s`} registrada${e.count===1?``:`s`}`}catch(e){console.error(`No se pudo inicializar la base de datos local:`,e);let r=e instanceof Error?`${e.name}: ${e.message}`:String(e);t.textContent=`—`,n.textContent=`Error de base de datos — ${r}`,n.style.color=`var(--critical)`}}},{id:`cargas`,render(){return`
      <div class="nav-title">Cargas</div>
      <p style="color:var(--text-secondary);font-size:14px;">
        Historial de cargas — pendiente de la capa de datos.
      </p>
    `}},{id:`vehiculo`,render(){return`
      <div class="nav-title">Vehículo</div>
      <p style="color:var(--text-secondary);font-size:14px;">
        Specs del vehículo — pendiente de integración con la API externa.
      </p>
    `}},{id:`ajustes`,render(){return`
      <div class="nav-title">Ajustes</div>
      <p style="color:var(--text-secondary);font-size:14px;">
        Tarifas, notificaciones y backup — pendiente de la capa de datos.
      </p>
    `}}]);