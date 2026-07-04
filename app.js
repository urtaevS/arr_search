// =====================================================
// Torrent Search
// =====================================================

class TorrentApp {

    constructor() {

        this.results = document.getElementById("results");
        this.template = document.getElementById("torrentCard");

        this.input = document.getElementById("searchInput");
        this.counter = document.getElementById("resultCountRight");
        this.searchButton = document.getElementById("searchButton");
        this.settingsOverlay = document.getElementById("settingsOverlay");
        this.settingsClose = document.getElementById("settingsClose");
        this.searchFab = document.getElementById("searchFab");
        this.searchPanel = document.querySelector(".search-panel");
        this.trackerBtn = document.getElementById("trackerFilterBtn");
        this.trackerDropdown = document.getElementById("trackerDropdown");

        this.isSearching = false;
        this.activeBackend = "jackett";
        this.trackerDropdownOpen = false;
        this.selectedTrackers = new Set();
        this.indexers = [];
        this.indexersLoaded = false;
        this.resultsData = [];
        this.sortBy = "date";
        this.sortOrder = "desc";
        this.hiddenTrackers = new Set();

    }

    init() {

        this.bindEvents();

        this.loadIndexers();

        this.showEmptyStart();

    }

    async loadIndexers() {

        try {

            const res = await fetch(`/api/indexers?backend=${this.activeBackend}`);

            if (!res.ok) throw new Error("HTTP " + res.status);

            this.indexers = await res.json();

            this.selectedTrackers.clear();

            // По умолчанию выбраны все трекеры
            this.indexers.forEach(t => this.selectedTrackers.add(t.id));

            this.indexersLoaded = true;

        }
        catch (err) {

            console.error("Failed to load indexers:", err);

        }

    }

    bindEvents() {

        this.searchButton.addEventListener("click", () => {

            this.search();

        });

        this.input.addEventListener("keydown", (e) => {

            if (e.key === "Enter") {

                e.preventDefault();

                this.search();

                this.input.blur();

            }

        });

        // Показываем / скрываем кнопку поиска (arrow-right) при вводе текста
        this.input.addEventListener("input", () => {
            const hasText = this.input.value.trim().length > 0;
            this.searchButton.classList.toggle("visible", hasText);
        });

        // ==========================
        // SETTINGS PANEL — открывается по клику на счётчик результатов
        // ==========================

        document.querySelectorAll(".header-count").forEach(el => {
            el.addEventListener("click", () => {
                this.openSettings();
            });
        });

        this.settingsClose.addEventListener("click", () => {

            this.closeSettings();

        });

        this.settingsOverlay.addEventListener("click", (e) => {

            if (e.target === this.settingsOverlay) {

                this.closeSettings();

            }

        });

        // ==========================
        // TRACKER DROPDOWN
        // ==========================

        this.trackerBtn.addEventListener("click", (e) => {

            e.stopPropagation();

            this.toggleTrackerDropdown();

        });

        document.addEventListener("click", (e) => {

            if (
                this.trackerDropdownOpen &&
                !this.trackerDropdown.contains(e.target) &&
                e.target !== this.trackerBtn &&
                !this.trackerBtn.contains(e.target)
            ) {
                this.closeTrackerDropdown();
            }

        });

        document.addEventListener("keydown", (e) => {

            if (e.key === "Escape" && this.trackerDropdownOpen) {

                this.closeTrackerDropdown();

            }

        });

        // ==========================
        // SORT TOGGLE
        // ==========================

        const handleSort = (btn) => {

            btn.addEventListener("click", () => {

                const field = btn.dataset.sort;

                if (this.sortBy === field) {

                    this.sortOrder = this.sortOrder === "desc" ? "asc" : "desc";

                } else {

                    this.sortBy = field;

                    this.sortOrder = "desc";

                }

                this.updateSortUI();

                this.applySortAndFilter();

            });

        };

        document.querySelectorAll(".header-sort").forEach(handleSort);

        // ==========================
        // CLEAR RESULTS
        // ==========================

        document.getElementById("clearBtn")?.addEventListener("click", () => {

            this.clearResults();

        });

        // ==========================
        // BACKEND TOGGLE — обработчик на сам dropdown (делегирование)

        // ==========================
        // SEARCH FAB
        // ==========================

        this.searchFab.addEventListener("click", () => {

            this.searchPanel.classList.remove("hidden-search");

            this.searchFab.classList.remove("visible");

            this.input.value = "";

            this.searchButton.classList.remove("visible");

            this.input.focus();

        });

    }

