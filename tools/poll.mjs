/**
 * Опрос игрового сервера и накопление истории.
 *
 * Запускается планировщиком GitHub Actions раз в несколько минут. Делает то же,
 * что делал бэкенд на своей машине, но без машины: спрашивает сервер по UDP,
 * складывает результат в JSON и коммитит его. Сайт потом читает эти файлы как
 * обычную статику — своего сервера у нас нет и не будет.
 *
 * Пишет два файла:
 *   data/live.json   — кто сейчас в игре, онлайн и слоты. Перезаписывается.
 *   data/stats.json  — накопленные часы по дням и график численности. Дополняется.
 *
 * Правила начисления повторяют api/ServerStats.cs один в один: при первой встрече
 * засчитываем текущую сессию игрока, дальше — время между замерами, а слишком
 * большие промежутки не засчитываем вовсе.
 */

import dgram from 'node:dgram';
import fs from 'node:fs/promises';
import path from 'node:path';

const HOST = process.env.SERVER_HOST || '195.18.27.169';
const QUERY_PORT = Number(process.env.SERVER_QUERY_PORT || 35110);
const GAME_PORT = Number(process.env.SERVER_PORT || 35100);
const STEAM_KEY = process.env.STEAM_API_KEY || '';

const DATA_DIR = process.env.DATA_DIR || 'data';
const RUST_APPID = 252490;

/**
 * Промежуток, больше которого считаем, что был простой.
 * У планировщика GitHub расписание «по возможности»: заявленные пять минут под
 * нагрузкой превращаются в десять-пятнадцать. С жёстким порогом в 15 часть
 * замеров молча не засчитывалась бы, поэтому по умолчанию берём с запасом.
 */
const MAX_GAP_MIN = Number(process.env.STATS_MAX_GAP_MINUTES || 25);

/** Потолок на разовое начисление при первой встрече — от мусора в ответе. */
const FIRST_SIGHT_CAP_MIN = 72 * 60;

/** Сколько дней держим поминутную историю, прежде чем свернуть её в итог. */
const KEEP_DAYS = 14;

/** Ключ, под который сворачивается всё, что старше срока хранения. */
const ROLLED_UP = 'before';

/* ------------------------------ протокол Steam ------------------------------ */

function ask(payload, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');

    const done = (err, data) => {
      clearTimeout(timer);
      sock.removeAllListeners();
      sock.close(() => (err ? reject(err) : resolve(data)));
    };

    const timer = setTimeout(() => done(new Error(`нет ответа за ${timeout} мс`)), timeout);

    sock.on('message', (msg) => done(null, msg));
    sock.on('error', (e) => done(e));
    sock.send(payload, QUERY_PORT, HOST, (e) => { if (e) done(e); });
  });
}

function packet(challenge) {
  const p = Buffer.alloc(9, 0xff);
  p[4] = 0x55;                       // A2S_PLAYER
  p.writeUInt32LE(challenge, 5);
  return p;
}

/** Список игроков с длительностью текущей сессии каждого. */
async function players() {
  let answer = await ask(packet(0xffffffff));

  // 'A' — челлендж: сервер требует повторить запрос с ним. Так протокол
  // защищается от подделки обратного адреса, шаг обязательный.
  if (answer.length >= 9 && answer[4] === 0x41) {
    answer = await ask(packet(answer.readUInt32LE(5)));
  }

  const out = [];
  if (answer.length < 6 || answer[4] !== 0x44) return out;   // 'D' — список

  let at = 6;
  const count = answer[5];

  for (let i = 0; i < count && at < answer.length; i++) {
    at += 1;                                   // порядковый номер не нужен

    const end = answer.indexOf(0, at);
    if (end < 0) break;

    const name = answer.toString('utf8', at, end);
    at = end + 1;

    if (at + 8 > answer.length) break;
    at += 4;                                   // очки: в Rust всегда ноль
    const seconds = answer.readFloatLE(at);
    at += 4;

    if (name.trim()) out.push({ name, seconds });
  }

  return out;
}

/* ------------------------------ онлайн из Steam ------------------------------ */

/**
 * Счётчик берём из мастер-листа Steam, а не из длины списка игроков: список
 * иногда приходит обрезанным, а Steam отдаёт и максимум слотов, и карту.
 * Ключа нет — не беда, обойдёмся длиной списка.
 */
