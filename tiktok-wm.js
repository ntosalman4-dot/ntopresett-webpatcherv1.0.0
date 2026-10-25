(() => {
  "use strict";
  if (window.__wanxzyyCaptionInjectorLoaded) return;
  window.__wanxzyyCaptionInjectorLoaded = true;

  const inject = () => {
    if (document.getElementById("__wanxzyy_caption_hook")) return;
    const script = document.createElement("script");
    script.id = "__wanxzyy_caption_hook";
    script.src = (globalThis.browser ?? globalThis.chrome).runtime.getURL("page-hook.js");
    script.async = false;
    script.onload = () => script.remove();
    (document.documentElement || document.head).prepend(script);
  };

  if (document.documentElement) inject();
  else document.addEventListener("DOMContentLoaded", inject, { once: true });
})();
