// Homepage behaviour. Skipped on /client-portal and /login, where site.js swaps out <main>.
if(document.getElementById('shelf')){
/* ================= Shelf game ================= */
const ITEMS=[
  {name:"Cold brew coffee, 11 oz can", shape:"can",    color:"var(--chart-6)", price:3.49, rate:.85},
  {name:"Honey oat granola, 14 oz",    shape:"box",    color:"var(--chart-3)", price:5.99, rate:.45},
  {name:"Lavender dish soap, 22 oz",   shape:"bottle", color:"var(--chart-4)", price:3.99, rate:.35},
  {name:"AA batteries, 8 pack",        shape:"card",   color:"var(--chart-5)", price:9.99, rate:.55},
];
const MAX=6, TRUCK_SECS=1.4, ROUND=30;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const shelfEl=document.getElementById('shelf'), aisle=document.getElementById('aisle');
const $=id=>document.getElementById(id);
const money=v=>'$'+Math.round(v).toLocaleString();

let state, mode='idle', truck=null, last=0;

function build(){
  aisle.innerHTML='';
  ITEMS.forEach((it,i)=>{
    const s=document.createElement('div');s.className='slot';
    s.innerHTML=`<div class="goods">${Array.from({length:MAX},()=>`<span class="u ${it.shape}" style="--c:${it.color}"></span>`).join('')}</div>
      <div class="rail" aria-hidden="true"></div>
      <div class="tag"><div class="item">${it.name}</div>
        <div class="figure num">0</div><div class="unit">days of supply</div>
        <span class="state"></span>
        <button class="reorder" type="button"><i></i><span>Reorder</span></button></div>`;
    s.querySelector('.reorder').addEventListener('click',()=>reorder(i));
    aisle.appendChild(s);
  });
  const hog=document.createElement('img');hog.src='/hedgehog-binoculars.png';hog.alt='';hog.className='hog look';
  aisle.appendChild(hog);
}

function reset(){
  state=ITEMS.map(()=>({stock:MAX,idleOut:0}));
  state.t=0;state.sales=0;state.lost=0;state.stockedTime=0;state.totalTime=0;
  truck=null;render();
}

function pop(i,text,miss){
  if(reduce)return;
  const g=aisle.children[i].querySelector('.goods');
  const p=document.createElement('span');p.className='pop'+(miss?' miss':'');p.textContent=text;
  g.appendChild(p);setTimeout(()=>p.remove(),900);
}
function hop(){const h=document.querySelector('.hog');if(!h||reduce)return;h.classList.remove('hop','look');void h.offsetWidth;h.classList.add('hop');setTimeout(()=>{h.classList.remove('hop');h.classList.add('look')},520)}

function reorder(i){
  if(truck||state[i].stock>=MAX)return;
  truck={i,left:TRUCK_SECS};render();
}

function tick(now){
  // wall-clock based, split into small steps so a throttled tab stays fair
  let dt=Math.min(1,(now-last)/1000||0);last=now;
  while(dt>0){const d=Math.min(.05,dt);step(d);dt-=d;}
  render();
  requestAnimationFrame(tick);
}
function step(dt){
  const speed=mode==="playing"?1:.6;
  ITEMS.forEach((it,i)=>{
    const st=state[i];
    // shoppers
    if(Math.random()<it.rate*speed*dt){
      if(st.stock>0){st.stock--;if(mode==='playing')state.sales+=it.price;pop(i,'+$'+it.price.toFixed(2));}
      else if(mode==='playing'){state.lost+=it.price;pop(i,'Missed sale',true);}
    }
    // demo mode quietly restocks empty shelves so the page stays alive
    if(mode==='idle'&&st.stock===0&&!(truck&&truck.i===i)){st.idleOut+=dt;if(st.idleOut>4){st.stock=MAX;st.idleOut=0}}
    if(mode==='playing'){state.totalTime+=dt;if(st.stock>0)state.stockedTime+=dt;}
  });
  if(truck){truck.left-=dt;if(truck.left<=0){state[truck.i].stock=MAX;state[truck.i].idleOut=0;truck=null;hop();}}
  if(mode==='playing'){state.t+=dt;if(state.t>=ROUND)finish();}
}

function render(){
  ITEMS.forEach((it,i)=>{
    const st=state[i],slot=aisle.children[i];
    slot.querySelectorAll('.u').forEach((u,k)=>u.classList.toggle('sold',k>=st.stock));
    const days=st.stock/it.rate;
    slot.querySelector('.figure').textContent=days.toFixed(1);
    const s=slot.querySelector('.state'),btn=slot.querySelector('.reorder');
    const coming=truck&&truck.i===i;
    let cls,txt;
    if(coming){cls='coming';txt='Truck on the way'}
    else if(st.stock===0){cls='bad';txt='Out of stock'}
    else if(days<1.3){cls='bad';txt='Reorder now'}
    else if(days<2.5){cls='low';txt='Running low'}
    else{cls='ok';txt='Healthy'}
    s.className='state '+cls;s.textContent=txt;
    slot.classList.toggle('bad',cls==='bad');slot.classList.toggle('out',st.stock===0&&!coming);
    btn.disabled=!!truck||st.stock>=MAX;
    btn.querySelector('span').textContent=coming?'Delivering':(st.stock>=MAX?'Shelf full':'Reorder');
    btn.style.setProperty('--p',coming?(100*(1-truck.left/TRUCK_SECS))+'%':'0%');
  });
  $('truck').textContent=truck?`Truck delivering ${ITEMS[truck.i].name.split(',')[0].toLowerCase()}`:'Truck at the warehouse';
  if(mode==='playing'){
    $('s-time').textContent=Math.max(0,Math.ceil(ROUND-state.t));
    $('s-sales').textContent=money(state.sales);
    $('s-stock').textContent=Math.round(100*state.stockedTime/Math.max(state.totalTime,.001))+'%';
    $('s-lost').textContent=money(state.lost);
  }
}

function start(){
  shelfEl.classList.remove('over');shelfEl.classList.add('playing');
  mode='playing';reset();
  shelfEl.querySelector('.reorder').focus({preventScroll:true});
}
function finish(){
  mode='over';shelfEl.classList.remove('playing');shelfEl.classList.add('over');
  const pct=Math.round(100*state.stockedTime/Math.max(state.totalTime,.001));
  $('r-sales').textContent=money(state.sales);$('r-stock').textContent=pct+'%';$('r-lost').textContent=money(state.lost);
  $('r-grade').textContent=pct>=95?'Shelf hero. Nothing went empty for long.':pct>=85?'Solid shift. A few gaps cost you.':'Rough shift. Shoppers left empty-handed.';
  let best=0;try{best=+localStorage.getItem('spike-shelf-best')||0;if(pct>best)localStorage.setItem('spike-shelf-best',pct)}catch(e){}
  $('r-best').textContent=pct>best?(best?`New best. Your last best was ${best}% in stock.`:''):`Your best: ${best}% in stock.`;
  $('again').focus({preventScroll:true});
  // the shelf keeps living behind the result card
  mode='idle';reset();
}
$('start').addEventListener('click',start);
$('again').addEventListener('click',start);

build();reset();
requestAnimationFrame(t=>{last=t;tick(t)});

/* ================= Product strip ================= */
const P={
  sales:{s:"Interactive demo",t:"Sales performance",d:"See sales, velocity, inventory, and distribution in one view. Change the time period or drill into an item.",c:"Open sales demo",h:"/dashboard",i:"sales.jpg",a:"Sales performance dashboard showing fictional sales, distribution and velocity data",cap:"Actual demo screen, fictional data"},
  shelf:{s:"Interactive demo",t:"Shelf on a Page",d:"See item performance alongside shelf space, category share, and the numbers behind each takeaway.",c:"Open shelf demo",h:"/demos/shelf/",i:"shelf.jpg",a:"Shelf on a Page demo showing fictional shelf and item performance data",cap:"Actual demo screen, fictional data"},
  forecast:{s:"Interactive demo",t:"Forecasting",d:"Compare planned shipments with the customer forecast, review consumption, and see shortfalls by date.",c:"Open forecast demo",h:"/dashboard/forecast",i:"forecast-chart.jpg",a:"Forecast chart comparing planned shipments with customer forecast using fictional data",cap:"Actual demo screen, fictional data"},
  pipeline:{s:"Sample view",t:"Pipeline",d:"See net pipeline, new business, and deals at risk in one place, with the deals that need you this week.",c:"Ask about pipeline",h:"mailto:hello@kipodai.com?subject=Spike%20Retail%20pipeline%20demo",i:"pipeline-light.jpg",a:"Pipeline home screen showing net open pipeline, new business, and deals at risk with fictional data",cap:"Actual demo screen, fictional data"}
};
const tabs=[...document.querySelectorAll('[role=tab]')];
function select(btn){
  tabs.forEach(b=>{const on=b===btn;b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1});
  const p=P[btn.dataset.p];
  $('p-status').textContent=p.s;$('p-title').textContent=p.t;$('p-desc').textContent=p.d;$('p-cta').textContent=p.c;$('p-cta').href=p.h;
  $('p-img').src='/demo-previews/'+p.i;$('p-img').alt=p.a;$('p-cap').textContent=p.cap;
}
// Deep link from the demos hub, e.g. /?product=pipeline#products
{const want=new URLSearchParams(location.search).get('product');const t=tabs.find(b=>b.dataset.p===want);if(t)select(t);}
tabs.forEach((b,i)=>{
  b.addEventListener('click',()=>select(b));
  b.addEventListener('keydown',e=>{
    const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!d)return;
    const n=tabs[(i+d+tabs.length)%tabs.length];n.focus();select(n);
  });
});

/* ================= Questions ================= */
const Q={
  supply:["See supply before it becomes a sales story.","Connect planned shipments, on-hand inventory, and retailer availability to spot the next risk early.","97.8%","in stock across stores this week"],
  growth:["Find the stores and items pulling ahead.","Compare velocity by region and item against the last four weeks, and see which gains are holding.","+12%","velocity on your top item vs last 4 weeks"],
  focus:["Know which item to call about Monday.","Shortfalls, slow movers, and missed shipments land at the top of the list, with the numbers behind each.","6 days","of supply left on your most at-risk item"]
};
document.querySelectorAll('.qlist button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.qlist button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  const [t,body,n,l]=Q[b.dataset.q];
  $('a-title').textContent=t;$('a-body').textContent=body;$('a-num').textContent=n;$('a-label').textContent=l;
}));
}
