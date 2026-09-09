(() => {
  "use strict";

  const V = globalThis.vendetta;
  if (!V?.metro || !V?.patcher) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const { findByProps } = V.metro;
  const KEY = "ITS_TRIPLE_SIX_PURGE_TOOLS_SHIGGY";
  let unpatch = null;
  let retryTimer = null;
  let settingConstants = null;
  let installed = false;

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
      if (!id || typeof Settings !== "function") {
        throw new Error("Purge Tools settings are not available yet");
      }

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

  function install() {
    if (installed) return true;

    settingConstants = find("SETTING_RENDERER_CONFIG");
    const createListModule = find("createList");
    if (!settingConstants || !createListModule?.createList) return false;

    const icon = V.ui?.assets?.getAssetIDByName?.("TrashIcon")
      ?? V.ui?.assets?.getAssetIDByName?.("DeleteIcon");

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
          const sections = args?.[0]?.sections;
          if (!Array.isArray(sections)) return;

          const section = sections.find(item =>
            Array.isArray(item?.settings)
            && (item.settings.includes("SHIGGYCORD") || item.settings.includes("BUNNY_PLUGINS"))
          ) ?? sections.find(item => item?.label === "ShiggyCord" || item?.title === "ShiggyCord");

          if (!section || !Array.isArray(section.settings) || section.settings.includes(KEY)) return;

          const pluginsIndex = section.settings.indexOf("BUNNY_PLUGINS");
          const shiggyIndex = section.settings.indexOf("SHIGGYCORD");
          const insertAt = pluginsIndex >= 0
            ? pluginsIndex + 1
            : shiggyIndex >= 0
              ? shiggyIndex + 1
              : section.settings.length;

          section.settings.splice(insertAt, 0, KEY);
        } catch {}
      });
    } catch {
      return false;
    }

    installed = true;
    return true;
  }

  function stopRetry() {
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = null;
  }

  function retry() {
    if (install()) stopRetry();
  }

  function cleanup() {
    stopRetry();
    try { unpatch?.(); } catch {}
    unpatch = null;
    installed = false;

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
      retry();
      retryTimer = setInterval(retry, 750);
      setTimeout(stopRetry, 30000);
    },
    onUnload() { cleanup(); },
  };
})()
