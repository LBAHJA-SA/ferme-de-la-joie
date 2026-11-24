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
      settings:{...DEFAULTS.settings,...(s.settings||{})},
      feed:{...DEFAULTS.feed,...(s.feed||{})},
      health:{...DEFAULTS.health,...(s.health||{})},
      breeding:{...DEFAULTS.breeding,...(s.breeding||{})},
      eggs:s.eggs||[], routineDone:s.routineDone||{}}; }
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
  ${hero('مرحباً بك في مزرعة البهجة','الأغنام الدمانية × الصردي · دجاج بيّاض · أرانب — كل أرقامك في مكان واحد.','🐑 🐔 🐇  مشروع متكامل','assets/photos/sheep-barn-outdoor.jpg')}
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
      <img class="illus" src="assets/photos/sheep-barn.jpg" alt="حظيرة أغنام حقيقية بأقفاص وفراش قش">
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
  ${eggCard()}
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
      <button class="btn ghost sm" data-act="export">⬇ تصدير السجل Excel (.xlsx)</button>
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
      <img class="illus" src="assets/photos/sheep-barn-outdoor.jpg" alt="حظيرة أغنام حقيقية مع فناء ومعلف">
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

/* ---------- أدوات التواريخ ---------- */
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dnum=s=>{const d=new Date(String(s||'')+'T00:00:00');return isNaN(d)?null:d;};
const addDays=(s,n)=>{const d=dnum(s);if(!d)return '';d.setDate(d.getDate()+Number(n));return iso(d);};
const dayDiff=(a,b)=>{const x=dnum(a),y=dnum(b);if(!x||!y)return null;return Math.round((y-x)/86400000);};
const ageDays=s=>dayDiff(s,today());
const duePill=days=> days===null?'<span class="pill v">—</span>'
  : days<0?`<span class="pill r">متأخر ${Math.abs(days)} ي</span>`
  : days===0?'<span class="pill a">اليوم</span>'
  : days<=7?`<span class="pill a">${days} ي</span>`
  : `<span class="pill g">${days} ي</span>`;

