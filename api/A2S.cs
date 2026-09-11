using System.Net.Sockets;
using System.Text;

namespace api;

/// <summary>
/// Протокол запроса Steam (A2S) к игровому серверу.
///
/// Порт запроса у сервера публичный, поэтому доступ к самой машине не нужен —
/// это ровно тот источник, из которого данные берёт и BattleMetrics.
/// Вынесено отдельно, потому что спрашивают двое: живой список игроков и
/// накопитель статистики.
/// </summary>
public static class A2S
{
    public record Player(string Name, float Seconds);

    /// <summary>
    /// A2S_PLAYER. Сначала сервер отвечает не списком, а челленджем — его нужно
    /// повторить в следующем запросе. Так протокол защищается от подделки адреса,
    /// поэтому шаг обязателен, а не «на всякий случай».
    /// </summary>
    public static async Task<List<Player>> Players(string host, int port, TimeSpan timeout)
    {
        using var udp = new UdpClient();
        udp.Connect(host, port);

        using var life = new CancellationTokenSource(timeout);

        var answer = await Ask(udp, Packet(0xFFFFFFFF), life.Token);

        // 'A' — челлендж: повторяем запрос уже с ним
        if (answer.Length >= 9 && answer[4] == (byte)'A')
        {
            var challenge = BitConverter.ToUInt32(answer, 5);
            answer = await Ask(udp, Packet(challenge), life.Token);
        }

        var players = new List<Player>();

        // 'D' — список игроков; всё остальное значит, что сервер его не отдаёт
        if (answer.Length < 6 || answer[4] != (byte)'D') return players;

        var at = 6;
        var count = answer[5];

        for (var i = 0; i < count && at < answer.Length; i++)
        {
            at++;                                   // порядковый номер, серверу не нужен

            var end = Array.IndexOf(answer, (byte)0, at);
            if (end < 0) break;

            var name = Encoding.UTF8.GetString(answer, at, end - at);
            at = end + 1;

            if (at + 8 > answer.Length) break;

            at += 4;                                // очки: в Rust всегда ноль
            var seconds = BitConverter.ToSingle(answer, at);
            at += 4;

            if (!string.IsNullOrWhiteSpace(name)) players.Add(new Player(name, seconds));
        }

        return players;
    }

    private static byte[] Packet(uint challenge)
    {
        var p = new byte[9];
        p[0] = p[1] = p[2] = p[3] = 0xFF;
        p[4] = 0x55;                                // A2S_PLAYER
        BitConverter.GetBytes(challenge).CopyTo(p, 5);
        return p;
    }

    private static async Task<byte[]> Ask(UdpClient udp, byte[] payload, CancellationToken token)
    {
        await udp.SendAsync(payload, payload.Length);
        var result = await udp.ReceiveAsync(token);
        return result.Buffer;
    }

    /// <summary>Адрес сервера из настроек. Порт запроса — не игровой.</summary>
    public static (string? host, int port) Address()
    {
        var host = Environment.GetEnvironmentVariable("SERVER_HOST");
        if (!int.TryParse(Environment.GetEnvironmentVariable("SERVER_QUERY_PORT"), out var port))
            port = 0;

        return (string.IsNullOrWhiteSpace(host) ? null : host, port);
    }
}
