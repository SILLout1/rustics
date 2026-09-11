using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Web;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace api;

/// <summary>
/// Принимает возврат от Steam OpenID, проверяет подпись и сразу забирает профиль.
/// Ник и аватарка уезжают на фронт в самом редиректе — второй запрос с браузера
/// не нужен, а значит нет ни CORS, ни лишней точки отказа.
/// </summary>
public class SteamLogin
{
    private static readonly HttpClient Http = new();

    // Куда возвращаем игрока после входа.
    // Адрес берём из openid.return_to — это тот сайт, с которого вход начали,
    // поэтому одна и та же функция обслуживает и localhost, и прод, и превью.
    // Но редиректить куда попало нельзя: пускаем только адреса из SITE_URL
    // (можно перечислить через запятую) и локальную разработку.
    private static readonly string[] Allowed = BuildAllowed();

    private static string[] BuildAllowed()
    {
        var list = (Environment.GetEnvironmentVariable("SITE_URL") ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => x.TrimEnd('/'))
            .ToArray();

        return list.Length > 0 ? list : new[] { "http://localhost:5173" };
    }

    private static string ResolveSite(string? returnTo)
    {
        if (Uri.TryCreate(returnTo, UriKind.Absolute, out var uri))
        {
            var origin = uri.GetLeftPart(UriPartial.Authority);

            if (uri.IsLoopback) return origin;
            if (Allowed.Contains(origin, StringComparer.OrdinalIgnoreCase)) return origin;
        }

        // Чужой адрес молча уводим на свой сайт — открытый редирект нам не нужен.
        return Allowed[0];
    }

    private readonly ILogger<SteamLogin> _log;

    public SteamLogin(ILogger<SteamLogin> log) => _log = log;

    [Function("SteamLogin")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "steam/callback")]
        HttpRequestData req)
    {
        var query = HttpUtility.ParseQueryString(req.Url.Query);

        // Адрес сайта нужен и для ошибок тоже — иначе игроку некуда возвращаться
        var site = ResolveSite(query["openid.return_to"]);

        // Собираем обратно все openid.* параметры, подменив режим на проверку
        var form = new Dictionary<string, string>();
        foreach (string? key in query)
        {
            if (key is null || !key.StartsWith("openid.")) continue;
            form[key] = query[key] ?? "";
        }

        if (form.Count == 0) return Back(req, site, "error=no_openid_params");

        form["openid.mode"] = "check_authentication";

        // Спрашиваем у Steam, его ли это ответ. Без этого шага SteamID можно подделать,
        // просто собрав ссылку руками — поэтому проверка обязательна и только на сервере.
        string verdict;
        try
        {
            var resp = await Http.PostAsync(
                "https://steamcommunity.com/openid/login",
                new FormUrlEncodedContent(form));
            verdict = await resp.Content.ReadAsStringAsync();
        }
        catch (Exception)
        {
            return Back(req, site, "error=steam_unavailable");
        }

        if (!verdict.Contains("is_valid:true"))
        {
            _log.LogWarning("Steam не подтвердил подпись, ответ: {Verdict}", verdict.Trim());
            return Back(req, site, "error=invalid_signature");
        }

        var claimed = query["openid.claimed_id"] ?? "";
        var m = Regex.Match(claimed, @"^https://steamcommunity\.com/openid/id/(\d{17})$");
        if (!m.Success) return Back(req, site, "error=bad_claimed_id");

        var steamId = m.Groups[1].Value;

        // Профиль тянем здесь же. Не получилось — не беда, вход всё равно состоялся:
        // фронт покажет игрока без аватарки, но авторизованным.
        var (name, avatar) = await FetchProfile(steamId);
        _log.LogInformation("Вход {SteamId}, ник {Name}, возврат на {Site}",
            steamId, name ?? "(не получен)", site);

        var q = $"steamid={steamId}";
        if (name is not null) q += $"&name={Uri.EscapeDataString(name)}";
        if (avatar is not null) q += $"&avatar={Uri.EscapeDataString(avatar)}";

        return Back(req, site, q);
    }

    private async Task<(string? name, string? avatar)> FetchProfile(string steamId)
    {
        var key = Environment.GetEnvironmentVariable("STEAM_API_KEY");
        if (string.IsNullOrEmpty(key))
        {
            _log.LogWarning("STEAM_API_KEY не задан — вход пройдёт, но без ника и аватарки");
            return (null, null);
        }

        try
        {
            var url = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"
                    + $"?key={key}&steamids={steamId}";
            using var doc = JsonDocument.Parse(await Http.GetStringAsync(url));

            var players = doc.RootElement.GetProperty("response").GetProperty("players");
            if (players.GetArrayLength() == 0) return (null, null);

            var p = players[0];
            return (
                p.TryGetProperty("personaname", out var n) ? n.GetString() : null,
                p.TryGetProperty("avatarfull", out var a) ? a.GetString() : null
            );
        }
        catch (Exception e)
        {
            _log.LogWarning(e, "Не удалось забрать профиль {SteamId} из Steam", steamId);
            return (null, null);
        }
    }

    private static HttpResponseData Back(HttpRequestData req, string site, string query)
    {
        var res = req.CreateResponse(HttpStatusCode.Redirect);
        res.Headers.Add("Location", $"{site}/?{query}");
        return res;
    }
}
