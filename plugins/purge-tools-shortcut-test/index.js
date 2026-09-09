(() => {
  "use strict";

  const V = globalThis.vendetta;
  if (!V?.metro || !V?.patcher) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const { findByProps } = V.metro;
  const KEY = "ITS_TRIPLE_SIX_PURGE_TOOLS_SHIGGY";
  const OLD_KEY = "ITS_TRIPLE_SIX_PURGE_TOOLS";

  let unpatch = null;
  let delayedStart = null;
  let cleanupTimer = null;
  let settingConstants = null;

  function find(...props) {
    try { return findByProps?.(...props); } catch { return undefined; }
  }

  function toast(text) {
    try { V.ui?.toasts?.showToast?.(String(text)); } catch {}
  }

  function purgePluginId() {
    try {
      return Object.keys(V.plugins?.plugins ?? {}).find(id =>
        id.includes("/plugins/purge-tools/") && !id.includes("shortcut-test")
      ) ?? null;
    } catch { return null; }
  }

  function openPurgeTools() {
    try {
      const id = purgePluginId();
      const Settings = id ? V.plugins?.getSettings?.(id) : null;
      if (!id || typeof Settings !== "function") throw new Error("Purge Tools settings are not available yet");

      const rootNavigation = find("getRootNavigationRef");
      const navigation = rootNavigation?.getRootNavigationRef?.();
      if (!navigation?.navigate) throw new Error("Navigation unavailable");

      navigation.navigate("BUNNY_CUSTOM_PAGE", {
        title: "Purge Tools",
        render: () => React.createElement(Settings),
      });
    } catch (error) {
      toast(`Could not open Purge Tools: ${error?.message ?? error}`);
    }
  }

  function removeOldConfig() {
    try {
      settingConstants = settingConstants ?? find("SETTING_RENDERER_CONFIG");
      const current = settingConstants?.SETTING_RENDERER_CONFIG ?? {};
      if (!current[OLD_KEY]) return;
      const next = { ...current };
      delete next[OLD_KEY];
      settingConstants.SETTING_RENDERER_CONFIG = next;
    } catch {}
  }

  function cleanSections(sections) {
    if (!Array.isArray(sections)) return;

    let shiggySection = null;
    for (const section of sections) {
      if (!Array.isArray(section?.settings)) continue;
      section.settings = section.settings.filter(key => key !== OLD_KEY);
      if (
        section.settings.includes("SHIGGYCORD")
        || section.settings.includes("BUNNY_PLUGINS")
        || section?.label === "ShiggyCord"
        || section?.title === "ShiggyCord"
      ) shiggySection = shiggySection ?? section;
    }

    for (let i = sections.length - 1; i >= 0; i -= 1) {
      const section = sections[i];
      if (
        Array.isArray(section?.settings)
        && section.settings.length === 0
        && (section?.label === "Revenge" || section?.title === "Revenge")
      ) sections.splice(i, 1);
    }

    if (!shiggySection || shiggySection.settings.includes(KEY)) return;
    const pluginsIndex = shiggySection.settings.indexOf("BUNNY_PLUGINS");
    const shiggyIndex = shiggySection.settings.indexOf("SHIGGYCORD");
    const insertAt = pluginsIndex >= 0 ? pluginsIndex + 1 : shiggyIndex >= 0 ? shiggyIndex + 1 : shiggySection.settings.length;
    shiggySection.settings.splice(insertAt, 0, KEY);
  }

  function install() {
    if (unpatch) return true;

    settingConstants = find("SETTING_RENDERER_CONFIG");
    const createListModule = find("createList");
    if (!settingConstants || !createListModule?.createList) return false;

    const icon = V.ui?.assets?.getAssetIDByName?.("TrashIcon")
      ?? V.ui?.assets?.getAssetIDByName?.("DeleteIcon");

    removeOldConfig();

    try {
      const current = settingConstants.SETTING_RENDERER_CONFIG ?? {};
      settingConstants.SETTING_RENDERER_CONFIG = {
        ...current,
        [KEY]: {
          type: "pressable",
          useTitle: () => "Purge Tools",
          title: () => "Purge Tools",
          icon,
          IconComponent: icon != null
            ? () => React.createElement(RN.Image, {
                source: icon,
                style: { width: 24, height: 24, tintColor: "#F2F3F5" },
              })
            : undefined,
          onPress: openPurgeTools,
          withArrow: true,
        },
      };
    } catch {
      return false;
    }

    try {
      unpatch = V.patcher.after("createList", createListModule, args => {
        try {
          removeOldConfig();
          cleanSections(args?.[0]?.sections);
        } catch {}
      });
      return true;
    } catch {
      unpatch = null;
      return false;
    }
  }

  function cleanup() {
    if (delayedStart) clearTimeout(delayedStart);
    delayedStart = null;
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = null;
    try { unpatch?.(); } catch {}
    unpatch = null;

    try {
      const current = settingConstants?.SETTING_RENDERER_CONFIG ?? {};
      if (current[KEY]) {
        const next = { ...current };
        delete next[KEY];
        settingConstants.SETTING_RENDERER_CONFIG = next;
      }
    } catch {}
  }

  return {
    onLoad() {
      // Install after normal enabled plugins have started so this patch runs last
      // and can remove Purge Tools' legacy Revenge placement reliably.
      delayedStart = setTimeout(() => {
        install();
        cleanupTimer = setInterval(() => {
          removeOldConfig();
          if (!unpatch) install();
        }, 1500);
      }, 4500);
    },
    onUnload() { cleanup(); },
  };
})()
