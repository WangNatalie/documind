chrome.webNavigation.onCompleted.addListener((details) => {
    const url = details.url;
    if (url.endsWith(".pdf")) {
        chrome.tabs.update(details.tabId, {
            url: chrome.runtime.getURL("viewer.html") + "?file=" + encodeURIComponent(url)
        });
    }
}, {url: [{schemes: ["http","https"]}]});
