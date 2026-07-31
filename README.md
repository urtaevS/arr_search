# Torrent Search

Поиск торрентов по множеству трекеров через **Jackett** и **Prowlarr**.

## ✨ Возможности

- Поддержка **Jackett** и **Prowlarr** (переключение одним кликом)
- **Предварительный фильтр по категориям** (Newznab: Movies, TV, Audio, PC, Books, Console, XXX и др.)
- Фильтрация поиска по отдельным трекерам
- Отображение категории в карточке результата
- PWA — работает как приложение на Android и iOS
- Адаптивный интерфейс с Lucide-иконками
- Категории синхронизируются из Prowlarr при переключении на него

## 🚀 Запуск

### Локально

```bash
npm install
cp .env.example .env
# Отредактируйте .env — укажите свои API-ключи
npm start
```

### Docker

```bash
cp .env.example .env
# Отредактируйте .env — укажите свои API-ключи
docker compose up -d
```

Откройте http://localhost:3000

## 🔧 Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `PORT` | Порт сервера (по умолчанию 3000) |
| `JACKETT_URL` | URL Jackett (например, `http://jackett:9118`) |
| `JACKETT_API_KEY` | API-ключ Jackett |
| `JACKETT_INDEXERS` | Список индексаторов через запятую (опционально) |
| `PROWLARR_URL` | URL Prowlarr (например, `http://prowlarr:9696`) |
| `PROWLARR_API_KEY` | API-ключ Prowlarr |

## 🐳 Docker Hub

```bash
docker build -t yourusername/torrent-search .
docker push yourusername/torrent-search
```

При пуше в репозиторий GitHub Actions автоматически собирает и публикует образ в Docker Hub.

## 🔍 Фильтр категорий

При использовании **Prowlarr** в выпадающем списке трекеров появляется кнопка фильтра категорий:

1. Нажмите на иконку фильтра (рядом с логотипом Prowlarr)
2. Выберите одну или несколько категорий (Movies, TV, Audio...)
3. Результаты поиска будут ограничены выбранными категориями
4. В карточке результата отобразится название категории
5. Иконка фильтра меняется на `list-filter-plus` при активных категориях
6. При переключении на Jackett категории сбрасываются

## 📦 PWA

Приложение поддерживает установку как PWA на Android (Chrome) и iOS (Safari).
