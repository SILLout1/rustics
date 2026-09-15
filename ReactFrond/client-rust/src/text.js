/* ============================================================
   Тексты сайта на двух языках.

   Вынесены из App.jsx целиком: держать две версии каждой фразы прямо в разметке
   нечитаемо, а так переводчику достаточно одного файла и не нужно лезть в код.
   Структура обоих языков одинаковая — если ключ забыть, он просто не отрисуется,
   поэтому при правке меняем оба блока разом.
   ============================================================ */

export const TEXT = {
  ru: {
    locale: 'ru-RU',
    heroAlt: 'RUSTICS — твой уютный сервер Rust',
    pageTitle: 'RUSTICS — ванильный сервер Rust x1 без доната',
    pageDescription: 'Классический Rust x1: сбор и крафт без ускорений, никаких платных привилегий. Вайп карты раз в неделю, 200 слотов, живое сообщество в Discord и Telegram.',

    nav: { server: 'Сервер', top: 'Игроки', rules: 'Правила', help: 'Помощь' },
    auth: {
      signIn: 'Войти',
      signOut: 'Выйти',
      close: 'Закрыть',
      playerFallback: (id) => `Игрок ${id}`,
      generic: 'Не удалось войти через Steam.',
      errors: {
        no_openid_params: 'Steam вернул пустой ответ. Попробуйте войти ещё раз.',
        steam_unavailable: 'Steam сейчас недоступен. Попробуйте через пару минут.',
        invalid_signature: 'Steam не подтвердил вход. Попробуйте ещё раз.',
        bad_claimed_id: 'Steam прислал профиль в незнакомом формате.',
      },
    },

    hero: {
      online: 'сейчас в игре',
      down: 'мониторинг недоступен',
      connecting: 'мониторинг подключается',
      copy: 'Копировать',
      copied: 'Скопировано',
      copyHint: 'Нажмите, чтобы скопировать',
      copyPrompt: 'Скопируйте команду:',
      play: 'Играть',
      playHint: 'Откроет Steam и подключит к серверу',
    },

    server: {
      title: 'Классика X1',
      lead: 'Ванильный сервер без доната и без ограничений на состав команды. Подойдёт и тем, кто первый раз запустил Rust, и тем, кто играет с релиза.',
      cardWipe: 'Вайп каждую субботу · 12:00 МСК',
      rates: [
        ['X1', 'Добыча ресурсов'],
        ['нет', 'Лимита команды'],
        ['200', 'Слотов'],
        ['4000', 'Размер карты'],
        ['/2', 'Содержание шкафа'],
        ['нет', 'Платных привилегий'],
      ],
      wipe: [
        ['Вайп карты', 'Каждую субботу в 12:00 по Москве'],
        ['Вайп чертежей', 'В первый четверг месяца, вместе с общим вайпом Rust'],
        ['Карта', 'Процедурная, размер 4000, новая каждый вайп'],
      ],
      features: [
        ['Рейт X1, без ускорений', 'Добыча идёт ровно так, как задумано разработчиками. Никаких ×5 и мгновенного крафта — ценность каждой найденной бочки на месте.'],
        ['Без доната', 'На сервере нечего купить. Ни китов, ни привилегий, ни приоритета в очереди. Всё решают время и руки.'],
        ['NO LIMIT на состав', 'Ограничения на количество игроков в команде нет. Играйте соло, вдвоём или большим кланом — как захотите.'],
        ['Содержание шкафа в 2 раза меньше', 'Ресурсов на содержание уходит вдвое меньше.'],
        ['Карта 4000', 'Хватает и на соло-домик в лесу, и на клановую крепость. Каждый вайп — свежая процедурная карта.'],
        ['Живая администрация', 'Админы сидят в чате и в Discord. Жалобы разбираем, а не складываем в стол.'],
      ],
    },

    top: {
      title: 'Кто сейчас на сервере',
      lead: 'Живой список: кто в игре прямо сейчас и сколько уже сидит на сервере без выхода. Идёт напрямую с игрового сервера и обновляется сам.',
      count: 'сейчас в игре',
      hr: 'ч',
      min: 'мин',
      emptyNow: 'Сейчас на сервере никого. Загляните позже — или зайдите первым.',
      offlineNow: 'Список игроков сейчас недоступен.',
    },

    rules: {
      title: 'Правила',
      lead: 'Размер команды мы не ограничиваем — состав может быть любым. Всё остальное читается за пару минут, спорные ситуации разбираем в Discord.',
      updated: 'Последнее обновление правил:',
      updatedAt: '3 сентября 2026 года',
      groups: [
        {
          title: 'Общение и репутация',
          items: [
            ['Запрещены оскорбления и негатив в адрес администрации', 'Обсуждение действий администрации в чате сервера не ведём. Вопросы, недовольства и предложения — напрямую администратору сервера.'],
            ['Запрещено оскорблять родственников игроков', 'А также спамить в любом виде.'],
            ['Запрещены буллинг, угрозы и разжигание ненависти', 'Мат сам по себе не караем, а вот целенаправленную токсичность и агрессию в адрес других игроков — да.'],
            ['Запрещены межнациональная рознь и политические споры', null],
            ['Запрещено раскрытие личных данных игроков', 'Публикация личности, доксинг и подобное.'],
          ],
        },
        {
          title: 'Игровой процесс',
          items: [
            ['Запрещены читы, баги и стороннее ПО', 'Любые способы получить внутриигровое преимущество нечестным путём.'],
            ['Запрещена помощь читерам и багоюзерам', 'В том числе совместная игра с ними и с игроками, обошедшими бан.'],
            ['Твинк-аккаунты запрещены', null],
          ],
        },
        {
          title: 'Реклама и репутация проекта',
          items: [
            ['Запрещена реклама других проектов', 'В любом виде.'],
            ['Запрещена дискредитация проекта', 'Если есть вопросы, недовольства или предложения — пишите напрямую администратору сервера.'],
          ],
        },
        {
          title: 'Администрация и модерация',
          items: [
            ['Администрация не вмешивается в игровой процесс', 'Кроме случаев, которые, на её взгляд, требуют вмешательства.'],
            ['Систематическое подавление активности большинства игроков наказывается', 'Если это нарушает баланс игрового процесса — вплоть до блокировки аккаунта. Сервер рассчитан на новичков, и администрация вправе забанить игрока, чей игровой опыт этот баланс нарушает.'],
            ['Запрещено выдавать себя за администрацию', 'В том числе использовать ники админов.'],
            ['Заявления об особых связях с администрацией — нарушение', 'Любые намёки на особый статус благодаря личным связям с админами.'],
            ['Бан по VAC или блокировкам на других проектах', 'Администрация вправе забанить игрока при наличии VAC-бана или игровых блокировок на аккаунте, независимо от срока давности. Бан на других проектах также может стать причиной бана у нас.'],
            ['Администрация не отвечает за утерю ценностей из-за багов', 'Или нестабильной работы игры и сервера.'],
            ['Блокировка не подлежит оспариванию или обсуждению', 'Наказание — на усмотрение администратора.'],
          ],
        },
      ],
    },

    help: {
      title: 'Помочь серверу',
      lead: 'Сервер живёт на аренде железа и не продаёт преимущества. Поддержка — дело добровольное и ничего не даёт в игре, кроме нашей благодарности.',
      points: [
        'Деньги идут на аренду сервера и защиту от DDoS',
        'Никаких китов, привилегий и приоритета в очереди',
        'Отчёт по сборам публикуем в Telegram раз в месяц',
      ],
      button: 'Поддержать сервер',
    },

    socials: {
      discord: 'Разбор жалоб, поиск тиммейтов, анонсы вайпов',
      telegram: 'Новости, статус сервера и отчёты по сборам',
    },

    foot: {
      about: 'Твой уютный сервер Rust. Ваниль X1, без доната, без лимита команды.',
      copy: 'копировать',
      copied: 'скопировано',
      colServer: 'Сервер',
      linkAbout: 'О сервере',
      linkTop: 'Игроки',
      linkRules: 'Правила',
      linkHelp: 'Помочь серверу',
      colCommunity: 'Сообщество',
      colPlayers: 'Игрокам',
      linkSteam: 'Вход через Steam',
      linkBuy: 'Купить Rust',
      wipe: 'Вайп каждую субботу в 12:00 МСК',
    },
  },

  en: {
    locale: 'en-GB',
    heroAlt: 'RUSTICS — your cosy Rust server',
    pageTitle: 'RUSTICS — vanilla Rust x1 server, nothing to buy',
    pageDescription: 'Classic Rust x1: gathering and crafting at stock rates, no paid perks. Weekly map wipe, 200 slots, an active community on Discord and Telegram.',

    nav: { server: 'Server', top: 'Players', rules: 'Rules', help: 'Support' },
    auth: {
      signIn: 'Sign in',
      signOut: 'Sign out',
      close: 'Close',
      playerFallback: (id) => `Player ${id}`,
      generic: 'Could not sign in through Steam.',
      errors: {
        no_openid_params: 'Steam returned an empty response. Please try signing in again.',
        steam_unavailable: 'Steam is unavailable right now. Try again in a couple of minutes.',
        invalid_signature: 'Steam did not confirm the sign-in. Please try again.',
        bad_claimed_id: 'Steam returned a profile in an unfamiliar format.',
      },
    },

    hero: {
      online: 'players online',
      down: 'monitoring unavailable',
      connecting: 'connecting to monitoring',
      copy: 'Copy',
      copied: 'Copied',
      copyHint: 'Click to copy',
      copyPrompt: 'Copy the command:',
      play: 'Play',
      playHint: 'Opens Steam and connects you to the server',
    },

    server: {
      title: 'Classic X1',
      lead: 'A vanilla server with nothing to buy and no cap on team size. It suits both first-time players and people who have been here since release.',
      cardWipe: 'Wipe every Saturday · 12:00 MSK',
      rates: [
        ['X1', 'Gather rate'],
        ['none', 'Team limit'],
        ['200', 'Slots'],
        ['4000', 'Map size'],
        ['/2', 'Upkeep cost'],
        ['none', 'Paid perks'],
      ],
      wipe: [
        ['Map wipe', 'Every Saturday at 12:00 Moscow time'],
        ['Blueprint wipe', 'First Thursday of the month, with the global Rust wipe'],
        ['Map', 'Procedural, size 4000, new every wipe'],
      ],
      features: [
        ['X1 rate, no boosts', 'Gathering works exactly as the developers intended. No ×5, no instant craft — every barrel you find still counts for something.'],
        ['Nothing to buy', 'There is no shop. No kits, no perks, no queue priority. Time and your own hands decide everything.'],
        ['No team limit', 'There is no cap on how many people play together. Go solo, duo or bring a whole clan — your call.'],
        ['Upkeep cut in half', 'Maintaining your base costs half the usual resources.'],
        ['Map size 4000', 'Room for a solo hut in the woods and for a clan fortress alike. Every wipe brings a fresh procedural map.'],
        ['Admins who show up', 'Admins sit in chat and on Discord. Reports get handled, not filed away.'],
      ],
    },

    top: {
      title: 'Who is on the server',
      lead: 'A live list: who is in the game right now and how long they have been on without leaving. It comes straight from the game server and refreshes itself.',
      count: 'players online',
      hr: 'h',
      min: 'min',
      emptyNow: 'Nobody is on the server right now. Check back later — or be the first one in.',
      offlineNow: 'The player list is unavailable right now.',
    },

    rules: {
      title: 'Rules',
      lead: 'We do not limit team size — bring whoever you like. Everything else takes a couple of minutes to read, and disputes are settled on Discord.',
      updated: 'Rules last updated:',
      updatedAt: '3 September 2026',
      groups: [
        {
          title: 'Conduct and reputation',
          items: [
            ['No insults or hostility toward the admins', 'Admin decisions are not up for discussion in server chat. Questions, complaints and suggestions go straight to the server admin.'],
            ['No insulting a player’s family', 'Spam of any kind is out too.'],
            ['No bullying, threats or incitement of hatred', 'Swearing on its own is not punished. Targeted toxicity and aggression toward other players is.'],
            ['No ethnic hatred or political arguments', null],
            ['No sharing of other players’ personal data', 'Exposing identities, doxxing and anything similar.'],
          ],
        },
        {
          title: 'Gameplay',
          items: [
            ['No cheats, exploits or third-party software', 'Any way of gaining an in-game advantage unfairly.'],
            ['No helping cheaters or exploiters', 'That includes playing alongside them, or alongside anyone who has evaded a ban.'],
            ['Alt accounts are not allowed', null],
          ],
        },
        {
          title: 'Advertising and the project',
          items: [
            ['No advertising other projects', 'In any form.'],
            ['No smearing the project', 'If you have questions, complaints or suggestions, message the server admin directly.'],
          ],
        },
        {
          title: 'Admins and moderation',
          items: [
            ['Admins do not interfere with gameplay', 'Except in cases that, in their judgement, call for it.'],
            ['Systematically shutting down the rest of the server is punishable', 'If it breaks the balance of the game, up to and including an account ban. This server is built for newcomers, and admins may ban a player whose skill breaks that balance.'],
            ['No impersonating an admin', 'Including the use of admin nicknames.'],
            ['Claiming special ties to the admins is a violation', 'Any hint of privileged status through personal connections with admins.'],
            ['Bans for VAC or for bans on other projects', 'Admins may ban an account carrying a VAC ban or game bans, no matter how old. A ban on another project can also be grounds for a ban here.'],
            ['Admins are not liable for items lost to bugs', 'Or to unstable behaviour of the game and the server.'],
            ['Bans are not open to appeal or debate', 'The penalty is at the admin’s discretion.'],
          ],
        },
      ],
    },

    help: {
      title: 'Support the server',
      lead: 'The server runs on rented hardware and does not sell advantages. Supporting it is voluntary and gives you nothing in game beyond our thanks.',
      points: [
        'Money goes to server rent and DDoS protection',
        'No kits, no perks, no queue priority',
        'We publish a funding report on Telegram once a month',
      ],
      button: 'Support the server',
    },

    socials: {
      discord: 'Reports, finding teammates, wipe announcements',
      telegram: 'News, server status and funding reports',
    },

    foot: {
      about: 'Your cosy Rust server. Vanilla X1, nothing to buy, no team limit.',
      copy: 'copy',
      copied: 'copied',
      colServer: 'Server',
      linkAbout: 'About the server',
      linkTop: 'Players',
      linkRules: 'Rules',
      linkHelp: 'Support the server',
      colCommunity: 'Community',
      colPlayers: 'For players',
      linkSteam: 'Sign in with Steam',
      linkBuy: 'Buy Rust',
      wipe: 'Wipe every Saturday at 12:00 MSK',
    },
  },
};
