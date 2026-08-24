package com.offlog.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

// Single combined home-screen widget: 3 static action buttons (Focus /
// Quick Add / Dashboard), no dynamic data. No SharedPreferences read and
// no JS-side data bridge — this widget never changes appearance, only
// what it opens.
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
        // SINGLE_TOP is required. NEW_TASK | CLEAR_TOP alone can bring the
        // already-running singleTask activity to the foreground without
        // delivering a fresh onNewIntent() on some OEM builds.
        //
        // Do not substitute CLEAR_TASK: it breaks Quick Add entirely under
        // OEM singleTask handling.
        //
        // Changing these flags requires the widget to be REMOVED and
        // re-added, not just the app reinstalled — updatePeriodMillis="0"
        // means onUpdate() only runs when an instance is first placed.
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
