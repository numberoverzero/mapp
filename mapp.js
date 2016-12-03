"use strict";

window.mapp = function () {
    const mapp = {
        container: null,
        pageCache: {},
        dynamicRoutes: null
    };

    // hold a reference to the promise's resolve cb to manually complete
    let onReady;
    mapp.ready = new Promise(resolve=>{
        // Insulate external function from any intermediate return values
        onReady = ()=> resolve()
    });

    mapp.setupRewrites = function(origin, root) {
        /*
         *  arguments are almost always: (location.origin, "")
         *  routes can include a map of regex -> fixed url, such as:
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
        origin = (typeof origin === "undefined") ? location.origin : origin;
        root = (typeof root === "undefined") ? "" : root;
        const partials = "/_",
              dynamicRoutesUrl = "_dynamicRoutes.json";

        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_parentheses
        const escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // strips out origin, root, partial directory, and leading slash
        const partialRegex = new RegExp(
              "^(?:" + escapeRegExp(origin) + ")?" +
              "(?:" + escapeRegExp(root) + ")?" +
              "(?:" + escapeRegExp(partials) + ")?"+
              "/?" + // always drop leading slash
              "(.*)$" // this is what we care about
          );

        const dynamicRouteFor = function (url) {
            if (!mapp.dynamicRoutes) return null;
            // most uses are matching the current url anyway
            url = ("" + (url || document.location)).replace(partialRegex, "$1");
            const len = mapp.dynamicRoutes.length;
            for (let route, index = 0; index < len; index++) {
                route = mapp.dynamicRoutes[index];
                if (url.match(route.pattern)) return route;
            }
            return null;
        };

        const partialOf = function (url, dynamic) {
            url = url.replace(partialRegex, "$1");
            if (!dynamic || !mapp.dynamicRoutes) return url;
            const route = dynamicRouteFor(url);
            return route? route.to : url;
        };

        mapp.rewrite = {
            cache: url=>partialOf(url, true),
            // http://jsben.ch/#/1o8xK faster than [x, y, z].join("")
            partialUrl: url=>origin + root + partials + "/" + partialOf(url, true),
            displayUrl: url=>origin + root + "/" + partialOf(url, false)
        };
        mapp.sameOrigin = url => url.indexOf(origin) === 0;

        mapp.match = url => {
            url = url || ("" + document.location);
            const route = dynamicRouteFor(url);
            return route ? url.replace(partialRegex, "$1").match(route.pattern) : null;
        };


        // Load dynamic rewrites from localStorage, fall back to url
        // ---------------------------------------------------------

        function compileRoutes(routes) {
            mapp.dynamicRoutes = [];
            Object.keys(routes).forEach(pattern => {
                mapp.dynamicRoutes.push({
                    pattern: new RegExp(pattern),
                    to: routes[pattern]
                });
            });
        }

        const serializedLocalRoutes = localStorage.getItem("mapp.dynamicRoutes");
        if (serializedLocalRoutes) {
            compileRoutes(JSON.parse(serializedLocalRoutes));
            onReady();
        // }
        // mapp.dynamicRoutes = localStorage.getItem("mapp.dynamicRoutes");
        // if (mapp.dynamicRoutes) {
        //     onReady();
        } else {
            superagent.get(mapp.rewrite.displayUrl(dynamicRoutesUrl)).accept("json")
            .then(response => {
                if (!response.ok) return;
                const routes = response.body;
                localStorage.setItem("mapp.dynamicRoutes", JSON.stringify(routes));
                compileRoutes(routes);
            })
            .then(onReady)
            .catch(onReady);  // call failed, tried enough to be "ready"
        }
    };


    mapp.getPage = function(url) {
        url = "" + url;
        const cacheKey = mapp.rewrite.cache(url);

        // cache hit
        if (mapp.pageCache[cacheKey]) return mapp.pageCache[cacheKey];

        // cache miss - return promise that resolves when page is loaded.
        return mapp.pageCache[cacheKey] = new Promise((resolve, reject)=>{
            const page = {response: null, scriptLoadingPromise: null},
                  onError = () => {delete mapp.pageCache[cacheKey]; reject();};
            superagent.get(mapp.rewrite.partialUrl(url)).type("text/html")
            .then(response => {
                if (response.ok) {
                    page.response = response;
                    resolve(page);
                } else onError();})
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
            .then(page=>{
                history.pushState(null, "", mapp.rewrite.displayUrl(url));
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
        if (!mapp.sameOrigin(el.href)) return;

        e.preventDefault();
        mapp.go(el.href);
    }, false);


    window.onpopstate = () => {
        mapp.getPage(document.location.pathname).then(renderHtml);
    };

    return mapp;
}();