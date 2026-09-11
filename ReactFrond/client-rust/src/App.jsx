import { useEffect, useMemo, useState } from 'react';
import './App.css';

import heroWide from './assets/hero-wide.webp';
import heroVideoMp4 from './assets/hero.mp4';
import heroVideoWebm from './assets/hero.webm';
import heroPoster from './assets/hero-poster.jpg';
import wordmark from './assets/wordmark.webp';
import { PINES_BACK, PINES_FRONT } from './pines';
import { TEXT } from './text';

const CFG = {
  serverName: 'RUSTICS | ДЛЯ НОВИЧКОВ | NOLIMIT',

  serverIp: '195.18.27.169',
  serverPort: '35100',

  bmServerId: '27796179',
  api: '/api',

  discord: 'https://discord.com/invite/vUfPRa3QKe',

  // ВКонтакте: пока ссылки нет, значок в шапке не появится. Пустая строка лучше
  // мёртвой ссылки — вписали адрес, и он показался сам.
  vk: '',

  telegram: 'https://t.me/rustics0',

  maxPlayers: 200,
};

const LANGS = [
  { code: 'RU', label: 'Русский', flag: (
    <svg viewBox="0 0 24 16" width="20" height="14"><rect width="24" height="16" fill="#fff"/><rect y="5.33" width="24" height="5.33" fill="#0039A6"/><rect y="10.67" width="24" height="5.33" fill="#D52B1E"/></svg>
  ) },
  { code: 'EN', label: 'English', flag: (
    <svg viewBox="0 0 24 16" width="20" height="14"><rect width="24" height="16" fill="#0A17A7"/><path d="M0 0 24 16M24 0 0 16" stroke="#fff" strokeWidth="2.4"/><path d="M0 0 24 16M24 0 0 16" stroke="#C8102E" strokeWidth="1.2"/><rect x="10" width="4" height="16" fill="#fff"/><rect y="6" width="24" height="4" fill="#fff"/><rect x="10.8" width="2.4" height="16" fill="#C8102E"/><rect y="6.8" width="24" height="2.4" fill="#C8102E"/></svg>
  ) },
];

