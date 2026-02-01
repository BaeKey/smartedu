// ==UserScript==
// @name         国家中小学智慧教育平台电子课本下载 (全自动优化版)
// @description  自动匹配服务器，精准提取PDF，书名直接从元数据读取
// @namespace    https://github.com/BaeKey/smartedu
// @version      0.2.0
// @match        https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document*
// @icon         https://basic.smartedu.cn/favicon.ico
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 创建下载按钮
    function createDownloadButton() {
        if (document.getElementById('smartedu-download-btn')) return;
        const button = document.createElement('button');
        button.id = 'smartedu-download-btn';
        button.textContent = '下载文档';

        // 样式设置
        Object.assign(button.style, {
            position: 'fixed',
            top: '13vh',
            right: '0.2vw',
            padding: '1em 1.5em',
            fontSize: '1rem',
            backgroundColor: '#ff7d24',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            zIndex: '1000',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        });

        button.onclick = main;
        document.body.appendChild(button);
    }

    // 页面加载完成后创建按钮
    window.addEventListener('load', () => {
        setTimeout(createDownloadButton, 2000); // 延迟2秒确保页面基础结构加载
    });

    var main = async function() {
        const params = new URLSearchParams(document.location.search);
        const id = params.get("contentId");

        if (!id) {
            alert("未能识别课本ID，请确保在详情页使用。");
            return;
        }

        console.log("正在检索课本数据，ID:", id);

        let data = null;
        let successUrl = "";

        // 核心修改 1：尝试匹配 1-4 号服务器
        for (let i = 1; i <= 4; i++) {
            let jsonUrl = `https://s-file-${i}.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/${id}.json`;
            try {
                let response = await fetch(jsonUrl);
                if (response.ok) {
                    data = await response.json();
                    successUrl = jsonUrl;
                    console.log(`成功从服务器 s-file-${i} 获取配置`);
                    break;
                }
            } catch (e) {
                console.warn(`服务器 s-file-${i} 尝试失败`);
            }
        }

        if (data) {
            try {
                // 从 JSON 根节点获取准确的书名
                const bookTitle = data.title || "未命名课本";
                
                // 通过 ti_format 属性精准寻找 PDF 资源项
                const tiItems = data.ti_items || [];
                const pdfItem = tiItems.find(item => item.ti_format === 'pdf');

                if (pdfItem && pdfItem.ti_storages && pdfItem.ti_storages.length > 0) {
                    const downUrl = pdfItem.ti_storages[0];
                    console.log("获取到下载链接:", downUrl);
                    
                    // 获取认证头并开始下载
                    const authHeader = await authEncrypt(downUrl, 'GET');
                    downloadWithHeaders(downUrl, bookTitle, authHeader);
                } else {
                    alert("在该课本的元数据中未找到 PDF 格式文件。");
                }
            } catch (error) {
                console.error('解析过程出错：', error);
                alert("解析课本数据失败。");
            }
        } else {
            alert("无法获取下载配置文件，请检查网络或是否已登录。");
        }
    };

    // 下载处理
    function downloadWithHeaders(url, fileName, authHeader) {
        console.log("准备下载:", fileName);
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            headers: { "x-nd-auth": authHeader },
            responseType: "blob",
            onload: function(response) {
                if (response.status === 200) {
                    const blob = response.response;
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.download = fileName + ".pdf";
                    document.body.appendChild(link);
                    link.click();
                    // 清理
                    setTimeout(() => {
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(link.href);
                    }, 100);
                } else {
                    alert('下载请求失败，状态码: ' + response.status + "\n请确认是否已登录平台。");
                }
            },
            onerror: (err) => alert('下载出错: ' + err)
        });
    }

    // 加密认证逻辑
    async function authEncrypt(url, methodType) {
        const currentTimeMs = Date.now();
        const diff = Math.floor(Math.random() * 201) + 700;
        const nonce = `${currentTimeMs + diff}:${Math.random().toString(36).slice(-8).toUpperCase()}`;
        
        const urlObj = new URL(url);
        const relativePath = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");
        const authority = urlObj.host;
        const signatureString = `${nonce}\n${methodType}\n${relativePath}\n${authority}\n`;

        let authData = getAccessTokenAndMacKeyFromLocalStorage();
        if (!authData) return "";

        const { accessToken, macKey } = authData;
        const macBytes = new TextEncoder().encode(macKey);
        const signatureBytes = new TextEncoder().encode(signatureString);

        const key = await crypto.subtle.importKey(
            "raw", macBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const hmacBuffer = await crypto.subtle.sign("HMAC", key, signatureBytes);
        const base64Encoded = btoa(String.fromCharCode(...new Uint8Array(hmacBuffer)));

        return `MAC id="${accessToken}",nonce="${nonce}",mac="${base64Encoded}"`;
    }

    // 从本地存储提取 Token
    function getAccessTokenAndMacKeyFromLocalStorage() {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith("ND_UC_AUTH") && key.endsWith("token")) {
                try {
                    const valueJson = JSON.parse(localStorage.getItem(key));
                    const innerValue = JSON.parse(valueJson.value);
                    return { accessToken: innerValue.access_token, macKey: innerValue.mac_key };
                } catch (e) { continue; }
            }
        }
        console.error("未找到登录 Token，请先登录平台！");
        return null;
    }
})();
