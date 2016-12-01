"use strict";

window.mapp = function () {
    var mapp = {
        container: null,
        cache: {}
    };

    function which(e) {
        e = e || window.event;
        return null === e.which ? e.button : e.which;
    }

    function sameOrigin(href) {
        var origin = location.protocol + '//' + location.hostname;
        if (location.port) origin += ':' + location.port;
        return (href && (0 === href.indexOf(origin)));
    }

    function onclick(e) {
        if (which(e) !== 1) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (e.defaultPrevented) return;

        var el = e.target;
        while (el && "A" !== el.nodeName) el = el.parentNode;
        if (!el || "A" !== el.nodeName) return;
        if (el.hasAttribute('download') || el.getAttribute('rel') === 'external') return;
        if (el.target) return;
        if (!sameOrigin(el.href)) return;

        e.preventDefault();
        mapp.go(el.pathname + el.search + (el.hash || ""));
    }

    function onpopstate(e) {
        console.log("popstate!");
        console.log(e);
        console.log(e.target);
        console.log(e.state);
    }

    function go(url, cacheErrors) {
        cacheErrors = typeof cacheErrors === "undefined" ? false : cacheErrors;
        var onError = cacheErrors ? ()=>{} : ()=>{delete mapp.cache[url];};

        var page = mapp.cache[url];
        if (!page) {
            // cache miss - get partial, swap html, load scripts.
            page = mapp.cache[url] = {
                promise: window.superagent.get(url).type("text/html"),
                rendered: false,
            };
            page.promise = page.promise
            .then(response=> {
                if (response.ok) {
                    mapp.container.innerHTML = response.text;
                    // using setTimeout gives the html a change to render.
                    // otherwise, eg. alert() would pop up over the previous page.
                    setTimeout(() => {
                        [].slice.call(
                            mapp.container.getElementsByTagName("script")
                        ).forEach(script => eval(script.textContent));
                        history.pushState(null, "", url);
                        page.rendered = true;
                    }, 0);
                } else {
                    onError();
                }
                return response;
            });
            page.promise.catch(onError);
        } else {
            // cache hit - one of two cases:
            //   1. go() before the first request finished.  Still pending, don't re-render html.
            //   2. go() after the first request finished.  Request complete, re-render html.
            page.promise
            .then(response=> {
                if (page.rendered) {
                    mapp.container.innerHTML = response.text;
                    history.pushState(null, "", url);
                } else {
                    // intentionally empty - initial .then() is still waiting.
                    // when the response comes it will render html, don't do anything.
                }
            });
        }
    }
    mapp.go = go;

    window.addEventListener("click", onclick, false);
    window.addEventListener("popstate", onpopstate, false);

    return mapp;
}();