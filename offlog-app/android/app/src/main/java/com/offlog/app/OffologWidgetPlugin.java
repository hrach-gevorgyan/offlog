package com.offlog.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Bridges live app data — agenda items, project list — to the two
// read-only home-screen widgets (AgendaWidgetProvider, B20;
// ProjectListWidgetProvider, B31). Necessary because that data lives
// entirely in the WebView's JS-side PouchDB and is never natively
// accessible; there's no native DB this Java code could query on its own
// periodic timer. Instead, src/lib/widgetBridge.ts calls this plugin
// after every store reload (init + every live sync/local change) with a
// freshly computed JSON snapshot; this plugin persists it to
// SharedPreferences (which survives the app being killed — the widget
// host can call back into the providers at any time) and immediately
// asks AppWidgetManager to redraw every existing instance of both
// widgets, rather than waiting on a fixed `updatePeriodMillis` poll that
// would just re-render the same stale data anyway.
@CapacitorPlugin(name = "OffologWidget")
public class OffologWidgetPlugin extends Plugin {
    public static final String PREFS = "offlog_widget_prefs";
    public static final String KEY_AGENDA = "agenda_items";
    public static final String KEY_PROJECTS = "project_items";

    @PluginMethod
    public void updateAgenda(PluginCall call) {
        String items = call.getString("items", "[]");
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_AGENDA, items).apply();
        requestRedraw(AgendaWidgetProvider.class);
        call.resolve();
    }

    @PluginMethod
    public void updateProjects(PluginCall call) {
        String items = call.getString("items", "[]");
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_PROJECTS, items).apply();
        requestRedraw(ProjectListWidgetProvider.class);
        call.resolve();
    }

    private void requestRedraw(Class<?> providerClass) {
        Context context = getContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, providerClass));
        if (ids.length == 0) return; // no instance of this widget on any home screen — nothing to redraw
        Intent intent = new Intent(context, providerClass);
        intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(intent);
    }
}