    async search() {

        if (this.isSearching) return;

        const query = this.input.value.trim();

        if (!query) {

            this.showEmptyStart();

            this.updateCounter(0);

            return;

        }

        this.closeSettings();

        this.closeTrackerDropdown();

        this.isSearching = true;

        this.searchButton.disabled = true;

        this.showLoader();

        const trackersParam = this.selectedTrackers.size > 0
            ? `&trackers=${[...this.selectedTrackers].join(",")}`
            : "";

        try {

            const response = await fetch(

                `/api/search?q=${encodeURIComponent(query)}${trackersParam}&backend=${this.activeBackend}`

            );

            if (!response.ok) {

                throw new Error("HTTP " + response.status);

            }

            const data = await response.json();

            this.render(data);

        }
        catch (error) {

            console.error(error);

            this.showError(error.message);

        }
        finally {

            this.isSearching = false;

            this.searchButton.disabled = false;

        }

    }

    render(data) {

        this.resultsData = data;

        this.applySortAndFilter();

    }

    applySortAndFilter() {

        let data = [...this.resultsData];

        // ==========================
        // FILTER
        // ==========================

        if (this.hiddenTrackers.size > 0) {

            data = data.filter(item => !this.hiddenTrackers.has(item.tracker));

        }

        // ==========================
        // SORT
        // ==========================

        data.sort((a, b) => {

            let cmp = 0;

            switch (this.sortBy) {

                case "date": {

                    const da = a.publishDate ? new Date(a.publishDate).getTime() : 0;

                    const db = b.publishDate ? new Date(b.publishDate).getTime() : 0;

                    cmp = da - db;

                    break;

                }

                case "size":

                    cmp = (a.sizeBytes || 0) - (b.sizeBytes || 0);

                    break;

                case "seeders":

                    cmp = (a.seeders || 0) - (b.seeders || 0);

                    break;

                case "peers":

                    cmp = (a.leechers || 0) - (b.leechers || 0);

                    break;

                case "tracker":

                    cmp = (a.tracker || "").localeCompare(b.tracker || "");

                    break;

            }

            return this.sortOrder === "desc" ? -cmp : cmp;

        });

        // ==========================
        // RENDER
        // ==========================

        this.results.innerHTML = "";

        this.updateCounter(data.length);

        document.querySelector(".header").classList.toggle(
            "has-results",
            data.length > 0
        );

        if (data.length > 0) {

            this.searchPanel.classList.add("hidden-search");

            this.searchFab.classList.add("visible");

        } else {

            this.searchPanel.classList.remove("hidden-search");

            this.searchFab.classList.remove("visible");

        }

        if (!data.length) {

            this.showNoResults();

        } else {

            data.forEach(item => {

                const node = this.createCard(item);

                this.results.appendChild(node);

            });

            this.createIcons();

        }

        // ==========================
        // UPDATE SETTINGS CONTENT
        // ==========================

        if (this.settingsOverlay.classList.contains("open")) {

            this.populateTrackerFilter();

        }

    }

    openSettings() {

        this.updateSortUI();

        this.populateTrackerFilter();

        this.settingsOverlay.classList.add("open");

        document.body.style.overflow = "hidden";

        this.createIcons();

    }

    closeSettings() {

        this.settingsOverlay.classList.remove("open");

        document.body.style.overflow = "";

    }

    updateSortUI() {

        document.querySelectorAll(".header-sort").forEach(btn => {

            const field = btn.dataset.sort;

            const isActive = field === this.sortBy;

            btn.classList.toggle("active", isActive);

            const dir = btn.querySelector(".sort-dir");

            if (dir) {

                dir.classList.toggle("asc", isActive && this.sortOrder === "asc");

            }

        });

    }

