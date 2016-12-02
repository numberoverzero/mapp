"use strict";

window.mapp = function () {
    const mapp = {
        container: null,
        pageCache: {}
    };

    mapp.setupRewrites = function(origin, root, partials) {
        /*
         *  arguments are almost always: (location.origin, "", "/_")
         *
         *  never refer to partials in urls.  Never refer to container pages from partials.
         *  for example, _/about.html should point to "index.html" not "../index.html".
         *
         *    https://my.site.com <-- location.origin
         *    ├── _               <-- partials are stored here in "_"
         *    │   ├── about.html
         *    │   ├── index.html
         *    │   └── login.html
         *    ├── about.html      <-- container pages, pre-loaded with corresponding partial
         *    ├── index.html
         *    └── login.html
         */

        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_parentheses
        const escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // strips out origin, root, partial directory, and leading slash
        const partialRegex = new RegExp(
                  "^(?:" + escapeRegExp(origin) + ")?" +
                  "(?:" + escapeRegExp(root) + ")?" +
                  "(?:" + escapeRegExp(partials) + ")?"+
                  "/?" + // always drop leading slash
                  "(.*)$" // this is what we care about
              ),
              partialOnly = url => url.replace(partialRegex, "$1"),
              partialFor = url => origin + root + partials + "/" + partialOnly(url),
              displayFor = url => origin + root + "/" + partialOnly(url);

        mapp.rewrite = function(url, mode) {
            switch(mode) {
                case "cache": return partialOnly(url);
                case "partial": return partialFor(url);
                case "display": return displayFor(url);
                default: return url;
            }
        };
        mapp.sameOrigin = url => url.indexOf(origin) === 0;
    };


    mapp.getPage = function(url) {
        const cacheKey = mapp.rewrite(url, "cache");
        // cache hit
        if (mapp.pageCache[cacheKey]) return mapp.pageCache[cacheKey];

        // cache miss - return promise that resolves when page is loaded.
        return mapp.pageCache[cacheKey] = new Promise((resolve, reject)=>{
            // on non-200 blow away the cache
            const page = {response: null, scriptLoadingPromise: null},
                  onError = () => {
                      delete mapp.pageCache[cacheKey];
                      reject();
                  };
            superagent.get(mapp.rewrite(url, "partial")).type("text/html")
                .then(response => {
                    if (response.ok) {
                        page.response = response;
                        resolve(page);
                    } else onError();
                })
                .catch(onError);
        });
    };


    function renderHtml(page) {
        mapp.container.innerHTML = page.response.text;
        return page;
    }

    function loadScripts(page) {
        // already loading/loaded scripts
        if (page.scriptLoadingPromise) return page.scriptLoadingPromise;

        return page.scriptLoadingPromise = new Promise(resolve=> {
            // using setTimeout gives the html a chance to render.
            // otherwise, eg. alert() would pop up over the previous page.
            setTimeout(() => {
                [].slice.call(
                    mapp.container.getElementsByTagName("script")
                ).forEach(script => window.eval(script.textContent));
                resolve(page);
            }, 0);
        });
    }


    mapp.go = function(url) {
        return mapp.getPage(url)
            .then(renderHtml)
            .then(loadScripts)
            .then(page=>{
                history.pushState(null, "", mapp.rewrite(url, "display"));
                return page;
            })
        ;
    };


    // Hook up event handlers to intercept navigation
    // ----------------------------------------------


    const which = e => {e = e || window.event; return e.which === null ? e.button: e.which};
    window.addEventListener("click", e => {
        if (which(e) !== 1) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (e.defaultPrevented) return;

        let el = e.target;
        while (el && "A" !== el.nodeName) el = el.parentNode;
        if (!el || "A" !== el.nodeName) return;
        if (el.hasAttribute('download') || el.getAttribute('rel') === 'external') return;
        if (el.target) return;
        if (!mapp.sameOrigin(el.href)) return;

        e.preventDefault();
        mapp.go(el.href);
    }, false);


    window.onpopstate = () => {
        mapp.getPage(document.location.pathname).then(renderHtml);
    };

    return mapp;
}();