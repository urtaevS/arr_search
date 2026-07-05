import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import http from "http";
import https from "https";
import { fileURLToPath } from "url";
import os from "os";
import iconv from "iconv-lite";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const JACKETT_URL = process.env.JACKETT_URL;
const API_KEY = process.env.JACKETT_API_KEY;

const PROWLARR_URL = process.env.PROWLARR_URL;
const PROWLARR_API_KEY = process.env.PROWLARR_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================
// STATIC FILES
// =============================

app.use(express.static(__dirname));

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

        category: Array.isArray(item.categories) ? item.categories.join(", ") : "",

        tags: []

    };

}
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

            const data = await fetchDecodedJSON(parsed.toString(), { timeout: 10000 });

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

/**
 * Fetch JSON from an API endpoint, automatically detecting and fixing
 * character encoding issues (e.g., Windows-1251 decoded as UTF-8).
 * Uses ArrayBuffer response type to get raw bytes, then decodes with
 * fallback chain: UTF-8 → Windows-1251 → KOI8-R.
 */
async function fetchDecodedJSON(url, options = {}) {

    const response = await axios.get(url, {
        ...options,
        responseType: "arraybuffer"
    });

    const buffer = Buffer.from(response.data);

    // 1. Try UTF-8 first
    let text = buffer.toString("utf-8");

    // 2. If replacement character detected, try Windows-1251
    if (text.includes("\uFFFD")) {

        console.log("[encoding] UTF-8 decoding produced replacement chars, trying Windows-1251...");

        try {

            const win1251text = iconv.decode(buffer, "win1251");

            // Use Windows-1251 if it produces no replacement chars, or fewer of them
            if (!win1251text.includes("\uFFFD") ||
                win1251text.indexOf("\uFFFD") < text.indexOf("\uFFFD")) {
                console.log("[encoding] Using Windows-1251 decoding");
                text = win1251text;
            }

        } catch (decodeErr) {
            console.log("[encoding] Windows-1251 decoding failed:", decodeErr.message);
        }

    }

    // 3. If still has replacement chars, try KOI8-R
    if (text.includes("\uFFFD")) {

        console.log("[encoding] Still has replacement chars, trying KOI8-R...");

        try {

            const koi8text = iconv.decode(buffer, "koi8-r");

            if (!koi8text.includes("\uFFFD") ||
                koi8text.indexOf("\uFFFD") < text.indexOf("\uFFFD")) {
                console.log("[encoding] Using KOI8-R decoding");
                text = koi8text;
            }

        } catch (decodeErr) {
            console.log("[encoding] KOI8-R decoding failed:", decodeErr.message);
        }

    }

    // Parse as JSON
    try {
        return JSON.parse(text);
    } catch (parseErr) {
        console.error("[encoding] JSON parse failed after all decoding attempts:", parseErr.message);
        throw parseErr;
    }

}

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

            const chunks = [];
            response.on("data", chunk => chunks.push(chunk));
            response.on("end", () => {

                const buffer = Buffer.concat(chunks);

                // Try UTF-8 first
                let text = buffer.toString("utf-8");

                // If replacement character detected, try Windows-1251
                if (text.includes("\uFFFD")) {
                    try {
                        const win1251text = iconv.decode(buffer, "win1251");
                        if (!win1251text.includes("\uFFFD") ||
                            win1251text.indexOf("\uFFFD") < text.indexOf("\uFFFD")) {
                            text = win1251text;
                        }
                    } catch {}
                }

                // If still has replacement chars, try KOI8-R
                if (text.includes("\uFFFD")) {
                    try {
                        const koi8text = iconv.decode(buffer, "koi8-r");
                        if (!koi8text.includes("\uFFFD") ||
                            koi8text.indexOf("\uFFFD") < text.indexOf("\uFFFD")) {
                            text = koi8text;
                        }
                    } catch {}
                }

                try {
                    resolve(JSON.parse(text));
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

    // 1. Если выбран Prowlarr (или Prowlarr настроен и не выбран Jackett)
    if (backend !== "jackett" && PROWLARR_URL && PROWLARR_API_KEY) {

        try {

            const searchUrl = new URL(`${PROWLARR_URL}/api/v1/search`);
            searchUrl.searchParams.set("apikey", PROWLARR_API_KEY);
            searchUrl.searchParams.set("query", query);

            if (trackerList.length > 0) {
                trackerList.forEach(id => searchUrl.searchParams.append("indexerIds", id));
            }

            const rawData = await fetchDecodedJSON(searchUrl.toString(), { timeout: 60000 });

            const results = (Array.isArray(rawData) ? rawData : [])
                .map(normalizeProwlarr)
                .sort((a, b) => b.seeders - a.seeders);

            return res.json(results);

        } catch (error) {

            console.error("\n===== PROWLARR ERROR =====");
            console.error(error.message);
            console.error("===========================\n");

            // fallback to Jackett below

        }

    }

    // Если был явно выбран Prowlarr — не падаем на Jackett
    if (backend === "prowlarr") {
        return res.json([]);
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
            const data = await fetchDecodedJSON(
                `${JACKETT_URL}/api/v2.0/indexers/all/results`,
                { params: { apikey: API_KEY, Query: query }, timeout: 30000 }
            );
            allResults = data.Results || [];

        } else if (jackettTrackerList.length === 1) {

            console.log("[search] Searching SINGLE indexer: %s", jackettTrackerList[0]);
            // Поиск по одному индексатору
            const data = await fetchDecodedJSON(
                `${JACKETT_URL}/api/v2.0/indexers/${jackettTrackerList[0]}/results`,
                { params: { apikey: API_KEY, Query: query }, timeout: 30000 }
            );
            allResults = data.Results || [];

        } else {

            // Поиск по нескольким индексаторам — параллельные запросы
            const requests = jackettTrackerList.map(id =>
                fetchDecodedJSON(
                    `${JACKETT_URL}/api/v2.0/indexers/${id}/results`,
                    { params: { apikey: API_KEY, Query: query }, timeout: 30000 }
                ).then(r => r?.Results || []).catch(() => [])
            );
            const nested = await Promise.all(requests);
            for (const arr of nested) {
                allResults.push(...arr);
            }

        }

        const results = allResults
            .map(normalize)
            .sort((a, b) => b.seeders - a.seeders);

        res.json(results);

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

        res.status(500).json({
            error: true,
            message: "Jackett request failed"
        });

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