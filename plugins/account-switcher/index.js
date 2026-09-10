(() => {
  "use strict";

  const V = vendetta;
  const B = globalThis.bunny;
  if (!V?.metro?.common) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const VERSION = "1.6.0-shiggy";

  // Shiggy's lazy finder does not resolve this Discord module until the user
  // actually presses the button. We deliberately do NOT patch
  // getCanUseMultiAccountMobile at all.
  const accountManager = B?.metro?.findByNameLazy?.("openManageAccountsModal") ?? null;

  const C = {
    bg: "#111214",
    card: "#1e1f22",
    text: "#f2f3f5",
    muted: "#b5bac1",
    brand: "#5865f2",
  };

  function toast(text) {
    try { V.ui?.toasts?.showToast?.(String(text)); } catch {}
  }

  function openAccountManager() {
    try {
      if (typeof accountManager === "function") {
        accountManager();
        return;
      }

      // Fallback is only attempted from an explicit user press.
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
          style: { color: C.muted, marginTop: 7, fontSize: 12, lineHeight: 17 },
        }, "Modal-only build. It opens Discord's own account manager directly and does not patch the multi-account capability, notification behavior, settings list, or account-switch action."),
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
    onLoad() {},
    onUnload() {},
    settings: Settings,
  };
})()