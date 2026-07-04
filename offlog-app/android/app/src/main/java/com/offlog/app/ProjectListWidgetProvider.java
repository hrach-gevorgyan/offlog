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

// Third home-screen widget (ROADMAP.md B31) — up to 4 project rows, data
// supplied by OffologWidgetPlugin.updateProjects(). Unlike the other two
// widgets, each row has its OWN PendingIntent (opens that specific
// project via com.offlog.app://project?id=<id>) rather than one intent
// for the whole widget — RemoteViews supports per-child-view
// setOnClickPendingIntent without needing a full RemoteViewsService/
// adapter, which would be overkill for a fixed 4-row list.
public class ProjectListWidgetProvider extends AppWidgetProvider {
    private static final int[] ROW_IDS = { R.id.project_row_1, R.id.project_row_2, R.id.project_row_3, R.id.project_row_4 };

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(OffologWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String json = prefs.getString(OffologWidgetPlugin.KEY_PROJECTS, "[]");
        JSONArray items;
        try {
            items = new JSONArray(json);
        } catch (Exception e) {
            items = new JSONArray();
        }

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_project_list);

            if (items.length() == 0) {
                views.setTextViewText(ROW_IDS[0], "No projects yet");
                for (int i = 1; i < ROW_IDS.length; i++) views.setViewVisibility(ROW_IDS[i], View.GONE);
            } else {
                for (int i = 0; i < ROW_IDS.length; i++) {
                    if (i >= items.length()) { views.setViewVisibility(ROW_IDS[i], View.GONE); continue; }
                    JSONObject item = items.optJSONObject(i);
                    if (item == null) { views.setViewVisibility(ROW_IDS[i], View.GONE); continue; }
                    views.setViewVisibility(ROW_IDS[i], View.VISIBLE);
                    views.setTextViewText(ROW_IDS[i], item.optString("name", ""));

                    Intent intent = new Intent(context, MainActivity.class);
                    intent.setAction(Intent.ACTION_VIEW);
                    intent.setData(Uri.parse("com.offlog.app://project?id=" + Uri.encode(item.optString("id", ""))));
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    // Request code combines widget id + row index so every
                    // row of every widget instance gets its own distinct
                    // PendingIntent — otherwise Android reuses/overwrites a
                    // cached one with the same shape, same reasoning as the
                    // other two widget providers.
                    PendingIntent pendingIntent = PendingIntent.getActivity(
                        context, appWidgetId * 10 + i, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );
                    views.setOnClickPendingIntent(ROW_IDS[i], pendingIntent);
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
