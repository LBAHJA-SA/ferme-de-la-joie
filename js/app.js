/* ============================================================
   app.js — محرك التطبيق: الحساب، التقييم، الصفحات، الحفظ المحلي
   ============================================================ */
'use strict';

/* ---------- أدوات ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n,d=0) => Number(n||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => new Date().toISOString().slice(0,10);
const getPath = (o,p) => p.split('.').reduce((a,k)=>a?.[k],o);
function setPath(o,p,v){ const k=p.split('.'); let a=o; for(let i=0;i<k.length-1;i++) a=a[k[i]]; a[k[k.length-1]]=v; }

/* ---------- الحالة ---------- */
function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){ const s=JSON.parse(raw); return {...clone(DEFAULTS),...s,
      counts:{...DEFAULTS.counts,...(s.counts||{})},
      prices:{...DEFAULTS.prices,...(s.prices||{})},
      infra:{...DEFAULTS.infra,...(s.infra||{})},
      settings:{...DEFAULTS.settings,...(s.settings||{})}}; }
  }catch(e){ console.warn('load failed',e); }
  return clone(DEFAULTS);
}
let state = load();
let sim = clone(state.counts);
let active = (location.hash||'#dashboard').slice(1);
if(!PAGES.some(p=>p.id===active)) active='dashboard';
const save = () => { try{ localStorage.setItem(STORE_KEY,JSON.stringify(state)); }catch(e){ console.warn('save failed',e); } };

/* ---------- المحرك الحسابي ---------- */
function compute(p){
  const c=p.counts, pr=p.prices, inf=p.infra, st=p.settings, r={};
  const fodder = pr.roughage*(1-st.selfFodder/100) + pr.berseem*(st.selfFodder/100);

  // أغنام
  r.lambs = Math.round(c.ewes*1.35);
  r.lambWeight = 32;
  r.lambRev = r.lambs*r.lambWeight*pr.lambKg;
  r.roughageKg = (c.ewes+c.rams)*1.8*365;
  r.concentrateKg = c.ewes*0.45*365 + c.rams*1.0*365;
  r.sheepFeedCost = r.roughageKg*fodder + r.concentrateKg*pr.concentrate;
  r.sheepSpaceIn = c.ewes*2 + c.rams*4;
  r.sheepSpaceOut = (c.ewes+c.rams)*15;
  r.sheepVet = c.ewes>0?pr.sheepVet:0;
  r.sheepInfra = c.ewes>0?inf.sheepShelter:0;
  r.sheepInvest = c.ewes*pr.ewe + c.rams*pr.ram + r.sheepInfra;
  r.sheepOper = r.sheepFeedCost + r.sheepVet;

  // دجاج
  r.eggsDay = Math.round(c.hens*0.85);
  r.eggsYear = r.eggsDay*365;
  r.eggRev = r.eggsYear*pr.egg;
  r.henFeedKg = c.hens*0.115*365;
  r.henFeedCost = r.henFeedKg*pr.henFeed;
  r.henSpaceIn = c.hens*0.13;
  r.henSpaceOut = c.hens*1;
  r.nests = Math.ceil(c.hens/5);
  r.henVet = c.hens>0?pr.henVet:0;
  r.henInfra = c.hens>0?inf.henCoop:0;
  r.henInvest = c.hens*pr.pullet + r.henInfra;
  r.henOper = r.henFeedCost + r.henVet;

  // أرانب
  r.rabbitSold = Math.round(c.does*6*7*0.85);
  r.rabbitRev = r.rabbitSold*pr.rabbitSold;
  r.rabbitFeedKg = (c.does*0.16+c.bucks*0.13)*365 + r.rabbitSold*2.5;
  r.rabbitFeedCost = r.rabbitFeedKg*pr.rabbitFeed;
  r.rabbitSpace = c.does*1.2 + c.bucks*0.8;
  r.rabbitVet = c.does>0?pr.rabbitVet:0;
  r.rabbitInfra = c.does>0?inf.rabbitHutch:0;
  r.rabbitInvest = (c.does+c.bucks)*pr.rabbit + r.rabbitInfra;
  r.rabbitOper = r.rabbitFeedCost + r.rabbitVet;

  // إجماليات
  const any = r.sheepInvest+r.henInvest+r.rabbitInvest > 0;
  r.equipment = any?inf.equipment:0;
  r.invest = r.sheepInvest+r.henInvest+r.rabbitInvest+r.equipment;
  r.oper = r.sheepOper+r.henOper+r.rabbitOper + (any?pr.utilities:0);
  r.revenue = r.lambRev+r.eggRev+r.rabbitRev;
  r.margin = r.revenue-r.oper;
  r.roi = r.invest? r.margin/r.invest : 0;
  r.spaceNeed = r.sheepSpaceOut+r.henSpaceOut+r.rabbitSpace;
  r.payback = r.margin>0 ? r.invest/(r.margin/12) : null;
  r.fodderPrice = fodder;
  return r;
}

