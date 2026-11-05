/* Mini App Reelseex — одностраничное приложение без сборки (docs/api-contract.md §4).
   Вкладки: Монтаж · Звуки · Тренды · Радар · Профиль. Данные — API (§3) с заголовком Authorization: tma <initData>;
   без адреса API в config.js или вне Telegram — демо-режим на моках (demo.js). */
(function () {
  "use strict";

  // ---------- окружение ----------
  const CFG = window.REELSEEX || {};
  const tg = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData !== undefined) ? window.Telegram.WebApp : null;
  const inTelegram = !!(tg && tg.initData);
  const API = String(CFG.api || "").replace(/\/+$/, "");
  const DEMO = !API || !inTelegram;
  const BOT = String(CFG.bot || "Reelseex_bot").replace(/^@/, "");
  const DEMO_API = window.REELSEEX_DEMO || null;
  const TABS = [["montage", "🎬", "Монтаж"], ["sounds", "🎶", "Звуки"], ["trends", "🔥", "Тренды"], ["radar", "🎯", "Радар"], ["profile", "👤", "Профиль"]];
  const TAB_NAMES = TABS.map((t) => t[0]);
  const STYLE_ORDER = ["auto", "talking", "vlog", "sport", "aesthetic", "trend", "ad"];
  const MUSIC = [["trend", "Тренд"], ["library", "Бесплатная"], ["none", "Без музыки"]];
  const TREND = {up: "⬆️ растёт", new: "🆕 новый", down: "⬇️ падает"};
  const PLATFORM = {yt: "▶️ Shorts", tt: "🎵 TikTok", ig: "📸 Reels", vk: "🟦 VK", file: "📎 Файл"};
  const HOURS = [7, 8, 9, 10, 12, 15, 18, 20, 22];
  const STATUS = {collecting: "собираю клипы", queued: "в очереди", running: "монтирую", done: "готов", error: "ошибка", cancelled: "отменён"};
  const REASON = {montage: "монтаж", analysis: "разбор", script: "сценарий", welcome: "подарок на старт", stars: "пополнение ⭐", stars_refund: "возврат ⭐", refund: "возврат", grant: "начисление", admin: "начисление"};
  const hasSecondary = !!(tg && tg.SecondaryButton && tg.isVersionAtLeast && tg.isVersionAtLeast("7.10"));

  // ---------- состояние ----------
  const S = {
    me: null, fatal: null, tab: "trends", card: null, scroll: {},
    onb: {step: 0, slug: null, custom: "", about: "", platforms: [], saving: false},
    montage: {cur: undefined, loading: false, error: null, list: null, listLoading: false, picker: null, wishDraft: null, savingWish: false, busy: false},
    sounds: {items: [], page: 0, hasMore: true, loading: false, error: null},
    trends: {items: [], offset: 0, limit: 5, collecting: false, loading: false, loaded: false, hasMore: true, error: null, link: "", linkBusy: false},
    radar: {items: null, max: 30, loading: false, error: null, link: "", linkBusy: false},
    profile: {ledger: undefined, ledgerOpen: false, packsOpen: false, aboutDraft: null, savingAbout: false},
    cards: {}, timers: {}, renderPending: false
  };

  // ---------- мелкие помощники ----------
  const $ = (sel) => document.querySelector(sel);
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    append(el, children);
    return el;
  }
  function append(el, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) { children.forEach((c) => append(el, c)); return; }
    el.appendChild(typeof children === "string" || typeof children === "number" ? document.createTextNode(String(children)) : children);
  }
  function plural(n, a, b, c) { n = Number(n) || 0; const m = Math.abs(n) % 10, k = Math.abs(n) % 100; return n + " " + (m === 1 && k !== 11 ? a : m >= 2 && m <= 4 && (k < 10 || k >= 20) ? b : c); }
  function mmss(t) { t = Math.round(Number(t) || 0); const m = Math.floor(t / 60), s = t % 60; return m ? m + ":" + ("0" + s).slice(-2) : s + " с"; }
  function num(n) {
    if (n === null || n === undefined) return "?";
    n = Number(n);
    if (n < 1000) return String(n);
    const v = n < 1e6 ? n / 1000 : n / 1e6, unit = n < 1e6 ? "тыс." : "млн";
    return v.toFixed(1).replace(/\.0$/, "").replace(".", ",") + " " + unit;
  }
  function times(x) { if (x === null || x === undefined) return "?"; x = Number(x); return "×" + (x >= 10 ? Math.round(x) : x.toFixed(1).replace(".", ",")); }
  function ago(s) {
    if (!s) return "дата неизвестна";
    const hrs = (Date.now() - new Date(s).getTime()) / 36e5;
    if (hrs < 1) return "только что";
    if (hrs < 48) return Math.floor(hrs) + " ч назад";
    return Math.floor(hrs / 24) + " дн назад";
  }
  function fmtDate(s) {
    if (!s) return "";
    const d = new Date(s);
    const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    return d.getDate() + " " + months[d.getMonth()] + ", " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "impact") tg.HapticFeedback.impactOccurred("light");
      else if (kind === "success" || kind === "error" || kind === "warning") tg.HapticFeedback.notificationOccurred(kind);
      else tg.HapticFeedback.selectionChanged();
    } catch (e) { /* не критично */ }
  }
  function openLink(u) { if (!u) return; try { if (tg && tg.openLink) tg.openLink(u); else window.open(u, "_blank", "noopener"); } catch (e) { window.open(u, "_blank", "noopener"); } }
  function openBot(param) {
    const u = "https://t.me/" + BOT + (param ? "?start=" + encodeURIComponent(param) : "");
    try { if (tg && tg.openTelegramLink) { tg.openTelegramLink(u); return; } } catch (e) { /* ниже */ }
    window.open(u, "_blank", "noopener");
  }
  function confirmDialog(text) {
    return new Promise((resolve) => {
      try { if (tg && tg.showConfirm && tg.isVersionAtLeast && tg.isVersionAtLeast("6.2")) { tg.showConfirm(text, (ok) => resolve(!!ok)); return; } } catch (e) { /* ниже */ }
      resolve(window.confirm(text));
    });
  }
  let toastTimer = null;
  function toast(text, action) {
    const box = $("#toasts");
    box.textContent = "";
    const t = h("div", {class: "toast", role: "status"}, [h("span", null, [text])]);
    if (action) t.appendChild(h("button", {class: "toast-act", onclick: () => { t.remove(); action.fn(); }}, [action.label]));
    box.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), action ? 6500 : 3500);
  }
  function spinner(text) { return h("div", {class: "state"}, [h("div", {class: "spin", "aria-hidden": "true"}), text ? h("p", {class: "hint"}, [text]) : null]); }
  function skeleton(rows) { return h("div", {class: "skel-list", "aria-busy": "true"}, Array.from({length: rows || 4}, () => h("div", {class: "skel"}))); }
  function stateBox(icon, title, text, actions) {
    return h("div", {class: "state"}, [h("div", {class: "big"}, [icon]), title ? h("p", {class: "title"}, [title]) : null, text ? h("p", {class: "hint"}, [text]) : null,
      actions && actions.length ? h("div", {class: "acts center"}, actions) : null]);
  }
  function errorBox(e, retry) {
    const net = !e || e.status === 0;
    return stateBox(net ? "📡" : "😕", net ? "Нет связи" : "Не получилось", (e && e.message) || "Попробуй ещё раз", retry ? [h("button", {class: "act", onclick: retry}, ["Повторить"])] : null);
  }
  function section(title, children, extraClass) { return h("div", {class: "sec" + (extraClass ? " " + extraClass : "")}, [title ? h("h2", null, [title]) : null, children]); }
  function sw(checked, label, onchange) { return h("button", {class: "sw", role: "switch", "aria-checked": String(!!checked), "aria-label": label, onclick: onchange}); }
  function row(label, small, control) { return h("div", {class: "row"}, [h("div", {class: "lbl"}, [label, small ? h("small", null, [small]) : null]), control]); }

  // ---------- API ----------
  function httpMessage(status) {
    return {400: "Не понял запрос", 401: "Открой приложение из Telegram", 402: "Не хватает кредитов", 403: "Нет доступа", 404: "Не найдено",
      409: "Сейчас нельзя", 429: "Слишком часто — подожди минуту", 500: "Ошибка на сервере", 502: "Сервер не отвечает", 503: "Сервер не отвечает"}[status] || "Что-то пошло не так";
  }
  function api(path, opts) {
    opts = opts || {};
    const method = opts.method || "GET";
    if (DEMO) {
      if (!DEMO_API) return Promise.reject({status: 0, error: "network", message: "Демо-режим недоступен: не загрузился demo.js"});
      return DEMO_API.request(method, path, opts.body);
    }
    const headers = {Authorization: "tma " + tg.initData};
    const init = {method, headers};
    if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch(API + path, init).then(
      (r) => r.text().then((txt) => {
        let data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (r.ok) return data;
        const d = data && typeof data === "object" ? data : {};
        const e = {status: r.status, error: d.error || "error", message: d.message || httpMessage(r.status)};
        if (d.need !== undefined) e.need = d.need;
        if (d.have !== undefined) e.have = d.have;
        throw e;
      }),
      () => { throw {status: 0, error: "network", message: "Нет связи с сервером"}; }
    );
  }
  // Ошибки по §2: 401 — экран «открой из Telegram», 402 — экран «не хватает кредитов», сеть — тост с «Повторить», остальное — тост.
  function handleError(e, retry) {
    if (!e || typeof e !== "object") e = {status: 0, message: String(e)};
    if (e.status === 401) { showAuth(); return; }
    if (e.status === 402) { haptic("warning"); openCard({type: "nocredits", need: e.need, have: e.have, message: e.message}); return; }
    haptic("error");
    if (e.status === 0) { toast(e.message || "Нет связи", retry ? {label: "Повторить", fn: retry} : null); return; }
    toast(e.message || httpMessage(e.status));
  }
  function showAuth() {
    stopPolls();
    S.fatal = () => stateBox("🔒", "Открой приложение из Telegram", "Нажми кнопку «🎬 Открыть Reelseex» в чате с ботом — так я узнаю, кто ты.",
      [h("button", {class: "act", onclick: () => openBot()}, ["Открыть чат с ботом"])]);
    render();
  }

  // ---------- кнопки Telegram (Main/Secondary/Back) ----------
  const BTN = {main: null, secondary: null, wired: false, back: null};
  function setButtons(main, secondary) { BTN.main = main || null; BTN.secondary = secondary || null; }
  function applyButtons(view) {
    const fallback = [];
    if (tg) {
      try {
        if (!BTN.wired) {
          BTN.wired = true;
          tg.MainButton.onClick(() => { if (BTN.main && BTN.main.active !== false) BTN.main.onClick(); });
          if (hasSecondary) tg.SecondaryButton.onClick(() => { if (BTN.secondary && BTN.secondary.active !== false) BTN.secondary.onClick(); });
        }
        if (BTN.main) tg.MainButton.setParams({text: BTN.main.text.slice(0, 64), is_visible: true, is_active: BTN.main.active !== false});
        else tg.MainButton.setParams({is_visible: false});
        if (hasSecondary) {
          if (BTN.secondary) tg.SecondaryButton.setParams({text: BTN.secondary.text.slice(0, 64), is_visible: true, is_active: BTN.secondary.active !== false, position: "left"});
          else tg.SecondaryButton.setParams({is_visible: false});
        } else if (BTN.secondary) fallback.push(BTN.secondary);
      } catch (e) { /* старый клиент */ }
    } else {
      if (BTN.secondary) fallback.push(BTN.secondary);
      if (BTN.main) fallback.push(BTN.main);
    }
    document.body.classList.toggle("has-bar", fallback.length > 0);
    Array.from(view.querySelectorAll(".bottombar")).forEach((b) => b.remove());
    if (fallback.length) view.appendChild(h("div", {class: "bottombar"}, fallback.map((b, i) => h("button", {
      class: "bar-btn" + (b === BTN.main ? " primary" : ""), disabled: b.active === false, onclick: () => b.onClick()}, [b.text]))));
  }
  function mainProgress(on) { try { if (tg) { on ? tg.MainButton.showProgress(false) : tg.MainButton.hideProgress(); } } catch (e) { /* ignore */ } }
  function applyBack(fn) {
    BTN.back = fn || null;
    if (!tg || !tg.BackButton) return;
    try {
      if (!BTN.backWired) { BTN.backWired = true; tg.BackButton.onClick(() => { if (BTN.back) BTN.back(); }); }
      fn ? tg.BackButton.show() : tg.BackButton.hide();
    } catch (e) { /* ignore */ }
  }

  // ---------- опросы ----------
  function setPoll(name, fn, ms) { clearTimeout(S.timers[name]); S.timers[name] = setTimeout(() => { delete S.timers[name]; if (document.visibilityState !== "hidden") fn(); }, ms); }
  function stopPolls() { Object.keys(S.timers).forEach((k) => clearTimeout(S.timers[k])); S.timers = {}; }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") stopPolls(); else render(); });

  // ---------- навигация ----------
  function go(tab, card) {
    if (S.tab === tab && !card && !S.card) { window.scrollTo(0, 0); return; }
    S.scroll[S.tab + (S.card ? ":card" : "")] = window.scrollY;
    S.tab = tab; S.card = card || null; S.montage.picker = null;
    if (tab === "profile") S.profile.fresh = false;
    stopPolls();
    render();
    window.scrollTo(0, 0);
  }
  function openCard(card) { S.scroll[S.tab] = window.scrollY; S.card = card; stopPolls(); render(); window.scrollTo(0, 0); }
  function closeCard() {
    const back = S.card && S.card.back;
    S.card = null; stopPolls(); render();
    if (typeof back === "function") back();
    window.scrollTo(0, S.scroll[S.tab] || 0);
  }
  function initialRoute() {
    let p = "";
    try { p = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || ""; } catch (e) { p = ""; }
    const q = new URLSearchParams(location.search);
    p = String(p || q.get("screen") || q.get("tgWebAppStartParam") || "").trim();
    if (!p) return null;
    let m;
    if ((m = /^m(\d+)$/.exec(p))) return {tab: "montage", montageId: Number(m[1])};
    if ((m = /^v(\d+)$/.exec(p))) return {tab: "trends", card: {type: "video", id: Number(m[1])}};
    const short = {m: "montage", s: "sounds", t: "trends", r: "radar", p: "profile"};
    if (short[p]) return {tab: short[p]};
    if (TAB_NAMES.includes(p)) return {tab: p};
    return null;
  }

  // ---------- рендер ----------
  function render() {
    if (document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName) && document.activeElement.dataset.keep === "1") {
      S.renderPending = true;        // человек печатает — перерисуем, когда отпустит поле
      return;
    }
    S.renderPending = false;
    const view = $("#view"), bar = $("#tabbar");
    view.textContent = "";
    setButtons(null, null);
    let back = null;
    if (S.fatal) {
      bar.hidden = true; document.body.classList.remove("tabs-on");
      view.appendChild(S.fatal());
    } else if (!S.me) {
      bar.hidden = true; document.body.classList.remove("tabs-on");
      view.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Reelseex"]), h("div", {class: "sub"}, ["загружаю…"])])]));
      view.appendChild(skeleton(5));
    } else if (!S.me.onboarded) {
      bar.hidden = true; document.body.classList.remove("tabs-on");
      view.appendChild(renderOnboarding());
      if (S.onb.step > 0) back = () => { S.onb.step -= 1; haptic(); render(); };
    } else {
      bar.hidden = false; document.body.classList.add("tabs-on");
      renderTabbar(bar);
      if (DEMO) view.appendChild(h("div", {class: "demo-note"}, [inTelegram ? "Демо-режим: адрес API не задан в config.js" : "Демо-режим: данные ненастоящие, запросов в сеть нет"]));
      if (S.card) { view.appendChild(renderCard(S.card)); back = closeCard; }
      else view.appendChild(renderTab(S.tab));
    }
    // вне Telegram нет нативной BackButton — рисуем свою
    if (back && !(tg && tg.BackButton)) view.insertBefore(h("button", {class: "back", onclick: back}, ["← Назад"]), view.firstChild);
    applyButtons(view);
    applyBack(back);
  }
  function renderTabbar(bar) {
    bar.textContent = "";
    TABS.forEach(([id, icon, label]) => bar.appendChild(h("button", {class: "tab", "aria-current": S.tab === id ? "page" : null, onclick: () => { haptic(); go(id); }},
      [h("span", {class: "ico", "aria-hidden": "true"}, [icon]), h("span", {class: "lab"}, [label])])));
  }
  function renderTab(tab) {
    switch (tab) {
      case "montage": return renderMontageTab();
      case "sounds": return renderSoundsTab();
      case "trends": return renderTrendsTab();
      case "radar": return renderRadarTab();
      case "profile": return renderProfileTab();
      default: return renderTrendsTab();
    }
  }
  function renderCard(card) {
    switch (card.type) {
      case "sound": return renderSoundCard(card);
      case "video": return renderVideoCard(card);
      case "montage": return renderMontageCard(card);
      case "niche": return renderNicheCard(card);
      case "nocredits": return renderNoCredits(card);
      default: return stateBox("🤷", "Такого экрана нет", null, [h("button", {class: "act", onclick: closeCard}, ["Назад"])]);
    }
  }
  function keepInput(el) {
    el.dataset.keep = "1";
    el.addEventListener("blur", () => { if (S.renderPending) setTimeout(render, 120); });
    return el;
  }

  // ---------- онбординг ----------
  function renderOnboarding() {
    const O = S.onb, me = S.me, root = h("div");
    const steps = ["Ниша", "О себе", "Площадки"];
    root.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, [O.step === 0 ? "Привет! Я Reelseex" : steps[O.step]]),
      h("div", {class: "sub"}, ["шаг " + (O.step + 1) + " из 3 · " + steps[O.step]])])]));
    root.appendChild(h("div", {class: "dots", "aria-hidden": "true"}, steps.map((_, i) => h("span", {class: i <= O.step ? "on" : ""}))));
    if (O.step === 0) {
      root.appendChild(section(null, [
        h("p", {class: "lead"}, ["🎬 Автомонтаж под трендовый звук, 🔥 тренды твоей ниши, 🧠 разборы и сценарии, 🎯 радар конкурентов."]),
        h("p", {class: "lead"}, ["Дарю ", h("b", null, [plural(me.credits, "кредит", "кредита", "кредитов")]), " на старт. Для трендов нужна твоя ниша — выбери:"])
      ]));
      root.appendChild(renderNichePicker({
        selectedSlug: O.slug, custom: O.custom,
        onPick: (slug) => { O.slug = slug; O.custom = ""; haptic(); render(); },
        onCustom: (text) => { O.custom = text; O.slug = null; }
      }));
      const ready = !!(O.slug || O.custom.trim().length >= 2);
      setButtons({text: "Дальше", active: ready && !O.saving, onClick: saveNiche}, null);
    } else if (O.step === 1) {
      const ta = keepInput(h("textarea", {rows: 4, maxlength: 500, placeholder: "Например: тренер, веду блог о домашних тренировках без инвентаря. Аудитория — девушки 25–35"}));
      ta.value = O.about;
      ta.addEventListener("input", () => { O.about = ta.value; });
      root.appendChild(section("О себе", [h("p", {class: "hint", style: "margin:0 0 8px"}, ["Пара фраз: кто ты, о чём снимаешь, для кого. Так подборки и сценарии будут точнее. Можно пропустить."]), ta]));
      setButtons({text: "Дальше", active: !O.saving, onClick: () => { O.step = 2; haptic(); render(); }},
        {text: "Пропустить", onClick: () => { O.about = ""; O.step = 2; haptic(); render(); }});
    } else {
      root.appendChild(section("Где публикуешь", [
        h("p", {class: "hint", style: "margin:0 0 10px"}, ["Можно несколько — по ним собираю тренды и примеры."]),
        renderPlatformChips(O.platforms, (codes) => { O.platforms = codes; render(); })
      ]));
      setButtons({text: O.saving ? "Сохраняю…" : "Готово", active: !O.saving, onClick: finishOnboarding}, null);
    }
    return root;
  }
  function renderNichePicker(p) {
    const presets = (S.me && S.me.presets) || [];
    const input = keepInput(h("input", {type: "text", maxlength: 60, placeholder: "Своя ниша — напиши пару слов", value: p.custom || ""}));
    input.addEventListener("input", () => { p.onCustom(input.value); const chips = root.querySelectorAll(".chip[aria-pressed=\"true\"]"); chips.forEach((c) => c.setAttribute("aria-pressed", "false")); syncMain(); });
    function syncMain() { if (BTN.main) { BTN.main.active = !!(input.value.trim().length >= 2 || p.selectedSlug); applyButtons($("#view")); } }
    const root = section("Ниша", [
      h("div", {class: "chips"}, presets.map((x) => h("button", {class: "chip", "aria-pressed": String(p.selectedSlug === x.slug), onclick: () => { input.value = ""; p.onPick(x.slug); }}, [x.title]))),
      h("div", {class: "field"}, [input])
    ]);
    return root;
  }
  function renderPlatformChips(selected, onChange) {
    const choices = (S.me && S.me.platform_choices) || [];
    return h("div", {class: "chips"}, choices.map((c) => h("button", {class: "chip", "aria-pressed": String(selected.includes(c.code)), onclick: () => {
      haptic();
      onChange(selected.includes(c.code) ? selected.filter((x) => x !== c.code) : selected.concat([c.code]));
    }}, [c.title])));
  }
  async function saveNiche() {
    const O = S.onb;
    if (O.saving) return;
    const body = O.slug ? {niche_slug: O.slug} : {custom_niche: O.custom.trim()};
    O.saving = true; mainProgress(true); render();
    try { S.me = await api("/me", {method: "PATCH", body}); O.step = 1; haptic("success"); }
    catch (e) { handleError(e, saveNiche); }
    finally { O.saving = false; mainProgress(false); render(); }
  }
  async function finishOnboarding() {
    const O = S.onb;
    if (O.saving) return;
    const body = {platforms: O.platforms, onboarded: true};
    if (O.about.trim()) body.about = O.about.trim();
    O.saving = true; mainProgress(true); render();
    try {
      S.me = await api("/me", {method: "PATCH", body});
      haptic("success");
      S.trends.loaded = false;
      S.tab = "trends"; S.card = null;
      toast("Готово! Собираю тренды по твоей нише");
    } catch (e) { handleError(e, finishOnboarding); }
    finally { O.saving = false; mainProgress(false); render(); }
  }

  // ---------- Монтаж ----------
  function renderMontageTab() {
    const M = S.montage, root = h("div");
    if (M.cur === undefined) {
      if (!M.loading) loadCurrent(false);
      root.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Монтаж"]), h("div", {class: "sub"}, ["загружаю…"])])]));
      root.appendChild(M.error ? errorBox(M.error, () => { M.error = null; loadCurrent(false); }) : skeleton(4));
      return root;
    }
    const mo = M.cur;
    if (!mo) root.appendChild(renderNoMontage());
    else if (mo.status === "collecting") root.appendChild(renderEditor(mo));
    else root.appendChild(renderMontageState(mo, false));
    root.appendChild(renderHistory());
    // опросы: клипы приходят из чата — current раз в 4 с; рендер — раз в 3 с
    if (!mo || mo.status === "collecting") setPoll("current", () => loadCurrent(true), 4000);
    else if (mo.status === "queued" || mo.status === "running") setPoll("progress", () => pollMontage(mo.id), 3000);
    else setPoll("current", () => loadCurrent(true), 6000);
    return root;
  }
  async function loadCurrent(quiet) {
    const M = S.montage;
    if (!quiet) { M.loading = true; M.error = null; }
    try {
      const r = await api("/montage/current");
      const was = M.cur;
      M.cur = r && r.montage ? r.montage : null;
      if (M.cur) { if (!was || was.id !== M.cur.id) M.wishDraft = null; S.me && (S.me.credits = M.cur.credits); }
      else if (was && was.status !== "collecting" && quiet) M.cur = was;   // готовый/ошибочный держим на экране до «Нового монтажа»
      M.loading = false;
      if (S.tab === "montage" && !S.card) render();
    } catch (e) {
      M.loading = false;
      if (e.status === 401) { showAuth(); return; }
      if (!quiet) { M.error = e; if (S.tab === "montage") render(); }
      else if (S.tab === "montage" && !S.card) setPoll("current", () => loadCurrent(true), 6000);
    }
  }
  async function pollMontage(id) {
    const M = S.montage;
    try {
      const mo = await api("/montage/" + id);
      if (M.cur && M.cur.id === id) {
        const wasDone = M.cur.status !== mo.status && (mo.status === "done" || mo.status === "error");
        M.cur = mo;
        if (S.me) S.me.credits = mo.credits;
        if (wasDone) haptic(mo.status === "done" ? "success" : "error");
      }
      if (S.tab === "montage" && !S.card) render();
    } catch (e) {
      if (e.status === 401) { showAuth(); return; }
      if (S.tab === "montage" && !S.card) setPoll("progress", () => pollMontage(id), 5000);
    }
  }
  function renderNoMontage() {
    const M = S.montage;
    const box = h("div");
    box.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Монтаж"]), h("div", {class: "sub"}, ["нет текущего монтажа"])]), creditsBadge()]));
    box.appendChild(stateBox("📥", "Пришли клипы в чат с ботом", "До 10 клипов, можно альбомом — в подписи напиши пожелание. Подберу трендовый звук и смонтирую под его ритм. Клипы появятся здесь сами.",
      [h("button", {class: "act primary", disabled: M.busy, onclick: newMontage}, ["Новый монтаж"]), h("button", {class: "act", onclick: () => openBot()}, ["Открыть чат"])]));
    return box;
  }
  function creditsBadge() {
    const me = S.me, cost = me && me.prices ? me.prices.montage : null;
    return h("div", {class: "credits" + (cost !== null && me.credits < cost ? " low" : "")}, [h("b", null, [plural(me.credits, "кредит", "кредита", "кредитов")]), cost !== null ? "монтаж · " + cost + " кр." : ""]);
  }
  async function newMontage() {
    const M = S.montage;
    if (M.busy) return;
    M.busy = true; render();
    try { M.cur = await api("/montage", {method: "POST", body: {}}); M.wishDraft = null; M.picker = null; haptic("success"); if (M.list) M.list = null; }
    catch (e) { handleError(e, newMontage); }
    finally { M.busy = false; if (S.tab === "montage") render(); }
  }
  function renderEditor(mo) {
    const M = S.montage, can = mo.can || {};
    const clips = mo.clips || [], total = clips.reduce((a, c) => a + (Number(c.duration) || 0), 0);
    const low = mo.credits < mo.cost;
    const root = h("div");
    root.appendChild(h("div", {class: "top"}, [
      h("div", null, [h("h1", null, ["Монтаж"]), h("div", {class: "sub"}, [clips.length ? plural(clips.length, "клип", "клипа", "клипов") + " · " + mmss(total) : "клипов пока нет"])]),
      h("div", {class: "credits" + (low ? " low" : "")}, [h("b", null, [plural(mo.credits, "кредит", "кредита", "кредитов")]), "монтаж · " + mo.cost + " кр."])
    ]));
    // клипы
    if (clips.length) {
      root.appendChild(h("div", {class: "strip", role: "img", "aria-label": "Клипы по порядку"}, clips.map((c) =>
        h("div", {class: "seg", style: "flex-grow:" + Math.max(Number(c.duration) || 2, 2)}, [c.duration ? Math.round(c.duration) + " с" : "?"]))));
      root.appendChild(section("Клипы", [
        h("div", {class: "clips"}, clips.map((c) => h("div", {class: "clipc"}, [h("span", {class: "n"}, [String(c.n)]),
          h("span", {class: "d"}, [c.duration ? Math.round(c.duration) + " с" : "?"]),
          h("button", {class: "x", "aria-label": "Убрать клип " + c.n, disabled: M.busy, onclick: () => removeClip(mo.id, c.n)}, ["×"])]))),
        h("p", {class: "hint"}, [clips.length < 10 ? "Ещё клипы — пришли в чат с ботом (всего до 10)." : "Это максимум — 10 клипов."])
      ]));
    } else {
      root.appendChild(h("div", {class: "strip empty"}, ["Пришли клипы в чат с ботом — до 10, можно альбомом"]));
    }
    // пожелание
    const draft = M.wishDraft === null ? (mo.wish || "") : M.wishDraft;
    const ta = keepInput(h("textarea", {rows: 2, maxlength: 1000, placeholder: mo.summary ? "Что поменять? Например: «побыстрее, без текста»" : "Например: «душевно, чередуй зал и закаты»"}));
    ta.value = draft;
    const saveBtn = h("button", {class: "act", disabled: draft.trim() === (mo.wish || "").trim() || M.savingWish, onclick: () => saveWish(mo.id, ta.value)}, [M.savingWish ? "Сохраняю…" : "Сохранить"]);
    ta.addEventListener("input", () => { M.wishDraft = ta.value; saveBtn.disabled = ta.value.trim() === (mo.wish || "").trim(); });
    root.appendChild(section("Пожелание", [
      mo.summary ? h("p", {class: "understood"}, [h("b", null, ["Понял так: "]), mo.summary]) : null,
      ta, h("div", {class: "acts"}, [saveBtn])
    ]));
    // музыка
    const music = section("Музыка", []);
    if (mo.music === "own" && mo.own) {
      music.appendChild(row("🎵 Свой трек: " + mo.own, "Права на трек — на тебе. Заменить — пришли другой файл в чат.",
        h("button", {class: "act", disabled: M.busy, onclick: () => removeOwn(mo.id)}, ["Убрать"])));
      music.appendChild(h("p", {class: "hint"}, ["Трек вшивается в файл, тренд-звук при этом не используется. Выбрать другой режим:"]));
    }
    music.appendChild(h("div", {class: "segc", role: "group", "aria-label": "Музыка"}, MUSIC.map(([k, label]) =>
      h("button", {"aria-pressed": String(mo.music === k), disabled: M.busy, onclick: () => { if (mo.music !== k) patchMontage(mo.id, {music: k}); }}, [label]))));
    if (mo.music === "trend") music.appendChild(renderSoundBlock(mo));
    else if (mo.music === "library") music.appendChild(h("p", {class: "hint"}, ["Бесплатный трек по настроению, вшит в файл" + (mo.sound ? " · в темпе звука «" + mo.sound.name + "»" : "") + "."]));
    else if (mo.music === "none") music.appendChild(h("p", {class: "hint"}, ["Живой звук клипов, без музыки."]));
    root.appendChild(music);
    // стиль
    const styles = mo.styles || {};
    const keys = STYLE_ORDER.filter((k) => k in styles).concat(Object.keys(styles).filter((k) => !STYLE_ORDER.includes(k)));
    root.appendChild(section("Стиль", h("div", {class: "chips", role: "group", "aria-label": "Стиль"}, keys.map((k) =>
      h("button", {class: "chip", "aria-pressed": String(mo.style === k), disabled: M.busy, onclick: () => { if (mo.style !== k) patchMontage(mo.id, {style: k}); }}, [styles[k]])))));
    // текст на экране
    root.appendChild(section(null, row("Текст на экране", "Пословные субтитры и хук в начале", sw(mo.captions !== false, "Текст на экране", () => patchMontage(mo.id, {captions: mo.captions === false})))));
    if (low && clips.length) root.appendChild(h("p", {class: "warn", style: "text-align:center"}, ["Не хватает кредитов: " + mo.credits + " из " + mo.cost + ". ",
      h("button", {class: "lnk", onclick: () => { S.profile.packsOpen = true; go("profile"); }}, ["Пополнить"])]));
    root.appendChild(h("p", {class: "foot"}, [clips.length ? "Склейки лягут на ритм выбранного звука. Ролик — 9:16, до минуты." : "Настройки сохранятся — клипы можно прислать потом."]));
    setButtons({text: "🎬 Смонтировать · " + mo.cost + " кр.", active: clips.length > 0 && can.go !== false && !M.busy, onClick: goMontage},
      can.cancel === false ? null : {text: "Отмена", active: !M.busy, onClick: cancelMontage});
    return root;
  }
  function renderSoundBlock(mo) {
    const M = S.montage, snd = mo.sound, box = h("div", {class: "sound"});
    if (!snd) {
      box.appendChild(h("p", {class: "hint", style: "margin:0"}, ["Трендовых звуков с готовым разбором пока нет — смонтирую без привязки к ритму."]));
      box.appendChild(h("div", {class: "acts"}, [h("button", {class: "act", onclick: () => togglePicker(mo)}, [M.picker ? "Скрыть" : "Выбрать звук"])]));
      if (M.picker) box.appendChild(renderPicker(mo));
      return box;
    }
    const meta = [];
    if (snd.bpm) meta.push(snd.bpm + " BPM");
    if (TREND[snd.trend]) meta.push(TREND[snd.trend]);
    if (snd.shorts) meta.push(snd.shorts);
    box.appendChild(h("div", {class: "name"}, ["🎶 " + snd.name]));
    if (meta.length) box.appendChild(h("div", {class: "meta"}, [meta.join(" · ")]));
    const vars = snd.variants || [], curVar = mo.variant || snd.variant || null;
    const v = vars.filter((x) => x.id === curVar)[0] || null;
    if (vars.length >= 2) {
      box.appendChild(h("div", {class: "vars"}, [
        h("div", {class: "lab"}, ["Под этот звук монтируют по-разному — выбери пример"]),
        h("div", {class: "chips scroll", role: "group", "aria-label": "Пример монтажа"}, [
          h("button", {class: "chip", "aria-pressed": String(!curVar), disabled: M.busy, onclick: () => { if (curVar) patchMontage(mo.id, {variant: null}); }}, ["🎲 Как у большинства"])
        ].concat(vars.map((x) => h("button", {class: "chip", "aria-pressed": String(curVar === x.id), disabled: M.busy, onclick: () => { if (curVar !== x.id) patchMontage(mo.id, {variant: x.id}); }},
          [(x.icon ? x.icon + " " : "") + (x.title || "пример " + x.id)]))))
      ]));
      if (v && v.summary) box.appendChild(h("p", {class: "vsum"}, [h("b", null, ["Пример " + v.id + " из " + vars.length + ": "]), v.summary]));
      else if (snd.how) box.appendChild(h("p", {class: "how"}, [h("b", null, ["Как монтируют: "]), snd.how]));
    } else if (snd.how) box.appendChild(h("p", {class: "how"}, [h("b", null, ["Как монтируют: "]), snd.how]));
    const acts = h("div", {class: "acts"});
    acts.appendChild(h("button", {class: "act", disabled: M.busy, onclick: () => togglePicker(mo)}, [M.picker ? "Скрыть список" : "🔁 Другой звук"]));
    const ex = v && v.examples && v.examples[0];
    if (ex) acts.appendChild(h("button", {class: "act link", onclick: () => openLink(ex)}, ["▶️ Пример ролика"]));
    else if (snd.link_shorts) acts.appendChild(h("button", {class: "act link", onclick: () => openLink(snd.link_shorts)}, ["▶️ Ролики под звуком"]));
    acts.appendChild(h("button", {class: "act link", onclick: () => openCard({type: "sound", id: snd.id})}, ["Карточка звука"]));
    box.appendChild(acts);
    if (M.picker) box.appendChild(renderPicker(mo));
    if (mo.embed !== null && mo.embed !== undefined) {
      box.appendChild(h("div", {class: "row", style: "margin-top:12px;padding-top:12px;border-top:1px solid var(--sep)"}, [
        h("div", {class: "lbl"}, ["Вшить звук в файл", h("small", null, [mo.embed ? "Звук будет в самом ролике (настройка админа)" : "Звук ставишь в Instagram — подскажу как"])]),
        sw(!!mo.embed, "Вшить звук в файл", () => patchMontage(mo.id, {embed: !mo.embed}))
      ]));
    } else box.appendChild(h("p", {class: "hint"}, ["Звук ставится в Instagram — после монтажа подскажу как. В файле будет живой звук клипов."]));
    return box;
  }
  function togglePicker(mo) {
    const M = S.montage;
    haptic("impact");
    if (M.picker) { M.picker = null; render(); return; }
    M.picker = {items: [], total: 0, offset: 0, loading: true, error: null};
    render();
    loadPicker(mo.id);
  }
  async function loadPicker(mid) {
    const P = S.montage.picker;
    if (!P) return;
    P.loading = true; P.error = null;
    try {
      const r = await api("/sounds/ranked?mid=" + mid + "&offset=" + P.offset + "&limit=12");
      if (S.montage.picker !== P) return;
      P.items = P.items.concat(r.items || []); P.total = r.total || P.items.length; P.offset = P.items.length;
    } catch (e) { if (e.status === 401) { showAuth(); return; } P.error = e; }
    finally { P.loading = false; if (S.tab === "montage" && !S.card) render(); }
  }
  function renderPicker(mo) {
    const M = S.montage, P = M.picker, cur = mo.sound ? mo.sound.id : null;
    const box = h("div", {class: "picker"}, [h("div", {class: "lab"}, ["Годные звуки под твоё пожелание" + (P.total ? " · " + P.total : "")])]);
    if (!P.items.length && P.loading) box.appendChild(skeleton(3));
    P.items.forEach((s) => box.appendChild(h("button", {class: "item" + (s.id === cur ? " on" : ""), disabled: M.busy, onclick: () => { haptic("impact"); patchMontage(mo.id, {sound_id: s.id, variant: null}, () => { M.picker = null; }); }}, [
      h("div", {class: "t"}, [(TREND[s.trend] ? TREND[s.trend].slice(0, 2) + " " : "") + s.name]),
      h("div", {class: "m"}, [[s.bpm ? s.bpm + " BPM" : null, s.shorts].filter(Boolean).join(" · ")])
    ])));
    if (!P.loading && !P.items.length && !P.error) box.appendChild(h("p", {class: "hint"}, ["Других звуков с готовым разбором пока нет."]));
    if (P.error) box.appendChild(h("p", {class: "warn"}, [P.error.message || "Не получилось загрузить", " ", h("button", {class: "lnk", onclick: () => loadPicker(mo.id)}, ["Повторить"])]));
    const acts = h("div", {class: "acts"});
    if (P.items.length < P.total) acts.appendChild(h("button", {class: "act", disabled: P.loading, onclick: () => loadPicker(mo.id)}, [P.loading ? "Загружаю…" : "Ещё"]));
    acts.appendChild(h("button", {class: "act link", onclick: () => go("sounds")}, ["📜 Все тренд-звуки"]));
    box.appendChild(acts);
    return box;
  }
  async function patchMontage(id, fields, after) {
    const M = S.montage;
    if (M.busy) return;
    M.busy = true; haptic();
    if (M.cur && M.cur.id === id) Object.keys(fields).forEach((k) => { if (k !== "sound_id") M.cur[k] = fields[k]; });   // оптимистично
    render();
    try {
      const mo = await api("/montage/" + id, {method: "PATCH", body: fields});
      if (M.cur && M.cur.id === id) { M.cur = mo; if (S.me) S.me.credits = mo.credits; }
      if (after) after(mo);
    } catch (e) {
      handleError(e);
      if (e.status === 409 && e.error === "closed") M.cur = undefined;   // монтаж закрыт — перечитаем
      else if (e.status !== 401) loadCurrent(true);
    } finally { M.busy = false; if (S.tab === "montage" && !S.card) render(); }
  }
  async function saveWish(id, text) {
    const M = S.montage;
    if (M.savingWish) return;
    M.savingWish = true; render();
    try {
      const mo = await api("/montage/" + id, {method: "PATCH", body: {wish: text.trim().slice(0, 1000)}});
      if (M.cur && M.cur.id === id) M.cur = mo;
      M.wishDraft = null; haptic("success");
      toast(mo.summary ? "Понял так: " + mo.summary : "Сохранил");
    } catch (e) { handleError(e, () => saveWish(id, text)); }
    finally { M.savingWish = false; if (S.tab === "montage" && !S.card) render(); }
  }
  async function removeClip(id, n) {
    const M = S.montage;
    if (!(await confirmDialog("Убрать клип " + n + "? Вернуть его можно, прислав файл ещё раз."))) return;
    M.busy = true; render();
    try { const mo = await api("/montage/" + id + "/clips/" + n, {method: "DELETE"}); if (M.cur && M.cur.id === id) M.cur = mo; haptic("impact"); }
    catch (e) { handleError(e); if (e.status !== 401) loadCurrent(true); }
    finally { M.busy = false; if (S.tab === "montage" && !S.card) render(); }
  }
  async function removeOwn(id) {
    const M = S.montage;
    M.busy = true; render();
    try { const mo = await api("/montage/" + id + "/own-track", {method: "DELETE"}); if (M.cur && M.cur.id === id) M.cur = mo; haptic("impact"); toast("Свой трек убрал"); }
    catch (e) { handleError(e); if (e.status !== 401) loadCurrent(true); }
    finally { M.busy = false; if (S.tab === "montage" && !S.card) render(); }
  }
  async function goMontage() {
    const M = S.montage, mo = M.cur;
    if (!mo || M.busy) return;
    M.busy = true; mainProgress(true); render();
    try {
      await api("/montage/" + mo.id + "/go", {method: "POST"});
      haptic("success");
      if (M.cur && M.cur.id === mo.id) { M.cur.status = "queued"; M.cur.can = {go: false, cancel: false, again: false, sound: false, track: false}; }
      M.picker = null; M.list = null;
    } catch (e) {
      if (e.status === 402) { haptic("warning"); openCard({type: "nocredits", need: e.need !== undefined ? e.need : mo.cost, have: e.have !== undefined ? e.have : mo.credits, message: e.message}); }
      else { handleError(e, goMontage); if (e.status === 409) loadCurrent(true); }
    } finally { M.busy = false; mainProgress(false); if (S.tab === "montage" && !S.card) render(); }
  }
  async function cancelMontage() {
    const M = S.montage, mo = M.cur;
    if (!mo || M.busy) return;
    if (!(await confirmDialog("Отменить монтаж? Клипы и настройки пропадут."))) return;
    M.busy = true; render();
    try { await api("/montage/" + mo.id + "/cancel", {method: "POST"}); haptic("impact"); M.cur = null; M.wishDraft = null; M.picker = null; M.list = null; toast("Монтаж отменён"); }
    catch (e) { handleError(e, cancelMontage); if (e.status === 409) loadCurrent(true); }
    finally { M.busy = false; if (S.tab === "montage" && !S.card) render(); }
  }
  async function rerun(mo, action) {
    const M = S.montage;
    if (M.busy) return;
    M.busy = true; render();
    try {
      await api("/montage/" + mo.id + "/" + action, {method: "POST"});
      haptic("success");
      mo.status = "queued"; mo.result = mo.result || null; mo.can = {go: false, cancel: false, again: false, sound: false, track: false};
      if (M.cur && M.cur.id === mo.id) M.cur = mo;
      else if (S.card && S.card.type === "montage" && S.card.id === mo.id) S.cards["montage:" + mo.id] = mo;
      M.list = null;
    } catch (e) {
      if (e.status === 402) { haptic("warning"); openCard({type: "nocredits", need: e.need !== undefined ? e.need : mo.cost, have: e.have !== undefined ? e.have : mo.credits, message: e.message}); }
      else handleError(e, () => rerun(mo, action));
    } finally { M.busy = false; render(); }
  }
  // Экран состояния монтажа (queued/running/done/error/cancelled): во вкладке — для текущего, в карточке — для истории.
  function renderMontageState(mo, inCard) {
    const M = S.montage, can = mo.can || {}, res = mo.result || null, box = h("div");
    const clips = mo.clips || [], total = clips.reduce((a, c) => a + (Number(c.duration) || 0), 0);
    const sub = (clips.length ? plural(clips.length, "клип", "клипа", "клипов") + " · " + mmss(total) : "без клипов") + " · " + fmtDate(mo.updated_at || mo.created_at);
    box.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, [inCard ? "Монтаж #" + mo.id : "Монтаж"]), h("div", {class: "sub"}, [sub])]), creditsBadge()]));
    if (mo.status === "queued" || mo.status === "running") {
      box.appendChild(section(null, [
        spinner(null),
        h("p", {class: "title center"}, [mo.status === "queued" ? "⏳ В очереди — скоро начну" : "⏳ Монтирую · обычно 1–3 минуты"]),
        h("p", {class: "hint center"}, ["Скачиваю клипы → расшифровываю речь → собираю монтажный лист → монтирую → проверяю. Прогресс и готовый ролик пришлю в чат, здесь обновлю статус."])
      ]));
      if (mo.sound && mo.music === "trend") box.appendChild(section("Звук", [h("div", {class: "name"}, ["🎶 " + mo.sound.name]), mo.sound.bpm ? h("div", {class: "meta"}, [mo.sound.bpm + " BPM"]) : null]));
      setPoll("progress", () => inCard ? pollCardMontage(mo.id) : pollMontage(mo.id), 3000);
    } else if (mo.status === "done" && res) {
      const head = ["✅ Готово · " + Math.round(res.duration || 0) + " с"];
      const styles = mo.styles || {};
      if (res.style && res.style !== "auto") head.push(styles[res.style] ? styles[res.style].toLowerCase() : res.style);
      box.appendChild(section(null, [
        h("p", {class: "title", style: "margin:0 0 6px"}, [head.join(" · ")]),
        h("p", {class: "lead"}, ["🎥 Ролик — в чате с ботом. ", h("button", {class: "lnk", onclick: () => openBot()}, ["Открыть чат"])]),
        (res.notes || []).length ? h("ul", {class: "notes"}, res.notes.map((n) => h("li", null, [String(n)]))) : null
      ]));
      const mode = res.mode || mo.music;
      if (mode === "trend" && (res.sound || mo.sound)) {
        const snd = res.sound || mo.sound;
        box.appendChild(section("Звук", [
          h("div", {class: "name"}, ["🎶 " + snd.name]),
          h("p", {class: "hint", style: "margin-top:4px"}, ["Нажми — скопируется название для Instagram"]),
          h("div", {class: "acts"}, [h("button", {class: "act", onclick: () => copyText(snd.name)}, ["📋 Скопировать"]),
            snd.link_shorts ? h("button", {class: "act link", onclick: () => openLink(snd.link_shorts)}, ["▶️ Ролики под звуком"]) : null]),
          res.trend_hint ? h("p", {class: "how", style: "margin-top:10px"}, [h("b", null, ["Как поставить звук: "]), res.trend_hint]) : null
        ]));
      } else if (mode === "library" && res.track) {
        box.appendChild(section("Музыка", [h("p", {class: "lead"}, ["🎧 «" + (res.track.title || "трек") + "»" + (res.track.author ? " — " + res.track.author : "")]),
          h("p", {class: "hint"}, ["Бесплатный трек вшит в файл. Хочешь тренд — в Instagram замени звук: громкость оригинала 0."])]));
      } else if (mode === "own") box.appendChild(section("Музыка", [h("p", {class: "lead"}, ["🎵 Твой трек" + (mo.own ? " «" + mo.own + "»" : "") + " — вшит в видео."])]));
      else if (mode === "none") box.appendChild(section("Музыка", [h("p", {class: "lead"}, ["🔇 Без музыки — живой звук клипов."])]));
      const acts = h("div", {class: "acts"});
      if (can.again) acts.appendChild(h("button", {class: "act", disabled: M.busy, onclick: () => rerun(mo, "again")}, ["🔄 Другой вариант · " + mo.cost + " кр."]));
      if (can.sound) acts.appendChild(h("button", {class: "act", disabled: M.busy, onclick: () => rerun(mo, "sound")}, ["🔁 Другой звук · " + mo.cost + " кр."]));
      if (can.track) acts.appendChild(h("button", {class: "act", disabled: M.busy, onclick: () => rerun(mo, "track")}, ["🎧 Другой трек · " + mo.cost + " кр."]));
      if (acts.childNodes.length) box.appendChild(section("Ещё варианты", [acts, h("p", {class: "hint"}, ["Каждый рендер — " + mo.cost + " кр.; если не получится, кредиты вернутся."])]));
    } else if (mo.status === "error") {
      box.appendChild(stateBox("😕", "Не получилось", mo.error || "Что-то пошло не так при монтаже. Кредиты вернул.",
        can.again ? [h("button", {class: "act", disabled: M.busy, onclick: () => rerun(mo, "again")}, ["Попробовать ещё раз · " + mo.cost + " кр."])] : null));
    } else if (mo.status === "cancelled") {
      box.appendChild(stateBox("🚫", "Монтаж отменён", null, null));
    } else if (mo.status === "collecting") {
      box.appendChild(stateBox("🎬", "Этот монтаж сейчас в работе", "Открой вкладку «Монтаж» — там клипы и настройки.", [h("button", {class: "act primary", onclick: () => go("montage")}, ["К монтажу"])]));
    }
    if (!inCard && mo.status !== "queued" && mo.status !== "running") {
      setButtons({text: "🎬 Новый монтаж", active: !M.busy, onClick: newMontage}, null);
    }
    return box;
  }
  function copyText(text) {
    const done = () => { haptic("success"); toast("Скопировал: " + text); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, () => toast(text)); return; } } catch (e) { /* ниже */ }
    toast(text);
  }
  function renderHistory() {
    const M = S.montage;
    if (M.list === null && !M.listLoading) loadHistory();
    const box = section("История", []);
    if (M.list === null) { box.appendChild(M.listError ? h("p", {class: "warn"}, ["Историю не загрузил. ", h("button", {class: "lnk", onclick: loadHistory}, ["Повторить"])]) : skeleton(2)); return box; }
    if (!M.list.length) { box.appendChild(h("p", {class: "hint", style: "margin:0"}, ["Прошлых монтажей пока нет."])); return box; }
    const icons = {done: "✅", error: "⚠️", cancelled: "🚫", queued: "⏳", running: "⏳"};
    M.list.forEach((m) => {
      if (M.cur && m.id === M.cur.id) return;
      const clips = m.clips || [];
      box.appendChild(h("button", {class: "item", onclick: () => { S.cards["montage:" + m.id] = m; openCard({type: "montage", id: m.id}); }}, [
        h("div", {class: "t"}, [(icons[m.status] || "▫️") + " " + (m.status === "done" && m.result ? Math.round(m.result.duration || 0) + " с · " : "") + (STATUS[m.status] || m.status)]),
        h("div", {class: "m"}, [[plural(clips.length, "клип", "клипа", "клипов"), m.summary || (m.sound && m.sound.name) || null, fmtDate(m.updated_at || m.created_at)].filter(Boolean).join(" · ")])
      ]));
    });
    return box;
  }
  async function loadHistory() {
    const M = S.montage;
    M.listLoading = true; M.listError = null;
    try { M.list = await api("/montages?limit=20") || []; }
    catch (e) { if (e.status === 401) { showAuth(); return; } M.listError = e; }
    finally { M.listLoading = false; if (S.tab === "montage" && !S.card) render(); }
  }
  function renderMontageCard(card) {
    const key = "montage:" + card.id, mo = S.cards[key];
    if (mo === undefined) { loadCardMontage(card.id); return h("div", null, [h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Монтаж #" + card.id])])]), skeleton(3)]); }
    if (mo && mo.__error) return errorBox(mo.__error, () => { delete S.cards[key]; render(); });
    const box = renderMontageState(mo, true);
    if (mo.status !== "queued" && mo.status !== "running") setButtons({text: "🎬 Новый монтаж", active: !S.montage.busy, onClick: () => { closeCard(); go("montage"); newMontage(); }}, null);
    return box;
  }
  async function loadCardMontage(id) {
    const key = "montage:" + id;
    S.cards[key] = null;
    try { S.cards[key] = await api("/montage/" + id); }
    catch (e) { if (e.status === 401) { showAuth(); return; } S.cards[key] = {__error: e}; }
    if (S.card && S.card.type === "montage" && S.card.id === id) render();
  }
  async function pollCardMontage(id) {
    try {
      const mo = await api("/montage/" + id);
      const was = S.cards["montage:" + id];
      S.cards["montage:" + id] = mo;
      if (S.me) S.me.credits = mo.credits;
      if (was && was.status !== mo.status && (mo.status === "done" || mo.status === "error")) haptic(mo.status === "done" ? "success" : "error");
      if (S.montage.cur && S.montage.cur.id === id) S.montage.cur = mo;
    } catch (e) { if (e.status === 401) { showAuth(); return; } }
    if (S.card && S.card.type === "montage" && S.card.id === id) render();
  }
  function renderNoCredits(card) {
    const me = S.me, need = card.need, have = card.have !== undefined ? card.have : me.credits;
    const text = need !== undefined ? "Нужно " + plural(need, "кредит", "кредита", "кредитов") + ", у тебя " + have + "." : (card.message || "Не хватает кредитов.");
    const box = stateBox("💳", "Не хватает кредитов", text + " Пополнить можно за Telegram Stars — пакеты в профиле.", [
      h("button", {class: "act primary", onclick: () => { S.profile.packsOpen = true; S.card = null; go("profile"); }}, ["Пополнить"]),
      h("button", {class: "act", onclick: closeCard}, ["Назад"])
    ]);
    return box;
  }

  // ---------- Звуки ----------
  function renderSoundsTab() {
    const Z = S.sounds, root = h("div");
    root.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Тренд-звуки"]), h("div", {class: "sub"}, ["под них сейчас снимают · ✅ знаю, как монтируют"])])]));
    if (!Z.items.length && !Z.loading && !Z.error && Z.hasMore) loadSounds();
    if (Z.error && !Z.items.length) { root.appendChild(errorBox(Z.error, () => { Z.error = null; loadSounds(); })); return root; }
    const list = h("div", {class: "list"});
    Z.items.forEach((s, i) => list.appendChild(h("button", {class: "item", onclick: () => { haptic(); openCard({type: "sound", id: s.id}); }}, [
      h("div", {class: "t"}, [(i + 1) + ". " + (TREND[s.trend] ? TREND[s.trend].slice(0, 2) + " " : "") + s.name + (s.ready ? " ✅" : "")]),
      h("div", {class: "m"}, [[s.bpm ? s.bpm + " BPM" : null, s.charts && s.charts.length ? plural(s.charts.length, "чарт", "чарта", "чартов") : null, s.shorts].filter(Boolean).join(" · ")])
    ])));
    root.appendChild(list);
    if (Z.loading) root.appendChild(skeleton(3));
    else if (Z.error) root.appendChild(h("p", {class: "warn center"}, [Z.error.message || "Не получилось", " ", h("button", {class: "lnk", onclick: () => { Z.error = null; loadSounds(); }}, ["Повторить"])]));
    if (Z.hasMore && !Z.loading && Z.items.length) {
      const more = h("button", {class: "act more", onclick: loadSounds}, ["Ещё"]);
      root.appendChild(more);
      if (window.IntersectionObserver) {
        const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); loadSounds(); } }, {rootMargin: "200px"});
        io.observe(more);
      }
    }
    if (!Z.hasMore && !Z.items.length && !Z.loading) root.appendChild(stateBox("🎶", "Звуков пока нет", "Чарты обновляются раз в день — загляни позже."));
    root.appendChild(h("p", {class: "foot"}, ["🆕 новый · ⬆️ растёт · ⬇️ падает · ✅ уже знаю, как под него монтируют"]));
    return root;
  }
  async function loadSounds() {
    const Z = S.sounds;
    if (Z.loading || !Z.hasMore) return;
    Z.loading = true; Z.error = null;
    if (S.tab === "sounds" && !S.card) render();
    try {
      const r = await api("/sounds?page=" + Z.page);
      Z.items = Z.items.concat(r.items || []); Z.hasMore = !!r.has_more; Z.page += 1;
    } catch (e) { if (e.status === 401) { showAuth(); return; } Z.error = e; }
    finally { Z.loading = false; if (S.tab === "sounds" && !S.card) render(); }
  }
  function renderSoundCard(card) {
    const key = "sound:" + card.id, s = S.cards[key];
    if (s === undefined) { loadCardData(key, "/sounds/" + card.id); return h("div", null, [h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Звук"])])]), skeleton(4)]); }
    if (s === null) return h("div", null, [h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Звук"])])]), skeleton(4)]);
    if (s.__error) return errorBox(s.__error, () => { delete S.cards[key]; render(); });
    const root = h("div");
    root.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, ["🎶 " + (s.title || s.name)]), h("div", {class: "sub"}, [s.artist || ""])])]));
    const facts = [];
    if (TREND[s.trend]) facts.push(h("div", {class: "fact"}, [TREND[s.trend] + (s.trend === "up" && s.rise ? " · +" + plural(s.rise, "место", "места", "мест") : "")]));
    if (s.bpm) facts.push(h("div", {class: "fact"}, ["🥁 " + s.bpm + " BPM"]));
    if (s.shorts) facts.push(h("div", {class: "fact"}, ["🎬 " + s.shorts + " в YouTube Shorts"]));
    if (s.charts && s.charts.length) facts.push(h("div", {class: "fact"}, ["📊 В чартах:", h("ul", {class: "notes"}, s.charts.map((c) => h("li", null, [c.name + (c.rank ? " — №" + c.rank : "")])))]));
    root.appendChild(section(null, facts.length ? facts : h("p", {class: "hint"}, ["Подробностей о звуке пока нет."])));
    if (s.how) root.appendChild(section("Как монтируют", h("p", {class: "lead", style: "margin:0"}, [s.how])));
    else root.appendChild(section("Как монтируют", h("p", {class: "hint", style: "margin:0"}, ["Разбора пока нет — смонтирую без привязки к ритму."])));
    const vars = s.variants || [];
    if (vars.length) root.appendChild(section("Варианты монтажа", vars.map((v, i) => h("div", {class: "row"}, [
      h("div", {class: "lbl"}, [(v.icon ? v.icon + " " : "") + (v.title || "пример " + (i + 1)), v.summary ? h("small", null, [v.summary]) : null]),
      v.examples && v.examples[0] ? h("button", {class: "act link", onclick: () => openLink(v.examples[0])}, ["▶️"]) : null
    ]))));
    const ex = s.examples || [];
    if (ex.length) root.appendChild(section("Примеры роликов", ex.map((e, i) => h("button", {class: "item", onclick: () => openLink(e.url)}, [
      h("div", {class: "t"}, ["▶️ Пример " + (i + 1)]), h("div", {class: "m"}, [e.views ? num(e.views) + " просм." : e.url])]))));
    const links = h("div", {class: "acts"});
    if (s.link_shorts) links.appendChild(h("button", {class: "act link", onclick: () => openLink(s.link_shorts)}, ["▶️ Ролики под звуком"]));
    if (s.link_yandex) links.appendChild(h("button", {class: "act link", onclick: () => openLink(s.link_yandex)}, ["🎧 Яндекс Музыка"]));
    if (links.childNodes.length) root.appendChild(section("Ссылки", links));
    if (s.ready === false) root.appendChild(h("p", {class: "foot"}, ["Под этот звук пока не умею монтировать — выбери звук с ✅."]));
    setButtons({text: "🎬 Смонтировать под этот звук", active: s.ready !== false && !S.montage.busy, onClick: () => montageWithSound(s.id)}, null);
    return root;
  }
  async function loadCardData(key, path) {
    S.cards[key] = null;
    try { S.cards[key] = await api(path); }
    catch (e) { if (e.status === 401) { showAuth(); return; } S.cards[key] = {__error: e}; }
    if (S.card) render();
  }
  async function montageWithSound(soundId) {
    const M = S.montage;
    if (M.busy) return;
    M.busy = true; mainProgress(true); render();
    try {
      let mo = (await api("/montage/current") || {}).montage;
      if (!mo) mo = await api("/montage", {method: "POST", body: {}});
      mo = await api("/montage/" + mo.id, {method: "PATCH", body: {music: "trend", sound_id: soundId}});
      M.cur = mo; M.wishDraft = null; M.picker = null; M.list = null;
      haptic("success");
      S.card = null; go("montage");
      toast((mo.clips || []).length ? "Звук выбран — монтирую под него" : "Звук выбран — пришли клипы в чат с ботом");
    } catch (e) { handleError(e); }
    finally { M.busy = false; mainProgress(false); render(); }
  }

  // ---------- Тренды ----------
  function renderTrendsTab() {
    const T = S.trends, root = h("div");
    root.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Тренды"]), h("div", {class: "sub"}, [S.me.niche ? S.me.niche.title : "ниша не выбрана"])]), creditsBadge()]));
    root.appendChild(renderLinkForm(T, "Ссылка на ролик или канал", "Разобрать", submitLink, "Ролик — покажу карточку с разбором и сценарием. Канал YouTube или профиль TikTok — добавлю в радар."));
    if (!T.loaded && !T.loading) loadTrends(true);
    if (T.collecting) root.appendChild(stateBox("🔎", "Собираю подборку по твоей нише", "Обычно пара минут. Загляни чуть позже — или пришли ссылку на ролик, разберу сразу.",
      [h("button", {class: "act", onclick: () => loadTrends(true)}, ["Проверить"])]));
    else if (T.error && !T.items.length) root.appendChild(errorBox(T.error, () => loadTrends(true)));
    else {
      const list = h("div", {class: "list"});
      T.items.forEach((v, i) => list.appendChild(renderVideoItem(v, i + 1)));
      root.appendChild(list);
      if (T.loading) root.appendChild(skeleton(3));
      else if (T.error) root.appendChild(h("p", {class: "warn center"}, [T.error.message || "Не получилось", " ", h("button", {class: "lnk", onclick: () => loadTrends(false)}, ["Повторить"])]));
      else if (!T.items.length && T.loaded) root.appendChild(stateBox("🔥", "Залётов пока нет", "Подборка обновляется каждый день. Пришли ссылку на ролик — разберу."));
      if (T.hasMore && T.items.length && !T.loading) root.appendChild(h("button", {class: "act more", onclick: () => loadTrends(false)}, ["Ещё"]));
    }
    root.appendChild(h("p", {class: "foot"}, ["«×12» — ролик набирает в 12 раз больше, чем обычно у этого автора."]));
    if (T.collecting) setPoll("trends", () => loadTrends(true), 15000);
    return root;
  }
  function renderVideoItem(v, idx) {
    const who = typeof v.author === "object" && v.author ? (v.author.title || v.author.handle) : v.author;
    return h("button", {class: "item", onclick: () => { haptic(); S.cards["video:" + v.id] = S.cards["video:" + v.id] || undefined; openCard({type: "video", id: v.id}); }}, [
      h("div", {class: "t"}, [(idx ? idx + ". " : "") + (v.x && v.x >= 5 ? "🔥 " : v.x && v.x >= 2 ? "📈 " : "") + (v.title || "без названия")]),
      h("div", {class: "m"}, [[v.x ? times(v.x) + " к норме" : null, v.views ? num(v.views) + " просм." : null, ago(v.published_at)].filter(Boolean).join(" · ")]),
      h("div", {class: "m"}, [[PLATFORM[v.platform] || v.platform, who, v.analyzed ? "🧠 разобран" : null].filter(Boolean).join(" · ")])
    ]);
  }
  async function loadTrends(reset) {
    const T = S.trends;
    if (T.loading) return;
    if (reset) { T.offset = 0; T.items = []; T.hasMore = true; }
    T.loading = true; T.error = null;
    if (S.tab === "trends" && !S.card) render();
    try {
      const r = await api("/trends?offset=" + T.offset + "&limit=" + T.limit);
      T.collecting = !!r.collecting;
      const items = r.items || [];
      T.items = T.items.concat(items); T.offset = T.items.length; T.hasMore = r.has_more !== undefined ? !!r.has_more : items.length >= T.limit; T.loaded = true;
    } catch (e) { if (e.status === 401) { showAuth(); return; } T.error = e; }
    finally { T.loading = false; if (S.tab === "trends" && !S.card) render(); }
  }
  function renderLinkForm(st, placeholder, label, submit, hint) {
    const input = keepInput(h("input", {type: "url", inputmode: "url", placeholder, value: st.link || "", autocomplete: "off"}));
    input.addEventListener("input", () => { st.link = input.value; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    const btn = h("button", {class: "act primary", disabled: st.linkBusy, onclick: submit}, [st.linkBusy ? "…" : label]);
    return section(null, [h("div", {class: "field inline"}, [input, btn]), hint ? h("p", {class: "hint"}, [hint]) : null]);
  }
  async function submitLink() {
    const T = S.trends, url = (T.link || "").trim();
    if (T.linkBusy) return;
    if (!/^https?:\/\//i.test(url)) { toast("Нужна ссылка, начинающаяся с https://"); return; }
    T.linkBusy = true; haptic("impact"); render();
    try {
      const r = await api("/link", {method: "POST", body: {url}});
      T.link = "";
      if (r && r.video) { S.cards["video:" + r.video.id] = r.video; haptic("success"); openCard({type: "video", id: r.video.id}); }
      else if (r && r.author) { haptic("success"); S.radar.items = null; if (S.me) S.me.radar_count = (S.me.radar_count || 0) + 1; toast("Автор добавлен в радар — напишу, когда у него залетит", {label: "Радар", fn: () => go("radar")}); }
      else toast("Не понял ответ сервера");
    } catch (e) { handleError(e); }
    finally { T.linkBusy = false; if (S.tab === "trends" && !S.card) render(); }
  }
  function renderVideoCard(card) {
    const key = "video:" + card.id, v = S.cards[key];
    if (v === undefined) { loadCardData(key, "/videos/" + card.id); return h("div", null, [h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Ролик"])])]), skeleton(4)]); }
    if (v === null) return h("div", null, [h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Ролик"])])]), skeleton(4)]);
    if (v.__error) return errorBox(v.__error, () => { delete S.cards[key]; render(); });
    const me = S.me, prices = me.prices || {}, root = h("div");
    const who = typeof v.author === "object" && v.author ? (v.author.title || v.author.handle) : v.author;
    root.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Ролик"]), h("div", {class: "sub"}, [[PLATFORM[v.platform] || v.platform, who].filter(Boolean).join(" · ")])]), creditsBadge()]));
    root.appendChild(section(null, [
      v.title ? h("p", {class: "lead", style: "margin-top:0"}, [h("i", null, [v.title])]) : null,
      h("div", {class: "stats"}, [v.views ? h("span", null, ["👁 " + num(v.views)]) : null, v.likes ? h("span", null, ["❤️ " + num(v.likes)]) : null,
        v.x ? h("span", null, [times(v.x) + " к норме автора"]) : null, h("span", null, [ago(v.published_at)])]),
      h("div", {class: "acts"}, [h("button", {class: "act link", onclick: () => openLink(v.url)}, ["▶️ Открыть ролик"])])
    ]));
    const busy = !!v.__busy;
    const analyzed = !!(v.analyzed || (v.analysis && (v.analysis.card || v.analysis.status === "ok")));
    root.appendChild(section("Что сделать", [
      h("div", {class: "acts"}, [
        h("button", {class: "act primary", disabled: busy, onclick: () => videoAction(v, "analyze")}, ["🧠 Разбор · " + (analyzed ? "бесплатно" : (prices.analysis !== undefined ? prices.analysis + " кр." : ""))]),
        h("button", {class: "act primary", disabled: busy, onclick: () => videoAction(v, "script")}, ["✍️ Сценарий · " + (prices.script !== undefined ? prices.script + " кр." : "")]),
        h("button", {class: "act", disabled: busy || S.montage.busy, onclick: () => montageFromVideo(v.id)}, ["🎬 Смонтировать из него"])
      ]),
      h("p", {class: "hint"}, ["Разбор — почему сработало и что повторить. Сценарий — твоя версия по этой механике. Результат пришлю в чат с ботом."])
    ]));
    const an = v.analysis && (v.analysis.card || (v.analysis.hook ? v.analysis : null));
    if (an) root.appendChild(renderAnalysis(an));
    else if (v.analysis && v.analysis.status === "error") root.appendChild(section("Разбор", h("p", {class: "hint", style: "margin:0"}, ["Разбор не получился" + (v.analysis.error ? ": " + v.analysis.error : "") + ". Попробуй ещё раз — бесплатно."])));
    (v.scripts || []).forEach((sc, i) => root.appendChild(renderScript(sc.content || sc, i + 1, (v.scripts || []).length, sc.id)));
    return root;
  }
  function renderAnalysis(card) {
    const hook = typeof card.hook === "string" ? {what: card.hook} : (card.hook || {});
    const box = section("🧠 Разбор" + (card.format ? " · " + card.format : ""), []);
    if (card.summary) box.appendChild(h("p", {class: "lead", style: "margin-top:0"}, [h("i", null, [card.summary])]));
    if (hook.what || hook.type) box.appendChild(h("div", {class: "blk"}, [h("b", null, ["🪝 Хук (0–3 с)" + (hook.type ? " — " + hook.type : "")]), hook.what ? h("p", null, [hook.what]) : null, hook.why ? h("p", {class: "hint"}, ["Почему цепляет: " + hook.why]) : null]));
    if (card.structure && card.structure.length) box.appendChild(h("div", {class: "blk"}, [h("b", null, ["🧱 Структура"]), h("ul", {class: "notes"}, card.structure.map((b) => h("li", null, [typeof b === "object" ? [h("b", null, [(b.t || "") + " с"]), " — " + (b.beat || "")] : String(b)])))]));
    const extra = [["🔤 Текст в кадре", (card.on_screen_text || []).join("; ")], ["⏱ Темп", card.tempo], ["🔊 Звук", card.sound], ["📣 CTA", card.cta]].filter((x) => x[1]);
    if (extra.length) box.appendChild(h("div", {class: "blk"}, extra.map((x) => h("p", null, [h("b", null, [x[0] + ": "]), x[1]]))));
    if (card.why_it_worked && card.why_it_worked.length) box.appendChild(h("div", {class: "blk"}, [h("b", null, ["💡 Почему залетело"]), h("ul", {class: "notes"}, card.why_it_worked.map((x) => h("li", null, [String(x)])))]));
    if (card.repeat && card.repeat.length) box.appendChild(h("div", {class: "blk"}, [h("b", null, ["✅ Что повторить"]), h("ul", {class: "notes"}, card.repeat.map((x) => h("li", null, [String(x)])))]));
    return box;
  }
  function renderScript(sc, i, n, id) {
    const box = section("✍️ Сценарий" + (n > 1 ? " " + i : "") + (sc.duration_s ? " · ~" + sc.duration_s + " с" : ""), []);
    if (sc.idea) box.appendChild(h("p", {class: "lead", style: "margin-top:0"}, [h("i", null, [sc.idea])]));
    if (sc.hooks && sc.hooks.length) box.appendChild(h("div", {class: "blk"}, [h("b", null, ["🪝 Варианты хука"]), h("ol", {class: "notes"}, sc.hooks.map((x) => h("li", null, [String(x)])))]));
    if (sc.scenes && sc.scenes.length) box.appendChild(h("div", {class: "blk"}, [h("b", null, ["🎬 Раскадровка"]), h("ul", {class: "notes"}, sc.scenes.map((s) => typeof s === "object"
      ? h("li", null, [h("b", null, [(s.t || "") + " с"]), s.shot ? " · 🎥 " + s.shot : "", s.voice ? h("div", null, ["🗣 " + s.voice]) : null, s.text ? h("div", null, ["🔤 " + s.text]) : null]) : h("li", null, [String(s)])))]));
    if (sc.shot_list && sc.shot_list.length) box.appendChild(h("div", {class: "blk"}, [h("b", null, ["📋 Что снять"]), h("ul", {class: "notes"}, sc.shot_list.map((x) => h("li", null, [String(x)])))]));
    if (sc.caption) box.appendChild(h("div", {class: "blk"}, [h("b", null, ["📝 Подпись"]), h("p", null, [sc.caption]), sc.hashtags && sc.hashtags.length ? h("p", {class: "hint"}, [sc.hashtags.map((t) => String(t).startsWith("#") ? t : "#" + t).join(" ")]) : null]));
    if (sc.tips && sc.tips.length) box.appendChild(h("div", {class: "blk"}, [h("b", null, ["💬 Советы"]), h("ul", {class: "notes"}, sc.tips.map((x) => h("li", null, [String(x)])))]));
    if (id) box.appendChild(h("div", {class: "acts"}, [h("button", {class: "act", disabled: S.montage.busy, onclick: () => montageFromScript(id)}, ["🎬 Смонтировать по сценарию"])]));
    return box;
  }
  async function videoAction(v, action) {
    if (v.__busy) return;
    v.__busy = true; haptic("impact"); render();
    try {
      const r = await api("/videos/" + v.id + "/" + action, {method: "POST"});
      if (r && r.credits !== undefined && S.me) S.me.credits = r.credits;
      haptic("success");
      toast(action === "analyze" ? "Разбираю — результат пришлю в чат с ботом" : "Пишу сценарий — пришлю в чат с ботом через минуту");
      setTimeout(() => { if (S.card && S.card.type === "video" && S.card.id === v.id) { delete S.cards["video:" + v.id]; render(); } }, 4000);
    } catch (e) {
      if (e.status === 402) { haptic("warning"); openCard({type: "nocredits", need: e.need, have: e.have, message: e.message, back: () => openCard({type: "video", id: v.id})}); }
      else handleError(e, () => videoAction(v, action));
    } finally { v.__busy = false; if (S.card && S.card.type === "video" && S.card.id === v.id) render(); }
  }
  async function montageFromVideo(id) { await montageFrom("/montage/from-video/" + id); }
  async function montageFromScript(id) { await montageFrom("/montage/from-script/" + id); }
  async function montageFrom(path) {
    const M = S.montage;
    if (M.busy) return;
    M.busy = true; render();
    try {
      const mo = await api(path, {method: "POST"});
      M.cur = mo; M.wishDraft = null; M.picker = null; M.list = null;
      haptic("success"); S.card = null; go("montage");
      toast((mo.clips || []).length ? "Монтаж готов к запуску" : "Пришли клипы в чат с ботом — смонтирую по этой механике");
    } catch (e) { handleError(e); }
    finally { M.busy = false; render(); }
  }

  // ---------- Радар ----------
  function renderRadarTab() {
    const R = S.radar, root = h("div");
    if (R.items === null && !R.loading) loadRadar();
    const n = R.items ? R.items.length : (S.me.radar_count || 0);
    root.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Радар"]), h("div", {class: "sub"}, [n + " из " + R.max + " · напишу, когда у автора залетит"])])]));
    root.appendChild(renderLinkForm(R, "Ссылка на канал YouTube или профиль TikTok", "Добавить", addRadar, null));
    if (R.items === null) { root.appendChild(R.error ? errorBox(R.error, loadRadar) : skeleton(3)); return root; }
    if (!R.items.length) root.appendChild(stateBox("🎯", "В радаре пока никого", "Добавь конкурентов или авторов, у которых учишься: пришлю алерт, когда их ролик залетит."));
    const list = h("div", {class: "list"});
    R.items.forEach((a) => list.appendChild(h("div", {class: "item static"}, [
      h("button", {class: "grow", onclick: () => openLink(a.url)}, [
        h("div", {class: "t"}, [(PLATFORM[a.platform] || a.platform) + " · " + (a.title || a.handle || "автор")]),
        h("div", {class: "m"}, [[a.handle && a.handle !== a.title ? a.handle : null, a.followers ? num(a.followers) + " подписчиков" : null, a.added_at ? "в радаре с " + fmtDate(a.added_at).split(",")[0] : null].filter(Boolean).join(" · ")])
      ]),
      h("button", {class: "x", "aria-label": "Удалить из радара", disabled: R.busy, onclick: () => removeRadar(a)}, ["×"])
    ])));
    root.appendChild(list);
    if (R.items.length >= R.max) root.appendChild(h("p", {class: "warn center"}, ["Радар полон: " + R.max + " авторов. Чтобы добавить нового — убери кого-нибудь."]));
    return root;
  }
  async function loadRadar() {
    const R = S.radar;
    R.loading = true; R.error = null;
    try { const r = await api("/radar"); R.items = r.items || []; R.max = r.max || R.max; if (S.me) S.me.radar_count = R.items.length; }
    catch (e) { if (e.status === 401) { showAuth(); return; } R.error = e; }
    finally { R.loading = false; if (S.tab === "radar" && !S.card) render(); }
  }
  async function addRadar() {
    const R = S.radar, url = (R.link || "").trim();
    if (R.linkBusy) return;
    if (!/^https?:\/\//i.test(url)) { toast("Нужна ссылка, начинающаяся с https://"); return; }
    R.linkBusy = true; haptic("impact"); render();
    try {
      const r = await api("/radar", {method: "POST", body: {url}});
      R.link = ""; haptic("success");
      if (r && r.author && R.items && !R.items.some((a) => a.id === r.author.id)) R.items.unshift(r.author);
      if (S.me) S.me.radar_count = R.items ? R.items.length : (S.me.radar_count || 0) + 1;
      toast("Добавил в радар: " + ((r.author && (r.author.title || r.author.handle)) || "автор") + ". Ролики соберу в фоне.");
    } catch (e) { handleError(e); }
    finally { R.linkBusy = false; if (S.tab === "radar" && !S.card) render(); }
  }
  async function removeRadar(a) {
    const R = S.radar;
    if (!(await confirmDialog("Убрать " + (a.title || a.handle || "автора") + " из радара?"))) return;
    R.busy = true; render();
    try { await api("/radar/" + a.id, {method: "DELETE"}); R.items = (R.items || []).filter((x) => x.id !== a.id); if (S.me) S.me.radar_count = R.items.length; haptic("impact"); }
    catch (e) { handleError(e); if (e.status === 404) R.items = (R.items || []).filter((x) => x.id !== a.id); }
    finally { R.busy = false; if (S.tab === "radar" && !S.card) render(); }
  }

  // ---------- Профиль ----------
  function renderProfileTab() {
    const me = S.me, P = S.profile, root = h("div");
    if (!P.fresh) { P.fresh = true; reloadMe(); }
    root.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, [me.first_name ? me.first_name : "Профиль"]), h("div", {class: "sub"}, [me.username ? "@" + me.username : "профиль"])])]));
    // кредиты
    const prices = me.prices || {};
    root.appendChild(section("Кредиты", [
      h("div", {class: "row"}, [h("div", {class: "lbl"}, [h("span", {class: "bignum"}, [String(me.credits)]), h("small", null, ["разбор " + prices.analysis + " · сценарий " + prices.script + " · монтаж " + prices.montage + " кр."])]),
        h("button", {class: "act primary", onclick: () => { P.packsOpen = !P.packsOpen; haptic(); render(); }}, [P.packsOpen ? "Скрыть" : "⭐ Пополнить"])]),
      P.packsOpen ? renderPacks() : null,
      h("div", {class: "acts"}, [h("button", {class: "act", onclick: () => { P.ledgerOpen = !P.ledgerOpen; haptic(); if (P.ledgerOpen && P.ledger === undefined) loadLedger(); render(); }}, [P.ledgerOpen ? "Скрыть историю" : "История списаний"])]),
      P.ledgerOpen ? renderLedger() : null
    ]));
    // ниша
    root.appendChild(section("Ниша", row(me.niche ? me.niche.title : "не выбрана", me.niche && me.niche.custom ? "своя ниша" : "по ней собираю тренды и подборки",
      h("button", {class: "act", onclick: () => openCard({type: "niche"})}, ["Сменить"]))));
    // о себе
    const aboutDraft = P.aboutDraft === null ? (me.about || "") : P.aboutDraft;
    const ta = keepInput(h("textarea", {rows: 3, maxlength: 500, placeholder: "Кто ты, о чём снимаешь, для кого — так подборки и сценарии точнее"}));
    ta.value = aboutDraft;
    const saveAbout = h("button", {class: "act", disabled: aboutDraft.trim() === (me.about || "").trim() || P.savingAbout, onclick: () => patchMe({about: ta.value.trim()}, () => { P.aboutDraft = null; toast("Сохранил"); })}, [P.savingAbout ? "Сохраняю…" : "Сохранить"]);
    ta.addEventListener("input", () => { P.aboutDraft = ta.value; saveAbout.disabled = ta.value.trim() === (me.about || "").trim(); });
    root.appendChild(section("О себе", [ta, h("div", {class: "acts"}, [saveAbout])]));
    // площадки
    root.appendChild(section("Площадки", renderPlatformChips(me.platforms || [], (codes) => patchMe({platforms: codes}))));
    // час подборки
    const tz = me.tz_offset !== undefined && me.tz_offset !== null ? " (UTC" + (me.tz_offset >= 0 ? "+" : "") + me.tz_offset + ")" : "";
    root.appendChild(section("Подборка трендов", [
      h("p", {class: "hint", style: "margin:0 0 10px"}, ["Каждый день в выбранный час присылаю подборку в чат" + tz + "."]),
      h("div", {class: "chips"}, HOURS.concat(HOURS.includes(me.digest_hour) || me.digest_hour === undefined ? [] : [me.digest_hour]).sort((a, b) => a - b).map((hr) =>
        h("button", {class: "chip", "aria-pressed": String(me.digest_hour === hr), onclick: () => { if (me.digest_hour !== hr) patchMe({digest_hour: hr}); }}, [("0" + hr).slice(-2) + ":00"])))
    ]));
    // алерты
    root.appendChild(section(null, [
      row("Алерты радара", "Пишу, когда у автора из радара залетает ролик · в радаре " + (me.radar_count || 0), sw(!!me.alerts, "Алерты радара", () => patchMe({alerts: !me.alerts}))),
      me.is_admin ? row("Вшивать тренд-звук", "Админ: звук в самом файле вместо подсказки для Instagram", sw(!!me.embed_trend, "Вшивать тренд-звук", () => patchMe({embed_trend: !me.embed_trend}))) : null
    ]));
    root.appendChild(h("p", {class: "foot"}, ["Вопросы и помощь: ", me.support ? h("button", {class: "lnk", onclick: () => openLink("https://t.me/" + String(me.support).replace(/^@/, ""))}, [me.support]) : "в чате с ботом"]));
    return root;
  }
  function renderPacks() {
    const packs = S.me.stars_packs || [], P = S.profile;
    if (!packs.length) return h("p", {class: "hint"}, ["Пакетов пока нет — напиши в поддержку."]);
    return h("div", {class: "packs"}, packs.map((p) => h("button", {class: "pack", disabled: P.paying, onclick: () => buyPack(p)}, [
      h("b", null, [plural(p.credits, "кредит", "кредита", "кредитов")]), h("span", null, ["⭐ " + p.stars]),
      h("small", null, [Math.round((p.stars / p.credits) * 10) / 10 + " ⭐ за кредит"])
    ])).concat([h("p", {class: "hint", style: "flex-basis:100%"}, ["Оплата звёздами Telegram. Кредиты начислю сразу после оплаты — сообщение придёт в чат."])]));
  }
  async function buyPack(p) {
    const P = S.profile;
    if (P.paying) return;
    P.paying = true; haptic("impact"); render();
    try {
      const r = await api("/pay/invoice", {method: "POST", body: {credits: p.credits}});
      if (!r || !r.url) throw {status: 0, message: "Сервер не вернул ссылку на счёт"};
      if (tg && tg.openInvoice) {
        tg.openInvoice(r.url, (status) => {
          if (status === "paid") { haptic("success"); toast("Оплата прошла — начисляю кредиты"); setTimeout(reloadMe, 800); setTimeout(reloadMe, 4000); }
          else if (status === "failed") { haptic("error"); toast("Оплата не прошла"); }
          else if (status === "cancelled") toast("Оплату отменил");
          P.paying = false; render();
        });
        return;
      }
      if (DEMO) { toast("Демо: платёж засчитан, кредиты начислю через секунду"); setTimeout(reloadMe, 1600); }
      else openLink(r.url);
    } catch (e) { handleError(e); }
    finally { if (!(tg && tg.openInvoice) || DEMO) { P.paying = false; render(); } }
  }
  function renderLedger() {
    const P = S.profile;
    if (P.ledger === undefined || P.ledger === null) return P.ledgerError ? h("p", {class: "warn"}, ["Не загрузил. ", h("button", {class: "lnk", onclick: loadLedger}, ["Повторить"])]) : skeleton(3);
    if (!P.ledger.length) return h("p", {class: "hint"}, ["Списаний пока не было."]);
    return h("div", {class: "ledger"}, P.ledger.map((x) => h("div", {class: "row"}, [
      h("div", {class: "lbl"}, [(REASON[x.reason] || x.reason) + (x.ref && x.reason === "montage" ? " #" + x.ref : ""), h("small", null, [fmtDate(x.at)])]),
      h("b", {class: x.delta > 0 ? "plus" : "minus"}, [(x.delta > 0 ? "+" : "") + x.delta])
    ])));
  }
  async function loadLedger() {
    const P = S.profile;
    P.ledger = null; P.ledgerError = null;
    try { P.ledger = await api("/me/ledger?limit=50") || []; }
    catch (e) { if (e.status === 401) { showAuth(); return; } P.ledger = undefined; P.ledgerError = e; }
    if (S.tab === "profile" && !S.card) render();
  }
  async function patchMe(fields, after) {
    const P = S.profile;
    if ("about" in fields) P.savingAbout = true;
    haptic(); render();
    try { S.me = await api("/me", {method: "PATCH", body: fields}); if (after) after(); if ("niche_slug" in fields || "custom_niche" in fields) { S.trends.loaded = false; S.trends.items = []; } }
    catch (e) { handleError(e, () => patchMe(fields, after)); }
    finally { P.savingAbout = false; render(); }
  }
  async function reloadMe() {
    try { const me = await api("/me"); if (me) S.me = me; if (S.tab === "profile" && !S.card) render(); }
    catch (e) { if (e.status === 401) showAuth(); }
  }
  function renderNicheCard() {
    const me = S.me, st = S.profile;
    if (st.nicheDraft === undefined) st.nicheDraft = {slug: me.niche && !me.niche.custom ? me.niche.slug : null, custom: me.niche && me.niche.custom ? me.niche.title : ""};
    const d = st.nicheDraft, root = h("div");
    root.appendChild(h("div", {class: "top"}, [h("div", null, [h("h1", null, ["Ниша"]), h("div", {class: "sub"}, ["сейчас: " + (me.niche ? me.niche.title : "не выбрана")])])]));
    root.appendChild(renderNichePicker({selectedSlug: d.slug, custom: d.custom, onPick: (slug) => { d.slug = slug; d.custom = ""; haptic(); render(); }, onCustom: (t) => { d.custom = t; d.slug = null; }}));
    root.appendChild(h("p", {class: "foot"}, ["После смены ниши соберу подборку заново — это пара минут."]));
    const changed = d.slug ? !(me.niche && me.niche.slug === d.slug) : d.custom.trim().length >= 2 && !(me.niche && me.niche.custom && me.niche.title === d.custom.trim());
    setButtons({text: st.nicheSaving ? "Сохраняю…" : "Сохранить нишу", active: changed && !st.nicheSaving, onClick: async () => {
      st.nicheSaving = true; mainProgress(true); render();
      try { S.me = await api("/me", {method: "PATCH", body: d.slug ? {niche_slug: d.slug} : {custom_niche: d.custom.trim()}}); S.trends.loaded = false; S.trends.items = []; haptic("success"); st.nicheDraft = undefined; closeCard(); toast("Ниша обновлена — собираю тренды"); }
      catch (e) { handleError(e); }
      finally { st.nicheSaving = false; mainProgress(false); render(); }
    }}, null);
    return root;
  }

  // ---------- запуск ----------
  function initTelegram() {
    if (!tg) return;
    try {
      tg.ready(); tg.expand();
      tg.setHeaderColor("secondary_bg_color"); tg.setBackgroundColor("secondary_bg_color");
      if (tg.setBottomBarColor) tg.setBottomBarColor("secondary_bg_color");
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      if (tg.onEvent) tg.onEvent("themeChanged", () => { try { tg.setHeaderColor("secondary_bg_color"); tg.setBackgroundColor("secondary_bg_color"); } catch (e) { /* ignore */ } });
    } catch (e) { /* старый клиент */ }
  }
  async function boot() {
    initTelegram();
    render();
    try { S.me = await api("/me"); }
    catch (e) {
      if (e.status === 401) { showAuth(); return; }
      S.fatal = () => errorBox(e, () => { S.fatal = null; boot(); });
      render(); return;
    }
    if (!S.me.onboarded) { S.tab = "trends"; render(); return; }
    const r = initialRoute();
    if (r) {
      S.tab = r.tab;
      if (r.card) S.card = r.card;
      if (r.montageId) {
        try { const c = await api("/montage/current"); S.montage.cur = c && c.montage ? c.montage : null; } catch (e) { S.montage.cur = undefined; }
        if (!(S.montage.cur && S.montage.cur.id === r.montageId)) S.card = {type: "montage", id: r.montageId};
      }
      render(); return;
    }
    try { const c = await api("/montage/current"); S.montage.cur = c && c.montage ? c.montage : null; } catch (e) { S.montage.cur = undefined; }
    S.tab = S.montage.cur ? "montage" : "trends";
    render();
  }
  boot();
})();
