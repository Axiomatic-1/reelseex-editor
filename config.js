// Настройки Mini App Reelseex. Подключается первым (index.html).
// api — основной адрес API (без слэша в конце); apiAlt — запасные адреса того же API (другие входы: Tailscale Funnel,
// Cloudflare Tunnel …). Приложение запоминает вход после успешного запроса к API.
// Пусто — демо-режим: приложение работает на моках (demo.js), запросов в сеть нет.
// bot — username бота без @: ссылки «открой чат с ботом».
window.REELSEEX = {api: "https://macbook-air-nazir.tailda32ea.ts.net", apiAlt: ["https://reelseex.103.136.70.234.sslip.io"], bot: "Reelseex_bot"};
