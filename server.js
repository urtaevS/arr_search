import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import http from "http";
import https from "https";
import { fileURLToPath } from "url";
import os from "os";
import fs from "fs";
import { promises as fsp } from "fs";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const JACKETT_URL = process.env.JACKETT_URL;
const API_KEY = process.env.JACKETT_API_KEY;

const PROWLARR_URL = process.env.PROWLARR_URL;
const PROWLARR_API_KEY = process.env.PROWLARR_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Избранное хранится в JSON-файле (смонтировано через DATA_DIR в Docker)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const FAVORITES_FILE = path.join(DATA_DIR, "favorites.json");

// =============================
// STATIC FILES
// =============================

app.use(express.static(__dirname));

app.use(express.json({ limit: "1mb" }));

// =============================
// FORMAT SIZE
// =============================

function formatSize(bytes) {

    if (!bytes || bytes <= 0) return "";

    const units = ["B", "KB", "MB", "GB", "TB"];

    let i = 0;
    let value = bytes;

    while (value >= 1024 && i < units.length - 1) {

        value /= 1024;
        i++;

    }

    return `${value.toFixed(1)} ${units[i]}`;

}

// =============================
// NORMALIZE RESULT
// =============================

function normalize(item) {

    return {

        title: item.Title,

        tracker: item.Tracker,

        source: "jackett",

        size: formatSize(item.Size),

        sizeBytes: item.Size ?? 0,

        seeders: item.Seeders ?? 0,

        leechers: item.Peers ?? 0,

        publishDate: item.PublishDate || null,

        magnet: item.MagnetUri || "",

        torrent: item.Link || "",

        details: item.Details || "",

        category: item.CategoryDesc || "",

        tags: []

    };

}

function normalizeProwlarr(item) {

    return {

        title: item.title,

        tracker: item.indexer,

        source: "prowlarr",

        size: formatSize(item.size),

        sizeBytes: item.size ?? 0,

        seeders: item.seeders ?? 0,

        leechers: item.peers ?? 0,

        publishDate: item.publishDate || null,

        magnet: item.magnetUrl || item.downloadUrl || "",

        torrent: item.downloadUrl || "",

        details: item.infoUrl || item.guid || "",

        category: Array.isArray(item.categories) ? item.categories.map(c => {
            if (typeof c === "string") return c;
            if (typeof c?.name === "string" && c.name) return c.name;
            if (typeof c?.categoryName === "string" && c.categoryName) return c.categoryName;
            if (typeof c?.title === "string" && c.title) return c.title;
            return null;
        }).filter(Boolean).join(", ") : "",
        tags: []
    };
}

// =============================
// SEARCH ERROR HELPERS
// =============================

let prowlarrIndexerMap = new Map(); // id -> name

function setProwlarrIndexerMap(list) {
    prowlarrIndexerMap = new Map();
    for (const item of list) {
        if (item && item.id != null) {
            prowlarrIndexerMap.set(String(item.id), item.name || item.implementationName || String(item.id));
        }
    }
}

function summarizeError(err, fallback = "Неизвестная ошибка") {
    let raw = "";
    if (typeof err === "string") {
        raw = err;
    } else if (err && err.response) {
        const st = err.response.status || "";
        const dataMsg = err.response.data?.message || err.response.data?.error || err.response.data?.Message || "";
        raw = dataMsg ? String(dataMsg) : `HTTP ${st}`;
    } else if (err && err.message) {
        raw = err.message;
    } else if (err && err.error) {
        raw = err.error;
    }
    raw = String(raw).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!raw) return fallback;

    const low = raw.toLowerCase();
    if (/404|not ?found|не найден/i.test(raw)) return "404 — страница не найдена";
    if (/unavailable|недоступ|offline|не работает|не отвечает/i.test(low)) return "сервер недоступен";
    if (/timed? ?out|timeout|превышен|истек/i.test(low)) return "таймаут — сервер не ответил";
    if (/401|unauthorized/i.test(low)) return "401 — нет доступа";
    if (/403|forbidden/i.test(low)) return "403 — доступ запрещён";
    if (/429|rate ?limit/i.test(low)) return "429 — слишком много запросов";
    if (raw.length > 150) raw = raw.slice(0, 150) + "…";
    return raw || fallback;
}

