(() => {
  "use strict";

  // Wanxzyy publish hook — modeled on Rein's request-layer behavior:
  // 1) only touch TikTok publish/create payloads;
  // 2) preserve structured caption markup + existing mentions;
  // 3) never rewrite Music/Sound/Audio branches;
  // 4) never rewrite URL/blob/data/path-like media values (cover included);
  // 5) patch fetch, XHR and JSON.stringify so the same logic is used no
  //    matter which transport TikTok's current web app chooses.
  if (window.__wanxzyyReinParityHooked) return;
  window.__wanxzyyReinParityHooked = true;

  const WM_TEXT = "✦ Upload Method ✦ → @nto.presett";
  const HANDLE = "@nto.presett";
  const USERNAME = "nto.presett";
  // Fallback only. On TikTok Web we resolve the live account metadata below
  // so the mention points to the actual @nto.presett account instead of relying
  // on a stale/incorrect numeric UID.
  const ACCOUNT = {
    userId: "7368487956681704454",
    secUid: "",
    uniqueId: USERNAME
  };

  async function resolveWanxAccount() {
    try {
      const endpoints = [
        `/api/upload/search/user/?aid=1988&keyword=${encodeURIComponent(USERNAME)}`,
        `/api/search/user/full/?aid=1988&keyword=${encodeURIComponent(USERNAME)}`
      ];

      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            credentials: "include",
            headers: { "Accept": "application/json" }
          });
          if (!res.ok) continue;
          const data = await res.json();

          let found = null;
          const seen = new WeakSet();
          const visit = node => {
            if (found || !node || typeof node !== "object") return;
            if (seen.has(node)) return;
            seen.add(node);
            if (Array.isArray(node)) {
              for (const item of node) visit(item);
              return;
            }

            const candidate = node.user_info || node.user || node;
            const unique = String(
              candidate?.unique_id ?? candidate?.uniqueId ?? candidate?.username ?? ""
            ).replace(/^@/, "").toLowerCase();
            const uid = candidate?.user_id ?? candidate?.userId ?? candidate?.uid ?? candidate?.id;
            if (unique === USERNAME && uid != null && String(uid)) {
              found = candidate;
              return;
            }
            for (const value of Object.values(node)) visit(value);
          };
          visit(data);

          if (found) {
            const uid = found.user_id ?? found.userId ?? found.uid ?? found.id;
            const secUid = found.sec_uid ?? found.secUid ?? found.sec_user_id ?? "";
            const uniqueId = found.unique_id ?? found.uniqueId ?? USERNAME;
            if (uid != null && String(uid)) ACCOUNT.userId = String(uid);
            if (secUid) ACCOUNT.secUid = String(secUid);
            ACCOUNT.uniqueId = String(uniqueId).replace(/^@/, "") || USERNAME;
            return true;
          }
        } catch (_) {}
      }
    } catch (_) {}
    return false;
  }

  // Resolve immediately and keep the normal synchronous publish hook intact.
  // Later JSON.stringify/fetch/XHR passes automatically use the resolved data.
  resolveWanxAccount();

  const POST_PATH = /(?:\/project\/post|\/publish\/|\/aweme\/v1\/create|\/item\/create)/i;
  const EXACT_PROJECT_POST = "tiktok/web/project/post/v1/";
  const BLOCKED = /(?:\/music\/|\/sound\/|[?&]music_id=)/i;

  const CAPTION_KEYS = new Set([
    "text", "caption", "captiontext", "captiontextdraft",
    "captiondraft", "itemdescription", "itemdesc",
    "videodescription", "video_description",
    "posttext", "posttitle", "description", "desc",
    "markup_text", "markuptext", "video_desc", "videodesc",
    "videotitle", "video_title"
  ]);

  // Same protection principle as Rein: these branches are metadata/media,
  // not caption text. In particular, do not walk inside music/sound/audio.
  const MEDIA_KEY = /(?:music|audio|sound)/i;

  // Rein also avoids changing URL/path/blob/data values. This is what keeps
  // cover URLs and other selected media references intact.
  const URL_LIKE = /^(?:https?:\/\/|\/|blob:|data:|urn:|[a-z]:\\)/i;
  const nativeStringify = JSON.stringify;

  function isPostRequest(url) {
    if (typeof url !== "string" || !/tiktok/i.test(url)) return false;
    if (url.includes(EXACT_PROJECT_POST)) return true;
    if (BLOCKED.test(url)) return false;
    return POST_PATH.test(url);
  }

  function nextTagId(textExtra) {
    const used = new Set(
      Array.isArray(textExtra)
        ? textExtra.map(x => x && x.tag_id != null ? String(x.tag_id) : "")
        : []
    );
    let n = 0;
    while (used.has(String(n))) n++;
    return String(n);
  }

  function stripOurWM(text) {
    if (typeof text !== "string") return "";
    return text
      .replace(
        /(?:^|\n)\s*[☆✮✦]\s*Upload\s*Method\s*[☆✮✦]?\s*(?:→\s*)?(?:<m[^>]*>)?@(?:nto\.presett|wanx\.prstt)(?:<\/m>)?\s*[☆✮✦]?\s*/gi,
        "\n"
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function appendWM(text) {
    const base = stripOurWM(String(text || ""));
    return base ? `${base}\n\n${WM_TEXT}` : WM_TEXT;
  }

  function cleanMarkupWM(text) {
    if (typeof text !== "string") return "";
    return text
      .replace(
        /(?:^|\n)\s*[☆✮✦]\s*Upload\s*Method\s*[☆✮✦]?\s*(?:→\s*)?(?:<m[^>]*>)?@(?:nto\.presett|wanx\.prstt)(?:<\/m>)?\s*[☆✮✦]?\s*/gi,
        "\n"
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanOldMentionExtras(textExtra) {
    if (!Array.isArray(textExtra)) return [];
    return textExtra.filter(item => {
      if (!item || typeof item !== "object") return true;
      const uid = String(item.user_id || item.userId || item.uid || "");
      const name = String(item.hashtag_name || "").replace(/^@/, "").toLowerCase();
      const currentUserId = String(ACCOUNT.userId || "");
      return !(uid === currentUserId || name === USERNAME);
    });
  }

  function buildMention(text, oldExtras) {
    const extras = cleanOldMentionExtras(oldExtras);
    const tagId = nextTagId(extras);
    const start = text.lastIndexOf(HANDLE);

    if (start >= 0) {
      extras.push({
        start,
        end: start + HANDLE.length,
        user_id: String(ACCOUNT.userId),
        type: 0,
        hashtag_name: USERNAME,
        tag_id: tagId,
        ...(ACCOUNT.secUid ? { sec_uid: ACCOUNT.secUid } : {}),
        unique_id: ACCOUNT.uniqueId
      });
    }

    return { textExtra: extras, tagId };
  }

  function appendWMMarkup(existingMarkup, tagId) {
    const existing = typeof existingMarkup === "string" ? existingMarkup : "";
    const cleaned = cleanMarkupWM(existing);

    const wmMarkup = `✦ Upload Method ✦ → <m id="${String(tagId)}">${HANDLE}</m>`;
    return cleaned ? `${cleaned}\n\n${wmMarkup}` : wmMarkup;
  }

  function plainFromMarkup(text) {
    return String(text || "").replace(/<m[^>]*>(.*?)<\/m>/gi, "$1");
  }

  function toMarkupFromPlain(text, tagId) {
    const safe = String(text || "");
    const start = safe.lastIndexOf(HANDLE);
    if (start < 0) return safe;
    return `${safe.slice(0, start)}<m id="${String(tagId)}">${HANDLE}</m>${safe.slice(start + HANDLE.length)}`;
  }

  function patchCaptionOwner(feature) {
    if (!feature || typeof feature !== "object") return false;

    let currentKey = null;
    let current = "";

    // Prefer the plain caption field, then fall back to structured markup.
    for (const key of CAPTION_KEYS) {
      if (key === "markup_text" || key === "markuptext") continue;
      if (typeof feature[key] === "string" && feature[key].trim()) {
        currentKey = key;
        current = feature[key];
        break;
      }
    }

    if (!current) {
      const markup =
        typeof feature.markup_text === "string" ? feature.markup_text :
        typeof feature.markuptext === "string" ? feature.markuptext : "";
      if (markup) current = plainFromMarkup(markup);
    }

    if (!current && typeof feature.text !== "string" && typeof feature.caption !== "string") {
      return false;
    }

    const plain = appendWM(current);
    const mention = buildMention(plain, feature.text_extra);

    let changed = false;

    // Keep the primary plain caption field synchronized.
    const primaryKey = currentKey || "text";
    if (feature[primaryKey] !== plain) {
      feature[primaryKey] = plain;
      changed = true;
    }
    if (primaryKey !== "text" && ("text" in feature || feature.single_post_feature_info)) {
      if (feature.text !== plain) {
        feature.text = plain;
        changed = true;
      }
    }

    // Preserve TikTok's existing <m> markup rather than rebuilding all
    // hashtags/mentions from plain text.
    const oldMarkup =
      typeof feature.markup_text === "string" ? feature.markup_text :
      typeof feature.markuptext === "string" ? feature.markuptext : "";

    const nextMarkup = oldMarkup
      ? appendWMMarkup(oldMarkup, mention.tagId)
      : toMarkupFromPlain(plain, mention.tagId);

    if ("markup_text" in feature || oldMarkup || !("markuptext" in feature)) {
      if (feature.markup_text !== nextMarkup) {
        feature.markup_text = nextMarkup;
        changed = true;
      }
    }
    if ("markuptext" in feature && feature.markuptext !== nextMarkup) {
      feature.markuptext = nextMarkup;
      changed = true;
    }

    const oldExtras = nativeStringify(feature.text_extra || []);
    const newExtras = nativeStringify(mention.textExtra);
    if (oldExtras !== newExtras) {
      feature.text_extra = mention.textExtra;
      changed = true;
    }
    // TikTok Web may read mention metadata from the request object instead of
    // the nested feature object. Keep both copies synchronized.
    if (Object.prototype.hasOwnProperty.call(feature, "text_extra") ||
        Object.prototype.hasOwnProperty.call(feature, "textExtra")) {
      feature.text_extra = mention.textExtra;
    }
    // The caller copies this same array onto req.text_extra when the request
    // uses that schema; patchKnownPostContainers handles the actual request.

    // Other caption aliases can exist simultaneously in TikTok payloads.
    // Keep them consistent, but never touch media/sound keys.
    for (const key of CAPTION_KEYS) {
      if (key === "markup_text" || key === "markuptext" || key === primaryKey) continue;
      if (typeof feature[key] === "string" && feature[key].trim()) {
        const next = appendWM(feature[key]);
        if (next !== feature[key]) {
          feature[key] = next;
          changed = true;
        }
      }
    }

    return changed;
  }

  function looksLikeUrlValue(value) {
    return typeof value === "string" && URL_LIKE.test(value.trim());
  }

  function patchKnownPostContainers(payload) {
    let changed = false;

    if (Array.isArray(payload.single_post_req_list)) {
      for (const item of payload.single_post_req_list) {
        if (!item || typeof item !== "object") continue;
        const feature =
          item.single_post_feature_info ||
          item.single_post_featureinfo ||
          item.post_feature_info;

        if (feature && typeof feature === "object" && patchCaptionOwner(feature)) {
          if (Array.isArray(feature.text_extra)) item.text_extra = feature.text_extra;
          changed = true;
        }
      }
    }

    if (Array.isArray(payload.item_list)) {
      for (const item of payload.item_list) {
        if (!item || typeof item !== "object") continue;
        const feature = item.item_info || item.single_post_feature_info || item.post_info;
        if (feature && typeof feature === "object" && patchCaptionOwner(feature)) {
          if (Array.isArray(feature.text_extra)) item.text_extra = feature.text_extra;
          changed = true;
        }
      }
    }

    for (const key of [
      "single_post_feature_info",
      "post_common_info",
      "item_common_info",
      "publish_info",
      "item_info",
      "post_info",
      "draft",
      "enter_post"
    ]) {
      const value = payload[key];
      if (value && typeof value === "object" && patchCaptionOwner(value)) {
        changed = true;
      }
    }

    return changed;
  }

  function walkPostObject(node, depth = 0, seen = new WeakSet()) {
    if (!node || typeof node !== "object" || depth > 7) return false;
    if (seen.has(node)) return false;
    seen.add(node);

    let changed = false;

    if (Array.isArray(node)) {
      for (const item of node) {
        if (walkPostObject(item, depth + 1, seen)) changed = true;
      }
      return changed;
    }

    for (const key of Object.keys(node)) {
      const value = node[key];
      const lower = String(key).toLowerCase();

      // Structured TikTok mention markup must stay as markup. Do not run the
      // plain-caption sanitizer over markup_text, or the <m> mention wrapper
      // would be flattened back into plain text and become non-clickable.
      if (lower === "markup_text" || lower === "markuptext") continue;

      // Rein-style: do not even descend into sound/music/audio branches.
      // This preserves selected TikTok sound metadata byte-for-byte.
      if (MEDIA_KEY.test(lower)) continue;

      if (CAPTION_KEYS.has(lower) && typeof value === "string") {
        const next = appendWM(value);
        if (next !== value) {
          node[key] = next;
          changed = true;
        }
        continue;
      }

      // Cover/media URL fields are deliberately left untouched.
      if (
        /(?:cover|thumbnail|poster|url|uri|path|file|material|effect|sticker)/i.test(lower) &&
        (typeof value === "string" && looksLikeUrlValue(value))
      ) {
        continue;
      }

      if (value && typeof value === "object") {
        if (walkPostObject(value, depth + 1, seen)) changed = true;
      }
    }

    return changed;
  }

  function isPostPayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    return (
      Array.isArray(payload.single_post_req_list) ||
      Array.isArray(payload.item_list) ||
      Array.isArray(payload.text_extra) ||
      payload.single_post_feature_info ||
      payload.post_common_info ||
      payload.item_common_info ||
      payload.item_info ||
      payload.publish_info ||
      payload.post_info ||
      payload.enter_post
    );
  }


  // ================= ADJN SOUND-SAFE NORMALIZATION =================
  // Ported from ADJN Core's publish-time audio protection. This does not
  // replace TikTok's selected music; it only disables known cloud-canvas
  // recompression paths and explicitly preserves the original audio profile.
  function hasAdjnMusic(payload) {
    try {
      const list = Array.isArray(payload?.single_post_req_list)
        ? payload.single_post_req_list
        : [];
      return list.some(req => {
        const info = req?.single_post_feature_info;
        const music = info?.music_info;
        return !!(music?.music_id_string || music?.id);
      });
    } catch (_) {
      return false;
    }
  }

  function normalizeAdjnSound(payload) {
    if (!payload || typeof payload !== "object") return false;
    let changed = false;
    const musicPresent = hasAdjnMusic(payload);

    const remove = (obj, key) => {
      if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
        delete obj[key];
        changed = true;
      }
    };
    const setIfDifferent = (obj, key, value) => {
      if (obj && obj[key] !== value) {
        obj[key] = value;
        changed = true;
      }
    };

    // ADJN: prevent cloud canvas/video-editor recompression.
    ["draft", "canvas_config", "vedit_segment_info"].forEach(key => remove(payload, key));
    setIfDifferent(payload, "cloud_edit_is_use_video_canvas", false);
    setIfDifferent(payload, "psg_vsp_aud", true);
    if (Object.prototype.hasOwnProperty.call(payload, "enter_post_page_from")) {
      setIfDifferent(payload, "enter_post_page_from", 1);
    }

    if (payload.post_common_info && typeof payload.post_common_info === "object") {
      setIfDifferent(payload.post_common_info, "post_type", 3);
      setIfDifferent(payload.post_common_info, "enter_post_page_from", 1);
      setIfDifferent(payload.post_common_info, "psg_vsp_aud", true);
    }

    // ADJN's music-present branch.
    if (musicPresent && Array.isArray(payload.feature_common_info_list)) {
      for (const item of payload.feature_common_info_list) {
        const vedit = item?.vedit_common_info;
        if (!vedit || typeof vedit !== "object") continue;
        remove(vedit, "tiktok_snap_shot_lite_params");
        if (Object.prototype.hasOwnProperty.call(vedit, "application")) {
          setIfDifferent(vedit, "application", 1);
        }
      }
    }

    if (Array.isArray(payload.single_post_req_list)) {
      for (const req of payload.single_post_req_list) {
        if (!req || typeof req !== "object") continue;
        setIfDifferent(req, "psg_vsp_aud", true);

        const info = req.single_post_feature_info;
        if (!info || typeof info !== "object") continue;

        remove(info, "vedit_segment_info");
        setIfDifferent(info, "cloud_edit_is_use_video_canvas", false);
        setIfDifferent(info, "has_original_audio", 1);
        setIfDifferent(info, "psg_vsp_aud", true);
        setIfDifferent(info, "video_quality_score", 1.0);
        setIfDifferent(info, "is_high_quality", true);

        // Keep the selected TikTok sound ID intact; only fill the string
        // representation when TikTok supplied the numeric ID alone.
        if (info.music_info && typeof info.music_info === "object") {
          if (!info.music_info.music_id_string && info.music_info.id) {
            info.music_info.music_id_string = String(info.music_info.id);
            changed = true;
          }
        }
      }
    }

    return changed;
  }

  function patchPayload(payload) {
    if (!isPostPayload(payload)) return false;

    // Keep the exact media objects around as a final safety net. This is
    // intentionally redundant: the walker already skips them.
    const mediaSnapshot = [];
    const snapshot = (node, seen = new WeakSet()) => {
      if (!node || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);

      if (Array.isArray(node)) {
        node.forEach(item => snapshot(item, seen));
        return;
      }

      for (const key of Object.keys(node)) {
        const value = node[key];
        if (/(?:^|_)(?:cover|thumbnail|poster)(?:_|$)/i.test(key)) {
          let copy = value;
          try { copy = JSON.parse(nativeStringify(value)); } catch (_) {}
          mediaSnapshot.push({ owner: node, key, value: copy });
          continue;
        }
        if (value && typeof value === "object") snapshot(value, seen);
      }
    };

    snapshot(payload);

    let changed = normalizeAdjnSound(payload);
    if (patchKnownPostContainers(payload)) changed = true;
    if (walkPostObject(payload)) changed = true;

    // Restore protected media if anything downstream touched them.
    for (const item of mediaSnapshot) {
      let next = item.value;
      try { next = JSON.parse(JSON.stringify(item.value)); } catch (_) {}
      if (nativeStringify(item.owner[item.key]) !== JSON.stringify(next)) {
        item.owner[item.key] = next;
        changed = true;
      }
    }

    return changed;
  }

  function patchBody(body) {
    if (typeof body !== "string" || !body) return body;
    try {
      const parsed = JSON.parse(body);
      if (!patchPayload(parsed)) return body;
      return nativeStringify(parsed);
    } catch (_) {
      return body;
    }
  }

  // Rein-style JSON.stringify interception: catches payloads TikTok creates
  // in JS before handing them to fetch/XHR.
  JSON.stringify = function(value, replacer, space) {
    try {
      if (value && typeof value === "object") patchPayload(value);
    } catch (_) {}
    return nativeStringify.call(this, value, replacer, space);
  };

  const nativeFetch = window.fetch;
  window.fetch = async function(input, init = {}) {
    try {
      const url = typeof input === "string" ? input : input?.url || "";

      if (isPostRequest(url)) {
        if (typeof init.body === "string") {
          init = { ...init, body: patchBody(init.body) };
        } else if (typeof Request !== "undefined" && input instanceof Request) {
          const body = await input.clone().text();
          if (body) input = new Request(input, { body: patchBody(body) });
        }
      }
    } catch (_) {}

    return nativeFetch.call(this, input, init);
  };

  const xhrProto = XMLHttpRequest.prototype;
  const nativeOpen = xhrProto.open;
  const nativeSend = xhrProto.send;

  xhrProto.open = function(method, url) {
    this.__wanxzyyPostUrl = url;
    return nativeOpen.apply(this, arguments);
  };

  xhrProto.send = function(body) {
    try {
      if (isPostRequest(this.__wanxzyyPostUrl) && typeof body === "string") {
        body = patchBody(body);
      }
    } catch (_) {}

    return nativeSend.call(this, body);
  };
})();
