(() => {
  "use strict";

  const V = globalThis.vendetta;
  if (!V?.metro || !V?.patcher) return {};

  const { findByProps } = V.metro;
  const OLD_KEY = "ITS_TRIPLE_SIX_PURGE_TOOLS";
  const NEW_KEY = "ITS_TRIPLE_SIX_PURGE_TOOLS_SHIGGY";
  let unpatch = null;
  let retryTimer = null;
  let settingConstants = null;

  function find(...props) {
    try { return findByProps?.(...props); } catch { return undefined; }
  }

  function install() {
    if (unpatch) return true;

    settingConstants = find("SETTING_RENDERER_CONFIG");
    const createListModule = find("createList");
    const current = settingConstants?.SETTING_RENDERER_CONFIG ?? {};
    const source = current[OLD_KEY];

    // Purge Tools registers OLD_KEY itself. Clone that exact working entry under
    // a unique Shiggy key so Discord's settings list does not deduplicate it
    // against the old Revenge-section entry during this temporary test.
    if (!source || !createListModule?.createList) return false;

    try {
      settingConstants.SETTING_RENDERER_CONFIG = {
        ...current,
        [NEW_KEY]: {
          ...source,
          useTitle: () => "Purge Tools",
          title: () => "Purge Tools",
          withArrow: true,
        },
      };
    } catch {
      return false;
    }

    try {
      unpatch = V.patcher.after("createList", createListModule, args => {
        try {
          const sections = args?.[0]?.sections;
          if (!Array.isArray(sections)) return;

          const section = sections.find(item =>
            Array.isArray(item?.settings)
            && (item.settings.includes("SHIGGYCORD") || item.settings.includes("BUNNY_PLUGINS"))
          ) ?? sections.find(item => item?.label === "ShiggyCord" || item?.title === "ShiggyCord");

          if (!section || !Array.isArray(section.settings) || section.settings.includes(NEW_KEY)) return;

          const pluginsIndex = section.settings.indexOf("BUNNY_PLUGINS");
          const shiggyIndex = section.settings.indexOf("SHIGGYCORD");
          const insertAt = pluginsIndex >= 0
            ? pluginsIndex + 1
            : shiggyIndex >= 0
              ? shiggyIndex + 1
              : section.settings.length;

          section.settings.splice(insertAt, 0, NEW_KEY);
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

  function cleanup() {
    stopRetry();
    try { unpatch?.(); } catch {}
    unpatch = null;

    try {
      const current = settingConstants?.SETTING_RENDERER_CONFIG ?? {};
      if (current[NEW_KEY]) {
        const next = { ...current };
        delete next[NEW_KEY];
        settingConstants.SETTING_RENDERER_CONFIG = next;
      }
    } catch {}
  }

  return {
    onLoad() { startRetry(); },
    onUnload() { cleanup(); },
  };
})()
