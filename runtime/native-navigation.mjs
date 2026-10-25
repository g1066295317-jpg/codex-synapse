// Serialized read/retry action scoped to the native lock notice. This never
// enables a disabled composer or bypasses native ownership checks.
export function nativeHandoffState(id,retry=false){
 const sameThread=window.__codexSynapse?.getLayout().threadId===id;
 const main=[...document.querySelectorAll('main[data-app-shell-main-surface]')].find(e=>e.getBoundingClientRect().width>10);
 const lock=/已在另一个应用中打开|在其他应用中打开|(?:opened?|open) in another app|another application/i;
 const button=main&&[...main.querySelectorAll('button')].find(e=>/^(重试|Retry)$/i.test(e.textContent.trim())&&[e.parentElement,e.parentElement?.parentElement,e.parentElement?.parentElement?.parentElement].some(parent=>parent&&lock.test(parent.textContent)));
 if(sameThread&&button&&retry&&!button.disabled)button.click();
 return{sameThread,locked:!!button};
}