function evaluate(p,r){
  let s=0; const notes=[]; const st=p.settings;
  if(r.margin>0) s+=28; else notes.push('الإيراد السنوي لا يغطي المصاريف الجارية — راجع أسعار العلف والبيع.');
  if(r.roi>=0.35) s+=20; else if(r.roi>=0.18) s+=13; else if(r.roi>=0) s+=6;
  else notes.push('العائد على الاستثمار ضعيف جداً؛ لا توسّع قبل تثبيت التكاليف.');
  if(st.selfFodder>=50) s+=12; else if(st.selfFodder>=25) s+=7;
  else notes.push('كل العلف مشترى — زراعة البرسيم هي أكبر رافعة للهامش.');
  const sp=[p.counts.ewes>0,p.counts.hens>0,p.counts.does>0].filter(Boolean).length;
  s += sp>=3?10:sp===2?7:3;
  if(st.land>=r.spaceNeed) s+=15;
  else { s+=Math.max(0,Math.round(15*st.land/Math.max(1,r.spaceNeed)));
    notes.push(`المساحة المتوفرة ${fmt(st.land)} م² لا تكفي ${fmt(Math.round(r.spaceNeed))} م² المطلوبة —وسّع المرعى أولاً.`); }
  if(r.invest<=st.budget) s+=15;
  else { s+=Math.max(0,Math.round(15*st.budget/Math.max(1,r.invest)));
    notes.push(`الاستثمار ${fmt(Math.round(r.invest))} درهم يتجاوز ميزانيتك ${fmt(st.budget)} درهم.`); }
  if(p.counts.ewes>=20) notes.push(`عند ${p.counts.ewes} نعجة تحتاج ${fmt(Math.round(p.counts.ewes*2+p.counts.rams*4))} م² مأوى و${fmt(Math.round((p.counts.ewes+p.counts.rams)*15))} م² مرعى — تأكد من توفرها قبل الشراء.`);
  if(p.counts.hens>=60) notes.push('أكثر من 60 دجاجة يرفع خطر الأمراض — خطّط لقنّ إضافي وتهوية أقوى.');
  let verdict, color, vclass;
  if(s>=80){verdict='ممتاز';color='#2f9c72';vclass='g';}
  else if(s>=62){verdict='جيد';color='#3568b0';vclass='b';}
  else if(s>=45){verdict='مقبول — مع تحذيرات';color='#c98a24';vclass='a';}
  else {verdict='يحتاج إعادة نظر';color='#b8544e';vclass='r';}
  return {score:Math.min(100,s),verdict,color,vclass,notes};
}

/* ---------- هيكل الصفحات ---------- */
function navHTML(){
  return PAGES.map(p=>`<a href="#${p.id}" class="${p.id===active?'active':''}"><span class="ico">${p.ico}</span><span>${p.label}</span></a>`).join('')
    .replace('<a href="#costs"','<div class="sep"></div><a href="#costs"')
    .replace('<a href="#tracking"','<div class="sep"></div><a href="#tracking"');
}
function hero(title,sub,badge,img='assets/hero-farm.svg'){
  return `<div class="hero"><img src="${img}" alt=""><div class="veil"></div><div class="txt"><span class="badge">${badge}</span><h2>${title}</h2><p>${sub}</p></div></div>`;
}
function kv(k,v){ return `<div class="kv"><span>${k}</span><b class="money">${v}</b></div>`; }
function bar(label,value,max,color){
  const w = max>0 ? Math.min(100,Math.round(value/max*100)) : 0;
  return `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px"><span>${label}</span><b class="money">${fmt(Math.round(value))}</b></div><div class="bar"><i style="width:${w}%;background:${color}"></i></div></div>`;
}
function gallery(title,items){
  return `<div class="card"><h3><span class="hico">🖼️</span> ${title}</h3><div class="gallery">
    ${items.map(i=>`<figure><img src="${i[0]}" alt="${esc(i[1])}" data-act="zoom" data-src="${i[0]}"><figcaption>${esc(i[1])}</figcaption></figure>`).join('')}
  </div><div class="note" style="margin-bottom:0">اضغط على أي صورة لتكبيرها. الصور مرجعية من مجلد «حضائر» على جهازك — انسخها مع التطبيق حتى تبقى معك.</div></div>`;
}

/* ---------- الصفحة: نظرة عامة ---------- */
function pageDashboard(){
  const r=compute(state), e=evaluate(state,r), c=state.counts;
  const totalAnimals=c.ewes+c.rams+c.hens+c.does+c.bucks;
  return `
  ${hero('مرحباً بك في SADKI ECURIE','الأغنام الدمانية × الصردي · دجاج بيّاض · أرانب — كل أرقامك في مكان واحد.','🐑 🐔 🐇  مشروع متكامل','assets/photos/sheep-barn-outdoor.jpg')}
  <div class="grid g4" style="margin-bottom:18px">
    <div class="stat green"><div class="lab">إجمالي الرؤوس</div><div class="val">${fmt(totalAnimals)}</div><div class="sub">${fmt(c.ewes)} نعجة · ${fmt(c.hens)} دجاجة · ${fmt(c.does+c.bucks)} أرنب</div></div>
    <div class="stat blue"><div class="lab">الاستثمار الإجمالي</div><div class="val money">${fmt(Math.round(r.invest))}</div><div class="sub">درهم مغربي (تقديري)</div></div>
    <div class="stat amber"><div class="lab">الإيراد السنوي المتوقع</div><div class="val money">${fmt(Math.round(r.revenue))}</div><div class="sub">خرفان + بيض + أرانب</div></div>
    <div class="${r.margin>0?'stat green':'stat rose'}"><div class="lab">الهامش السنوي</div><div class="val money">${fmt(Math.round(r.margin))}</div><div class="sub">${r.payback? 'نقطة التعادل ~'+fmt(Math.round(r.payback))+' شهر':'لا توجد نقطة تعادل حالياً'}</div></div>
  </div>
  <div class="grid g23">
    <div class="card">
      <h3><span class="hico">💰</span> الوضع المالي السنوي</h3>
      ${bar('خرفان',r.lambRev,'#3f8a55')}
      ${bar('بيض',r.eggRev,'#d08a25')}
      ${bar('أرانب',r.rabbitRev,'#5a7fc0')}
      <div style="margin-top:18px">${kv('المصاريف الجارية/سنة',fmt(Math.round(r.oper))+' د.م')}${kv('صافي الهامش',fmt(Math.round(r.margin))+' د.م')}${kv('العائد على الاستثمار',fmt(r.roi*100,1)+' %')}</div>
      <div class="note" style="margin-bottom:0">التقييم الحالي: <b>${e.verdict}</b> — ${e.score}/100. <a href="#simulator" style="color:inherit;font-weight:700">جرّب محاكي التوسعة ←</a></div>
    </div>
    <div class="card">
      <img class="illus" src="assets/sheep.svg" alt="أغنام دمانية وصردي">
      <h3 style="margin-top:14px">نقطة البداية</h3>
      <div class="kv"><span>النعجات</span><b>${fmt(c.ewes)} دمانية</b></div>
      <div class="kv"><span>الفحل</span><b>${fmt(c.rams)} صردي</b></div>
      <div class="kv"><span>الخرفان المتوقعة</span><b>${fmt(r.lambs)} / سنة</b></div>
      <div class="kv"><span>البيض المتوقع</span><b>${fmt(r.eggsDay)} / يوم</b></div>
      <div class="kv"><span>الأرانب</span><b>${c.does?fmt(r.rabbitSold)+' / سنة':'غير مفعّلة بعد'}</b></div>
    </div>
  </div>
  <div class="card">
    <h3><span class="hico">⚡</span> اختصارات</h3>
    <div class="chips">
      <a class="chip" href="#costs">💰 تعديل الأسعار والتكاليف</a>
      <a class="chip" href="#simulator">📈 تقييم الزيادة إلى 15 أو 30 نعجة</a>
      <a class="chip" href="#tracking">📋 تسجيل حدث أو مصروف اليوم</a>
      <a class="chip" href="#plan">🗺️ خطة العمل الكاملة</a>
      <button class="chip" data-act="print">🖨️ طباعة التقرير</button>
    </div>
  </div>`;
}

