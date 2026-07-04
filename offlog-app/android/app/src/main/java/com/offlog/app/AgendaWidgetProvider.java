package com.offlog.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

// Read-only "what's due soon" widget (ROADMAP.md B20) — up to 3 rows, data
// supplied by OffologWidgetPlugin.updateAgenda() (see its header comment:
// task data lives in the WebView's JS side, not natively). Tapping
// anywhere opens Offlog straight into the Agenda view, same
// one-PendingIntent-for-the-whole-widget pattern as QuickAddWidgetProvider.
public class AgendaWidgetProvider extends AppWidgetProvider {
    private static final int[] ROW_IDS = { R.id.agenda_row_1, R.id.agenda_row_2, R.id.agenda_row_3 };
    private static final int[] TITLE_IDS = { R.id.agenda_title_1, R.id.agenda_title_2, R.id.agenda_title_3 };
    private static final int[] DUE_IDS = { R.id.agenda_due_1, R.id.agenda_due_2, R.id.agenda_due_3 };

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(OffologWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String json = prefs.getString(OffologWidgetPlugin.KEY_AGENDA, "[]");
        JSONArray items;
        try {
            items = new JSONArray(json);
        } catch (Exception e) {
            items = new JSONArray();
        }

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_agenda);

            Intent intent = new Intent(context, MainActivity.class);
            intent.setAction(Intent.ACTION_VIEW);
            intent.setData(Uri.parse("com.offlog.app://agenda"));
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            // Same distinct-request-code-per-widget-instance reasoning as
            // QuickAddWidgetProvider — a shared PendingIntent shape across
            // widget instances gets deduplicated/reused by Android otherwise.
            PendingIntent pendingIntent = PendingIntent.getActivity(
                context, appWidgetId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

            if (items.length() == 0) {
                views.setViewVisibility(ROW_IDS[0], View.VISIBLE);
                views.setTextViewText(TITLE_IDS[0], "No upcoming tasks");
                views.setTextViewText(DUE_IDS[0], "");
                views.setViewVisibility(ROW_IDS[1], View.GONE);
                views.setViewVisibility(ROW_IDS[2], View.GONE);
            } else {
                for (int i = 0; i < ROW_IDS.length; i++) {
                    if (i < items.length()) {
                        JSONObject item = items.optJSONObject(i);
                        views.setViewVisibility(ROW_IDS[i], View.VISIBLE);
                        views.setTextViewText(TITLE_IDS[i], item != null ? item.optString("title", "") : "");
                        views.setTextViewText(DUE_IDS[i], item != null ? item.optString("due", "") : "");
                    } else {
                        views.setViewVisibility(ROW_IDS[i], View.GONE);
                    }
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
