using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace api;

/// <summary>
/// Своя история сервера: сколько кто наиграл и как менялась численность.
///
/// Сервер отдаёт только текущий срез — кто сейчас в игре и сколько длится сессия.
/// Всё остальное, что показывает BattleMetrics, он не берёт откуда-то ещё: он
/// годами опрашивает сервер и складывает замеры у себя. Здесь то же самое, только
/// история своя и начинается с момента запуска — задним числом её взять негде.
///
/// Время считаем не по полю сессии, а по самому факту присутствия: игрок был в
/// списке — значит наиграл интервал между опросами. Так переподключения и странные
/// значения сессии не искажают итог.
///
/// Хранилище — обычный JSON-файл: для лендинга с парой сотен игроков база избыточна,
/// а файл переживает перезапуск и не тянет за собой ни зависимостей, ни настройки.
/// </summary>
public class ServerStats
{
    private const int KeepHistoryDays = 14;

    /// <summary>Ключ, под который сворачивается всё, что старше срока хранения по дням.</summary>
    private const string RolledUp = "before";

    /// <summary>
    /// Промежуток, больше которого считаем, что был простой, и время не начисляем.
    /// Настраивается, потому что зависит от того, кто зовёт замер: своя служба
    /// ходит ровно раз в пять минут, а внешний планировщик вроде GitHub Actions
    /// обещает интервал лишь приблизительно и под нагрузкой опаздывает. С жёсткими
    /// 15 минутами часть его замеров молча не засчитывалась бы.
    /// </summary>
    private static int MaxPollGapMinutes =>
        int.TryParse(Environment.GetEnvironmentVariable("STATS_MAX_GAP_MINUTES"), out var m) && m > 0
            ? m
            : 15;

    /// <summary>
    /// Потолок на время, которое засчитываем игроку при первой встрече.
    /// Сервер сообщает длительность его текущей сессии — обычно это часы, но
    /// если он вернёт мусор, одно число не должно перекосить всю таблицу.
    /// </summary>
    private const double FirstSightCapMinutes = 72 * 60;

    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static readonly JsonSerializerOptions Pretty = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly ILogger<ServerStats> _log;

    public ServerStats(ILogger<ServerStats> log) => _log = log;

    /* ------------------------------ модель ------------------------------ */

    private sealed class Store
    {
        /// <summary>Игрок -> день (yyyy-MM-dd) -> минуты. По дням, чтобы считать любой период.</summary>
        public Dictionary<string, Dictionary<string, double>> Players { get; set; } = new();

        /// <summary>Замеры численности для графика.</summary>
        public List<Sample> History { get; set; } = new();

        public DateTimeOffset? LastPoll { get; set; }
        public DateTimeOffset? Since { get; set; }
    }

    private sealed class Sample
    {
        public DateTimeOffset At { get; set; }
        public int Players { get; set; }
    }

    /* ------------------------------ опрос ------------------------------ */

