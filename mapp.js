"use strict";
/*
 *  routes in _dynamicRoutes.json can include a map of regex -> fixed url, such as:
 *    {
 *        "^users\/[^\/]+\/?$": "users/0.html",
 *        "^users\/[^\/]+\/game\/[^\/]+\/?$": "users/0/game/1.html"
 *    }
 *
 *  this would tell mapp to load partials for any url matching /users/[^/]+/? from /users/0.html
 *
 *
 *  never refer to partials in urls.  Never refer to container pages from partials.
 *  for example, _/about.html should point to "index.html" not "../index.html".
 *
 *    https://my.site.com     <-- location.origin
 *    ├── _                   <-- partials are stored here in "_"
 *    │   ├── about.html
 *    │   ├── index.html
 *    │   └── login.html
 *    ├── _dynamicRoutes.json <-- Declares any regex-based routes
 *    ├── about.html       }
 *    ├── index.html        } <-- container pages, pre-loaded with corresponding partial
 *    └── login.html       }
 */
(() => {
    let
        // loaded from localStorage or /_dynamicRoutes.json
        dynamicRoutes,

        // hold references to the promise's callbacks to manually complete
        onReady, onNotReady,
        ready = new Promise((resolve, reject)=> {onReady=resolve; onNotReady=reject})
    ;
    const
        container = document.getElementById("mapp-container"),
        origin = location.origin,
        partials = "_",

        // strip out origin, partials, and leading slashes
        partialRegex = new RegExp(
            "/?" + "^(?:" + origin + ")?" +
            "/?" + "(?:" + partials + "/)?"+
            "/?" + "(.*)$" // this is what we care about
        ),

        // coerce eg. document.location to string
        U = url => "" + (url || ""),

        // only rewrite local urls
        sameOrigin = url => U(url).indexOf(origin) === 0
    ;


    // =========
    //  Routing
    // =========
    function dynamicRouteFor (url) {
        // always call with U(url)
        if (!dynamicRoutes) return null;
        url = url.replace(partialRegex, "$1");
        for (let route, match, index = 0; index < dynamicRoutes.length; index++) {
            route = dynamicRoutes[index];
            if (match = url.match(route.pattern))
                return {pattern: route.pattern, to: route.to, match: match};
        }
        return null;
    }

    function urlFragment (url, dynamic) {
        url = U(url).replace(partialRegex, "$1");
        if (!dynamic) return url;
        const route = dynamicRouteFor(url);
        return route? route.to : url;
    }

    const
        cacheKey = url=>urlFragment(url, true),
        urlOfPartial = url=>origin + "/" + partials + "/" + urlFragment(url, true),
        urlForDisplay = url=>origin + "/" + urlFragment(url, false);


    // on init load dynamicRoutes, prefetch
    // ------------------------------------
    rq(urlForDisplay("_dynamicRoutes.json"), {r:"json"})
    .then(xhr => {
        dynamicRoutes = Object.keys(xhr.response).map(
            pattern => ({pattern: new RegExp(pattern), to: xhr.response[pattern]})
        );
        onReady();
    }).catch(()=>onNotReady());

    rq(urlForDisplay("_prefetchManifest.json"), {r:"json"})
    .then(xhr => xhr.response.forEach(getPage));


    // ===========
    //  Rendering
    // ===========
    function renderHtml(page) {
        container.innerHTML = page.response;
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
                    container.getElementsByTagName("script")
                ).forEach(script => window.eval(script.textContent));
                resolve(page);
            }, 0);
        });
    }


    // ============
    //  Public API
    // ============
    const pageCache = {};
    function getPage(url) {
        const key = cacheKey(url);

        // cache hit
        if (pageCache[key]) return pageCache[key];

        return pageCache[key] = new Promise((resolve, reject) => {
            rq(urlOfPartial(url), {})
            .then(xhr => resolve({response: xhr.response}))
            .catch(()=>pageCache[key]=[]._ && reject())
        });
    }

    function go(url) {
        return getPage(url)
        .then(page=>{history.pushState(null, "", urlForDisplay(url)); return page})
        .then(renderHtml)
        .then(loadScripts)
    }

    // on init hook up event handlers
    // ------------------------------
    const which = e => {e = e || window.event; return e.which === null ? e.button: e.which};
    window.addEventListener("click", e => {
        // skip middle/right click, click with modifiers
        if (which(e) !== 1) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (e.defaultPrevented) return;

        // skip click handlers that aren't links,
        // links explicitly tagged as downloads or external,
        // and links to different origins
        let el = e.target;
        while (el && "A" !== el.nodeName) el = el.parentNode;
        if (!el || "A" !== el.nodeName) return;
        if (el.hasAttribute('download') || el.getAttribute('rel') === 'external') return;
        if (el.target) return;
        if (!sameOrigin(el.href)) return;

        // finally meet all the criteria to perform the rewrite
        e.preventDefault(); go(el.href);
    }, false);

    window.onpopstate = () => {
        getPage(document.location.pathname).then(renderHtml);
    };


    // expose public api
    // -----------------
    window.mapp = {
        getPage: getPage,
        go: go,
        ready: ready,
    };
})();
