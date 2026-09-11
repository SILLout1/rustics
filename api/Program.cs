using Azure.Monitor.OpenTelemetry.Exporter;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Azure.Functions.Worker.OpenTelemetry;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;

// Разовый замер для внешнего планировщика: dotnet run -- --poll
//
// Хост функций при этом не поднимается — процесс делает один опрос и выходит.
// Разбор ответа сервера и начисление времени берутся те же самые, что у службы:
// отдельного скрипта, который пришлось бы держать в синхроне с этим кодом, нет.
if (args.Contains("--poll"))
{
    using var loggers = LoggerFactory.Create(b => b.AddConsole());
    await api.ServerStats.PollOnce(loggers.CreateLogger("StatsPoll"));
    return;
}

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

// Опрос игрового сервера для своей истории. Отдельная служба, а не только таймер:
// таймеру нужна учётка хранилища, а этой — ничего, поэтому она работает и локально.
builder.Services.AddHostedService<api.StatsPoller>();

if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING")))
{
    builder.Services.AddOpenTelemetry()
        .UseFunctionsWorkerDefaults()
        .UseAzureMonitorExporter();
}

builder.Build().Run();