/* ---------- التذكيرات التلقائية ---------- */
function reminders(){
  const out=[];
  (state.health.plans||[]).forEach(p=>{ if(p.due){ const days=dayDiff(today(),p.due); if(days!==null&&days<=30) out.push({date:p.due,label:p.name,kind:'وقاية',days,ico:'💉'}); }});
  (state.health.treatments||[]).forEach(t=>{ if(Number(t.withdrawalDays)>0){ const end=addDays(t.date,t.withdrawalDays); const days=dayDiff(today(),end); if(days!==null&&days<=14) out.push({date:end,label:`انتهاء سحب ${t.drug} — ${t.animal}`,kind:'سحب دواء',days,ico:'⏳'}); }});
  (state.breeding.ewes||[]).forEach(e=>{ if(e.matingDate&&!e.lambDate){ const exp=addDays(e.matingDate,150); const days=dayDiff(today(),exp); if(days!==null&&days<=45) out.push({date:exp,label:`ولادة متوقعة — النعجة ${e.num}`,kind:'ولادة',days,ico:'🐑'}); }});
  (state.breeding.lambs||[]).forEach(l=>{ if(l.birthDate&&!l.saleDate){ const d=ageDays(l.birthDate); if(d!==null&&d>=80&&d<=120) out.push({date:today(),label:`الخروف ${l.id} عمره ${d} ي — قرب الفطام`,kind:'فطام',days:0,ico:'🐣'}); }});
  return out.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function reminderCard(){
  const list=reminders();
  return `<div class="card"><h3><span class="hico">🔔</span> تنبيهات تلقائية</h3>
    ${list.length?`<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>التنبيه</th><th>النوع</th><th>متبقي</th></tr></thead><tbody>
      ${list.map(x=>`<tr><td class="money">${esc(x.date)}</td><td>${x.ico} ${esc(x.label)}</td><td>${x.kind}</td><td>${duePill(x.days)}</td></tr>`).join('')}
    </tbody></table></div>`:'<div class="empty">لا توجد تواريخ قريبة — أضف موعد تلقيح أو علاج أو حدّد موعد وقاية.</div>'}
  </div>`;
}

/* ---------- سجل البيض اليومي ---------- */
function eggCard(){
  const last=[...state.eggs].reverse().slice(0,12);
  const avg=last.length? Math.round(last.reduce((a,e)=>a+Number(e.count||0),0)/last.length) : compute(state).eggsDay;
  const week=last.slice(0,7).reduce((a,e)=>a+Number(e.count||0),0);
  const max=Math.max(...last.map(e=>Number(e.count||0)),1);
  return `<div class="card"><h3><span class="hico">🥚</span> سجل البيض اليومي</h3>
    <form data-form="egg" class="row">
      <label class="fld">التاريخ<input class="inp" name="date" type="date" value="${today()}" required></label>
      <label class="fld">عدد البيض<input class="inp" name="count" type="number" min="0" required></label>
      <label class="fld">مكسور<input class="inp" name="broken" type="number" min="0" value="0"></label>
      <label class="fld">ملاحظة<input class="inp" name="notes" placeholder="اختياري"></label>
      <button class="btn" type="submit">＋ تسجيل</button>
    </form>
    <div class="grid g3" style="margin:16px 0">
      <div class="stat amber"><div class="lab">المعدل/يوم</div><div class="val">${fmt(avg)}</div><div class="sub">آخر ${last.length||0} يوم</div></div>
      <div class="stat green"><div class="lab">آخر 7 أيام</div><div class="val">${fmt(week)}</div><div class="sub">بيضة</div></div>
      <div class="stat blue"><div class="lab">نسبة الإنتاج</div><div class="val">${fmt(Math.min(100,Math.round(avg/Math.max(1,state.counts.hens)*100)))}%</div><div class="sub">من ${fmt(state.counts.hens)} دجاجة</div></div>
    </div>
    ${last.length?`<div class="card tight" style="box-shadow:none;background:#fcfdf9">${last.map(e=>bar(e.date,Number(e.count||0),max,'#d08a25')).join('')}</div>
    <div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيض</th><th>مكسور</th><th>ملاحظة</th><th></th></tr></thead><tbody>
      ${last.map(e=>`<tr><td class="money">${esc(e.date)}</td><td><b>${fmt(e.count)}</b></td><td>${fmt(e.broken)}</td><td>${esc(e.notes||'—')}</td><td><button class="btn sm danger" data-act="del-egg" data-id="${e.id}">✕</button></td></tr>`).join('')}
    </tbody></table></div>`:'<div class="empty">سجّل أول يوم بيض لتظهر لك النسب والرسم البياني.</div>'}
  </div>`;
}

/* ---------- صفحة التغذية والعلف ---------- */
function pageFeed(){
  const r=compute(state), f=state.feed;
  const stockKg=f.stocks.reduce((a,s)=>a+Number(s.qty||0),0);
  const stockVal=f.stocks.reduce((a,s)=>a+Number(s.qty||0)*Number(s.price||0),0);
  const dSheep=(r.roughageKg+r.concentrateKg)/365, dHen=r.henFeedKg/365, dRabbit=r.rabbitFeedKg/365;
  const dTotal=dSheep+dHen+dRabbit;
  const cover=dTotal>0?stockKg/dTotal:0;
  const recent=[...f.logs].reverse().slice(0,12);
  const week=f.logs.filter(l=>dayDiff(l.date,today())!==null&&dayDiff(l.date,today())<=7).reduce((a,l)=>a+Number(l.cost||0),0);
  return `
  ${hero('التغذية والعلف','المخزون، أوقات الوجبات، الاستهلاك اليومي، والتكلفة — كل كيس علف تحت حسابك.','🌾 أخطر بند في الميزانية','assets/photos/sheep-barn.jpg')}
  <div class="grid g4" style="margin-bottom:18px">
    <div class="stat green"><div class="lab">مخزون العلف</div><div class="val money">${fmt(Math.round(stockKg))} كغ</div><div class="sub">سجّل الكميات لتعرف ما تبقّى</div></div>
    <div class="stat amber"><div class="lab">قيمة المخزون</div><div class="val money">${fmt(Math.round(stockVal))}</div><div class="sub">درهم مغربي</div></div>
    <div class="stat blue"><div class="lab">الاستهلاك اليومي</div><div class="val money">${fmt(dTotal.toFixed(1))} كغ</div><div class="sub">غنم ${fmt(dSheep.toFixed(1))} · دجاج ${fmt(dHen.toFixed(1))} · أرانب ${fmt(dRabbit.toFixed(1))}</div></div>
    <div class="${cover>15?'stat green':'stat rose'}"><div class="lab">المخزون يكفيك</div><div class="val">${fmt(Math.round(cover))} يوم</div><div class="sub">${cover>15?'وضع آمن':'اشترِ علفاً قريباً'}</div></div>
  </div>
  <div class="card">
    <h3><span class="hico">📦</span> مخزون الأعلاف</h3>
    <div class="table-wrap"><table><thead><tr><th>نوع العلف</th><th>السعر/كغ</th><th>الكمية (كغ)</th><th>القيمة</th><th></th></tr></thead><tbody>
      ${f.stocks.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td class="money">${fmt(s.price,2)}</td><td class="money">${fmt(s.qty)}</td><td class="money">${fmt(Math.round(s.qty*s.price))}</td><td><button class="btn sm danger" data-act="del-feed" data-id="${s.id}">✕</button></td></tr>`).join('')}
    </tbody></table></div>
    <form data-form="feed" class="row" style="margin-top:14px">
      <label class="fld">نوع علف جديد<input class="inp" name="name" placeholder="مثلاً: ذرة مطحونة" required></label>
      <label class="fld">السعر/كغ<input class="inp" name="price" type="number" min="0" step="any" required></label>
      <label class="fld">الكمية (كغ)<input class="inp" name="qty" type="number" min="0" step="any" value="0"></label>
      <button class="btn" type="submit">＋ إضافة</button>
    </form>
  </div>
  <div class="grid g2">
    <div class="card">
      <h3><span class="hico">🍽️</span> تسجيل وجبة / استهلاك</h3>
      <form data-form="feedlog">
        <div class="row">
          <label class="fld">التاريخ<input class="inp" name="date" type="date" value="${today()}" required></label>
          <label class="fld">الوقت<input class="inp" name="time" type="time" value="08:00"></label>
          <label class="fld">الصنف<select class="inp" name="species"><option value="sheep">أغنام</option><option value="chickens">دجاج</option><option value="rabbits">أرانب</option><option value="all">عام</option></select></label>
        </div>
        <div class="row">
          <label class="fld">نوع العلف<select class="inp" name="feedId" required>${f.stocks.map(s=>`<option value="${s.id}">${esc(s.name)} — ${fmt(s.qty)} كغ</option>`).join('')}</select></label>
          <label class="fld">الكمية (كغ)<input class="inp" name="qty" type="number" min="0" step="any" required></label>
          <label class="fld">ملاحظة<input class="inp" name="notes" placeholder="اختياري"></label>
        </div>
        <button class="btn" type="submit" style="margin-top:6px">💾 تسجيل وخصم من المخزون</button>
      </form>
      <div class="note">التكلفة تُحسب تلقائياً (الكمية × سعر النوع) وتُخصم من المخزون.</div>
    </div>
    <div class="card">
      <h3><span class="hico">🧮</span> احتياجاتك المحسوبة</h3>
      ${kv('علف غنم/يوم',fmt(dSheep.toFixed(1))+' كغ')}
      ${kv('علف دجاج/يوم',fmt(dHen.toFixed(1))+' كغ')}
      ${kv('علف أرانب/يوم',fmt(dRabbit.toFixed(1))+' كغ')}
      ${kv('الإجمالي/يوم',fmt(dTotal.toFixed(1))+' كغ')}
      ${kv('الإجمالي/شهر',fmt(Math.round(dTotal*30))+' كغ')}
      ${kv('تكلفة الأعلاف/سنة',fmt(Math.round(r.sheepFeedCost+r.henFeedCost+r.rabbitFeedCost))+' د.م')}
      ${kv('مصروف علف آخر 7 أيام',fmt(Math.round(week))+' د.م')}
      ${bar('استهلاك الغنم',dSheep,dTotal,'#3f8a55')}${bar('استهلاك الدجاج',dHen,dTotal,'#d08a25')}${bar('استهلاك الأرانب',dRabbit,dTotal,'#5a7fc0')}
    </div>
  </div>
  <div class="card">
    <h3><span class="hico">⏰</span> أوقات الوجبات</h3>
    <div class="table-wrap"><table><thead><tr><th>الوقت</th><th>الصنف</th><th>المهمة</th><th>الكمية</th><th></th></tr></thead><tbody>
      ${f.schedule.map(s=>`<tr><td class="money"><b>${esc(s.time)}</b></td><td>${({sheep:'🐑 أغنام',chickens:'🐔 دجاج',rabbits:'🐇 أرانب',all:'⚙️ عام'})[s.species]||s.species}</td><td>${esc(s.task)}</td><td>${esc(s.qty||'—')}</td><td><button class="btn sm danger" data-act="del-feedplan" data-id="${s.id}">✕</button></td></tr>`).join('')}
    </tbody></table></div>
    <form data-form="feedplan" class="row" style="margin-top:14px">
      <label class="fld">الوقت<input class="inp" name="time" type="time" value="08:00" required></label>
      <label class="fld">الصنف<select class="inp" name="species"><option value="sheep">أغنام</option><option value="chickens">دجاج</option><option value="rabbits">أرانب</option><option value="all">عام</option></select></label>
      <label class="fld">المهمة<input class="inp" name="task" placeholder="مثلاً: توزيع مركّز" required></label>
      <label class="fld">الكمية<input class="inp" name="qty" placeholder="مثلاً: 5 كغ"></label>
      <button class="btn" type="submit">＋ إضافة</button>
    </form>
  </div>
  ${recent.length?`<div class="card"><h3><span class="hico">📒</span> آخر عمليات التغذية</h3><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الوقت</th><th>الصنف</th><th>العلف</th><th>الكمية</th><th>التكلفة</th><th></th></tr></thead><tbody>
    ${recent.map(l=>{const st=f.stocks.find(s=>s.id==l.feedId);return `<tr><td class="money">${esc(l.date)}</td><td class="money">${esc(l.time||'—')}</td><td>${esc(l.species)}</td><td>${esc(st?.name||'—')}</td><td class="money">${fmt(l.qty)} كغ</td><td class="money">${fmt(Math.round(l.cost))} د.م</td><td><button class="btn sm danger" data-act="del-feedlog" data-id="${l.id}">✕</button></td></tr>`;}).join('')}
  </tbody></table></div></div>`:''}
  <div class="card"><h3><span class="hico">💡</span> قواعد التغذية</h3>${FEED_TIPS.map(t=>`<div class="note" style="margin:7px 0">${t}</div>`).join('')}</div>`;
}

/* ---------- صفحة الصحة والأدوية ---------- */
function pageHealth(){
  const h=state.health, sp={sheep:'أغنام',chickens:'دجاج',rabbits:'أرانب',all:'عام'};
  const treated=(name)=>[...h.treatments].reverse().find(t=>t.drug===name)?.date||'';
  return `
  ${hero('الصحة والأدوية','العلاجات، التطعيمات، مواعيد السحب، والتنبيهات — سجّل كل جرعة قبل أن تنساها.','💝 الوقاية أرخص من العلاج','assets/photos/sheep-barn.jpg')}
  ${reminderCard()}
  <div class="grid g2">
    <div class="card">
      <h3><span class="hico">💉</span> تسجيل علاج / جرعة</h3>
      <form data-form="treat">
        <div class="row">
          <label class="fld">التاريخ<input class="inp" name="date" type="date" value="${today()}" required></label>
          <label class="fld">الحيوان / الرقم<input class="inp" name="animal" placeholder="مثلاً: O03 أو الخروف 2" required></label>
          <label class="fld">الصنف<select class="inp" name="species"><option value="sheep">أغنام</option><option value="chickens">دجاج</option><option value="rabbits">أرانب</option><option value="all">عام</option></select></label>
        </div>
        <div class="row">
          <label class="fld">الدواء / التطعيم<input class="inp" name="drug" placeholder="مثلاً: كلوستريديم" required></label>
          <label class="fld">الجرعة<input class="inp" name="dose" placeholder="مثلاً: 2 مل"></label>
          <label class="fld">السبب<input class="inp" name="reason" placeholder="وقاية / مرض / ديدان"></label>
        </div>
        <div class="row">
          <label class="fld">الطبيب / المورد<input class="inp" name="vet" placeholder="اختياري"></label>
          <label class="fld">مدة السحب (يوم)<input class="inp" name="withdrawalDays" type="number" min="0" value="0"></label>
          <label class="fld">ملاحظة<input class="inp" name="notes" placeholder="اختياري"></label>
        </div>
        <button class="btn" type="submit" style="margin-top:6px">💾 حفظ الجرعة</button>
      </form>
    </div>
    <div class="card">
      <h3><span class="hico">🗓️</span> خطة الوقاية</h3>
      <div class="table-wrap"><table><thead><tr><th>البند</th><th>كل (يوم)</th><th>آخر جرعة</th><th>الموعد القادم</th><th></th></tr></thead><tbody>
        ${h.plans.map(p=>{const last=treated(p.name);const next=p.due||(last?addDays(last,p.everyDays):'');return `<tr><td><b>${esc(p.name)}</b><br><small style="color:#98a29a">${sp[p.species]||''}</small></td><td class="money">${fmt(p.everyDays)}</td><td class="money">${esc(last||'—')}</td><td>${next?duePill(dayDiff(today(),next))+'<br><small class="money">'+next+'</small>':'—'}</td><td><button class="btn sm" data-act="dose" data-id="${p.id}">✔ جرعة</button> <button class="btn sm danger" data-act="del-healthplan" data-id="${p.id}">✕</button></td></tr>`;}).join('')}
      </tbody></table></div>
      <form data-form="healthplan" class="row" style="margin-top:14px">
        <label class="fld">اسم البند<input class="inp" name="name" placeholder="مثلاً: جدري الأغنام" required></label>
        <label class="fld">الصنف<select class="inp" name="species"><option value="sheep">أغنام</option><option value="chickens">دجاج</option><option value="rabbits">أرانب</option></select></label>
        <label class="fld">يتكرر كل (يوم)<input class="inp" name="everyDays" type="number" min="1" value="90"></label>
        <label class="fld">الموعد القادم<input class="inp" name="due" type="date"></label>
        <button class="btn" type="submit">＋ إضافة</button>
      </form>
    </div>
  </div>
  <div class="card">
    <h3><span class="hico">📒</span> سجل العلاجات <span class="pill v">${h.treatments.length}</span></h3>
    <div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الحيوان</th><th>الدواء</th><th>الجرعة</th><th>السبب</th><th>سحب حتى</th><th></th></tr></thead><tbody>
      ${h.treatments.length? [...h.treatments].reverse().map(t=>`<tr><td class="money">${esc(t.date)}</td><td>${esc(t.animal)}</td><td><b>${esc(t.drug)}</b></td><td>${esc(t.dose||'—')}</td><td>${esc(t.reason||'—')}</td><td class="money">${Number(t.withdrawalDays)>0?addDays(t.date,t.withdrawalDays):'—'}</td><td><button class="btn sm danger" data-act="del-treat" data-id="${t.id}">✕</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">لا توجد علاجات مسجّلة.</td></tr>'}
    </tbody></table></div>
  </div>
  <div class="card"><h3><span class="hico">💡</span> قواعد الصحة</h3>${HEALTH_TIPS.map(t=>`<div class="note" style="margin:7px 0">${t}</div>`).join('')}</div>`;
}

/* ---------- صفحة الحمل والصغار ---------- */
function pageBreeding(){
  const b=state.breeding, sp={M:'ذكر',F:'أنثى'};
  const fattening=b.lambs.filter(l=>l.fattenStart&&!l.saleDate);
  const ready=b.lambs.filter(l=>Number(l.currentKg)>=35&&!l.saleDate);
  const gains=fattening.map(l=>{const d=dayDiff(l.fattenStart,today());return d>0?(Number(l.currentKg||0)-Number(l.startKg||0))/d:0;}).filter(x=>isFinite(x)&&x>0);
  const avgGain=gains.length?gains.reduce((a,x)=>a+x,0)/gains.length:0;
  return `
  ${hero('الحمل والصغار','نعجات حوامل، تواريخ ولادة محسوبة، خرفان بأوزانها، وتسمين حتى البيع.','🐣 من السّقف إلى السوق','assets/photos/sheep-barn.jpg')}
  <div class="grid g4" style="margin-bottom:18px">
    <div class="stat green"><div class="lab">نعجات مسجّلة</div><div class="val">${fmt(b.ewes.length)}</div><div class="sub">من ${fmt(state.counts.ewes)} في القطيع</div></div>
    <div class="stat amber"><div class="lab">ولادات قريبة</div><div class="val">${fmt(b.ewes.filter(e=>e.matingDate&&!e.lambDate&&dayDiff(today(),addDays(e.matingDate,150))<=45).length)}</div><div class="sub">خلال 45 يوماً</div></div>
    <div class="stat blue"><div class="lab">خرفان مسجّلة</div><div class="val">${fmt(b.lambs.length)}</div><div class="sub">منها ${fmt(fattening.length)} في التسمين</div></div>
    <div class="stat green"><div class="lab">جاهز للبيع</div><div class="val">${fmt(ready.length)}</div><div class="sub">وزن ≥ 35 كغ</div></div>
  </div>
  ${reminderCard()}
  <div class="card">
    <h3><span class="hico">🐑</span> النعجات والحمل</h3>
    <div class="table-wrap"><table><thead><tr><th>رقم النعجة</th><th>السّقف</th><th>الولادة المتوقعة</th><th>متبقي</th><th>الولادة الفعلية</th><th>عدد الخرفان</th><th></th></tr></thead><tbody>
      ${b.ewes.length? b.ewes.map(e=>{const exp=addDays(e.matingDate,150);const days=e.lambDate?null:dayDiff(today(),exp);return `<tr><td><b>${esc(e.num)}</b></td><td class="money">${esc(e.matingDate||'—')}</td><td class="money">${esc(exp)}</td><td>${e.lambDate?'<span class="pill g">ولّدت</span>':duePill(days)}</td><td class="money">${esc(e.lambDate||'—')}</td><td class="money">${fmt(e.lambCount||0)}</td><td><button class="btn sm danger" data-act="del-ewe" data-id="${e.id}">✕</button></td></tr>`;}).join(''):'<tr><td colspan="7" class="empty">أضف أول نعجة بسجّل تاريخ السّقف.</td></tr>'}
    </tbody></table></div>
    <form data-form="ewe" class="row" style="margin-top:14px">
      <label class="fld">رقم النعجة<input class="inp" name="num" placeholder="مثلاً: O01" required></label>
      <label class="fld">تاريخ السّقف<input class="inp" name="matingDate" type="date" value="${today()}" required></label>
      <label class="fld">الولادة الفعلية (إن حدثت)<input class="inp" name="lambDate" type="date"></label>
      <label class="fld">عدد الخرفان<input class="inp" name="lambCount" type="number" min="0" value="0"></label>
      <button class="btn" type="submit">＋ إضافة</button>
    </form>
    <div class="note">الولادة المتوقعة = تاريخ السّقف + 150 يوماً. إذا أدخلت تاريخ الولادة وعدد الخرفان، تُنشأ بطاقات الخرفان تلقائياً.</div>
  </div>
  <div class="card">
    <h3><span class="hico">🐣</span> الخرفان — الأوزان والتسمين</h3>
    <div class="table-wrap"><table><thead><tr><th>الرقم</th><th>الأم</th><th>الولادة</th><th>العمر</th><th>الجنس</th><th>وزن الولادة</th><th>الوزن الحالي</th><th>المرحلة</th><th>البيع المتوقع</th><th></th></tr></thead><tbody>
      ${b.lambs.length? b.lambs.map(l=>{
        const age=ageDays(l.birthDate), target=Number(l.targetKg||40), cur=Number(l.currentKg||0);
        const gain=age>0?(cur-Number(l.birthKg||0))/age:0;
        const remain=target>cur&&gain>0?Math.round((target-cur)/gain):0;
        const sale=l.saleDate||(remain?addDays(today(),remain):'—');
        const phase=l.saleDate?'<span class="pill g">بيع</span>':cur>=35?'<span class="pill g">جاهز</span>':l.fattenStart?'<span class="pill b">تسمين</span>':(age||0)>=90?'<span class="pill a">فطام</span>':'<span class="pill a">رضاعة</span>';
        return `<tr><td><b>${esc(l.id)}</b></td><td>${esc(l.eweNum||'—')}</td><td class="money">${esc(l.birthDate)}</td><td class="money">${fmt(age)} ي</td><td>${sp[l.sex]||'—'}</td><td class="money">${fmt(l.birthKg)}</td><td class="money"><b>${fmt(cur)}</b> كغ</td><td>${phase}</td><td class="money">${esc(sale)}</td><td><button class="btn sm danger" data-act="del-lamb" data-id="${l.id}">✕</button></td></tr>`;
      }).join(''):'<tr><td colspan="10" class="empty">لا توجد خرفان مسجّلة بعد.</td></tr>'}
    </tbody></table></div>
    <div class="row" style="margin-top:14px">
      <form data-form="lamb" style="flex:2">
        <div class="row">
          <label class="fld">رقم الخروف<input class="inp" name="id" placeholder="مثلاً: L01" required></label>
          <label class="fld">الأم<select class="inp" name="eweNum"><option value="">—</option>${b.ewes.map(e=>`<option value="${esc(e.num)}">${esc(e.num)}</option>`).join('')}</select></label>
          <label class="fld">تاريخ الولادة<input class="inp" name="birthDate" type="date" value="${today()}" required></label>
          <label class="fld">الجنس<select class="inp" name="sex"><option value="F">أنثى</option><option value="M">ذكر</option></select></label>
        </div>
        <div class="row">
          <label class="fld">وزن الولادة (كغ)<input class="inp" name="birthKg" type="number" min="0" step="any" value="4"></label>
          <label class="fld">الوزن الحالي (كغ)<input class="inp" name="currentKg" type="number" min="0" step="any" value="4"></label>
          <label class="fld">بدء التسمين<input class="inp" name="fattenStart" type="date"></label>
          <label class="fld">الوزن المستهدف<input class="inp" name="targetKg" type="number" min="0" value="40"></label>
        </div>
        <button class="btn" type="submit" style="margin-top:6px">＋ إضافة خروف</button>
      </form>
      <form data-form="weight" style="flex:1">
        <h4 style="margin:0 0 8px">تحديث وزن</h4>
        <label class="fld">الخروف<select class="inp" name="lambId" required>${b.lambs.map(l=>`<option value="${esc(l.id)}">${esc(l.id)}</option>`).join('')}</select></label>
        <label class="fld">الوزن الجديد (كغ)<input class="inp" name="kg" type="number" min="0" step="any" required></label>
        <label class="fld">تاريخ البيع (اختياري)<input class="inp" name="saleDate" type="date"></label>
        <button class="btn ghost" type="submit" style="margin-top:6px">↻ تحديث</button>
      </form>
    </div>
  </div>
  <div class="card">
    <h3><span class="hico">📈</span> لوحة التسمين</h3>
    <div class="grid g3">
      <div class="stat blue"><div class="lab">متوسط الزيادة اليومية</div><div class="val">${fmt(avgGain*1000)} غ</div><div class="sub">${fmt(avgGain.toFixed(3))} كغ/يوم</div></div>
      <div class="stat amber"><div class="lab">خرفان قيد التسمين</div><div class="val">${fmt(fattening.length)}</div><div class="sub">الهدف 35–45 كغ</div></div>
      <div class="stat green"><div class="lab">إيراد متوقع عند البيع</div><div class="val money">${fmt(Math.round(b.lambs.filter(l=>!l.saleDate).reduce((a,l)=>a+Math.max(0,Number(l.currentKg||0))*state.prices.lambKg,0)))}</div><div class="sub">بالوزن الحالي وسعر اليوم</div></div>
    </div>
  </div>
  <div class="card"><h3><span class="hico">💡</span> قواعد الحمل والصغار</h3>${BREEDING_TIPS.map(t=>`<div class="note" style="margin:7px 0">${t}</div>`).join('')}</div>`;
}

/* ---------- صفحة الروتين اليومي ---------- */
function pageRoutine(){
  const done=state.routineDone[today()]||[];
  const daily=state.feed.schedule;
  return `
  ${hero('الروتين اليومي','مناديل صغيرة كل يوم تصنع مزرعة كبيرة: أوقات، مهام، وتذكيرات تلقائية.','⏰ الانضباط هو نصف الإنتاج','assets/photos/sheep-barn-outdoor.jpg')}
  <div class="grid g2">
    <div class="card">
      <h3><span class="hico">✅</span> قائمة اليوم — ${today()}</h3>
      ${daily.length? daily.map(s=>`<div class="task ${done.includes(s.id)?'done':''}"><input type="checkbox" data-act="toggle-routine" data-id="${s.id}" ${done.includes(s.id)?'checked':''}><label><b class="money">${esc(s.time)}</b> — ${esc(s.task)} <small style="color:#8a958c">(${({sheep:'أغنام',chickens:'دجاج',rabbits:'أرانب',all:'عام'})[s.species]||s.species})</small></label></div>`).join(''):'<div class="empty">لا يوجد روتين مسجّل.</div>'}
      <div class="note">تُحفظ القائمة حسب التاريخ — غداً تبدأ من جديد.</div>
    </div>
    <div class="card">
      <h3><span class="hico">📅</span> مهام دورية</h3>
      <div class="table-wrap"><table><thead><tr><th>التكرار</th><th>المهمة</th></tr></thead><tbody>
        ${ROUTINE_WEEKLY.map(w=>`<tr><td><span class="pill b">${w[0]}</span></td><td>${w[1]}</td></tr>`).join('')}
      </tbody></table></div>
      <h3 style="margin-top:18px"><span class="hico">⏰</span> إضافة وقت/مهمة</h3>
      <form data-form="feedplan" class="row">
        <label class="fld">الوقت<input class="inp" name="time" type="time" value="09:00" required></label>
        <label class="fld">الصنف<select class="inp" name="species"><option value="sheep">أغنام</option><option value="chickens">دجاج</option><option value="rabbits">أرانب</option><option value="all">عام</option></select></label>
        <label class="fld">المهمة<input class="inp" name="task" required></label>
        <label class="fld">الكمية<input class="inp" name="qty" placeholder="اختياري"></label>
        <button class="btn" type="submit">＋ إضافة</button>
      </form>
    </div>
  </div>
  ${reminderCard()}
  <div class="card"><h3><span class="hico">💡</span> لماذا الروتين مهم؟</h3>
    <div class="note">الأغنام والدجاج تكره المفاجآت: تغيير وقت الأكل أو تأخير الماء يخفض الإنتاج ويرفع الإجهاد.</div>
    <div class="note">10 دقائق صباحاً و10 مساءً تكفي لاكتشاف مريض قبل أن يصبح وباءً في القطيع.</div>
  </div>`;
}

/* ---------- تصدير Excel حقيقي (.xlsx) بدون مكتبات خارجية ---------- */
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++) c=CRC_T[(c^u8[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
const XENC=new TextEncoder();
function xesc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');}
function xcol(n){let s='';n++;while(n>0){s=String.fromCharCode(65+((n-1)%26))+s;n=Math.floor((n-1)/26);}return s;}
function sheetXML(rows){
  const cols=Math.max(...rows.map(r=>r.length),1);
  const body=rows.map((row,ri)=>`<row r="${ri+1}">`+row.map((v,ci)=>{
    const ref=xcol(ci)+(ri+1);
    if(typeof v==='number'&&isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
  }).join('')+`</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${xcol(cols-1)}${rows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>${body}</sheetData></worksheet>`;
}
function makeXlsx(rows){
  const files=[
    ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Suivi" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml',sheetXML(rows)]
  ].map(([name,text])=>({name,data:XENC.encode(text)}));
  const local=[],central=[]; let offset=0;
  for(const f of files){
    const nb=XENC.encode(f.name), crc=crc32(f.data);
    const h=new Uint8Array(30+nb.length), dv=new DataView(h.buffer);
    dv.setUint32(0,0x04034b50,true); dv.setUint16(4,20,true); dv.setUint16(6,0x0800,true);
    dv.setUint16(8,0,true); dv.setUint16(10,0,true); dv.setUint16(12,0x0021,true);
    dv.setUint32(14,crc,true); dv.setUint32(18,f.data.length,true); dv.setUint32(22,f.data.length,true);
    dv.setUint16(26,nb.length,true); dv.setUint16(28,0,true); h.set(nb,30);
    const c=new Uint8Array(46+nb.length), cv=new DataView(c.buffer);
    cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true);
    cv.setUint16(8,0x0800,true); cv.setUint16(10,0,true); cv.setUint16(12,0,true); cv.setUint16(14,0x0021,true);
    cv.setUint32(16,crc,true); cv.setUint32(20,f.data.length,true); cv.setUint32(24,f.data.length,true);
    cv.setUint16(28,nb.length,true); cv.setUint16(30,0,true); cv.setUint16(32,0,true);
    cv.setUint16(34,0,true); cv.setUint16(36,0,true); cv.setUint32(38,0,true); cv.setUint32(42,offset,true);
    c.set(nb,46);
    local.push(h,f.data); central.push(c); offset+=h.length+f.data.length;
  }
  const cdSize=central.reduce((a,c)=>a+c.length,0);
  const e=new Uint8Array(22), ev=new DataView(e.buffer);
  ev.setUint32(0,0x06054b50,true); ev.setUint16(4,0,true); ev.setUint16(6,0,true);
  ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true);
  ev.setUint32(12,cdSize,true); ev.setUint32(16,offset,true); ev.setUint16(20,0,true);
  return new Blob([...local,...central,e],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

/* ---------- التوجيه ---------- */
const RENDERERS={dashboard:pageDashboard,sheep:pageSheep,chickens:pageChickens,rabbits:pageRabbits,costs:pageCosts,simulator:pageSimulator,tracking:pageTracking,feed:pageFeed,health:pageHealth,breeding:pageBreeding,routine:pageRoutine,plan:pagePlan};
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
  if(t.dataset.act==='toggle-routine'){
    const d=today(); const cur=state.routineDone[d]||[];
    state.routineDone[d]=t.checked?[...cur,Number(t.dataset.id)]:cur.filter(x=>x!=t.dataset.id);
    save(); render();
  }
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
  const drops={
    'del-feed':()=>state.feed.stocks=state.feed.stocks.filter(x=>x.id!=b.dataset.id),
    'del-feedlog':()=>state.feed.logs=state.feed.logs.filter(x=>x.id!=b.dataset.id),
    'del-feedplan':()=>state.feed.schedule=state.feed.schedule.filter(x=>x.id!=b.dataset.id),
    'del-treat':()=>state.health.treatments=state.health.treatments.filter(x=>x.id!=b.dataset.id),
    'del-healthplan':()=>state.health.plans=state.health.plans.filter(x=>x.id!=b.dataset.id),
    'del-ewe':()=>state.breeding.ewes=state.breeding.ewes.filter(x=>x.id!=b.dataset.id),
    'del-lamb':()=>state.breeding.lambs=state.breeding.lambs.filter(x=>x.id!=b.dataset.id),
    'del-egg':()=>state.eggs=state.eggs.filter(x=>x.id!=b.dataset.id),
  };
  if(drops[a]){ drops[a](); save(); render(); return; }
  if(a==='dose'){
    const p=state.health.plans.find(x=>x.id==b.dataset.id);
    if(p){
      const d=today();
      p.due=addDays(d,p.everyDays);
      state.health.treatments.push({id:Date.now()+Math.floor(Math.random()*1000),date:d,animal:'القطيع',species:p.species,drug:p.name,dose:'',reason:'وقاية',vet:'',withdrawalDays:0,notes:''});
      save(); render();
    }
  }
  if(a==='export'){
    const head=['التاريخ','الصنف','الحيوان','الحدث','مصروف (د.م)','إيراد (د.م)','ملاحظة'];
    const sp={sheep:'أغنام',chickens:'دجاج',rabbits:'أرانب',all:'عام'};
    const rows=[head,...state.logs.map(l=>[l.date,sp[l.species]||l.species,l.animal||'',l.event,Number(l.cost||0),Number(l.revenue||0),l.notes||''])];
    if(rows.length===1) rows.push(['—','لا توجد أحداث مسجلة بعد','','','','','']);
    const url=URL.createObjectURL(makeXlsx(rows));
    const link=document.createElement('a'); link.href=url; link.download='ferme-de-la-joie-suivi.xlsx';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
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
  if(f.dataset.form==='feed'){
    const fd=new FormData(f);
    state.feed.stocks.push({id:Date.now(),name:String(fd.get('name')||'').trim(),price:Number(fd.get('price')||0),qty:Number(fd.get('qty')||0)});
    save(); render();
  }
  if(f.dataset.form==='feedlog'){
    const fd=new FormData(f), fid=Number(fd.get('feedId')), q=Number(fd.get('qty')||0);
    const st=state.feed.stocks.find(s=>s.id===fid);
    if(st) st.qty=Math.max(0,Number(st.qty||0)-q);
    state.feed.logs.push({id:Date.now(),date:fd.get('date')||today(),time:fd.get('time')||'',species:fd.get('species')||'all',feedId:fid,qty:q,cost:q*Number(st?.price||0),notes:fd.get('notes')||''});
    save(); render();
  }
  if(f.dataset.form==='feedplan'){
    const fd=new FormData(f);
    state.feed.schedule.push({id:Date.now(),time:fd.get('time')||'08:00',species:fd.get('species')||'all',task:String(fd.get('task')||'').trim(),qty:fd.get('qty')||''});
    save(); render();
  }
  if(f.dataset.form==='treat'){
    const fd=new FormData(f);
    state.health.treatments.push({id:Date.now(),date:fd.get('date')||today(),animal:String(fd.get('animal')||'').trim(),species:fd.get('species')||'all',drug:String(fd.get('drug')||'').trim(),dose:fd.get('dose')||'',reason:fd.get('reason')||'',vet:fd.get('vet')||'',withdrawalDays:Number(fd.get('withdrawalDays')||0),notes:fd.get('notes')||''});
    save(); render();
  }
  if(f.dataset.form==='healthplan'){
    const fd=new FormData(f);
    state.health.plans.push({id:Date.now(),name:String(fd.get('name')||'').trim(),species:fd.get('species')||'sheep',everyDays:Number(fd.get('everyDays')||90),due:fd.get('due')||''});
    save(); render();
  }
  if(f.dataset.form==='ewe'){
    const fd=new FormData(f), num=String(fd.get('num')||'').trim(), ld=fd.get('lambDate')||'', n=Number(fd.get('lambCount')||0);
    state.breeding.ewes.push({id:Date.now(),num,matingDate:fd.get('matingDate')||today(),lambDate:ld,lambCount:n});
    if(ld&&n>0){
      const startN=state.breeding.lambs.length;
      for(let i=1;i<=n;i++){
        state.breeding.lambs.push({id:'L'+String(startN+i).padStart(2,'0'),eweNum:num,birthDate:ld,sex:i%2?'F':'M',birthKg:4,currentKg:4,fattenStart:'',targetKg:40,saleDate:''});
      }
    }
    save(); render();
  }
  if(f.dataset.form==='lamb'){
    const fd=new FormData(f);
    state.breeding.lambs.push({id:String(fd.get('id')||'').trim(),eweNum:fd.get('eweNum')||'',birthDate:fd.get('birthDate')||today(),sex:fd.get('sex')||'F',birthKg:Number(fd.get('birthKg')||0),currentKg:Number(fd.get('currentKg')||0),fattenStart:fd.get('fattenStart')||'',targetKg:Number(fd.get('targetKg')||40),saleDate:''});
    save(); render();
  }
  if(f.dataset.form==='weight'){
    const fd=new FormData(f), l=state.breeding.lambs.find(x=>x.id===fd.get('lambId'));
    if(l){ l.currentKg=Number(fd.get('kg')||0); if(fd.get('saleDate')) l.saleDate=fd.get('saleDate'); }
    save(); render();
  }
  if(f.dataset.form==='egg'){
    const fd=new FormData(f);
    state.eggs.push({id:Date.now(),date:fd.get('date')||today(),count:Number(fd.get('count')||0),broken:Number(fd.get('broken')||0),notes:fd.get('notes')||''});
    save(); render();
  }
});

/* ---------- بدء ---------- */
document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelector('.lightbox')?.remove(); });
$('#datechip').textContent=new Date().toLocaleDateString('ar-MA',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
render();