function parseIndexerErrors(raw) {
    if (typeof raw !== "string") return [];
    const out = [];
    const seen = new Set();
    const add = (indexer, message) => {
        const key = indexer + "|" + message;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ indexer, message });
    };

    // "HTTP Error - Res: HTTP/2.0 [GET] https://megapeer.vip/...: 404.NotFound (...)"
    const re1 = /\[GET\]\s+(\S+?):\s+(\d{3}(?:\.\w+)?)/g;
    let m;
    while ((m = re1.exec(raw)) !== null) {
        let host = m[1];
        try { host = new URL(m[1]).hostname.replace(/^www\./, ""); } catch { /* keep */ }
        add(host, m[2]);
    }

    // "RuTracker.org server is currently unavailable. ... Http request timed out"
    // Сканируем каждый домен и ищем ключевое слово ошибки до следующего домена,
    // чтобы не «приписывать» чужую ошибку соседнему трекеру.
    const domainRe = /([A-Za-z0-9][A-Za-z0-9.-]*(?:\.(?:org|ru|com|net|vip|me|is|info|su|cc|tv|ws|xyz|biz|name|site|app|top|online)))\b/gi;
    const kwRe = /unavailable|недоступн|timed ?out|timeout|ошибк/gi;
    const domains = [];
    let dm;
    while ((dm = domainRe.exec(raw)) !== null) {
        domains.push({ host: dm[1].replace(/^www\./, ""), pos: dm.index });
    }
    for (let i = 0; i < domains.length; i++) {
        const d = domains[i];
        const end = (i + 1 < domains.length) ? domains[i + 1].pos : raw.length;
        const chunk = raw.slice(d.pos, end);
        const kw = chunk.match(kwRe);
        if (kw) {
            let message = "ошибка";
            if (/unavailable|недоступн/i.test(kw[0])) message = "сервер недоступен";
            else if (/timed ?out|timeout/i.test(kw[0])) message = "таймаут — сервер не ответил";
            add(d.host, message);
        }
    }

    return out;
}

async function searchSingleIndexer(query, indexerId, categoryList = []) {

    const searchUrl = new URL(`${PROWLARR_URL}/api/v1/search`);
    searchUrl.searchParams.set("apikey", PROWLARR_API_KEY);
    searchUrl.searchParams.set("query", query);
    searchUrl.searchParams.append("indexerIds", indexerId);

    if (categoryList.length > 0) {
        categoryList.forEach(cid => searchUrl.searchParams.append("categories", cid));
    }

    const response = await axios.get(searchUrl.toString(), { timeout: 30000 });

    const rawData = response.data || [];

    return (Array.isArray(rawData) ? rawData : [])
        .map(normalizeProwlarr);

}

async function warmupProwlarr() {

    if (!PROWLARR_URL || !PROWLARR_API_KEY) return;

    console.log("[warmup] Prowlarr предварительный прогрев...");

    try {

        // 1. Запрашиваем список индексаторов (инициализация соединения)
        const parsed = new URL(`${PROWLARR_URL}/api/v1/indexer`);
        parsed.searchParams.set("apikey", PROWLARR_API_KEY);

        const idxResponse = await axios.get(parsed.toString(), { timeout: 10000 });

        const idxData = idxResponse.data || [];

        if (Array.isArray(idxData)) {
            console.log("[warmup] Prowlarr: получено " + idxData.length + " индексаторов");
            setProwlarrIndexerMap(idxData);
        }

        // 2. Лёгкий тестовый поисковый запрос для прогрева кэша
        const searchUrl = new URL(`${PROWLARR_URL}/api/v1/search`);
        searchUrl.searchParams.set("apikey", PROWLARR_API_KEY);
        searchUrl.searchParams.set("query", "test");

        await axios.get(searchUrl.toString(), { timeout: 15000 });

        console.log("[warmup] Prowlarr поисковый тест выполнен");

    } catch (error) {

        console.warn("[warmup] Prowlarr ошибка прогрева:", error.message);

    }

    console.log("[warmup] Prowlarr прогрев завершён");

}

