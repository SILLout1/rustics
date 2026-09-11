using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace api;

/// <summary>
/// Данные с BattleMetrics. Запрос идёт с сервера, а не из браузера: BattleMetrics
/// режет прямые запросы с фронта (CORS), а перед сайтом стоит Cloudflare — поэтому
/// запрос обязан выглядеть как обычный браузерный.
///
/// Порядок повторяет живой браузер: сперва открываем страницу сервера — на ней
/// BattleMetrics ставит cookie, — и только потом идём в API. Анонимный запрос без
/// cookie получает 403 «нужна подписка», хотя та же страница в браузере открывается
/// и таблицу показывает. Если API всё равно не пустит, таблицу разбираем из самого
/// HTML: страницу мы к тому моменту уже держим в руках.
///
/// Доступ зависит от адреса, с которого идёт запрос: с домашнего интернета страница
/// открывается, с датацентра Cloudflare отвечает 403. Поэтому есть отчёт /bm/diag.
/// </summary>
public class BmProxy
{
    private const string Site = "https://www.battlemetrics.com";

    private static readonly CookieContainer Jar = new();
    private static readonly HttpClient Http = CreateClient();

    // Страницу дёргаем не чаще раза в 10 минут: она тяжёлая, а cookie живут дольше
    private static readonly TimeSpan SessionTtl = TimeSpan.FromMinutes(10);

    // А после отказа выжидаем: BattleMetrics может блокировать нас по адресу, и
    // тогда каждый заход на сайт долбился бы в закрытую дверь. Именно из-за этого
    // запросы копились и вешали весь хост.
    private static readonly TimeSpan RetryAfterFail = TimeSpan.FromMinutes(2);
    private static readonly SemaphoreSlim Gate = new(1, 1);

    private static DateTimeOffset _sessionUntil;
    private static string _page = "";
    private static int _pageStatus;

    private readonly ILogger<BmProxy> _log;

    public BmProxy(ILogger<BmProxy> log) => _log = log;

    private static HttpClient CreateClient()
    {
        var handler = new HttpClientHandler
        {
            AutomaticDecompression = DecompressionMethods.GZip
                                   | DecompressionMethods.Deflate
                                   | DecompressionMethods.Brotli,
            CookieContainer = Jar,
            UseCookies = true,
        };

        // BattleMetrics закрывает доступ по адресу: с одних сетей страница отдаётся,
        // с других Cloudflare отвечает «you have been blocked». Если у вас есть сеть,
        // из которой сайт открывается, пропишите её прокси в BM_PROXY — например
        // "http://127.0.0.1:8080" или "socks5://127.0.0.1:1080" — и запросы пойдут
        // через неё. Пусто — идём напрямую.
        var proxy = Environment.GetEnvironmentVariable("BM_PROXY");
        if (!string.IsNullOrWhiteSpace(proxy))
        {
            handler.Proxy = new WebProxy(proxy);
            handler.UseProxy = true;
        }

        var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(8) };
        var h = http.DefaultRequestHeaders;

        h.Add("User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
        h.Add("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7");
        h.Add("sec-ch-ua", "\"Chromium\";v=\"126\", \"Not.A/Brand\";v=\"24\"");
        h.Add("sec-ch-ua-mobile", "?0");
        h.Add("sec-ch-ua-platform", "\"Windows\"");

        // Если появится платный токен — положи его в BM_API_TOKEN, код подхватит сам
        var token = Environment.GetEnvironmentVariable("BM_API_TOKEN");
        if (!string.IsNullOrWhiteSpace(token))
            h.Add("Authorization", $"Bearer {token}");

        return http;
    }

