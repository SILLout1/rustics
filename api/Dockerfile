# Образ функций для запуска где угодно, кроме Azure.
#
# Нужен потому, что песочница Azure App Service режет исходящий UDP, а на нём
# держатся список игроков и накопление статистики (протокол запроса Steam).
# В обычном контейнере на своей машине или на VPS такого ограничения нет.

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Сначала только csproj — тогда слой с восстановлением пакетов переиспользуется,
# пока список зависимостей не поменялся, и пересборка идёт секунды
COPY api.csproj ./
RUN dotnet restore api.csproj

COPY . ./
RUN dotnet publish api.csproj -c Release -o /out

FROM mcr.microsoft.com/azure-functions/dotnet-isolated:4-dotnet-isolated8.0

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true \
    FUNCTIONS_WORKER_RUNTIME=dotnet-isolated \
    # История живёт в примонтированной папке, а не внутри контейнера:
    # иначе она исчезнет при первом же обновлении образа
    STATS_PATH=/data/stats.json

COPY --from=build /out /home/site/wwwroot
