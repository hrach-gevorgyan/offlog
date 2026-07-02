package com.offlog.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

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
        handleWidgetIntent(getIntent());
    }

    // launchMode="singleTask" means tapping the widget while the app is
    // already running delivers here instead of onCreate().
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleWidgetIntent(intent);
    }

    // The Quick Add home-screen widget (QuickAddWidgetProvider, ROADMAP.md
    // B10) resolves to this activity with a com.offlog.app://quickadd URI.
    // Forwarded to the webview as a plain DOM event rather than handled
    // natively — QuickAdd is a Svelte component the JS side already owns;
    // App.svelte listens for 'offlogQuickAdd' on window.
    private void handleWidgetIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data != null && "quickadd".equals(data.getHost()) && getBridge() != null) {
            getBridge().triggerJSEvent("offlogQuickAdd", "window");
        }
    }
}
