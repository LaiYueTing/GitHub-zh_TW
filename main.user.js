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

    const lang = I18N.zh ? 'zh' : 'zh-TW'; // 設定預設語言
    let page;
    let enable_RegExp = GM_getValue("enable_RegExp", 1);

    /**
     * watchUpdate 函式：監視頁面變化，根據變化的節點進行翻譯
     */
    function watchUpdate() {
        // 檢測瀏覽器是否支援 MutationObserver
        const MutationObserver =
            window.MutationObserver ||
            window.WebKitMutationObserver ||
            window.MozMutationObserver;

        // 取得目前頁面的 URL
        const getCurrentURL = () => location.href;
        getCurrentURL.previousURL = getCurrentURL();

        // 創建 MutationObserver 實例，監聽 DOM 變化
        const observer = new MutationObserver((mutations, observer) => {
            const currentURL = getCurrentURL();

            // 如果頁面的 URL 發生變化
            if (currentURL !== getCurrentURL.previousURL) {
                getCurrentURL.previousURL = currentURL;
                page = getPage(); // 當頁面地址發生變化時，更新全域變數 page
                console.log(`連結變化 page= ${page}`);

                transTitle(); // 翻譯頁面標題

                if (page) {
                    setTimeout(() => {
                        // 使用 CSS 選擇器找到頁面上的元素，並將其文字內容替換為預定義的翻譯
                        transBySelector();
                        if (page === "repository") { //倉庫簡介翻譯
                            transDesc(".f4.my-3");
                        } else if (page === "gist") { // Gist 簡介翻譯
                            transDesc(".gist-content [itemprop='about']");
                        }
                    }, 500);
                }
            }

            if (page) {
                // 使用 filter 方法對 mutations 數組進行篩選，
                // 回傳 `節點增加、文字更新 或 屬性更改的 mutation` 組成的新數組 filteredMutations。
                const filteredMutations = mutations.filter(mutation => mutation.addedNodes.length > 0 || mutation.type === 'attributes' || mutation.type === 'characterData');

                // 處理每個變化
                filteredMutations.forEach(mutation => traverseNode(mutation.target));
            }
        });

        // 設定 MutationObserver
        const config = {
            characterData: true,
            subtree: true,
            childList: true,
            attributeFilter: ['value', 'placeholder', 'aria-label', 'data-confirm'], // 僅觀察特定屬性變化
        };

        // 開始觀察 document.body 的變化
        observer.observe(document.body, config);
    }

    /**
     * traverseNode 函式：遍歷指定的節點，並對節點進行翻譯。
     * @param {Node} node - 需要遍歷的節點。
     */
    function traverseNode(node) {
        // 跳過忽略
        if (I18N.conf.reIgnoreId.test(node.id) ||
            I18N.conf.reIgnoreClass.test(node.className) ||
            I18N.conf.reIgnoreTag.includes(node.tagName) ||
            (node.getAttribute && I18N.conf.reIgnoreItemprop.test(node.getAttribute("itemprop")))
        ) {
            return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) { // 元素節點處理

            // 翻譯時間元素
            if (
                ["RELATIVE-TIME", "TIME-AGO", "TIME", "LOCAL-TIME"].includes(node.tagName)
            ) {
                if (node.shadowRoot) {
                    transTimeElement(node.shadowRoot);
                    watchTimeElement(node.shadowRoot);
                } else {
                    transTimeElement(node);
                }
                return;
            }

            // 元素節點屬性翻譯
            if (["INPUT", "TEXTAREA"].includes(node.tagName)) { // 輸入框 按鈕 文字域
                if (["button", "submit", "reset"].includes(node.type)) {
                    if (node.hasAttribute('data-confirm')) { // 翻譯 瀏覽器 提示對話框
                        transElement(node, 'data-confirm', true);
                    }
                    transElement(node, 'value');
                } else {
                    transElement(node, 'placeholder');
                }
            } else if (node.tagName === 'BUTTON') {
                if (node.hasAttribute('aria-label') && /tooltipped/.test(node.className)) {
                    transElement(node, 'aria-label', true); // 翻譯 瀏覽器 提示對話框
                }
                if (node.hasAttribute('title')) {
                    transElement(node, 'title', true); // 翻譯 瀏覽器 提示對話框
                }
                if (node.hasAttribute('data-confirm')) {
                    transElement(node, 'data-confirm', true); // 翻譯 瀏覽器 提示對話框
                }
                if (node.hasAttribute('data-confirm-text')) {
                    transElement(node, 'data-confirm-text', true); // 翻譯 瀏覽器 提示對話框
                }
                if (node.hasAttribute('data-confirm-cancel-text')) {
                    transElement(node, 'data-confirm-cancel-text', true); // 取消按鈕 提醒
                }
                if (node.hasAttribute('cancel-confirm-text')) {
                    transElement(node, 'cancel-confirm-text', true); // 取消按鈕 提醒
                }
                if (node.hasAttribute('data-disable-with')) { // 按鈕等待提示
                    transElement(node, 'data-disable-with', true);
                }
            } else if (node.tagName === 'OPTGROUP') { // 翻譯 <optgroup> 的 label 屬性
                transElement(node, 'label');
            } else if (/tooltipped/.test(node.className)) { // 僅當 元素存在'tooltipped'樣式 aria-label 才起效果
                transElement(node, 'aria-label', true); // 帶提示的元素，類似 tooltip 效果的
            } else if (node.tagName === 'A') {
                if (node.hasAttribute('title')) {
                    transElement(node, 'title', true); // 翻譯 瀏覽器 提示對話框
                }
                if (node.hasAttribute('data-hovercard-type')) {
                    return; // 不翻譯
                }
            }

            let childNodes = node.childNodes;
            childNodes.forEach(traverseNode); // 遍歷子節點

        } else if (node.nodeType === Node.TEXT_NODE) { // 文字節點翻譯
            if (node.length <= 500) { // 修復 許可證編輯框初始化載入內容被翻譯
                transElement(node, 'data');
            }
        }
    }

    /**
     * getPage 函式：取得目前頁面的類型。
     * @returns {string|boolean} 目前頁面的類型，如果無法確定類型，那麼回傳 false。
     */
    function getPage() {

        // 站點，如 gist, developer, help 等，預設首頁是 github
        const siteMapping = {
            'gist.github.com': 'gist',
            'www.githubstatus.com': 'status',
            'skills.github.com': 'skills'
        };
        const site = siteMapping[location.hostname] || 'github'; // 站點
        const pathname = location.pathname; // 目前路徑

        // 是否登入
        const isLogin = document.body.classList.contains("logged-in");

        // 用於確定 個人首頁，組織首頁，倉庫頁 然後做判斷
        const analyticsLocation = (document.getElementsByName('analytics-location')[0] || {}).content || '';
        // 組織頁
        const isOrganization = /\/<org-login>/.test(analyticsLocation) || /^\/(?:orgs|organizations)/.test(pathname);
        // 倉庫頁
        const isRepository = /\/<user-name>\/<repo-name>/.test(analyticsLocation);

        // 優先匹配 body 的 class
        let page, t = document.body.className.match(I18N.conf.rePageClass);
        if (t) {
            if (t[1] === 'page-profile') {
                let matchResult = location.search.match(/tab=(\w+)/);
                if (matchResult) {
                    page = 'page-profile/' + matchResult[1];
                } else {
                    page = pathname.match(/\/(stars)/) ? 'page-profile/stars' : 'page-profile';
                }
            } else {
                page = t[1];
            }
        } else if (site === 'gist') { // Gist 站點
            page = 'gist';
        } else if (site === 'status') {  // GitHub Status 頁面
            page = 'status';
        } else if (site === 'skills') {  // GitHub Skills 頁面
            page = 'skills';
        } else if (pathname === '/' && site === 'github') { // github.com 首頁
            page = isLogin ? 'page-dashboard' : 'homepage';
        } else if (isRepository) { // 倉庫頁
            t = pathname.match(I18N.conf.rePagePathRepo);
            page = t ? 'repository/' + t[1] : 'repository';
        } else if (isOrganization) { // 組織頁
            t = pathname.match(I18N.conf.rePagePathOrg);
            page = t ? 'orgs/' + (t[1] || t.slice(-1)[0]) : 'orgs';
        } else {
            t = pathname.match(I18N.conf.rePagePath);
            page = t ? (t[1] || t.slice(-1)[0]) : false; // 取頁面 key
        }

        if (!page || !I18N[lang][page]) {
            console.log(`請注意對應 Page ${page} 詞庫節點不存在`);
            page = false;
        }
        return page;
    }

    /**
     * transTitle 函式：翻譯頁面標題
     */
    function transTitle() {
        let key = document.title; // 標題文字內容
        let str = I18N[lang]['title']['static'][key] || '';
        if (!str) {
            let res = I18N[lang]['title'].regexp || [];
            for (let [a, b] of res) {
                str = key.replace(a, b);
                if (str !== key) {
                    break;
                }
            }
        }
        document.title = str;
    }

    /**
     * transTimeElement 函式：翻譯時間元素文字內容。
     * @param {Element} el - 需要翻譯的元素。
     */
    function transTimeElement(el) {
        let key = el.childNodes.length > 0 ? el.lastChild.textContent : el.textContent;
        let res = I18N[lang]['public']['time-regexp']; // 時間正規表達式規則

        for (let [a, b] of res) {
            let str = key.replace(a, b);
            if (str !== key) {
                el.textContent = str;
                break;
            }
        }
    }

    /**
     * watchTimeElement 函式：監視時間元素變化, 觸發和呼叫時間元素翻譯
     * @param {Element} el - 需要監視的元素。
     */
    function watchTimeElement(el) {
        const MutationObserver =
            window.MutationObserver ||
            window.WebKitMutationObserver ||
            window.MozMutationObserver;

        new MutationObserver(mutations => {
            transTimeElement(mutations[0].addedNodes[0]);
        }).observe(el, {
            childList: true
        });
    }

    /**
     * transElement 函式：翻譯指定元素的文字內容或屬性。
     * @param {Element} el - 需要翻譯的元素。
     * @param {string} field - 需要翻譯的文字內容或屬性的名稱。
     * @param {boolean} isAttr - 是否需要翻譯屬性。
     */
    function transElement(el, field, isAttr = false) {
        let text = isAttr ? el.getAttribute(field) : el[field]; // 需要翻譯的文字
        let str = translateText(text); // 翻譯後的文字

        // 替換翻譯後的內容
        if (str) {
            if (!isAttr) {
                el[field] = str;
            } else {
                el.setAttribute(field, str);
            }
        }
    }

    /**
     * translateText 函式：翻譯文字內容。
     * @param {string} text - 需要翻譯的文字內容。
     * @returns {string|boolean} 翻譯後的文字內容，如果沒有找到對應的翻譯，那麼回傳 false。
     */
    function translateText(text) { // 翻譯

        // 內容為空, 空白字元和或數字, 不存在英文字母和符號,. 跳過
        if (!isNaN(text) || !/[a-zA-Z,.]+/.test(text)) {
            return false;
        }

        let _key = text.trim(); // 去除首尾空格的 key
        let _key_neat = _key.replace(/\xa0|[\s]+/g, ' ') // 去除多餘空白字元 (&nbsp; 空格 換行符)

        let str = fetchTranslatedText(_key_neat); // 翻譯已知頁面 (局部優先)

        if (str && str !== _key_neat) { // 已知頁面翻譯完成
            return text.replace(_key, str); // 替換原字元，保留首尾空白部分
        }

        return false;
    }

    /**
     * fetchTranslatedText 函式：從特定頁面的詞庫中獲得翻譯文字內容。
     * @param {string} key - 需要翻譯的文字內容。
     * @returns {string|boolean} 翻譯後的文字內容，如果沒有找到對應的翻譯，那麼回傳 false。
     */
    function fetchTranslatedText(key) {

        // 靜態翻譯
        let str = I18N[lang][page]['static'][key] || I18N[lang]['public']['static'][key]; // 預設翻譯 公共部分

        if (typeof str === 'string') {
            return str;
        }

        // 正規表達式翻譯
        if (enable_RegExp) {
            let res = (I18N[lang][page].regexp || []).concat(I18N[lang]['public'].regexp || []); // 正規表達式數組

            for (let [a, b] of res) {
                str = key.replace(a, b);
                if (str !== key) {
                    return str;
                }
            }
        }

        return false; // 沒有翻譯條目
    }

    /**
     * transDesc 函式：為指定的元素新增一個翻譯按鈕，並為該按鈕新增點擊事件。
     * @param {string} el - CSS選擇器，用於選擇需要新增翻譯按鈕的元素。
     */
    function transDesc(el) {
        // 使用 CSS 選擇器選擇元素
        let element = document.querySelector(el);

        // 如果元素不存在 或者 translate-me 元素已存在，那麼直接回傳
        if (!element || document.getElementById('translate-me')) {
            return false;
        }

        // 在元素後面插入一個翻譯按鈕
        const buttonHTML = `<div id='translate-me' style='color: rgb(27, 149, 224); font-size: small; cursor: pointer'>翻譯</div>`;
        element.insertAdjacentHTML('afterend', buttonHTML);
        let button = element.nextSibling;

        // 為翻譯按鈕新增點擊事件
        button.addEventListener('click', () => {
            // 取得元素的文字內容
            const desc = element.textContent.trim();

            // 如果文字內容為空，那麼直接回傳
            if (!desc) {
                return false;
            }

            // 呼叫 translateDescText 函式進行翻譯
            translateDescText(desc, text => {
                // 翻譯完成後，隱藏翻譯按鈕，並在元素後面插入翻譯結果
                button.style.display = "none";
                const translationHTML = `<span style='font-size: small'>翻譯👇</span><br/>${text}`;
                element.insertAdjacentHTML('afterend', translationHTML);
            });
        });
    }

    /**
     * translateDescText 函式：將指定的文字發送到訊飛的翻譯服務進行翻譯。
     * @param {string} text - 需要翻譯的文字。
     * @param {function} callback - 翻譯完成後的回調函式，該函式接受一個參數，即翻譯後的文字。
     */
    function translateDescText(text, callback) {
        // 使用 GM_xmlhttpRequest 函式發送 HTTP 請求
        GM_xmlhttpRequest({
            method: "POST", // 請求方法為 POST
            url: "https://www.iflyrec.com/TranslationService/v1/textTranslation", // 請求的 URL
            headers: { // 請求標頭
                'Content-Type': 'application/json',
                'Origin': 'https://www.iflyrec.com',
            },
            data: JSON.stringify({
                "from": "2",
                "to": "1",
                "contents": [{
                    "text": text,
                    "frontBlankLine": 0
                }]
            }), // 請求的資料
            responseType: "json", // 響應的資料類型為 JSON
            onload: (res) => {
                try {
                    const { status, response } = res;
                    const translatedText = (status === 200) ? response.biz[0].translateResult : "翻譯失敗";
                    callback(translatedText);
                } catch (error) {
                    console.error('翻譯失敗', error);
                    callback("翻譯失敗");
                }
            },
            onerror: (error) => {
                console.error('網路請求失敗', error);
                callback("網路請求失敗");
            }
        });
    }

    /**
     * transBySelector 函式：透過 CSS 選擇器找到頁面上的元素，並將其文字內容替換為預定義的翻譯。
     */
    function transBySelector() {
        // 取得目前頁面的翻譯規則，如果沒有找到，那麼使用公共的翻譯規則
        let res = (I18N[lang][page]?.selector || []).concat(I18N[lang]['public'].selector || []); // 數組

        // 如果找到了翻譯規則
        if (res.length > 0) {
            // 遍歷每個翻譯規則
            for (let [selector, translation] of res) {
                // 使用 CSS 選擇器找到對應的元素
                let element = document.querySelector(selector)
                // 如果找到了元素，那麼將其文字內容替換為翻譯後的文字
                if (element) {
                    element.textContent = translation;
                }
            }
        }
    }

    function registerMenuCommand() {
        const toggleRegExp = () => {
            enable_RegExp = !enable_RegExp;
            GM_setValue("enable_RegExp", enable_RegExp);
            GM_notification(`已${enable_RegExp ? '開啟' : '關閉'}正規表達式功能`);
            if (enable_RegExp) {
                location.reload();
            }
            GM_unregisterMenuCommand(id);
            id = GM_registerMenuCommand(`${enable_RegExp ? '關閉' : '開啟'}正規表達式功能`, toggleRegExp);
        };

        let id = GM_registerMenuCommand(`${enable_RegExp ? '關閉' : '開啟'}正規表達式功能`, toggleRegExp);
    }

    /**
     * init 函式：初始化翻譯功能。
     */
    function init() {
        // 取得目前頁面的翻譯規則
        page = getPage();
        console.log(`開始 Page = ${page}`);

        // 翻譯頁面標題
        transTitle();

        if (page) {
            // 立即翻譯頁面
            traverseNode(document.body);

            setTimeout(() => {
                // 使用 CSS 選擇器找到頁面上的元素，並將其文字內容替換為預定義的翻譯
                transBySelector();
                if (page === "repository") { //倉庫簡介翻譯
                    transDesc(".f4.my-3");
                } else if (page === "gist") { // Gist 簡介翻譯
                    transDesc(".gist-content [itemprop='about']");
                }
            }, 100);
        }
        // 監視頁面變化
        watchUpdate();
    }

    // 執行初始化
    registerMenuCommand();
    init();

})(window, document);