// =============================
// CATEGORIES API
// =============================

app.get("/api/categories", async (req, res) => {

    if (!PROWLARR_URL || !PROWLARR_API_KEY) {
        return res.json([]);
    }

    try {

        const parsed = new URL(`${PROWLARR_URL}/api/v1/indexer`);
        parsed.searchParams.set("apikey", PROWLARR_API_KEY);

        const response = await axios.get(parsed.toString(), { timeout: 10000 });

        const data = response.data || [];

        const seen = new Map();

        for (const idx of Array.isArray(data) ? data : []) {

            const cats = idx.capabilities?.categories || [];

            for (const cat of cats) {

                if (!seen.has(cat.id)) {
                    seen.set(cat.id, {
                        id: cat.id,
                        name: cat.name
                    });
                }

            }

        }

        const categories = Array.from(seen.values())
            .filter(cat => cat.id < 10000)
            .sort((a, b) => a.name.localeCompare(b.name));

        return res.json(categories);

    } catch (error) {

        console.error("[categories] Prowlarr fetch failed:", error.message);
        return res.json([]);

    }

});

// =============================
// INDEXERS API
// =============================

app.get("/api/indexers", async (req, res) => {

    const backend = req.query.backend || "";

    // 1. Если выбран Prowlarr (или Prowlarr настроен и не выбран Jackett)
    if (backend !== "jackett" && PROWLARR_URL && PROWLARR_API_KEY) {

        try {

            const parsed = new URL(`${PROWLARR_URL}/api/v1/indexer`);
            parsed.searchParams.set("apikey", PROWLARR_API_KEY);

            const response = await axios.get(parsed.toString(), { timeout: 10000 });

            const data = response.data || [];

            const indexers = Array.isArray(data)
                ? data
                    .filter(item => item.enabled !== false)
                    .map(item => ({
                        id: String(item.id),
                        name: item.name || item.implementationName || String(item.id),
                        type: "",
                        icon: ""
                    }))
                : [];

            setProwlarrIndexerMap(data);

            return res.json(indexers);

        } catch (error) {

            console.error("[indexers] Prowlarr fetch failed:", error.message);

        }

    }

    // Если был явно выбран Prowlarr — не падаем на Jackett
    if (backend === "prowlarr") {
        return res.json([]);
    }

    // 2. Fallback на Jackett
    let indexers = [];

    if (process.env.JACKETT_INDEXERS) {

        const NAME_MAP = {
            "anidub": "AniDUB",
            "anilibria": "Anilibria",
            "bigfangroup": "BigFANGroup",
            "kinozal": "Kinozal",
            "limetorrents": "LimeTorrents",
            "lostfilm": "LostFilm.tv",
            "megapeer": "MegaPeer",
            "metaltracker": "Metal Tracker",
            "noname-club": "NoNaMe Club",
            "rustorka": "Rustorka",
            "rutor": "RuTor",
            "rutracker": "RuTracker.org",
            "rutracker-ru": "RuTracker.RU",
            "tapochek": "Tapochek"
        };

        indexers = process.env.JACKETT_INDEXERS
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
            .map(id => ({
                id,
                name: NAME_MAP[id] || id,
                type: "",
                icon: ""
            }));

        return res.json(indexers);

    }

    // 2. Попытка через Jackett API (требуется сессионная cookie)
    try {

        const data = await fetchWithCookie(

            `${JACKETT_URL}/api/v2.0/indexers`,

            API_KEY

        );

        let raw = data || [];

        if (!Array.isArray(raw)) {

            raw = raw?.Indexers || raw?.indexers
                || raw?.ConfiguredIndexers || raw?.configuredIndexers
                || [];

            if (!Array.isArray(raw) && typeof raw === "object" && raw !== null) {

                const found = Object.values(raw).find(Array.isArray);
                if (found) raw = found;

            }

        }

        if (!Array.isArray(raw)) raw = [];

        indexers = raw
            .filter(item => item.configured !== false)
            .map(item => ({

                id: item.id,
                name: item.name || item.title || item.id,
                type: item.type || "",
                icon: item.icon || ""

            }));

    } catch (error) {

        console.error("[indexers] API fetch failed:", error.message);

    }

    res.json(indexers);

});

