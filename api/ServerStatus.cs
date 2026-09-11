using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace api;

/// <summary>
/// Онлайн сервера. Берём из мастер-листа Steam, а не из BattleMetrics.
/// BattleMetrics закрыл API подпиской, а страницу сайта держит Cloudflare —
/// но Rust-сервер и так публикует себя в Steam. Источник первичный, бесплатный
/// и тем же ключом, который уже нужен для входа через Steam.
/// </summary>
public class ServerStatus
{
    private const int RustAppId = 252490;

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };

    // Лендингу свежее половины минуты не нужно, а Steam не любит частых запросов.
    // Кэш общий на весь процесс: хоть сто человек на странице — два запроса в минуту.
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static string? _body;
    private static DateTimeOffset _fresh;

    private readonly ILogger<ServerStatus> _log;

    public ServerStatus(ILogger<ServerStatus> log) => _log = log;

    [Function("ServerStatus")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "server/status")]
        HttpRequestData req)
    {
        var (ok, body) = await Current();

        var res = req.CreateResponse(ok ? HttpStatusCode.OK : HttpStatusCode.BadGateway);
        res.Headers.Add("Content-Type", "application/json; charset=utf-8");
        res.Headers.Add("Access-Control-Allow-Origin", "*");
        res.Headers.Add("Cache-Control", "public, max-age=30");
        await res.WriteStringAsync(body);
        return res;
    }

    /// <summary>Свежий ответ из кэша, иначе один поход в Steam на всех сразу.</summary>
    private async Task<(bool ok, string body)> Current()
    {
        if (_body is not null && DateTimeOffset.UtcNow < _fresh) return (true, _body);

        await Gate.WaitAsync();
        try
        {
            // пока ждали очереди, запрос мог уже сходить — проверяем ещё раз
            if (_body is not null && DateTimeOffset.UtcNow < _fresh) return (true, _body);

            var (ok, body) = await Ask();
            if (ok)
            {
                _body = body;
                _fresh = DateTimeOffset.UtcNow.Add(Ttl);
            }
            return (ok, body);
        }
        finally
        {
            Gate.Release();
        }
    }

    private async Task<(bool ok, string body)> Ask()
    {
        var key = Environment.GetEnvironmentVariable("STEAM_API_KEY");
        if (string.IsNullOrEmpty(key))
        {
            _log.LogError("STEAM_API_KEY не задан — онлайн показать нечем");
            return (false, Err("no_api_key"));
        }

        var host = Environment.GetEnvironmentVariable("SERVER_HOST");
        if (string.IsNullOrWhiteSpace(host))
        {
            _log.LogError("SERVER_HOST не задан — непонятно, чей онлайн спрашивать");
            return (false, Err("no_server_host"));
        }

        // gameaddr сужает выдачу до нашей машины, appid — до Rust:
        // на том же IP у хостера живут ещё два сервера DayZ
        var filter = Uri.EscapeDataString($@"\appid\{RustAppId}\gameaddr\{host}");
        var url = "https://api.steampowered.com/IGameServersService/GetServerList/v1/"
                + $"?key={key}&filter={filter}&limit=32";

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(await Http.GetStringAsync(url));
        }
        catch (Exception e)
        {
            _log.LogWarning(e, "Steam не ответил на запрос списка серверов");
            return (false, Err("steam_unavailable"));
        }

        using (doc)
        {
            var port = Environment.GetEnvironmentVariable("SERVER_PORT");

            if (!doc.RootElement.GetProperty("response").TryGetProperty("servers", out var list)
                || !TryPick(list, port, out var found))
            {
                // Сервера нет в списке — он лежит или перезапускается.
                // Это не наша поломка, поэтому в лог кладём спокойно.
                _log.LogInformation("Сервер {Host}:{Port} не нашёлся в Steam", host, port ?? "любой порт");
                return (false, Err("server_offline"));
            }

            var result = new
            {
                players = found.TryGetProperty("players", out var p) ? p.GetInt32() : 0,
                maxPlayers = found.TryGetProperty("max_players", out var mp) ? mp.GetInt32() : 0,
                name = found.TryGetProperty("name", out var n) ? n.GetString() : null,
                map = found.TryGetProperty("map", out var m) ? m.GetString() : null,
                bornAt = Born(found),
            };

            return (true, JsonSerializer.Serialize(result));
        }
    }

    /// <summary>Из выдачи выбираем свой сервер по игровому порту: их на IP несколько.</summary>
    private static bool TryPick(JsonElement list, string? port, out JsonElement found)
    {
        foreach (var s in list.EnumerateArray())
        {
            if (string.IsNullOrWhiteSpace(port))
            {
                found = s;
                return true;
            }

            if (s.TryGetProperty("gameport", out var gp) && gp.GetInt32().ToString() == port)
            {
                found = s;
                return true;
            }
        }

        found = default;
        return false;
    }

    /// <summary>
    /// В теге gametype Rust отдаёт метку bornXXXXXXXXXX — момент, с которого живёт
    /// текущий мир. Отдаём как есть: сверить с известным вайпом и решить, показывать
    /// ли её вместо расписания в конфиге, должен человек, а не догадка в коде.
    /// </summary>
    private static string? Born(JsonElement s)
    {
        if (!s.TryGetProperty("gametype", out var g)) return null;

        foreach (var tag in (g.GetString() ?? "").Split(','))
        {
            if (tag.StartsWith("born") && long.TryParse(tag.AsSpan(4), out var unix))
                return DateTimeOffset.FromUnixTimeSeconds(unix).ToString("O");
        }

        return null;
    }

    private static string Err(string reason) => JsonSerializer.Serialize(new { error = reason });
}
