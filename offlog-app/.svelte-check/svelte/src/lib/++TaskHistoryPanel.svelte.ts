///<reference types="svelte" />
;
import { getLogsForTask } from './db';
import { timeAgo, fmtFullTimestamp, ACTION_COLOR } from './utils';
import { describeField, hasRealChange } from './logFormat';
function $$render() {

  
  
  

   let taskId: string/*Ωignore_startΩ*/;taskId = __sveltets_2_any(taskId);/*Ωignore_endΩ*/;

  let history: Awaited<ReturnType<typeof getLogsForTask>> = [];
  let loaded = false;
  getLogsForTask(taskId).then(h => { history = h; loaded = true; });

  const ACTION_LABEL: Record<string, string> = { create: 'Created', update: 'Edited', move: 'Moved', delete: 'Deleted' };

  // FIELD_LABEL/describeField/hasRealChange used to be duplicated here
  // (drifted from logFormat.ts's copy — this file's describeField was
  // missing the 'name' rename case and hasRealChange was missing the
  // isEmpty() no-op filter logFormat.ts already got in its 2026-07-18
  // fix, so a no-op checklist/custom_values diff could still show a
  // false "Checklist updated"/"Custom fields updated" here after
  // TimeTravelView had already stopped showing it). Now imported from
  // logFormat.ts, the single source both views share — this panel keeps
  // its own simpler describeLog()/MAX_CLAUSES join below since its
  // create/move/delete phrasing is intentionally different (task-scoped,
  // no entity-type/who context needed).
  const MAX_CLAUSES = 3;

  function describeLog(log: any): string {
    if (log.action === 'create') return 'Task created';
    if (log.action === 'delete') return 'Task deleted';
    if (log.action === 'move') return `Moved from "${log.from}" to "${log.to}"`;
    if (log.diffs) {
      const clauses = Object.entries(log.diffs)
        .filter(([f, d]: [string, any]) => hasRealChange(f, d.from, d.to))
        .map(([f, d]: [string, any]) => describeField(f, d.from, d.to));
      if (clauses.length === 0) return 'Details updated';
      if (clauses.length > MAX_CLAUSES) {
        return clauses.slice(0, MAX_CLAUSES).join('; ') + `; +${clauses.length - MAX_CLAUSES} more change${clauses.length - MAX_CLAUSES === 1 ? '' : 's'}`;
      }
      return clauses.join('; ');
    }
    return 'Task updated';
  }

;
async () => {

 { svelteHTML.createElement("div", { "class":`history`,});
  if(!loaded){
     { svelteHTML.createElement("div", { "class":`history-empty`,}); { svelteHTML.createElement("span", { "class":`spinner`,}); }  }
  } else if (history.length === 0){
     { svelteHTML.createElement("div", { "class":`history-empty`,});   }
  }else{
       for(let log of __sveltets_2_ensureArray(history)){log._id;
       { svelteHTML.createElement("div", { "class":`history-row`,});
         { svelteHTML.createElement("span", {   "class":`h-pill`,"style":`background:color-mix(in srgb, ${ACTION_COLOR[log.action]} 13%, transparent); color:${ACTION_COLOR[log.action]}`,});ACTION_LABEL[log.action] ?? log.action; }
         { svelteHTML.createElement("span", { "class":`h-desc`,});describeLog(log); }
         { svelteHTML.createElement("span", { "class":`h-time-group`,});
          if(log.source){ { svelteHTML.createElement("span", { "class":`h-source`,});log.source; }}
           { svelteHTML.createElement("span", {   "class":`h-time`,"title":fmtFullTimestamp(log.ts),});timeAgo(log.ts); }
         }
       }
    }
  }
 }


};
return { props: {taskId: taskId} as {taskId: string}, exports: {}, bindings: "", slots: {}, events: {} }}
const TaskHistoryPanel__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type TaskHistoryPanel__SvelteComponent_ = InstanceType<typeof TaskHistoryPanel__SvelteComponent_>;
/*Ωignore_endΩ*/export default TaskHistoryPanel__SvelteComponent_;