    populateTrackerFilter() {

        const container = document.getElementById("trackerFilter");

        // Удаляем существующий блок фильтра (если есть)
        const existingFilter = container.querySelector(".results-filter-block");
        if (existingFilter) existingFilter.remove();

        const trackers = [...new Set(this.resultsData.map(item => item.tracker))].sort();

        // Прячем заголовок если нет результатов
        const titleEl = document.getElementById("filterTitle");
        if (titleEl) titleEl.classList.remove("visible");

        if (trackers.length === 0) return;

        // Создаём блок фильтра
        const filterBlock = document.createElement("div");
        filterBlock.className = "results-filter-block";

        // Показываем заголовок в хедере
        if (titleEl) titleEl.classList.add("visible");

        // Определяем, показываем ли все трекеры
        const showingAll = this.hiddenTrackers.size === 0;

        // ==========================
        // ALL TRACKERS (radio)
        // ==========================

        const allLabel = document.createElement("label");
        allLabel.className = "tracker-option select-all";

        const allRadio = document.createElement("input");
        allRadio.type = "radio";
        allRadio.name = "trackerFilter";
        allRadio.value = "";
        allRadio.checked = showingAll;

        const allSpan = document.createElement("span");
        allSpan.textContent = "Все трекеры";
        allSpan.style.fontWeight = "600";

        allLabel.appendChild(allRadio);
        allLabel.appendChild(allSpan);

        allLabel.addEventListener("click", (e) => {
            e.preventDefault();
            this.hiddenTrackers.clear();
            this.applySortAndFilter();
            this.closeSettings();
        });

        filterBlock.appendChild(allLabel);

        // ==========================
        // INDIVIDUAL TRACKERS (radio)
        // ==========================

        trackers.forEach(tracker => {

            const count = this.resultsData.filter(item => item.tracker === tracker).length;
            // Радио активно, если скрыты все трекеры, кроме этого
            const isActive = !showingAll &&
                this.hiddenTrackers.size === trackers.length - 1 &&
                !this.hiddenTrackers.has(tracker);

            const label = document.createElement("label");
            label.className = "tracker-option";

            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "trackerFilter";
            radio.value = tracker;
            radio.checked = isActive;

            const span = document.createElement("span");
            span.textContent = tracker;

            const badge = document.createElement("span");
            badge.className = "tracker-badge";
            badge.textContent = count;

            label.appendChild(radio);
            label.appendChild(span);
            label.appendChild(badge);

            label.addEventListener("click", (e) => {
                e.preventDefault();
                // Скрываем все трекеры, кроме выбранного
                this.hiddenTrackers = new Set(trackers.filter(t => t !== tracker));
                this.applySortAndFilter();
                this.closeSettings();
            });

            filterBlock.appendChild(label);

        });

        container.appendChild(filterBlock);

    }

    showLoader() {

        this.results.innerHTML = `

<section class="empty">

<div class="empty-icon pulse">

<i data-lucide="loader-circle" class="loader-icon"></i>

</div>

<h2>

Запускаю поиск

</h2>

<p style="color:var(--text-secondary);font-size:14px;">

${this.escapeHtml(this.input.value)}

</p>

</section>

`;

        this.createIcons();

    }

    showNoResults() {

        document.querySelector(".header")?.classList.remove("has-results");

        this.searchPanel.classList.remove("hidden-search");

        this.searchFab.classList.remove("visible");

        this.results.innerHTML = `

<section class="empty">

<div class="empty-icon">

<i data-lucide="search-x"></i>

</div>

<h2>

Ничего не найдено

</h2>

<p>

Попробуйте изменить поисковый запрос.

</p>

</section>

`;

        this.createIcons();

    }

