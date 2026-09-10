(() => {
  "use strict";

  // Shiggy gives every Vendetta plugin its own local vendetta object.
  // Do not use window/globalThis.vendetta here.
  const V = vendetta;
  if (!V?.metro || !V?.patcher) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const { findByProps, findByName } = V.metro;

  const VERSION = "1.2.0-shiggy";
  const SHORTCUT_KEY = "ITS_TRIPLE_SIX_ACCOUNT_SWITCHER_SHIGGY";
  const DEFER_MS = 6000;

  const runtime = {
    stopped: false,
    capabilityModule: null,
    openManageAccountsModal: null,
    settingConstants: null,
    createListModule: null,
    capabilityUnpatch: null,
    settingsUnpatch: null,
    deferredTimer: null,
    nativeEnabled: false,
    shortcutInstalled: false,
  };

  const C = {
    bg: "#111214",
    card: "#1e1f22",
    text: "#f2f3f5",
    muted: "#b5bac1",
    brand: "#5865f2",
    green: "#23a55a",
    red: "#f23f43",
  };

  function find(...props) {
    try { return findByProps?.(...props); }
    catch { return undefined; }
  }

  function findName(name) {
    try { return findByName?.(name); }
    catch { return undefined; }
  }

  function toast(text) {
    try { V.ui?.toasts?.showToast?.(String(text)); } catch {}
  }

  // Cached, one-shot module resolution. There is deliberately no polling loop.
  function resolveCapability() {
    if (runtime.capabilityModule?.getCanUseMultiAccountMobile) {
      return runtime.capabilityModule;
    }

    const module = find("getCanUseMultiAccountMobile");
    if (module?.getCanUseMultiAccountMobile) runtime.capabilityModule = module;
    return runtime.capabilityModule;
  }

  function enableNativeSwitcher() {
    if (runtime.stopped) return false;
    if (runtime.capabilityUnpatch) {
      runtime.nativeEnabled = true;
      return true;
    }

    const capability = resolveCapability();
    if (!capability?.getCanUseMultiAccountMobile) return false;

    try {
      runtime.capabilityUnpatch = V.patcher.after(
        "getCanUseMultiAccountMobile",
        capability,
        () => true,
      );
    } catch {
      runtime.capabilityUnpatch = null;
    }

    // Intentionally do NOT force canUseMultiAccountNotifications.
    // It is not needed for switching and can make notifications from an
    // inactive account open Discord in the wrong account context.
    runtime.nativeEnabled = typeof runtime.capabilityUnpatch === "function";
    return runtime.nativeEnabled;
  }

  function resolveNativeManager() {
    if (typeof runtime.openManageAccountsModal === "function") {
      return runtime.openManageAccountsModal;
    }

    const manager = findName("openManageAccountsModal");
    if (typeof manager === "function") runtime.openManageAccountsModal = manager;
    return runtime.openManageAccountsModal;
  }

  function openNativeAccountManager() {
    // Re-check the capability only when the user actually asks to switch.
    enableNativeSwitcher();

    const manager = resolveNativeManager();
    if (typeof manager !== "function") {
      toast("Discord's native account manager was not found on this build");
      return false;
    }

    try {
      manager();
      return true;
    } catch (error) {
      toast(`Could not open native account manager: ${error?.message ?? error}`);
      return false;
    }
  }

  function findShiggySection(sections) {
    if (!Array.isArray(sections)) return null;

    return sections.find(item =>
      Array.isArray(item?.settings)
      && (item.settings.includes("SHIGGYCORD") || item.settings.includes("BUNNY_PLUGINS"))
    ) ?? sections.find(item => item?.label === "ShiggyCord" || item?.title === "ShiggyCord") ?? null;
  }

  function injectShortcutIntoSections(sections) {
    const section = findShiggySection(sections);
    if (!section || !Array.isArray(section.settings) || section.settings.includes(SHORTCUT_KEY)) {
      return;
    }

    const pluginsIndex = section.settings.indexOf("BUNNY_PLUGINS");
    const shiggyIndex = section.settings.indexOf("SHIGGYCORD");
    const insertAt = pluginsIndex >= 0
      ? pluginsIndex + 1
      : shiggyIndex >= 0
        ? shiggyIndex + 1
        : section.settings.length;

    section.settings.splice(insertAt, 0, SHORTCUT_KEY);
  }

  function installShiggyShortcut() {
    if (runtime.stopped || runtime.shortcutInstalled) return runtime.shortcutInstalled;

    // Resolve only the two modules required for the Shiggy settings shortcut.
    // If they are not ready yet, we simply stop. No background retry loop.
    runtime.settingConstants ??= find("SETTING_RENDERER_CONFIG") ?? null;
    runtime.createListModule ??= find("createList") ?? null;

    const settingConstants = runtime.settingConstants;
    const createListModule = runtime.createListModule;
    if (!settingConstants || typeof createListModule?.createList !== "function") return false;

    let icon;
    try {
      icon = V.ui?.assets?.getAssetIDByName?.("UserIcon")
        ?? V.ui?.assets?.getAssetIDByName?.("PersonIcon");
    } catch {}

    try {
      const current = settingConstants.SETTING_RENDERER_CONFIG ?? {};
      if (!current[SHORTCUT_KEY]) {
        settingConstants.SETTING_RENDERER_CONFIG = {
          ...current,
          [SHORTCUT_KEY]: {
            type: "pressable",
            useTitle: () => "Account Switcher",
            title: () => "Account Switcher",
            icon,
            IconComponent: icon != null
              ? () => React.createElement(RN.Image, {
                  source: icon,
                  style: { width: 24, height: 24, tintColor: C.text },
                })
              : undefined,
            onPress: openNativeAccountManager,
            withArrow: true,
          },
        };
      }
    } catch {
      return false;
    }

    try {
      if (!runtime.settingsUnpatch) {
        runtime.settingsUnpatch = V.patcher.after("createList", createListModule, args => {
          try { injectShortcutIntoSections(args?.[0]?.sections); } catch {}
        });
      }
    } catch {
      runtime.settingsUnpatch = null;
      return false;
    }

    runtime.shortcutInstalled = typeof runtime.settingsUnpatch === "function";
    return runtime.shortcutInstalled;
  }

  function integrate() {
    if (runtime.stopped) return;
    enableNativeSwitcher();
    installShiggyShortcut();
  }

  function Button({ text, onPress, secondary = false }) {
    const Pressable = RN.Pressable ?? RN.TouchableOpacity;
    return React.createElement(Pressable, {
      onPress,
      style: {
        backgroundColor: secondary ? C.card : C.brand,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 9,
        alignItems: "center",
      },
    }, React.createElement(RN.Text, {
      style: { color: C.text, fontWeight: "700", fontSize: 14 },
    }, text));
  }

  function Settings() {
    const [, refresh] = React.useReducer(x => x + 1, 0);

    React.useEffect(() => {
      // Opening plugin settings is an explicit user action, so it is safe to
      // retry any module lookups that were unavailable during deferred setup.
      integrate();
      refresh();
    }, []);

    const children = [
      React.createElement(RN.View, {
        key: "status",
        style: { backgroundColor: C.card, padding: 14, borderRadius: 12 },
      }, [
        React.createElement(RN.Text, {
          key: "title",
          style: { color: C.text, fontSize: 18, fontWeight: "700" },
        }, "Account Switcher"),
        React.createElement(RN.Text, {
          key: "state",
          style: {
            color: runtime.nativeEnabled ? C.green : C.red,
            marginTop: 6,
            fontSize: 13,
            fontWeight: "700",
          },
        }, runtime.nativeEnabled
          ? "Discord native multi-account enabled"
          : "Native multi-account module not found yet"),
        React.createElement(RN.Text, {
          key: "safety",
          style: { color: C.muted, marginTop: 7, fontSize: 12, lineHeight: 17 },
        }, "Safe startup build: no Metro polling, no direct account switching, and inactive-account notifications are not forced on."),
      ]),
      React.createElement(Button, {
        key: "open",
        text: "Open Discord Account Manager",
        onPress: openNativeAccountManager,
      }),
      React.createElement(Button, {
        key: "repair",
        text: "Refresh Integration",
        secondary: true,
        onPress: () => {
          integrate();
          refresh();
        },
      }),
      React.createElement(RN.Text, {
        key: "diag",
        style: { color: C.muted, fontSize: 12, lineHeight: 17 },
      }, `v${VERSION} • native:${runtime.nativeEnabled ? "yes" : "no"} • manager:${typeof runtime.openManageAccountsModal === "function" ? "yes" : "lazy"} • shortcut:${runtime.shortcutInstalled ? "yes" : "no"}`),
    ];

    const Scroll = RN.ScrollView ?? RN.View;
    return React.createElement(Scroll, {
      style: { flex: 1, backgroundColor: C.bg },
      contentContainerStyle: { padding: 16, paddingBottom: 40, gap: 12 },
    }, children);
  }

  function cleanup() {
    runtime.stopped = true;

    if (runtime.deferredTimer) {
      clearTimeout(runtime.deferredTimer);
      runtime.deferredTimer = null;
    }

    try { runtime.settingsUnpatch?.(); } catch {}
    runtime.settingsUnpatch = null;

    // Use the already-cached settings object. Never run a Metro search during
    // unload/reload just to remove our shortcut.
    try {
      const current = runtime.settingConstants?.SETTING_RENDERER_CONFIG ?? {};
      if (current[SHORTCUT_KEY]) {
        const next = { ...current };
        delete next[SHORTCUT_KEY];
        runtime.settingConstants.SETTING_RENDERER_CONFIG = next;
      }
    } catch {}

    try { runtime.capabilityUnpatch?.(); } catch {}
    runtime.capabilityUnpatch = null;

    runtime.nativeEnabled = false;
    runtime.shortcutInstalled = false;
  }

  return {
    onLoad() {
      runtime.stopped = false;

      // Deliberately do zero Metro scanning during Shiggy's immediate plugin
      // startup. The old build scanned several modules every 750 ms for up to
      // 30 seconds. This build waits for Discord to settle, then tries once.
      runtime.deferredTimer = setTimeout(() => {
        runtime.deferredTimer = null;
        integrate();
      }, DEFER_MS);
    },

    onUnload() {
      cleanup();
    },

    settings: Settings,
  };
})()