/* ---------- الصفحة: الأغنام ---------- */
function pageSheep(){
  const r=compute(state), c=state.counts;
  return `
  ${hero('الأغنام — دمانية × صردي','الدمانية للتحمل والخصوبة، والصردي فحل لحمي قوي: خرفان هجينة سريعة النمو.','🐑 قطيعك الأساسي','assets/photos/sheep-barn.jpg')}
  <div class="grid g4" style="margin-bottom:18px">
    <div class="stat green"><div class="lab">القطيع الحالي</div><div class="val">${fmt(c.ewes)}+${fmt(c.rams)}</div><div class="sub">نعجات + فحل</div></div>
    <div class="stat amber"><div class="lab">الخرفان/سنة</div><div class="val">${fmt(r.lambs)}</div><div class="sub">بمعدل 1.35 لكل نعجة</div></div>
    <div class="stat blue"><div class="lab">المساحة المطلوبة</div><div class="val money">${fmt(Math.round(r.sheepSpaceIn))} م²</div><div class="sub">مأوى + ${fmt(Math.round(r.sheepSpaceOut))} م² مرعى</div></div>
    <div class="stat green"><div class="lab">عائد الخرفان/سنة</div><div class="val money">${fmt(Math.round(r.lambRev))}</div><div class="sub">${fmt(r.lambWeight)} كغ × ${fmt(state.prices.lambKg)} د.م/كغ</div></div>
  </div>
  <div class="grid g2">
    <div class="card">
      <h3><span class="hico">🗓️</span> التقويم السنوي</h3>
      <div class="timeline">${SHEEP_CALENDAR.map(x=>`<div class="tl"><div class="when">${x.when}</div><div class="what">${x.what}</div><div class="desc">${x.desc}</div></div>`).join('')}</div>
    </div>
    <div class="card">
      <h3><span class="hico">🌾</span> التغذية والمساحة</h3>
      ${kv('علف خشن/سنة',fmt(Math.round(r.roughageKg))+' كغ')}
      ${kv('مركّز/سنة',fmt(Math.round(r.concentrateKg))+' كغ')}
      ${kv('سعر العلف الخشن الفعلي',fmt(r.fodderPrice,2)+' د.م/كغ')}
      ${kv('كلفة العلف/سنة',fmt(Math.round(r.sheepFeedCost))+' د.م')}
      ${kv('مأوى داخلي',fmt(Math.round(r.sheepSpaceIn))+' م²')}
      ${kv('فناء/مرعى',fmt(Math.round(r.sheepSpaceOut))+' م²')}
      <div class="note">الماء: 4–8 لتر/نعجة/يوم، وأكثر وقت الحر والرضاعة. حجر ملحي ومرآة ماء نظيفة دائماً.</div>
      <div class="note warn"><b>القاعدة الذهبية:</b> لا تشترِ علفاً أكثر مما تحتاج، ولا توسّع القطيع قبل تأمين المرعى. العلف هو 60–70% من مصاريف الغنم.</div>
    </div>
  </div>
  <div class="card">
    <h3><span class="hico">💉</span> برنامج الصحة</h3>
    <div class="table-wrap"><table><thead><tr><th>الإجراء</th><th>التوقيت</th><th>ملاحظة</th></tr></thead><tbody>
      ${SHEEP_HEALTH.map(h=>`<tr><td><b>${h[0]}</b></td><td>${h[1]}</td><td>${h[2]}</td></tr>`).join('')}
    </tbody></table></div>
  </div>
  ${gallery('حظائر وسلالات — مراجعك',[
    ['assets/photos/sheep-barn.jpg','حظيرة أغنام مغلقة بأقفاص معدنية وفراش قش'],
    ['assets/photos/sheep-barn-outdoor.jpg','حظيرة أغنام مع فناء ومعلف'],
    ['assets/photos/sheep-house-plan.jpg','مخطط متكامل لحظيرة أغنام عالية الكفاءة'],
    ['assets/photos/sheep-breed-1.jpg','نعجة مع خرفانها'],
    ['assets/photos/sheep-breed-2.jpg','سلالة غنم بيضاء وسوداء'],
    ['assets/photos/sheep-breed-3.jpg','سلالة غنم ملطّخة'],
    ['assets/photos/sheep-breed-4.jpg','سلالة غنم ملطّخة بدون قرون'],
    ['assets/photos/sheep-breed-5.jpg','كبش أبيض بقرون كبيرة']
  ])}`;
}

