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
        this.trackerDropdown = document.getElementById("trackerDropdown");

        this.isSearching = false;
        this.activeBackend = "prowlarr";
        this.trackerDropdownOpen = false;
        this.selectedTrackers = new Set();
        this.indexers = [];
        this.indexersLoaded = false;
        this.resultsData = [];
        this.sortBy = "date";
        this.sortOrder = "desc";
        this.hiddenTrackers = new Set();
        this.loaderInterval = null;
        this.currentPage = 0;
        this.pageSize = 10;

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
        // TRACKER DROPDOWN — открывается при фокусе на поиске
        // ==========================

        this.input.addEventListener("focus", () => {
            if (!this.trackerDropdownOpen) {
                this.openTrackerDropdown();
            }
        });

        document.addEventListener("click", (e) => {
            if (
                this.trackerDropdownOpen &&
                !this.trackerDropdown?.contains(e.target) &&
                !e.target.closest('.search-box') &&
                e.target !== this.searchFab &&
                !this.searchFab?.contains(e.target)
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

                this.currentPage = 0;

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

            this.input.value = "";

            this.searchButton.classList.remove("visible");

            this.input.focus();

            this.openTrackerDropdown();

        });

        // ==========================
        // SCROLLBAR AUTO-HIDE
        // ==========================

        let scrollTimeout;
        this.results.addEventListener("scroll", () => {
            this.results.classList.add("scrolling");
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                this.results.classList.remove("scrolling");
            }, 300);
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

            this.stopLoader();

            this.isSearching = false;

            this.searchButton.disabled = false;

        }

    }

    render(data) {

        this.stopLoader();

        this.resultsData = data;

        this.currentPage = 0;

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
        // PAGINATION
        // ==========================

        const totalPages = Math.max(1, Math.ceil(data.length / this.pageSize));

        if (this.currentPage >= totalPages) this.currentPage = totalPages - 1;
        if (this.currentPage < 0) this.currentPage = 0;

        const start = this.currentPage * this.pageSize;
        const pageData = data.slice(start, start + this.pageSize);

        // ==========================
        // RENDER
        // ==========================

        this.results.innerHTML = "";

        this.updateCounter(data.length);

        document.querySelector(".header").classList.toggle(
            "has-results",
            data.length > 0
        );

        // Search panel is always visible — no hidden-search toggle

        if (!data.length) {

            this.showNoResults();

        } else {

            pageData.forEach(item => {

                const node = this.createCard(item);

                this.results.appendChild(node);

            });

            this.createIcons();

        }

        // ==========================
        // PAGINATION CONTROLS
        // ==========================

        this.renderPagination(data.length);

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
            this.currentPage = 0;
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
                this.currentPage = 0;
                this.applySortAndFilter();
                this.closeSettings();
            });

            filterBlock.appendChild(label);

        });

        container.appendChild(filterBlock);

    }

    showLoader() {

        const phrases = [
            "Ой, да иду я, иду... \u{1F6B6}\u200D\u{2642}\uFE0F",
            "Ну началось... \u{1F644}",
            "Листаю интернет-каталоги \u{1F971}",
            "Гуглю на минималках. \u{1F422}",
            "Погоди, чаёк налью... \u{2615}",
            "Стянем по-быстрому и спать. \u{1F6CC}",
            "А волшебное слово? \u{1F928}",
            "Потрошим цифровые галеоны! \u{1F3F4}\u200D\u2620\uFE0F",
            "Пробиваем по пиратским картам... \u{1F5FA}\uFE0F",
            "Йо-хо-хо, ща найдём! \u{1F37B}",
            "Трясём сундуки мертвеца... \u{1FA99}",
            "Направляем подзорную трубу... \u{1F9ED}",
            "Роем берег сокровищ \u{1F3DD}\uFE0F",
            "Открываем портал в терабайты... \u{1F300}",
            "Пронзаем ткань интернета \u{1F30C}",
            "Сплавляем ядра процессора... \u{1F525}",
            "Консультируемся с высшим разумом \u{1F47D}",
            "Инициализируем магию вне Хогвартса \u{1FA84}",
            "Сканируем ноосферу... \u{1F9E0}",
            "Шерстим закрома интернета... \u{1F575}\uFE0F\u200D\u2642\uFE0F",
            "Проводим обыск на серверах \u{1F4C2}",
            "Снимаем отпечатки с сидов... \u{1F5DD}\uFE0F",
            "Поднимаем старые архивы \u{1F4DC}",
            "Ищем лазейку в заборе... \u{1F92B}",
            "Работаем под прикрытием \u{1F60E}",
            "Копаем под провайдера... \u{1F50C}"
        ];

        let index = Math.floor(Math.random() * phrases.length);

        this.results.innerHTML = `
<section class="empty">
<div class="empty-icon pulse">
<i data-lucide="loader-circle" class="loader-icon"></i>
</div>
<h2 id="loaderPhrase">
${phrases[index]}
</h2>
</section>
`;

        this.createIcons();

        this.loaderInterval = setInterval(() => {
            index = (index + 1) % phrases.length;
            const el = document.getElementById("loaderPhrase");
            if (el) el.textContent = phrases[index];
        }, 3000);

    }

    stopLoader() {

        if (this.loaderInterval) {
            clearInterval(this.loaderInterval);
            this.loaderInterval = null;
        }

    }

    showNoResults() {

        this.stopLoader();

        document.querySelector(".header")?.classList.remove("has-results");

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

            // Remove data-lucide from already-converted SVGs

            // so lucide.createIcons() won't re-process them and detach them from the DOM.

            document.querySelectorAll('svg[data-lucide]').forEach(svg => {

                svg.removeAttribute('data-lucide');

            });

            // Run lucide.createIcons() if there are unconverted

            // <i> elements (non-SVG elements with data-lucide).

            const unconverted = document.querySelectorAll('[data-lucide]:not(svg)');

            if (unconverted.length > 0) {

                lucide.createIcons();

            }

        }

    }

    showError(message = "") {

        this.stopLoader();

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

        this.currentPage = 0;

        this.searchButton.classList.remove("visible");

        this.showEmptyStart();

        this.updateCounter(0);

    }

    showEmptyStart() {

        this.stopLoader();

        document.querySelector(".header")?.classList.remove("has-results");

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

            // Keep focus on search input so mobile keyboard stays open
            this.input.focus();

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

                    // Keep focus on search input so mobile keyboard stays open
                    this.input.focus();

                });

            });

    }

    renderPagination(totalResults) {

        // Remove any existing pagination controls
        const oldPagination = this.results.querySelector(".pagination");
        if (oldPagination) oldPagination.remove();

        const totalPages = Math.max(1, Math.ceil(totalResults / this.pageSize));

        if (totalPages <= 1) return;

        const pagination = document.createElement("div");
        pagination.className = "pagination";

        // First page (edge arrow)
        const firstBtn = document.createElement("button");
        firstBtn.className = "page-btn edge-btn";
        firstBtn.innerHTML = "⏮";
        firstBtn.title = "Первая страница";
        firstBtn.disabled = this.currentPage === 0;
        firstBtn.addEventListener("click", () => this.goToPage(0));

        // Previous page
        const prevBtn = document.createElement("button");
        prevBtn.className = "page-btn prev-btn";
        prevBtn.innerHTML = "←";
        prevBtn.title = "Предыдущая страница";
        prevBtn.disabled = this.currentPage === 0;
        prevBtn.addEventListener("click", () => this.goToPage(this.currentPage - 1));

        // Page info
        const pageInfo = document.createElement("span");
        pageInfo.className = "page-info";
        pageInfo.textContent = `${this.currentPage + 1} / ${totalPages}`;

        // Next page
        const nextBtn = document.createElement("button");
        nextBtn.className = "page-btn next-btn";
        nextBtn.innerHTML = "→";
        nextBtn.title = "Следующая страница";
        nextBtn.disabled = this.currentPage >= totalPages - 1;
        nextBtn.addEventListener("click", () => this.goToPage(this.currentPage + 1));

        // Last page (edge arrow)
        const lastBtn = document.createElement("button");
        lastBtn.className = "page-btn edge-btn";
        lastBtn.innerHTML = "⏭";
        lastBtn.title = "Последняя страница";
        lastBtn.disabled = this.currentPage >= totalPages - 1;
        lastBtn.addEventListener("click", () => this.goToPage(totalPages - 1));

        // Group edge arrows on left/right, navigation in center
        const leftGroup = document.createElement("div");
        leftGroup.className = "page-group page-group-left";
        leftGroup.appendChild(firstBtn);

        const centerGroup = document.createElement("div");
        centerGroup.className = "page-group page-group-center";
        centerGroup.appendChild(prevBtn);
        centerGroup.appendChild(pageInfo);
        centerGroup.appendChild(nextBtn);

        const rightGroup = document.createElement("div");
        rightGroup.className = "page-group page-group-right";
        rightGroup.appendChild(lastBtn);

        pagination.appendChild(leftGroup);
        pagination.appendChild(centerGroup);
        pagination.appendChild(rightGroup);

        this.results.appendChild(pagination);
    }

    goToPage(page) {
        this.currentPage = page;
        this.applySortAndFilter();
        // Scroll results container to top
        this.results.scrollTop = 0;
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