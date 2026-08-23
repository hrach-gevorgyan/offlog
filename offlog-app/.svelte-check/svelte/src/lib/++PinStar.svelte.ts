///<reference types="svelte" />
;function $$render() {

  // The task-pin star. One shared shape instead of the same polygon
  // hardcoded in CardDetail/KanbanBoard/ListView — keep all pin stars
  // visually identical by construction.
   let size = 11;
   let filled = true/*Ωignore_startΩ*/;filled = __sveltets_2_any(filled);/*Ωignore_endΩ*/;
   let stroked = false/*Ωignore_startΩ*/;stroked = __sveltets_2_any(stroked);/*Ωignore_endΩ*/; // CardDetail's toggle button keeps an outline even when unfilled
;
async () => {

 { svelteHTML.createElement("svg", {               "viewBox":`0 0 16 16`,"width":size,"height":size,"fill":filled ? 'currentColor' : 'none',"stroke":stroked ? 'currentColor' : 'none',"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
    { svelteHTML.createElement("polygon", { "points":`8,1.5 9.8,6 14.5,6.3 11,9.4 12.1,14 8,11.3 3.9,14 5,9.4 1.5,6.3 6.2,6`,});}
 }
};
return { props: {size: size , filled: filled , stroked: stroked} as {size?: typeof size, filled?: typeof filled, stroked?: typeof stroked}, exports: {}, bindings: "", slots: {}, events: {} }}
const PinStar__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type PinStar__SvelteComponent_ = InstanceType<typeof PinStar__SvelteComponent_>;
/*Ωignore_endΩ*/export default PinStar__SvelteComponent_;