function LangSwitch({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === lang);

  return (
    <div className="langsw">
      <button className="langsw__btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {current.flag}
        <span>{current.code}</span>
        <svg className="langsw__chev" data-open={open} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="langsw__menu" role="listbox">
          {LANGS.map((l) => (
            <button
              key={l.code}
              className="langsw__opt"
              data-active={l.code === lang}
              onClick={() => { setLang(l.code); setOpen(false); }}
            >
              {l.flag}
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Spark({ points, t }) {
  if (!points || points.length < 2) return null;

  const W = 600;
  const H = 90;
  const peak = Math.max(1, ...points.map((p) => p.players));
  const step = W / (points.length - 1);

  const xy = points.map((p, i) => [i * step, H - (p.players / peak) * (H - 8)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  const first = new Date(points[0].at);
  const last = new Date(points[points.length - 1].at);
  const hhmm = (d) => d.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <figure className="spark" data-reveal>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="spark__area" d={area} />
        {/* pathLength="1" нормирует длину: штриховку можно задавать в долях,
            не зная, насколько длинной вышла ломаная на этих данных */}
        <path className="spark__line" d={line} pathLength="1" />
      </svg>
      <figcaption className="spark__cap">
        <span>{hhmm(first)}</span>
        <span>{t.top.peak} {peak}</span>
        <span>{hhmm(last)}</span>
      </figcaption>
    </figure>
  );
}

function RuleGroup({ group, index, open, onToggle }) {
  const headId = `rule-${index}-head`;
  const bodyId = `rule-${index}-body`;

  return (
    <section className="rulegrp" id={`rule-${index}`} data-open={open}>
      <h3 className="h3 rulegrp__h">
        <button
          className="rulegrp__head"
          id={headId}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="rulegrp__title">{group.title}</span>
          <span className="rulegrp__count">{group.items.length}</span>
          <svg className="rulegrp__chev" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>

      <div className="rulegrp__panel" id={bodyId} role="region" aria-labelledby={headId}>
        <div className="rulegrp__inner">
          <ul className="rulelist">
            {group.items.map(([t, d], idx) => (
              <li key={t}>
                <span className="rulelist__num" aria-hidden="true">{index + 1}.{idx + 1}</span>
                <span className="rulelist__body">
                  <b>{t}</b>
                  {d && <span className="rulelist__desc">{d}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
/* Контуры логотипов. Объявлены один раз, потому что рисуются в двух местах —
   мелкими значками в шапке и крупными карточками внизу. Раньше путь был
   продублирован, и самодельный набросок Discord читался кляксой на 17 пикселях;
   здесь официальный контур, он держит форму в любом размере. */
const ICON = {
  tg: 'M21.9 4.3 18.7 19c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.3 12.7l-4.8-1.5c-1-.3-1-1 .2-1.5l18.8-7.2c.9-.3 1.6.2 1.4 1.8Z',
  vk: 'M13.2 18.3c-6.1 0-9.6-4.2-9.7-11.2h3.1c.1 5.1 2.3 7.2 4.1 7.6V7.1h2.9v4.5c1.7-.2 3.5-2.2 4.1-4.5h2.9c-.5 2.8-2.4 4.8-3.8 5.6 1.4.7 3.6 2.4 4.4 5.6h-3.2c-.6-2-2.2-3.5-4.4-3.7v3.7h-.4Z',
  dc: 'M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.198.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z',
};

/* Время в игре: до часа показываем минутами, дальше часами.
   Пока история короткая, у всех выходило «0.0 ч» и таблица читалась как
   сломанная — хотя данные были верные, просто мелкие. */
function playtime(minutes, t) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} ${t.top.min}`;
  return `${(minutes / 60).toFixed(1)} ${t.top.hr}`;
}

/* ---------- значки соцсетей в шапке ----------
   Мелкие, приглушённые, цвет сети проступает только под курсором: это спутники
   кнопки входа, а не самостоятельные акценты. Раздел с крупными карточками ниже
   по странице никуда не делся — здесь короткий путь для тех, кто уже свой. */
const NETS = [
  {
    id: 'tg',
    label: 'Telegram',
    href: (c) => c.telegram,
    path: ICON.tg,
  },
  {
    id: 'vk',
    label: 'ВКонтакте',
    href: (c) => c.vk,
    path: ICON.vk,
  },
  {
    id: 'dc',
    label: 'Discord',
    href: (c) => c.discord,
    path: ICON.dc,
  },
];

function Nets() {
  return (
    <div className="mini">
      {NETS.map((n) => {
        const href = n.href(CFG);
        if (!href) return null;   // ссылки нет — значка нет

        return (
          <a
            key={n.id}
            className="mini__a"
            data-net={n.id}
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={n.label}
            title={n.label}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={n.path} /></svg>
          </a>
        );
      })}
    </div>
  );
}

/* ---------- знак в шапке ----------
   Маяк взят из фирменного логотипа проекта (src/assets/logo.webp), где он и
   нарисован, — а не придуман заново. В шапке до сих пор стояла одна надпись,
   и знака у неё не было.

   Рисуем вектором, а не картинкой: на 30 пикселях растр мылится, а тут нужен
   ещё и живой луч. Луч поворачивается медленно и приглушённо — маяк на то и
   маяк, чтобы ровно подавать знак, что здесь кто-то есть. */
function Beacon() {
  return (
    <svg className="beacon" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="beaconTower" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F1A1CB" />
          <stop offset="100%" stopColor="#7D4DAA" />
        </linearGradient>
        <radialGradient id="beaconGlow">
          <stop offset="0%" stopColor="#FDDEA0" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FDDEA0" stopOpacity="0" />
        </radialGradient>
        {/* луч уходит далеко за круг — обрезаем, иначе он лезет на текст */}
        <clipPath id="beaconRing">
          <circle cx="16" cy="16" r="14" />
        </clipPath>
      </defs>

      <circle className="beacon__ring" cx="16" cy="16" r="13.2" />

      <g clipPath="url(#beaconRing)">
        <g className="beacon__sweep">
          <path d="M16 10.4 L-8 6.2 L-8 14.6 Z" />
          <path d="M16 10.4 L40 6.2 L40 14.6 Z" />
        </g>
      </g>

      <circle className="beacon__halo" cx="16" cy="10.4" r="5.6" />

      <path className="beacon__body" d="M12.4 8.6 L16 5 L19.6 8.6 Z" />
      <rect className="beacon__body" x="13.4" y="8.6" width="5.2" height="3.4" rx="0.3" />
      <path className="beacon__body" d="M13.7 12 L18.3 12 L20.4 25.6 L11.6 25.6 Z" />
      <rect className="beacon__body" x="10.5" y="25.6" width="11" height="2" rx="0.5" />

      <circle className="beacon__lamp" cx="16" cy="10.4" r="1.5" />
    </svg>
  );
}

/* ---------- появление блоков при прокрутке ----------
   Класс на <html> ставит сам скрипт. Пока его нет — блоки видны как обычно,
   поэтому при отключённом JS или сбое наблюдателя страница не окажется пустой:
   прятать что-либо начинаем, только убедившись, что умеем показать обратно. */
function useReveal() {
  useEffect(() => {
    // кому анимации мешают — показываем сразу, ничего не пряча
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // браузер без наблюдателя не должен получить наполовину пустую страницу
    if (!('IntersectionObserver' in window)) return;

    document.documentElement.classList.add('has-reveal');

    let answered = false;

    const eye = new IntersectionObserver(
      (entries) => {
        answered = true;
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.dataset.shown = 'true';
          eye.unobserve(e.target);   // показали один раз и забыли
        });
      },
      { rootMargin: '0px 0px -12% 0px' }
    );

    // Берём только те, что ещё не показаны: наблюдать уже показанное незачем,
    // а observe по второму разу для того же узла ничего не делает.
    const watch = () =>
      document.querySelectorAll('[data-reveal]:not([data-shown])').forEach((t) => eye.observe(t));

    watch();

    // Таблица топа и график появляются позже — когда придут данные с сервера.
    // На момент запуска их в документе нет, поэтому одного прохода мало: без
    // этого наблюдателя за изменениями они остались бы прозрачными навсегда.
    // Именно так и пропал топ игроков.
    const grower = new MutationObserver(watch);
    grower.observe(document.body, { childList: true, subtree: true });

    // Страховка. Наблюдатель обязан отозваться сразу же — первый вызов приходит
    // на все элементы, даже далеко за экраном. Если через полторы секунды не
    // пришло ничего, значит он не работает: снимаем класс и показываем всё как
    // есть. Анимация того не стоит, чтобы ради неё потерять половину страницы.
    const rescue = setTimeout(() => {
      if (answered) return;
      eye.disconnect();
      document.documentElement.classList.remove('has-reveal');
    }, 1500);

    return () => {
      clearTimeout(rescue);
      grower.disconnect();
      eye.disconnect();
    };
  }, []);
}

/* ---------- узкий экран: видео уходит в герой, а не в карточку ---------- */
function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const on = (e) => setNarrow(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export default function App() {
  const narrow = useNarrow();
  useReveal();
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('rustics_lang') === 'EN' ? 'EN' : 'RU'; }
    catch { return 'RU'; }
  });

  const t = TEXT[lang === 'EN' ? 'en' : 'ru'];

  useEffect(() => {
    // в приватном режиме хранилище может быть закрыто — язык просто не запомнится
    try { localStorage.setItem('rustics_lang', lang); } catch { /* не критично */ }

    document.documentElement.lang = lang === 'EN' ? 'en' : 'ru';

    document.title = t.pageTitle;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.pageDescription);
  }, [lang, t]);

  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [server, setServer] = useState(null);
  const [monitorDown, setMonitorDown] = useState(false);
  const [period, setPeriod] = useState('now');  
  const [stats, setStats] = useState(null);    
  const [history, setHistory] = useState(null);  
  const [top, setTop] = useState(null);
  const [copied, setCopied] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [openRules, setOpenRules] = useState(() => new Set([0]));

  const toggleRule = (i) =>
    setOpenRules((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const connectCmd = `client.connect ${CFG.serverIp}:${CFG.serverPort}`;

  /* Ссылка запускает Rust через Steam и сразу ведёт на сервер.
     252490 — номер Rust в Steam. Указываем его явно, а не полагаемся на короткую
     форму steam://connect: тогда Steam знает, что запускать, даже если сервера
     нет у него в кэше. Пробел перед адресом кодируем, иначе аргумент оборвётся.
     Работает только при закрытой игре: параметры запуска читаются один раз,
     на старте. Поэтому кнопка копирования остаётся рядом, а не вместо. */
  const playUrl =
    `steam://run/252490//+connect%20${CFG.serverIp}:${CFG.serverPort}`;

  const steamLoginUrl = useMemo(() => {
    const origin = window.location.origin;
    const p = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': `${origin}${CFG.api}/steam/callback`,
      'openid.realm': origin,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });
    return `https://steamcommunity.com/openid/login?${p}`;
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem('rustics_profile');
    if (cached) {
      try { setProfile(JSON.parse(cached)); } catch { localStorage.removeItem('rustics_profile'); }
    }

    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('steamid');
    const failed = params.get('error');

    if (fromUrl) {
      const pr = {
        steamId: fromUrl,
        name: params.get('name') || t.auth.playerFallback(fromUrl.slice(-5)),
        avatar: params.get('avatar') || null,
      };
      setProfile(pr);
      localStorage.setItem('rustics_profile', JSON.stringify(pr));
      localStorage.setItem('rustics_steamid', fromUrl);
    } else if (failed) {
      setAuthError(t.auth.errors[failed] ?? t.auth.generic);
    }

    if (fromUrl || failed) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // Язык влияет только на запасной ник и текст ошибки. Разбирать ответ Steam
    // заново при переключении языка не нужно — читаем состояние на монтировании.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    localStorage.removeItem('rustics_profile');
    localStorage.removeItem('rustics_steamid');
    setProfile(null);
  };

  useEffect(() => {
    let alive = true;
    let timer;
    let misses = 0;

    const later = (ms) => { timer = setTimeout(run, ms); };

    const run = () =>
      fetch(`${CFG.api}/server/status`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j) => {
          if (!alive) return;
          misses = 0;
          setServer(j);
          setMonitorDown(false);
          later(60000);
        })
        .catch(() => {
          if (!alive) return;
          misses += 1;
          if (misses >= 3) {
            setServer(null);
            setMonitorDown(true);
          }
          later(misses >= 3 ? 60000 : 8000);
        });

    run();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let alive = true;
    let timer;
    let misses = 0;

    const later = (ms) => { timer = setTimeout(run, ms); };

    const run = () =>
      fetch(`${CFG.api}/server/players`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((rows) => {
          if (!alive) return;
          misses = 0;
          setTop(Array.isArray(rows) ? rows : []);
          later(60000);
        })
        .catch(() => {
          if (!alive) return;
          misses += 1;
          if (misses >= 3) setTop(null);
          later(misses >= 3 ? 60000 : 8000);
        });

    run();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (period === 'now') return;

    let alive = true;
    setStats(null);

    fetch(`${CFG.api}/server/top?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setStats(j); })
      .catch(() => { if (alive) setStats(null); });

    return () => { alive = false; };
  }, [period]);

  useEffect(() => {
    let alive = true;

    const load = () =>
      fetch(`${CFG.api}/server/history?hours=24`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (alive) setHistory(j?.points ?? null); })
        .catch(() => { if (alive) setHistory(null); });

    load();
    const tick = setInterval(load, 300000);

    return () => { alive = false; clearInterval(tick); };
  }, []);

  useEffect(() => {
    const on = () => setStuck(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(connectCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t.hero.copyPrompt, connectCmd);
    }
  };

  const online = server?.players ?? null;
  const slots = server?.maxPlayers ?? CFG.maxPlayers;
  const live = typeof online === 'number';

  const rows = period === 'now' ? top : stats?.rows ?? null;

  const empty = (() => {
    if (period === 'now') return top ? t.top.emptyNow : t.top.offlineNow;
    if (!stats) return t.top.offlineStats;

    const since = stats.since && new Date(stats.since).toLocaleDateString(t.locale);
    return since ? t.top.sinceKnown(since) : t.top.sinceUnknown;
  })();

  const video = (className) => (
    <video className={className} autoPlay muted loop playsInline poster={heroPoster}
           aria-label={t.heroAlt}>
      <source src={heroVideoWebm} type="video/webm" />
      <source src={heroVideoMp4} type="video/mp4" />
    </video>
  );

  return (
    <>
      {authError && (
        <div className="authbar" role="alert">
          <span>{authError}</span>
          <button onClick={() => setAuthError(null)} aria-label={t.auth.close}>×</button>
        </div>
      )}

      <header className="nav" data-stuck={stuck}>
        <div className="shell nav__in">
          {/* Надпись из шапки убрана по просьбе клиента — знаком проекта здесь
              работает маяк. Само название никуда не делось: оно крупно набрано
              на первом экране и стоит в подвале. Ссылке нужна подпись для
              читалок, раз видимого текста внутри больше нет. */}
          <a className="brand" href="#top-of-page" aria-label="RUSTICS">
            <Beacon />
          </a>
          <nav className="nav__links">
            <a href="#server">{t.nav.server}</a>
            <a href="#top">{t.nav.top}</a>
            <a href="#rules">{t.nav.rules}</a>
            <a href="#help">{t.nav.help}</a>
          </nav>

          <Nets />

          {profile ? (
            <div className="me">
              {profile.avatar
                ? <img className="me__pic" src={profile.avatar} alt="" />
                : <span className="me__pic me__pic--empty" aria-hidden="true" />}
              <span className="me__name" title={profile.name}>{profile.name}</span>
              <button className="me__out" onClick={logout} aria-label={t.auth.signOut} title={t.auth.signOut}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
            </div>
          ) : (
            <a className="steam" href={steamLoginUrl}>
              <svg className="steam__icon" viewBox="0 0 24 24" aria-hidden="true">
                <defs>
                  <linearGradient id="steamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7D4DAA" />
                    <stop offset="55%" stopColor="#CE70B7" />
                    <stop offset="100%" stopColor="#F1A1CB" />
                  </linearGradient>
                </defs>
                <path fill="url(#steamGrad)" d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.524 3.396-3.399 3.396-1.653 0-3.032-1.183-3.335-2.75l-4.66-1.933C1.482 19.756 6.253 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM8.482 18.688l-1.472-.61c.264.552.732.994 1.325 1.229.532.2 1.113.183 1.632-.048.518-.23.918-.65 1.117-1.183.204-.53.19-1.112-.038-1.632-.229-.518-.65-.917-1.182-1.117-.552-.209-1.15-.185-1.669.05l1.523.63-.585 1.418-.65-.267v.002zm11.394-9.777c0-1.663-1.353-3.017-3.017-3.017-1.665 0-3.017 1.354-3.017 3.017 0 1.665 1.352 3.017 3.017 3.017 1.664.001 3.017-1.352 3.017-3.017zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
              </svg>
              {t.auth.signIn}
            </a>
          )}
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
      </header>

      <section className="hero" id="top-of-page">
        <div className="hero__media">
          {narrow ? video('') : <img src={heroWide} alt={t.heroAlt} />}
          <div className="hero__fade" />
        </div>

        <div className="shell">
          <div className="connect">
            <div className="status">
              <span className="status__dot" data-off={!live} />
              <div>
                <div className="status__num">
                  {/* key меняется вместе с цифрой: React пересоздаёт узел,
                      и подсветка играет заново на каждом обновлении онлайна */}
                  <em key={live ? online : 'off'} className="status__v">
                    {live ? online : '—'}
                  </em>
                  <span>/{slots}</span>
                </div>
                <div className="status__cap">
                  {live ? t.hero.online : monitorDown ? t.hero.down : t.hero.connecting}
                </div>
              </div>
            </div>

            <button className="cmd" onClick={copy} title={t.hero.copyHint}>
              <span className="cmd__k">client.connect</span>
              <span className="cmd__v">{CFG.serverIp}:{CFG.serverPort}</span>
            </button>

            <div className="acts">
              <a className="play" href={playUrl} title={t.hero.playHint}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
                {t.hero.play}
              </a>

              <button className="copy" onClick={copy} data-done={copied}>
                {copied ? t.hero.copied : t.hero.copy}
              </button>
            </div>

          </div>
        </div>

        <svg className="pines" viewBox="0 0 1200 46" preserveAspectRatio="none" aria-hidden="true">
          <path className="pines__back" d={PINES_BACK} />
          <path className="pines__front" d={PINES_FRONT} />
        </svg>
      </section>

      <section className="sec" id="server">
        <div className="shell">
          <h2 className="h2">{t.server.title}</h2>
          <p className="lead">{t.server.lead}</p>

          <div className="srv">
            {!narrow && (
              <figure className="srv__card">
                {video('srv__vid')}
                <figcaption className="srv__cap">
                  <b>{CFG.serverName}</b>
                  <span>{t.server.cardWipe}</span>
                </figcaption>
              </figure>
            )}

            <div className="srv__body">
              <div className="rates">
                {t.server.rates.map(([v, k]) => (
                  <div className="rate" key={k} data-reveal>
                    <div className="rate__v">{v}</div>
                    <div className="rate__k">{k}</div>
                  </div>
                ))}
              </div>

              <dl className="wipe">
                {t.server.wipe.map(([term, value]) => (
                  <div className="wipe__row" key={term} data-reveal>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="feats">
            {t.server.features.map(([title, body]) => (
              <div className="feat" key={title} data-reveal>
                <b>{title}</b>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="horizon" />

      <section className="sec" id="top">
        <div className="shell">
          <h2 className="h2">{t.top.title}</h2>
          <p className="lead">{period === 'now' ? t.top.leadNow : t.top.leadPeriod}</p>

          <Spark points={history} t={t} />

          <div className="tabs" role="tablist" aria-label={t.top.periodLabel}>
            {['now', 'month', 'all'].map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={period === id}
                className="tabs__b"
                data-active={period === id}
                onClick={() => setPeriod(id)}
              >
                {t.top.tabs[id]}
              </button>
            ))}
          </div>

          {rows && rows.length ? (
            <div className="tops">
              {[rows.slice(0, 5), rows.slice(5, 10)].map((half, col) =>
                half.length ? (
                  <table className="tbl" key={col} data-reveal>
                    <thead>
                      <tr><th>#</th><th>{t.top.colPlayer}</th><th>{t.top.colTime}</th></tr>
                    </thead>
                    <tbody>
                      {half.map((pl, i) => (
                        <tr key={pl.name + i}>
                          <td className="tbl__rank">{col * 5 + i + 1}</td>
                          <td>{pl.name}</td>
                          <td className="tbl__time">{playtime(pl.value, t)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null
              )}
            </div>
          ) : (
            <div className="stub">{empty}</div>
          )}
        </div>
      </section>

      <hr className="horizon" />

      <section className="sec" id="rules">
        <div className="shell">
          <h2 className="h2">{t.rules.title}</h2>
          <p className="lead">{t.rules.lead}</p>

          <div className="rulebook">
            {t.rules.groups.map((g, i) => (
              <RuleGroup
                key={g.title}
                group={g}
                index={i}
                open={openRules.has(i)}
                onToggle={() => toggleRule(i)}
              />
            ))}
          </div>

          <p className="updated">{t.rules.updated} {t.rules.updatedAt}</p>
        </div>
      </section>

      <hr className="horizon" />

      <section className="sec" id="help">
        <div className="shell">
          <div className="help">
            <div className="help__grid">
              <div>
                <h2 className="h2">{t.help.title}</h2>
                <p className="lead" style={{ marginBottom: 0 }}>{t.help.lead}</p>
                <ul>
                  {t.help.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </div>
              <a className="btn btn--warm" href={CFG.telegram} target="_blank" rel="noreferrer">
                {t.help.button}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="shell socials">
          <a className="social" href={CFG.discord} target="_blank" rel="noreferrer" data-reveal>
            <svg viewBox="0 0 24 24" fill="#8CA0F0" aria-hidden="true">
              <path d={ICON.dc} />
            </svg>
            <div>
              <b>Discord</b>
              <span>{t.socials.discord}</span>
            </div>
          </a>
          <a className="social" href={CFG.telegram} target="_blank" rel="noreferrer" data-reveal>
            <svg viewBox="0 0 24 24" fill="#6FC0E8" aria-hidden="true">
              <path d={ICON.tg} />
            </svg>
            <div>
              <b>Telegram</b>
              <span>{t.socials.telegram}</span>
            </div>
          </a>
        </div>
      </section>

      <footer className="foot">
        <div className="shell foot__cols">
          <div className="foot__brand">
            <img src={wordmark} alt="RUSTICS" />
            <p>{t.foot.about}</p>
            <button className="foot__ip" onClick={copy}>
              {CFG.serverIp}:{CFG.serverPort}
              <span>{copied ? t.foot.copied : t.foot.copy}</span>
            </button>
          </div>

          <div className="foot__col">
            <h4>{t.foot.colServer}</h4>
            <a href="#server">{t.foot.linkAbout}</a>
            <a href="#top">{t.foot.linkTop}</a>
            <a href="#rules">{t.foot.linkRules}</a>
            <a href="#help">{t.foot.linkHelp}</a>
          </div>

          <div className="foot__col">
            <h4>{t.foot.colCommunity}</h4>
            <a href={CFG.discord} target="_blank" rel="noreferrer">Discord</a>
            <a href={CFG.telegram} target="_blank" rel="noreferrer">Telegram</a>
          </div>

          <div className="foot__col">
            <h4>{t.foot.colPlayers}</h4>
            <a href={steamLoginUrl}>{t.foot.linkSteam}</a>
            <a href="https://store.steampowered.com/app/252490/Rust/" target="_blank" rel="noreferrer">
              {t.foot.linkBuy}
            </a>
          </div>
        </div>

        <div className="shell foot__bar">
          <span>© {new Date().getFullYear()} RUSTICS</span>
          <span>{t.foot.wipe}</span>
        </div>
      </footer>
    </>
  );
}