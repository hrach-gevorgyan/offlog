package com.offlog.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

// Single combined home-screen widget (B37 redesign, 2026-07-09) — 3 static
// action buttons (Focus / Quick Add / Dashboard), no dynamic data at all
// per owner direction ("no text information, just 3 buttons"). No
// SharedPreferences read, no JS-side data bridge needed — this widget
// never changes appearance, only what it opens.
public class OffologWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_offlog);

            views.setOnClickPendingIntent(R.id.btn_focus, pendingIntentFor(context, appWidgetId, "focus", 1));
            views.setOnClickPendingIntent(R.id.btn_quickadd, pendingIntentFor(context, appWidgetId, "quickadd", 2));
            views.setOnClickPendingIntent(R.id.btn_dashboard, pendingIntentFor(context, appWidgetId, "dashboard", 3));

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    private PendingIntent pendingIntentFor(Context context, int appWidgetId, String host, int slot) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("com.offlog.app://" + host));
        // Real bug found 2026-07-21 (owner live-testing on a Samsung/OneUI
        // device): NEW_TASK | CLEAR_TOP alone, without SINGLE_TOP, could
        // bring the already-running singleTask activity to the foreground
        // without reliably delivering a fresh onNewIntent() call on some
        // OEM Android builds. SINGLE_TOP is the standard fix for that.
        //
        // 2026-07-22: a follow-up "widget tap shows stale screen" report
        // was deeply investigated (remote WebView console attached) and
        // turned out not to be a real bug -- every intent was delivered
        // correctly and every JS reactive flag flipped correctly on every
        // tap; the symptom only appeared when tapping faster than about
        // once a second, which just needs a beat to settle. CLEAR_TASK was
        // tried as a fix and made things measurably worse (broke Quick Add
        // entirely, inconsistent under this OEM's singleTask handling) --
        // reverted back to SINGLE_TOP, which was correct all along.
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // Each button needs its own distinct PendingIntent request code, or
        // Android reuses a cached one with the same intent shape and the
        // wrong target fires — same reasoning as every other widget
        // provider in this app.
        return PendingIntent.getActivity(
            context, appWidgetId * 10 + slot, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
