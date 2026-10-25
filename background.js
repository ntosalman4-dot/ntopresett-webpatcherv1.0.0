const ext = globalThis.browser ?? globalThis.chrome;
const act = ext.action ?? ext.browserAction;

act.onClicked.addListener(async () => {
  const url = ext.runtime.getURL("app.html");
  let tabs = [];
  try { tabs = await ext.tabs.query({url}); } catch (e) {}
  if (!tabs.length) {
    try { tabs = (await ext.tabs.query({})).filter(t => t.url && t.url.startsWith(url)); } catch (e) {}
  }
  if (tabs.length && tabs[0].id) {
    await ext.tabs.update(tabs[0].id, {active: true});
    return;
  }
  await ext.tabs.create({url});
});
