"use strict";

window.mapp = function () {
    const mapp = {
        container: null,
        pageCache: {}
    };

    function getPage(url) {
        // cache hit
        if (mapp.pageCache[url]) return mapp.pageCache[url];

        // cache miss - return promise that resolves when page is loaded.
        return mapp.pageCache[url] = new Promise((resolve, reject)=>{
            // on non-200 blow away the cache
            const onError = () => {
                delete mapp.pageCache[url];
                reject();
            };
            const page = {
                response: null,
                scriptLoadingPromise: null
            };
            window.superagent.get(url).type("text/html")
            .then(response => {
                if (response.ok) {
                    page.response = response;
                    resolve(page);
                } else onError();
            })
            .catch(onError);
        });
    }

    function renderHtml(page) {
        mapp.container.innerHTML = page.response.text;
        return page;
    }

    function loadScripts(page) {
        // already loading/loaded scripts
        if (page.scriptLoadingPromise) {return page.scriptLoadingPromise}

        return page.scriptLoadingPromise = new Promise(resolve=> {
            // using setTimeout gives the html a chance to render.
            // otherwise, eg. alert() would pop up over the previous page.
            setTimeout(() => {
                [].slice.call(
                    mapp.container.getElementsByTagName("script")
                ).forEach(script => eval(script.textContent));
                resolve(page);
            }, 0);
        });
    }

    function which(e) {
        e = e || window.event;
        return null === e.which ? e.button : e.which;
    }

    function sameOrigin(href) {
        let origin = location.protocol + '//' + location.hostname;
        if (location.port) origin += ':' + location.port;
        return (href && (0 === href.indexOf(origin)));
    }

    function onclick(e) {
        if (which(e) !== 1) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (e.defaultPrevented) return;

        let el = e.target;
        while (el && "A" !== el.nodeName) el = el.parentNode;
        if (!el || "A" !== el.nodeName) return;
        if (el.hasAttribute('download') || el.getAttribute('rel') === 'external') return;
        if (el.target) return;
        if (!sameOrigin(el.href)) return;

        e.preventDefault();
        mapp.go(el.pathname + el.search + (el.hash || ""));
    }

    function onpopstate() {
        getPage(document.location.pathname)
        .then(renderHtml)
        .catch(console.warn);
    }

    function go(url) {
        getPage(url)
        .then(renderHtml)
        .then(loadScripts)
        .then(()=>history.pushState(null, "", url))
        .catch(console.warn);
    }
    mapp.go = go;

    window.addEventListener("click", onclick, false);
    window.onpopstate = onpopstate;

    return mapp;
}();