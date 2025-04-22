// ==UserScript==
// @name         GitHub 繁體中文化
// @namespace    https://github.com/LaiYueTing/GitHub-zh_TW
// @description  繁體中文化 GitHub 介面的部分選單及內容。
// @copyright    2025, LaiYueTing (https://github.com/LaiYueTing)
// @icon         https://github.githubassets.com/pinned-octocat.svg
// @version      1.9.3
// @author       LaiYueTing
// @license      GPL-3.0
// @match        https://github.com/*
// @match        https://skills.github.com/*
// @match        https://gist.github.com/*
// @match        https://education.github.com/*
// @match        https://www.githubstatus.com/*
// @require      https://raw.githubusercontent.com/LaiYueTing/GitHub-zh_TW/main/locals.js?v1.9.3
// @run-at       document-start
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

    /****************** 全域設定區（開發者可修改部分） ******************/
    const FeatureSet = {
        enable_RegExp: GM_getValue("enable_RegExp", true),
        enable_transDesc: GM_getValue("enable_transDesc", true),
    };
    const CONFIG = {
        LANG: 'zh-TW',
        // 網站域名 -> 類型映射
        PAGE_MAP: {
            'gist.github.com': 'gist',
            'www.githubstatus.com': 'status',
            'skills.github.com': 'skills',
            'education.github.com': 'education'
        },
        // 需要特殊處理的網站類型
        SPECIAL_SITES: ['gist', 'status', 'skills', 'education'],
        // 簡介 CSS 篩選器規則
        DESC_SELECTORS: {
            repository: ".f4.my-3",
            gist: ".gist-content [itemprop='about']"
        },
        OBSERVER_CONFIG: {
            childList: true,
            subtree: true,
            characterData: true,
            attributeFilter: ['value', 'placeholder', 'aria-label', 'data-confirm']
        },
        // 目前使用引擎（開發者可切換）
        transEngine: 'iflyrec',
        // 翻譯引擎設定
        TRANS_ENGINES: {
            iflyrec: {
                name: '訊飛聽見',
                url: 'https://fanyi.iflyrec.com/text-translate',
                url_api: 'https://fanyi.iflyrec.com/TJHZTranslationService/v2/textAutoTranslation',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://fanyi.iflyrec.com'
                },
                // 請求體資料結構
                getRequestData: (text) => ({
                    from: 2,
                    to: 1,
                    type: 1,
                    contents: [{ text: text }]
                }),
                // 響應標識
                responseIdentifier: 'biz[0]?.sectionResult[0]?.dst',
            },
        }
    };

    let pageConfig = {};

    // 初始化
    init();

    // 更新頁面設定
    function updatePageConfig(currentPageChangeTrigger) {
        const newType = detectPageType();
        if (newType && newType !== pageConfig.currentPageType) {
            pageConfig = buildPageConfig(newType);
        }
        console.log(`【Debug】${currentPageChangeTrigger} 觸發, 頁面類型為 ${pageConfig.currentPageType}`);
    }

    // 構建頁面設定 pageConfig 對象
    function buildPageConfig(pageType = pageConfig.currentPageType) {
        return {
            // 目前頁面類型
            currentPageType: pageType,
            // 靜態詞庫
            staticDict: {
                ...I18N[CONFIG.LANG].public.static,
                ...(I18N[CONFIG.LANG][pageType]?.static || {})
            },
            // 正規表達式詞庫
            regexpRules: [
                ...(I18N[CONFIG.LANG][pageType]?.regexp || []),
                ...I18N[CONFIG.LANG].public.regexp
            ],
            // 忽略突變元素選擇器（字串）
            ignoreMutationSelectors: [
                ...I18N.conf.ignoreMutationSelectorPage['*'],
                ...(I18N.conf.ignoreMutationSelectorPage[pageType] || [])
            ].join(', '),
            // 忽略元素選擇器規則（字串）
            ignoreSelectors: [
                ...I18N.conf.ignoreSelectorPage['*'],
                ...(I18N.conf.ignoreSelectorPage[pageType] || [])
            ].join(', '),
            // 字元資料監視開啟規則（布林值）
            characterData: I18N.conf.characterDataPage.includes(pageType),
            // CSS 選擇器規則
            tranSelectors: [
                ...(I18N[CONFIG.LANG].public.selector || []),
                ...(I18N[CONFIG.LANG][pageType]?.selector || [])
            ],
        };
    }

    /**
     * watchUpdate 函式：監視頁面變化，根據變化的節點進行翻譯
     */
    function watchUpdate() {
        // 快取目前頁面的 URL
        let previousURL = window.location.href;

        const handleUrlChange = () => {
            const currentURL = window.location.href;
            // 如果頁面的 URL 發生變化
            if (currentURL !== previousURL) {
                previousURL = currentURL;
                updatePageConfig("DOM 變化");
            }
        }

        const processMutations = mutations => {
            // 平鋪突變記錄並過濾需要處理的節點（鏈式操作）
            // 使用 mutations.flatMap 進行篩選突變:
            //   1. 針對 `節點增加` 突變，後期疊代翻譯的對象調整為 `addedNodes` 中記錄的新增節點，而不是 `target`，此舉大幅減少重複疊代翻譯
            //   2. 對於其他 `屬性` 和特定頁面 `文字節點` 突變，仍舊直接處理 `target`
            //   3. 使用 `.filter()` 篩選丟棄特定頁面 `特定忽略元素` 內突變的節點
            mutations.flatMap(({ target, addedNodes, type }) => {
                // 處理子節點新增的情況
                if (type === 'childList' && addedNodes.length > 0) {
                    return [...addedNodes]; // 將新增節點轉換為數組
                }
                // 處理屬性和文字內容變更的情況
                return (type === 'attributes' || (type === 'characterData' && pageConfig.characterData))
                    ? [target] // 否則，僅處理目標節點
                    : [];
            })
            // 過濾需要忽略的突變節點
            .filter(node =>
                // 剔除節點在忽略選擇器的父元素內
                !node.parentElement?.closest(pageConfig.ignoreMutationSelectors)
            )
            // 處理每個變化
            .forEach(node =>
                // 遞迴遍歷節點樹進行處理
                traverseNode(node)
            );
        }

        // 監聽 document.body 下 DOM 變化，用於處理節點變化
        new MutationObserver(mutations => {
            handleUrlChange();
            if (pageConfig.currentPageType) processMutations(mutations);
        }).observe(document.body, CONFIG.OBSERVER_CONFIG);
    }

    /**
     * traverseNode 函式：遍歷指定的節點，並對節點進行翻譯。
     * @param {Node} node - 需要遍歷的節點。
     */
    function traverseNode(rootNode) {
        const start = performance.now();

        const handleTextNode = node => {
            if (node.length > 500) return;
            transElement(node, 'data');
        }

        // 如果 rootNode 是文字節點，直接處理
        if (rootNode.nodeType === Node.TEXT_NODE) {
            handleTextNode(rootNode);
            return; // 文字節點沒有子節點，直接回傳
        }

        const treeWalker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            node =>
                // 跳過忽略的節點
                node.matches?.(pageConfig.ignoreSelectors)
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT,
        );

        const handleElement = node => {
            // 處理不同標籤的元素屬性翻譯
            switch (node.tagName) {
                case "RELATIVE-TIME": // 翻譯時間元素
                    transTimeElement(node.shadowRoot);
                    return;

                case "INPUT":
                case "TEXTAREA": // 輸入框 按鈕 文字域
                    if (['button', 'submit', 'reset'].includes(node.type)) {
                        transElement(node.dataset, 'confirm'); // 翻譯 瀏覽器 提示對話框
                        transElement(node, 'value');
                    } else {
                        transElement(node, 'placeholder');
                    }
                    break;

                case "OPTGROUP":
                    transElement(node, 'label'); // 翻譯 <optgroup> 的 label 屬性
                    break;

                case "BUTTON":
                    transElement(node, 'title'); // 翻譯 瀏覽器 提示對話框
                    transElement(node.dataset, 'confirm'); // 翻譯 瀏覽器 提示對話框
                    transElement(node.dataset, 'confirmText'); // 翻譯 瀏覽器 提示對話框
                    transElement(node.dataset, 'confirmCancelText'); // 取消按鈕 提醒
                    transElement(node, 'cancelConfirmText'); // 取消按鈕 提醒
                    transElement(node.dataset, 'disableWith'); // 按鈕等待提示

                case "A":
                case "SPAN":
                    transElement(node, 'title'); // title 屬性

                default:
                    // 僅當 元素存在 'tooltipped' 樣式 aria-label 才起效果
                    if (/tooltipped/.test(node.className)) transElement(node, 'ariaLabel'); // 帶提示的元素，類似 tooltip 效果的
            }
        }

        // 預綁定處理函式提升性能
        const handlers = {
            [Node.ELEMENT_NODE]: handleElement,
            [Node.TEXT_NODE]: handleTextNode
        };

        let currentNode;
        while ((currentNode = treeWalker.nextNode())) {
            handlers[currentNode.nodeType]?.(currentNode);
        }

        const duration = performance.now() - start;
        if (duration > 10) {
            // console.warn(`【Debug】節點遍歷耗時：${duration.toFixed(2)}ms`, rootNode);
            console.log(`節點遍歷耗時：${duration.toFixed(2)}ms`);
        }
    }

    /**
     * detectPageType 函式：檢測目前頁面類型，基於 URL、元素類名和 meta 資訊。
     * @returns {string|boolean} 頁面的類型，如 'repository'、'dashboard' 等，如果無法確定類型，那麼回傳 false。
     */
    function detectPageType() {
        const url = new URL(window.location.href);
        const { PAGE_MAP, SPECIAL_SITES } = CONFIG;
        const { hostname, pathname } = url;

        // 基礎設定 ===============================================
        const site = PAGE_MAP[hostname] || 'github'; // 透過網站映射取得基礎類型
        const isLogin = document.body.classList.contains("logged-in");
        const metaLocation = document.head.querySelector('meta[name="analytics-location"]')?.content || '';

        // 頁面特徵檢測 ============================================
        const isSession = document.body.classList.contains("session-authentication");
        const isHomepage = pathname === '/' && site === 'github';
        const isProfile = document.body.classList.contains("page-profile") || metaLocation === '/<user-name>';
        const isRepository = /\/<user-name>\/<repo-name>/.test(metaLocation);
        const isOrganization = /\/<org-login>/.test(metaLocation) || /^\/(?:orgs|organizations)/.test(pathname);

        // 正規表達式設定 ================================================
        const { rePagePathRepo, rePagePathOrg, rePagePath } = I18N.conf;

        // 核心判斷邏輯 ============================================
        let pageType;
        switch (true) { // 使用 switch(true) 模式處理多條件分支
            // 1. 登入相關頁面
            case isSession:
                pageType = 'session-authentication';
                break;

            // 2. 特殊網站類型（gist/status/skills/education）
            case SPECIAL_SITES.includes(site):
                pageType = site;
                break;

            // 3. 個人資料頁
            case isProfile:
                const tabParam = new URLSearchParams(url.search).get('tab');
                pageType = pathname.includes('/stars') ? 'page-profile/stars'
                         : tabParam ? `page-profile/${tabParam}`
                         : 'page-profile';
                break;

            // 4. 首頁 / 儀表板
            case isHomepage:
                pageType = isLogin ? 'dashboard' : 'homepage';
                break;

            // 5. 程式碼倉庫頁
            case isRepository:
                const repoMatch = pathname.match(rePagePathRepo);
                pageType = repoMatch ? `repository/${repoMatch[1]}` : 'repository';
                break;

            // 6. 組織頁面
            case isOrganization:
                const orgMatch = pathname.match(rePagePathOrg);
                pageType = orgMatch ? `orgs/${orgMatch[1] || orgMatch.slice(-1)[0]}` : 'orgs';
                break;

            // 7. 預設處理邏輯
            default:
                const pathMatch = pathname.match(rePagePath);
                pageType = pathMatch ? (pathMatch[1] || pathMatch.slice(-1)[0]) : false;
        }

        console.log(`【Debug】pathname = ${pathname}, site = ${site}, isLogin = ${isLogin}, analyticsLocation = ${metaLocation}, isOrganization = ${isOrganization}, isRepository = ${isRepository}, isProfile = ${isProfile}, isSession = ${isSession}`)

        // 詞庫校驗 ================================================
        if (pageType === false || !I18N[CONFIG.LANG]?.[pageType]) {
            console.warn(`[i18n] 頁面類型未匹配或詞庫缺失：${pageType}`);
            return false; // 明確回傳 false 表示異常
        }

        return pageType;
    }

    /**
     * transTitle 函式：翻譯頁面標題
     */
    function transTitle() {
        const text = document.title; // 取得標題文字內容
        let translatedText = I18N[CONFIG.LANG]['title']['static'][text] || '';
        if (!translatedText) {
            const res = I18N[CONFIG.LANG]['title'].regexp || [];
            for (const [pattern, replacement] of res) {
                translatedText = text.replace(pattern, replacement);
                if (translatedText !== text) break;
            }
        }
        document.title = translatedText;
    }

    /**
     * transTimeElement 函式：翻譯時間元素文字內容。
     * @param {Element} el - 需要翻譯的元素。
     */
    function transTimeElement(el) {
        const text = el.childNodes.length > 0 ? el.lastChild.textContent : el.textContent;
        const translatedText = text.replace(/^on/, "");
        if (translatedText !== text) {
            el.textContent = translatedText;
        }
    }

    /**
     * transElement 函式：翻譯指定元素的文字內容或屬性。
     * @param {Element|DOMStringMap} el - 需要翻譯的元素或元素的資料集 (node.dataset)。
     * @param {string} field - 需要翻譯的屬性名稱或文字內容欄位。
     */
    function transElement(el, field) {
        const text = el[field]; // 取得需要翻譯的文字
        if (!text) return false; // 當 text 為空時，退出函式

        const translatedText = transText(text); // 翻譯後的文字
        if (translatedText) {
            el[field] = translatedText; // 替換翻譯後的內容
        }
    }

    /**
     * transText 函式：翻譯文字內容。
     * @param {string} text - 需要翻譯的文字內容。
     * @returns {string|boolean} 翻譯後的文字內容，如果沒有找到對應的翻譯，那麼回傳 false。
     */
    function transText(text) {
        // 判斷是否需要跳過翻譯
        //  1. 檢查內容是否為空或者僅包含空白字元或數字。
        //  2. 檢查內容是否僅包含中文字符。
        //  3. 檢查內容是否不包含英文字母和符號。
        const shouldSkip = text => /^[\s0-9]*$/.test(text) || /^[\u4e00-\u9fa5]+$/.test(text) || !/[a-zA-Z,.]/.test(text);
        if (shouldSkip(text)) return false;

        // 清理文字內容
        const trimmedText = text.trim(); // 去除首尾空格
        const cleanedText = trimmedText.replace(/\xa0|[\s]+/g, ' '); // 去除多餘空白字元（包括 &nbsp; 空格 換行符）

        // 嘗試取得翻譯結果
        const translatedText = fetchTranslatedText(cleanedText);

        // 如果找到翻譯並且不與清理後的文字相同，則回傳替換後的結果
        if (translatedText && translatedText !== cleanedText) {
            return text.replace(trimmedText, translatedText); // 替換原字元，保留首尾空白部分
        }

        return false;
    }

    /**
     * fetchTranslatedText 函式：從特定頁面的詞庫中獲得翻譯文字內容。
     * @param {string} text - 需要翻譯的文字內容。
     * @returns {string|boolean} 翻譯後的文字內容，如果沒有找到對應的翻譯，那麼回傳 false。
     */
    function fetchTranslatedText(text) {

        // 靜態翻譯
        let translatedText = pageConfig.staticDict[text]; // 預設翻譯 公共部分

        if (typeof translatedText === 'string') return translatedText;

        // 正規表達式翻譯
        if (FeatureSet.enable_RegExp) {
            for (const [pattern, replacement] of pageConfig.regexpRules) {
                translatedText = text.replace(pattern, replacement);
                if (translatedText !== text) return translatedText;
            }
        }

        return false; // 沒有翻譯條目
    }

    /**
     * transDesc 函式：為指定的元素新增一個翻譯按鈕，並為該按鈕新增點擊事件。
     * @param {string} selector - CSS 選擇器，用於選擇需要新增翻譯按鈕的元素。
     */
    function transDesc(selector) {
        // 使用 CSS 選擇器選擇元素
        const element = document.querySelector(selector);

        // 如果元素不存在 或者 translate-me 元素已存在，那麼直接回傳
        if (!element || element.nextElementSibling?.id === 'translate-me') return;

        // 在元素後面插入一個翻譯按鈕
        const button = document.createElement('div');
        button.id = 'translate-me';
        button.style.cssText = 'color: #1b95e0; font-size: small; cursor: pointer;';
        button.textContent = '翻譯';
        element.after(button);

        // 為翻譯按鈕新增點擊事件
        button.addEventListener('click', async() => {
            if (button.disabled) return;
            button.disabled = true;
            try {
                const descText = element.textContent.trim();
                if (!descText) return;

                // 執行翻譯
                const translatedText = await requestRemoteTranslation(descText);

                // 安全創建結果元素
                const { name, url } = CONFIG.TRANS_ENGINES[CONFIG.transEngine];
                const resultContainer = document.createElement('div');
                resultContainer.innerHTML = `
                    <span style='font-size: small'>
                        翻譯 👇
                    </span>
                    <br/>
                `;
                // 安全插入文字內容
                const textNode = document.createTextNode(translatedText);
                resultContainer.appendChild(textNode);

                button.remove();
                element.after(resultContainer);
            } finally {
                button.disabled = false;
            }
        });
    }

    /**
     * getNestedProperty 函式：取得嵌套屬性的安全函式
     * @param {Object} obj - 需要查詢的對象
     * @param {string} path - 屬性路徑，例如 'biz[0].sectionResult[0].dst'
     * @returns {*} - 回傳嵌套屬性的值
     */
    function getNestedProperty(obj, path) {
        return path.split('.').reduce((acc, part) => {
            const match = part.match(/(\w+)(?:\[(\d+)\])?/);
            if (!match) return undefined;
            const key = match[1];
            const index = match[2];
            if (acc && acc[key] !== undefined) {
                return index !== undefined ? acc[key][index] : acc[key];
            }
            return undefined;
        }, obj);
    }

    /**
     * requestRemoteTranslation 函式：將指定的文字發送到設定的翻譯引擎進行翻譯。
     * @param {string} text - 需要翻譯的文字。
     */
    async function requestRemoteTranslation(text) {
        return new Promise((resolve) => {
            const { url_api, method, headers, getRequestData, responseIdentifier } = CONFIG.TRANS_ENGINES[CONFIG.transEngine];
            // 構建請求資料
            const requestData = getRequestData(text);

            // 使用 GM_xmlhttpRequest 函式發送 HTTP 請求
            GM_xmlhttpRequest({
                method: method,
                url: url_api, // 請求的 URL
                headers: headers,
                data: method === 'POST' ? JSON.stringify(requestData) : null,
                params: method === 'GET' ? requestData : null, // For GET requests
                onload: (res) => {
                    try {
                        const result = JSON.parse(res.responseText);
                        console.log(result);
                        const translatedText = getNestedProperty(result, responseIdentifier) || '翻譯失敗';
                        resolve(translatedText);
                    } catch (err) {
                        console.error('翻譯失敗：', err);
                        resolve(`翻譯失敗（${err.type}）`);
                    }
                },
                onerror: (err) => {
                    console.error('翻譯請求失敗：', err);
                    resolve(`翻譯失敗（${err.type}）`);
                }
            });
        });
    }

    /**
     * transBySelector 函式：透過 CSS 選擇器找到頁面上的元素，並將其文字內容替換為預定義的翻譯。
     */
    function transBySelector() {
        // 遍歷每個翻譯規則
        pageConfig.tranSelectors?.forEach(([selector, translatedText]) => {
            // 使用 CSS 選擇器找到對應的元素
            const element = document.querySelector(selector);
            // 如果找到了元素，那麼將其文字內容替換為翻譯後的文字
            if (element) {
                element.textContent = translatedText;
            }
        })
    }

    /**
     * registerMenuCommand 函式：註冊選單。
     */
    function registerMenuCommand() {
        const createMenuCommand = (config) => {
            const { label, key, callback } = config;
            let menuId;

            const getMenuLabel = (label, isEnabled) =>
                `${isEnabled ? "禁用" : "啟用"} ${label}`;

            const toggle = () => {
                const newFeatureState = !FeatureSet[key];
                GM_setValue(key, newFeatureState);
                FeatureSet[key] = newFeatureState;
                GM_notification(`${label}已${newFeatureState ? '啟用' : '禁用'}`);

                // 呼叫回調函式
                if (callback) callback(newFeatureState);

                // 更新選單指令的標籤
                GM_unregisterMenuCommand(menuId);
                menuId = GM_registerMenuCommand(
                    getMenuLabel(label, newFeatureState),
                    toggle
                );
            };

            // 初始註冊選單指令
            menuId = GM_registerMenuCommand(
                getMenuLabel(label, FeatureSet[key]),
                toggle
            );
        };

        const menuConfigs = [
            {
                label: "正規表達式功能",
                key: "enable_RegExp",
                callback: newFeatureState => {
                    if (newFeatureState) traverseNode(document.body);
                }
            },
            {
                label: "描述翻譯",
                key: "enable_transDesc",
                callback: newFeatureState => {
                    if (newFeatureState && CONFIG.DESC_SELECTORS[pageConfig.currentPageType]) {
                        transDesc(CONFIG.DESC_SELECTORS[pageConfig.currentPageType]);
                    } else {
                        document.getElementById('translate-me')?.remove();
                    }
                }
            }
        ];

        // 註冊所有選單項
        menuConfigs.forEach(config => createMenuCommand(config));
    };

    /**
     * init 函式：初始化翻譯功能。
     */
    function init() {
        // 設定中文環境
        document.documentElement.lang = CONFIG.LANG;

        // 監測 HTML Lang 值, 設定中文環境
        new MutationObserver(() => {
            if (document.documentElement.lang === "en") {
                document.documentElement.lang = CONFIG.LANG;
            }
        }).observe(document.documentElement, { attributeFilter: ['lang'] });

        // 監聽 Turbo 完成事件（延遲翻譯）
        document.addEventListener('turbo:load', () => {
            if (!pageConfig.currentPageType) return;

            transTitle(); // 翻譯頁面標題
            transBySelector();

            if (FeatureSet.enable_transDesc && CONFIG.DESC_SELECTORS[pageConfig.currentPageType]) {
                transDesc(CONFIG.DESC_SELECTORS[pageConfig.currentPageType]);
            }
        });

        // 初始化選單
        registerMenuCommand();

        // 監視頁面變化
        watchUpdate();

        // 首次頁面翻譯
        window.addEventListener('DOMContentLoaded', () => {
            // 取得目前頁面的翻譯規則
            updatePageConfig('首次載入');
            if (pageConfig.currentPageType) traverseNode(document.body);
        });
    }

})(window, document);
