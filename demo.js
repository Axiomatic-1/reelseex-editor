/* Демо-режим Mini App Reelseex: моки всех ручек API (docs/api-contract.md §3) в памяти страницы.
   Включается, когда window.REELSEEX.api пуст или страница открыта не из Telegram (нет initData).
   Данные ненастоящие; действия меняют состояние моков (монтаж: go → queued → running → done за ~4,5 с;
   «Добавить видео» — POST /montage/{id}/clips добавляет клип с именем файла, байты никуда не уходят).
   Параметры URL для демо: ?onboard=1 — начать с онбординга; ?user=1 — не админ (без админских переключателей). */
(function (root) {
  "use strict";
  const DELAY = 220;
  const q0 = new URLSearchParams(root.location ? root.location.search : "");
  const iso = (t) => new Date(t).toISOString();
  const hoursAgo = (h) => iso(Date.now() - h * 3600e3);
  const daysAgo = (d) => hoursAgo(d * 24);
  const err = (status, code, message, extra) => Object.assign({status, error: code, message}, extra || {});

  const PRICES = {analysis: 1, script: 3, montage: 8};
  const STYLES = {auto: "Авто", talking: "Говорящая голова", vlog: "Влог", sport: "Спорт/зал", aesthetic: "Эстетика", trend: "Под тренд-звук"};
  const PRESETS = [
    ["food", "🍳 Еда и рецепты"], ["fitness", "💪 Фитнес и ЗОЖ"], ["beauty", "💄 Бьюти"],
    ["psychology", "🧠 Психология и отношения"], ["business", "💼 Бизнес и деньги"], ["expert", "🎓 Эксперты и обучение"],
    ["humor", "😂 Юмор и скетчи"], ["travel", "✈️ Путешествия"], ["parents", "👶 Мамы и дети"],
    ["home", "🏠 Дом и ремонт"], ["auto", "🚗 Авто"], ["tech", "📱 Техника и нейросети"]
  ].map(([slug, title]) => ({slug, title}));
  const PLATFORMS = [{code: "yt", title: "YouTube Shorts"}, {code: "tt", title: "TikTok"}, {code: "ig", title: "Instagram Reels"}, {code: "vk", title: "VK Клипы"}];
  const PACKS = [{credits: 20, stars: 50}, {credits: 60, stars: 130}, {credits: 150, stars: 300}];
  const MAX_RADAR = 30;
  const LIMITS = {clips: 10, total_s: 300, upload_mb: 200};   // как MontageOut.limits у API (§3.3)

  // ---------- пользователь ----------
  const user = {
    id: 100500, first_name: "Демо", username: "demo_user", onboarded: !q0.has("onboard"), credits: 15,
    niche: {id: 2, slug: "fitness", title: "💪 Фитнес и ЗОЖ", custom: false},
    about: "Тренер, снимаю домашние тренировки без инвентаря", platforms: ["ig", "yt"],
    digest_hour: 10, alerts: true, tz_offset: 5, is_admin: !q0.has("user"), embed_trend: false
  };
  if (!user.onboarded) { user.niche = null; user.about = null; user.platforms = []; }
  let nicheSeq = 100;
  let collectingUntil = 0;                 // после смены ниши тренды «собираются» ~12 с
  const ledger = [
    {delta: -3, reason: "script", ref: "5", at: daysAgo(1)},
    {delta: -1, reason: "analysis", ref: "1", at: daysAgo(2)},
    {delta: -3, reason: "script", ref: "4", at: daysAgo(3)},
    {delta: -8, reason: "montage", ref: "40", at: daysAgo(4)},
    {delta: 20, reason: "stars", ref: "demo_charge_1", at: daysAgo(5)},
    {delta: 10, reason: "welcome", ref: null, at: daysAgo(7)}
  ];
  function charge(n, reason, ref) {
    if (user.credits < n) throw err(402, "no_credits", "Не хватает кредитов: нужно " + n + ", у тебя " + user.credits + ".", {need: n, have: user.credits});
    user.credits -= n;
    ledger.unshift({delta: -n, reason, ref: ref == null ? null : String(ref), at: iso(Date.now())});
  }
  function grant(n, reason, ref) {
    user.credits += n;
    ledger.unshift({delta: n, reason, ref: ref == null ? null : String(ref), at: iso(Date.now())});
  }
  function me() {
    const radarCount = radar.length;
    return Object.assign({}, user, {
      prices: PRICES, radar_count: radarCount, embed_trend: user.is_admin ? !!user.embed_trend : null,
      presets: PRESETS, platform_choices: PLATFORMS, support: "@reelseex_support", stars_packs: PACKS
    });
  }

  // ---------- тренд-звуки ----------
  const ARTISTS = ["МАЯК X", "Лера Ветрова", "DIMA SOLO", "Sofa Beats", "Артём Лихо", "Nika Rey", "ГРУППА 404", "Mila Vorn",
    "KAZBEK", "Ясна", "Тима Дорн", "SOVA", "Rita Mo", "Чай Вдвоём 2.0", "LEVIN"];
  const TITLES = ["Украсть тебя", "Ночной город", "Не отпускай", "Лето в кармане", "Пульс", "Дорога домой", "Выше неба",
    "Танцуй тише", "Солнце в глаза", "Не спеши", "Громко", "Без тебя", "Снег в июле", "Дыши", "Там, где ты", "Поехали",
    "Мимо", "Сердце на бит", "Утро", "Вчера", "Tempo", "Flashback", "Shine", "Город спит", "Крылья", "Твои глаза",
    "Тише", "Небо", "Фонари", "Волна", "Шаг", "Остров", "Запах лета", "Кофе", "Молчи"];
  const HOWS = ["быстрые склейки по 2 доли, вход на дроп, 15 с", "медленные планы, склейка на каждый такт, текст в начале",
    "чередование крупных и общих планов, дроп на 7-й секунде", "один длинный план + 3 вставки на акценты",
    "монтаж под слова припева, по кадру на фразу", "резкие склейки на бит, зум в конце"];
  const VARIANTS = [
    {id: 1, title: "быстрый", icon: "⚡", summary: "склейки каждую долю, 7–9 кадров, вход на дроп"},
    {id: 2, title: "средний", icon: "🎬", summary: "по 2 доли, 5–6 кадров, дроп на 1,4 с"},
    {id: 3, title: "плавный", icon: "🌊", summary: "длинные планы, 3 кадра, без резких переходов"}
  ];
  const CHART_NAMES = ["Shazam · Россия", "YouTube Charts · Россия", "Яндекс Музыка", "Shazam · Казахстан", "YouTube Charts · мир"];
  const sounds = [];
  for (let i = 0; i < 35; i++) {
    const trend = ["up", "new", null, "up", "down", "up", null][i % 7];
    const ready = i < 14 || i % 5 === 0;
    const bpm = 88 + ((i * 37) % 53);
    const shortsN = ready ? 3400 + i * 1900 : (i % 3 ? 900 + i * 120 : null);
    const charts = CHART_NAMES.slice(0, 1 + (i % 3)).map((name, k) => ({name, rank: 1 + ((i * 7 + k * 11) % 40)}));
    const ytId = "demo" + String(1000 + i);
    const nv = ready ? (i < 8 ? 3 : 2) : 0;
    sounds.push({
      id: i + 1, artist: ARTISTS[i % ARTISTS.length], title: TITLES[i], bpm, trend, rise: trend === "up" ? 1 + (i % 6) : null,
      shorts: shortsN ? fmtShorts(shortsN) : null, charts, ready,
      link_shorts: "https://www.youtube.com/source/" + ytId + "/shorts", link_yandex: i % 2 ? "https://music.yandex.ru/track/" + (5000 + i) : null,
      how: ready ? HOWS[i % HOWS.length] : null,
      variants: VARIANTS.slice(0, nv).map((v) => Object.assign({}, v, {examples: ["https://youtube.com/shorts/" + ytId + "v" + v.id]})),
      examples: ready ? [{url: "https://youtube.com/shorts/" + ytId + "a", views: 1200000 - i * 20000},
        {url: "https://youtube.com/shorts/" + ytId + "b", views: 480000 - i * 9000}, {url: "https://youtube.com/shorts/" + ytId + "c", views: null}] : []
    });
  }
  function fmtShorts(n) { return (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "").replace(".", ",") + " тыс." : String(n)) + " роликов"; }
  function soundName(s) { return s.artist ? s.artist + " — " + s.title : s.title; }
  function soundBrief(s) {
    return {id: s.id, name: soundName(s), artist: s.artist, title: s.title, bpm: s.bpm, trend: s.trend, rise: s.rise, shorts: s.shorts,
      charts: s.charts, ready: s.ready, link_shorts: s.link_shorts, link_yandex: s.link_yandex};
  }
  function soundCard(s, variant) {
    const out = Object.assign(soundBrief(s), {how: s.how, variants: s.variants, examples: s.examples});
    if (variant) out.variant = variant;
    return out;
  }
  const byId = (arr, id) => arr.find((x) => x.id === Number(id)) || null;

  // ---------- монтажи ----------
  const montages = {};
  let montageSeq = 42;
  const timers = {};
  function newMontage(fields) {
    const id = fields.id || ++montageSeq;
    const mo = Object.assign({
      id, status: "collecting", clips: [], summary: null, wish: null, style: "auto", music: "trend", own: null, captions: true,
      sound_id: null, variant: null, result: null, error: null, created_at: iso(Date.now()), updated_at: iso(Date.now())
    }, fields, {id});
    montages[id] = mo;
    return mo;
  }
  newMontage({id: 42, clips: [{n: 1, duration: 12, size: 4_300_000}, {n: 2, duration: 8, size: 2_900_000}, {n: 3, duration: 15, size: 6_100_000}],
    summary: "плавные переходы · чередую зал и закаты", wish: "душевно, чередуй зал и закаты", sound_id: 1, variant: 2,
    own: q0.has("own") ? "my_track.mp3" : null, created_at: hoursAgo(1), updated_at: hoursAgo(0.2)});
  newMontage({id: 40, status: "done", clips: [{n: 1, duration: 9, size: 3_000_000}, {n: 2, duration: 11, size: 3_800_000}], style: "sport",
    summary: "энергично, под бит", wish: "энергично, под бит", sound_id: 3, variant: 1, created_at: daysAgo(4), updated_at: daysAgo(4),
    result: {duration: 15.2, file_id: "demo", style: "sport", notes: [], mode: "trend",
      trend_hint: "В Instagram: Аудио → вставь название → начало с 0:14 → громкость оригинала 0. Склейки лягут в бит."}});
  newMontage({id: 38, status: "error", clips: [{n: 1, duration: 20, size: 9_000_000}], created_at: daysAgo(6), updated_at: daysAgo(6),
    error: "Клип 1 не скачался — Telegram не отдал файл. Кредиты вернул."});
  newMontage({id: 37, status: "cancelled", clips: [], created_at: daysAgo(8), updated_at: daysAgo(8)});

  function current() { return Object.values(montages).find((m) => m.status === "collecting") || null; }
  function summaryFrom(wish) {
    const parts = String(wish || "").toLowerCase().replace(/[.!?]+$/, "").split(/\s*(?:,|;| и | а | но )\s*/).map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts.slice(0, 4).join(" · ") : null;
  }
  function montageOut(mo, warnings) {
    const snd = mo.sound_id ? byId(sounds, mo.sound_id) : null;
    const done = mo.status === "done", fin = done || mo.status === "error";
    const result = mo.result ? Object.assign({}, mo.result, {sound: snd && mo.music === "trend" ? soundBrief(snd) : null}) : null;
    return {
      id: mo.id, status: mo.status, cost: PRICES.montage, credits: user.credits,
      clips: mo.clips.map((c) => Object.assign({src: "chat", name: null}, c)), summary: mo.summary, wish: mo.wish,
      style: mo.style, styles: STYLES, music: mo.own ? "own" : mo.music, own: mo.own, captions: mo.captions,
      embed: user.is_admin ? !!user.embed_trend : null,
      sound: snd ? soundCard(snd, mo.variant) : null, variant: mo.variant, result, error: mo.error,
      can: {go: mo.status === "collecting", cancel: mo.status === "collecting", again: fin && mo.clips.length > 0,
        sound: done && mo.music === "trend" && !mo.own, track: done && mo.music === "library" && !mo.own},
      created_at: mo.created_at, updated_at: mo.updated_at, warnings: warnings || [], limits: Object.assign({}, LIMITS)
    };
  }
  function touch(mo) { mo.updated_at = iso(Date.now()); }
  function render(mo) {
    mo.status = "queued"; mo.error = null; touch(mo);
    clearTimeout(timers[mo.id]);
    timers[mo.id] = setTimeout(() => {
      mo.status = "running"; touch(mo);
      timers[mo.id] = setTimeout(() => {
        const total = mo.clips.reduce((a, c) => a + (c.duration || 0), 0);
        const mode = mo.own ? "own" : mo.music;
        mo.status = "done"; touch(mo);
        mo.result = {duration: Math.round(Math.min(total, 30) * 10) / 10 || 12, file_id: "demo", style: mo.style === "auto" ? "sport" : mo.style,
          notes: mode === "trend" && !mo.sound_id ? ["Трендовых звуков с готовым разбором не нашлось — смонтировал без привязки к ритму."] : [],
          mode, track: mode === "library" ? {id: 7 + (mo.seed || 0), title: ["Sunny Steps", "Night Drive", "Soft Focus"][(mo.seed || 0) % 3], author: "Free Beats", source: "library"}
            : mode === "own" ? {title: mo.own, source: "user"} : null,
          trend_hint: mode === "trend" && mo.sound_id ? "В Instagram: Аудио → вставь название → начало с 0:14 → громкость оригинала 0. Склейки лягут в бит." : null};
      }, 3000);
    }, 1500);
  }
  function simulateClips(mo) {   // в демо клипы «приходят из чата» сами: по одному каждые 5 с, до 3
    const tick = () => {
      if (mo.status !== "collecting" || mo.clips.length >= 3) return;
      const n = mo.clips.length + 1;
      mo.clips.push({n, duration: [11, 7, 14][n - 1], size: 3_000_000 + n * 700_000}); touch(mo);
      timers["clips" + mo.id] = setTimeout(tick, 5000);
    };
    timers["clips" + mo.id] = setTimeout(tick, 5000);
  }
  function getMontage(id) {
    const mo = montages[Number(id)];
    if (!mo) throw err(404, "not_found", "Монтаж не найден");
    return mo;
  }
  function createMontage(extra) {
    const cur = current();
    if (cur) return cur;
    const firstReady = sounds.find((s) => s.ready);
    const mo = newMontage(Object.assign({sound_id: firstReady ? firstReady.id : null}, extra || {}));
    simulateClips(mo);
    return mo;
  }

  // ---------- тренды, ролики, радар ----------
  const AUTHORS = [
    {id: 5, title: "Fit с Катей", handle: "@fitkatya", platform: "yt", url: "https://www.youtube.com/@fitkatya", followers: 184000},
    {id: 9, title: "trainer.max", handle: "@trainer.max", platform: "tt", url: "https://www.tiktok.com/@trainer.max", followers: 52000},
    {id: 12, title: "Дома в форме", handle: "@homefit_ru", platform: "yt", url: "https://www.youtube.com/@homefit_ru", followers: 96000},
    {id: 14, title: "yoga.nastya", handle: "@yoga.nastya", platform: "ig", url: "https://www.instagram.com/yoga.nastya/", followers: 310000}
  ];
  let authorSeq = 20;
  const radar = [Object.assign({added_at: daysAgo(12)}, AUTHORS[0]), Object.assign({added_at: daysAgo(3)}, AUTHORS[1])];
  const FEED_TITLES = ["5 минут утром — и спина не болит. Делаю каждый день", "Пресс за 7 дней? Проверил на себе — честный итог",
    "Это упражнение заменяет 20 минут кардио", "Что я ем после тренировки (без куриной грудки)",
    "Тренировка в отеле: только полотенце и стул", "Ошибка в приседе, из-за которой болят колени", "Разминка за 60 секунд перед любой тренировкой"];
  const videos = FEED_TITLES.map((title, i) => ({
    id: i + 1, title, platform: ["yt", "tt", "ig", "yt", "tt", "yt", "ig"][i], author: AUTHORS[i % AUTHORS.length].title,
    author_id: AUTHORS[i % AUTHORS.length].id, url: ["https://www.youtube.com/shorts/demo" + i, "https://www.tiktok.com/@demo/video/70000" + i,
      "https://www.instagram.com/reel/demo" + i + "/"][i % 3], views: 1200000 - i * 130000, likes: 84000 - i * 9000,
    x: [12.0, 8.4, 6.1, 5.5, 4.2, 3.1, 2.4][i], published_at: hoursAgo(5 + i * 9), analyzed: i === 0
  }));
  let videoSeq = 100;
  const analyses = {
    1: {status: "ok", card: {
      format: "рутина + результат", summary: "Автор показывает одну короткую рутину и честно говорит про результат — без обещаний «за неделю».",
      hook: {type: "боль + обещание", what: "«5 минут утром — и спина не болит» крупным текстом в первой секунде",
        why: "Названа конкретная боль и конкретное время — зритель сразу понимает, что это про него"},
      structure: [{t: "0–3", beat: "хук текстом + автор в кадре начинает первое движение"}, {t: "3–20", beat: "5 упражнений по 3 с, склейка на бит"},
        {t: "20–28", beat: "сравнение «до/после» осанки"}, {t: "28–32", beat: "CTA: сохрани, чтобы повторить"}],
      on_screen_text: ["5 минут утром", "и спина не болит", "сохрани"], tempo: "быстрый, склейка каждые 2–3 с", sound: "тренд, бит ~120 BPM",
      cta: "«Сохрани — сделаешь завтра утром»",
      why_it_worked: ["массовая боль + низкий порог (5 минут)", "честный тон без «секретов»", "ритм склеек совпадает с битом"],
      repeat: ["назови боль и время в первой секунде", "одно движение — один план", "CTA на сохранение, не на подписку"]},
      metrics: {views: 1200000, x: 12.0}}
  };
  const scripts = {
    5: {id: 5, video_id: 1, created_at: daysAgo(1), content: {idea: "Та же механика «боль + 5 минут», но для шеи — твоя аудитория сидит за ноутбуком",
      duration_s: 30, hooks: ["Шея болит к вечеру? 5 минут — и отпустит", "Это делают все, кто работает за ноутбуком. Не повторяй", "Я убрал боль в шее за неделю. Показываю что делал"],
      scenes: [{t: "0–3", shot: "крупно лицо, рука на шее", voice: "Шея к вечеру — камень?", text: "5 минут"},
        {t: "3–22", shot: "5 движений, по одному плану на каждое", voice: "коротко называю каждое", text: "названия движений"},
        {t: "22–30", shot: "общий план, улыбка", voice: "Сохрани — сделаешь завтра", text: "сохрани"}],
      shot_list: ["крупный план у окна", "5 упражнений, камера на уровне груди", "общий план"], caption: "5 минут для шеи — сохрани и повтори завтра",
      hashtags: ["шея", "осанка", "5минут"], tips: ["снимай при дневном свете", "не торопись в речи — текст на экране сделает темп"]}}
  };
  function videoOut(v) { return Object.assign({}, v); }
  function videoCard(v) {
    return Object.assign(videoOut(v), {analysis: analyses[v.id] || null,
      scripts: Object.values(scripts).filter((s) => s.video_id === v.id).map((s) => ({id: s.id, created_at: s.created_at, content: s.content}))});
  }
  function parseLink(url) {
    url = String(url || "").trim();
    if (!/^https?:\/\//i.test(url)) return null;
    let m;
    if ((m = /youtube\.com\/(?:@|channel\/|c\/)([\w.\-]+)\/?$/i.exec(url))) return {kind: "author", platform: "yt", handle: "@" + m[1].replace(/^@/, ""), url};
    if ((m = /tiktok\.com\/@([\w.\-]+)\/?$/i.exec(url))) return {kind: "author", platform: "tt", handle: "@" + m[1], url};
    if (/youtube\.com\/shorts\/|youtu\.be\//i.test(url)) return {kind: "video", platform: "yt", url};
    if (/tiktok\.com\/@[\w.\-]+\/video\//i.test(url)) return {kind: "video", platform: "tt", url};
    if (/instagram\.com\/(?:reel|reels|p)\//i.test(url)) return {kind: "video", platform: "ig", url};
    if (/vk\.com\/clip/i.test(url)) return {kind: "video", platform: "vk", url};
    return null;
  }
  function addAuthor(p) {
    let a = radar.find((x) => x.handle.toLowerCase() === p.handle.toLowerCase() && x.platform === p.platform);
    if (a) return a;
    if (radar.length >= MAX_RADAR) throw err(409, "bad_request", "Радар полон: " + MAX_RADAR + " авторов. Убери кого-нибудь.");
    a = {id: ++authorSeq, title: p.handle.slice(1), handle: p.handle, platform: p.platform, url: p.url, followers: null, added_at: iso(Date.now())};
    radar.push(a);
    return a;
  }

  // ---------- маршруты ----------
  const ROUTES = [];
  const on = (m, re, fn) => ROUTES.push({m, re, fn});
  const int = (x) => parseInt(x, 10);

  on("GET", /^\/health$/, () => ({ok: true}));
  on("GET", /^\/me$/, () => me());
  on("PATCH", /^\/me$/, (_, q, b) => {
    if ("niche_slug" in b) {
      const p = PRESETS.find((x) => x.slug === b.niche_slug);
      if (!p) throw err(400, "bad_request", "Нет такой ниши");
      user.niche = {id: PRESETS.indexOf(p) + 1, slug: p.slug, title: p.title, custom: false};
      collectingUntil = Date.now() + 12000;
    }
    if ("custom_niche" in b) {
      const t = String(b.custom_niche || "").trim();
      if (t.length < 2) throw err(400, "bad_request", "Опиши нишу хотя бы парой слов");
      user.niche = {id: ++nicheSeq, slug: "custom-" + nicheSeq, title: t.slice(0, 60), custom: true};
      collectingUntil = Date.now() + 12000;
    }
    if ("about" in b) user.about = b.about ? String(b.about).slice(0, 500) : null;
    if ("platforms" in b) {
      if (!Array.isArray(b.platforms) || b.platforms.some((c) => !PLATFORMS.find((p) => p.code === c))) throw err(400, "bad_request", "Неизвестная площадка");
      user.platforms = b.platforms.slice();
    }
    if ("digest_hour" in b) {
      const hr = int(b.digest_hour);
      if (!(hr >= 0 && hr <= 23)) throw err(400, "bad_request", "Час — от 0 до 23");
      user.digest_hour = hr;
    }
    if ("alerts" in b) user.alerts = !!b.alerts;
    if ("embed_trend" in b) {
      if (!user.is_admin) throw err(403, "forbidden", "Только для админа");
      user.embed_trend = !!b.embed_trend;
    }
    if (b.onboarded === true) {
      if (!user.niche) throw err(400, "bad_request", "Сначала выбери нишу");
      user.onboarded = true;
    }
    return me();
  });
  on("GET", /^\/me\/ledger$/, (_, q) => ledger.slice(0, Math.max(1, int(q.get("limit") || 50))));

  on("GET", /^\/sounds$/, (_, q) => {
    const page = Math.max(0, int(q.get("page") || 0)), size = 30;
    const items = sounds.slice(page * size, page * size + size).map(soundBrief);
    return {items, page, page_size: size, has_more: (page + 1) * size < sounds.length};
  });
  on("GET", /^\/sounds\/ranked$/, (_, q) => {
    const mo = montages[int(q.get("mid"))];
    const offset = Math.max(0, int(q.get("offset") || 0)), limit = Math.max(1, Math.min(50, int(q.get("limit") || 12)));
    const ranked = sounds.filter((s) => s.ready && !(mo && s.id === mo.sound_id));
    return {items: ranked.slice(offset, offset + limit).map(soundBrief), total: ranked.length};
  });
  on("GET", /^\/sounds\/(\d+)$/, ([id]) => {
    const s = byId(sounds, id);
    if (!s) throw err(404, "not_found", "Звук не найден");
    return soundCard(s);
  });

  on("GET", /^\/montage\/current$/, () => { const c = current(); return {montage: c ? montageOut(c) : null}; });
  on("POST", /^\/montage$/, (_, q, b) => montageOut(createMontage(b && b.script_id ? {script_id: b.script_id} : null)));
  on("GET", /^\/montages$/, (_, q) => Object.values(montages).filter((m) => m.status !== "collecting")
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, Math.max(1, int(q.get("limit") || 20))).map(montageOut));
  on("POST", /^\/montage\/from-video\/(\d+)$/, ([id]) => {
    const v = byId(videos, id);
    if (!v) throw err(404, "not_found", "Ролик не найден");
    const mo = createMontage();
    mo.wish = "как в ролике «" + v.title.slice(0, 60) + "»"; mo.summary = "по механике ролика · " + v.title.slice(0, 40).toLowerCase(); touch(mo);
    return montageOut(mo);
  });
  on("POST", /^\/montage\/from-script\/(\d+)$/, ([id]) => {
    const sc = scripts[int(id)];
    if (!sc) throw err(404, "not_found", "Сценарий не найден");
    const mo = createMontage({script_id: sc.id});
    mo.wish = "по сценарию: " + sc.content.idea; mo.summary = "по сценарию · " + sc.content.idea.slice(0, 50).toLowerCase(); touch(mo);
    return montageOut(mo);
  });
  on("GET", /^\/montage\/(\d+)$/, ([id]) => montageOut(getMontage(id)));
  on("PATCH", /^\/montage\/(\d+)$/, ([id], q, b) => {
    const mo = getMontage(id);
    if (mo.status !== "collecting") throw err(409, "closed", "Этот монтаж уже запущен или закрыт.");
    if ("style" in b) { if (!(b.style in STYLES)) throw err(400, "bad_request", "Нет такого стиля"); mo.style = b.style; }
    if ("music" in b) { if (!["trend", "library", "none"].includes(b.music)) throw err(400, "bad_request", "Музыка: trend, library или none"); mo.music = b.music; mo.own = null; }
    if ("captions" in b) mo.captions = !!b.captions;
    if ("embed" in b) { if (!user.is_admin) throw err(403, "forbidden", "Только для админа"); user.embed_trend = !!b.embed; }
    if ("sound_id" in b) {
      const s = byId(sounds, b.sound_id);
      if (!s) throw err(404, "not_found", "Звук не найден");
      if (!s.ready) throw err(409, "bad_request", "Под этот звук пока не умею монтировать — выбери звук с ✅.");
      if (s.id !== mo.sound_id) mo.variant = null;
      mo.sound_id = s.id;
    }
    if ("variant" in b) {
      if (b.variant === null) mo.variant = null;
      else {
        const s = byId(sounds, mo.sound_id);
        if (!s || !s.variants.find((v) => v.id === int(b.variant))) throw err(400, "bad_request", "Нет такого примера у звука");
        mo.variant = int(b.variant);
      }
    }
    if ("wish" in b) {
      const w = String(b.wish || "").trim().slice(0, 1000);
      mo.wish = w || null; mo.summary = summaryFrom(w);
      if (/быстр|энергич|динамич/i.test(w) && mo.style === "auto") mo.style = "sport";
    }
    touch(mo);
    return montageOut(mo);
  });
  on("POST", /^\/montage\/(\d+)\/go$/, ([id]) => {
    const mo = getMontage(id);
    if (mo.status !== "collecting") throw err(409, "closed", "Монтаж уже запущен или закрыт");
    if (!mo.clips.length) throw err(409, "bad_request", "Нечего монтировать — пришли клипы в чат");
    charge(PRICES.montage, "montage", mo.id);
    clearTimeout(timers["clips" + mo.id]);
    render(mo);
    return {ok: true};
  });
  on("POST", /^\/montage\/(\d+)\/cancel$/, ([id]) => {
    const mo = getMontage(id);
    if (mo.status !== "collecting") throw err(409, "closed", "Монтаж уже запущен или закрыт");
    mo.status = "cancelled"; touch(mo); clearTimeout(timers["clips" + mo.id]);
    return {ok: true};
  });
  on("POST", /^\/montage\/(\d+)\/(again|sound|track)$/, ([id, action]) => {
    const mo = getMontage(id);
    if (!["done", "error"].includes(mo.status)) throw err(409, "closed", "Монтаж уже запущен или закрыт");
    if (mo.status === "queued" || mo.status === "running") throw err(409, "busy", "Уже монтирую, подожди ⏳");
    if (action === "sound") {
      if (mo.music !== "trend" || mo.own || !mo.sound_id) throw err(409, "bad_request", "Тут не тренд-звук — жми «Другой вариант»");
      const ready = sounds.filter((s) => s.ready);
      const i = ready.findIndex((s) => s.id === mo.sound_id);
      mo.sound_id = ready[(i + 1) % ready.length].id; mo.variant = null;
    }
    if (action === "track" && mo.music !== "library") throw err(409, "bad_request", "Тут не бесплатный трек — жми «Другой вариант»");
    charge(PRICES.montage, "montage", mo.id);
    mo.seed = (mo.seed || 0) + 1;
    render(mo);
    return {ok: true};
  });
  // Клип из приложения: имя — из ?name= (как у API), байты тела игнорируем; длительность 5–12 с — по хэшу имени.
  on("POST", /^\/montage\/(\d+)\/clips$/, ([id], q, b) => {
    const mo = getMontage(id);
    if (mo.status !== "collecting") throw err(409, "closed", "Этот монтаж уже запущен или закрыт.");
    const name = String(q.get("name") || (b && b.name) || "clip.mp4").split(/[\\/]/).pop().slice(0, 80);
    if (!/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(name) && !/^video\//.test(String(b && b.type || ""))) throw err(400, "bad_request", "Это не видео — пришли файл mp4/mov.");
    if (mo.clips.length >= LIMITS.clips) return montageOut(mo, ["Уже " + LIMITS.clips + " клипов — это максимум."]);
    let hsh = 0;
    for (let i = 0; i < name.length; i++) hsh = (hsh * 31 + name.charCodeAt(i)) % 1000003;
    const duration = 5 + (hsh % 8);
    const total = mo.clips.reduce((a, c) => a + (c.duration || 0), 0);
    if (total + duration > LIMITS.total_s) return montageOut(mo, ["Клип длиннее лимита: всего уже " + Math.round(total) + " с из " + LIMITS.total_s + "."]);
    const size = int((b && b.size) || 0) > 1 ? int(b.size) : 2_500_000 + duration * 400_000;
    mo.clips.push({n: mo.clips.length + 1, duration, size, src: "app", name}); touch(mo);
    return montageOut(mo);
  });
  on("DELETE", /^\/montage\/(\d+)\/clips\/(\d+)$/, ([id, n]) => {
    const mo = getMontage(id);
    if (mo.status !== "collecting") throw err(409, "closed", "Этот монтаж уже запущен или закрыт.");
    const i = mo.clips.findIndex((c) => c.n === int(n));
    if (i < 0) throw err(404, "not_found", "Такого клипа нет");
    mo.clips.splice(i, 1); mo.clips.forEach((c, k) => { c.n = k + 1; }); touch(mo);
    return montageOut(mo);
  });
  on("DELETE", /^\/montage\/(\d+)\/own-track$/, ([id]) => {
    const mo = getMontage(id);
    if (mo.status !== "collecting") throw err(409, "closed", "Этот монтаж уже запущен или закрыт.");
    mo.own = null; touch(mo);
    return montageOut(mo);
  });

  on("GET", /^\/trends$/, (_, q) => {
    if (!user.niche) return {items: [], collecting: true};
    if (Date.now() < collectingUntil) return {items: [], collecting: true};
    const offset = Math.max(0, int(q.get("offset") || 0)), limit = Math.max(1, Math.min(20, int(q.get("limit") || 5)));
    return {items: videos.filter((v) => v.id <= 7).slice(offset, offset + limit).map(videoOut), collecting: false};
  });
  on("GET", /^\/videos\/(\d+)$/, ([id]) => {
    const v = byId(videos, id);
    if (!v) throw err(404, "not_found", "Ролик не найден");
    return videoCard(v);
  });
  on("POST", /^\/videos\/(\d+)\/analyze$/, ([id]) => {
    const v = byId(videos, id);
    if (!v) throw err(404, "not_found", "Ролик не найден");
    if (!v.analyzed) {
      charge(PRICES.analysis, "analysis", v.id);
      setTimeout(() => {
        v.analyzed = true;
        analyses[v.id] = {status: "ok", card: {format: "совет + демонстрация", summary: "Автор даёт один конкретный совет и сразу показывает его в кадре.",
          hook: {type: "обещание", what: "первая фраза — результат, который получит зритель", why: "обещание конкретное и быстрое"},
          structure: [{t: "0–3", beat: "хук текстом"}, {t: "3–20", beat: "демонстрация"}, {t: "20–25", beat: "CTA"}],
          tempo: "средний, склейка каждые 3–4 с", why_it_worked: ["конкретика", "один совет — одно видео"], repeat: ["обещание в первой секунде", "показывай, не рассказывай"]},
          metrics: {views: v.views, x: v.x}};
      }, 2500);
    }
    return {ok: true, credits: user.credits};
  });
  on("POST", /^\/videos\/(\d+)\/script$/, ([id]) => {
    const v = byId(videos, id);
    if (!v) throw err(404, "not_found", "Ролик не найден");
    charge(PRICES.script, "script", v.id);
    setTimeout(() => {
      const sid = 10 + Object.keys(scripts).length;
      scripts[sid] = {id: sid, video_id: v.id, created_at: iso(Date.now()), content: {idea: "Твоя версия ролика «" + v.title.slice(0, 40) + "» — та же механика, твоя тема",
        duration_s: 25, hooks: ["Хук 1 — боль зрителя", "Хук 2 — неожиданный факт", "Хук 3 — личный результат"],
        scenes: [{t: "0–3", shot: "крупный план", voice: "хук", text: "хук текстом"}, {t: "3–20", shot: "демонстрация", voice: "по шагам"}, {t: "20–25", shot: "общий план", voice: "CTA"}],
        caption: "Сохрани, чтобы повторить", hashtags: ["фитнес", "дома"], tips: ["снимай вертикально", "текст на экране крупно"]}};
    }, 2500);
    return {ok: true, credits: user.credits};
  });
  on("POST", /^\/link$/, (_, q, b) => {
    const p = parseLink(b.url);
    if (!p) throw err(400, "bad_request", "Не понял ссылку. Нужна ссылка на ролик (Shorts, TikTok, Reels) или на канал YouTube / профиль TikTok.");
    if (p.kind === "author") return {author: addAuthor(p)};
    let v = videos.find((x) => x.url === p.url);
    if (!v) {
      v = {id: ++videoSeq, title: "Ролик по ссылке · " + p.platform.toUpperCase(), platform: p.platform, author: "автор по ссылке", author_id: null, url: p.url,
        views: 240000, likes: 12000, x: 3.2, published_at: hoursAgo(30), analyzed: false};
      videos.push(v);
    }
    return {video: videoCard(v)};
  });

  on("GET", /^\/radar$/, () => ({items: radar.map((a) => Object.assign({}, a)), max: MAX_RADAR}));
  on("POST", /^\/radar$/, (_, q, b) => {
    const p = parseLink(b.url);
    if (!p || p.kind !== "author") throw err(400, "bad_request", "Нужна ссылка на канал YouTube (youtube.com/@имя) или профиль TikTok (tiktok.com/@имя).");
    return {author: addAuthor(p)};
  });
  on("DELETE", /^\/radar\/(\d+)$/, ([id]) => {
    const i = radar.findIndex((a) => a.id === int(id));
    if (i < 0) throw err(404, "not_found", "Этого автора в радаре нет");
    radar.splice(i, 1);
    return {ok: true};
  });

  // ---------- замена героя (§3.7): черновик → ролик → кого вставить → go → queued → running → done за ~6 с ----------
  const SWAP_PRICE = 17, SWAP_LIMITS = {min_s: 3, max_s: 30, upload_mb: 200, photo_mb: 15};
  const swaps = {};
  let swapSeq = 0;
  const SWAP_STAGES = [["refs", "Ищу фото персонажа", 1], ["keyframes", "Рисую опорные кадры", 3], ["video", "Генерирую видео", 2], ["assemble", "Собираю ролик", 1]];
  function swapOut(x) {
    const draft = x.status === "draft";
    return {id: x.id, status: x.status, source: x.source, subject: x.subject,
      cost: draft ? (x.source ? Math.ceil(x.source.duration) * SWAP_PRICE : null) : (x.charged || null),
      credits: user.credits, price_per_s: SWAP_PRICE, limits: SWAP_LIMITS, needs_consent: !!(x.subject && x.subject.kind === "person"),
      progress: (x.status === "queued" || x.status === "running") ? x.progress || null : null,
      result: x.status === "done" ? {duration: x.source.duration, who: x.subject.name_ru || x.subject.text} : null,
      error: x.status === "error" ? x.error : null, can: {go: draft && !!x.source && !!x.subject, cancel: draft},
      created_at: x.created_at, updated_at: x.updated_at};
  }
  function getSwap(id) { const x = swaps[int(id)]; if (!x) throw err(404, "not_found", "Не нашёл — возможно, уже удалено."); return x; }
  function draftSwap(id) { const x = getSwap(id); if (x.status !== "draft") throw err(409, "closed", "Эта замена уже запущена или закрыта."); return x; }
  function currentSwap() { return Object.values(swaps).filter((x) => ["draft", "queued", "running"].includes(x.status)).sort((a, b) => b.id - a.id)[0] || null; }
  function runSwap(x) {
    x.status = "queued"; x.updated_at = iso(Date.now());
    const steps = [];
    SWAP_STAGES.forEach(([stage, title, total]) => { for (let d = 0; d <= total; d++) steps.push({stage, title, done: d, total}); });
    steps.forEach((p, i) => setTimeout(() => { x.status = "running"; x.progress = p; x.updated_at = iso(Date.now()); }, 700 + i * 500));
    setTimeout(() => { x.status = "done"; x.progress = null; x.updated_at = iso(Date.now()); }, 700 + steps.length * 500);
  }
  on("GET", /^\/swap\/current$/, () => { const c = currentSwap(); return {swap: c ? swapOut(c) : null, enabled: true, price_per_s: SWAP_PRICE, limits: SWAP_LIMITS}; });
  on("POST", /^\/swap$/, () => {
    let c = currentSwap();
    if (!c) { c = swaps[++swapSeq] = {id: swapSeq, status: "draft", source: null, subject: null, charged: 0, created_at: iso(Date.now()), updated_at: iso(Date.now())}; }
    return swapOut(c);
  });
  on("GET", /^\/swaps$/, (_, q) => Object.values(swaps).filter((x) => x.status !== "draft").sort((a, b) => b.id - a.id)
    .slice(0, Math.max(1, int(q.get("limit") || 20))).map(swapOut));
  on("GET", /^\/swap\/(\d+)$/, ([id]) => swapOut(getSwap(id)));
  on("POST", /^\/swap\/(\d+)\/source$/, ([id], q, b) => {
    const x = draftSwap(id);
    if (b && b.type && !/^video\//.test(b.type)) throw err(400, "bad_request", "Это не видео — пришли файл mp4/mov.");
    x.source = {name: (q.get("name") || (b && b.name) || "video.mp4").slice(0, 80), duration: 12, w: 1080, h: 1920};
    x.updated_at = iso(Date.now());
    return swapOut(x);
  });
  on("POST", /^\/swap\/(\d+)\/source-link$/, ([id], q, b) => {
    const x = draftSwap(id);
    if (!/^https?:\/\//i.test(String(b.url || ""))) throw err(400, "bad_request", "Это не ссылка — пришли адрес ролика целиком.");
    x.source = {name: null, duration: 18, w: 1080, h: 1920}; x.updated_at = iso(Date.now());
    return swapOut(x);
  });
  on("POST", /^\/swap\/(\d+)\/subject$/, ([id], q, b) => {
    const x = draftSwap(id), text = String(b.text || "").trim();
    if (text.length < 2) throw err(400, "bad_request", "Напиши, кого вставить: например, «капибара».");
    if (/иван|мария|человек|шрек/i.test(text)) throw err(400, "bad_request", "По названию нахожу только настоящих животных. Для персонажа или предмета пришли фото.");
    x.subject = {mode: "name", text, kind: "animal", name_ru: text.toLowerCase()}; x.updated_at = iso(Date.now());
    return swapOut(x);
  });
  on("POST", /^\/swap\/(\d+)\/photo$/, ([id], q, b) => {
    const x = draftSwap(id);
    if (b && b.type && !/^image\//.test(b.type)) throw err(400, "bad_request", "Это не фото — пришли jpg или png.");
    const person = /me|я|selfie|portrait/i.test((b && b.name) || "");          // в демо «человек» — по имени файла
    x.subject = {mode: "photo", text: null, kind: person ? "person" : "animal", name_ru: person ? "человек" : "рыжий кот"};
    x.updated_at = iso(Date.now());
    return swapOut(x);
  });
  on("POST", /^\/swap\/(\d+)\/cancel$/, ([id]) => {
    const x = getSwap(id);
    if (x.status === "queued" || x.status === "running") throw err(409, "busy", "Замена уже идёт — отменить нельзя.");
    if (x.status !== "draft") throw err(409, "closed", "Эта замена уже запущена или закрыта.");
    x.status = "cancelled"; x.updated_at = iso(Date.now());
    return {ok: true, swap: swapOut(x)};
  });
  on("POST", /^\/swap\/(\d+)\/go$/, ([id], q, b) => {
    const x = draftSwap(id);
    if (!x.source) throw err(400, "bad_request", "Сначала добавь ролик, в котором меняем героя.");
    if (!x.subject) throw err(400, "bad_request", "Сначала выбери, кого вставить: напиши животное или пришли фото.");
    if (x.subject.kind === "person" && !(b && b.consent)) throw err(400, "bad_request", "На фото человек. Подтверди, что это ты или что у тебя есть разрешение этого человека на использование его внешности.");
    const cost = Math.ceil(x.source.duration) * SWAP_PRICE;
    charge(cost, "swap", x.id);
    x.charged = cost;
    runSwap(x);
    return {ok: true, swap: swapOut(x)};
  });

  on("POST", /^\/pay\/invoice$/, (_, q, b) => {
    const p = PACKS.find((x) => x.credits === int(b.credits));
    if (!p) throw err(400, "bad_request", "Нет такого пакета");
    const nonce = Math.random().toString(36).slice(2, 8);
    // В демо «оплата» проходит сама через секунду — бот начислил бы кредиты по successful_payment.
    setTimeout(() => grant(p.credits, "stars", "demo_" + nonce), 1200);
    return {url: "https://t.me/$demo_invoice_" + p.credits + "_" + nonce};
  });

  function route(method, fullPath, body) {
    const [path, qs] = String(fullPath).split("?");
    const q = new URLSearchParams(qs || "");
    for (const r of ROUTES) {
      if (r.m !== method) continue;
      const m = r.re.exec(path);
      if (m) return r.fn(m.slice(1), q, body || {});
    }
    throw err(404, "not_found", "Нет такой ручки: " + method + " " + path);
  }
  function request(method, path, body) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try { resolve(JSON.parse(JSON.stringify(route(method, path, body)))); }
        catch (e) { reject(e && e.status ? e : {status: 500, error: "error", message: String((e && e.message) || e)}); }
      }, DELAY);
    });
  }

  root.REELSEEX_DEMO = {request, route, state: {user, sounds, montages, videos, radar, ledger, swaps}};
})(typeof window !== "undefined" ? window : globalThis);
