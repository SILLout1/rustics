using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace api;

/// <summary>
/// Список игроков через WebRCON сервера — тот же, что админ видит в консоли.
///
/// Публичный запрос Steam (A2S) у этого сервера отдаёт выдуманный список: ники
/// не совпадают с теми, кто реально в игре, и даже число игроков расходится с
/// мастер-листом Steam. RCON отвечает изнутри сервера, подделать его нечем.
///
/// Пароль RCON даёт полный доступ к консоли сервера. Поэтому живёт он только в
/// настройках бэкенда и никогда не попадает ни в ответы API, ни в лог: адрес
/// подключения с паролем внутри мы не логируем и в ошибки не пробрасываем.
/// </summary>
public static class Rcon
{
    public static (string? host, int port, string? password) Settings()
    {
        var host = Environment.GetEnvironmentVariable("SERVER_HOST");
        var password = Environment.GetEnvironmentVariable("RCON_PASSWORD");
        if (!int.TryParse(Environment.GetEnvironmentVariable("RCON_PORT"), out var port))
            port = 0;

        return (string.IsNullOrWhiteSpace(host) ? null : host,
                port,
                string.IsNullOrEmpty(password) ? null : password);
    }

    public static bool Configured()
    {
        var (host, port, password) = Settings();
        return host is not null && port > 0 && password is not null;
    }

    /// <summary>
    /// Кто сейчас в игре. Настроен RCON — спрашиваем его. Нет — по старинке через A2S.
    ///
    /// Если RCON настроен, но не ответил, к A2S не откатываемся: там фальшивые ники,
    /// и лучше честно показать «недоступно», чем снова выдать выдумку за правду.
    /// </summary>
    public static Task<List<A2S.Player>> Online(TimeSpan timeout)
    {
        if (Configured())
        {
            var (host, port, password) = Settings();
            return Players(host!, port, password!, timeout);
        }

        var (qHost, qPort) = A2S.Address();
        return A2S.Players(qHost!, qPort, timeout);
    }

    /// <summary>Команда playerlist: JSON-массив с DisplayName и ConnectedSeconds.</summary>
    public static async Task<List<A2S.Player>> Players(string host, int port, string password, TimeSpan timeout)
    {
        using var life = new CancellationTokenSource(timeout);
        using var ws = new ClientWebSocket();

        // Rust принимает пароль прямо в пути адреса — так устроен WebRCON
        await ws.ConnectAsync(new Uri($"ws://{host}:{port}/{Uri.EscapeDataString(password)}"), life.Token);

        // Номер запроса: по нему отличаем свой ответ от лога консоли,
        // который сервер шлёт в то же соединение всем подключённым
        var id = Random.Shared.Next(1000, int.MaxValue);
        var command = JsonSerializer.SerializeToUtf8Bytes(new { Identifier = id, Message = "playerlist", Name = "WebRcon" });
        await ws.SendAsync(command, WebSocketMessageType.Text, true, life.Token);

        while (true)
        {
            using var doc = JsonDocument.Parse(await Receive(ws, life.Token));
            var root = doc.RootElement;

            if (!root.TryGetProperty("Identifier", out var got) || !got.TryGetInt32(out var gotId) || gotId != id)
                continue;

            var message = root.TryGetProperty("Message", out var m) ? m.GetString() : null;
            using var list = JsonDocument.Parse(string.IsNullOrWhiteSpace(message) ? "[]" : message);

            var players = new List<A2S.Player>();
            foreach (var p in list.RootElement.EnumerateArray())
            {
                var name = p.TryGetProperty("DisplayName", out var n) ? n.GetString() : null;
                var seconds = p.TryGetProperty("ConnectedSeconds", out var s) && s.TryGetDouble(out var sec) ? sec : 0;

                // Остальные поля (SteamID, IP, позиция) сознательно не берём:
                // сайту они не нужны, а IP игроков светить нельзя
                if (!string.IsNullOrWhiteSpace(name)) players.Add(new A2S.Player(name, (float)seconds));
            }

            // Вежливо закрываться не ждём: Rust может не ответить на рукопожатие
            // закрытия, и CloseAsync повис бы навсегда вместе с очередью запросов.
            // Ответ уже в руках — просто рвём соединение.
            ws.Abort();

            return players;
        }
    }

    private static async Task<string> Receive(ClientWebSocket ws, CancellationToken token)
    {
        var buffer = new byte[16 * 1024];
        using var whole = new MemoryStream();

        while (true)
        {
            var part = await ws.ReceiveAsync(buffer, token);
            if (part.MessageType == WebSocketMessageType.Close)
                throw new WebSocketException("RCON закрыл соединение — неверный пароль или порт");

            whole.Write(buffer, 0, part.Count);
            if (part.EndOfMessage) return Encoding.UTF8.GetString(whole.ToArray());
        }
    }
}