    /// <summary>Онлайн и общая информация о сервере.</summary>
    [Function("BmServer")]
    public async Task<HttpResponseData> Server(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "bm/server/{id}")]
        HttpRequestData req, string id)
    {
        await OpenPage(id);

        var (ok, raw, status) = await Api($"https://api.battlemetrics.com/servers/{id}", id);
        if (!ok) return await Fail(req, status, raw);

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var attr = doc.RootElement.GetProperty("data").GetProperty("attributes");

            return await Json(req, new
            {
                players = attr.TryGetProperty("players", out var p) ? p.GetInt32() : 0,
                maxPlayers = attr.TryGetProperty("maxPlayers", out var mp) ? mp.GetInt32() : 0,
                status = attr.TryGetProperty("status", out var s) ? s.GetString() : null,
                name = attr.TryGetProperty("name", out var n) ? n.GetString() : null,
            });
        }
        catch (Exception e)
        {
            return await Fail(req, "parse_error", e.Message);
        }
    }

    /// <summary>Топ игроков по времени на сервере.</summary>
    [Function("BmTop")]
    public async Task<HttpResponseData> Top(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "bm/top/{id}")]
        HttpRequestData req, string id)
    {
        await OpenPage(id);

        var url = $"https://api.battlemetrics.com/servers/{id}"
                + "/relationships/leaderboards/time?filter[period]=AT&page[size]=10";

        var (ok, raw, status) = await Api(url, id);

        if (ok)
        {
            var rows = FromApi(raw);
            if (rows is not null)
            {
                _log.LogInformation("Топ получен из API BattleMetrics, строк: {N}", rows.Count);
                return await Json(req, rows);
            }
        }

        // API не пустил — таблица может лежать прямо в разметке страницы
        var fromPage = FromPage(_page);
        if (fromPage is not null)
        {
            _log.LogInformation("Топ собран из HTML страницы, строк: {N} (API ответил {Status})",
                fromPage.Count, status);
            return await Json(req, fromPage);
        }

        _log.LogWarning("Топ не собрался: API {Status}, страница {PageStatus}, {Bytes} байт",
            status, _pageStatus, _page.Length);

        return await Fail(req, status, raw);
    }

    /// <summary>
    /// Отчёт о том, что именно происходит на пути к BattleMetrics: пустил ли
    /// Cloudflare, поставились ли cookie, что ответил API, нашлась ли таблица
    /// в разметке. Открыть с той машины, где сайт работает, и посмотреть, где рвётся.
    /// </summary>
    [Function("BmDiag")]
    public async Task<HttpResponseData> Diag(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "bm/diag/{id}")]
        HttpRequestData req, string id)
    {
        _sessionUntil = DateTimeOffset.MinValue;   // это диагностика, пауза тут не нужна
        await OpenPage(id);

        var url = $"https://api.battlemetrics.com/servers/{id}"
                + "/relationships/leaderboards/time?filter[period]=AT&page[size]=10";
        var (ok, raw, status) = await Api(url, id);

        return await Json(req, new
        {
            page = new
            {
                status = _pageStatus,
                bytes = _page.Length,
                blockedByCloudflare = _page.Contains("Attention Required") || _page.Contains("cf-error"),
                cookies = Jar.GetCookies(new Uri(Site)).Select(c => c.Name).ToArray(),
                mentionsLeaderboard = Count(_page, "leaderboard"),
                hasInitialState = _page.Contains("__INITIAL_STATE__"),
                rowsParsed = FromPage(_page)?.Count ?? 0,
            },
            api = new
            {
                ok,
                status,
                rowsParsed = ok ? FromApi(raw)?.Count ?? 0 : 0,
                snippet = raw.Length > 400 ? raw[..400] : raw,
            },
            hasToken = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("BM_API_TOKEN")),
            proxy = Environment.GetEnvironmentVariable("BM_PROXY") ?? "(нет, идём напрямую)",
        });
    }

    /// <summary>
    /// Открывает страницу сервера, как это делает браузер: за cookie и на случай,
    /// что таблица уже лежит в самом HTML.
    /// </summary>
    private async Task<bool> OpenPage(string id)
    {
        if (DateTimeOffset.UtcNow < _sessionUntil) return _pageStatus == 200;

        // Ждём очередь недолго: если страницу уже тянет соседний запрос, лучше
        // ответить тем, что есть, чем копить висящие вызовы.
        if (!await Gate.WaitAsync(TimeSpan.FromSeconds(2))) return _pageStatus == 200;

        try
        {
            if (DateTimeOffset.UtcNow < _sessionUntil) return _pageStatus == 200;

            var msg = new HttpRequestMessage(HttpMethod.Get, $"{Site}/servers/rust/{id}");
            msg.Headers.TryAddWithoutValidation("Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
            msg.Headers.TryAddWithoutValidation("Upgrade-Insecure-Requests", "1");
            msg.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "document");
            msg.Headers.TryAddWithoutValidation("Sec-Fetch-Mode", "navigate");
            msg.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "none");
            msg.Headers.TryAddWithoutValidation("Sec-Fetch-User", "?1");

            using var resp = await Http.SendAsync(msg);
            _pageStatus = (int)resp.StatusCode;
            _page = await resp.Content.ReadAsStringAsync();

            if (_pageStatus == 200)
            {
                _sessionUntil = DateTimeOffset.UtcNow.Add(SessionTtl);
                return true;
            }

            _sessionUntil = DateTimeOffset.UtcNow.Add(RetryAfterFail);
            _log.LogWarning("Страница BattleMetrics ответила {Status}. Обычно это значит, "
                + "что Cloudflare не пускает адрес, с которого работает функция. "
                + "Следующая попытка через {Pause} мин.", _pageStatus, RetryAfterFail.TotalMinutes);
            return false;
        }
        catch (Exception e)
        {
            _log.LogWarning(e, "Не удалось открыть страницу BattleMetrics");
            _pageStatus = 0;
            _page = "";
            _sessionUntil = DateTimeOffset.UtcNow.Add(RetryAfterFail);
            return false;
        }
        finally
        {
            Gate.Release();
        }
    }

    /// <summary>Запрос к API с теми же cookie и заголовками, что и у страницы.</summary>
    private async Task<(bool ok, string body, string status)> Api(string url, string id)
    {
        try
        {
            var msg = new HttpRequestMessage(HttpMethod.Get, url);
            msg.Headers.TryAddWithoutValidation("Accept", "application/json, text/plain, */*");
            msg.Headers.TryAddWithoutValidation("Referer", $"{Site}/servers/rust/{id}");
            msg.Headers.TryAddWithoutValidation("Origin", Site);
            msg.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "empty");
            msg.Headers.TryAddWithoutValidation("Sec-Fetch-Mode", "cors");
            msg.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "same-site");

            using var resp = await Http.SendAsync(msg);
            var body = await resp.Content.ReadAsStringAsync();
            return (resp.IsSuccessStatusCode, body, ((int)resp.StatusCode).ToString());
        }
        catch (Exception e)
        {
            return (false, e.Message, "request_failed");
        }
    }

    /// <summary>Таблица из ответа API — формат JSON:API.</summary>
    private static List<object>? FromApi(string raw)
    {
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (!doc.RootElement.TryGetProperty("data", out var data)) return null;

            var rows = new List<object>();
            foreach (var item in data.EnumerateArray())
            {
                if (!item.TryGetProperty("attributes", out var a)) continue;

                rows.Add(new
                {
                    name = a.TryGetProperty("name", out var n) ? n.GetString() ?? "—" : "—",
                    value = (int)Math.Round((a.TryGetProperty("value", out var v) ? v.GetDouble() : 0) / 60),
                });
            }

            return rows.Count > 0 ? rows : null;
        }
        catch (Exception)
        {
            return null;
        }
    }

    /// <summary>
    /// Таблица из HTML. BattleMetrics раскладывает данные тем же форматом JSON:API,
    /// что и своё API, поэтому ищем знакомые записи прямо в разметке: вокруг каждого
    /// упоминания leaderboardPlayer берём окно и достаём из него имя и время.
    /// </summary>
    private static List<object>? FromPage(string html)
    {
        if (string.IsNullOrEmpty(html)) return null;

        var rows = new List<object>();
        var seen = new HashSet<string>();

        foreach (Match hit in Marker.Matches(html))
        {
            var from = Math.Max(0, hit.Index - 400);
            var len = Math.Min(800, html.Length - from);
            var window = html.Substring(from, len);

            var name = Field.Match(window);
            var value = Value.Match(window);
            if (!name.Success || !value.Success) continue;

            if (!double.TryParse(value.Groups[1].Value, NumberStyles.Float,
                    CultureInfo.InvariantCulture, out var seconds)) continue;

            var who = Unescape(name.Groups[1].Value);
            if (!seen.Add(who)) continue;

            rows.Add(new { name = who, value = (int)Math.Round(seconds / 60) });
        }

        return rows.Count > 0 ? rows : null;
    }

    private static readonly Regex Marker = new("leaderboardPlayer", RegexOptions.Compiled);
    private static readonly Regex Field = new(@"""name""\s*:\s*""((?:[^""\\]|\\.)*)""", RegexOptions.Compiled);
    private static readonly Regex Value = new(@"""value""\s*:\s*([0-9]+(?:\.[0-9]+)?)", RegexOptions.Compiled);

    private static string Unescape(string s)
    {
        try { return JsonSerializer.Deserialize<string>($"\"{s}\"") ?? s; }
        catch (Exception) { return s; }
    }

    private static int Count(string haystack, string needle)
    {
        var n = 0;
        var at = 0;
        while ((at = haystack.IndexOf(needle, at, StringComparison.OrdinalIgnoreCase)) >= 0)
        {
            n++;
            at += needle.Length;
        }
        return n;
    }

    private static async Task<HttpResponseData> Json(HttpRequestData req, object body)
    {
        var res = req.CreateResponse(HttpStatusCode.OK);
        res.Headers.Add("Content-Type", "application/json; charset=utf-8");
        res.Headers.Add("Access-Control-Allow-Origin", "*");
        await res.WriteStringAsync(JsonSerializer.Serialize(body));
        return res;
    }

    private static async Task<HttpResponseData> Fail(HttpRequestData req, string status, string body)
    {
        var res = req.CreateResponse(HttpStatusCode.BadGateway);
        res.Headers.Add("Content-Type", "application/json; charset=utf-8");
        res.Headers.Add("Access-Control-Allow-Origin", "*");

        // Тело обрезаем: Cloudflare на 403 присылает целую HTML-страницу
        var snippet = body.Length > 600 ? body[..600] : body;
        await res.WriteStringAsync(JsonSerializer.Serialize(new { status, body = snippet }));
        return res;
    }
}
