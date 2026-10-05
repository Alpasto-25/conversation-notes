import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { emptyConversation, moveNotebook, newNotebook, organizeNotebook, summarizeNotebook } from "../src/notebooks";
import { createNotebookStore } from "../src/storage";
import { sharedMessages, shareText, type ShareSource } from "../src/share-content";
import { imagePages } from "../src/share-image-pages";
import { MODEL_OPTIONS, normalizeModel, supportsModel } from "../shared/models";

function fixture(): ShareSource {
  const conversation = emptyConversation("friend");
  conversation.self="private-self"; conversation.other="private-other";
  conversation.messages=[
    { id:"a",sender:"self",text:"合成消息 A\n下一行 👨‍👩‍👧‍👦",timestamp:"2026-10-05 16:00",kind:"text" },
    { id:"b",sender:"other",text:"未选择的私密消息 B",timestamp:null,kind:"text" },
    { id:"c",sender:"other",text:"合成消息 C，收到。",timestamp:null,kind:"text" },
    { id:"d",sender:"other",text:"还没分析的消息",timestamp:null,kind:"text" },
  ];
  conversation.lines={
    a:{id:"a",score:{value:90,confidence:.8,status:"clear",probabilities:{"4":.2,"5":.8}},tone:"neutral",tones:{neutral:.9,warm:.1}},
    b:{id:"b",score:{value:null,confidence:0,status:"insufficient",probabilities:{}},emotions:{sad:1}},
    c:{id:"c",score:{value:null,confidence:0,status:"insufficient",probabilities:{}},emotions:{calm:.7,happy:.2,unknown:.08,sad:.02},intents:{acknowledge:.8,answer:.2},event:{kind:"confirmation",confidence:.9}},
  };
  conversation.events={c:{id:"c",kind:"confirmation",confidence:.9,status:"resolved",resolvedBy:"unselected-event-id"}};
  conversation.analysisIdentity={provider:"deepseek",model:"historical-saved-model"};
  conversation.analysisUsage={input_tokens:99,output_tokens:9,requests:1,elapsed_ms:100,local_targets:0,details:[{task:"overview",repair:false,model:"usage-secret-model",prompt_family:"rule",started_at:"",finished_at:"",elapsed_ms:100,request_id:"private-request-id",input_tokens:99,output_tokens:9}]};
  return {title:"private-notebook-title",conversation};
}
test("moving notebooks changes only organization and keeps every scene, draft, model and analysis", async () => {
  const factory=new IDBFactory(), store=createNotebookStore(factory), source=fixture();
  const a={...newNotebook(source.conversation,"A"),draft:"未导入草稿",scenes:{friend:source.conversation,general:emptyConversation()}}, b=newNotebook(source.conversation,"B"), untouched=newNotebook(source.conversation,"C");
  await store.save(a,true); await store.save(b); await store.save(untouched); await store.recycle(b.id);
  const recycled=await store.load(b.id);
  await store.move([a.id,b.id,a.id,"missing"],"colleague","工作资料");
  const moved=(await store.load(a.id))!;
  assert.equal(moved.id,a.id); assert.equal(moved.createdAt,a.createdAt); assert.equal(moved.title,a.title);
  assert.equal(moved.folderRelation,"colleague"); assert.equal(moved.contact,"工作资料"); assert.equal(moved.draft,a.draft);
  assert.deepEqual(moved.conversation,a.conversation); assert.deepEqual(moved.scenes,a.scenes);
  assert.deepEqual(await store.load(b.id),recycled); assert.deepEqual(await store.load(untouched.id),untouched);
  assert.equal(summarizeNotebook(moved).relation,"colleague"); assert.equal(summarizeNotebook(untouched).relation,"friend");
  assert.equal((await store.loadLibrary()).active!.id,a.id);
  const switched=organizeNotebook(moved,moved.title,moved.contact,"general");
  assert.equal(switched.folderRelation,"colleague"); assert.deepEqual(organizeNotebook(switched,switched.title,switched.contact,"friend").conversation,source.conversation);
  await store.close(); const restarted=createNotebookStore(factory);
  assert.deepEqual(await restarted.load(a.id),moved); await restarted.close();
});
test("multi-note move commits atomically and preserves unselected folders", async () => {
  const store=createNotebookStore(new IDBFactory()), a=newNotebook(), b=newNotebook();
  await store.save(a,true); await store.save(b);
  await store.move([a.id,b.id],"family","家人");
  const library=await store.loadLibrary(); assert.equal(library.items.length,2);
  assert.ok(library.items.every(note=>note.relation==="family"&&note.contact==="家人"));
  assert.equal(library.active!.id,a.id); await store.close();
});
test("sharing exports only the ordered selected messages and their saved results, with no hidden history or usage", () => {
  const source=fixture(), before=JSON.stringify(source), selected=sharedMessages(source,["c","a","a","missing"]);
  assert.deepEqual(selected.map(entry=>entry.number),[1,3]);
  const text=shareText(source,["c","a"]);
  assert.ok(text.indexOf("消息 #1")<text.indexOf("消息 #3"));
  assert.match(text,/historical-saved-model/); assert.match(text,/合成消息 A\n下一行 👨‍👩‍👧‍👦/);
  assert.match(text,/难判断 8%/); assert.match(text,/难过 2%/); assert.match(text,/事件状态：已解决/);
  assert.doesNotMatch(text,/未选择的私密消息|private-self|private-other|private-notebook-title|private-request-id|usage-secret-model|unselected-event-id/);
  assert.equal(JSON.stringify(source),before);
  assert.match(shareText(source,["a","c"],false),/private-self/);
});
test("incomplete and skipped analysis is shown explicitly without inventing judgments", () => {
  const source=fixture(); source.conversation.lines.d={id:"d",skipped:"无法读取",score:{value:null,confidence:0,status:"insufficient",probabilities:{}}};
  assert.match(shareText(source,["d"]),/未评分：无法读取/);
  delete source.conversation.lines.d; assert.match(shareText(source,["d"]),/未分析/);
});
test("UI image pagination preserves complete message pixels, prefers whole rows and breaks oversized bubbles between lines", () => {
  const messages = [{ id: "first", height: 200, breaks: [] }, { id: "long", height: 2210, breaks: [480, 960, 1440, 1920] }, { id: "last", height: 270, breaks: [] }];
  const pages = imagePages(messages, 1000);
  assert.equal(pages[0].slices.length, 1); assert.equal(pages[1].height, 960);
  for (const page of pages) assert.ok(page.height <= 1000);
  for (const message of messages) {
    const slices = pages.flatMap(page => page.slices).filter(slice => slice.id === message.id);
    let consumed = 0;
    for (const slice of slices) { assert.equal(slice.offset, consumed); consumed += slice.height; }
    assert.equal(consumed, message.height);
  }
  assert.deepEqual(imagePages([], 1000), []);
});
test("Pro is removed from model options and legacy settings normalize to Flash only for DeepSeek", () => {
  assert.ok(MODEL_OPTIONS.every(option=>!option.model.includes("pro")));
  assert.equal(supportsModel("deepseek","deepseek-v4-pro"),false);
  assert.equal(normalizeModel("deepseek","deepseek-v4-pro"),"deepseek-flash");
  assert.equal(normalizeModel("typesafe","deepseek-v4-pro"),"deepseek-v4-pro");
});
