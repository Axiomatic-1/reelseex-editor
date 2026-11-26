/* Панель использует ту же подписанную Telegram-сессию и переключение API, что и профиль. */
window.openOwnerPanel = function ({api, h, actor}) {
  const root = h("div", {class:"owner"});
  const status = h("p", {class:"hint", role:"status", "aria-live":"polite"});
  const main = h("div");
  let revision = 0, busy = false;
  const tabs = ["Обзор","Пользователи","Журнал"];
  let tab = "Обзор", days = 7, query = "", page = 1, logPage = 1;
  const key = "owner-grant-" + actor;
  const date = s => s ? new Date(s).toLocaleString("ru-RU") : "нет данных";
  const number = v => Number(v).toLocaleString("ru-RU",{maximumFractionDigits:9});
  const button = (label, action, disabled=false) => h("button",{class:"act",type:"button",onclick:action,disabled},label);
  const line = (name,value) => h("div",{class:"row"},[h("span",{class:"lbl"},name),h("strong",null,String(value))]);
  const block = (title,...children) => h("section",{class:"sec"},[h("h2",null,title),...children]);
  const hint = text => h("p",{class:"hint"},text);
  const nav = h("div",{class:"acts"});
  const msg = e => e.message || "Не удалось загрузить данные";
  const wallet = k => k==="project" ? "На замену за счёт проекта" : "Обычные кредиты";
  function pager(current, more, go) {
    return h("div",{class:"acts"},[button("Назад",()=>go(current-1),current===1),hint("Страница "+current),button("Дальше",()=>go(current+1),!more)]);
  }
  function pending() { const raw=sessionStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  async function send(payload) {
    if (busy) return;
    busy=true; status.textContent="Сохраняю начисление…";
    try {
      sessionStorage.setItem(key,JSON.stringify(payload));
      const res=await api("/admin/grants",{method:"POST",body:payload,timeout:16000});
      sessionStorage.removeItem(key);
      status.textContent=(res.repeated?"Уже учтено. ":"Начислено. ")+"Баланс "+res.user.credits+", на замену "+res.user.eligible+".";
      tab="Журнал"; logPage=1;
    } catch(e) {
      if ([400,403,404,409].includes(e.status)) sessionStorage.removeItem(key);
      status.textContent=msg(e);
    } finally {busy=false; render();}
  }
  function form(u) {
    revision++; main.replaceChildren();
    const amount=h("input",{type:"number",min:1,max:2147483647,step:1,required:true,inputmode:"numeric"});
    const kind=h("select",null,["ordinary","project"].map(k=>h("option",{value:k},wallet(k))));
    const note=h("textarea",{maxlength:300,required:true,rows:2});
    const submit=h("button",{type:"submit",class:"act primary"},"Начислить");
    const fields=h("form",null,[h("label",null,["Количество",amount]),h("label",null,["Назначение",kind]),h("label",null,["Основание",note]),submit]);
    fields.onsubmit=e=>{
      e.preventDefault();
      if (busy || !note.value.trim() || !fields.reportValidity()) return;
      const payload={request_id:crypto.randomUUID(),user_id:u.id,amount:Number(amount.value),wallet:kind.value,note:note.value.trim()};
      submit.disabled=true; send(payload);
    };
    main.append(block("Начисление",hint((u.username?"@"+u.username+" · ":"")+"Telegram ID "+u.id),line("Общий баланс",u.credits),line("Для замены",u.eligible),fields,button("К списку",render)));
  }
  async function users(id) {
    const q=h("input",{type:"search",value:query,placeholder:"Username, имя или Telegram ID","aria-label":"Поиск пользователей"});
    const search=h("form",{class:"owner-search"},[q,h("button",{type:"submit",class:"act"},"Найти")]);
    search.onsubmit=e=>{e.preventDefault();query=q.value.trim();page=1;render();};
    main.replaceChildren(block("Пользователи бота",search));
    const data=await api("/admin/users?q="+encodeURIComponent(query)+"&page="+page);
    if (revision!==id) return;
    const items=data.items.map(u=>h("div",{class:"row"},[h("div",{class:"lbl"},[
      h("b",null,u.username?"@"+u.username:u.name||"Без имени"),h("small",null,String(u.id)+(u.name?" · "+u.name:"")),
      h("small",null,"Баланс "+u.credits+" · на замену "+u.eligible)]),button("Начислить",()=>form(u))]));
    main.append(block("Найдено: "+data.total,...items,pager(page,page*25<data.total,n=>{page=n;render();})));
  }
  async function history(id) {
    const data=await api("/admin/grants?page="+logPage);
    if (revision!==id) return;
    main.replaceChildren(block("Начисления из панели",...data.items.map(r=>h("div",{class:"owner-event"},[
      h("b",null,"+"+r.amount+" · "+wallet(r.wallet)),h("p",null,r.note),hint("Получатель "+r.user+" · администратор "+r.actor),
      hint(date(r.at)+" · "+r.request_id)])),data.items.length?null:hint("Начислений пока нет."),
      pager(logPage,data.more,n=>{logPage=n;render();})));
  }
  async function metrics(id) {
    const periods=h("div",{class:"acts"},[1,7,30].map(n=>button(n+" дн.",()=>{days=n;render();},days===n)));
    main.replaceChildren(block("Период",periods));
    const m=await api("/admin/metrics?days="+days);
    if (revision!==id) return;
    const health=m.health, last=health.latest, stale=!last.measured || Date.now()-Date.parse(last.measured)>11*60000;
    const routes=last.routes||[], degraded=routes.some(r=>!r.ok);
    const stars=m.sources.stars, fal=m.sources.fal;
    const names={montages:"Монтаж",swaps:"Замена героя",swap_redos:"Переделка",analyses:"Разбор",scripts:"Сценарии"};
    const states={queued:"в очереди",running:"в работе",draft:"черновик",collecting:"сбор клипов",done:"готово",saved:"сохранено",ok:"успех",error:"ошибка",cancelled:"отменено"};
    main.append(block("Доступность",line("Сейчас",stale?"Нет свежего замера":!last.available?"Недоступно":degraded?"Частичная деградация":"Доступно"),
      ...routes.map(r=>line(r.label+" · "+r.host,r.ok?"OK":"Сбой")),
      hint("С рабочего Mac · "+date(last.measured)+". Доступность требует загрузки Mini App, чтения БД, проверки авторизации и CORS хотя бы через один публичный API."),
      line("Успешные замеры",health.checks?number(100*health.ok/health.checks)+"%":"—"),
      hint(health.ok+" из "+health.checks+" проверок. Слотов в периоде: "+health.expected+". Начало наблюдений в периоде: "+date(health.first)+". Пропуски не учитываются как успех.")),
      block("Пользователи",line("Всего",m.users.total),line("Новые за период",m.users.new),line("Активные за период",m.users.active),hint("Активность — последнее обращение в бот или API.")),
      block("Операции",...m.operations.map(r=>line((names[r.type]||r.type)+" · "+(states[r.status]||r.status),r.count+(r.seconds!=null?" · "+r.seconds+" с":""))),
        hint("По дате создания и текущему статусу. Время — среднее от создания до последнего обновления, включая ожидание.")),
      block("Деньги",line("Поступления Stars",stars?.offset!=null?number(m.money.stars_in)+" XTR":"—"),line("Возвраты Stars",stars?.offset!=null?number(m.money.stars_out)+" XTR":"—"),
        hint("Telegram Star Transactions · "+(stars?.ok && stars.complete?"сверено":"неполные данные")+" · "+date(stars?.checked)),
        line("Поступления USDT",number(m.money.usdt_in)+" USDT"),line("Из них по оплаченным счетам",number(m.money.usdt_matched)+" USDT"),line("Без сопоставления",number(m.money.usdt_unmatched)+" USDT"),
        line("Возвраты USDT","Внешние не отслеживаются"),hint("По подтверждённым входящим переводам TON, зарегистрированным сервисом. У приложения нет операции возврата USDT.")),
      block("Расходы fal",line("По запросам ReelseeX",m.fal.billed?"$"+number(m.fal.usd):"Нет подтверждённых списаний"),
        hint("Замена, переделка и подготовка фото. Сверено "+m.fal.billed+" из "+m.fal.tracked+" request_id за период. Учёт с "+date(fal?.since)+"."),
        line("Общий аккаунт за 24 часа",fal?.account_24h_usd!=null?"$"+number(fal.account_24h_usd):"—"),
        hint("Все проекты аккаунта · на "+date(fal?.account_to)+(fal?.ok?"":" · источник недоступен")),
        line("Оценка по готовым заменам за всё время",m.fal.estimate!=null?"≈ $"+number(m.fal.estimate):"—"),
        hint(m.fal.estimated_swaps+" сохранённых результатов с "+date(m.fal.estimate_since)+". Включает успешные переделки в сумме родительского ролика, пропускает неуспешные вызовы.")));
  }
  function render() {
    const id=++revision;
    nav.replaceChildren(...tabs.map(name=>button(name,()=>{tab=name;status.textContent="";render();},busy||tab===name)),button("Обновить",render,busy));
    let saved;
    try {saved=pending();} catch(e) {status.textContent="Хранилище браузера недоступно. Открой панель заново.";return;}
    if (saved) {
      main.replaceChildren(block("Проверить отправленное начисление",hint("Получатель "+saved.user_id+" · "+saved.amount+" · "+wallet(saved.wallet)),hint(saved.note),
        button("Проверить и завершить",()=>send(saved),busy)));
      return;
    }
    main.replaceChildren(hint("Загрузка…"));
    (tab==="Обзор"?metrics(id):tab==="Пользователи"?users(id):history(id)).catch(e=>{
      if (id===revision) main.replaceChildren(block("Ошибка",hint(msg(e)),button("Повторить",render)));
    });
  }
  root.append(h("h1",null,"Управление"),nav,status,main);render();return root;
};
