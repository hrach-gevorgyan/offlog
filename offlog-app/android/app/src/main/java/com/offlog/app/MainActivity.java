package com.offlog.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

// The combined home-screen widget (OffologWidgetProvider, B37) opens this
// activity with a com.offlog.app://{quickadd,agenda,focus,dashboard} VIEW
// intent depending on which part of the widget was tapped. No
// custom intent handling needed here — Capacitor's own BridgeActivity
// already forwards onCreate()/onNewIntent()'s intent to every installed
// plugin (including @capacitor/app), which is what App.svelte's
// getLaunchUrl()/'appUrlOpen' listener reads. An earlier version of this
// class forwarded the intent manually via a custom triggerJSEvent() call
// in onCreate(), which fired before the WebView had loaded far enough to
// have a listener attached — losing the event on every cold start.
//
// 2026-07-22: an apparent "widget tap shows stale screen" bug was deeply
// investigated here (remote WebView console attached, confirmed via
// logcat that every intent was delivered correctly and every JS reactive
// flag flipped correctly on every tap) and turned out not to be a real
// bug at all -- tapping widget buttons faster than about once a second
// just needs a beat to settle; normal one-tap-at-a-time use always
// worked. A JS-side forced reflow, a native WebView.invalidate(), and a
// visibility-toggle workaround were all tried in onNewIntent() and later
// removed once the real (non-)cause was found, to avoid carrying
// unnecessary native complexity for a symptom that didn't need fixing.
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Must be called before super.onCreate() — this is what actually
        // activates the androidx.core.splashscreen compat theme attributes
        // (windowSplashScreenBackground/AnimatedIcon in styles.xml) on API
        // levels below 31, and lets the splash stay on-screen until the
        // WebView content is ready instead of dismissing as soon as the
        // Activity window is created.
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
    }
}
