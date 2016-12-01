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

    function go(url) {
        var promise = mapp.cache[url];
        if (!promise) {
            promise = mapp.cache[url] = window.superagent
                .get(url).type("text/html")
                .then(response=> {
                    if (response.ok) {
                        history.pushState(null, "", url);
                        mapp.container.innerHTML = response.text;
                        // using setTimeout gives the html a change to render.
                        // otherwise, eg. alert() would pop up over the previous page.
                        setTimeout(()=>{
                            [].slice.call(
                                mapp.container.getElementsByTagName("script")
                            ).forEach(script=>eval(script.textContent));
                        }, 0);
                    } else {
                        delete mapp.cache[url];
                    }
                });
        }
        promise
        .catch(()=>{delete mapp.cache[url];})
    }
    mapp.go = go;

    window.addEventListener("click", onclick, false);
    window.addEventListener("popstate", onpopstate, false);

    return mapp;
}();