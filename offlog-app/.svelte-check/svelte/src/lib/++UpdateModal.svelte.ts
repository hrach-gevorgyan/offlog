///<reference types="svelte" />
;
import { fade } from 'svelte/transition';
import { trapFocus } from './focusTrap';
import { dialogPop, scrimFade } from './motion';
import { updateState, showUpdateModal, downloadUpdate, installUpdate } from './updateChecker';
import { escapeHtml } from './utils';
function $$render() {
/*Ωignore_startΩ*/;let $updateState = __sveltets_2_store_get(updateState);;let $showUpdateModal = __sveltets_2_store_get(showUpdateModal);/*Ωignore_endΩ*/
  
  
  
  
  

  // Desktop-only (App.svelte only mounts this behind isTauri()). Shows
  // whichever phase updateChecker.ts's state machine is in — 'available'
  // (offer to download, with release notes), 'downloading' (progress
  // bar), 'ready' (offer to restart), or 'error'. Closing via Escape/
  // scrim/Later never cancels an in-flight download or a completed one —
  // it just hides the modal; the next open (banner click or "Check for
  // updates") picks up wherever the state machine actually is.
  function close() { showUpdateModal.set(false); }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  // The release notes body only ever uses the restricted subset
  // RELEASE_NOTES.md's own writing rule requires: `### Heading` and
  // `- bullet` lines, nothing else — this renders exactly that instead
  // of dumping the raw markdown text (previously shown literally,
  // "### New" and all, in a <pre> block). Escaped first since this ends
  // up in {@html}, even though the source is our own CHANGELOG-derived
  // text, not user input.
  //
  // Real bug, found live (2026-07-30): every entry in RELEASE_NOTES.md
  // soft-wraps a long bullet across multiple source lines (real Markdown
  // treats a following non-blank line as a continuation of the same list
  // item, and GitHub's own renderer handles this fine on the Releases
  // page) -- but this line-by-line parser didn't join continuation
  // lines back onto the current <li>, so a wrapped bullet got cut off
  // mid-sentence and its remainder appeared as a stray unbulleted
  // paragraph instead. A continuation line is now appended (with a
  // joining space) to the last <li> whenever one is open.
  function renderNotes(body: string): string {
    const lines = body.split('\n');
    let html = '';
    let inList = false;
    let lastLiText = '';
    const flushLi = () => { if (lastLiText) { html += `<li>${lastLiText}</li>`; lastLiText = ''; } };
    const closeList = () => { if (inList) { flushLi(); html += '</ul>'; inList = false; } };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { closeList(); continue; }
      const heading = line.match(/^###\s+(.*)/);
      if (heading) { closeList(); html += `<p class="notes-heading">${escapeHtml(heading[1])}</p>`; continue; }
      const bullet = line.match(/^[-*]\s+(.*)/);
      if (bullet) {
        flushLi();
        if (!inList) { html += '<ul>'; inList = true; }
        lastLiText = escapeHtml(bullet[1]);
        continue;
      }
      if (inList) { lastLiText += ' ' + escapeHtml(line); continue; }
      html += `<p>${escapeHtml(line)}</p>`;
    }
    closeList();
    return html;
  }
;
async () => {

 { svelteHTML.createElement("svelte:window", {   "on:keydown":onWindowKeydown,});}

if($showUpdateModal){
  
   { svelteHTML.createElement("div", {     "class":`update-scrim`,"on:click":close,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade))); }
   {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {       "class":`update-panel`,"role":`dialog`,"aria-modal":`true`,});__sveltets_2_ensureTransition(dialogPop(svelteHTML.mapElementTag('div')));
    if($updateState.phase === 'available'){
       { svelteHTML.createElement("p", { "class":`update-title`,}); $updateState.version;   }
      if($updateState.body){
         { svelteHTML.createElement("div", { "class":`update-notes`,}); renderNotes($updateState.body); }
      }
       { svelteHTML.createElement("div", { "class":`update-actions`,});
         { svelteHTML.createElement("button", {   "class":`later-btn`,"on:click":close,});  }
         { svelteHTML.createElement("button", {   "class":`primary-btn`,"on:click":downloadUpdate,});  }
       }
    } else if ($updateState.phase === 'downloading'){
       { svelteHTML.createElement("p", { "class":`update-title`,}); $updateState.version;  }
       { svelteHTML.createElement("div", { "class":`progress-track`,});
         { svelteHTML.createElement("div", {   "class":`progress-fill`,"style":`width: ${$updateState.progress ?? 0}%`,}); }
       }
       { svelteHTML.createElement("p", { "class":`update-hint`,});$updateState.progress ?? 0;  }
    } else if ($updateState.phase === 'ready'){
       { svelteHTML.createElement("p", { "class":`update-title`,}); $updateState.version;   }
       { svelteHTML.createElement("p", { "class":`update-hint`,});                   }
       { svelteHTML.createElement("div", { "class":`update-actions`,});
         { svelteHTML.createElement("button", {   "class":`later-btn`,"on:click":close,});  }
         { svelteHTML.createElement("button", {   "class":`primary-btn`,"on:click":installUpdate,});   }
       }
    } else if ($updateState.phase === 'error'){
       { svelteHTML.createElement("p", { "class":`update-title`,});  }
       { svelteHTML.createElement("p", { "class":`update-hint`,});$updateState.error; }
       { svelteHTML.createElement("div", { "class":`update-actions`,});
         { svelteHTML.createElement("button", {   "class":`primary-btn`,"on:click":close,});  }
       }
    }
   }}
}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {} }}
const UpdateModal__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type UpdateModal__SvelteComponent_ = InstanceType<typeof UpdateModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default UpdateModal__SvelteComponent_;