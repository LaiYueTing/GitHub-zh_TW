// ==UserScript==
// @name         GitHub 繁體中文化
// @namespace    https://github.com/LaiYueTing/GitHub-zh_TW
// @description  繁體中文化 GitHub 介面的部分選單及內容。
// @copyright    2026, LaiYueTing (https://github.com/LaiYueTing)
// @icon         https://github.githubassets.com/pinned-octocat.svg
// @version      1.9.4.4
// @author       LaiYueTing
// @license      GPL-3.0
// @match        https://github.com/*
// @match        https://skills.github.com/*
// @match        https://gist.github.com/*
// @match        https://education.github.com/*
// @match        https://www.githubstatus.com/*
// @require      https://raw.githubusercontent.com/LaiYueTing/GitHub-zh_TW/main/locals.js?v1.9.4.4
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_notification
// @connect      fanyi.iflyrec.com
// @supportURL   https://github.com/LaiYueTing/Github-zh_TW/issues
// ==/UserScript==

(function (window, document, undefined) {
    'use strict';

    /* =========================== 全域設定常數 =========================== */
    const CONFIG = {
        LANG: 'zh-TW', // 預設語言
        DEV: false, // 預設不開啟開發者模式
        PAGE_MAP: { // 站台網域 -> 類型對應
            'gist.github.com': 'gist',
            'www.githubstatus.com': 'status',
            'skills.github.com': 'skills',
            'education.github.com': 'education'
        },
        SPECIAL_SITES: ['gist', 'status', 'skills', 'education'], // 特殊站台類型
        DESC_SELECTORS: { // 簡介元素的 CSS 選擇器
            repository: ".f4.tmp-my-3",
            gist: ".gist-content [itemprop='about']"
        },
        OBSERVER_CONFIG: { // MutationObserver 設定
            childList: true,
            subtree: true,
            characterData: true,
            attributeFilter: ['value', 'placeholder', 'aria-label', 'data-confirm']
        },
        TRANS_ENGINES: { // 翻譯引擎設定
            iflyrec: {
                name: '訊飛聽見',
                url: 'https://fanyi.iflyrec.com/text-translate',
                url_api: 'https://fanyi.iflyrec.com/TJHZTranslationService/v2/textAutoTranslation',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://fanyi.iflyrec.com'
                },
                getRequestData: (text) => ({
                    from: 2, // 英文
                    to: 1,   // 繁體中文
                    type: 1,
                    contents: [{ text: text }]
                }),
                responseIdentifier: 'biz[0]?.sectionResult[0]?.dst', // 翻譯結果在回應中的路徑
            },
        },
        STYLES: `
            /* 基礎樣式變數 */
            :root {
                --ghc-primary-color: #1b95e0;
                --ghc-bg-color: #f8f9fa;
                --ghc-border-color: #e1e4e8;
                --ghc-button-bg: #f6f8fa;
            }
            /* 淺色主題樣式（預設） */
            .translate-button {
                color: var(--ghc-primary-color);
                font-size: small;
                cursor: pointer;
                margin-top: 5px;
                display: inline-block;
            }
            .translation-result {
                margin-top: 10px;
                padding: 8px;
                border: 1px solid var(--ghc-border-color);
                background-color: var(--ghc-button-bg);
                border-radius: 6px;
            }
            .translation-credit {
                font-size: small;
                color: var(--ghc-primary-color);
            }
            .translation-content {
                margin-top: 5px;
                white-space: pre-wrap;
            }

            /* 暗色主題適配 - 使用 prefers-color-scheme */
            @media (prefers-color-scheme: dark) {
                :root {
                    --ghc-primary-color: #58a6ff;
                    --ghc-bg-color: #0d1117;
                    --ghc-border-color: #30363d;
                    --ghc-button-bg: #21262d;
                }
            }
        `
    };

    /* =========================== 狀態管理器 =========================== */
    const State = {
        // 功能開關
        featureSet: {
            enable_RegExp: GM_getValue("enable_RegExp", true),
            enable_transDesc: GM_getValue("enable_transDesc", true),
            enable_missedTerms: GM_getValue("enable_missedTerms", false),
            enable_onurlchange: false,
        },

        // 目前執行階段狀態
        pageConfig: null,        // 目前頁面設定（null 表示無有效頁面）
        currentURL: window.location.href, // 目前頁面 URL
        transEngine: 'iflyrec',  // 目前翻譯引擎
        mutationObserver: null,  // DOM 變化觀察器
        urlChangeHandler: null,  // 儲存 URL 變化處理器
        dynamicMenus: {},        // 動態選單 ID 紀錄
        initDone: false,
    };

    /* =========================== 安全檢查 =========================== */

    /**
     * 檢查詞庫檔案是否載入 — 未載入則拋出錯誤阻止繼續執行
     */
    function checkI18NLoaded() {
        if (typeof I18N === 'undefined') {
            alert('GitHub 繁體中文化插件：詞庫檔案 locals.js 未載入，腳本無法執行！');
            throw new Error('[GitHub 繁體中文化插件] 詞庫檔案 locals.js 未載入');
        }
    }

    /**
     * 錯誤邊界 — 包裝函式，捕捉例外避免阻斷頁面正常使用
     * @param {Function} fn - 要執行的函式
     * @param {string} label - 錯誤標籤
     * @returns {Function} 包裝後的函式
     */
    function safe(fn, label) {
        return function (...args) {
            try {
                return fn.apply(this, args);
            } catch (e) {
                console.error(`[GitHub 繁體中文化插件] ${label} 發生錯誤:`, e);
            }
        };
    }

    /* =========================== 初始化進入點 =========================== */
    function init() {
        checkI18NLoaded();
        setupReactGlobalNavTranslation();
        initLangEnv();
        injectStyles();
        setupMenuCommands();
        setupInitTrans();
        setupUrlChangeListener();
        setupTurboEvents();
        State.initDone = true;
    }

    /**
     * 初始化並保護中文語言環境
     */
    function initLangEnv() {
        // 設定初始語言
        document.documentElement.lang = CONFIG.LANG;

        // 監看語言屬性變化，防止被改回英文
        const langObserver = new MutationObserver(() => {
            // 如果偵測到語言被改回英文，重新設定
            if (document.documentElement.lang === "en") {
                document.documentElement.lang = CONFIG.LANG;
            }
        });
        langObserver.observe(document.documentElement, { attributeFilter: ['lang'] });
    }

    /**
     * 注入自訂樣式到頁面
     */
    function injectStyles() {
        GM_addStyle(CONFIG.STYLES);
    }

    /**
     * 設定初始翻譯
     *
     * 即使 @run-at document-start，Tampermonkey 注入腳本也可能晚於 DOMContentLoaded
     *（擴充功能冷啟動、bfcache 復原等情境）。因此不能假設註冊監聽器時事件尚未觸發：
     * readyState 已是 interactive/complete 則直接執行，否則才註冊一次性監聽器。
     */
    function setupInitTrans() {
        function doInitTrans() {
            updatePageConfig('首次載入');
            if (State.pageConfig) {
                safe(traverseNode, '首次遍歷')(document.body);
            }
            setupMutationObserver(); // 設定 DOM 變化觀察器
        }

        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            // 文件已就緒，直接執行
            doInitTrans();
        } else {
            // 等待 DOMContentLoaded
            window.addEventListener('DOMContentLoaded', doInitTrans, { once: true });
        }
    }

    /* =========================== URL 變化監聽 =========================== */
    /**
     * 設定 URL 變化監聽器
     * Tampermonkey 環境使用 onurlchange 事件，其他環境回退到 MutationObserver URL 偵測
     */
    function setupUrlChangeListener() {
        // Tampermonkey 環境下 window.onurlchange 為 null（支援），其他環境為 undefined
        if (State.featureSet.enable_onurlchange && window.onurlchange === null) {

            // 建立 URL 變化處理函式
            State.urlChangeHandler = function (event) {
                console.log("URL 變化偵測 (Tampermonkey onurlchange)", event);
                handleUrlChange();
            };

            window.addEventListener('urlchange', State.urlChangeHandler);
            console.log("🛠️ 開發者模式：已啟用 onurlchange 事件監聽");
        } else {
            console.log("目前環境不支援 onurlchange 事件，使用傳統 URL 偵測方式");
        }
    }

    /**
     * 處理 URL 變化
     */
    function handleUrlChange() {
        const currentURL = window.location.href;

        // 如果 URL 沒有實際變化，則跳過處理
        if (currentURL === State.currentURL) return;

        State.currentURL = currentURL;
        updatePageConfig("URL 變化 (onurlchange)");

        // 重新設定觀察器
        if (State.mutationObserver) {
            State.mutationObserver.disconnect();
        }

        // 如果頁面類型有效，重新走訪 DOM
        if (State.pageConfig) {
            safe(traverseNode, 'URL 變化遍歷')(document.body);
        }

        setupMutationObserver();
    }

    /* =========================== Turbo 事件 =========================== */
    /**
     * 設定 Turbo 框架事件監聽
     * 處理 GitHub 的 Turbolinks 頁面切換
     */
    function setupTurboEvents() {
        document.addEventListener('turbo:load', handleTurboLoad);
    }

    /**
     * 處理 Turbo 頁面載入事件
     * 在新頁面載入後執行必要的翻譯
     */
    function handleTurboLoad() {
        if (!State.pageConfig) return;

        transTitle(); // 翻譯頁面標題
        transBySelector(); // 透過選擇器翻譯特定元素

        // 如果描述翻譯功能啟用，翻譯頁面描述
        if (State.featureSet.enable_transDesc &&
            CONFIG.DESC_SELECTORS[State.pageConfig.currentPageType]) {
            transDesc(CONFIG.DESC_SELECTORS[State.pageConfig.currentPageType]);
        }
    }

    /* =========================== 頁面設定管理 =========================== */

    /**
     * 更新頁面設定 — 頁面類型變化時重建 State.pageConfig
     * @param {string} trigger - 觸發更新的原因（用於偵錯）
     */
    function updatePageConfig(trigger) {
        const newType = detectPageType();
        if (!newType) {
            State.pageConfig = null;
        } else if (newType !== State.pageConfig?.currentPageType) {
            State.pageConfig = buildPageConfig(newType);
        }
        console.log(`【Debug】${trigger} 觸發, 頁面類型為 ${State.pageConfig?.currentPageType}`);
    }

    /**
     * 建構頁面設定物件
     * @param {string} pageType - 頁面類型
     * @returns {Object} 頁面設定物件
     */
    function buildPageConfig(pageType) {
        return {
            currentPageType: pageType, // 目前頁面類型
            currentPath: window.location.pathname, // 目前路徑
            titleStaticDict: I18N[CONFIG.LANG][pageType]?.title?.static || {},
            titleRegexpRules: I18N[CONFIG.LANG][pageType]?.title?.regexp || [],
            staticDict: { // 合併公共與頁面特定的靜態詞典
                ...I18N[CONFIG.LANG].public.static,
                ...(I18N[CONFIG.LANG][pageType]?.static || {})
            },
            regexpRules: [ // 合併公共與頁面特定的正規表達式規則
                ...(I18N[CONFIG.LANG][pageType]?.regexp || []),
                ...(I18N[CONFIG.LANG].public.regexp || [])
            ],
            ignoreMutationSelectors: [ // 忽略的變動選擇器
                ...(I18N.conf.ignoreMutationSelectorPage['*'] || []),
                ...(I18N.conf.ignoreMutationSelectorPage[pageType] || [])
            ].join(', '),
            ignoreSelectors: [ // 忽略的選擇器
                ...(I18N.conf.ignoreSelectorPage['*'] || []),
                ...(I18N.conf.ignoreSelectorPage[pageType] || [])
            ].join(', '),
            characterData: (I18N.conf.characterDataPage || []).includes(pageType), // 是否監看文字節點變化
            transSelectors: [ // 翻譯選擇器規則
                ...(I18N[CONFIG.LANG].public.selector || []),
                ...(I18N[CONFIG.LANG][pageType]?.selector || [])
            ],
        };
    }

    /* =========================== 頁面類型偵測 =========================== */

    /**
     * 偵測目前頁面類型
     * @returns {string|boolean} 頁面類型或 false（如果未辨識）
     */
    function detectPageType() {
        const url = new URL(window.location.href);
        const { PAGE_MAP, SPECIAL_SITES } = CONFIG;
        const { hostname, pathname } = url;

        // 基礎設定
        const site = PAGE_MAP[hostname] || 'github'; // 透過站台對應取得基礎類型
        const isLogin = document.body.classList.contains("logged-in");
        const metaLocation = document.head.querySelector('meta[name="analytics-location"]')?.content || '';

        // 頁面特徵偵測
        const isSession = document.body.classList.contains("session-authentication");
        const isHomepage = pathname === '/' && site === 'github';
        const isProfile = document.body.classList.contains("page-profile") || metaLocation === '/<user-name>';
        const isRepository = /\/<user-name>\/<repo-name>/.test(metaLocation);
        const isOrganization = /\/<org-login>/.test(metaLocation) || /^\/(?:orgs|organizations)/.test(pathname);

        let pageType;
        // 根據頁面特徵決定頁面類型
        switch (true) { // 使用 switch(true) 模式處理多條件分支
            case isSession: // 登入/認證頁面
                pageType = 'session-authentication';
                break;
            case SPECIAL_SITES.includes(site): // 特殊站台
                pageType = site;
                break;
            case isProfile: { // 使用者資料頁面
                const tabParam = new URLSearchParams(url.search).get('tab');
                pageType = pathname.includes('/stars') ? 'page-profile/stars'
                         : tabParam ? `page-profile/${tabParam}`
                         : 'page-profile';
                break;
            }
            case isHomepage: // 首頁/儀表板
                pageType = isLogin ? 'dashboard' : 'homepage';
                break;
            case isRepository: { // 程式碼儲存庫頁面
                const repoMatch = pathname.match(I18N.conf.rePagePathRepo);
                pageType = repoMatch ? `repository/${repoMatch[1]}` : 'repository';
                break;
            }
            case isOrganization: { // 組織頁面
                const orgMatch = pathname.match(I18N.conf.rePagePathOrg);
                pageType = orgMatch ? `orgs/${orgMatch[1] || orgMatch.slice(-1)[0]}` : 'orgs';
                break;
            }
            default: { // 預設頁面類型
                const pathMatch = pathname.match(I18N.conf.rePagePath);
                pageType = pathMatch ? (pathMatch[1] || pathMatch.slice(-1)[0]) : false;
            }
        }

        // 驗證頁面類型是否有效
        if (pageType === false || !I18N[CONFIG.LANG]?.[pageType]) {
            const reason = pageType === false
                ? '路徑未符合任何頁面規則'
                : `詞庫中缺少 "${pageType}" 的翻譯`;
            console.warn('[i18n] %s', reason, {
                url: window.location.href,
                hostname,
                pathname,
                site,
                pageType,
                isLogin,
                metaLocation
            });
            return false;
        }

        return pageType;
    }

    /* =========================== React 新版頁首翻譯修補 =================== */
    /**
     * 模組：React 新版頁首翻譯修補
     * 說明：針對 GitHub 新版 React 頁首（GlobalNav）及其彈出層，
     *       透過 DOM 操作 + 精細的時機控制來翻譯文字，
     *       避免與 React 渲染發生衝突。
     * 作者：MasterBao66
     * 日期：2026-06-17
     */
    function isReactGlobalNavPortalNode(node) {
        const element = node?.nodeType === 1 ? node : node?.parentElement;
        const portalRoot = element?.closest?.('#__primerPortalRoot__');
        if (!portalRoot) return false;

        const portal = element.closest?.('[data-component="Portal"]')
            || element.querySelector?.('[data-component="Portal"]')
            || portalRoot;
        if (portal.matches?.('#search-suggestions-dialog')
            || portal.querySelector?.('#search-suggestions-dialog')) return true;

        const referenceAttributes = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns'];
        const referenceElements = [
            portal,
            ...portal.querySelectorAll?.(
                referenceAttributes.map(attribute => `[${attribute}]`).join(', ')
            ) || [],
        ];

        for (const referenceElement of referenceElements) {
            for (const attribute of referenceAttributes) {
                const ids = referenceElement.getAttribute?.(attribute)?.split(/\s+/) || [];
                if (ids.some(id => document.getElementById(id)?.closest?.('header.GlobalNav'))) {
                    return true;
                }
            }
        }

        const portalIds = new Set([
            portal.id,
            ...Array.from(portal.querySelectorAll?.('[id]') || [], item => item.id),
        ].filter(Boolean));
        if (portalIds.size) {
            const headerReferences = document.querySelectorAll(
                'header.GlobalNav [aria-describedby], header.GlobalNav [aria-controls], header.GlobalNav [aria-owns]'
            );
            for (const headerReference of headerReferences) {
                for (const attribute of ['aria-describedby', 'aria-controls', 'aria-owns']) {
                    const ids = headerReference.getAttribute(attribute)?.split(/\s+/) || [];
                    if (ids.some(id => portalIds.has(id))) return true;
                }
            }
        }

        const hasControlledSurface = portal.matches?.('[role="menu"], [role="dialog"], [role="tooltip"]')
            || portal.querySelector?.('[role="menu"], [role="dialog"], [role="tooltip"]');
        return !!hasControlledSurface
            && !!document.activeElement?.closest?.('header.GlobalNav, qbsearch-input');

    }

    function setupReactGlobalNavTranslation() {
        // ----- 環境檢查 -----
        if (typeof document === 'undefined' || typeof window === 'undefined') return;

        // ----- 詞庫（從 I18N 讀取）-----
        const labels = I18N.conf.reactGlobalNavLabels || {};

        // ----- 選擇器定義 -----
        const dataContentLabelSelector = 'header.GlobalNav [data-component="text"][data-content]';
        // 需要監聽的 React 渲染區域：頁首與彈出層
        const controlledSurfaceSelector = [
            'header.GlobalNav',
            '#__primerPortalRoot__ [role="menu"]',
            '#__primerPortalRoot__ [role="dialog"]',
            '#__primerPortalRoot__ [role="tooltip"]',
        ].join(', ');
        // 僅彈出層（用於單獨判斷更新狀態）
        const portalSurfaceSelector = '#__primerPortalRoot__ [role="menu"], #__primerPortalRoot__ [role="dialog"], #__primerPortalRoot__ [role="tooltip"]';
        // 舊版搜尋框（相容）
        const searchSurfaceSelector = 'qbsearch-input';
        // 新版搜尋模組（類別名稱包含 Search-module__）
        const searchModuleSelector = 'header.GlobalNav [class*="Search-module__"]';
        // 不翻譯的標籤（避免破壞程式碼、圖片等）
        const unsafeTextSelector = [
            'textarea',
            '[contenteditable="true"]',
            'code',
            'pre',
            'kbd',
            'svg',
            'img',
            'canvas',
            'video',
        ].join(', ');
        // 搜尋相關區域（用於判斷焦點狀態）
        const searchSelector = `${searchModuleSelector}, ${searchSurfaceSelector}, #__primerPortalRoot__ [role="dialog"]`;
        // 需要翻譯的屬性清單
        const translatableAttributeNames = ['title', 'aria-label', 'data-visible-text', 'placeholder'];

        // ----- 時間控制參數 -----
        const reactGlobalNavIdleMs = 700;       // 判斷渲染閒置的等待時間（毫秒）
        const reactGlobalNavRetryMs = 400;      // 重試間隔

        // ----- 狀態變數 -----
        let timer = null;                       // 延時執行控制代碼
        let headerObserver = null;              // MutationObserver 實例
        let lastReactGlobalNavMutationAt = Date.now();     // 頁首最後變化時間
        let lastReactGlobalNavPortalMutationAt = Date.now(); // 彈出層最後變化時間
        const observedSurfaces = new WeakSet(); // 已監聽的 DOM 元素（避免重複繫結）


        // ----- 狀態查詢函式 -----
        /**
         * 判斷目前是否處於搜尋啟用狀態（輸入框有焦點或彈出層開啟）
         */
        function isReactGlobalNavSearchActive() {
            const active = document.activeElement;
            return !!active?.closest?.(searchSelector)
                || !!document.querySelector('#__primerPortalRoot__ [role="dialog"]');
        }

        /**
         * 判斷指定區域是否已經處於閒置狀態（無變化超過 IDLE_MS）
         * @param {string} surfaceType - 'header' 或 'portal'
         */
        function isReactGlobalNavSurfaceIdle(surfaceType = 'header') {
            const lastMutationAt = surfaceType === 'portal'
                ? lastReactGlobalNavPortalMutationAt
                : lastReactGlobalNavMutationAt;
            return Date.now() - lastMutationAt >= reactGlobalNavIdleMs;
        }

        /**
         * 判斷是否可以進行頁首翻譯
         * 條件：頁面完全載入、頁首閒置、搜尋未啟用
         */
        function canTranslateReactGlobalNavHeader() {
            return document.readyState === 'complete'
                && isReactGlobalNavSurfaceIdle('header')
                && !isReactGlobalNavSearchActive();
        }

        // ----- 詞庫尋找函式（與現有 I18N 整合） -----
        /**
         * 從 I18N 的靜態詞典中尋找翻譯
         * @param {string} source - 原文
         * @returns {string|null}
         */
        function findStaticGlobalNavLabel(source) {
            const locale = I18N["zh-TW"] || I18N.zh;
            if (!locale) return null;

            for (const section of Object.values(locale)) {
                const label = section?.static?.[source];
                if (typeof label === 'string' && label && label !== source) {
                    return label;
                }
            }

            return null;
        }

        /**
         * 從 I18N 的正規表達式規則中尋找翻譯
         */
        function findRegexpGlobalNavLabel(source) {
            const locale = I18N["zh-TW"] || I18N.zh;
            if (!locale) return null;

            for (const section of Object.values(locale)) {
                for (const [pattern, replacement] of section?.regexp || []) {
                    const match = source.match(pattern);
                    if (!match || match.index !== 0 || match[0] !== source) continue;

                    const label = source.replace(pattern, replacement);
                    if (label !== source) return label;
                }
            }

            return null;
        }

        /**
         * 解析翻譯：優先硬編碼標籤 -> 靜態詞庫 -> 正規表達式詞庫
         */
        function resolveReactGlobalNavLabel(source) {
            return labels[source] || findStaticGlobalNavLabel(source) || findRegexpGlobalNavLabel(source);
        }

        // ----- 文字處理輔助函式 -----
        function normalizeReactGlobalNavText(text) {
            return text?.replace(/\s+/g, ' ').trim();
        }

        function translateReactGlobalNavText(text) {
            const source = normalizeReactGlobalNavText(text);
            return source ? resolveReactGlobalNavLabel(source) : null;
        }

        // ----- 翻譯執行函式 -----
        /**
         * 翻譯單一元素的文字內容（直接修改 textContent）
         */
        function translateReactGlobalNavElement(element, source) {
            const label = translateReactGlobalNavText(source ?? element.textContent);
            if (label && element.textContent !== label) {
                element.textContent = label;
            }
        }

        /**
         * 判斷節點是否應該被跳過（不翻譯）
         */
        function shouldSkipReactGlobalNavNode(node) {
            const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            if (!element) return true;
            if (element.closest?.(unsafeTextSelector)) return true;
            if (element.closest?.(searchModuleSelector)) return true;
            if (element.closest?.(searchSurfaceSelector)) return true;

            return false;
        }

        /**
         * 翻譯元素的可翻譯屬性（title、aria-label 等）
         */
        function translateReactGlobalNavAttributes(element) {
            translatableAttributeNames.forEach(attributeName => {
                const value = element.getAttribute?.(attributeName);
                const label = translateReactGlobalNavText(value);
                if (label && value !== label) {
                    element.setAttribute(attributeName, label);
                }
            });
        }

        /**
         * 翻譯文字節點
         */
        function translateReactGlobalNavTextNode(node) {
            const label = translateReactGlobalNavText(node.data);
            if (label) {
                // 取代原有文字（保留前後空白）
                node.data = node.data.replace(node.data.trim(), label);
            }
        }

        /**
         * 走訪並翻譯整個 Surface（區域）
         * 使用 TreeWalker 走訪所有元素與文字節點
         */
        function translateReactGlobalNavSurface(surface) {
            if (!surface || shouldSkipReactGlobalNavNode(surface)) return;

            if (surface.nodeType === Node.ELEMENT_NODE) {
                translateReactGlobalNavAttributes(surface);
            }

            const walker = document.createTreeWalker(
                surface,
                NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
                {
                    acceptNode(node) {
                        return shouldSkipReactGlobalNavNode(node)
                            ? NodeFilter.FILTER_REJECT
                            : NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            let node;
            while ((node = walker.nextNode())) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    translateReactGlobalNavAttributes(node);
                } else if (node.nodeType === Node.TEXT_NODE) {
                    translateReactGlobalNavTextNode(node);
                }
            }
        }

        // ----- 主翻譯進入點 -----
        /**
         * 翻譯頁首（header.GlobalNav）
         * @returns {boolean} 是否成功翻譯（頁首存在且閒置）
         */
        function translateReactGlobalNavHeader() {
            const header = document.querySelector('header.GlobalNav');
            if (!header) return true;   // 不存在時視為已處理
            if (!canTranslateReactGlobalNavHeader()) return false;

            // 優先翻譯包含 data-content 的元素（React 元件透過此屬性儲存原始文案）
            document.querySelectorAll(dataContentLabelSelector).forEach(element => {
                if (!shouldSkipReactGlobalNavNode(element)) {
                    translateReactGlobalNavElement(element, element.getAttribute('data-content'));
                }
            });
            // 翻譯整個頁首區域
            translateReactGlobalNavSurface(header);

            return true;
        }

        function isReactGlobalNavSearchPortal(surface) {
            return surface.matches?.('[role="dialog"]')
                || !!surface.querySelector?.('#search-suggestions-dialog, qbsearch-input, [role="dialog"]');
        }

        /**
         * 翻譯彈出層（portal）
         * @returns {boolean} 是否成功翻譯（彈出層存在且閒置）
         */
        function translateReactGlobalNavPortals() {
            const surfaces = Array.from(document.querySelectorAll(portalSurfaceSelector))
                .filter(isReactGlobalNavPortalNode);
            if (!surfaces.length) return true;

            let searchPortalPending = false;
            surfaces.forEach(surface => {
                if (isReactGlobalNavSearchPortal(surface) && !isReactGlobalNavSurfaceIdle('portal')) {
                    searchPortalPending = true;
                    return;
                }
                translateReactGlobalNavSurface(surface);
            });

            return !searchPortalPending;
        }

        /**
         * 總翻譯進入點，由排程函式呼叫
         * @param {object} options - { requireSettledHeader: true/false }
         */
        function translateReactGlobalNavLabels(options = { requireSettledHeader: true }) {
            observeReactGlobalNav();   // 確保觀察器已啟動

            const headerTranslated = translateReactGlobalNavHeader();
            const portalsTranslated = translateReactGlobalNavPortals();

            // 如果未完成（頁首未就緒或彈出層未閒置），則安排重試
            if ((options.requireSettledHeader && !headerTranslated) || !portalsTranslated) {
                scheduleReactGlobalNavTranslation(reactGlobalNavRetryMs, options);
            }
        }

        // ----- 排程函式 -----
        /**
         * 延遲排程翻譯
         */
        function scheduleReactGlobalNavTranslation(delay = 800, options = {}) {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => translateReactGlobalNavLabels(options), delay);
        }

        /**
         * 初始啟動序列：在多個時間點嘗試翻譯，涵蓋 React 非同步渲染
         */
        function scheduleReactGlobalNavSeries() {
            [800, 1600, 3000].forEach(delay => {
                window.setTimeout(translateReactGlobalNavLabels, delay);
            });
        }

        // ----- MutationObserver 與狀態紀錄 -----
        /**
         * 記錄 DOM 變化的時間戳記（區分頁首與彈出層）
         */
        function recordReactGlobalNavMutation(surface) {
            if (surface?.id === '__primerPortalRoot__' || surface?.closest?.('#__primerPortalRoot__')) {
                lastReactGlobalNavPortalMutationAt = Date.now();
                return;
            }

            lastReactGlobalNavMutationAt = Date.now();
        }

        /**
         * 設定 MutationObserver，監聽頁首與彈出層的變化
         */
        function observeReactGlobalNav() {
            if (!headerObserver) {
                headerObserver = new MutationObserver(mutations => {
                    mutations.forEach(mutation => recordReactGlobalNavMutation(mutation.target));
                    translateReactGlobalNavPortals();
                    // 變化後延遲重試翻譯
                    scheduleReactGlobalNavTranslation(reactGlobalNavRetryMs, { requireSettledHeader: true });
                });
            }

            [
                document.querySelector('header.GlobalNav'),
                document.querySelector('#__primerPortalRoot__'),
            ].forEach(surface => {
                if (!surface || observedSurfaces.has(surface)) return;

                observedSurfaces.add(surface);
                recordReactGlobalNavMutation(surface);
                headerObserver.observe(surface, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                });
            });
        }

        function startReactGlobalNavTranslation() {
            observeReactGlobalNav();
            scheduleReactGlobalNavSeries();
        }

        // ----- 初始化進入點 -----
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startReactGlobalNavTranslation, { once: true });
        } else {
            startReactGlobalNavTranslation();
        }

        // 監聽 Turbo 導覽與 URL 變化
        window.addEventListener('turbo:load', scheduleReactGlobalNavSeries);
        window.addEventListener('urlchange', scheduleReactGlobalNavSeries);

        // 監聽使用者互動事件，互動後可能觸發 React 更新，延遲重試翻譯
        ['click', 'focusin', 'focusout', 'pointerover'].forEach(evt => {
            document.addEventListener(evt, () => scheduleReactGlobalNavTranslation(reactGlobalNavRetryMs, { requireSettledHeader: true }), true);
        });
    }

    /* =========================== MutationObserver =========================== */

    /**
     * 設定 DOM 變化觀察器
     * 監聽頁面變化並觸發翻譯
     */
    function setupMutationObserver() {
        // 快取目前頁面的 URL
        let previousURL = window.location.href;

        if (State.mutationObserver) {
            State.mutationObserver.disconnect();
        }

        State.mutationObserver = new MutationObserver(
            safe((mutations) => {
                const currentURL = window.location.href;
                // 當沒有 onurlchange 支援時，透過 Observer 偵測 URL 變化
                if (!State.urlChangeHandler && currentURL !== previousURL) {
                    previousURL = currentURL;
                    State.currentURL = currentURL;
                    updatePageConfig("URL 變化 (MutationObserver)");
                }

                // 處理 DOM 變化
                if (State.pageConfig) {
                    processMutations(mutations);
                }
            }, 'MutationObserver')
        );

        // 開始觀察頁面主體
        State.mutationObserver.observe(document.body, CONFIG.OBSERVER_CONFIG);
    }

    /**
     * 處理 MutationObserver 偵測到的變化
     * 收集變動節點、過濾忽略選擇器、對祖先-後代關係去重，僅走訪頂層節點
     * @param {Array} mutations - 變化紀錄陣列
     */
    function shouldIgnoreMutationNode(node) {
        const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        if (!element) return true;

        const ignoredSelectors = State.pageConfig?.ignoreMutationSelectors;
        if (ignoredSelectors && element.closest?.(ignoredSelectors)) return true;

        return isReactGlobalNavPortalNode(element);
    }

    function processMutations(mutations) {
        const nodesToProcess = new Set();

        // 收集需要處理的節點
        mutations.forEach(({ target, addedNodes, type }) => {
            if (type === 'childList' && addedNodes.length > 0) {
                // 處理新增節點
                addedNodes.forEach(node => {
                    if (!shouldIgnoreMutationNode(node)) {
                        nodesToProcess.add(node);
                    }
                });
            } else if (type === 'attributes') {
                // 處理屬性變化，target 就是元素
                if (!shouldIgnoreMutationNode(target)) {
                    nodesToProcess.add(target);
                }
            } else if (type === 'characterData' && State.pageConfig.characterData) {
                // 處理文字變化，target 是文字節點，取其父元素
                if (!shouldIgnoreMutationNode(target)) {
                    nodesToProcess.add(target);
                }
            }
        });

        // 過濾掉祖先已在集合中的後代節點，避免重複走訪
        const topNodes = new Set();
        nodesToProcess.forEach(node => {
            let ancestor = node.parentElement;
            let hasAncestor = false;
            while (ancestor) {
                if (nodesToProcess.has(ancestor)) {
                    hasAncestor = true;
                    return;
                }
                ancestor = ancestor.parentElement;
            }
            if (!hasAncestor) {
                topNodes.add(node);
            }
        });

        if (CONFIG.DEV) console.log("DOM 變化(已過濾)", topNodes);

        // 僅走訪頂層節點
        topNodes.forEach(node => {
            traverseNode(node);
        });
    }

    /* =========================== DOM 走訪與節點處理 =========================== */
    /**
     * 走訪節點樹並進行翻譯
     * @param {Node} rootNode - 要走訪的根節點
     */
    function traverseNode(rootNode) {
        const start = performance.now();

        // 文字節點直接處理
        if (rootNode.nodeType === Node.TEXT_NODE) {
            handleTextNode(rootNode);
            return;
        }

        // 建立 TreeWalker 走訪節點樹
        const treeWalker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            node => {
                if (node.nodeType === Node.ELEMENT_NODE
                    && State.pageConfig.ignoreSelectors
                    && node.matches(State.pageConfig.ignoreSelectors)) {
                    return NodeFilter.FILTER_REJECT; // 跳過忽略的選擇器
                }
                return NodeFilter.FILTER_ACCEPT; // 接受其他節點
            }
        );

        let currentNode;
        // 走訪所有節點
        while ((currentNode = treeWalker.nextNode())) {
            if (currentNode.nodeType === Node.ELEMENT_NODE) {
                handleElementNode(currentNode);
            } else if (currentNode.nodeType === Node.TEXT_NODE) {
                handleTextNode(currentNode);
            }
        }

        // 效能監控
        const duration = performance.now() - start;
        if (duration > 10) {
            console.log(`節點走訪耗時: ${duration.toFixed(2)}ms`);
        }
    }

    /**
     * 處理文字節點
     * @param {Node} node - 文字節點
     */
    function handleTextNode(node) {
        if (node.length > 500) return; // 跳過長文字節點
        transElementAttrs(node, 'data'); // 翻譯文字內容
    }

    /**
     * 處理元素節點
     * @param {Element} node - 元素節點
     */
    function handleElementNode(node) {
        // 根據標籤類型進行不同的翻譯處理
        const tag = node.tagName;

        if (tag === "RELATIVE-TIME") { // 相對時間元素
            if (node.shadowRoot) {
                transTimeElement(node.shadowRoot);
            }
            return;
        }

        if (tag === "INPUT" || tag === "TEXTAREA") { // 輸入框與文字區域
            if (['button', 'submit', 'reset'].includes(node.type)) {
                transElementAttrs(node.dataset, 'confirm'); // 確認對話框文字
                transElementAttrs(node, 'value'); // 值屬性
            } else {
                transElementAttrs(node, 'placeholder'); // 佔位符
            }
            return;
        }

        if (tag === "OPTGROUP") { // 選項群組
            transElementAttrs(node, 'label'); // 標籤文字
            return;
        }

        if (tag === "BUTTON") { // 按鈕
            transElementAttrs(node, [
                'title',
                'cancelConfirmText'
            ]);
            transElementAttrs(node.dataset, [
                'confirm', // 確認文字
                'confirmText', // 確認按鈕文字
                'confirmCancelText', // 取消按鈕文字
                'disableWith', // 停用提示
                'visibleText'
            ]);
        }

        if (tag === "A" || tag === "SPAN") {
            transElementAttrs(node, 'title'); // 標題提示
            transElementAttrs(node.dataset, 'visibleText'); // 可見文字
        }

        // 帶有 tooltipped 樣式的元素
        if (/tooltipped/.test(node.className)) {
            transElementAttrs(node, 'ariaLabel');
        }
    }

    /* =========================== 翻譯功能 =========================== */

    /**
     * 翻譯頁面標題
     */
    function transTitle() {
        const text = document.title;
        let result = State.pageConfig.titleStaticDict[text] || '';

        // 嘗試靜態翻譯
        if (!result) {
            // 嘗試正規表達式翻譯
            for (const [pattern, replacement] of State.pageConfig.titleRegexpRules) {
                result = text.replace(pattern, replacement);
                if (result !== text) break;
            }
        }

        // 套用翻譯結果
        if (result) {
            document.title = result;
        }
    }

    /**
     * 翻譯時間元素
     * @param {Element} element - 時間元素
     */
    function transTimeElement(element) {
        // 取得時間文字
        const text = element.textContent;
        if (!text) return;
        // 移除開頭的 "on"
        const result = text.replace(/^on/, "");
        if (result !== text) {
            element.textContent = result; // 套用翻譯
        }
    }

    /**
     * 翻譯元素的單一屬性
     * @param {Object} target - 元素物件或元素資料集
     * @param {string} attrName - 要翻譯的屬性名稱
     */
    function transElementAttr(target, attrName) {
        const text = target[attrName];
        if (!text) return;

        const result = transText(text);
        if (result) {
            target[attrName] = result;
        }
    }

    /**
     * 批次翻譯元素的多個屬性
     * @param {Object} target - 元素物件或元素資料集
     * @param {string|string[]} attrs - 要翻譯的屬性名稱或屬性名稱陣列
     */
    function transElementAttrs(target, attrs) {
        const attrList = Array.isArray(attrs) ? attrs : [attrs];
        attrList.forEach(attrName => transElementAttr(target, attrName));
    }

    /**
     * 透過選擇器翻譯特定元素
     */
    function transBySelector() {
        State.pageConfig.transSelectors?.forEach(([selector, result]) => {
            const element = document.querySelector(selector);
            if (element) {
                element.textContent = result; // 套用翻譯
            }
        });
    }

    /**
     * 翻譯文字內容
     * @param {string} text - 要翻譯的文字
     * @returns {string|boolean} 翻譯後的文字或 false
     */
    function transText(text) {
        // 跳過不需要翻譯的文字：
        // 1. 空文字（含空白字元）或純數字
        // 2. 純中文字元
        // 3. 不包含英文字母與 ,. 符號的文字
        if (/^[\s0-9]*$/.test(text) ||
            /^[一-龥]+$/.test(text) ||
            !/[a-zA-Z,.]/.test(text)) {
            return false;
        }

        // 清理文字：去除首尾空格與多餘空白
        const trimmedText = text.trim();
        const cleanedText = trimmedText.replace(/\xa0|[\s]+/g, ' ');

        // 取得翻譯
        const result = fetchTransResult(cleanedText);
        if (result && result !== cleanedText) {
            return text.replace(trimmedText, result);
        }

        return false;
    }

    /**
     * 從詞庫取得翻譯 — 直接讀取 State.pageConfig
     * @param {string} text - 要翻譯的文字
     * @returns {string|boolean} 翻譯結果或 false
     */
    function fetchTransResult(text) {
        if (!State.pageConfig) return false;

        // 靜態詞典尋找
        const staticResult = State.pageConfig.staticDict[text];
        if (typeof staticResult === 'string') {
            MissedTermsManager.cleanup(text, State.pageConfig.currentPath);
            return staticResult;
        }

        // 正規表達式規則尋找
        if (State.featureSet.enable_RegExp) {
            for (const [pattern, replacement] of State.pageConfig.regexpRules) {
                const result = text.replace(pattern, replacement);
                if (result !== text) {
                    MissedTermsManager.cleanup(text, State.pageConfig.currentPath);
                    return result;
                }
            }
        }

        // 記錄未命中詞條
        if (State.featureSet.enable_missedTerms) {
            MissedTermsManager.record(text, State.pageConfig.currentPath);
            refreshMenuStates();
        }

        return false;
    }

    /* =========================== 遠端翻譯 =========================== */

    /**
     * 為描述元素新增翻譯按鈕
     * @param {string} selector - 描述元素的選擇器
     */
    function transDesc(selector) {
        const element = document.querySelector(selector);
        if (!element) return;

        // 修正：安全檢查 classList.contains，避免 null sibling 時當機
        const nextSibling = element.nextElementSibling;
        if (nextSibling?.classList?.contains('translate-button')) return;

        // 建立翻譯按鈕
        const button = document.createElement('div');
        button.classList.add('translate-button');
        button.textContent = '翻譯';
        element.after(button);

        // 繫結點擊事件
        button.addEventListener('click', () => handleTransClick(button, element));
    }

    /**
     * 處理翻譯按鈕點擊事件
     * @param {Element} button - 翻譯按鈕元素
     * @param {Element} element - 要翻譯的元素
     */
    function handleTransClick(button, element) {
        if (button.disabled) return;
        button.disabled = true; // 防止重複點擊

        const descText = element.textContent.trim();
        if (!descText) {
            button.disabled = false;
            return;
        }

        // 發起遠端翻譯請求
        requestRemoteTrans(descText)
            .then(result => {
                showTransResult(element, button, result);
            })
            .catch(error => {
                console.error('翻譯失敗:', error);
                button.disabled = false; // 啟用按鈕以允許重試
            });
    }

    /**
     * 顯示翻譯結果
     * @param {Element} element - 原始元素
     * @param {Element} button - 翻譯按鈕
     * @param {string} result - 翻譯結果
     */
    function showTransResult(element, button, result) {
        const { name, url } = CONFIG.TRANS_ENGINES[State.transEngine];

        // 建立結果容器 — 結構與不可信文字分離，防止 XSS
        const resultContainer = document.createElement('div');
        resultContainer.className = 'translation-result';
        resultContainer.innerHTML = `
            <span class="translation-credit">
                翻譯 👇
            </span>
            <br/>
            <div class="translation-content"></div>
        `;

        // API 回應文字使用 textContent，禁止 HTML 解析
        resultContainer.querySelector('.translation-content').textContent = result;

        // 移除按鈕並顯示結果
        button.remove();
        element.after(resultContainer);
    }

    /**
     * 請求遠端翻譯 API
     * @param {string} text - 要翻譯的文字
     * @returns {Promise} 回傳翻譯結果的 Promise
     */
    function requestRemoteTrans(text) {
        return new Promise((resolve, reject) => {
            const engine = CONFIG.TRANS_ENGINES[State.transEngine];
            const { url_api, method, headers, getRequestData, responseIdentifier } = engine;

            // 準備請求資料
            const requestData = getRequestData(text);

            // 使用 GM_xmlhttpRequest 發起跨網域請求
            GM_xmlhttpRequest({
                method: method,
                url: url_api,
                headers: headers,
                data: method === 'POST' ? JSON.stringify(requestData) : null,
                params: method === 'GET' ? requestData : null, // For GET requests
                timeout: 10000, // 10 秒逾時
                onload: (res) => {
                    try {
                        const response = JSON.parse(res.responseText);
                        // 從回應中擷取翻譯結果
                        const result = getNestedProperty(response, responseIdentifier);
                        if (result) {
                            resolve(result);
                        } else {
                            reject(new Error('翻譯結果無效'));
                        }
                    } catch (err) {
                        reject(err);
                    }
                },
                onerror: (err) => {
                    reject(err);
                }
            });
        });
    }

    /**
     * 安全取得巢狀物件屬性
     * 支援路徑格式如 'biz[0]?.sectionResult[0]?.dst'
     *   - '?.' 在路徑中作為可選鏈結標記被忽略，實際按強制存取處理
     * @param {Object} obj - 目標物件
     * @param {string} path - 屬性路徑
     * @returns {*} 屬性值或 undefined
     */
    function getNestedProperty(obj, path) {
        // 移除路徑中的 ?. 標記（訊飛 API 回傳的路徑表示可選，但此處按強制處理）
        const cleanPath = path.replace(/\?\./g, '.');
        return cleanPath.split('.').reduce((acc, part) => {
            if (!acc) return undefined;
            const match = part.match(/^(\w+)(?:\[(\d+)\])?$/);
            if (!match) return undefined;
            const key = match[1];
            const index = match[2];
            // 處理陣列索引或物件屬性
            return index !== undefined ? acc[key]?.[index] : acc[key];
        }, obj);
    }

    /* =========================== 未命中詞條管理器 =========================== */
    const MissedTermsManager = {
        /**
         * 未命中詞條資料結構（簡潔模式）
         * {
         *   [pathname]: {
         *     "原始文字1": "",
         *     "原始文字2": "",
         *     ...
         *   }
         * }
         */
        data: GM_getValue("missedTerms", {}),

        /**
         * 記錄未命中詞條
         * @param {string} text - 未翻譯的文字
         * @param {string} path - 目前頁面路徑
         */
        record(text, path) {
            if (!path) return false;
            if (!this.data[path]) {
                this.data[path] = {};
            }

            // 使用物件儲存，保持簡潔
            if (!(text in this.data[path])) {
                this.data[path][text] = "";
                this.save();
                return true; // 新增詞條
            }
            return false; // 詞條已存在
        },

        /**
         * 清理已命中的詞條
         * @param {string} text - 已翻譯的文字
         * @param {string} path - 目前頁面路徑
         */
        cleanup(text, path) {
            if (!path) return false;
            if (this.data[path] && text in this.data[path]) {
                delete this.data[path][text];

                // 如果該路徑下沒有詞條了，刪除路徑項目
                if (Object.keys(this.data[path]).length === 0) {
                    delete this.data[path];
                }
                this.save();
                return true;
            }
            return false;
        },

        /**
         * 取得所有未命中詞條
         * @returns {Object} 未命中詞條資料
         */
        getAll() {
            return this.data;
        },

        /**
         * 依路徑取得詞條
         * @param {string} path - 頁面路徑
         * @returns {Object} 該路徑下的詞條物件
         */
        getByPath(path) {
            return this.data[path] || {};
        },

        /**
         * 取得所有詞條的文字陣列（依路徑分組）
         * @returns {Array} 格式為 [{path, terms: []}, ...]
         */
        getAllTermsArray() {
            return Object.entries(this.data).map(([path, terms]) => ({
                path,
                terms: Object.keys(terms)
            }));
        },

        /**
         * 清空所有詞條
         */
        clearAll() {
            this.data = {};
            this.save();
        },

        /**
         * 清空指定路徑的詞條
         * @param {string} path - 頁面路徑
         */
        clearPath(path) {
            if (this.data[path]) {
                delete this.data[path];
                this.save();
            }
        },

        /**
         * 取得統計資訊
         * @returns {Object} 統計資訊
         */
        getStats() {
            const paths = Object.keys(this.data);
            const totalTerms = paths.reduce((sum, path) =>
                sum + Object.keys(this.data[path]).length, 0
            );
            return { totalPaths: paths.length, totalTerms: totalTerms };
        },

        /**
         * 匯出資料
         * @returns {Object} 匯出資料
         */
        exportData() {
            const data = this.data;
            const stats = this.getStats();
            return {
                metadata: {
                    exportedAt: new Date().toISOString(),
                    version: "1.0",
                    ...stats
                },
                data
            };
        },

        /**
         * 儲存資料到儲存空間
         */
        save() {
            GM_setValue("missedTerms", this.data);
        }
    };

    /* =========================== 使用者選單 =========================== */

    /**
     * 1. 動態選單管理
     */
    function refreshMenuStates() {
        // 取消註冊所有動態選單
        Object.values(State.dynamicMenus).forEach(id => GM_unregisterMenuCommand(id));
        State.dynamicMenus = {};

        // 僅開發者模式下顯示未命中詞條相關選單
        if (!CONFIG.DEV) return;

        // 切換選單
        const toggleLabel = `${State.featureSet.enable_missedTerms ? "停用" : "啟用"} 未命中詞條紀錄`;
        State.dynamicMenus.toggle = GM_registerMenuCommand(toggleLabel, () => {
            const newState = !State.featureSet.enable_missedTerms;
            State.featureSet.enable_missedTerms = newState;
            GM_setValue("enable_missedTerms", newState);

            if (!newState) {
                MissedTermsManager.clearAll();
                GM_notification("未命中詞條紀錄已停用，所有紀錄已清空");
            } else {
                GM_notification("未命中詞條紀錄已啟用");
            }

            refreshMenuStates();
        });

        // 啟用 + 有詞條時顯示匯出與清空選單
        if (State.featureSet.enable_missedTerms) {
            const stats = MissedTermsManager.getStats();
            const hasData = stats.totalTerms > 0;

            if (hasData) {
                // 匯出選單
                State.dynamicMenus.export = GM_registerMenuCommand(
                    `📥 匯出未命中詞條 (${stats.totalTerms} 條)`,
                    () => {
                        const exportData = MissedTermsManager.exportData();
                        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                            type: "application/json"
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `GitHub_未命中詞條_${new Date().toISOString().split('T')[0]}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                    }
                );

                // 清空選單
                State.dynamicMenus.clear = GM_registerMenuCommand(
                    "🗑️ 清空未命中詞條",
                    () => {
                        if (confirm(`確定要清空所有未命中詞條嗎？\n共 ${stats.totalPaths} 個頁面，${stats.totalTerms} 個詞條`)) {
                            MissedTermsManager.clearAll();
                            GM_notification("未命中詞條紀錄已清空");
                            refreshMenuStates();
                        }
                    }
                );

                // 查看統計選單
                State.dynamicMenus.stats = GM_registerMenuCommand(
                    "📊 查看統計",
                    () => {
                        const s = MissedTermsManager.getStats();
                        GM_notification({
                            title: "未命中詞條統計",
                            text: `頁面數: ${s.totalPaths}\n詞條數: ${s.totalTerms}`,
                            timeout: 5000
                        });
                    }
                );
            }
        }
    }

    /**
     * 2. 靜態選單建立
     * @param {Object} config - 選單設定
     */
    function createMenuCommand(config) {
        const { label, key, callback } = config;
        let menuId;

        // 產生選單標籤（根據目前狀態）
        const getMenuLabel = () =>
            `${State.featureSet[key] ? "停用" : "啟用"} ${label}`;

        // 切換功能狀態
        const toggle = () => {
            const newState = !State.featureSet[key];
            // 儲存到儲存空間
            GM_setValue(key, newState);
            State.featureSet[key] = newState;
            // 顯示通知
            GM_notification(`${label}已${newState ? '啟用' : '停用'}`);

            // 執行回呼
            callback?.(newState);

            // 重新註冊選單（更新標籤）
            GM_unregisterMenuCommand(menuId);
            menuId = GM_registerMenuCommand(getMenuLabel(), toggle);
        };

        // 初始註冊選單
        menuId = GM_registerMenuCommand(getMenuLabel(), toggle);
    }

    /**
     * 3. 主選單設定
     */
    function setupMenuCommands() {
        const menuConfigs = [
            {
                label: "正規表達式功能",
                key: "enable_RegExp",
                callback: (enabled) => {
                    if (enabled && State.pageConfig) safe(traverseNode, '選單觸發遍歷')(document.body);
                }
            },
            {
                label: "描述翻譯",
                key: "enable_transDesc",
                callback: (enabled) => {
                    const pageType = State.pageConfig?.currentPageType;
                    if (enabled && pageType) {
                        // 啟用描述翻譯
                        transDesc(CONFIG.DESC_SELECTORS[pageType]);
                    } else if (!enabled) {
                        // 停用描述翻譯，移除按鈕
                        document.querySelector('.translate-button')?.remove();
                    }
                }
            }
        ];

        // 為每個設定建立靜態選單
        menuConfigs.forEach(config => createMenuCommand(config));

        // 初始化動態選單
        refreshMenuStates();
    }

    /* =========================== 啟動 =========================== */
    init();
})(window, document);