/* ---------- الصفحة: الدجاج ---------- */
function pageChickens(){
  const r=compute(state), c=state.counts;
  return `
  ${hero('الدجاج البيّاض','30 دجاجة فرنسية بيّاضة — البيض يدفع المصاريف الشهرية، والخرفان هي الربح السنوي.','🐔 مصدر الدخل المستمر','assets/photos/chickens-french.jpg')}
  <div class="grid g4" style="margin-bottom:18px">
    <div class="stat amber"><div class="lab">البيض/يوم</div><div class="val">${fmt(r.eggsDay)}</div><div class="sub">بمعدل 85% إنتاج</div></div>
    <div class="stat amber"><div class="lab">البيض/سنة</div><div class="val">${fmt(r.eggsYear)}</div><div class="sub">≈ ${fmt(Math.round(r.eggsYear/30))} علبة/شهر</div></div>
    <div class="stat green"><div class="lab">إيراد البيض/سنة</div><div class="val money">${fmt(Math.round(r.eggRev))}</div><div class="sub">${fmt(state.prices.egg)} د.م/بيضة</div></div>
    <div class="stat blue"><div class="lab">العلف/سنة</div><div class="val money">${fmt(Math.round(r.henFeedKg))} كغ</div><div class="sub">${fmt(Math.round(r.henFeedCost))} د.م</div></div>
  </div>
  <div class="grid g2">
    <div class="card">
      <h3><span class="hico">🥚</span> دورة الإنتاج</h3>
      <div class="timeline">${HEN_CALENDAR.map(x=>`<div class="tl"><div class="when">${x.when}</div><div class="what">${x.what}</div><div class="desc">${x.desc}</div></div>`).join('')}</div>
    </div>
    <div class="card">
      <h3><span class="hico">🏠</span> التجهيز</h3>
      ${kv('عدد الدجاجات',fmt(c.hens))}
      ${kv('مساحة داخلية',fmt(r.henSpaceIn.toFixed(1))+' م²')}
      ${kv('فناء خارجي (مفضل)',fmt(r.henSpaceOut)+' م²')}
      ${kv('أعشاش',fmt(r.nests)+' عش')}
      ${kv('ماء/يوم',fmt(c.hens*0.2,1)+' لتر')}
      <div class="note">الإضاءة: 14–16 ساعة/يوم في الشتاء ترفع الإنتاج بشكل واضح. استخدم مؤقتاً بسيطاً.</div>
      <div class="note warn">افصل قنّ الدجاج عن حظيرة الأغنام تماماً: ماء وأدوات وفراش منفصلة.</div>
    </div>
  </div>
  <div class="card">
    <h3><span class="hico">💉</span> صحة الدجاج</h3>
    <div class="table-wrap"><table><thead><tr><th>التطعيم/الإجراء</th><th>التوقيت</th></tr></thead><tbody>
      ${HEN_HEALTH.map(h=>`<tr><td><b>${h[0]}</b></td><td>${h[1]}</td></tr>`).join('')}
    </tbody></table></div>
  </div>
  ${gallery('الدجاج الفرنسي — مراجعك',[
    ['assets/photos/chickens-french.jpg','تربية الدجاج الفرنسي في قطيع صغير'],
    ['assets/photos/chickens-close.jpg','ديك فرنسي وإناث قريبة منه']
  ])}`;
}

