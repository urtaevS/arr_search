// =====================================================
// Torrent Search
// =====================================================

// Показывать ли кнопку «В TorrentMonitor» на карточках результатов.
let TM_BUTTON_ENABLED = true;

class TorrentApp {

    constructor() {

        this.results = document.getElementById("results");
        this.template = document.getElementById("torrentCard");

        this.input = document.getElementById("searchInput");
        this.counter = document.getElementById("resultCountRight");
        this.searchButton = document.getElementById("searchButton");
        this.settingsOverlay = document.getElementById("settingsOverlay");
        this.settingsClose = document.getElementById("settingsClose");
        this.favoritesOverlay = document.getElementById("favoritesOverlay");
        this.favoritesBackdrop = document.getElementById("favoritesBackdrop");
        this.favoritesClose = document.getElementById("favoritesClose");
        this.favoritesList = document.getElementById("favoritesList");
        this.historyOverlay = document.getElementById("historyOverlay");
        this.historyBackdrop = document.getElementById("historyBackdrop");
        this.historyClose = document.getElementById("historyClose");
        this.historyList = document.getElementById("historyList");
        this.historyClear = document.getElementById("historyClear");
        this.searchFab = document.getElementById("searchFab");
        this.searchPanel = document.querySelector(".search-panel");
        this.trackerDropdown = document.getElementById("trackerDropdown");
        this.dock = document.getElementById("dock");
        this.dockHistory = document.getElementById("dockHistory");
        this.dockSearch = document.getElementById("dockSearch");
        this.dockFavorites = document.getElementById("dockFavorites");
        this.dockEnv = document.getElementById("dockEnv");
        this.envOverlay = document.getElementById("envOverlay");
        this.envBackdrop = document.getElementById("envBackdrop");
        this.envClose = document.getElementById("envClose");
        this.envSave = document.getElementById("envSave");
        this.envForm = document.getElementById("envForm");

        this.isSearching = false;
        this.activeBackend = "prowlarr";
        this.prowlarrEnabled = true;
        this.jackettEnabled = true;
        this.prowlarr2Enabled = false;
        this.jackett2Enabled = false;
        this.prowlarrConfigured = true;
        this.jackettConfigured = true;
        this.prowlarr2Configured = false;
        this.jackett2Configured = false;
        this.prowlarrName = "";
        this.prowlarr2Name = "";
        this.jackettName = "";
        this.jackett2Name = "";
        this.trackerDropdownOpen = false;
        this.dropdownMode = "tracker";
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

        this.categories = [];
        this.selectedCategories = new Set();
        this.categoryFilterOpen = false;
        this.inputFocused = false;
        this.lastSearchErrors = [];

        this._favorites = this.readLocalFavorites();

        this._history = this.readLocalHistory();

    }

