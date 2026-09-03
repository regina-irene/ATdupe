import { q, ensureSchema } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public on purpose: this is the page the parents open. No sign-in, because
// they are not firm staff. The form's own access codes still gate the answers.
const NOT_FOUND = `<!doctype html><meta charset="utf-8"><title>Not available</title>
<body style="font:16px system-ui;padding:48px;max-width:560px;margin:auto;color:#111823">
<h1 style="font-size:20px">This form is not available</h1>
<p>The link may have expired, or it may have been typed incorrectly. Please contact
Edwards Family Law at <a href="mailto:regina@edwardsfamilylaw.com">regina@edwardsfamilylaw.com</a>.</p>`;

// Mirrors whatever the form submits to its own handler into Chambers as well,
// so nothing has to change inside the uploaded file.
const CAPTURE = (token: string) => `
<script>(function(){
  var TOKEN = ${JSON.stringify(token)};
  var D = "/api/questionnaires/draft";

  /* Drafts live on the server against this link, so a parent can start on one
     device and finish on another. The form's own browser saving is left alone
     as a fallback. */
  function pull(){
    return fetch(D + "?token=" + encodeURIComponent(TOKEN), { cache: "no-store" })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if(!j || !j.data) return false;
        if(typeof applyData === "function"){ applyData(j.data); return true; }
        return false;
      }).catch(function(){ return false; });
  }
  function push(){
    if(typeof collect !== "function") return;
    var data;
    try{ data = collect(); }catch(e){ return; }
    fetch(D, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, data: data }) }).catch(function(){});
  }

  function begin(){
    var form = document.getElementById("theForm");
    if(!form){ return setTimeout(begin, 400); }
    pull().then(function(had){
      if(had && typeof toast === "function") toast("Your saved answers have been restored.");
      var t = null;
      form.addEventListener("input", function(){ clearTimeout(t); t = setTimeout(push, 1200); });
      form.addEventListener("change", function(){ clearTimeout(t); t = setTimeout(push, 400); });
      window.addEventListener("beforeunload", push);
      setInterval(push, 30000);
    });
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", begin);
  else begin();

  /* Mirror the submission into Chambers as well as wherever the form sends it. */
  var real = window.fetch;
  window.fetch = function(input, init){
    try{
      if(init && init.method && init.method.toUpperCase() === "POST" && init.body){
        var url = typeof input === "string" ? input : (input && input.url) || "";
        if(url.indexOf("/api/questionnaires/") < 0){
          var copy = init.body;
          setTimeout(function(){
            try{
              var body = typeof copy === "string" ? JSON.parse(copy) : null;
              if(!body) return;
              body.token = TOKEN;
              real("/api/questionnaires/submit", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
              }).catch(function(){});
            }catch(e){}
          }, 0);
        }
      }
    }catch(e){}
    return real.apply(this, arguments);
  };
})();</script>`;

export async function GET(_req: Request, ctx: any) {
  const p = await ctx.params;
  try {
    await ensureSchema();
    const rows = await q(
      "select case_name, html, active from questionnaires where share_token = $1", [String(p.token || "")]);
    if (!rows.length || rows[0].active === false)
      return new Response(NOT_FOUND, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });

    const html = String(rows[0].html || "");
    const script = CAPTURE(String(p.token));
    const out = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, script + "</body>") : html + script;

    return new Response(out, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response(NOT_FOUND, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}
