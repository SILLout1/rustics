namespace api;

using Microsoft.Azure.Functions.Worker.Http;

/// <summary>
/// Кому из чужих доменов разрешено читать наш API.
///
/// Раньше стояла звёздочка — отвечали кому угодно. Данные тут и так публичные,
/// но чужой сайт мог встроить наш API и нагружать бесплатный инстанс от своего
/// имени. Теперь пускаем только адреса из SITE_URL (тот же список, что и для
/// возврата после входа через Steam) и локальную разработку.
///
/// Сам сайт от этого не зависит: и на Vercel, и в dev-сервере запросы идут на
///относительный /api того же домена, а такому запросу заголовок Origin не нужен вовсе.
/// </summary>
public static class Cors
{
    private static readonly string[] Allowed =
        (Environment.GetEnvironmentVariable("SITE_URL") ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => x.TrimEnd('/'))
            .ToArray();

    /// <summary>Ставит заголовок, только если запрос пришёл с разрешённого адреса.</summary>
    public static void Apply(HttpRequestData req, HttpResponseData res)
    {
        if (!req.Headers.TryGetValues("Origin", out var values)) return;

        var origin = values.FirstOrDefault()?.TrimEnd('/');
        if (string.IsNullOrEmpty(origin)) return;

        if (!Allowed.Contains(origin, StringComparer.OrdinalIgnoreCase) && !IsLocal(origin)) return;

        res.Headers.Add("Access-Control-Allow-Origin", origin);

        // Ответ зависит от адреса запросившего — иначе кэш отдал бы чужой заголовок
        res.Headers.Add("Vary", "Origin");
    }

    private static bool IsLocal(string origin) =>
        Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.IsLoopback;
}
