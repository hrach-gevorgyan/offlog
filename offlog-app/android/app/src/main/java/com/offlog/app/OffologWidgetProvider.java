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
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
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
