package com.offlog.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

// OffologWidgetProvider opens this activity with a
// com.offlog.app://{quickadd,agenda,focus,dashboard} VIEW intent.
//
// Add no intent handling here. BridgeActivity already forwards
// onCreate()/onNewIntent()'s intent to every plugin, which is what
// App.svelte's getLaunchUrl()/'appUrlOpen' listener reads. Forwarding it
// by hand instead — a custom triggerJSEvent() in onCreate() — fires
// before the WebView has a listener attached and loses the event on every
// cold start.
//
// Widget taps faster than about once a second appear to show a stale
// screen. The intent is delivered and the JS flags flip correctly; it
// only needs a beat to settle. Don't add a reflow, WebView.invalidate()
// or visibility-toggle workaround for it.
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
