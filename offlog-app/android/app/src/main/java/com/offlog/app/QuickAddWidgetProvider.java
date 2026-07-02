package com.offlog.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

// Real home-screen widget (drag-and-drop from the widget picker), not the
// long-press launcher app shortcut this replaced — see ROADMAP.md B10.
// RemoteViews can't run app JS directly, so tapping the widget just opens
// MainActivity with the same com.offlog.app://quickadd URI the (now
// removed) static shortcut used; MainActivity.handleShortcutIntent() and
// App.svelte's 'offlogQuickAdd' listener need no changes to support this.
public class QuickAddWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            Intent intent = new Intent(context, MainActivity.class);
            intent.setAction(Intent.ACTION_VIEW);
            intent.setData(Uri.parse("com.offlog.app://quickadd"));
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            // Each widget instance needs a distinct request code, or Android
            // reuses a cached PendingIntent from another widget/notification
            // with the same intent shape and ignores this one's extras.
            PendingIntent pendingIntent = PendingIntent.getActivity(
                context, appWidgetId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_add);
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
