(async () => {
  "use strict";

  const V = globalThis.vendetta ?? vendetta;
  if (!V?.metro || !V?.patcher) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const { findByProps } = V.metro;
  const storage = V.plugin?.storage ?? {};

  const OLD_KEY = "ITS_TRIPLE_SIX_PURGE_TOOLS";
  const NEW_KEY = "ITS_TRIPLE_SIX_PURGE_TOOLS_SHIGGY";
  const FALLBACK_CORE = "https://raw.githubusercontent.com/ItsTripleSix/revenge-plugins/main/plugins/purge-tools/index.js";

  let core = null;
  let settingsUnpatch = null;
  let retryTimer = null;
  let settingConstants = null;

  function find(...props) {
    try { return findByProps?.(...props); } catch { return undefined; }
  }

  function toast(text) {
    try { V.ui?.toasts?.showToast?.(String(text)); } catch {}
  }

  async function fetchText(url) {
    const response = await V.utils.safeFetch(url, { cache: "no-store" });
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? "?"}`);
    return response.text();
  }

  async function loadCore() {
    let source = null;
    const sibling = `${V.plugin.id}core.js`;

    try {
      source = await fetchText(sibling);
      storage.shiggyPurgeCore = source;
    } catch {
      try {
        source = await fetchText(FALLBACK_CORE);
        storage.shiggyPurgeCore = source;
      } catch {
        source = storage.shiggyPurgeCore ?? null;
      }
    }

    if (!source) throw new Error("Could not load Purge Tools core");

    const factory = (0, eval)(`vendetta=>{return ${source}}\n//# sourceURL=${sibling}`);
    const raw = factory(V);
    const resolved = typeof raw === "function" ? raw() : raw;
    return await Promise.resolve(resolved?.default ?? resolved ?? {});
  }

  function stripOldConfig() {
    try {
      settingConstants = settingConstants ?? find("SETTING_RENDERER_CONFIG");
      const current = settingConstants?.SETTING_RENDERER_CONFIG ?? {};
      if (!current[OLD_KEY]) return;
      const next = { ...current };
      delete next[OLD_KEY];
      settingConstants.SETTING_RENDERER_CONFIG = next;
    } catch {}
  }

  function installShortcut() {
    if (settingsUnpatch) {
      stripOldConfig();
      return true;
    }

    settingConstants = find("SETTING_RENDERER_CONFIG");
    const createListModule = find("createList");
    const Settings = core?.settings;
    if (!settingConstants || !createListModule?.createList || typeof Settings !== "function") return false;

    const rootNavigation = find("getRootNavigationRef");
    const icon = V.ui?.assets?.getAssetIDByName?.("TrashIcon")
      ?? V.ui?.assets?.getAssetIDByName?.("DeleteIcon");

    const open = () => {
      try {
        const navigation = rootNavigation?.getRootNavigationRef?.();
        if (!navigation?.navigate) throw new Error("Navigation unavailable");
        navigation.navigate("BUNNY_CUSTOM_PAGE", {
          title: "Purge Tools",
          render: () => React.createElement(Settings),
        });
      } catch (error) {
        toast(`Could not open Purge Tools: ${error?.message ?? error}`);
      }
    };

    try {
      const current = settingConstants.SETTING_RENDERER_CONFIG ?? {};
      const next = { ...current };
      delete next[OLD_KEY];
      next[NEW_KEY] = {
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
        onPress: open,
        withArrow: true,
      };
      settingConstants.SETTING_RENDERER_CONFIG = next;
    } catch {
      return false;
    }

    try {
      settingsUnpatch = V.patcher.after("createList", createListModule, args => {
        try {
          const sections = args?.[0]?.sections;
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

          if (!shiggySection || !Array.isArray(shiggySection.settings) || shiggySection.settings.includes(NEW_KEY)) return;

          const pluginsIndex = shiggySection.settings.indexOf("BUNNY_PLUGINS");
          const shiggyIndex = shiggySection.settings.indexOf("SHIGGYCORD");
          const insertAt = pluginsIndex >= 0
            ? pluginsIndex + 1
            : shiggyIndex >= 0
              ? shiggyIndex + 1
              : shiggySection.settings.length;

          shiggySection.settings.splice(insertAt, 0, NEW_KEY);
        } catch {}
      });
      return true;
    } catch {
      settingsUnpatch = null;
      return false;
    }
  }

  function stopRetry() {
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = null;
  }

  function startRetry() {
    if (installShortcut()) return;
    retryTimer = setInterval(() => {
      if (installShortcut()) stopRetry();
    }, 750);
    setTimeout(stopRetry, 30000);
  }

  function cleanupShortcut() {
    stopRetry();
    try { settingsUnpatch?.(); } catch {}
    settingsUnpatch = null;

    try {
      const current = settingConstants?.SETTING_RENDERER_CONFIG ?? {};
      if (current[NEW_KEY]) {
        const next = { ...current };
        delete next[NEW_KEY];
        settingConstants.SETTING_RENDERER_CONFIG = next;
      }
    } catch {}
  }

  core = await loadCore();

  return {
    onLoad() {
      core?.onLoad?.();
      stripOldConfig();
      startRetry();
    },
    onUnload() {
      cleanupShortcut();
      try { core?.onUnload?.(); } catch {}
    },
    settings: core?.settings,
  };
})()
