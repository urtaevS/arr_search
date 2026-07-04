# Torrent Search

Поиск торрентов по множеству трекеров через Jackett / Prowlarr.

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
| `PROWLARR_URL` | URL Prowlarr (опционально) |
| `PROWLARR_API_KEY` | API-ключ Prowlarr (опционально) |

## 🐳 Docker Hub

```bash
docker build -t yourusername/torrent-search .
docker push yourusername/torrent-search
```

## 📦 PWA

Приложение поддерживает установку как PWA на Android (Chrome) и iOS (Safari).