    /// <summary>
    /// Один замер. Зовёт его фоновая служба StatsPoller.
    ///
    /// Здесь был ещё и таймер функций, но его пришлось убрать: он требует учётки
    /// хранилища, а без неё хост не просто ругается в лог — он переходит в
    /// состояние Unhealthy и перестаёт отвечать на запросы вообще. Терять весь
    /// API ради дублирующего способа опроса не стоит.
    /// </summary>
    public static async Task PollOnce(ILogger log)
    {
        var (host, port) = A2S.Address();
        if (host is null || port == 0)
        {
            log.LogError("SERVER_HOST или SERVER_QUERY_PORT не заданы — историю копить не из чего");
            return;
        }

        List<A2S.Player> online;
        try
        {
            online = await A2S.Players(host, port, TimeSpan.FromSeconds(6));
        }
        catch (Exception e)
        {
            log.LogWarning(e, "Сервер не ответил на опрос, замер пропущен");
            return;
        }

        await Gate.WaitAsync();
        try
        {
            var store = Load(log);
            var now = DateTimeOffset.UtcNow;
            store.Since ??= now;

            // Начисляем ровно столько, сколько прошло с прошлого опроса. Если хост
            // стоял, интервал огромный — такое не начисляем, иначе простой службы
            // превратился бы в часы игры у всех, кто попал в первый же замер.
            var gap = store.LastPoll is null ? 0 : (now - store.LastPoll.Value).TotalMinutes;
            var credit = gap > 0 && gap <= MaxPollGapMinutes ? gap : 0;

            var day = now.UtcDateTime.ToString("yyyy-MM-dd");

            foreach (var p in online)
            {
                if (!store.Players.TryGetValue(p.Name, out var days))
                {
                    // Игрока видим впервые. Сервер сам сообщает, сколько он уже
                    // сидит в этой сессии — это настоящее время на сервере, а не
                    // догадка, и терять его незачем. Без этого «за всё время»
                    // пустовало до второго замера, а у тех, кто был онлайн в
                    // момент запуска, пропадали часы.
                    store.Players[p.Name] = days = new Dictionary<string, double>();

                    var session = Math.Clamp(p.Seconds / 60.0, 0, FirstSightCapMinutes);
                    if (session > 0) days[day] = session;

                    // Интервал ему не начисляем: он уже внутри засчитанной сессии
                    continue;
                }

                // Знакомого игрока считаем по времени между замерами
                if (credit > 0)
                    days[day] = days.TryGetValue(day, out var had) ? had + credit : credit;
            }

            store.History.Add(new Sample { At = now, Players = online.Count });
            store.LastPoll = now;

            Trim(store, now);
            Save(store, log);

            log.LogInformation("Замер: {N} игроков, начислено {Credit:0.#} мин каждому",
                online.Count, credit);
        }
        finally
        {
            Gate.Release();
        }
    }

    /* ------------------------------ выдача ------------------------------ */

