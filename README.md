<img width="1257" height="267" alt="grok_image_1786541338758 (1)" src="https://github.com/user-attachments/assets/fc15d7ed-f9f0-4d99-8fec-29e37df76bcf" />

-------


[![Docker Hub](https://img.shields.io/docker/v/urtaev/arr_search?label=Docker%20Hub&logo=docker&color=0db7ed&style=for-the-badge)](https://hub.docker.com/repository/docker/urtaev/arr_search)
[![Docker Pulls](https://img.shields.io/docker/pulls/urtaev/arr_search?logo=docker&color=0db7ed&style=for-the-badge)](https://hub.docker.com/repository/docker/urtaev/arr_search)
[![Docker Image Size](https://img.shields.io/docker/image-size/urtaev/arr_search/latest?logo=docker&color=0db7ed&style=for-the-badge)](https://hub.docker.com/repository/docker/urtaev/arr_search)
[![Docker Build](https://github.com/urtaevS/arr_search/actions/workflows/docker-image.yml/badge.svg?style=for-the-badge)](https://github.com/urtaevS/arr_search/actions/workflows/docker-image.yml)
[![GitHub Release](https://img.shields.io/github/v/release/urtaevS/arr_search?logo=github&color=2ea44f&style=for-the-badge)](https://github.com/urtaevS/arr_search/releases)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white&style=for-the-badge)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white&style=for-the-badge)](https://expressjs.com/)
[![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?logo=pwa&logoColor=white&style=for-the-badge)](https://web.dev/progressive-web-apps/)

Поиск торрентов через **Jackett** и **Prowlarr**.

## ✨ Возможности

- Поддержка **Jackett** и **Prowlarr**
- **Предварительный фильтр по категориям** (Newznab: Movies, TV, Audio, PC, Books, Console и др.)
- Фильтрация поиска по отдельным трекерам
- Отображение категории в карточке результата
- **Подробные ошибки по каждому трекеру** 
- **⭐ Избранное** — сохранение тем на сервере
- **История поиска**
- **📡 TorrentMonitor** — отправка раздачи в отслеживание TorrentMonitor одной кнопкой на карточке
- **💾 Сохранение .torrent в папку**
- **Копирование ссылки** по клику на название темы
- PWA — работает как приложение на Android и iOS
- Адаптивный интерфейс с Lucide-иконками

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

### Данные и папки в Docker

Данные и watch-папка **bind-mount'ятся** в контейнер через тома (см. `docker-compose.yml` в репозитории):

```yaml
services:
  torrent-search:
    image: urtaev/arr_search:latest
    ports:
      - "3000:3000"
    environment:
      TORRENT_WATCH_DIR: /app/torrents # watch-папка для сохранённых .torrent
    volumes:
      - ./.env:/app/.env:ro
      - ./data:/app/data        # избранное (favorites.json) + история (history.json)
      - ./torrents:/app/torrents # watch-папка для сохранённых .torrent
```

> 🔧 Если хотите собрать образ из исходников локально — замените `image: urtaev/arr_search:latest` на `build: .` (Dockerfile собирает из исходников), `env_file: [.env]` можно добавить для передачи переменных окружения.


- 💡 Если папок ещё нет — Docker создаст их при первом запуске (возможно, от root). При проблемах с записью: `sudo chown -R $USER:$USER ./data ./torrents`.

## 🔧 Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `PORT` | Порт сервера (по умолчанию 3000) |
| `JACKETT_URL` | URL Jackett (например, `http://jackett:9118`) |
| `JACKETT_API_KEY` | API-ключ Jackett |
| `JACKETT_INDEXERS` | Список индексаторов через запятую (опционально) |
| `PROWLARR_URL` | URL Prowlarr (например, `http://prowlarr:9696`) |
| `PROWLARR_API_KEY` | API-ключ Prowlarr |
| `DATA_DIR` | Папка для данных (по умолчанию `./data`), где хранится `favorites.json` |
| `TORRENT_WATCH_DIR` | Папка для сохранения `.torrent` (watch-папка торрент-клиента). Локально по умолчанию `./data/torrents`, в Docker задаётся в compose (`/app/torrents`) |
| `TM_URL` | URL сервиса TorrentMonitor (например, `http://192.168.1.7:8080`) |
| `TM_API_KEY` | API-ключ TorrentMonitor (Настройки → API) |

## 🐳 Docker Hub

```bash
docker build -t yourusername/torrent-search .
docker push yourusername/torrent-search
```

## 🔍 Фильтр категорий

При использовании **Prowlarr** в выпадающем списке трекеров появляется кнопка фильтра категорий:

1. Нажмите на иконку фильтра (рядом с логотипом Prowlarr)
2. Выберите одну или несколько категорий (Movies, TV, Audio...)
3. Результаты поиска будут ограничены выбранными категориями
4. В карточке результата отобразится название категории

## ⭐ Избранное

- Нажмите **звезду** на карточке результата — тема сохранится в избранное.
- **Звезда в нижней панели навигации (доке)** открывает окно избранного; она подсвечивается, если избранное есть.
- В окне можно **удалить**, **переименовать** или **открыть** тему.
- Список хранится на сервере в `data/favorites.json`.

## 🕘 История поиска

- Сохранение **последних 20** запросов.
- Возможность повторного поиска.
- История хранится на сервере в `data/history.json`.

## 📡 TorrentMonitor

Если у вас развёрнут [TorrentMonitor](https://github.com/ElizarovEugene/TorrentMonitor) — можно отправлять раздачи в отслеживание прямо из результатов поиска:

1. Укажите `TM_URL` (адрес сервиса) и `TM_API_KEY` (в TorrentMonitor: **Настройки → API → Сгенерировать ключ**) в `.env`.
2. На карточке результата появится кнопка **«В TorrentMonitor»** (иконка пульса).
3. Кнопка отправляет ссылку на раздачу в `POST /api/torrents` — тема начнёт отслеживаться.
4. Результат показывается всплывающим уведомлением («Тема добавлена», «Тема уже отслеживается» и т.д.).

⚠️ API-ключ **не попадает в браузер** — запросы идут через серверный прокси `POST /api/tm/torrents`.
> 🚫 Сейчас кнопка «В TorrentMonitor» на карточках **скрыта** (флаг `TM_BUTTON_ENABLED = false` в `app.js`) — пока API TorrentMonitor не починен. Когда заработает — поставьте `true`.

## 💾 Сохранение .torrent в папку

Кнопка **«Сохранить в папку»** (розовая иконка сохранения) на карточке результата скачивает `.torrent`-файл и сохраняет его в **watch-папку**, которую отслеживает торрент-клиент:

1. Сервер скачивает `.torrent` по ссылке трекера (через Prowlarr/Jackett).
2. Проверяет, что файл валидный (bencoded `.torrent`).
3. Сохраняет в `TORRENT_WATCH_DIR` с именем из названия раздачи (если файл уже есть — добавит ` (1)`, ` (2)` и т.д.).
4. Торрент-клиент видит новый файл в watch-папке и **автоматически начинает загрузку**.

### Docker

```yaml
volumes:
  - ./torrents:/app/torrents   # watch-папка (на хосте — ./torrents)
environment:
  TORRENT_WATCH_DIR: /app/torrents
```

На хосте папка **`./torrents`** в корне проекта. Укажите её как «watch folder» в вашем торрент-клиенте (например, в qBittorrent: Настройки → Загрузки → Автоматически добавлять торренты из папки).

### Локально (без Docker)

`.torrent` сохраняются в `./data/torrents` (задайте `TORRENT_WATCH_DIR` в `.env` при необходимости).

> 💡 Кнопка появляется только если у раздачи есть прямая ссылка на `.torrent` файл. Если трекер вернул лишь magnet-ссылку — кнопки нет, т.к. сохранять файл неоткуда.

## 🔗 Копирование ссылки

Клик по названию темы в карточке копирует ссылку на неё (детали/магнет) в буфер обмена.

## ⚠️ Ошибки трекеров

Если часть трекеров не ответила, внизу панели фильтров и всплывающим уведомлением показываются **конкретные ошибки** (какой трекер и почему упал).

## 📦 PWA

Приложение поддерживает установку как PWA на Android (Chrome) и iOS (Safari).

---

<p align="center">
  <strong>Если этот проект оказался полезен для вас — вы можете поддержать автора ☕</strong><br>
  <em>Каждая чашечка кофе помогает развивать и поддерживать развитие и поддержку .</em>
</p>

<p align="center">
  <a href="https://pay.cloudtips.ru/p/0d93f1af" target="_blank" rel="noreferrer noopener">
    <img src="https://img.shields.io/badge/☕_Кофе CloudTips-blue?style=for-the-badge" alt="Поддержать проект" />
  </a>
</p>
