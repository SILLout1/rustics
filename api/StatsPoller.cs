using System.Globalization;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace api;

/// <summary>
/// Фоновый опрос сервера.
///
/// Тот же замер делает и таймер функций, но он требует учётки хранилища: локально
/// без Azurite его слушатель не стартует вовсе. Эта служба ни от чего не зависит и
/// работает везде, где приложение живо, — поэтому историю можно копить сразу, без
/// установки лишнего.
///
/// Двойной замер безвреден: время начисляется по промежутку с прошлого, так что
/// второй подряд добавит около нуля.
/// </summary>
public class StatsPoller : BackgroundService
{
    /// <summary>
    /// Шаг опроса. Пять минут — это и точность графика, и шаг начисления времени.
    /// Переопределяется через STATS_POLL_MINUTES: пригодилось при проверке, когда
    /// ждать пять минут ради второго замера было нечем.
    /// </summary>
    private static TimeSpan Every =>
        // Разбор строго по инвариантной культуре: на русской локали разделитель —
        // запятая, и "0.5" из настроек молча превратилось бы в значение по умолчанию.
        double.TryParse(Environment.GetEnvironmentVariable("STATS_POLL_MINUTES"),
                        NumberStyles.Float, CultureInfo.InvariantCulture, out var m) && m > 0
            ? TimeSpan.FromMinutes(m)
            : TimeSpan.FromMinutes(5);

    private readonly ILogger<StatsPoller> _log;

    public StatsPoller(ILogger<StatsPoller> log) => _log = log;

    protected override async Task ExecuteAsync(CancellationToken stopping)
    {
        // Небольшая пауза на старте: пусть хост поднимется, прежде чем лезть в сеть
        try { await Task.Delay(TimeSpan.FromSeconds(10), stopping); }
        catch (OperationCanceledException) { return; }

        while (!stopping.IsCancellationRequested)
        {
            try
            {
                await ServerStats.PollOnce(_log);
            }
            catch (Exception e)
            {
                // Сбой одного замера не должен останавливать наблюдение
                _log.LogWarning(e, "Фоновый замер не удался");
            }

            try { await Task.Delay(Every, stopping); }
            catch (OperationCanceledException) { return; }
        }
    }
}
