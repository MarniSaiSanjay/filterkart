// FilterCart background service worker.
// Message handlers (save/list/apply/delete) and tab navigation are implemented in WI-10.

chrome.runtime.onInstalled.addListener(() => {
  console.log("FilterCart installed");
});
