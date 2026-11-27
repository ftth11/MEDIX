// MEDIX table filter / print utilities extracted verbatim from the original index.html.

/* MEDIX v4 — column filters dinonaktifkan karena filter generik sebelumnya tidak stabil.
   Filter khusus/menu yang memang dibuat untuk fungsi tertentu tetap dipertahankan. */
(function(){
  window.medixInitTableFilters = function(){};
  return;
  const STATE = new WeakMap();
  let popup = null;
  let activeTable = null;
  let activeCol = -1;

  function norm(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
  function isFilterableHeader(text){
    const t=norm(text).toLowerCase();
    return t && !/^(aksi|aksi berkas|preview|kartu pemeliharaan|tindakan|action)$/.test(t);
  }
  function getState(table){
    let s=STATE.get(table);
    if(!s){
      s=table.__medixFilterState || {filters:new Map(), sort:null};
      table.__medixFilterState=s;
      STATE.set(table,s);
    }
    return s;
  }
  function rows(table){
    return Array.from(table.tBodies||[]).flatMap(tb=>Array.from(tb.rows));
  }
  function cellText(row,i){ return norm(row.cells[i]?.innerText || row.cells[i]?.textContent || ''); }
  function apply(table){
    const s=getState(table), rs=rows(table);
    let visible=0;
    rs.forEach(r=>{
      if(r.querySelector('td[colspan]')) return;
      let ok=true;
      for(const [col,set] of s.filters){
        if(set && set.size && !set.has(cellText(r,col))) { ok=false; break; }
      }
      r.dataset.medixFilterHidden = ok ? '0' : '1';
      r.hidden = !ok;
      r.style.setProperty('display', ok ? '' : 'none', 'important');
      if(ok) visible++;
    });
    table.dataset.medixFilteredCount=String(visible);
    table.querySelectorAll('.medix-filter-btn').forEach(b=>{
      const i=Number(b.dataset.col), active=!!(s.filters.get(i)?.size);
      b.classList.toggle('has-filter',active); b.classList.toggle('active',active);
    });
    updateMobileLabel(table);
  }
  function values(table,col){
    const set=new Set(); rows(table).forEach(r=>{ if(!r.querySelector('td[colspan]')) set.add(cellText(r,col)); });
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'id',{numeric:true,sensitivity:'base'}));
  }
  function closePopup(){ if(popup){popup.remove();popup=null;} activeTable=null; activeCol=-1; }
  function positionPopup(btn){
    if(!btn||!popup)return;
    const r=btn.getBoundingClientRect(), w=Math.min(320,Math.max(260,window.innerWidth-20)), h=Math.min(470,Math.max(260,window.innerHeight-20));
    let left=Math.min(Math.max(10,r.left),Math.max(10,window.innerWidth-w-10));
    let top=r.bottom+7;
    if(top+h>window.innerHeight-10) top=Math.max(10,r.top-h-7);
    if(window.innerWidth<768){ left=Math.max(10,(window.innerWidth-w)/2); top=Math.min(Math.max(10,top),Math.max(10,window.innerHeight-h-10)); }
    popup.style.width=Math.min(320,window.innerWidth-20)+'px';
    popup.style.left=left+'px'; popup.style.top=top+'px';
  }
  function openPopup(table,col,btn){
    closePopup(); activeTable=table; activeCol=col; const s=getState(table), selected=new Set(s.filters.get(col)||[]);
    const th=table.tHead?.rows[0]?.cells[col], title=norm(th?.innerText||'Kolom');
    popup=document.createElement('div'); popup.className='medix-filter-popup';
    popup.innerHTML=`<div class="medix-filter-head"><div class="medix-filter-title"><span>Filter: ${escapeHtml(title)}</span><span class="text-[10px] opacity-60">${selected.size?selected.size+' dipilih':'Semua'}</span></div><input class="medix-filter-search" placeholder="Cari nilai..."></div><div class="medix-filter-actions"><button type="button" class="medix-filter-action" data-act="all">Pilih semua</button><button type="button" class="medix-filter-action" data-act="none">Kosongkan</button><button type="button" class="medix-filter-action" data-act="az">A → Z</button><button type="button" class="medix-filter-action" data-act="za">Z → A</button></div><div class="medix-filter-values"></div><div class="medix-filter-footer"><button type="button" class="medix-filter-clear">Hapus filter</button><button type="button" class="medix-filter-close">Terapkan</button></div>`;
    document.body.appendChild(popup); renderValues(''); positionPopup(btn);
    popup.querySelector('.medix-filter-search').addEventListener('input',e=>renderValues(e.target.value));
    popup.querySelector('[data-act="all"]').onclick=()=>{ selected.clear(); values(table,col).forEach(v=>selected.add(v)); renderValues(popup.querySelector('.medix-filter-search').value); };
    popup.querySelector('[data-act="none"]').onclick=()=>{ selected.clear(); renderValues(popup.querySelector('.medix-filter-search').value); };
    popup.querySelector('[data-act="az"]').onclick=()=>sortColumn(table,col,false);
    popup.querySelector('[data-act="za"]').onclick=()=>sortColumn(table,col,true);
    popup.querySelector('.medix-filter-clear').onclick=()=>{ s.filters.delete(col); apply(table); closePopup(); };
    popup.querySelector('.medix-filter-close').onclick=()=>{ if(selected.size) s.filters.set(col,new Set(selected)); else s.filters.delete(col); apply(table); closePopup(); };
    function renderValues(q){
      const box=popup.querySelector('.medix-filter-values'), needle=norm(q).toLowerCase();
      const vals=values(table,col).filter(v=>!needle||v.toLowerCase().includes(needle));
      if(!vals.length){box.innerHTML='<div class="medix-filter-empty">Tidak ada nilai yang cocok.</div>';return;}
      box.innerHTML=vals.map(v=>`<label class="medix-filter-value"><input type="checkbox" ${selected.has(v)?'checked':''} data-value="${escapeAttr(v)}"><span>${escapeHtml(v||'(Kosong)')}</span></label>`).join('');
      box.querySelectorAll('input').forEach(cb=>cb.addEventListener('change',()=>{cb.checked?selected.add(cb.dataset.value):selected.delete(cb.dataset.value);}));
    }
  }
  function sortColumn(table,col,desc){
    const s=getState(table); s.sort={col,desc};
    table.querySelectorAll('tbody').forEach(tb=>{
      const arr=Array.from(tb.rows).filter(r=>!r.querySelector('td[colspan]'));
      arr.sort((a,b)=>{const av=cellText(a,col),bv=cellText(b,col);return (desc?-1:1)*av.localeCompare(bv,'id',{numeric:true,sensitivity:'base'});});
      arr.forEach(r=>tb.appendChild(r));
    }); apply(table);
  }
  function escapeHtml(v){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function escapeAttr(v){return escapeHtml(v);}
  function updateMobileLabel(table){
    const bar=table.parentElement?.querySelector(':scope > .medix-mobile-filter-bar'); if(!bar)return;
    const n=getState(table).filters.size; const btn=bar.querySelector('button'); if(btn)btn.innerHTML=`<i class="fa-solid fa-filter"></i> Buka Filter${n?' ('+n+')':''}`;
  }
  function decorateTable(table){
    if(!table || table.dataset.medixNoFilters==='1' || table.hasAttribute('data-medix-no-filters') || !table.tHead || !table.tHead.rows || !table.tHead.rows.length || !table.tHead.rows[0] || !table.tHead.rows[0].cells || table.dataset.medixFiltersReady==='1') return;
    table.dataset.medixFiltersReady='1'; table.classList.add('medix-filterable-table');
    Array.from(table.tHead.rows[0].cells).forEach((th,i)=>{
      if(!isFilterableHeader(th.innerText)) return;
      th.classList.add('medix-filter-th');
      const b=document.createElement('button'); b.type='button'; b.className='medix-filter-btn'; b.dataset.col=i; b.title='Filter kolom'; b.setAttribute('aria-label','Filter '+norm(th.innerText)); b.innerHTML='<i class="fa-solid fa-filter"></i>';
      b.addEventListener('click',e=>{e.stopPropagation();openPopup(table,i,b);}); th.appendChild(b);
    });
    const host=table.parentElement;
    if(host && !host.querySelector(':scope > .medix-mobile-filter-bar')){
      const bar=document.createElement('div'); bar.className='medix-mobile-filter-bar no-print';
      const options=Array.from(table.tHead.rows[0].cells).map((th,i)=>isFilterableHeader(th.innerText)?`<option value="${i}">${escapeHtml(norm(th.innerText))}</option>`:'').join('');
      bar.innerHTML=`<select class="medix-mobile-filter-select" aria-label="Pilih kolom filter"><option value="">Filter kolom...</option>${options}</select><button type="button" class="medix-mobile-filter-btn"><i class="fa-solid fa-filter"></i> Filter</button><button type="button" class="medix-mobile-filter-reset" title="Hapus semua filter"><i class="fa-solid fa-xmark"></i></button>`;
      const sel=bar.querySelector('select');
      const mobileBtn=bar.querySelector('button.medix-mobile-filter-btn');
      const resetBtn=bar.querySelector('button.medix-mobile-filter-reset');
      const openSelected=()=>{
        const raw=sel.value;
        if(raw===''){ sel.focus(); return; }
        const col=Number(raw);
        if(Number.isInteger(col) && col>=0) openPopup(table,col,mobileBtn);
      };
      mobileBtn.onclick=(event)=>{ event.preventDefault(); event.stopPropagation(); openSelected(); };
      resetBtn.onclick=(event)=>{ event.preventDefault(); event.stopPropagation(); const st=getState(table); st.filters.clear(); apply(table); sel.value=''; };
      sel.addEventListener('change',()=>{ if(sel.value!=='') openSelected(); });
      host.insertBefore(bar,table);
    }
    observeBody(table); apply(table);
  }
  function observeBody(table){
    if(table.dataset.medixObserver==='1') return; table.dataset.medixObserver='1';
    Array.from(table.tBodies||[]).forEach(tb=>new MutationObserver(()=>{clearTimeout(tb._medixTimer);tb._medixTimer=setTimeout(()=>apply(table),0);}).observe(tb,{childList:true}));
  }
  function init(){ document.querySelectorAll('table').forEach(decorateTable); }
  document.addEventListener('click',e=>{if(popup&&!popup.contains(e.target)&&!e.target.closest('.medix-filter-btn')&&!e.target.closest('.medix-mobile-filter-btn'))closePopup();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closePopup();});
  window.addEventListener('resize',()=>{if(popup&&activeTable){const bar=activeTable.parentElement?.querySelector(':scope > .medix-mobile-filter-bar');const anchor=window.innerWidth<768?(bar?.querySelector('.medix-mobile-filter-btn')||activeTable.tHead.rows[0].cells[activeCol]?.querySelector('.medix-filter-btn')):activeTable.tHead.rows[0].cells[activeCol]?.querySelector('.medix-filter-btn');if(anchor)positionPopup(anchor);}});
  window.medixInitTableFilters=init;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  const mo=new MutationObserver(()=>init());
  document.addEventListener('DOMContentLoaded',()=>mo.observe(document.body,{childList:true,subtree:true}),{once:true});
})();

        try { pasangListenerFormEM(); } catch (e) { console.warn('Listener form EM belum terpasang:', e); }

        // ============================================================
        // KTI / VALIDASI: fungsi bantu untuk verifikasi algoritma EM
        // ============================================================
        function jalankanUjiAlgoritmaEM() {
            const cases = [
                {nama:'Kasus 1', f:10, r:5, p:5, i:-2, expected:'Setiap 4 Bulan'},
                {nama:'Kasus 2', f:8, r:5, p:5, i:-2, expected:'Setiap 6 Bulan'},
                {nama:'Kasus 3', f:6, r:3, p:5, i:-2, expected:'Satu Kali Per Tahun'},
                {nama:'Kasus 4', f:4, r:2, p:1, i:-2, expected:'Inspeksi Sesuai Kebutuhan'}
            ];
            return cases.map(c => { const total=c.f+c.r+c.p+c.i; const actual=hitungRekomendasiPeriodeWHO(total); return {...c,total,actual,lulus:actual===c.expected}; });
        }
        window.MEDIX_KTI_TEST = { runEM: jalankanUjiAlgoritmaEM, hitungPeriode: hitungRekomendasiPeriodeWHO, jadwalPM: jadwalOtomatisDariPeriode };



