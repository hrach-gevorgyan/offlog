package com.offlog.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

// The Quick Add home-screen widget (QuickAddWidgetProvider, ROADMAP.md B10)
// opens this activity with a com.offlog.app://quickadd VIEW intent. No
// custom intent handling needed here — Capacitor's own BridgeActivity
// already forwards onCreate()/onNewIntent()'s intent to every installed
// plugin (including @capacitor/app), which is what App.svelte's
// getLaunchUrl()/'appUrlOpen' listener reads. An earlier version of this
// class forwarded the intent manually via a custom triggerJSEvent() call
// in onCreate(), which fired before the WebView had loaded far enough to
// have a listener attached — losing the event on every cold start.
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
