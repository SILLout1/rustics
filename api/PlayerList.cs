using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace api;

/// <summary>
/// Список игроков прямо с игрового сервера по протоколу запроса Steam (A2S).
///
/// Это тот же источник, из которого данные берёт сам BattleMetrics: порт запроса
/// у сервера публичный, доступ к машине сервера для этого не нужен. Поэтому здесь
/// нет ни подписки, ни Cloudflare, ни чужого посредника, который может отвалиться.
///
/// Сервер отдаёт время текущей сессии каждого игрока — сколько он не выходил.
/// Это не общий налёт за всё время: чтобы считать его, надо копить эти замеры
/// в хранилище. Пока показываем честно то, что есть.
/// </summary>
public class PlayerList
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static string? _body;
    private static DateTimeOffset _fresh;

    private readonly ILogger<PlayerList> _log;

    public PlayerList(ILogger<PlayerList> log) => _log = log;

    [Function("PlayerList")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "server/players")]
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

    /// <summary>Свежий список из кэша, иначе один запрос к серверу на всех сразу.</summary>
    private async Task<(bool ok, string body)> Current()
    {
        if (_body is not null && DateTimeOffset.UtcNow < _fresh) return (true, _body);

        await Gate.WaitAsync();
        try
        {
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
        // Порт запроса — не игровой. У Rust он обычно на 10 больше игрового
        // (35100 -> 35110); точное значение видно в выдаче Steam в поле addr.
        var (host, port) = A2S.Address();
        if (!Rcon.Configured() && (host is null || port == 0))
        {
            _log.LogError("Не задан ни RCON, ни SERVER_HOST с SERVER_QUERY_PORT — некого спрашивать");
            return (false, Err("no_server_address"));
        }

        try
        {
            var players = await Rcon.Online(TimeSpan.FromSeconds(6));

            // Самые засидевшиеся — наверх: это и есть интересная часть таблицы
            var rows = players
                .OrderByDescending(p => p.Seconds)
                .Select(p => new { name = p.Name, value = (int)Math.Round(p.Seconds / 60) })
                .ToList();

            _log.LogInformation("Сервер отдал игроков: {N}", rows.Count);
            return (true, JsonSerializer.Serialize(rows));
        }
        catch (OperationCanceledException)
        {
            _log.LogWarning("Сервер {Host}:{Port} не ответил на запрос списка игроков", host, port);
            return (false, Err("server_silent"));
        }
        catch (Exception e)
        {
            _log.LogWarning(e, "Не удалось спросить список игроков у {Host}:{Port}", host, port);
            return (false, Err("query_failed"));
        }
    }

    private static string Err(string reason) => JsonSerializer.Serialize(new { error = reason });
}
