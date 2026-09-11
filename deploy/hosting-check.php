<?php
/**
 * Проверка, потянет ли обычный хостинг бэкенд этого сайта.
 *
 * Залить файл на хостинг, открыть в браузере, посмотреть результат. Ключи и
 * пароли не нужны — проверяется только то, что хостинг разрешает делать.
 *
 * Главный вопрос — третий: исходящий UDP. На нём держатся список игроков и
 * вся накопленная статистика. Всё остальное есть везде, а UDP многие хостинги
 * режут, и узнать это лучше до оплаты, а не после переноса.
 *
 * После проверки файл удалить.
 */

declare(strict_types=1);

const SERVER_HOST  = '195.18.27.169';
const SERVER_QUERY = 35110;          // порт запроса, не игровой

$checks = [];

/* --- 1. Версия PHP --- */
$phpOk = PHP_VERSION_ID >= 80100;
$checks[] = [
    'name' => 'Версия PHP',
    'ok'   => $phpOk,
    'got'  => PHP_VERSION,
    'need' => '8.1 и новее',
    'why'  => 'На более старых частью кода придётся жертвовать.',
];

/* --- 2. Исходящий HTTPS: Steam API --- */
$httpsOk = false;
$httpsGot = 'нет соединения';

if (function_exists('curl_init')) {
    $ch = curl_init('https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    $httpsOk  = $body !== false && $code === 200;
    $httpsGot = $httpsOk ? "Steam ответил $code" : 'Steam недоступен';
} else {
    $httpsGot = 'нет расширения cURL';
}

$checks[] = [
    'name' => 'Исходящий HTTPS',
    'ok'   => $httpsOk,
    'got'  => $httpsGot,
    'need' => 'доступ к api.steampowered.com',
    'why'  => 'Без него не работают вход через Steam и счётчик онлайна.',
];

/* --- 3. Исходящий UDP: запрос к игровому серверу (главная проверка) --- */
$udpOk = false;
$udpGot = 'не проверено';

if (function_exists('stream_socket_client')) {
    $sock = @stream_socket_client(
        'udp://' . SERVER_HOST . ':' . SERVER_QUERY,
        $errno, $errstr, 5
    );

    if ($sock === false) {
        $udpGot = "сокет не открылся: $errstr";
    } else {
        stream_set_timeout($sock, 5);

        // A2S_INFO — самый простой запрос, на который отвечает любой Rust-сервер
        fwrite($sock, "\xFF\xFF\xFF\xFFTSource Engine Query\x00");
        $answer = fread($sock, 4096);

        if ($answer === false || $answer === '') {
            $udpGot = 'ответа нет — похоже, UDP заблокирован';
        } elseif (substr($answer, 0, 4) === "\xFF\xFF\xFF\xFF") {
            $udpOk  = true;
            $kind   = $answer[4];
            $udpGot = $kind === 'A'
                ? 'сервер ответил (челлендж) — UDP проходит'
                : 'сервер ответил — UDP проходит';
        } else {
            $udpGot = 'пришёл непонятный ответ';
        }

        fclose($sock);
    }
} else {
    $udpGot = 'stream_socket_client отключён';
}

$checks[] = [
    'name' => 'Исходящий UDP',
    'ok'   => $udpOk,
    'got'  => $udpGot,
    'need' => 'запрос к ' . SERVER_HOST . ':' . SERVER_QUERY,
    'why'  => 'Без него не будет списка игроков и всей статистики. Это решающая проверка.',
];

/* --- 4. Запись файлов: здесь копится история --- */
$dir     = __DIR__ . '/stats-test';
$writeOk = @mkdir($dir) || is_dir($dir);

if ($writeOk) {
    $probe   = $dir . '/probe.json';
    $writeOk = @file_put_contents($probe, '{"ok":true}') !== false;
    @unlink($probe);
    @rmdir($dir);
}

$checks[] = [
    'name' => 'Запись файлов',
    'ok'   => $writeOk,
    'got'  => $writeOk ? 'папка создаётся и пишется' : 'запись запрещена',
    'need' => 'создание папки рядом со скриптом',
    'why'  => 'В файле хранится накопленная статистика игроков.',
];

$allOk    = array_reduce($checks, static fn($c, $x) => $c && $x['ok'], true);
$criticals = array_filter($checks, static fn($x) => !$x['ok']);

?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Проверка хостинга — RUSTICS</title>
<style>
  body { margin:0; background:#16091F; color:#F4E6F2;
         font:16px/1.6 system-ui,-apple-system,sans-serif; }
  .wrap { max-width:720px; margin:0 auto; padding:48px 20px 80px; }
  h1 { font-size:28px; margin:0 0 8px; }
  .lead { color:#B394C4; margin:0 0 32px; }
  .verdict { padding:18px 22px; border-radius:6px; margin-bottom:32px; font-weight:600; }
  .verdict[data-ok="1"] { background:#12301C; color:#8FE0A6; box-shadow:inset 0 0 0 1px #2C6B41; }
  .verdict[data-ok="0"] { background:#331014; color:#F09A9A; box-shadow:inset 0 0 0 1px #7A2A32; }
  .row { display:grid; grid-template-columns:28px 1fr; gap:14px;
         padding:18px 0; border-bottom:1px solid rgba(206,112,183,.2); }
  .row:last-child { border-bottom:0; }
  .mark { font-size:20px; line-height:1.3; }
  .ok { color:#7BD69B; } .no { color:#F07A7A; }
  b { display:block; font-size:16.5px; }
  .got { color:#F4E6F2; margin:4px 0 0; }
  .why { color:#8B739B; font-size:14.5px; margin:4px 0 0; }
  code { background:#2A1440; padding:2px 6px; border-radius:3px; font-size:.9em; }
  .foot { margin-top:36px; color:#8B739B; font-size:14px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Проверка хостинга</h1>
  <p class="lead">Потянет ли эта площадка бэкенд сайта RUSTICS.</p>

  <div class="verdict" data-ok="<?= $allOk ? '1' : '0' ?>">
    <?php if ($allOk): ?>
      Всё нужное есть — хостинг подходит.
    <?php else: ?>
      Не хватает: <?= htmlspecialchars(implode(', ', array_column($criticals, 'name'))) ?>.
    <?php endif; ?>
  </div>

  <?php foreach ($checks as $c): ?>
    <div class="row">
      <div class="mark <?= $c['ok'] ? 'ok' : 'no' ?>"><?= $c['ok'] ? '✓' : '✕' ?></div>
      <div>
        <b><?= htmlspecialchars($c['name']) ?></b>
        <p class="got"><?= htmlspecialchars($c['got']) ?> <span class="why">— нужно: <?= htmlspecialchars($c['need']) ?></span></p>
        <p class="why"><?= htmlspecialchars($c['why']) ?></p>
      </div>
    </div>
  <?php endforeach; ?>

  <p class="foot">
    Отдельно спросите поддержку хостинга, можно ли запускать задание по расписанию
    <b style="display:inline">раз в пять минут</b> — им копится статистика.
    После проверки удалите этот файл.
  </p>
</div>
</body>
</html>