/* ---------- الصفحة: الأرانب ---------- */
function pageRabbits(){
  const r=compute(state), p=clone(state); 
  const rec = {...p, counts:{...p.counts, does:10, bucks:2}};
  const rr = compute(rec);
  const c=state.counts;
  return `
  ${hero('الأرانب — إضافة جديدة','ليست ضمن خطتك الأصلية، لكنها خفيفة التكلفة وسريعة الدورة. البداية المقترحة: 10 إناث + 2 ذكور.','🐇 دورة إنتاج قصيرة','assets/photos/rabbits-1.jpg')}
  <div class="note"><b>ملاحظة:</b> الأرانب غير مفعّلة حالياً في أرقامك (${fmt(c.does)} إناث + ${fmt(c.bucks)} ذكور). يمكنك اعتماد البداية المقترحة بضغطة واحدة، أو تعديل الأعداد من محاكي التوسعة.</div>
  <div class="card"><button class="btn" data-act="adopt-rabbits">🐇 اعتماد 10 إناث + 2 ذكور</button> <a class="btn ghost" href="#simulator">📈 اذهب إلى المحاكي</a></div>
  <div class="grid g4" style="margin-bottom:18px">
    <div class="stat blue"><div class="lab">الأرانب المباعة/سنة</div><div class="val">${fmt(rr.rabbitSold)}</div><div class="sub">في البداية المقترحة</div></div>
    <div class="stat green"><div class="lab">إيراد/سنة</div><div class="val money">${fmt(Math.round(rr.rabbitRev))}</div><div class="sub">${fmt(state.prices.rabbitSold)} د.م/أرنب</div></div>
    <div class="stat amber"><div class="lab">العلف/سنة</div><div class="val money">${fmt(Math.round(rr.rabbitFeedKg))} كغ</div><div class="sub">حبوب مركّزة</div></div>
    <div class="stat blue"><div class="lab">مساحة الأقفاص</div><div class="val money">${fmt(rr.rabbitSpace.toFixed(1))} م²</div><div class="sub">10 إناث + 2 ذكور</div></div>
  </div>
  <div class="grid g2">
    <div class="card">
      <h3><span class="hico">🗓️</span> دورة التكاثر</h3>
      <div class="timeline">${RABBIT_CALENDAR.map(x=>`<div class="tl"><div class="when">${x.when}</div><div class="what">${x.what}</div><div class="desc">${x.desc}</div></div>`).join('')}</div>
    </div>
    <div class="card">
      <h3><span class="hico">💉</span> الصحة والوقاية</h3>
      <div class="table-wrap"><table><thead><tr><th>الإجراء</th><th>التفاصيل</th></tr></thead><tbody>
        ${RABBIT_HEALTH.map(h=>`<tr><td><b>${h[0]}</b></td><td>${h[1]}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="note warn">لا تضع الأرانب فوق فراش الأغنام ولا تشاركها الأدوات. الأرانب حساسة جداً للرطوبة والروائح.</div>
    </div>
  </div>
  ${gallery('الأرانب — مراجعك',[
    ['assets/photos/rabbits-1.jpg','أرانب في حظيرة مع علف أخضر'],
    ['assets/photos/rabbits-2.jpg','قطيع أرانب بألوان مختلفة']
  ])}`;
}

/* ---------- الصفحة: التكاليف ---------- */
const COST_GROUPS = [
  ['الأغنام — الشراء', [['prices.ewe','سعر النعجة الدمانية','د.م/رأس'],['prices.ram','سعر الفحل الصردي','د.م/رأس'],['prices.lambKg','سعر الخروف الحي','د.م/كغ']]],
  ['الأغنام — العلف والصحة', [['prices.roughage','علف خشن (قش/درس)','د.م/كغ'],['prices.berseem','برسيم أخضر (عند Autonomie)','د.م/كغ'],['prices.concentrate','مركّز شعير + نخالة','د.م/كغ'],['prices.sheepVet','بيطرة الأغنام/سنة','د.م']]],
  ['الدجاج', [['prices.pullet','دجاجة بيّاضة جاهزة','د.م/رأس'],['prices.henFeed','علف بيّاض','د.م/كغ'],['prices.egg','سعر البيضة','د.م'],['prices.henVet','بيطرة الدجاج/سنة','د.م']]],
  ['الأرانب', [['prices.rabbit','أرنب (إناث/ذكور)','د.م/رأس'],['prices.rabbitFeed','علف الأرانب المركّز','د.م/كغ'],['prices.rabbitSold','سعر الأرنب عند البيع','د.م'],['prices.rabbitVet','بيطرة الأرانب/سنة','د.م']]],
  ['الإنشاءات والتجهيز', [['infra.sheepShelter','حظيرة الغنم (~25 م²)','د.م'],['infra.henCoop','قنّ الدجاج + فناء','د.م'],['infra.rabbitHutch','أقفاص الأرانب','د.م'],['infra.equipment','معالف وأدوات ومخزن','د.م']]],
  ['عام', [['prices.utilities','ماء + كهرباء/سنة','د.م']]],
];
function pageCosts(){
  const r=compute(state);
  return `
  ${hero('التكاليف — لكل صنف على حدة','عدّل أي سعر وسيتحدث كل الحسابات والتقييم فوراً. الأسعار تقديرية — تحقق من سوق بلدك.','💰 أرقام قابلة للتعديل','assets/costs.svg')}
  <div class="card">
    <h3><span class="hico">⚙️</span> إعدادات المشروع</h3>
    <div class="row">
      <label class="fld">المساحة المتوفرة (م²)<input type="number" min="0" data-bind="settings.land" value="${state.settings.land}"></label>
      <label class="fld">الميزانية المتاحة (د.م)<input type="number" min="0" data-bind="settings.budget" value="${state.settings.budget}"></label>
      <label class="fld">اكتفاء العلف الذاتي (%)<input type="number" min="0" max="100" data-bind="settings.selfFodder" value="${state.settings.selfFodder}"></label>
    </div>
    <div class="note">اكتفاء العلف الذاتي = نسبة العلف الخشن الذي تنتجه بنفسك (برسيم/ذرة) بدل شرائه. ارفعه إلى 50% لتحسّن الهامش بشكل واضح.</div>
  </div>
  ${COST_GROUPS.map(g=>`<div class="card"><h3><span class="hico">📦</span> ${g[0]}</h3><div class="row">
    ${g[1].map(f=>`<label class="fld">${f[1]}<small style="display:block;font-weight:400;color:#98a29a">${f[2]}</small><input type="number" min="0" step="any" data-bind="${f[0]}" value="${getPath(state,f[0])}"></label>`).join('')}
  </div></div>`).join('')}
  <div class="card">
    <h3><span class="hico">🧮</span> الإجمالي المحسوب</h3>
    <div class="grid g3">
      <div class="stat green"><div class="lab">استثمار الأغنام</div><div class="val money">${fmt(Math.round(r.sheepInvest))}</div><div class="sub">${fmt(r.lambs)} خروف/سنة</div></div>
      <div class="stat amber"><div class="lab">استثمار الدجاج</div><div class="val money">${fmt(Math.round(r.henInvest))}</div><div class="sub">${fmt(r.eggsYear)} بيضة/سنة</div></div>
      <div class="stat blue"><div class="lab">استثمار الأرانب</div><div class="val money">${fmt(Math.round(r.rabbitInvest))}</div><div class="sub">${fmt(r.rabbitSold)} أرنب/سنة</div></div>
    </div>
    <div style="margin-top:16px">${kv('إجمالي الاستثمار',fmt(Math.round(r.invest))+' د.م')}${kv('المصاريف الجارية/سنة',fmt(Math.round(r.oper))+' د.م')}${kv('علف الأغنام/سنة',fmt(Math.round(r.sheepFeedCost))+' د.م')}${kv('علف الدجاج/سنة',fmt(Math.round(r.henFeedCost))+' د.م')}${kv('علف الأرانب/سنة',fmt(Math.round(r.rabbitFeedCost))+' د.م')}</div>
  </div>
  <div class="savebar"><button class="btn ghost" data-act="reset-prices">↺ استعادة الأسعار الافتراضية</button><button class="btn" data-act="save">✓ حفظ التعديلات</button></div>`;
}

/* ---------- الصفحة: محاكي التوسعة ---------- */
function simParams(){ return {...clone(state), counts:{...clone(sim)}}; }
function pageSimulator(){
  const p=simParams(), r=compute(p), e=evaluate(p,r);
  return `
  ${hero('محاكي التوسعة — قيّم قبل أن تشتري','حرّك المؤشرات أو اختر سيناريو جاهزاً: 10 (الحالي) · 15 · 20 · 30 نعجة. كل شيء يُعاد حسابه فوراً.','📈 تقييم فوري','assets/growth.svg')}
  <div class="card">
    <h3><span class="hico">🎚️</span> أعداد القطيع</h3>
    <div class="grid g3">
      <label class="fld">النعجات الدمانية: <b id="l-ewes">${sim.ewes}</b><input class="slider" type="range" min="0" max="60" step="1" data-sim="ewes" value="${sim.ewes}"></label>
      <label class="fld">الفحل الصردي: <b id="l-rams">${sim.rams}</b><input class="slider" type="range" min="0" max="5" data-sim="rams" value="${sim.rams}"></label>
      <label class="fld">الدجاجات البيّاضة: <b id="l-hens">${sim.hens}</b><input class="slider" type="range" min="0" max="120" step="1" data-sim="hens" value="${sim.hens}"></label>
      <label class="fld">إناث الأرانب: <b id="l-does">${sim.does}</b><input class="slider" type="range" min="0" max="40" data-sim="does" value="${sim.does}"></label>
      <label class="fld">ذكور الأرانب: <b id="l-bucks">${sim.bucks}</b><input class="slider" type="range" min="0" max="8" data-sim="bucks" value="${sim.bucks}"></label>
    </div>
    <div class="chips">
      <button class="chip" data-act="preset" data-n="10">10 نعجات (الحالي)</button>
      <button class="chip" data-act="preset" data-n="15">15 نعجة</button>
      <button class="chip" data-act="preset" data-n="20">20 نعجة</button>
      <button class="chip" data-act="preset" data-n="30">30 نعجة</button>
      <button class="chip" data-act="preset-rabbit">+ أرانب (10 إناث + 2 ذكور)</button>
    </div>
    <div class="row">
      <button class="btn" data-act="apply-sim">✓ اعتماد هذه الأعداد في المشروع</button>
      <a class="btn ghost" href="#costs">💰 تعديل الأسعار والميزانية</a>
    </div>
  </div>
  <div id="sim-out"></div>`;
}
function updateSim(){
  const out=$('#sim-out'); if(!out) return;
  const p=simParams(), r=compute(p), e=evaluate(p,r);
  ['ewes','rams','hens','does','bucks'].forEach(k=>{ const l=$('#l-'+k); if(l) l.textContent=sim[k]; });
  const maxRev=Math.max(r.lambRev,r.eggRev,r.rabbitRev,1);
  out.innerHTML=`
  <div class="grid g23">
    <div class="card">
      <h3><span class="hico">🎯</span> نتيجة التقييم</h3>
      <div class="score-wrap">
        <div class="score-ring" style="background:conic-gradient(${e.color} ${e.score*3.6}deg,#e9eee7 0)">
          <div class="inner"><div><b style="color:${e.color}">${e.score}</b><span>/ 100</span></div></div>
        </div>
        <div><div class="verdict" style="color:${e.color}">${e.verdict}</div><div class="verdict-txt">التقييم يجمع: الربحية، العائد، اكتفاء العلف، التنوّع، المساحة، والميزانية.
        ${r.payback? `نقطة التعادل نحو <b>${fmt(Math.round(r.payback))} شهر</b>.`:'لا توجد نقطة تعادل مع الأرقام الحالية.'}</div></div>
      </div>
      ${e.notes.length?`<div class="note warn"><b>تنبيهات قبل القرار:</b><ul style="margin:8px 0 0;padding-right:20px">${e.notes.map(n=>`<li>${n}</li>`).join('')}</ul></div>`:`<div class="note"><b>لا توجد تحذيرات.</b> الأرقام متسقة مع ميزانيتك ومساحتك.</div>`}
      <h3 style="margin-top:20px"><span class="hico">📊</span> الأرقام الأساسية</h3>
      ${kv('الاستثمار المطلوب',fmt(Math.round(r.invest))+' د.م')}
      ${kv('المصاريف/سنة',fmt(Math.round(r.oper))+' د.م')}
      ${kv('الإيراد/سنة',fmt(Math.round(r.revenue))+' د.م')}
      ${kv('الهامش/سنة',fmt(Math.round(r.margin))+' د.م')}
      ${kv('العائد على الاستثمار',fmt(r.roi*100,1)+' %')}
      ${kv('المساحة المطلوبة',fmt(Math.round(r.spaceNeed))+' م²')}
      ${kv('علف الغنم/سنة',fmt(Math.round(r.roughageKg+r.concentrateKg))+' كغ')}
    </div>
    <div class="card">
      <img class="illus" src="assets/growth.svg" alt="نمو">
      <h3 style="margin-top:14px"><span class="hico">🥧</span> مزيج الإيراد</h3>
      ${bar('خرفان',r.lambRev,'#3f8a55')}${bar('بيض',r.eggRev,'#d08a25')}${bar('أرانب',r.rabbitRev,'#5a7fc0')}
      <div class="note">المساحة المتوفرة لديك: <b>${fmt(p.settings.land)} م²</b> — المطلوبة: <b>${fmt(Math.round(r.spaceNeed))} م²</b>.</div>
      <div class="note warn">تذكّر: مبلغ الاستثمار لا يشمل الأرض ولا العمالة. اترك هامشاً احتياطياً 10–15%.</div>
    </div>
  </div>
  <div class="card">
    <h3><span class="hico">🔍</span> مقارنة سيناريوهات الأغنام (مع باقي قطيعك الحالي)</h3>
    <div class="table-wrap"><table><thead><tr><th>النعجات</th><th>الاستثمار</th><th>المصاريف/سنة</th><th>الإيراد/سنة</th><th>الهامش</th><th>المساحة</th><th>التقييم</th></tr></thead><tbody>
    ${[10,15,20,30].map(n=>{ const sp={...clone(state),counts:{...clone(state.counts),ewes:n}}; const x=compute(sp), ev=evaluate(sp,x);
      return `<tr><td><b>${n} نعجة</b></td><td class="money">${fmt(Math.round(x.invest))}</td><td class="money">${fmt(Math.round(x.oper))}</td><td class="money">${fmt(Math.round(x.revenue))}</td><td class="money" style="color:${x.margin>0?'#2f9c72':'#b8544e'}">${fmt(Math.round(x.margin))}</td><td class="money">${fmt(Math.round(x.spaceNeed))} م²</td><td><span class="pill ${ev.vclass}">${ev.score}/100</span></td></tr>`; }).join('')}
    </tbody></table></div>
  </div>`;
}

/* ---------- الصفحة: المتابعة ---------- */
function pageTracking(){
  const month=today().slice(0,7);
  const mLogs=state.logs.filter(l=>String(l.date||'').startsWith(month));
  const expense=mLogs.reduce((a,l)=>a+Number(l.cost||0),0);
  const income=mLogs.reduce((a,l)=>a+Number(l.revenue||0),0);
  return `
  ${hero('المتابعة اليومية','كل حدث، كل مصروف، كل بيضة — سجّلها هنا وستعرف ربحك الحقيقي في آخر الشهر.','📋 سجل حيّ','assets/tracking.svg')}
  <div class="grid g3" style="margin-bottom:18px">
    <div class="stat rose"><div class="lab">مصاريف هذا الشهر</div><div class="val money">${fmt(Math.round(expense))}</div><div class="sub">${fmt(mLogs.length)} عملية مسجّلة</div></div>
    <div class="stat green"><div class="lab">إيرادات هذا الشهر</div><div class="val money">${fmt(Math.round(income))}</div><div class="sub">مبيعات فعلية</div></div>
    <div class="stat blue"><div class="lab">الرصيد الشهري</div><div class="val money">${fmt(Math.round(income-expense))}</div><div class="sub">${income>=expense?'إيجابي':'سالب'}</div></div>
  </div>
  <div class="grid g2">
    <div class="card">
      <h3><span class="hico">✅</span> مهام يجب إنجازها</h3>
      <form data-form="task" class="row" style="margin-bottom:12px">
        <input class="inp" name="title" placeholder="مهمة جديدة (مثلاً: تطعيم القطيع)" required>
        <input class="inp" name="due" type="date" style="max-width:165px">
        <button class="btn sm" type="submit">＋ إضافة</button>
      </form>
      <div>${state.tasks.length? state.tasks.map(t=>`<div class="task ${t.done?'done':''}">
        <input type="checkbox" data-act="toggle-task" data-id="${t.id}" ${t.done?'checked':''}>
        <label>${esc(t.title)} ${t.due?`<small style="color:#8a958c">— ${t.due}</small>`:''}</label>
        <button class="del" data-act="del-task" data-id="${t.id}" title="حذف">✕</button></div>`).join(''):'<div class="empty">لا توجد مهام — أضف أول مهمة.</div>'}</div>
    </div>
    <div class="card">
      <h3><span class="hico">✍️</span> تسجيل حدث / مصروف</h3>
      <form data-form="log">
        <div class="row">
          <label class="fld">التاريخ<input class="inp" name="date" type="date" value="${today()}" required></label>
          <label class="fld">الصنف<select class="inp" name="species"><option value="sheep">أغنام</option><option value="chickens">دجاج</option><option value="rabbits">أرانب</option><option value="all">عام</option></select></label>
          <label class="fld">الحدث<input class="inp" name="event" placeholder="مثلاً: شراء علف / تطعيم / بيع بيض" required></label>
        </div>
        <div class="row">
          <label class="fld">الحيوان/الرقم<input class="inp" name="animal" placeholder="اختياري — مثلاً O03"></label>
          <label class="fld">مصروف (د.م)<input class="inp" name="cost" type="number" min="0" step="any" value="0"></label>
          <label class="fld">إيراد (د.م)<input class="inp" name="revenue" type="number" min="0" step="any" value="0"></label>
          <label class="fld">ملاحظة<input class="inp" name="notes" placeholder="اختياري"></label>
        </div>
        <button class="btn" type="submit" style="margin-top:6px">💾 إضافة إلى السجل</button>
      </form>
    </div>
  </div>
  <div class="card">
    <h3><span class="hico">📒</span> سجل الأحداث <span class="pill v">${state.logs.length}</span></h3>
    <div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الصنف</th><th>الحدث</th><th>الحيوان</th><th>مصروف</th><th>إيراد</th><th>ملاحظة</th><th></th></tr></thead><tbody>
      ${state.logs.length? [...state.logs].reverse().map(l=>`<tr><td class="money">${esc(l.date)}</td><td>${({sheep:'🐑 أغنام',chickens:'🐔 دجاج',rabbits:'🐇 أرانب',all:'⚙️ عام'})[l.species]||l.species}</td><td><b>${esc(l.event)}</b></td><td>${esc(l.animal||'—')}</td><td class="money">${fmt(l.cost)}</td><td class="money">${fmt(l.revenue)}</td><td>${esc(l.notes||'—')}</td><td><button class="btn sm danger" data-act="del-log" data-id="${l.id}">✕</button></td></tr>`).join(''):'<tr><td colspan="8" class="empty">لا توجد أحداث مسجّلة بعد.</td></tr>'}
    </tbody></table></div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn ghost sm" data-act="export">⬇ تصدير السجل CSV</button>
      <button class="btn ghost sm" data-act="print">🖨️ طباعة</button>
    </div>
  </div>`;
}

/* ---------- الصفحة: الخطة ---------- */
function pagePlan(){
  return `
  ${hero('خطة العمل والنصائح','الخطة التي انطلقنا منها، مكتوبة هنا لتعود إليها كلما احتجت قراراً.','🗺️ المرجع','assets/photos/sheep-house-plan.jpg')}
  <div class="card">
    <h3><span class="hico">🪜</span> مراحل المشروع</h3>
    <div class="timeline">${PLAN_PHASES.map(p=>`<div class="tl"><div class="what">${p[0]}</div><div class="desc">${p[1]}</div></div>`).join('')}</div>
  </div>
  <div class="grid g2">
    <div class="card">
      <h3><span class="hico">💡</span> نصائح حاسمة قبل الدفع</h3>
      ${TIPS.map((t,i)=>`<div class="note" style="margin:8px 0"><b>${i+1}.</b> ${t}</div>`).join('')}
    </div>
    <div class="card">
      <img class="illus" src="assets/sheep.svg" alt="">
      <h3 style="margin-top:14px"><span class="hico">🧭</span> القاعدة الذهبية</h3>
      <div class="note warn" style="font-size:15px"><b>لا توسّع قبل تأمين العلف والمساحة.</b><br>الربح في المشاريع الصغيرة لا يأتي من زيادة الرؤوس، بل من خفض كلفة العلف وتقليل النفوق.</div>
      <div class="kv"><span>الوضع الحالي</span><b>${fmt(state.counts.ewes)} نعجة + ${fmt(state.counts.rams)} فحل + ${fmt(state.counts.hens)} دجاجة</b></div>
      <div class="kv"><span>الميزانية المحددة</span><b class="money">${fmt(state.settings.budget)} د.م</b></div>
      <div class="kv"><span>المساحة المتوفرة</span><b class="money">${fmt(state.settings.land)} م²</b></div>
      <div class="note">الأسعار في هذا التطبيق تقديرية. عدّلها من صفحة <a href="#costs" style="font-weight:700">التكاليف</a> لتصبح أرقامك أنت.</div>
    </div>
  </div>
  ${gallery('تصاميم الحظائر — مراجعك',[
    ['assets/photos/sheep-house-plan.jpg','مخطط حظيرة أغنام متكاملة وعالية الكفاءة'],
    ['assets/photos/sheep-barn.jpg','حظيرة أغنام بأقفاص معدنية وفراش قش'],
    ['assets/photos/sheep-barn-outdoor.jpg','حظيرة مع فناء ومعلف جماعي']
  ])}`;
}

/* ---------- التوجيه ---------- */
const RENDERERS={dashboard:pageDashboard,sheep:pageSheep,chickens:pageChickens,rabbits:pageRabbits,costs:pageCosts,simulator:pageSimulator,tracking:pageTracking,plan:pagePlan};
function render(){
  active=(location.hash||'#dashboard').slice(1);
  if(!RENDERERS[active]) active='dashboard';
  document.body.dataset.page=active;
  $('#nav').innerHTML=navHTML();
  const meta=PAGES.find(p=>p.id===active);
  $('#crumb').innerHTML=`التطبيق / <b>${meta.label}</b>`;
  $('#page').innerHTML=RENDERERS[active]();
  if(active==='simulator') updateSim();
  window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('hashchange',()=>{ if(active!=='simulator') sim=clone(state.counts); render(); });

/* ---------- الأحداث ---------- */
document.addEventListener('input',e=>{
  if(e.target.dataset.sim){ sim[e.target.dataset.sim]=Number(e.target.value); updateSim(); }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.bind){ setPath(state,t.dataset.bind, t.type==='number'? Number(t.value) : t.value); save(); render(); }
  if(t.dataset.sim){ sim[t.dataset.sim]=Number(t.value); updateSim(); }
  if(t.dataset.act==='toggle-task'){ const x=state.tasks.find(x=>x.id==t.dataset.id); if(x){x.done=t.checked; save(); render();} }
});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]'); if(!b) return;
  const a=b.dataset.act;
  if(a==='preset'){ const n=Number(b.dataset.n); sim.ewes=n; sim.rams=n>=30?2:1; render(); }
  if(a==='preset-rabbit'){ sim.does=10; sim.bucks=2; render(); }
  if(a==='adopt-rabbits'){ state.counts.does=10; state.counts.bucks=2; save(); location.hash='#simulator'; render(); }
  if(a==='apply-sim'){ state.counts={...clone(sim)}; save(); location.hash='#dashboard'; render(); }
  if(a==='save'){ save(); render(); }
  if(a==='print'){ window.print(); }
  if(a==='zoom'){
    const cap=b.closest('figure')?.querySelector('figcaption')?.textContent||'';
    const box=document.createElement('div'); box.className='lightbox';
    box.innerHTML=`<button data-act="close-zoom" title="إغلاق">✕</button><img src="${b.dataset.src}" alt=""><span>${esc(cap)}</span>`;
    box.addEventListener('click',ev=>{ if(ev.target===box||ev.target.dataset.act==='close-zoom') box.remove(); });
    document.body.appendChild(box);
  }
  if(a==='close-zoom'){ b.closest('.lightbox')?.remove(); }
  if(a==='reset-prices'){ if(confirm('استعادة كل الأسعار والإنشاءات الافتراضية؟')){ state.prices=clone(DEFAULTS.prices); state.infra=clone(DEFAULTS.infra); save(); render(); } }
  if(a==='del-task'){ state.tasks=state.tasks.filter(x=>x.id!=b.dataset.id); save(); render(); }
  if(a==='del-log'){ state.logs=state.logs.filter(x=>x.id!=b.dataset.id); save(); render(); }
  if(a==='export'){
    const head='date,species,animal,event,detail,cost,revenue,notes\n';
    const rows=state.logs.map(l=>[l.date,l.species,l.animal,l.event,l.detail||'',l.cost||0,l.revenue||0,l.notes||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+head+rows],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a'); link.href=url; link.download='mazraati-suivi.csv'; link.click(); URL.revokeObjectURL(url);
  }
});
document.addEventListener('submit',e=>{
  const f=e.target; if(!f.dataset.form) return;
  e.preventDefault();
  if(f.dataset.form==='task'){
    const fd=new FormData(f);
    const title=String(fd.get('title')||'').trim(); if(!title) return;
    state.tasks.push({id:Date.now(),title,due:fd.get('due')||'',done:false,species:'all'});
    save(); render();
  }
  if(f.dataset.form==='log'){
    const fd=new FormData(f);
    state.logs.push({
      id:Date.now(), date:fd.get('date')||today(), species:fd.get('species')||'all',
      animal:fd.get('animal')||'', event:String(fd.get('event')||'').trim(),
      cost:Number(fd.get('cost')||0), revenue:Number(fd.get('revenue')||0), notes:fd.get('notes')||''
    });
    save(); render();
  }
});

/* ---------- بدء ---------- */
document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelector('.lightbox')?.remove(); });
$('#datechip').textContent=new Date().toLocaleDateString('ar-MA',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
render();
