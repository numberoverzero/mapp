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

(function (exports) {
    const _mapp = {};
    const pageCache = {};
    const rewrites = {};
    let dynamicRoutes;
    let sameOrigin;

    // set by the caller
    _mapp.container = null;

    // hold a reference to the promise's resolve cb to manually complete
    let onReady;
    _mapp.ready = new Promise(resolve=> onReady=resolve);


    const origin = location.origin,
          root = "",
          partials = "/_",
          dynamicRoutesUrl = "_dynamicRoutes.json";

    // strips out origin, root, partials directory, and leading slash
    const partialRegex = new RegExp(
          "^(?:" + origin + ")?" +
          "(?:" + root + ")?" +
          "(?:" + partials + ")?"+
          "/?" + // always drop leading slash
          "(.*)$" // this is what we care about
      );

    // helper to ensure url is a string
    const U = url => "" + (url || "");

    const dynamicRouteFor = function (url) {
        if (!dynamicRoutes) return null;
        url = U(url).replace(partialRegex, "$1");
        const len = dynamicRoutes.length;
        for (let route, match, index = 0; index < len; index++) {
            route = dynamicRoutes[index];
            if (match = url.match(route.pattern))
                return {pattern: route.pattern, to: route.to, match: match};
        }
        return null;
    };

    const partialOf = function (url, dynamic) {
        url = U(url).replace(partialRegex, "$1");
        if (!dynamic || !dynamicRoutes) return url;
        const route = dynamicRouteFor(url);
        return route? route.to : url;
    };

    rewrites.cache = url=>partialOf(url, true);
    // http://jsben.ch/#/1o8xK faster than [x, y, z].join("")
    rewrites.partialUrl = url=>origin + root + partials + "/" + partialOf(url, true);
    rewrites.displayUrl = url=>origin + root + "/" + partialOf(url, false);

    sameOrigin = url => U(url).indexOf(origin) === 0;

    _mapp.match = url => {
        // most uses are matching the current url anyway
        url = url || document.location;
        const route = dynamicRouteFor(url);
        return route ? route.match : null;
    };


    // Load dynamic rewrites from localStorage, fall back to url
    // ---------------------------------------------------------

    function compileRoutes(routes) {
        dynamicRoutes = [];
        Object.keys(routes).forEach(pattern => {
            dynamicRoutes.push({
                pattern: new RegExp(pattern),
                to: routes[pattern]
            });
        });
    }

    const serializedLocalRoutes = localStorage.getItem("_dynamicRoutes");
    if (serializedLocalRoutes) {
        compileRoutes(JSON.parse(serializedLocalRoutes));
        onReady();
    } else {
        rq(rewrites.displayUrl(dynamicRoutesUrl), {r:"json"})
        .then(xhr => {
            if (xhr.status != 200) return;
            const routes = xhr.response;
            localStorage.setItem("_dynamicRoutes", JSON.stringify(routes));
            compileRoutes(routes);
        })
        .then(onReady)
        .catch(onReady);  // call failed, tried enough to be "ready"
    }


    _mapp.getPage = function(url) {
        const cacheKey = rewrites.cache(url);

        // cache hit
        if (pageCache[cacheKey]) return pageCache[cacheKey];

        // cache miss - return promise that resolves when page is loaded.
        return pageCache[cacheKey] = new Promise((resolve, reject)=>{
            const page = {response: null, scriptLoadingPromise: null},
                  onError = () => {delete pageCache[cacheKey]; reject();};
            rq(rewrites.partialUrl(url), {})
            .then(xhr => {
                if (xhr.status == 200) {
                    page.xhr = xhr;
                    resolve(page);
                } else onError();})
            .catch(onError);
        });
    };


    function renderHtml(page) {
        _mapp.container.innerHTML = page.xhr.response;
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
                    _mapp.container.getElementsByTagName("script")
                ).forEach(script => window.eval(script.textContent));
                resolve(page);
            }, 0);
        });
    }


    _mapp.go = function(url) {
        return _mapp.getPage(url)
            .then(page=>{
                history.pushState(null, "", rewrites.displayUrl(url));
                return page;})
            .then(renderHtml)
            .then(loadScripts)
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
        if (!sameOrigin(el.href)) return;

        e.preventDefault();
        _mapp.go(el.href);
    }, false);


    window.onpopstate = () => {
        _mapp.getPage(document.location.pathname).then(renderHtml);
    };
    exports.mapp = _mapp;
}(window));