/* ============================================================
   MEDIX PRINT ENGINE — unified flexible printing
   ============================================================ */
(function(){
  const PAPERS={
    A4:{label:'A4 — 210 × 297 mm',w:210,h:297},
    A5:{label:'A5 — 148 × 210 mm',w:148,h:210},
    A6:{label:'A6 — 105 × 148 mm',w:105,h:148},
    B5:{label:'B5 — 176 × 250 mm',w:176,h:250},
    F4:{label:'F4 / Folio — 215 × 330 mm',w:215,h:330},
    Letter:{label:'Letter — 216 × 279 mm',w:216,h:279},
    Legal:{label:'Legal — 216 × 356 mm',w:216,h:356},
    Custom:{label:'Custom — tentukan sendiri',w:210,h:297}
  };
  const KEY='medix.print.settings.v1';
  const state={targetWindow:window,mode:'print-current',targetSelector:null,element:null,title:'Pengaturan Cetak',preset:'A4',orientation:'portrait',margin:5,scale:100,fit:'actual',labelWidth:88,labelHeight:26,labelGap:2,cleanup:null};
  const $=id=>document.getElementById(id);
  function loadSaved(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return{}}}
  function saveSaved(){try{localStorage.setItem(KEY,JSON.stringify({preset:state.preset,orientation:state.orientation,margin:state.margin,scale:state.scale,fit:state.fit}))}catch(e){}}
  function getDims(){
    let p=PAPERS[state.preset]||PAPERS.A4,w=Number(p.w),h=Number(p.h);
    if(state.preset==='Custom'){w=Number($('medix-print-custom-w')?.value)||210;h=Number($('medix-print-custom-h')?.value)||297;}
    if(state.orientation==='landscape' && w<h) [w,h]=[h,w];
    if(state.orientation==='portrait' && w>h) [w,h]=[h,w];
    return {w,h};
  }
  function populate(){
    const sel=$('medix-print-paper'); if(!sel)return;
    sel.innerHTML=Object.entries(PAPERS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
    sel.value=state.preset;
    $('medix-print-margin').value=state.margin;
    $('medix-print-scale').value=state.scale;
    $('medix-print-fit').value=state.fit;
    $('medix-print-custom-w').value=PAPERS.Custom.w; $('medix-print-custom-h').value=PAPERS.Custom.h;
    document.querySelectorAll('.medix-print-orientation button').forEach(b=>b.classList.toggle('active',b.dataset.orient===state.orientation));
    $('medix-print-custom-box').style.display=state.preset==='Custom'?'grid':'none';
    $('medix-print-label-note').style.display=(state.mode==='download-label-pdf'||state.mode==='label-popup')?'block':'none';
    $('medix-print-action').textContent=state.mode==='download-label-pdf'?'⬇️ Download PDF':'🖨️ Cetak / Preview Browser';
    $('medix-print-title').textContent=state.title||'Pengaturan Cetak';
    updatePreview();
  }
  function updatePreview(){
    const d=getDims(), stage=$('medix-print-preview-stage'), paper=$('medix-print-paper-preview'), inner=$('medix-print-preview-inner'); if(!paper||!stage||!inner){ const summary=$('medix-print-summary'); if(summary) summary.textContent=`Kertas ${d.w} × ${d.h} mm • Margin ${state.margin} mm • Skala ${state.fit==='fit'?'Fit to Paper':state.scale+'%'}`; return; }
    const maxW=Math.max(120,stage.clientWidth-40),maxH=Math.max(170,stage.clientHeight-40),ratio=d.w/d.h;
    let pw=maxW,ph=pw/ratio;if(ph>maxH){ph=maxH;pw=ph*ratio;}
    paper.style.width=Math.max(80,pw)+'px';paper.style.height=Math.max(110,ph)+'px';
    inner.style.width=Math.max(40,pw*(1-(2*state.margin/d.w)))+'px';inner.style.height=Math.max(50,ph*(1-(2*state.margin/d.h)))+'px';
    const isLabel=state.mode==='download-label-pdf'||state.mode==='label-popup';
    if(isLabel){
      const usableW=d.w-2*state.margin,usableH=d.h-2*state.margin,gap=state.labelGap||2,lw=70,lh=20.44;
      const cols=Math.max(1,Math.floor((usableW+gap)/(lw+gap))),rows=Math.max(1,Math.floor((usableH+gap)/(lh+gap)));
      const perPage=cols*rows,total=Array.isArray(dataAlat)?dataAlat.length:0,pages=Math.max(1,Math.ceil(total/perPage));
      const shown=Math.min(perPage,Math.min(total||1,12));
      const list=(Array.isArray(dataAlat)?dataAlat:[]).slice(0,shown);
      inner.style.display='flex'; inner.style.alignItems='center'; inner.style.justifyContent='center'; inner.style.overflow='hidden'; inner.style.padding='6px';
      const previewCols=Math.min(cols,4),previewRows=Math.min(rows,4);
      inner.innerHTML=`<div style="width:96%;height:96%;display:flex;flex-direction:column;gap:5px;align-items:center;justify-content:center">
        <div style="font-size:7px;font-weight:900;color:#64748b;align-self:flex-start">Halaman 1 / ${pages} • ${total} label • ${cols} × ${rows} per halaman</div>
        <div style="display:grid;grid-template-columns:repeat(${previewCols},minmax(0,1fr));grid-template-rows:repeat(${previewRows},minmax(0,1fr));gap:3px;width:100%;flex:1;min-height:0">${list.map((a,i)=>`<div style="border:1px solid #cbd5e1;border-radius:4px;background:#fff;min-width:0;min-height:0;display:flex;gap:3px;padding:3px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08)"><div style="width:25%;aspect-ratio:1/1;border:2px solid #111;display:grid;place-items:center;font-size:4px;font-weight:900;flex:0 0 auto">QR</div><div style="min-width:0;overflow:hidden;text-align:left"><b style="display:block;font-size:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#0f172a">${String(a?.nama||'ASET MEDIS').replace(/[<>]/g,'')}</b><span style="display:block;font-size:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#475569">${String([a?.merk,a?.tipe].filter(Boolean).join(' · ')||'-').replace(/[<>]/g,'')}</span><span style="display:block;font-size:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#0f172a">SN ${String(a?.seri||'-').replace(/[<>]/g,'')}</span></div></div>`).join('')}</div>
      </div>`;
      $('medix-print-summary').textContent=`Kertas ${d.w} × ${d.h} mm • ${cols} × ${rows} label/halaman • ${pages} halaman • Margin ${state.margin} mm`;
    }else if(state.mode==='lk'){
      const usage=Array.isArray(bhpUsageLK)?bhpUsageLK:[];
      const noLk=$('dlk-no')?.value||'-', alat=$('dlk-nama')?.value||'-', jenis=document.querySelector('input[name="dlk-jenis"]:checked')?.value||'-';
      inner.style.display='block'; inner.style.overflow='hidden'; inner.style.padding='8px'; inner.style.textAlign='left';
      const rowsHtml=usage.length?usage.slice(0,5).map(u=>{const item=(dataBHPItems||[]).find(x=>String(x.id)===String(u.itemId))||{};return `<tr><td>${String(item.namaItem||u.namaItem||'-')}</td><td>${String(item.namaAlkes||u.namaAlkes||'-')}</td><td style="text-align:center">${angkaBHP(u.qty)} ${String(item.satuan||u.satuan||'')}</td></tr>`}).join(''):`<tr><td colspan="3" style="color:#94a3b8;text-align:center">Tidak ada BHP / aksesoris</td></tr>`;
      inner.innerHTML=`<div style="font-size:7px;line-height:1.25;color:#334155"><div style="font-size:10px;font-weight:900;text-align:center;margin-bottom:5px">LEMBAR KERJA PEMELIHARAAN</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:5px"><div><b>No LK:</b> ${noLk}</div><div><b>Jenis:</b> ${jenis}</div><div style="grid-column:1/-1"><b>Alat:</b> ${alat}</div></div><div style="font-weight:900;margin:3px 0">Penggunaan BHP / Aksesoris (${usage.length} item)</div><table style="width:100%;border-collapse:collapse;font-size:6px"><thead><tr><th style="border:1px solid #cbd5e1;padding:2px;text-align:left">Item</th><th style="border:1px solid #cbd5e1;padding:2px;text-align:left">Alkes</th><th style="border:1px solid #cbd5e1;padding:2px">Qty</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
      $('medix-print-summary').textContent=`Kertas ${d.w} × ${d.h} mm • LK ${noLk} • ${usage.length} item BHP/Aksesoris • Margin ${state.margin} mm`;
    }else{
      inner.style.display='flex'; inner.style.alignItems='center'; inner.style.justifyContent='center'; inner.style.overflow='hidden'; inner.style.padding='0'; inner.textContent='Konten akan dicetak pada area kertas ini.\nUkuran dan orientasi mengikuti pilihan Anda.';
      $('medix-print-summary').textContent=`Kertas ${d.w} × ${d.h} mm • Margin ${state.margin} mm • Skala ${state.fit==='fit'?'Fit to Paper':state.scale+'%'}`;
    }
  }

  function collect(){
    state.preset=$('medix-print-paper').value; state.margin=Math.max(0,Math.min(30,Number($('medix-print-margin').value)||0)); state.scale=Math.max(50,Math.min(150,Number($('medix-print-scale').value)||100)); state.fit=$('medix-print-fit').value; saveSaved(); updatePreview();
  }
  function open(targetWin,opts={}){
    const saved=loadSaved(); Object.assign(state,{targetWindow:targetWin||window,mode:opts.mode||'print-current',targetSelector:opts.targetSelector||null,element:opts.element||null,title:opts.title||'Cetak',preset:opts.defaultPreset||saved.preset||'A4',orientation:opts.defaultOrientation||saved.orientation||'portrait',margin:opts.defaultMargin??saved.margin??0,scale:saved.scale||100,fit:saved.fit||'actual',labelWidth:opts.labelWidth||88,labelHeight:opts.labelHeight||26,labelGap:opts.labelGap||2,cleanup:opts.cleanup||null});
    requestAnimationFrame(()=>execute());
  }
  function close(){
    const modal=$('medix-print-settings-modal');
    if(modal){
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden','true');
      modal.style.removeProperty('display');
      modal.style.removeProperty('visibility');
    }
  }
  function injectPrintStyle(win,d){
    if(!win||win.closed)return null; const doc=win.document; let st=doc.getElementById('medix-print-dynamic-style');if(!st){st=doc.createElement('style');st.id='medix-print-dynamic-style';doc.head.appendChild(st)}
    const margin=Math.max(0,Number(state.margin)||0),scale=Number(state.fit==='fit'?100:state.scale)||100;
    st.textContent=`@page{margin:${margin}mm;}html,body{background:#fff!important;}body{--medix-print-scale:${scale/100};}`;
    if(state.mode==='lk') st.textContent+=`@page{size:A4 portrait !important;margin:${margin}mm !important;}@media print{body.medix-lk-printing > #area-lembar-kerja-resmi{width:${Math.max(20,d.w-2*margin)}mm!important;max-width:${Math.max(20,d.w-2*margin)}mm!important;margin:0 auto!important;zoom:1!important;transform:none!important;}}`;
    return st;
  }
  function prepareElementPrint(el){
    if(!el)return null; const root=document.createElement('div');root.id='medix-print-clone-root';root.className='medix-print-hidden-root'; const clone=el.cloneNode(true); clone.classList.remove('hidden'); clone.querySelectorAll('.no-print,button,input,select,textarea').forEach(n=>n.remove()); root.appendChild(clone); document.body.appendChild(root); document.body.classList.add('medix-generic-printing'); return root;
  }
  function applyChildLabelLayout(win,d){
    try{
      const grid=win?.document?.querySelector('.grid'); if(!grid)return;
      const gap=state.labelGap||2,lw=70,lh=20.44,margin=Number(state.margin)||5;
      const cols=Math.floor((d.w-2*margin+gap)/(lw+gap));
      const rows=Math.floor((d.h-2*margin+gap)/(lh+gap));
      if(cols<1||rows<1)throw new Error('Ukuran kertas terlalu kecil untuk label 70 × 20.44 mm.');
      const contentW=cols*lw+(cols-1)*gap, contentH=rows*lh+(rows-1)*gap;
      const ox=Math.max(margin,(d.w-contentW)/2), oy=Math.max(margin,(d.h-contentH)/2);
      grid.style.gridTemplateColumns=`repeat(${cols},70mm)`;
      grid.style.gridAutoRows='20.44mm'; grid.style.gap=`${gap}mm`; grid.style.width=`${contentW}mm`; grid.style.margin=`${oy}mm auto ${oy}mm`;
      win.document.querySelectorAll('.label-card').forEach(el=>{el.style.width='70mm';el.style.height='20.44mm';});
      return {cols,rows};
    }catch(err){console.warn('Layout label popup:',err);return null;}
  }
  function cleanupGeneric(root){document.body.classList.remove('medix-generic-printing');root?.remove();}
  async function execute(){
    close();
    // Pastikan modal pengaturan cetak benar-benar tertutup sebelum native browser print.
    document.getElementById('medix-print-settings-modal')?.classList.remove('show');
    document.getElementById('medix-print-settings-modal')?.setAttribute('aria-hidden','true');
    const d=getDims();
    try{
      if(state.mode==='download-label-pdf'){ await medixGenerateLabelPdf({width:d.w,height:d.h,margin:state.margin,labelGap:state.labelGap}); return; }
      if(state.mode==='label-popup'){ await medixPrintLabelsBrowser(); return; }
      let win=state.targetWindow||window; let root=null;
      if(state.mode==='print-current' && state.targetSelector && win===window){root=prepareElementPrint(document.querySelector(state.targetSelector));}
      if(state.mode==='child-print' && win===window) win=window;
      if(state.mode==='lk') document.body.classList.add('medix-lk-printing');
      injectPrintStyle(win,d);
      if(state.mode==='child-print' && win!==window){
        const hasLabelGrid=!!win.document?.querySelector('.grid .label-card');
        if(hasLabelGrid){
          const layout=applyChildLabelLayout(win,d);
          if(!layout) throw new Error('Ukuran kertas tidak cukup untuk label 70 × 45 mm.');
        }
      }
      if(root) window.scrollTo(0,0);
      try{win.focus();win.print();}catch(err){throw err;}
      let finished=false;
      const finish=()=>{
        if(finished)return;
        finished=true;
        if(root)cleanupGeneric(root);
        if(state.mode==='lk'){
          document.body.classList.remove('medix-lk-printing');
          document.getElementById('area-lembar-kerja-resmi')?.classList.remove('medix-lk-print-ready');
          document.getElementById('medix-print-settings-modal')?.classList.remove('show');
          document.getElementById('medix-print-settings-modal')?.setAttribute('aria-hidden','true');
          document.getElementById('medix-print-settings-modal')?.style.removeProperty('display');
          document.getElementById('area-lembar-kerja-resmi')?.classList.remove('hidden');
          document.body.classList.remove('medix-modal-open');
        }
        if(state.cleanup)try{state.cleanup()}catch(e){}
      };
      if(win===window){
        window.addEventListener('afterprint',finish,{once:true});
        const onVisibility=()=>{
          if(document.visibilityState==='visible'&&state.mode==='lk'){
            setTimeout(()=>{window.removeEventListener('visibilitychange',onVisibility);finish();},80);
          }
        };
        window.addEventListener('visibilitychange',onVisibility);
        setTimeout(()=>{window.removeEventListener('visibilitychange',onVisibility);finish();},700);
      }else{try{win.onafterprint=finish}catch(e){setTimeout(finish,700);}}
    }catch(err){console.error('MEDIX Print Engine:',err);showToast('Proses cetak gagal: '+(err.message||err),'error');}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('medix-print-paper')?.addEventListener('change',collect);$('medix-print-margin')?.addEventListener('input',collect);$('medix-print-scale')?.addEventListener('input',collect);$('medix-print-fit')?.addEventListener('change',collect);$('medix-print-custom-w')?.addEventListener('input',updatePreview);$('medix-print-custom-h')?.addEventListener('input',updatePreview);
    document.querySelectorAll('.medix-print-orientation button').forEach(b=>b.addEventListener('click',()=>{state.orientation=b.dataset.orient;document.querySelectorAll('.medix-print-orientation button').forEach(x=>x.classList.toggle('active',x===b));updatePreview();}));
    $('medix-print-action')?.addEventListener('click',execute);
    $('medix-print-settings-modal')?.addEventListener('click',e=>{if(e.target.id==='medix-print-settings-modal')close();});
  });
  window.medixOpenPrintSettings=open; window.medixClosePrintSettings=close; window.medixPrintExecute=execute;
  window.medixCetakElemen=function(selector,title){open(window,{title:title||'Cetak',mode:'print-current',targetSelector:selector,defaultPreset:'A4',defaultOrientation:'landscape',defaultMargin:6});};
  window.medixOpenPrintSettingsChild=function(win,opts){open(win,opts||{});};
})();