async function serverInfo(onlineFallback) {
  if (!STEAM_KEY) return { players: onlineFallback, maxPlayers: null, name: null, map: null };

  const filter = encodeURIComponent(`\\appid\\${RUST_APPID}\\gameaddr\\${HOST}`);
  const url = `https://api.steampowered.com/IGameServersService/GetServerList/v1/`
            + `?key=${STEAM_KEY}&filter=${filter}&limit=32`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`Steam ответил ${res.status}`);

    const list = (await res.json())?.response?.servers ?? [];
    const mine = list.find((s) => s.gameport === GAME_PORT) ?? list[0];
    if (!mine) throw new Error('сервера нет в списке Steam');

    return {
      players: mine.players ?? onlineFallback,
      maxPlayers: mine.max_players ?? null,
      name: mine.name ?? null,
      map: mine.map ?? null,
    };
  } catch (e) {
    console.warn('Steam не ответил:', e.message, '— онлайн возьмём из списка игроков');
    return { players: onlineFallback, maxPlayers: null, name: null, map: null };
  }
}

/* ------------------------------ хранилище ------------------------------ */

async function loadStats(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    // Файла ещё нет либо он битый — начинаем историю заново, но не падаем:
    // потерять один замер не страшно, уронить весь запуск — страшно.
    return { players: {}, history: [], lastPoll: null, since: null };
  }
}

/** Чистим старое, иначе файл растёт без предела и коммиты пухнут. */
function trim(store, now) {
  const edge = now - KEEP_DAYS * 86400_000;
  store.history = store.history.filter((s) => Date.parse(s.at) >= edge);

  const oldest = new Date(edge).toISOString().slice(0, 10);

  for (const days of Object.values(store.players)) {
    const stale = Object.keys(days).filter((d) => d !== ROLLED_UP && d < oldest);
    if (!stale.length) continue;

    // Общий налёт терять нельзя, а держать его по дням вечно незачем —
    // сворачиваем в одну запись
    const sum = stale.reduce((acc, d) => acc + days[d], 0);
    for (const d of stale) delete days[d];
    days[ROLLED_UP] = (days[ROLLED_UP] ?? 0) + sum;
  }
}

/* ------------------------------ замер ------------------------------ */

async function main() {
  const online = await players();
  const info = await serverInfo(online.length);

  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  await fs.mkdir(DATA_DIR, { recursive: true });

  // --- живой срез ---
  const live = {
    at: now.toISOString(),
    players: info.players,
    maxPlayers: info.maxPlayers,
    name: info.name,
    map: info.map,
    rows: online
      .slice()
      .sort((a, b) => b.seconds - a.seconds)
      .map((p) => ({ name: p.name, value: Math.round(p.seconds / 60) })),
  };

  await fs.writeFile(path.join(DATA_DIR, 'live.json'), JSON.stringify(live, null, 2));

  // --- накопление ---
  const statsFile = path.join(DATA_DIR, 'stats.json');
  const store = await loadStats(statsFile);

  store.since ??= now.toISOString();

  const gapMin = store.lastPoll ? (now - Date.parse(store.lastPoll)) / 60000 : 0;
  const credit = gapMin > 0 && gapMin <= MAX_GAP_MIN ? gapMin : 0;

  let seeded = 0;

  for (const p of online) {
    let days = store.players[p.name];

    if (!days) {
      // Игрока видим впервые. Сервер сам сообщает, сколько он уже сидит —
      // это настоящее время на сервере, а не догадка, и терять его незачем.
      days = store.players[p.name] = {};
      const session = Math.min(Math.max(p.seconds / 60, 0), FIRST_SIGHT_CAP_MIN);
      if (session > 0) days[day] = session;
      seeded++;
      continue;   // интервал не начисляем: он уже внутри засчитанной сессии
    }

    if (credit > 0) days[day] = (days[day] ?? 0) + credit;
  }

  store.history.push({ at: now.toISOString(), players: info.players });
  store.lastPoll = now.toISOString();

  trim(store, now.getTime());

  await fs.writeFile(statsFile, JSON.stringify(store, null, 2));

  console.log(
    `Замер: онлайн ${info.players}, в списке ${online.length}, ` +
    `новых игроков ${seeded}, начислено ${credit.toFixed(1)} мин знакомым`
  );
}

main().catch((e) => {
  console.error('Замер не удался:', e.message);
  process.exit(1);
});
