(() => {
  "use strict";

  const V = vendetta;
  const B = globalThis.bunny;
  if (!V?.patcher || !V?.metro?.common) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const VERSION = "1.5.0-shiggy";

  // Shiggy lazy proxies are created without resolving Discord modules. More
  // importantly, this plugin does not arm any patch during plugin startup.
  // Everything happens only after the user explicitly opens the account manager.
  const capability = B?.metro?.findByPropsLazy?.("getCanUseMultiAccountMobile") ?? null;
  const accountManager = B?.metro?.findByNameLazy?.("openManageAccountsModal") ?? null;

  let unpatch = null;
  let armed = false;

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

  function armNativeSwitcher() {
    if (unpatch) return true;
    if (!capability) return false;

    try {
      unpatch = V.patcher.after(
        "getCanUseMultiAccountMobile",
        capability,
        () => true,
      );
      armed = typeof unpatch === "function";
    } catch {
      unpatch = null;
      armed = false;
    }

    // Never enable inactive-account notifications.
    return armed;
  }

  function openAccountManager() {
    // First and only time the native account capability is touched is an
    // explicit user action, after Discord is already usable.
    armNativeSwitcher();

    try {
      if (typeof accountManager === "function") {
        accountManager();
        return;
      }

      const manager = V.metro?.findByName?.("openManageAccountsModal");
      if (typeof manager === "function") {
        manager();
        return;
      }
    } catch (error) {
      toast(`Could not open Discord Account Manager: ${error?.message ?? error}`);
      return;
    }

    toast("Discord's native account manager is unavailable on this build.");
  }

  function Settings() {
    const Pressable = RN.Pressable ?? RN.TouchableOpacity;

    return React.createElement(
      RN.ScrollView ?? RN.View,
      {
        style: { flex: 1, backgroundColor: C.bg },
        contentContainerStyle: { padding: 16, paddingBottom: 40, gap: 12 },
      },
      React.createElement(
        RN.View,
        { style: { backgroundColor: C.card, padding: 14, borderRadius: 12 } },
        React.createElement(RN.Text, {
          style: { color: C.text, fontSize: 18, fontWeight: "700" },
        }, "Account Switcher"),
        React.createElement(RN.Text, {
          style: {
            color: armed ? C.green : C.muted,
            marginTop: 6,
            fontSize: 13,
            fontWeight: "700",
          },
        }, armed ? "Native multi-account patch active" : "Idle until you open the account manager"),
        React.createElement(RN.Text, {
          style: { color: C.muted, marginTop: 7, fontSize: 12, lineHeight: 17 },
        }, "Zero-startup-hook build: no patching, Metro resolution, polling, timers, settings injection, direct switching, or notification override occurs when Shiggy starts."),
      ),
      React.createElement(
        Pressable,
        {
          onPress: openAccountManager,
          style: {
            backgroundColor: C.brand,
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderRadius: 9,
            alignItems: "center",
          },
        },
        React.createElement(RN.Text, {
          style: { color: C.text, fontWeight: "700", fontSize: 14 },
        }, "Open Discord Account Manager"),
      ),
      React.createElement(RN.Text, {
        style: { color: C.muted, fontSize: 12 },
      }, `v${VERSION}`),
    );
  }

  return {
    onLoad() {
      // Intentionally empty. Account Switcher must never participate in the
      // Discord/Shiggy startup path.
    },
    onUnload() {
      try { unpatch?.(); } catch {}
      unpatch = null;
      armed = false;
    },
    settings: Settings,
  };
})()
