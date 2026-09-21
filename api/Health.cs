using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace api;

/// <summary>
/// Проверка живости для хостинга и будильника.
///
/// Намеренно ни от чего не зависит: ни от игрового сервера, ни от Steam, ни от RCON.
/// Раньше Render проверял здоровье по /api/server/status, а тот отвечает ошибкой,
/// когда игрового сервера нет в списке Steam — например, во время вайпа или рестарта.
/// Render считал сломанным сам бек, не пускал его в работу, и вместе с игровым
/// сервером ложился весь API, хотя он должен был просто показать «сервер недоступен».
/// </summary>
public class Health
{
    [Function("Health")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "health")]
        HttpRequestData req)
    {
        var res = req.CreateResponse(HttpStatusCode.OK);
        res.Headers.Add("Content-Type", "text/plain; charset=utf-8");
        res.Headers.Add("Cache-Control", "no-store");

        // Только асинхронная запись: хост в режиме ASP.NET Core запрещает
        // синхронный вывод, и WriteString падал с 500 на каждом запросе.
        await res.WriteStringAsync("ok");
        return res;
    }
}
