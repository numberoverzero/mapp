/*
 u : "https://google.com" required (url)
 opts = {                 required (can be empty)
     m: "GET",                    // method       (defaults to GET)
     h: {"content-length": "3"},  // headers      (defaults to none)
     r: "json",                   // responseType (defaults to json)
     t: 5000,                     // timeout (ms) (defaults to unlimited)
     b: {userId: "foo"},          // body         (defaults to null)
 }

 x is reserved
 */
rq = (u, opts, x) => {
    x = new XMLHttpRequest;
    x.open(opts.m || "GET", u);
    x.responseType = opts.r || "";
    x.timeout = opts.t || 0;
    Object.keys(opts.h || 0).forEach(h => x.setRequestHeader(h, opts.h[h]));

    return new Promise((y,n) => {
        x.onreadystatechange = _=>{
            x.readyState==4 && [n,y][(!!x.response && (x.status/200|0)==1)|0](x);
        }; x.ontimeout = _=>n(x); x.send(opts.b || undefined);
    })
};
