package com.offlog.app;

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
    }
}
