// Настройки Mini App Reelseex. Подключается первым (index.html).
// api — основной адрес API (без слэша в конце); apiAlt — запасные адреса того же API (другие входы: Tailscale Funnel,
// Cloudflare Tunnel …). Приложение берёт первый отвечающий /health и запоминает на сессию; при обрыве переключается.
// Пусто — демо-режим: приложение работает на моках (demo.js), запросов в сеть нет.
// bot — username бота без @: ссылки «открой чат с ботом».
window.REELSEEX = {api: "https://pride-organizer-mobiles-spin.trycloudflare.com", apiAlt: ["https://macbook-air-nazir.tailda32ea.ts.net"], bot: "Reelseex_bot"};