    /// <summary>
    /// Топ по накопленному времени. period=month — за 30 дней, всё остальное —
    /// за всё время наблюдения. Пока история пуста, честно отвечаем, что пуста:
    /// подменять её текущими сессиями нельзя, это разные величины.
    /// </summary>
    [Function("StatsTop")]
    public async Task<HttpResponseData> Top(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "server/top")]
        HttpRequestData req)
    {
        var query = System.Web.HttpUtility.ParseQueryString(req.Url.Query);
        var month = string.Equals(query["period"], "month", StringComparison.OrdinalIgnoreCase);

        await Gate.WaitAsync();
        Store store;
        try { store = Load(_log); }
        finally { Gate.Release(); }

        var from = DateTimeOffset.UtcNow.AddDays(-30).UtcDateTime.ToString("yyyy-MM-dd");

        var rows = store.Players
            .Select(p => new
            {
                name = p.Key,
                // За месяц берём только дневные записи в окне. Свёрнутый остаток
                // старых дней в месяц попасть не должен — он там не весь.
                value = (int)Math.Round(month
                    ? p.Value.Where(d => d.Key != RolledUp
                                      && string.CompareOrdinal(d.Key, from) >= 0)
                             .Sum(d => d.Value)
                    : p.Value.Sum(d => d.Value)),
            })
            .Where(r => r.value > 0)
            .OrderByDescending(r => r.value)
            .Take(10)
            .ToList();

        return await Json(req, new
        {
            period = month ? "month" : "all",
            since = store.Since,
            rows,
        });
    }

    /// <summary>Численность во времени — для графика. По умолчанию сутки.</summary>
    [Function("StatsHistory")]
    public async Task<HttpResponseData> History(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "server/history")]
        HttpRequestData req)
    {
        var query = System.Web.HttpUtility.ParseQueryString(req.Url.Query);
        if (!int.TryParse(query["hours"], out var hours) || hours <= 0) hours = 24;

        var edge = DateTimeOffset.UtcNow.AddHours(-Math.Min(hours, KeepHistoryDays * 24));

        await Gate.WaitAsync();
        Store store;
        try { store = Load(_log); }
        finally { Gate.Release(); }

        var points = store.History
            .Where(s => s.At >= edge)
            .Select(s => new { at = s.At, players = s.Players })
            .ToList();

        return await Json(req, new { hours, points });
    }

    /* ------------------------------ хранилище ------------------------------ */

    /// <summary>
    /// Куда класть файл. На Azure у приложения есть постоянная папка HOME —
    /// она переживает перезапуски; локально пишем рядом с проектом.
    /// </summary>
    private static string Path()
    {
        var custom = Environment.GetEnvironmentVariable("STATS_PATH");
        if (!string.IsNullOrWhiteSpace(custom)) return custom;

        // На Azure у приложения есть постоянная папка HOME — там и храним.
        // Локально на неё полагаться нельзя: PowerShell такую переменную не ставит
        // вовсе, а Git Bash ставит posix-путь. Из-за этого место хранения зависело
        // бы от того, чем запущен хост.
        //
        // И ни в коем случае не рядом с бинарником: bin/output стирается при каждой
        // пересборке, а с ним ушла бы вся накопленная история. Локально кладём в
        // пользовательские данные — они переживают и сборку, и переустановку проекта.
        var home = Environment.GetEnvironmentVariable("HOME");
        var onAzure = !string.IsNullOrWhiteSpace(home)
                      && System.IO.Path.IsPathFullyQualified(home);

        var dir = onAzure
            ? System.IO.Path.Combine(home!, "data", "rustics")
            : System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "rustics");

        Directory.CreateDirectory(dir);
        return System.IO.Path.Combine(dir, "stats.json");
    }

    private static Store Load(ILogger log)
    {
        var file = Path();
        if (!File.Exists(file)) return new Store();

        try
        {
            return JsonSerializer.Deserialize<Store>(File.ReadAllText(file)) ?? new Store();
        }
        catch (Exception e)
        {
            // Битый файл не должен ронять сайт: начинаем заново, но громко
            log.LogError(e, "Файл статистики не читается, история начинается заново: {File}", file);
            return new Store();
        }
    }

    private static void Save(Store store, ILogger log)
    {
        var file = Path();
        try
        {
            // Пишем через временный файл: обрыв на середине не оставит огрызок
            var tmp = file + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(store, Pretty));
            File.Move(tmp, file, overwrite: true);
        }
        catch (Exception e)
        {
            log.LogError(e, "Не удалось сохранить статистику в {File}", file);
        }
    }

    /// <summary>Чистим старое, иначе файл растёт без предела.</summary>
    private static void Trim(Store store, DateTimeOffset now)
    {
        var edge = now.AddDays(-KeepHistoryDays);
        store.History.RemoveAll(s => s.At < edge);

        var oldest = now.AddDays(-KeepHistoryDays).UtcDateTime.ToString("yyyy-MM-dd");

        foreach (var player in store.Players.Keys.ToList())
        {
            var days = store.Players[player];

            // Дни старше срока храним свёрнутыми в одну запись: общий налёт за всё
            // время терять нельзя, а держать его по дням вечно — незачем
            var stale = days.Keys.Where(d => d != RolledUp && string.CompareOrdinal(d, oldest) < 0).ToList();
            if (stale.Count == 0) continue;

            var sum = stale.Sum(d => days[d]);
            foreach (var d in stale) days.Remove(d);

            days[RolledUp] = days.TryGetValue(RolledUp, out var had) ? had + sum : sum;
        }
    }

    private static async Task<HttpResponseData> Json(HttpRequestData req, object body)
    {
        var res = req.CreateResponse(HttpStatusCode.OK);
        res.Headers.Add("Content-Type", "application/json; charset=utf-8");
        res.Headers.Add("Access-Control-Allow-Origin", "*");
        res.Headers.Add("Cache-Control", "public, max-age=60");
        await res.WriteStringAsync(JsonSerializer.Serialize(body));
        return res;
    }
}
