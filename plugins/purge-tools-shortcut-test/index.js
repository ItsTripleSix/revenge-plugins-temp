(() => {
  "use strict";

  const V = globalThis.vendetta;
  if (!V?.metro || !V?.patcher) return {};

  const { findByProps } = V.metro;
  const SHORTCUT_KEY = "ITS_TRIPLE_SIX_PURGE_TOOLS";
  let unpatch = null;
  let retryTimer = null;

  function find(...props) {
    try { return findByProps?.(...props); } catch { return undefined; }
  }

  function install() {
    if (unpatch) return true;

    const settingConstants = find("SETTING_RENDERER_CONFIG");
    const createListModule = find("createList");
    const config = settingConstants?.SETTING_RENDERER_CONFIG;

    // Purge Tools itself registers this setting entry. This bridge only places
    // that already-registered entry into ShiggyCord's settings section.
    if (!config?.[SHORTCUT_KEY] || !createListModule?.createList) return false;

    try {
      unpatch = V.patcher.after("createList", createListModule, args => {
        try {
          const sections = args?.[0]?.sections;
          if (!Array.isArray(sections)) return;

          const section = sections.find(item =>
            Array.isArray(item?.settings)
            && (item.settings.includes("SHIGGYCORD") || item.settings.includes("BUNNY_PLUGINS"))
          ) ?? sections.find(item => item?.label === "ShiggyCord" || item?.title === "ShiggyCord");

          if (!section || !Array.isArray(section.settings) || section.settings.includes(SHORTCUT_KEY)) return;

          const pluginsIndex = section.settings.indexOf("BUNNY_PLUGINS");
          const shiggyIndex = section.settings.indexOf("SHIGGYCORD");
          const insertAt = pluginsIndex >= 0
            ? pluginsIndex + 1
            : shiggyIndex >= 0
              ? shiggyIndex + 1
              : section.settings.length;

          section.settings.splice(insertAt, 0, SHORTCUT_KEY);
        } catch {}
      });
      return true;
    } catch {
      unpatch = null;
      return false;
    }
  }

  function stopRetry() {
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = null;
  }

  function startRetry() {
    if (install()) return;
    retryTimer = setInterval(() => {
      if (install()) stopRetry();
    }, 750);
    setTimeout(stopRetry, 30000);
  }

  return {
    onLoad() { startRetry(); },
    onUnload() {
      stopRetry();
      try { unpatch?.(); } catch {}
      unpatch = null;
    },
  };
})()