    init() {

        this.bindEvents();

        // Кнопка категорий видна только при фокусе на поле поиска
        this.hideCategoryBtn();

        this.loadBackendEnabledSettings();

        this.loadIndexers();

        this.loadCategories();

        this.showEmptyStart();

        this.updateFavoritesButtonCount();

        this.loadFavoritesFromServer();

        this.loadHistoryFromServer();

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

            this.indexersLoaded = true; // Помечаем как загруженные (с ошибкой)
            this.indexers = []; // Пустой массив

        }
        finally {

            // Автообновление выпадающего списка, если он открыт (но не в режиме категорий)
            if (this.trackerDropdownOpen && this.dropdownMode === "tracker") {
                this.populateTrackerDropdown();
                this.createIcons();
            }

        }

    }

    async loadCategories() {

        if (this.currentBaseBackend() !== "prowlarr") return;

        try {

            const res = await fetch(`/api/categories?backend=${encodeURIComponent(this.activeBackend)}`);

            if (!res.ok) throw new Error("HTTP " + res.status);

            this.categories = await res.json();

        } catch (err) {

            console.error("Failed to load categories:", err);

            this.categories = [];

        }

    }

    toggleCategoryFilter() {

        if (this.currentBaseBackend() !== "prowlarr") return;

        // Если окно уже открыто в режиме категорий — возвращаем окно трекеров
        if (this.dropdownMode === "category" && this.trackerDropdownOpen) {
            this.openTrackerDropdown();
            return;
        }

        // Иначе открываем окно категорий (на месте окна трекеров)
        const show = () => this.renderCategoriesDropdown();
        if (this.categories.length === 0) {
            this.loadCategories().then(show);
        } else {
            show();
        }

        // Не убираем фокус с окна поиска
        this.input.focus();

    }

    renderCategoriesDropdown() {

        if (this.currentBaseBackend() !== "prowlarr") return;

        this.dropdownMode = "category";
        this.trackerDropdownOpen = true;
        this.categoryFilterOpen = true;

        // Позиция — из CSS (absolute внутри .search-wrapper), как у окна трекеров
        this.trackerDropdown.classList.add("open", "categories-mode");

        // Заголовок и подсказка (по умолчанию — все категории)
        const hasFilter = this.selectedCategories.size > 0;
        let html = `<div class="categories-header">
            <span class="categories-title">Категории</span>
            <span class="categories-hint">${hasFilter ? "Фильтр включён" : "Поиск по всем категориям"}</span>
            <button class="categories-clear" id="categoriesClearBtn">Очистить</button>
        </div>`;

        html += `<div class="categories-list">`;

        this.categories.forEach(cat => {

            const active = this.selectedCategories.has(cat.id);

            html += `<div class="category-item${active ? " active" : ""}" data-id="${cat.id}">
                <input type="checkbox" class="category-checkbox" value="${cat.id}"${active ? " checked" : ""}>
                <span class="category-name">${cat.name}</span>
            </div>`;

        });

        html += `</div>`;

        this.trackerDropdown.innerHTML = html;

        // События — клик по всей строке (надёжно работает и на тач-экранах)
        this.trackerDropdown.querySelectorAll(".category-item").forEach(item => {

            item.addEventListener("click", (e) => {

                e.preventDefault();
                e.stopPropagation();

                const cb = item.querySelector(".category-checkbox");
                const id = parseInt(cb.value);

                if (this.selectedCategories.has(id)) {
                    this.selectedCategories.delete(id);
                    cb.checked = false;
                } else {
                    this.selectedCategories.add(id);
                    cb.checked = true;
                }

                item.classList.toggle("active", cb.checked);

                // Обновляем подсказку в заголовке
                const hint = this.trackerDropdown.querySelector(".categories-hint");
                if (hint) {
                    hint.textContent = this.selectedCategories.size > 0
                        ? "Фильтр включён"
                        : "Поиск по всем категориям";
                }

                // Обновляем иконку кнопки категорий
                this.updateCategoryFilterIcon();

                // Не убираем фокус с окна поиска
                this.input.focus();

            });

        });

        const clearBtn = this.trackerDropdown.querySelector("#categoriesClearBtn");
        if (clearBtn) {
            clearBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.selectedCategories.clear();
                this.trackerDropdown.querySelectorAll(".category-item").forEach(item => {
                    const cb = item.querySelector(".category-checkbox");
                    cb.checked = false;
                    item.classList.remove("active");
                });
                const hint = this.trackerDropdown.querySelector(".categories-hint");
                if (hint) hint.textContent = "Поиск по всем категориям";
                this.updateCategoryFilterIcon();
                this.input.focus();
            });
        }

        this.createIcons();

    }

    closeCategoryFilter() {

        this.categoryFilterOpen = false;
        this.trackerDropdown.classList.remove("categories-mode");

    }

    showCategoryBtn() {
        const btn = document.getElementById("categoryFilterBtn");
        if (!btn || this.activeBackend !== "prowlarr") return;
        btn.style.display = "flex";
    }

    hideCategoryBtn() {
        const btn = document.getElementById("categoryFilterBtn");
        if (!btn) return;
        btn.style.display = "none";
    }

    updateCategoryFilterIcon() {
        const btn = document.getElementById("categoryFilterBtn");
        if (!btn) return;
        const hasCategories = this.selectedCategories.size > 0;
        const newIcon = hasCategories ? "list-filter-plus" : "list-filter";
        btn.classList.toggle("active", hasCategories);
        // Remove old SVG icon
        const oldSvg = btn.querySelector("svg");
        if (oldSvg) oldSvg.remove();
        // Remove old <i> element if still there
        const oldI = btn.querySelector("i[data-lucide]");
        if (oldI) oldI.remove();
        // Create new <i> element
        const icon = document.createElement("i");
        icon.setAttribute("data-lucide", newIcon);
        btn.prepend(icon);
        this.createIcons();
    }

    bindEvents() {

        // Стрелка поиска — сразу запускаем поиск (первое нажатие)
        this.searchButton.addEventListener("click", () => {

            this.search();

        });

        // Кнопка выбора категорий в окне поиска
        const categoryBtn = document.getElementById("categoryFilterBtn");
        if (categoryBtn) {
            this.categoryBtn = categoryBtn;

            // Если тапнуть по кнопке — инпут теряет фокус и blur-обработчик
            // прячет кнопку раньше, чем сработает click. Подавляем это.
            categoryBtn.addEventListener("mousedown", () => {
                this._suppressBlurHide = true;
            });
            categoryBtn.addEventListener("touchstart", () => {
                this._suppressBlurHide = true;
            }, { passive: true });

            categoryBtn.addEventListener("click", (e) => {
                this._suppressBlurHide = false;
                e.preventDefault();
                e.stopPropagation();
                this.toggleCategoryFilter();
            });
        }

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
        // FAVORITES — панель-шторка
        // ==========================

        this.favoritesClose.addEventListener("click", () => {

            this.closeFavorites();

        });

        this.favoritesOverlay.addEventListener("click", (e) => {

            if (e.target === this.favoritesOverlay || e.target === this.favoritesBackdrop) {

                this.closeFavorites();

            }

        });

        // ==========================
        // HISTORY — панель-шторка
        // ==========================

        this.historyClose.addEventListener("click", () => {

            this.closeHistory();

        });

        this.historyOverlay.addEventListener("click", (e) => {

            if (e.target === this.historyOverlay || e.target === this.historyBackdrop) {

                this.closeHistory();

            }

        });

        this.historyClear.addEventListener("click", (e) => {

            e.stopPropagation();

            this.clearHistory();

        });

        // ==========================
        // TRACKER DROPDOWN — открывается при фокусе на поиске
        // ==========================

        this.input.addEventListener("focus", () => {
            this.inputFocused = true;
            this.showCategoryBtn();
            // Дропдаун absolute внутри .search-wrapper — открываем сразу,
            // гонки позиций с анимацией панели больше нет.
            if (!this.trackerDropdownOpen) {
                this.openTrackerDropdown();
            }
        });

        this.input.addEventListener("blur", (e) => {
            if (this._suppressBlurHide) {
                this._suppressBlurHide = false;
                return;
            }
            const target = e.relatedTarget;
            if (target && (target.id === "categoryFilterBtn" || target.closest?.(".search-box"))) {
                return;
            }
            this.inputFocused = false;
            this.hideCategoryBtn();
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

            if (e.key === "Escape") {

                if (this.trackerDropdownOpen) {

                    this.closeTrackerDropdown();

                } else if (!this.searchPanel.classList.contains("dock-hidden")) {

                    this.hideSearchPanel();

                }

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

            this.closeFavorites();

            this.closeHistory();

            this.input.value = "";

            this.searchButton.classList.remove("visible");

            this.input.focus();

            this.openTrackerDropdown();

        });

        // ==========================
        // BOTTOM DOCK
        // ==========================

        this.dockSearch.addEventListener("click", (e) => {

            // Не даём событию дойти до document-обработчика, который
            // закрывает дропдаун трекеров сразу после открытия.
            e.stopPropagation();

            if (this.searchPanel.classList.contains("dock-hidden")) {

                this.showSearchPanel();

            } else {

                this.hideSearchPanel();

            }

        });

        this.dockFavorites.addEventListener("click", (e) => {

            e.stopPropagation();

            // Повторный клик по активной кнопке закрывает окно избранного
            if (this.favoritesOverlay.classList.contains("open")) {

                this.closeFavorites();

            } else {

                this.openFavorites();

            }

        });

        this.dockHistory.addEventListener("click", (e) => {

            e.stopPropagation();

            // Повторный клик по активной кнопке закрывает окно истории
            if (this.historyOverlay.classList.contains("open")) {

                this.closeHistory();

            } else {

                this.openHistory();

            }

        });

        // ==========================
        // ENV SETTINGS (dock button)
        // ==========================

        this.dockEnv.addEventListener("click", (e) => {

            e.stopPropagation();

            if (this.envOverlay.classList.contains("open")) {

                this.closeEnv();

            } else {

                this.openEnv();

            }

        });

        this.envClose.addEventListener("click", () => {

            this.closeEnv();

        });

        this.envOverlay.addEventListener("click", (e) => {

            if (e.target === this.envOverlay || e.target === this.envBackdrop) {

                this.closeEnv();

            }

        });

        this.envSave.addEventListener("click", () => {

            this.saveEnvSettings();

        });

        // Add change event listeners to setting inputs for auto-save
        const saveDebounceTimeout = new Map();
        this.envForm.addEventListener("change", (e) => {

            const input = e.target.closest(".env-input");
            if (!input) return;

            const key = input.dataset.key;

            // Clear any existing debounce for this key
            if (saveDebounceTimeout.has(key)) {

                clearTimeout(saveDebounceTimeout.get(key));

            }

            // Save after 500ms delay if no other changes occur
            saveDebounceTimeout.set(key, setTimeout(async () => {

                saveDebounceTimeout.delete(key);

                try {

                    const inputs = this.envForm.querySelectorAll(".env-input");

                    const settings = {};

                    inputs.forEach(input => {

                        if (input.type === "checkbox") {

                            settings[input.dataset.key] = input.checked ? "true" : "false";

                        } else {

                            settings[input.dataset.key] = input.value;

                        }

                    });

                    const res = await fetch("/api/settings", {

                        method: "POST",

                        headers: { "Content-Type": "application/json" },

                        body: JSON.stringify({ settings }),

                    });

                    const data = await res.json();

                    this.showToast(data.message || (data.ok ? "Настройки сохранены" : "Ошибка сохранения"));

                    // Reload backend enabled settings after saving
                    await this.loadBackendEnabledSettings();

                    // Reload indexers with new backend settings
                    await this.loadIndexers();

                } catch (err) {

                    this.showToast("Ошибка сохранения настроек");

                }

            }, 500));

        });

        // ==========================
        // SCROLLBAR AUTO-HIDE + SEARCH PANEL HIDE ON SCROLL DOWN
        // ==========================

        let scrollTimeout;
        this.results.addEventListener("scroll", () => {
            this.results.classList.add("scrolling");
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                this.results.classList.remove("scrolling");
            }, 300);

            // Если окно поиска скрыто (док-режим) — не трогаем его transform
            if (this.searchPanel.classList.contains("dock-hidden")) return;

            // Hide search panel when scrolling near the bottom, show when scrolling up
            const maxScroll = this.results.scrollHeight - this.results.clientHeight;
            if (maxScroll > 0) {
                const distanceFromBottom = maxScroll - this.results.scrollTop;
                const hideZone = 200;
                let hideProgress = 1 - (distanceFromBottom / hideZone);
                hideProgress = Math.max(0, Math.min(1, hideProgress));
                this.searchPanel.style.transform = `translateY(${hideProgress * 100}%)`;
            } else {
                this.searchPanel.style.transform = "translateY(0)";
            }
        });

    }

    showSearchPanel() {

        this.closeFavorites();

        this.closeHistory();

        this.closeEnv();

        this.searchPanel.classList.remove("dock-hidden");

        this.searchPanel.classList.add("dock-shown");

        this.searchPanel.style.transform = "";

        this.dockSearch?.classList.add("active");

        document.body.classList.add("search-open");

        this.showCategoryBtn();

        // Фокус на инпуте сразу открывает дропдаун трекеров. Дропдаун теперь
        // absolute внутри .search-wrapper и едет вместе с панелью — ждать
        // окончания анимации не нужно (нет гонки позиций).
        this.input.focus();

    }

    hideSearchPanel() {

        this.searchPanel.classList.add("dock-hidden");

        this.searchPanel.classList.remove("dock-shown");

        this.searchPanel.style.transform = "";

        this.dockSearch?.classList.remove("active");

        document.body.classList.remove("search-open");

        this.hideCategoryBtn();

        this.input.blur();

        this.closeTrackerDropdown();

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

        this.closeFavorites();

        this.closeHistory();

        this.closeTrackerDropdown();

        // Запоминаем запрос в истории (последние 20)
        this.addHistory(query);

        // Кнопка категорий исчезает после начала поиска
        this.hideCategoryBtn();

        this.isSearching = true;

        this.searchButton.disabled = true;

        this.showLoader();

        const trackersParam = this.selectedTrackers.size > 0
            ? `&trackers=${[...this.selectedTrackers].join(",")}`
            : "";

        const categoriesParam = this.selectedCategories.size > 0
            ? `&categories=${[...this.selectedCategories].join(",")}`
            : "";

        try {

            const response = await fetch(

                `/api/search?q=${encodeURIComponent(query)}${trackersParam}${categoriesParam}&backend=${this.activeBackend}`

            );

            if (!response.ok) {

                let msg = "HTTP " + response.status;

                let errErrors = [];

                try {

                    const errBody = await response.json();

                    if (errBody && errBody.message) msg = errBody.message;

                    if (errBody && Array.isArray(errBody.errors)) errErrors = errBody.errors;

                } catch { /* не JSON — оставляем HTTP статус */ }

                this.lastSearchErrors = errErrors;

                throw new Error(msg);

            }

            const data = await response.json();

            this.render(data);

        }
        catch (error) {

            console.error(error);

            this.showError(error.message);

            // Показываем список трекеров, которые не ответили, даже при общей ошибке
            this.renderSearchErrors();

        }
        finally {

            this.stopLoader();

            this.isSearching = false;

            this.searchButton.disabled = false;

        }

    }

    render(data) {

        this.stopLoader();

        // После вывода результатов окно поиска скрывается, остаётся только док
        this.hideSearchPanel();

        // Поддержка и массива (старый формат) и объекта { results, errors }
        const isArray = Array.isArray(data);

        this.resultsData = isArray ? data : ((data && data.results) || []);

        this.lastSearchErrors = isArray ? [] : ((data && data.errors) || []);

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

        // Уведомление о трекерах, которые не ответили
        this.renderSearchErrors();

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

        this.closeFavorites();

        this.closeEnv();

        this.updateSortUI();

        this.populateTrackerFilter();

        this.populateSettingsErrors();

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

    renderSearchErrors() {

        const errors = this.lastSearchErrors || [];

        // Большая плашка сверху больше не используется —
        // индикатор ошибок виден на иконке счётчика, описания — в окне фильтров
        this.results.querySelectorAll(".search-errors").forEach(el => el.remove());

        // Оранжевая окаймовка на иконке счётчика результатов при ошибках
        this.counter.classList.toggle("has-errors", errors.length > 0);
        document.querySelector(".header").classList.toggle("has-errors", errors.length > 0);

        // Описания ошибок — аккуратно внизу окна фильтров
        this.populateSettingsErrors();

        // Всплывающее уведомление сверху (дубль ошибок) — исчезает через 15с или по клику
        if (errors.length > 0) {
            this.showErrorsToast();
        } else {
            this.hideErrorsToast();
        }

    }

    showErrorsToast() {

        const errors = this.lastSearchErrors || [];

        if (errors.length === 0) return;

        this.hideErrorsToast();

        const toast = document.createElement("div");

        toast.className = "errors-toast";

        toast.setAttribute("role", "alert");

        const head = document.createElement("div");

        head.className = "errors-toast-head";

        head.innerHTML = `<i data-lucide="triangle-alert"></i><span>${errors.length === 1 ? "1 трекер не ответил" : "Некоторые трекеры не ответили"}</span><button class="errors-toast-close" aria-label="Закрыть"><i data-lucide="x"></i></button>`;

        toast.appendChild(head);

        const ul = document.createElement("ul");

        errors.forEach(e => {

            const li = document.createElement("li");

            li.innerHTML = `<b>${this.escapeHtml(e.indexer || "Трекер")}</b> — ${this.escapeHtml(this.shortErrorMessage(e.message))}`;

            ul.appendChild(li);

        });

        toast.appendChild(ul);

        // Клик по уведомлению или крестику — закрыть
        toast.addEventListener("click", () => this.hideErrorsToast());

        document.body.appendChild(toast);

        this.createIcons();

        requestAnimationFrame(() => toast.classList.add("show"));

        // Автоскрытие через 15 секунд
        this._errorsToastTimer = setTimeout(() => this.hideErrorsToast(), 15000);

    }

    hideErrorsToast() {

        const toast = document.querySelector(".errors-toast");

        if (toast) toast.remove();

        if (this._errorsToastTimer) {

            clearTimeout(this._errorsToastTimer);

            this._errorsToastTimer = null;

        }

    }

    populateSettingsErrors() {

        const container = document.getElementById("settingsErrors");

        if (!container) return;

        const errors = this.lastSearchErrors || [];

        container.innerHTML = "";

        if (errors.length === 0) return;

        const head = document.createElement("div");

        head.className = "settings-errors-head";

        head.innerHTML = `<i data-lucide="triangle-alert"></i><span>${errors.length === 1 ? "1 трекер не ответил" : "Некоторые трекеры не ответили"}</span>`;

        container.appendChild(head);

        const ul = document.createElement("ul");

        errors.forEach(e => {

            const li = document.createElement("li");

            li.innerHTML = `<b>${this.escapeHtml(e.indexer || "Трекер")}</b> — ${this.escapeHtml(this.shortErrorMessage(e.message))}`;

            ul.appendChild(li);

        });

        container.appendChild(ul);

        this.createIcons();

    }

    shortErrorMessage(msg) {

        // Убираем ведущий префикс: "404 — страница не найдена" -> "страница не найдена",
        // "таймаут — сервер не ответил" -> "сервер не ответил"
        const s = String(msg || "").trim();

        const m = s.match(/^[^—]+—\s*(.+)$/);

        return m ? m[1].trim() : s;

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

        this.hideSearchPanel();

        document.querySelector(".header")?.classList.remove("has-results");

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

    getAvailableSources() {
        const sources = [];
        if (this.prowlarrEnabled && this.prowlarrConfigured) sources.push("prowlarr");
        if (this.prowlarr2Enabled && this.prowlarr2Configured) sources.push("prowlarr2");
        if (this.jackettEnabled && this.jackettConfigured) sources.push("jackett");
        if (this.jackett2Enabled && this.jackett2Configured) sources.push("jackett2");
        return sources;
    }

    currentBaseBackend() {
        return this.activeBackend.replace(/2$/, "");
    }

    getBackendDisplayName(sourceKey) {
        const base = sourceKey.replace(/2$/, "");
        const ep = sourceKey.endsWith("2") ? 2 : 1;
        let name = "";
        if (base === "prowlarr") name = ep === 2 ? this.prowlarr2Name : this.prowlarrName;
        else name = ep === 2 ? this.jackett2Name : this.jackettName;
        name = (name || "").trim();
        if (name) return name;
        return (base === "prowlarr" ? "Prowlarr" : "Jackett") + (ep === 2 ? " 2" : "");
    }

    getBackendIcon(sourceKey) {
        return (sourceKey.replace(/2$/, "") === "prowlarr") ? "icons/prowlarr.png" : "icons/jackett.png";
    }

    toggleBackend() {

        // Determine which sources are available (enabled + configured)

        const enabledBackends = this.getAvailableSources();

        // If only one or none available, don't toggle

        if (enabledBackends.length <= 1) return;

        // Find current backend index and switch to next enabled backend

        const currentIndex = enabledBackends.indexOf(this.activeBackend);

        const nextIndex = (currentIndex + 1) % enabledBackends.length;

        this.activeBackend = enabledBackends[nextIndex];

        const name = this.getBackendDisplayName(this.activeBackend);

        // Обновляем иконку и title в кнопке (если она есть в DOM)
        const btn = document.getElementById("backendToggle");

        const icon = document.getElementById("backendIcon");

        if (btn) btn.title = name;

        if (icon) {

            icon.src = this.getBackendIcon(this.activeBackend);

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

        // Сбрасываем категории при переключении бэкенда
        this.selectedCategories.clear();
        this.dropdownMode = "tracker";
        this.closeCategoryFilter();

        // Категории доступны только для Prowlarr — скрываем кнопку для Jackett
        if (this.activeBackend === "prowlarr") {
            this.showCategoryBtn();
        } else {
            this.hideCategoryBtn();
        }
        this.updateCategoryFilterIcon();

        if (this.activeBackend === "prowlarr") {
            this.loadCategories();
        } else {
            this.categories = [];
        }

    }

    clearResults() {

        this.input.value = "";

        this.resultsData = [];

        this.currentPage = 0;

        this.searchButton.classList.remove("visible");

        this.showEmptyStart();

        this.updateCounter(0);

        this.hideSearchPanel();

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

        this.dropdownMode = "tracker";

        this.trackerDropdown.classList.remove("categories-mode");

        this.populateTrackerDropdown();

        // Позиция задаётся в CSS: дропдаун absolute внутри .search-wrapper,
        // поэтому он едет вместе с панелью и не зависит от анимации открытия.
        this.trackerDropdown.classList.add("open");

        this.createIcons();

        // Keep focus on search input so mobile keyboard stays open
        this.input.focus();

    }

    closeTrackerDropdown() {

        this.trackerDropdownOpen = false;

        this.dropdownMode = "tracker";

        this.categoryFilterOpen = false;

        this.trackerDropdown.classList.remove("open", "categories-mode");

        this.createIcons();

    }

    populateTrackerDropdown() {

        if (!this.indexers.length) {

            if (!this.indexersLoaded) {

                // Трекеры ещё загружаются — показываем спиннер
                this.trackerDropdown.innerHTML = `
                    <div style="padding:16px;text-align:center;">
                        <div style="display:inline-block;width:20px;height:20px;border:2px solid rgba(255,255,255,.1);border-top-color:var(--primary);border-radius:50%;animation:spin .6s linear infinite;"></div>
                        <p style="margin-top:8px;color:var(--text-secondary);font-size:13px;">Загрузка трекеров...</p>
                    </div>`;

            } else {

                // Загрузка завершилась, но трекеров нет — ошибка
                this.trackerDropdown.innerHTML = `
                    <div style="padding:16px;text-align:center;">
                        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:8px;">Не удалось загрузить трекеры</p>
                        <button id="retryLoadIndexers" style="padding:6px 14px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:var(--primary);cursor:pointer;font-family:inherit;font-size:13px;">Повторить</button>
                    </div>`;

                // Используем setTimeout(..., 0), чтобы кнопка уже была в DOM
                setTimeout(() => {

                    const retryBtn = document.getElementById("retryLoadIndexers");
                    if (retryBtn) {
                        retryBtn.addEventListener("click", (e) => {
                            e.stopPropagation();
                            retryBtn.textContent = "Загрузка...";
                            retryBtn.disabled = true;
                            this.loadIndexers();
                        });
                    }

                }, 0);

            }

            return;

        }

        const allSelected = this.indexers.every(
            t => this.selectedTrackers.has(t.id)
        );

        // Determine which backends are enabled
        const enabledBackends = [];
        if (this.prowlarrEnabled) enabledBackends.push("prowlarr");
        if (this.jackettEnabled) enabledBackends.push("jackett");

        // Determine which backends are configured (have URL and API key)
        const configuredBackends = [];
        if (this.prowlarrConfigured) configuredBackends.push("prowlarr");
        if (this.jackettConfigured) configuredBackends.push("jackett");

        let html = "";

        // Select All / Deselect All + Backend Toggle (show if multiple backends are configured)

        html += `<div class="tracker-dropdown-select">

            <button class="tracker-select-all">

                <i data-lucide="${allSelected ? "square-check" : "square-x"}"></i>

                <span>${allSelected ? "Снять всё" : "Выделить всё"}</span>

            </button>`;

        // Single backend toggle: show ONLY the active source's icon.
        // Clicking the icon cycles through all available sources
        // (enabled + configured endpoints). Disabled/unconfigured sources
        // are never shown.
        const availableSources = this.getAvailableSources();
        if (availableSources.length > 0) {
            // Ensure the active source is among available ones
            if (!availableSources.includes(this.activeBackend)) {
                this.activeBackend = availableSources[0];
            }
            const displayBackend = this.activeBackend;
            const displayName = this.getBackendDisplayName(displayBackend);
            const displayIcon = this.getBackendIcon(displayBackend);
            html += `<div class="backend-actions">`;
            html += `<button class="backend-toggle active" data-backend="${displayBackend}" title="${displayName}">
                <img src="${displayIcon}" alt="${displayName}">
                <span class="backend-name">${displayName}</span>
            </button>`;
            html += `</div>`;
        }

        html += `</div>`;

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

        // Backend toggle — individual buttons for each configured backend
        // Backend toggle - single icon that cycles to the next enabled backend
        this.trackerDropdown.querySelectorAll(".backend-toggle[data-backend]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                // Cycle to the next enabled backend. toggleBackend() reloads
                // indexers, re-renders the dropdown with the new icon, and
                // resets categories.
                this.toggleBackend();
            });
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

        card.dataset.favid = this.favId(item) || "";

        // ==========================
        // Title
        // ==========================

        node.querySelector(".torrent-title").textContent =
            item.title;

        // Клик по названию — копировать ссылку на страницу раздачи
        const titleEl =
            node.querySelector(".torrent-title");

        titleEl.title = "Скопировать ссылку";

        titleEl.addEventListener("click", (e) => {

            e.stopPropagation();

            this.copyToClipboard(
                item.details || item.magnet || ""
            );

        });

        // ==========================
        // Tracker
        // ==========================

        node.querySelector(".tracker").textContent =
            item.tracker;

        // ==========================
        // Category label
        // ==========================

        const categoryLabel =
            node.querySelector(".category-label");

        if (categoryLabel && item.category) {
            categoryLabel.textContent = item.category;
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
        // Избранное
        // ==========================

        const favBtn = node.querySelector(".fav");

        const isFav = this.isFavorite(item);

        favBtn.classList.toggle("active", isFav);

        favBtn.title = isFav ? "Убрать из избранного" : "В избранное";

        favBtn.addEventListener("click", (e) => {

            e.stopPropagation();

            this.toggleFavorite(item, favBtn);

        });

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
        // Сохранить .torrent в качалку (watch folder)
        // ==========================

        const saveBtn = node.querySelector(".save");

        if (!item.torrent) {

            saveBtn.style.display = "none";

        }
        else {

            saveBtn.addEventListener("click", (e) => {

                e.stopPropagation();

                this.saveTorrentToWatch(item);

            });

        }

        // ==========================
        // Страница раздачи
        // ==========================

        node.querySelector(".details").addEventListener("click", (e) => {

            e.stopPropagation();

            if (item.details) {

                window.open(item.details, "_blank");

            }

        });

        // ==========================
        // В TorrentMonitor
        // ==========================

        const tmBtn = node.querySelector(".tm");

        // Кнопка скрыта, пока TM_BUTTON_ENABLED === false (см. флаг вверху файла)
        if (!TM_BUTTON_ENABLED || !item.details) {

            tmBtn.style.display = "none";

        }
        else {

            tmBtn.addEventListener("click", (e) => {

                e.stopPropagation();

                this.sendToTorrentMonitor(item);

            });

        }

        return node;

    }

    // =====================================================
    // ИЗБРАННОЕ
    // =====================================================

    getFavorites() {

        return Array.isArray(this._favorites) ? this._favorites : [];

    }

    readLocalFavorites() {

        try {
            return JSON.parse(localStorage.getItem("arr_favorites") || "[]");
        } catch (_) {
            return [];
        }

    }

    saveFavorites(list) {

        this._favorites = Array.isArray(list) ? list : [];

        try {
            localStorage.setItem("arr_favorites", JSON.stringify(this._favorites));
        } catch (_) {
            // ignore quota errors
        }

        this.persistFavorites();

    }

    persistFavorites() {

        const payload = { favorites: this.getFavorites() };

        this._persistChain = (this._persistChain || Promise.resolve()).then(async () => {

            try {

                await fetch("/api/favorites", {

                    method: "POST",

                    headers: { "Content-Type": "application/json" },

                    body: JSON.stringify(payload)

                });

            } catch (_) {

                // Сервер недоступен — избранное остаётся в localStorage-кэше
            }

        });

        return this._persistChain;

    }

    async loadFavoritesFromServer() {

        try {

            const res = await fetch("/api/favorites");

            if (!res.ok) return;

            const data = await res.json();

            const serverList = Array.isArray(data.favorites) ? data.favorites : [];

            if (serverList.length === 0) {

                // Одноразовая миграция: если на сервере пусто, а в localStorage
                // есть избранное — заливаем его на сервер.
                const localList = this.readLocalFavorites();

                if (localList.length > 0) {

                    this._favorites = localList;

                    this.persistFavorites();

                }

            } else {

                this._favorites = serverList;

                try {
                    localStorage.setItem("arr_favorites", JSON.stringify(serverList));
                } catch (_) {
                    // ignore
                }

            }

            this.updateFavoritesButtonCount();

            if (this.favoritesOverlay.classList.contains("open")) {

                this.populateFavoritesList();

            }

        } catch (_) {

            // Сервер недоступен — используем локальный кэш
            this._favorites = this.readLocalFavorites();

            this.updateFavoritesButtonCount();

        }

    }

    favId(item) {

        return item && (item.details || item.magnet || item.title) || "";

    }

    isFavorite(item) {

        const id = this.favId(item);

        if (!id) return false;

        return this.getFavorites().some(f => this.favId(f) === id);

    }

    toggleFavorite(item, btn) {

        const list = this.getFavorites();

        const id = this.favId(item);

        const idx = list.findIndex(f => this.favId(f) === id);

        if (idx >= 0) {

            list.splice(idx, 1);

        } else if (id) {

            list.unshift({ ...item, addedAt: Date.now() });

        }

        this.saveFavorites(list);

        const isFav = this.isFavorite(item);

        if (btn) {

            btn.classList.toggle("active", isFav);

            btn.title = isFav ? "Убрать из избранного" : "В избранное";

        }

        // Синхронизируем все карточки с тем же id на странице
        if (id) {

            document.querySelectorAll(
                `.card[data-favid="${CSS.escape(id)}"]`
            ).forEach(card => {

                const b = card.querySelector(".action-icon.fav");

                if (b) {

                    b.classList.toggle("active", isFav);

                    b.title = isFav ? "Убрать из избранного" : "В избранное";

                }

            });

        }

        if (this.favoritesOverlay.classList.contains("open")) {

            this.populateFavoritesList();

        }

        this.updateFavoritesButtonCount();

    }

    updateFavoritesButtonCount() {

        const show = this.getFavorites().length > 0;

        this.dockFavorites?.classList.toggle("has-fav", show);

    }

    openFavorites() {

        this.closeSettings();

        this.closeEnv();

        this.closeHistory();

        // Окно избранного открывается на весь экран — прячем окно поиска
        this.hideSearchPanel();

        this.populateFavoritesList();

        this.favoritesOverlay.classList.add("open");

        // Док остаётся видимым поверх окна избранного — подсвечиваем кнопку
        this.dockFavorites?.classList.add("active");

        document.body.style.overflow = "hidden";

    }

    closeFavorites() {

        this.favoritesOverlay.classList.remove("open");

        this.dockFavorites?.classList.remove("active");

        document.body.style.overflow = "";

    }

    // =====================================================
    // ИСТОРИЯ ПОИСКА
    // =====================================================

    getHistory() {

        return Array.isArray(this._history) ? this._history : [];

    }

    readLocalHistory() {

        try {
            return JSON.parse(localStorage.getItem("arr_history") || "[]");
        } catch (_) {
            return [];
        }

    }

    saveHistory(list) {

        list = Array.isArray(list) ? list.slice(0, 20) : [];

        this._history = list;

        try {
            localStorage.setItem("arr_history", JSON.stringify(list));
        } catch (_) {
            // ignore quota errors
        }

        this.persistHistory();

        return list;

    }

    persistHistory() {

        const payload = { history: this.getHistory() };

        this._persistHistoryChain = (this._persistHistoryChain || Promise.resolve()).then(async () => {

            try {

                await fetch("/api/history", {

                    method: "POST",

                    headers: { "Content-Type": "application/json" },

                    body: JSON.stringify(payload)

                });

            } catch (_) {

                // Сервер недоступен — история остаётся в localStorage-кэше
            }

        });

        return this._persistHistoryChain;

    }

    async loadHistoryFromServer() {

        try {

            const res = await fetch("/api/history");

            if (!res.ok) return;

            const data = await res.json();

            const serverList = Array.isArray(data.history) ? data.history : [];

            if (serverList.length === 0) {

                // Одноразовая миграция: если на сервере пусто, а в localStorage
                // есть история — заливаем её на сервер.
                const localList = this.readLocalHistory();

                if (localList.length > 0) {

                    this._history = localList;

                    this.persistHistory();

                }

            } else {

                this._history = serverList.slice(0, 20);

                try {
                    localStorage.setItem("arr_history", JSON.stringify(this._history));
                } catch (_) {
                    // ignore
                }

            }

            if (this.historyOverlay.classList.contains("open")) {

                this.populateHistoryList();

            }

        } catch (_) {

            // Сервер недоступен — используем локальный кэш
            this._history = this.readLocalHistory();

        }

    }

    addHistory(query) {

        query = String(query || "").trim();

        if (!query) return;

        let list = this.getHistory();

        // Удаляем старую запись с таким же запросом (регистронезависимо),
        // чтобы повторный поиск поднимал запрос наверх, а не дублировал.
        const lower = query.toLowerCase();

        list = list.filter(h => String(h.query || "").toLowerCase() !== lower);

        list.unshift({ query, ts: Date.now() });

        this.saveHistory(list);

    }

    removeHistory(query) {

        const lower = String(query || "").toLowerCase();

        const list = this.getHistory().filter(h => String(h.query || "").toLowerCase() !== lower);

        this.saveHistory(list);

        this.populateHistoryList();

    }

    clearHistory() {

        this.saveHistory([]);

        this.populateHistoryList();

    }

    openHistory() {

        this.closeSettings();

        this.closeFavorites();

        this.closeEnv();

        // Окно истории открывается на весь экран — прячем окно поиска
        this.hideSearchPanel();

        this.populateHistoryList();

        this.historyOverlay.classList.add("open");

        // Док остаётся видимым поверх окна истории — подсвечиваем кнопку
        this.dockHistory?.classList.add("active");

        document.body.style.overflow = "hidden";

    }

    closeHistory() {

        this.historyOverlay.classList.remove("open");

        this.dockHistory?.classList.remove("active");

        document.body.style.overflow = "";

    }

    // =====================================================
    // ENV SETTINGS
    // =====================================================

    openEnv() {

        this.closeSettings();

        this.closeFavorites();

        this.closeHistory();

        this.hideSearchPanel();

        this.loadEnvSettings();

        this.loadBackendEnabledSettings();

        this.envOverlay.classList.add("open");

        this.dockEnv?.classList.add("active");

        document.body.style.overflow = "hidden";

    }

    closeEnv() {

        this.envOverlay.classList.remove("open");

        this.dockEnv?.classList.remove("active");

        document.body.style.overflow = "";

    }

    async loadEnvSettings() {

        try {

            const res = await fetch("/api/settings");

            const data = await res.json();

            if (!data.ok) throw new Error(data.message);

            const tmEnabledSetting = data.settings.TM_ENABLED?.value;
            TM_BUTTON_ENABLED = tmEnabledSetting === "true" || tmEnabledSetting === "1";

            const labels = {

                "PROWLARR_ENABLED": "Включить Prowlarr 1",
                "PROWLARR_ENABLED_2": "Включить Prowlarr 2",
                "PROWLARR_NAME": "Название (в настройках)",
                "PROWLARR_URL": "URL сервера",
                "PROWLARR_API_KEY": "API-ключ",
                "PROWLARR_NAME_2": "Название 2-го",
                "PROWLARR_URL_2": "URL 2-го сервера",
                "PROWLARR_API_KEY_2": "API-ключ 2-го",

                "JACKETT_ENABLED": "Включить Jackett 1",
                "JACKETT_ENABLED_2": "Включить Jackett 2",
                "JACKETT_NAME": "Название (в настройках)",
                "JACKETT_URL": "URL сервера",
                "JACKETT_API_KEY": "API-ключ",
                "JACKETT_INDEXERS": "Индексаторы (через запятую)",
                "JACKETT_NAME_2": "Название 2-го",
                "JACKETT_URL_2": "URL 2-го сервера",
                "JACKETT_API_KEY_2": "API-ключ 2-го",
                "JACKETT_INDEXERS_2": "Индексаторы 2-го (через запятую)",

                "TM_ENABLED": "Включить TorrentMonitor",
                "TM_URL": "URL сервера",
                "TM_API_KEY": "API-ключ",
                "PORT": "Порт сервера",

            };

            const backendDefs = {
                "Prowlarr": {
                    icon: "/icons/prowlarr.png",
                    nameKey: "PROWLARR_NAME",
                    primary: {
                        toggleKey: "PROWLARR_ENABLED",
                        toggleLabel: "Prowlarr 1",
                        nameKey: "PROWLARR_NAME",
                        fields: ["PROWLARR_NAME", "PROWLARR_URL", "PROWLARR_API_KEY"],
                    },
                    secondary: {
                        toggleKey: "PROWLARR_ENABLED_2",
                        toggleLabel: "Prowlarr 2",
                        nameKey: "PROWLARR_NAME_2",
                        fields: ["PROWLARR_NAME_2", "PROWLARR_URL_2", "PROWLARR_API_KEY_2"],
                    },
                },
                "Jackett": {
                    icon: "/icons/jackett.png",
                    nameKey: "JACKETT_NAME",
                    primary: {
                        toggleKey: "JACKETT_ENABLED",
                        toggleLabel: "Jackett 1",
                        nameKey: "JACKETT_NAME",
                        fields: ["JACKETT_NAME", "JACKETT_URL", "JACKETT_API_KEY", "JACKETT_INDEXERS"],
                    },
                    secondary: {
                        toggleKey: "JACKETT_ENABLED_2",
                        toggleLabel: "Jackett 2",
                        nameKey: "JACKETT_NAME_2",
                        fields: ["JACKETT_NAME_2", "JACKETT_URL_2", "JACKETT_API_KEY_2", "JACKETT_INDEXERS_2"],
                    },
                },
            };

            const renderEndpoint = (def) => {
                const setting = data.settings[def.toggleKey];
                const value = setting ? setting.value : "";
                const checked = value === "true" || value === "1" ? "checked" : "";
                const epName = (data.settings[def.nameKey]?.value || "").trim() || def.toggleLabel;
                let html = `<div class="env-endpoint" data-toggle-key="${def.toggleKey}">`;
                html += `<div class="env-endpoint-title"><span>${epName}</span>`;
                html += `<label class="toggle-switch"><input class="env-input" type="checkbox" data-key="${def.toggleKey}" ${checked}><span class="toggle-slider"></span></label>`;
                html += `</div>`;
                for (const key of def.fields) {
                    const s = data.settings[key];
                    const v = s ? s.value : "";
                    const sensitive = s ? s.sensitive : false;
                    const label = labels[key] || key;
                    html += `<div class="env-field">
                        <span class="env-hint">${label}</span>
                        <input class="env-input" id="env_${key}" type="${sensitive ? "password" : "text"}" value="${this.escapeHtml(v)}" data-key="${key}" title="${key}" aria-label="${key}" autocomplete="off">
                    </div>`;
                }
                html += `</div>`;
                return html;
            };

            let html = "";

            for (const [groupName, bdef] of Object.entries(backendDefs)) {
                const displayTitle = (data.settings[bdef.nameKey]?.value || "").trim() || groupName;
                html += `<div class="env-group"><div class="env-group-title"><img src="${bdef.icon}" alt="${groupName}" class="env-group-icon">${displayTitle}</div>`;
                html += renderEndpoint(bdef.primary);
                const sec = bdef.secondary;
                const secActive = (data.settings[sec.toggleKey]?.value === "true") || sec.fields.some(k => (data.settings[k]?.value || "").trim() !== "");
                if (secActive) {
                    html += renderEndpoint(sec);
                } else {
                    html += `<button type="button" class="env-add-indexer" data-group="${groupName}"><span class="env-add-icon">+</span><span class="env-add-label">Добавить индексатор</span></button>`;
                    html += `<div id="ep-${groupName}-secondary" class="env-hidden"></div>`;
                }
                html += `</div>`;
            }

            const flatGroups = {
                "TorrentMonitor": { icon: "/icons/torrentmonitor.svg", keys: ["TM_ENABLED", "TM_URL", "TM_API_KEY"] },
                "Система": { icon: "/icons/system.svg", keys: ["PORT"] },
            };
            const flatToggleKeys = { "TorrentMonitor": "TM_ENABLED" };

            for (const [groupName, gdef] of Object.entries(flatGroups)) {
                const keys = gdef.keys;
                const iconHtml = gdef.icon ? `<img src="${gdef.icon}" alt="${groupName}" class="env-group-icon">` : "";
                let toggleHtml = "";
                const toggleKey = flatToggleKeys[groupName];
                if (toggleKey) {
                    const setting = data.settings[toggleKey];
                    const value = setting ? setting.value : "";
                    const checked = value === "true" || value === "1" ? "checked" : "";
                    toggleHtml = `<label class="toggle-switch"><input class="env-input" type="checkbox" data-key="${toggleKey}" ${checked}><span class="toggle-slider"></span></label>`;
                }
                html += `<div class="env-group"><div class="env-group-title">${iconHtml}${groupName}${toggleHtml}</div>`;
                for (const key of keys) {
                    if (key === "TM_ENABLED") continue;
                    const setting = data.settings[key];
                    const value = setting ? setting.value : "";
                    const sensitive = setting ? setting.sensitive : false;
                    const label = labels[key] || key;
                    html += `<div class="env-field">
                        <span class="env-hint">${label}</span>
                        <input class="env-input" id="env_${key}" type="${sensitive ? "password" : "text"}" value="${this.escapeHtml(value)}" data-key="${key}" title="${key}" aria-label="${key}" autocomplete="off">
                    </div>`;
                }
                html += `</div>`;
            }

            this.envForm.innerHTML = html;

            const applyToggle = (input) => {
                const toggleKey = input.dataset.key;
                const isEnabled = input.checked;
                const scope = input.closest('.env-endpoint') || input.closest('.env-group');
                if (!scope) return;
                scope.querySelectorAll('.env-input').forEach(field => {
                    if (field.dataset.key === toggleKey) return;
                    field.disabled = !isEnabled;
                });
                scope.querySelectorAll('.env-field').forEach(field => {
                    const fieldInput = field.querySelector('.env-input');
                    if (fieldInput && fieldInput.dataset.key !== toggleKey) {
                        field.style.opacity = isEnabled ? '1' : '0.5';
                    }
                });
            };

            const bindToggle = (input) => {
                input.addEventListener('change', () => applyToggle(input));
            };

            const toggleInputs = this.envForm.querySelectorAll('.env-input[type="checkbox"][data-key]');
            toggleInputs.forEach(bindToggle);

            this.envForm.querySelectorAll('.env-add-indexer').forEach(btn => {
                btn.addEventListener('click', () => {
                    const group = btn.dataset.group;
                    const target = document.getElementById(`ep-${group}-secondary`);
                    const bdef = backendDefs[group];
                    if (!target || !bdef) return;
                    const isOpen = btn.classList.contains('open');
                    if (!isOpen) {
                        target.innerHTML = renderEndpoint(bdef.secondary);
                        target.classList.remove('env-hidden');
                        btn.classList.add('open');
                        const icon = btn.querySelector('.env-add-icon');
                        const label = btn.querySelector('.env-add-label');
                        if (icon) icon.textContent = '×';
                        if (label) label.textContent = 'Отмена';
                        const t = target.querySelector('.env-input[type="checkbox"][data-key]');
                        if (t) {
                            bindToggle(t);
                            applyToggle(t);
                        }
                    } else {
                        target.innerHTML = '';
                        target.classList.add('env-hidden');
                        btn.classList.remove('open');
                        const icon = btn.querySelector('.env-add-icon');
                        const label = btn.querySelector('.env-add-label');
                        if (icon) icon.textContent = '+';
                        if (label) label.textContent = 'Добавить индексатор';
                    }
                });
            });

            this.applyInitialDisabledState();

        } catch (err) {

            console.error("loadEnvSettings error:", err);

            this.envForm.innerHTML = `<div class="env-error">Ошибка загрузки настроек: ${err.message}</div>`;

        }

    }


    async applyInitialDisabledState() {

        const toggleInputs = this.envForm.querySelectorAll('.env-input[type="checkbox"][data-key]');

        toggleInputs.forEach(input => {

            const toggleKey = input.dataset.key;

            const isEnabled = input.checked;

            const scope = input.closest('.env-endpoint') || input.closest('.env-group');

            if (!scope) return;

            scope.querySelectorAll('.env-input').forEach(field => {

                if (field.dataset.key === toggleKey) return;

                field.disabled = !isEnabled;

            });

            scope.querySelectorAll('.env-field').forEach(field => {

                const fieldInput = field.querySelector('.env-input');

                if (fieldInput && fieldInput.dataset.key !== toggleKey) {

                    field.style.opacity = isEnabled ? '1' : '0.5';

                }

            });

        });

    }


    escapeHtml(str) {

        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

        return String(str).replace(/[&<>"']/g, c => map[c]);

    }

    async saveEnvSettings() {

        const inputs = this.envForm.querySelectorAll(".env-input");

        const settings = {};

        inputs.forEach(input => {

            if (input.type === "checkbox") {

                settings[input.dataset.key] = input.checked ? "true" : "false";

            } else {

                settings[input.dataset.key] = input.value;

            }

        });

        try {

            const res = await fetch("/api/settings", {

                method: "POST",

                headers: { "Content-Type": "application/json" },

                body: JSON.stringify({ settings }),

            });

            const data = await res.json();

            this.showToast(data.message || (data.ok ? "Настройки сохранены" : "Ошибка сохранения"));

            // Reload backend enabled settings after saving
            await this.loadBackendEnabledSettings();

            // Reload indexers with new backend settings
            await this.loadIndexers();

        } catch (err) {

            this.showToast("Ошибка сохранения настроек");

        }

    }

    async loadBackendEnabledSettings() {

        try {

            const res = await fetch("/api/settings");

            const data = await res.json();

            if (!data.ok) throw new Error(data.message);

            this.prowlarrEnabled = data.settings.PROWLARR_ENABLED?.value === "true";

            this.jackettEnabled = data.settings.JACKETT_ENABLED?.value === "true";

            this.prowlarr2Enabled = data.settings.PROWLARR_ENABLED_2?.value === "true";

            this.jackett2Enabled = data.settings.JACKETT_ENABLED_2?.value === "true";

            // Check if backends are configured (have URL and API key)
            this.prowlarrConfigured = !!(data.settings.PROWLARR_URL?.value && data.settings.PROWLARR_API_KEY?.value);

            this.jackettConfigured = !!(data.settings.JACKETT_URL?.value && data.settings.JACKETT_API_KEY?.value);

            // 2nd endpoint configured flags
            this.prowlarr2Configured = !!(data.settings.PROWLARR_URL_2?.value && data.settings.PROWLARR_API_KEY_2?.value);

            this.jackett2Configured = !!(data.settings.JACKETT_URL_2?.value && data.settings.JACKETT_API_KEY_2?.value);

            // Custom display names
            this.prowlarrName = data.settings.PROWLARR_NAME?.value || "";
            this.prowlarr2Name = data.settings.PROWLARR_NAME_2?.value || "";
            this.jackettName = data.settings.JACKETT_NAME?.value || "";
            this.jackett2Name = data.settings.JACKETT_NAME_2?.value || "";

            // Ensure at least one backend is enabled

            if (!this.prowlarrEnabled && !this.jackettEnabled) {

                this.prowlarrEnabled = true;

            }

            // Set initial active backend based on available sources

            const available = this.getAvailableSources();
            if (!available.includes(this.activeBackend)) {
                this.activeBackend = available[0] || "prowlarr";
            }

        } catch (err) {

            console.error("loadBackendEnabledSettings error:", err);

            // Default to enabled if settings can't be loaded

            this.prowlarrEnabled = true;

            this.jackettEnabled = true;

            this.prowlarrConfigured = true;

            this.jackettConfigured = true;

        }

    }

    runHistoryQuery(query) {

        this.input.value = String(query || "").trim();

        this.closeHistory();

        this.search();

    }

    populateHistoryList() {

        const list = this.getHistory();

        if (!this.historyList) return;

        if (list.length === 0) {

            this.historyList.innerHTML = `
<div class="history-empty">
<div class="history-empty-icon">
<i data-lucide="history"></i>
</div>
<p>История поиска пуста.</p>
<p class="history-empty-hint">Выполните поиск — запросы появятся здесь.</p>
</div>`;

            this.createIcons();

            return;

        }

        let html = "";

        list.forEach(item => {

            const query = String(item.query || "").trim();

            if (!query) return;

            html += `
<div class="history-item" data-query="${this.escapeHtml(query)}">
<div class="history-item-icon"><i data-lucide="search"></i></div>
<div class="history-item-query">${this.escapeHtml(query)}</div>
<button class="action-icon history-item-remove" title="Удалить из истории"><i data-lucide="x"></i></button>
</div>`;

        });

        this.historyList.innerHTML = html;

        this.createIcons();

        this.historyList.querySelectorAll(".history-item").forEach(row => {

            const q = row.dataset.query;

            if (!q) return;

            row.addEventListener("click", (e) => {

                if (e.target.closest(".history-item-remove")) return;

                this.runHistoryQuery(q);

            });

            const removeBtn = row.querySelector(".history-item-remove");

            removeBtn?.addEventListener("click", (e) => {

                e.stopPropagation();

                this.removeHistory(q);

            });

        });

    }

    populateFavoritesList() {

        const list = this.getFavorites();

        if (!this.favoritesList) return;

        if (list.length === 0) {

            this.favoritesList.innerHTML = `
<div class="favorites-empty">
<div class="empty-icon">
<i data-lucide="star"></i>
</div>
<p>Пока нет избранных тем.</p>
<p class="favorites-empty-hint">Нажмите на звезду на карточке, чтобы добавить тему сюда.</p>
</div>`;

            this.createIcons();

            return;

        }

        let html = "";

        list.forEach(item => {

            const favId = this.favId(item);

            html += `
<div class="favorite-item" data-favid="${this.escapeHtml(favId)}">
<div class="fav-item-main">
<div class="fav-title-row">
<div class="fav-title">${this.escapeHtml(item.title || "Без названия")}</div>
<button class="action-icon fav-edit" title="Редактировать заголовок"><i data-lucide="pencil"></i></button>
</div>
<div class="fav-meta">
<span class="fav-tracker">${this.escapeHtml(item.tracker || "")}</span>
${item.size ? `<span class="fav-sep">·</span><span>${this.escapeHtml(item.size)}</span>` : ""}
${item.seeders != null ? `<span class="fav-sep">·</span><span class="fav-seeders">▲ ${item.seeders}</span>` : ""}
</div>
</div>
<div class="fav-actions">
${item.magnet ? `<button class="action-icon magnet" title="Magnet-ссылка"><i data-lucide="magnet"></i></button>` : ""}
${item.torrent ? `<button class="action-icon torrent" title="Скачать .torrent"><i data-lucide="download"></i></button>` : ""}
${item.details ? `<button class="action-icon details" title="Страница раздачи"><i data-lucide="globe"></i></button>` : ""}
<button class="action-icon fav-remove" title="Убрать из избранного"><i data-lucide="trash-2"></i></button>
</div>
</div>`;

        });

        this.favoritesList.innerHTML = html;

        this.createIcons();

        this.favoritesList.querySelectorAll(".favorite-item").forEach(row => {

            const item = list.find(f => this.favId(f) === row.dataset.favid);

            if (!item) return;

            const magnetBtn = row.querySelector(".action-icon.magnet");

            magnetBtn?.addEventListener("click", (e) => {
                e.stopPropagation();
                this.copyToClipboard(item.magnet);
            });

            const torrentBtn = row.querySelector(".action-icon.torrent");

            torrentBtn?.addEventListener("click", (e) => {
                e.stopPropagation();
                if (item.torrent) window.open(item.torrent, "_blank");
            });

            const detailsBtn = row.querySelector(".action-icon.details");

            detailsBtn?.addEventListener("click", (e) => {
                e.stopPropagation();
                if (item.details) window.open(item.details, "_blank");
            });

            const removeBtn = row.querySelector(".action-icon.fav-remove");

            removeBtn?.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleFavorite(item);
            });

            const titleEl = row.querySelector(".fav-title");

            titleEl?.addEventListener("click", () => {
                this.copyToClipboard(item.details || item.magnet || "");
            });

            const editBtn = row.querySelector(".action-icon.fav-edit");

            editBtn?.addEventListener("click", (e) => {
                e.stopPropagation();
                this.editFavoriteTitle(row, item);
            });

        });

    }

    editFavoriteTitle(row, item) {

        const titleRow = row.querySelector(".fav-title-row");

        if (!titleRow) return;

        titleRow.innerHTML = "";

        const input = document.createElement("input");

        input.type = "text";

        input.className = "fav-edit-input";

        input.value = item.title || "";

        input.maxLength = 200;

        input.spellcheck = false;

        titleRow.appendChild(input);

        const saveBtn = document.createElement("button");

        saveBtn.type = "button";

        saveBtn.className = "action-icon fav-edit-save";

        saveBtn.title = "Сохранить заголовок";

        saveBtn.innerHTML = '<i data-lucide="check"></i>';

        titleRow.appendChild(saveBtn);

        this.createIcons();

        input.focus();

        input.select();

        let done = false;

        const finish = (save) => {

            if (done) return;

            done = true;

            if (save) {

                const val = input.value.trim();

                const list = this.getFavorites();

                const idx = list.findIndex(f => this.favId(f) === this.favId(item));

                if (idx !== -1) {

                    list[idx].title = val || item.title || "Без названия";

                    this.saveFavorites(list);

                }

            }

            this.populateFavoritesList();

        };

        saveBtn.addEventListener("click", (e) => {

            e.stopPropagation();

            finish(true);

        });

        input.addEventListener("keydown", (e) => {

            if (e.key === "Enter") {

                e.preventDefault();

                finish(true);

            } else if (e.key === "Escape") {

                e.preventDefault();

                finish(false);

            }

        });

        input.addEventListener("blur", () => finish(true));

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

        this.showToast("Ссылка скопирована");

    }

    showToast(message) {

        const existing =
            document.querySelector(".toast");

        if (existing) existing.remove();

        const toast =
            document.createElement("div");

        toast.className = "toast";

        const title =
            document.createElement("div");

        title.className = "toast-title";

        title.textContent = message;

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

    async sendToTorrentMonitor(item) {

        const url = item.details || "";

        if (!url) return;

        try {

            const res = await fetch("/api/tm/torrents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, name: item.title })
            });

            const data = await res.json().catch(() => ({}));

            const ok = !!(data && data.ok);

            const message =
                (data && data.message) ||
                (ok ? "Отправлено в TorrentMonitor" : "Не удалось отправить в TorrentMonitor");

            this.showToast(message);

        } catch (err) {

            this.showToast("Не удалось отправить в TorrentMonitor");

        }

    }

    async saveTorrentToWatch(item) {

        const url = item.torrent || "";

        if (!url) return;

        try {

            const res = await fetch("/api/torrents/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, title: item.title })
            });

            const data = await res.json().catch(() => ({}));

            const ok = !!(data && data.ok);

            const message =
                (data && data.message) ||
                (ok ? "Сохранено в папку" : "Не удалось сохранить .torrent");

            this.showToast(message);

        } catch (err) {

            this.showToast("Не удалось сохранить .torrent");

        }

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