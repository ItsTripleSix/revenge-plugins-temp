(() => {
  "use strict";

  // Shiggy supplies each Vendetta plugin with its own local API object.
  const V = vendetta;
  if (!V?.metro || !V?.patcher) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const { findByProps, findByName } = V.metro;

  const VERSION = "1.3.0-shiggy";
  const STARTUP_DELAY_MS = 10000;

  const runtime = {
    stopped: false,
    capabilityModule: null,
    capabilityUnpatch: null,
    openManageAccountsModal: null,
    startupTimer: null,
    nativeEnabled: false,
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

  function toast(text) {
    try { V.ui?.toasts?.showToast?.(String(text)); } catch {}
  }

  function resolveCapability() {
    if (runtime.capabilityModule?.getCanUseMultiAccountMobile) return runtime.capabilityModule;

    try {
      const found = findByProps?.("getCanUseMultiAccountMobile");
      if (found?.getCanUseMultiAccountMobile) runtime.capabilityModule = found;
    } catch {}

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

    // Never force canUseMultiAccountNotifications. It is unrelated to switching
    // and previously caused bad inactive-account notification behavior.
    runtime.nativeEnabled = typeof runtime.capabilityUnpatch === "function";
    return runtime.nativeEnabled;
  }

  function resolveNativeManager() {
    if (typeof runtime.openManageAccountsModal === "function") {
      return runtime.openManageAccountsModal;
    }

    try {
      const found = findByName?.("openManageAccountsModal");
      if (typeof found === "function") runtime.openManageAccountsModal = found;
    } catch {}

    return runtime.openManageAccountsModal;
  }

  function openNativeAccountManager() {
    // These lookups only happen from an explicit user action.
    enableNativeSwitcher();
    const manager = resolveNativeManager();

    if (typeof manager !== "function") {
      toast("Discord's native account manager was not found yet. Try again after Discord finishes loading.");
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
      // Plugin settings are already open, so one explicit capability lookup here
      // cannot interfere with Discord's splash/startup path.
      enableNativeSwitcher();
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
        }, "Startup-safe build: no ShiggyCord settings shortcut, no settings-list patching, no polling, no direct account switching, and no inactive-account notifications."),
      ]),
      React.createElement(Button, {
        key: "open",
        text: "Open Discord Account Manager",
        onPress: openNativeAccountManager,
      }),
      React.createElement(Button, {
        key: "refresh",
        text: "Retry Native Integration",
        secondary: true,
        onPress: () => {
          enableNativeSwitcher();
          refresh();
        },
      }),
      React.createElement(RN.Text, {
        key: "diag",
        style: { color: C.muted, fontSize: 12, lineHeight: 17 },
      }, `v${VERSION} • native:${runtime.nativeEnabled ? "yes" : "no"} • manager:${typeof runtime.openManageAccountsModal === "function" ? "yes" : "lazy"}`),
    ];

    const Scroll = RN.ScrollView ?? RN.View;
    return React.createElement(Scroll, {
      style: { flex: 1, backgroundColor: C.bg },
      contentContainerStyle: { padding: 16, paddingBottom: 40, gap: 12 },
    }, children);
  }

  function cleanup() {
    runtime.stopped = true;

    if (runtime.startupTimer) {
      clearTimeout(runtime.startupTimer);
      runtime.startupTimer = null;
    }

    try { runtime.capabilityUnpatch?.(); } catch {}
    runtime.capabilityUnpatch = null;
    runtime.nativeEnabled = false;
  }

  return {
    onLoad() {
      runtime.stopped = false;

      // Absolutely no Metro lookup occurs in the immediate plugin startup path.
      // Ten seconds later, make one capability lookup and stop. No retry loop.
      runtime.startupTimer = setTimeout(() => {
        runtime.startupTimer = null;
        if (!runtime.stopped) enableNativeSwitcher();
      }, STARTUP_DELAY_MS);
    },

    onUnload() {
      cleanup();
    },

    settings: Settings,
  };
})()