function fetchWithCookie(url, apikey) {

    return new Promise((resolve) => {

        const parsed = new URL(url);
        parsed.searchParams.set("apikey", apikey);

        const options = {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            method: "GET",
            timeout: 5000,
            headers: {
                "Cookie": `apikey=${apikey}`,
                "User-Agent": "TorrentSearch/1.0"
            }
        };

        const transport = parsed.protocol === "https:" ? https : http;

        const req = transport.request(options, (response) => {

            // Любой не-200 — не JSON → null
            if (response.statusCode !== 200) {
                return resolve(null);
            }

            let body = "";
            response.on("data", chunk => body += chunk);
            response.on("end", () => {
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve(null);
                }
            });

        });

        req.on("error", () => resolve(null));
        req.on("timeout", () => { req.destroy(); resolve(null); });

        req.end();

    });

}

// =============================
// SEARCH API
// =============================

app.get("/api/search", async (req, res) => {

    const query = (req.query.q || "").trim();

    if (!query) {
        return res.json([]);
    }

    const backend = req.query.backend || "";

    const trackers = (req.query.trackers || "").trim();

    const trackerList = trackers ? trackers.split(",").map(s => s.trim()).filter(Boolean) : [];

    // Собираем ошибки трекеров, чтобы показать пользователю, что именно не сработало
    const searchErrors = [];

    const addError = (indexer, err) => {
        const message = summarizeError(err);
        const exists = searchErrors.some(e => e.indexer === indexer && e.message === message);
        if (!exists) {
            searchErrors.push({ indexer, message });
        }
    };

    // 1. Если выбран Prowlarr (или Prowlarr настроен и не выбран Jackett)
    if (backend !== "jackett" && PROWLARR_URL && PROWLARR_API_KEY) {

        // Шаг 1 — Быстрый массовый запрос (fast path)
        let fastResults = null;
        try {

            const searchUrl = new URL(`${PROWLARR_URL}/api/v1/search`);
            searchUrl.searchParams.set("apikey", PROWLARR_API_KEY);
            searchUrl.searchParams.set("query", query);

            if (trackerList.length > 0) {
                trackerList.forEach(id => searchUrl.searchParams.append("indexerIds", id));
            }

            const categories = (req.query.categories || "").trim();
            if (categories) {
                categories.split(",").map(s => s.trim()).filter(Boolean).forEach(cid => {
                    searchUrl.searchParams.append("categories", cid);
                });
            }

            const response = await axios.get(searchUrl.toString(), { timeout: 60000 });

            const rawData = response.data || [];

            // Если Prowlarr вернул пустой результат или ошибку — пробуем ещё раз
            if (!rawData || (Array.isArray(rawData) && rawData.length === 0) || rawData.error || rawData.message) {

                console.log("[search] Prowlarr вернул пустой/ошибку, повтор через 2с...");

                if (rawData && (rawData.message || rawData.error)) {
                    const parsed = parseIndexerErrors(String(rawData.message || rawData.error));
                    if (parsed.length > 0) parsed.forEach(e => addError(e.indexer, e.message));
                    else addError("Prowlarr", rawData.message || rawData.error);
                }

                await new Promise(r => setTimeout(r, 2000));

                const retryResponse = await axios.get(searchUrl.toString(), { timeout: 60000 });

                const retryData = retryResponse.data || [];

                if (retryData && (Array.isArray(retryData) ? retryData.length : !retryData.error)) {

                    const results = (Array.isArray(retryData) ? retryData : [])
                        .map(normalizeProwlarr)
                        .sort((a, b) => b.seeders - a.seeders);

                    if (results.length > 0) {
                        fastResults = results;
                    }

                }

            } else {

                fastResults = (Array.isArray(rawData) ? rawData : [])
                    .map(normalizeProwlarr)
                    .sort((a, b) => b.seeders - a.seeders);

            }

        } catch (error) {

            console.error("\n===== PROWLARR ERROR =====");
            console.error(error.message);
            console.error("===========================\n");

            const rawErr = error?.response?.data?.message || error?.response?.data?.error || error?.message || "";
            const parsed = parseIndexerErrors(String(rawErr));
            if (parsed.length > 0) parsed.forEach(e => addError(e.indexer, e.message));
            else addError("Prowlarr", error);

        }

        if (fastResults) {
            return res.json({ results: fastResults, errors: searchErrors });
        }

        // Шаг 2 — Fault-tolerant fallback: индивидуальные запросы к каждому трекеру
        if (trackerList.length > 0) {

            console.log("[search] Fallback на индивидуальные запросы к трекерам...");

            try {

                const categories = (req.query.categories || "").trim();
                const categoryList = categories ? categories.split(",").map(s => s.trim()).filter(Boolean) : [];

                const promises = trackerList.map(id =>
                    searchSingleIndexer(query, id, categoryList)
                        .catch(err => {
                            const name = prowlarrIndexerMap.get(String(id)) || id;
                            console.warn("[search] Запрос к трекеру не удался:", name, "-", err?.message || "неизвестная ошибка");
                            addError(name, err);
                            return [];
                        })
                );

                const settled = await Promise.all(promises);

                let allResults = [];

                for (const arr of settled) {

                    if (Array.isArray(arr) && arr.length > 0) {

                        allResults.push(...arr);

                    }

                }

                if (allResults.length > 0) {

                    allResults.sort((a, b) => b.seeders - a.seeders);

                    return res.json({ results: allResults, errors: searchErrors });

                }

            } catch (fallbackError) {

                console.error("[search] Ошибка fallback:", fallbackError.message);

                addError("Prowlarr", fallbackError);

            }

        }

    }

    // Если был явно выбран Prowlarr — не падаем на Jackett
    if (backend === "prowlarr") {
        return res.json({ results: [], errors: searchErrors });
    }

    // 2. Fallback на Jackett
    // Если backend явно jackett — используем выбранные трекеры как есть
    // Если сюда попали после Prowlarr (backend пустой) — очищаем ID, т.к. у Prowlarr они числовые
    const jackettTrackerList = (backend === "jackett" || !PROWLARR_URL || !PROWLARR_API_KEY)
        ? trackerList
        : [];

    try {

        let allResults = [];

        if (jackettTrackerList.length === 0) {
            // Поиск по всем индексаторам
            const response = await axios.get(
                `${JACKETT_URL}/api/v2.0/indexers/all/results`,
                { params: { apikey: API_KEY, Query: query }, timeout: 30000 }
            );
            allResults = response.data.Results || [];

        } else if (jackettTrackerList.length === 1) {

            console.log("[search] Searching SINGLE indexer: %s", jackettTrackerList[0]);
            // Поиск по одному индексатору
            const response = await axios.get(
                `${JACKETT_URL}/api/v2.0/indexers/${jackettTrackerList[0]}/results`,
                { params: { apikey: API_KEY, Query: query }, timeout: 30000 }
            );
            allResults = response.data.Results || [];

        } else {

            // Поиск по нескольким индексаторам — параллельные запросы
            const requests = jackettTrackerList.map(id =>
                axios.get(
                    `${JACKETT_URL}/api/v2.0/indexers/${id}/results`,
                    { params: { apikey: API_KEY, Query: query }, timeout: 30000 }
                ).then(r => r.data.Results || []).catch(() => [])
            );
            const nested = await Promise.all(requests);
            for (const arr of nested) {
                allResults.push(...arr);
            }

        }

        const results = allResults
            .map(normalize)
            .sort((a, b) => b.seeders - a.seeders);

        res.json({ results, errors: searchErrors });

    }
    catch (error) {

        console.error("\n===== JACKETT ERROR =====");

        if (error.response) {

            console.error("Status:", error.response.status);
            console.error(error.response.data);

        } else {

            console.error(error.message);

        }

        console.error("=========================\n");

        const errMsg = summarizeError(error, "Jackett не ответил");

        res.status(500).json({
            error: true,
            message: errMsg,
            errors: searchErrors
        });

    }

});