    escapeHtml(str) {

        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

        return String(str).replace(/[&<>"']/g, c => map[c]);

    }

    createIcons() {

        if (window.lucide) {

            lucide.createIcons();

        }

    }

    showError(message = "") {

        document.querySelector(".header")?.classList.remove("has-results");

        this.searchPanel.classList.remove("hidden-search");

        this.searchFab.classList.remove("visible");

        this.results.innerHTML = `

<section class="empty">

<div class="empty-icon">

<i data-lucide="triangle-alert"></i>

</div>

<h2>

Ошибка

</h2>

<p>

${this.escapeHtml(message) || "Не удалось получить результаты поиска."}

</p>

</section>

`;

        this.createIcons();

    }

    toggleBackend() {

        this.activeBackend = this.activeBackend === "jackett" ? "prowlarr" : "jackett";

        const name = this.activeBackend === "jackett" ? "Jackett" : "Prowlarr";

        // Обновляем иконку и title в кнопке (если она есть в DOM)
        const btn = document.getElementById("backendToggle");

        const icon = document.getElementById("backendIcon");

        if (btn) btn.title = name;

        if (icon) {

            icon.src = `icons/${this.activeBackend}.png`;

            icon.alt = name;

        }

        // Перезагружаем список индексаторов для выбранного бэкенда
        this.loadIndexers().then(() => {

            // Если дропдаун открыт — обновляем его содержимое
            if (this.trackerDropdownOpen) {

                this.populateTrackerDropdown();

                this.createIcons();

            }

        });

    }

    clearResults() {

        this.input.value = "";

        this.resultsData = [];

        this.searchButton.classList.remove("visible");

        this.showEmptyStart();

        this.updateCounter(0);

    }

    showEmptyStart() {

        document.querySelector(".header")?.classList.remove("has-results");

        this.searchPanel.classList.remove("hidden-search");

        this.searchFab.classList.remove("visible");

        this.results.innerHTML = `

<section class="empty">

<div class="empty-icon">

<i data-lucide="search"></i>

</div>

<h2>

Начните поиск

</h2>

<p>

Введите название фильма,
сериала,
игры,
программы
или книги.

</p>

</section>

`;

        this.createIcons();

    }

    // =====================================================
    // TRACKER DROPDOWN (pre-search selection)
    // =====================================================

    toggleTrackerDropdown() {

        if (this.trackerDropdownOpen) {

            this.closeTrackerDropdown();

        } else {

            this.openTrackerDropdown();

        }

    }

    openTrackerDropdown() {

        this.trackerDropdownOpen = true;

        this.trackerBtn.innerHTML =
            '<i data-lucide="list-filter-plus"></i>';

        this.populateTrackerDropdown();

        // Position dropdown above search box
        const box = this.searchPanel.querySelector(".search-box").getBoundingClientRect();

        this.trackerDropdown.style.left = box.left + "px";

        this.trackerDropdown.style.width = box.width + "px";

        this.trackerDropdown.style.bottom =
            (window.innerHeight - box.top + 8) + "px";

        this.trackerDropdown.classList.add("open");

        this.createIcons();

    }

    closeTrackerDropdown() {

        this.trackerDropdownOpen = false;

        this.trackerBtn.innerHTML =
            '<i data-lucide="list-filter"></i>';

        this.trackerDropdown.classList.remove("open");

        this.createIcons();

    }

    populateTrackerDropdown() {

        if (!this.indexers.length) {

            this.trackerDropdown.innerHTML =
                `<p style="padding:16px;color:var(--text-secondary);font-size:14px;">Загрузка...</p>`;

            return;

        }

        const allSelected = this.indexers.every(
            t => this.selectedTrackers.has(t.id)
        );

        let html = "";

        // Select All / Deselect All + Backend Toggle

        const backendName = this.activeBackend === "jackett" ? "Jackett" : "Prowlarr";

        html += `<div class="tracker-dropdown-select">

            <button class="tracker-select-all">

                <i data-lucide="${allSelected ? "square-check" : "square-x"}"></i>

                <span>${allSelected ? "Снять всё" : "Выделить всё"}</span>

            </button>

            <button class="backend-toggle" id="backendToggle" title="${backendName}">

                <img src="icons/${this.activeBackend}.png" alt="${backendName}" id="backendIcon">

            </button>

        </div>`;

        // Divider

        html += `<div class="tracker-dropdown-divider"></div>`;

        // Tracker tags

        html += `<div class="tracker-dropdown-tags">`;

        this.indexers.forEach(t => {

            const active = this.selectedTrackers.has(t.id);

            html += `<span class="tracker-tag${active ? " active" : ""}" data-id="${t.id}">${t.name}</span>`;

        });

        html += `</div>`;

        this.trackerDropdown.innerHTML = html;

        // ==========================
        // Bind events
        // ==========================

        // Select All / Deselect All
        const selectAllBtn =
            this.trackerDropdown.querySelector(".tracker-select-all");

        selectAllBtn.addEventListener("click", (e) => {

            e.stopPropagation();

            const allSel = this.indexers.every(
                t => this.selectedTrackers.has(t.id)
            );

            if (allSel) {

                this.selectedTrackers.clear();

            } else {

                this.indexers.forEach(
                    t => this.selectedTrackers.add(t.id)
                );

            }

            this.populateTrackerDropdown();

            this.createIcons();

        });

        // Backend toggle
        const backendBtn =
            this.trackerDropdown.querySelector(".backend-toggle");

        backendBtn?.addEventListener("click", (e) => {

            e.stopPropagation();

            this.toggleBackend();

        });

        // Individual tracker tags
        this.trackerDropdown.querySelectorAll(".tracker-tag")
            .forEach(tag => {

                tag.addEventListener("click", (e) => {

                    e.stopPropagation();

                    const id = tag.dataset.id;

                    if (this.selectedTrackers.has(id)) {

                        this.selectedTrackers.delete(id);

                    } else {

                        this.selectedTrackers.add(id);

                    }

                    this.populateTrackerDropdown();

                    this.createIcons();

                });

            });

    }

    createCard(item) {

        const node =
            this.template.content.cloneNode(true);

        const card =
            node.querySelector(".card");

        // ==========================
        // Title
        // ==========================

        node.querySelector(".torrent-title").textContent =
            item.title;

        // ==========================
        // Tracker
        // ==========================

        node.querySelector(".tracker").textContent =
            item.tracker;

        // ==========================
        // Source icon
        // ==========================

        const sourceIcon =
            node.querySelector(".source-icon");

        if (sourceIcon) {

            if (item.source === "prowlarr") {

                sourceIcon.setAttribute("data-lucide", "zap");

            } else {

                sourceIcon.setAttribute("data-lucide", "ship");

            }

        }

        // ==========================
        // Tracker color
        // ==========================

        const color =
            node.querySelector(".tracker-color");

        if (item.seeders < 50) {

            color.classList.add("danger");

        }
        else if (item.seeders < 150) {

            color.classList.add("warning");

        }

        // ==========================
        // Seeders / Leechers
        // ==========================

        node.querySelector(".seeders").textContent =
            item.seeders;

        node.querySelector(".leechers").textContent =
            item.leechers;

        // ==========================
        // Size
        // ==========================

        node.querySelector(".size").textContent =
            item.size;

        // ==========================
        // Date
        // ==========================

        const dateEl =
            node.querySelector(".date");

        if (item.publishDate) {

            const d = new Date(item.publishDate);

            const options = {
                day: "numeric",
                month: "short",
                year: "numeric"
            };

            dateEl.textContent =
                d.toLocaleDateString("ru-RU", options);

        }
        else {

            dateEl.textContent = "—";

        }

        // ==========================
        // Magnet (copy + toast)
        // ==========================

        const magnetBtn = node.querySelector(".magnet");

        if (!item.magnet) {

            magnetBtn.style.display = "none";

        }
        else {

            magnetBtn.addEventListener("click", (e) => {

                e.stopPropagation();

                this.copyToClipboard(item.magnet);

            });

        }

        // ==========================
        // Скачать torrent
        // ==========================

        node.querySelector(".torrent").addEventListener("click", (e) => {

            e.stopPropagation();

            if (item.torrent) {

                window.open(item.torrent, "_blank");

            }

        });

        // ==========================
        // Страница раздачи
        // ==========================

        node.querySelector(".details").addEventListener("click", (e) => {

            e.stopPropagation();

            if (item.details) {

                window.open(item.details, "_blank");

            }

        });

        return node;

    }

    async copyToClipboard(text) {

        // 1. Modern Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {

            try {

                await navigator.clipboard.writeText(text);

                this.showMagnetCopied();

                return;

            } catch (_) {

                // fallback

            }

        }

        // 2. Fallback: execCommand
        try {

            const textarea = document.createElement("textarea");

            textarea.value = text;

            textarea.style.position = "fixed";

            textarea.style.opacity = "0";

            textarea.style.pointerEvents = "none";

            document.body.appendChild(textarea);

            textarea.select();

            document.execCommand("copy");

            document.body.removeChild(textarea);

            this.showMagnetCopied();

        } catch (_) {

            console.error("Clipboard copy failed");

        }

    }

    showMagnetCopied() {

        const existing =
            document.querySelector(".toast");

        if (existing) existing.remove();

        const toast =
            document.createElement("div");

        toast.className = "toast";

        const title =
            document.createElement("div");

        title.className = "toast-title";

        title.textContent = "Ссылка скопирована";

        toast.appendChild(title);

        document.body.appendChild(toast);

        requestAnimationFrame(() =>
            toast.classList.add("show")
        );

        setTimeout(() => {

            toast.classList.remove("show");

            setTimeout(
                () => toast.remove(),
                300
            );

        }, 6000);

    }

    updateCounter(count) {

        document.querySelectorAll('.header-count .count-number').forEach(el => {
            el.textContent = count;
        });

    }

    plural(value) {

        const mod10 = value % 10;
        const mod100 = value % 100;

        if (mod10 === 1 && mod100 !== 11)
            return "результат";

        if (
            mod10 >= 2 &&
            mod10 <= 4 &&
            (mod100 < 10 || mod100 >= 20)
        )
            return "результата";

        return "результатов";

    }

}

// =====================================
// START
// =====================================

document.addEventListener("DOMContentLoaded", () => {

    const app = new TorrentApp();

    app.init();

    // Register Service Worker for PWA
    if ("serviceWorker" in navigator) {

        navigator.serviceWorker.register("/sw.js");

    }

});