// =============================
// FAVORITES (server-side storage)
// =============================

async function readFavoritesFile() {

    try {

        const raw = await fsp.readFile(FAVORITES_FILE, "utf8");

        const parsed = JSON.parse(raw);

        return Array.isArray(parsed) ? parsed : [];

    } catch (err) {

        if (err.code === "ENOENT") return [];

        console.error("readFavoritesFile error:", err);

        return [];

    }

}

async function writeFavoritesFile(list) {

    await fsp.mkdir(path.dirname(FAVORITES_FILE), { recursive: true });

    const tmp = `${FAVORITES_FILE}.tmp`;

    await fsp.writeFile(tmp, JSON.stringify(list, null, 2), "utf8");

    await fsp.rename(tmp, FAVORITES_FILE);

}

app.get("/api/favorites", async (req, res) => {

    try {

        const favorites = await readFavoritesFile();

        res.json({ favorites });

    } catch (err) {

        console.error("GET /api/favorites error:", err);

        res.status(500).json({ error: true, message: "Ошибка чтения избранного" });

    }

});

app.post("/api/favorites", async (req, res) => {

    try {

        const list = req.body && req.body.favorites;

        if (!Array.isArray(list)) {

            return res.status(400).json({ error: true, message: "favorites должен быть массивом" });

        }

        await writeFavoritesFile(list);

        res.json({ ok: true, count: list.length });

    } catch (err) {

        console.error("POST /api/favorites error:", err);

        res.status(500).json({ error: true, message: "Ошибка сохранения избранного" });

    }

});


// =============================
// START SERVER
// =============================

const server = app.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("==================================");
    console.log(" Torrent Search");
    console.log("==================================");
    console.log(` Local: http://localhost:${PORT}`);
    console.log(` Search: http://localhost:${PORT}/api/search?q=test`);
    console.log(` Indexers: http://localhost:${PORT}/api/indexers`);
    console.log(` Favorites: ${FAVORITES_FILE}`);

    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {

        for (const iface of interfaces[name] || []) {

            if (iface.family === "IPv4" && !iface.internal) {

                console.log(` LAN: http://${iface.address}:${PORT}`);

            }

        }

    }

    console.log("==================================");
    console.log("");

    // Call warmup after server starts
    warmupProwlarr();

});

// Retry if port is temporarily in use (TIME_WAIT)
server.on("error", (err) => {

    if (err.code === "EADDRINUSE") {

        console.error(`Port ${PORT} is in use, retrying in 3s...`);

        setTimeout(() => {

            server.close();

            server.listen(PORT, "0.0.0.0");

        }, 3000);

    } else {

        console.error("Server error:", err);

    }

});