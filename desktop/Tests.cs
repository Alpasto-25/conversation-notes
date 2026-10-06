using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace ConversationNotes
{
    internal static class DesktopTests
    {
        private static int checks;
        private static void Check(bool ok, string name)
        {
            if (!ok) throw new Exception("Test failed: " + name);
            checks++;
        }
        private static Dictionary<string, object> Input(string provider, string key)
        { return new Dictionary<string, object> { { "provider", provider }, { "apiKey", key } }; }
        private static void Reject(Action action, int status, string name)
        {
            try { action(); throw new Exception("Expected rejection: " + name); }
            catch (ApiException error) { Check(error.Status == status, name); }
        }
        private static readonly string TestKey = "unit-test-not-a-real-key-" + Guid.NewGuid().ToString("N");
        private sealed class FakeHttp : HttpMessageHandler
        {
            internal Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> Run;
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) { return Run(request, token); }
        }
        private static Dictionary<string, object> Payload()
        {
            return new Dictionary<string, object> {
                { "state", "This is only an offline unit test." },
                { "questions", new Dictionary<string, object> { { "a", new { type = "noul", instructions = "Test" } } } }
            };
        }
        private static Dictionary<string, object> StructuredPayload()
        {
            // Match the actual WebView message, including object state and instructions.
            Dictionary<string, object> wire = Json.Decode("{\"id\":\"00000000-0000-0000-0000-000000000001\",\"method\":\"evaluate\",\"payload\":{\"state\":{\"relationship\":\"普通沟通\",\"messages\":[{\"id\":\"0\",\"sender\":\"other\",\"text\":\"你好\"},{\"id\":\"1\",\"sender\":\"self\",\"text\":\"收到\"}]},\"questions\":{\"a\":{\"type\":\"noul\",\"instructions\":{\"question\":\"Test\",\"continuation\":[]}}}}}");
            return (Dictionary<string, object>)wire["payload"];
        }
        private static async Task Run(string folder)
        {
            Dictionary<string, object> export = new Dictionary<string, object> { { "action", "save" }, { "format", "txt" }, { "name", "conversation-notes-20261005-173000.txt" }, { "data", Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("合成对话片段\n已有分析 👋")) } };
            Check(System.Text.Encoding.UTF8.GetString(NoteExport.Decode(export)) == "合成对话片段\n已有分析 👋", "TXT export preserves UTF-8 and newlines");
            foreach (string invalidName in new[] { "../config.dpapi", "C:\\private.txt", "conversation-notes-20261005-173000.png", "conversation-notes-20261005-173000.txt.exe" }) {
                var invalid = new Dictionary<string, object>(export); invalid["name"] = invalidName;
                Reject(() => NoteExport.Decode(invalid), 400, "export rejects paths and incompatible extensions");
            }
            foreach (string invalidData in new[] { "!invalid", "", "/w==", new string('A', 1866672) }) {
                var invalid = new Dictionary<string, object>(export); invalid["data"] = invalidData;
                Reject(() => NoteExport.Decode(invalid), 400, "export rejects malformed, oversized or non-UTF8 content");
            }
            using (var bitmap = new System.Drawing.Bitmap(1080, 2600)) using (var stream = new MemoryStream()) {
                bitmap.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
                var picture = new Dictionary<string, object>(export); picture["format"] = "png"; picture["name"] = "conversation-notes-20261005-173000-p1.png"; picture["data"] = Convert.ToBase64String(stream.ToArray());
                Check(NoteExport.Decode(picture).Length == stream.Length, "PNG export accepts a complete bounded card");
                picture["data"] = export["data"]; Reject(() => NoteExport.Decode(picture), 400, "PNG export rejects disguised text");
            }
            ConfigStore store = new ConfigStore(folder);
            string[] official = new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<string[]>(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "official-links.json")));
            foreach (string link in official) Check(OfficialLinks.IsAllowed(link, official), "official link allowed");
            foreach (string link in new[] { "https://example.com", "http://console.typesafe.ai/keys", "javascript:alert(1)", "file:///C:/Windows", "https://console.typesafe.ai.evil.example/keys", "https://console.typesafe.ai/keys?apiKey=synthetic", "https://console.typesafe.ai/keys#private", "https://user@console.typesafe.ai/keys" })
                Check(!OfficialLinks.IsAllowed(link, official), "non-official or modified link rejected");
            Check(!Json.Encode(store.Status()).Contains("apiKey"), "status never includes key");
            Check(Json.Encode(store.Status()).Contains("false"), "empty configuration");
            store.Configure(Input("typesafe", TestKey));
            Check(Json.Text(store.Read(), "apiKey") == TestKey, "DPAPI round trip");
            Check(!System.Text.Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(folder, "config.dpapi"))).Contains(TestKey), "no plaintext key on disk");
            Check(!Json.Encode(store.Status()).Contains(TestKey), "configured status does not leak key");
            store.Configure(Input("typesafe", ""));
            Check(Json.Text(store.Read(), "apiKey") == TestKey, "blank retains same-provider key");
            string deepKey = "synthetic-deepseek-key";
            store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", deepKey }, { "model", "deepseek-flash" } });
            store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", "" }, { "model", "deepseek-v4-pro" } });
            Check(Json.Text(store.Read(), "apiKey") == deepKey && Json.Text(store.Read(), "model") == "deepseek-flash", "removed Pro migrates to Flash and keeps its own key");
            ConfigStore restarted = new ConfigStore(folder);
            Check(Json.Text(restarted.Read(), "model") == "deepseek-flash", "Flash migration persists across restart");
            var legacyPro = store.Read(); legacyPro["model"] = "deepseek-v4-pro";
            ((Dictionary<string, object>)((Dictionary<string, object>)legacyPro["profiles"])["deepseek"])["model"] = "deepseek-v4-pro";
            byte[] legacyCipher = System.Security.Cryptography.ProtectedData.Protect(System.Text.Encoding.UTF8.GetBytes(Json.Encode(legacyPro)), System.Text.Encoding.UTF8.GetBytes("conversation-notes-windows-v1"), System.Security.Cryptography.DataProtectionScope.CurrentUser);
            File.WriteAllBytes(Path.Combine(folder, "config.dpapi"), legacyCipher);
            Check(Json.Text(Json.Decode(Json.Encode(store.Status())), "model") == "deepseek-flash", "legacy stored Pro status uses Flash");
            Check(Convert.ToBase64String(File.ReadAllBytes(Path.Combine(folder, "config.dpapi"))) == Convert.ToBase64String(legacyCipher), "reading legacy Pro status does not rewrite encrypted configuration");
            store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", "" } });
            Check(!Json.Encode(store.Status()).Contains(deepKey) && !Json.Encode(store.Status()).Contains(TestKey), "profile summaries never return keys");
            string beforeInvalid = Convert.ToBase64String(File.ReadAllBytes(Path.Combine(folder, "config.dpapi")));
            Reject(() => store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", "" }, { "model", "jev-1.13.0" } }), 400, "wrong-provider model rejected");
            Check(Convert.ToBase64String(File.ReadAllBytes(Path.Combine(folder, "config.dpapi"))) == beforeInvalid, "invalid switch leaves saved config intact");
            store.Configure(Input("typesafe", ""));
            Check(Json.Text(store.Read(), "apiKey") == TestKey, "switching back restores the Jev key");
            store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", deepKey }, { "activate", false } });
            Check(Json.Text(store.Read(), "provider") == "typesafe" && Json.Text(store.Read(), "apiKey") == TestKey, "secondary DeepSeek save retains active Jev provider and key");
            Check(Json.Text(store.SemanticConfig(), "apiKey") == deepKey && Json.Text(store.SemanticConfig(), "provider") == "deepseek", "secondary request reads its own saved profile");
            store.Configure(Input("deepseek", ""));
            Check(Json.Text(store.ProviderConfig("typesafe"), "apiKey") == TestKey, "dual mode reads saved Jev key while DeepSeek is active");
            Check(Json.Text(store.Read(), "provider") == "deepseek", "reading dual-mode Jev config never switches saved active provider");
            Check(Json.Text(store.ProviderConfig("deepseek"), "apiKey") == deepKey, "DeepSeek-only mode reads its own saved key");
            Reject(() => store.ProviderConfig("unsupported"), 400, "routed primary accepts only fixed providers");
            store.Configure(Input("typesafe", ""));
            Reject(() => store.Configure(new Dictionary<string, object> { { "provider", "openrouter" }, { "apiKey", "synthetic-key" }, { "activate", false } }), 400, "secondary config cannot select arbitrary providers");
            string legacyFolder = Path.Combine(folder, "legacy");
            ConfigStore legacy = new ConfigStore(legacyFolder);
            byte[] legacyBytes = System.Security.Cryptography.ProtectedData.Protect(System.Text.Encoding.UTF8.GetBytes(Json.Encode(new { provider = "typesafe", apiKey = TestKey })),
                System.Text.Encoding.UTF8.GetBytes("conversation-notes-windows-v1"), System.Security.Cryptography.DataProtectionScope.CurrentUser);
            File.WriteAllBytes(Path.Combine(legacyFolder, "config.dpapi"), legacyBytes);
            Check(Json.Encode(legacy.Status()).Contains("jev-1.13.0"), "legacy encrypted configuration remains readable");
            Check(Convert.ToBase64String(File.ReadAllBytes(Path.Combine(legacyFolder, "config.dpapi"))) == Convert.ToBase64String(legacyBytes), "reading legacy status never rewrites the encrypted file");
            Reject(() => legacy.SemanticConfig(), 503, "missing secondary key never borrows a legacy Jev key");
            legacy.Configure(Input("deepseek", deepKey)); legacy.Configure(Input("typesafe", ""));
            Check(Json.Text(legacy.Read(), "apiKey") == TestKey, "legacy key migrated without re-entry and retained after switching");
            Reject(() => store.Configure(Input("openrouter", "")), 400, "provider switch needs its own key");
            foreach (string key in new[] { "Bearer abc", "JEV_API_KEY=abc", "your_key", "xxx", "'abc'", "abc\nxyz", new string('a', 4097) })
                Reject(() => store.Configure(Input("typesafe", key)), 400, "invalid key rejected");
            Reject(() => store.Configure(Input("typesafe", "sk-or-not-real")), 400, "platform mismatch");
            Reject(() => store.Configure(Input("unknown", TestKey)), 400, "unknown provider");
            string fixture = Path.Combine(folder, "fixture.env");
            File.WriteAllText(fixture, "# fixture contains only a synthetic key\nJEV_PROVIDER=typesafe\nJEV_API_KEY=\"" + TestKey + "\" # comment\n");
            string original = File.ReadAllText(fixture);
            store.Import(fixture);
            Check(File.ReadAllText(fixture) == original && Json.Text(store.Read(), "apiKey") == TestKey, "env import preserves source");
            File.WriteAllBytes(Path.Combine(folder, "config.dpapi"), new byte[] { 1, 2, 3 });
            Reject(() => store.Read(), 503, "corrupt config is not silently discarded");
            store.Configure(Input("typesafe", TestKey));
            Check(Json.Text(store.Read(), "apiKey") == TestKey, "explicit replacement repairs config");
            foreach (string provider in new[] { "typesafe", "vercel", "openrouter" })
                Check(ModelClient.Endpoint(provider).StartsWith("https://"), "fixed HTTPS endpoint");
            FakeHttp handler = new FakeHttp();
            handler.Run = async (request, token) => {
                Check(request.RequestUri.AbsoluteUri == ModelClient.Endpoint("typesafe"), "native endpoint");
                Check(request.Headers.Authorization.Scheme == "Bearer" && request.Headers.Authorization.Parameter == TestKey, "native authorization");
                Check((await request.Content.ReadAsStringAsync()).Contains(ConfigStore.Model("typesafe")), "native model");
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"model\":\"offline-test\",\"answers\":{},\"usage\":{\"input_tokens\":0,\"output_tokens\":0}}") };
            };
            using (ModelClient client = new ModelClient(store, new HttpClient(handler)))
            {
                Check(Json.Encode(await client.Evaluate(Payload(), CancellationToken.None)).Contains("offline-test"), "offline native transport");
                Check(Json.Encode(await client.Evaluate(StructuredPayload(), CancellationToken.None)).Contains("offline-test"), "actual WebView structured analysis payload accepted");
                foreach (string provider in new[] { "typesafe", "vercel", "openrouter" })
                {
                    store.Configure(Input(provider, TestKey));
                    Dictionary<string, object> structured = StructuredPayload();
                    handler.Run = async (request, token) => {
                        Dictionary<string, object> sent = Json.Decode(await request.Content.ReadAsStringAsync());
                        Check(request.RequestUri.AbsoluteUri == ModelClient.Endpoint(provider), "structured request provider endpoint");
                        Check(Json.Text(sent, "model") == ConfigStore.Model(provider), "structured request provider model");
                        Check(sent["state"] is Dictionary<string, object>, "state remains a JSON object, not a string");
                        Check(Json.Encode(sent["state"]) == Json.Encode(structured["state"]), "all structured context fields preserved");
                        Check(Json.Encode(sent["questions"]) == Json.Encode(structured["questions"]), "structured instructions preserved");
                        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"model\":\"offline-test\",\"answers\":{},\"usage\":{\"input_tokens\":0,\"output_tokens\":0}}") };
                    };
                    Check(Json.Encode(await client.Evaluate(structured, CancellationToken.None)).Contains("offline-test"), "structured analysis succeeds for provider");
                }
                store.Configure(Input("typesafe", TestKey));
                Dictionary<string, object> weightQuestions = Json.Decode("{\"quality\":{\"type\":\"score\",\"instructions\":\"Rate quality\",\"criteria\":[\"low\",\"mid\",\"high\"]}}");
                Dictionary<string, object> weightRequest = Json.Decode(Json.Encode(ModelClient.DeepseekRequest(StructuredPayload()["state"], weightQuestions, "deepseek-flash")));
                System.Collections.IList weightMessages = weightRequest["messages"] as System.Collections.IList;
                Dictionary<string, object> weightContext = Json.Decode(Json.Text(weightMessages[1] as Dictionary<string, object>, "content"));
                Check(Json.Encode(weightContext["answer_example"]) == "{\"answers\":{\"quality\":{\"weights\":{\"0\":50,\"2\":50}}}}", "DeepSeek score example includes every candidate weight");
                Dictionary<string, object> longOptions = new Dictionary<string, object>();
                for (int i = 0; i <= 100; i++) longOptions[i.ToString(System.Globalization.CultureInfo.InvariantCulture)] = null;
                weightQuestions["evidence"] = new { type = "choice", instructions = "Select evidence", criteria = longOptions };
                weightRequest = Json.Decode(Json.Encode(ModelClient.DeepseekRequest(StructuredPayload()["state"], weightQuestions, "deepseek-flash")));
                weightMessages = weightRequest["messages"] as System.Collections.IList;
                weightContext = Json.Decode(Json.Text(weightMessages[1] as Dictionary<string, object>, "content"));
                Dictionary<string, object> keysByQuestion = weightContext["answer_keys"] as Dictionary<string, object>;
                Check((keysByQuestion["evidence"] as System.Collections.IList).Count == 101, "DeepSeek retains every allowed candidate key");
                Dictionary<string, object> exampleAnswers = (weightContext["answer_example"] as Dictionary<string, object>)["answers"] as Dictionary<string, object>;
                Dictionary<string, object> exampleWeights = (exampleAnswers["evidence"] as Dictionary<string, object>)["weights"] as Dictionary<string, object>;
                Check(exampleWeights.Count == 2 && Convert.ToDouble(exampleWeights["0"]) == 50 && Convert.ToDouble(exampleWeights["99"]) == 50, "DeepSeek long candidate example includes explicit zero weights");
                object prepared = Json.Decode("{\"messages\":[{\"role\":\"system\",\"content\":\"稳定规则\\n{\\\"a\\\":1}\"},{\"role\":\"user\",\"content\":\"场景 é\\n任务\"}]}")["messages"];
                Dictionary<string, object> preparedRequest = Json.Decode(Json.Encode(ModelClient.DeepseekRequest(StructuredPayload()["state"], weightQuestions, "deepseek-flash", false, prepared)));
                Check(Json.Encode(preparedRequest["messages"]) == Json.Encode(prepared), "canonical shared prompt strings are forwarded unchanged");
                Reject(() => ModelClient.DeepseekRequest(StructuredPayload()["state"], weightQuestions, "deepseek-flash", false, new object[0]), 400, "invalid prepared prompt rejected");
                Dictionary<string, object> semanticPayload = StructuredPayload();
                store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", deepKey }, { "activate", false } });
                semanticPayload["purpose"] = "semantics"; semanticPayload["questions"] = new Dictionary<string, object>(); semanticPayload["deepseekMessages"] = prepared;
                handler.Run = async (request, token) => {
                    Dictionary<string, object> sent = Json.Decode(await request.Content.ReadAsStringAsync());
                    Check(request.RequestUri.AbsoluteUri == ModelClient.Endpoint("deepseek") && request.Headers.Authorization.Parameter == deepKey, "semantic transport uses DeepSeek endpoint and its separate key");
                    Check(Json.Text(store.Read(), "provider") == "typesafe" && Json.Text(store.Read(), "apiKey") == TestKey, "semantic transport does not switch the active model");
                    Check(Json.Encode(sent["messages"]) == Json.Encode(prepared) && Convert.ToInt32(sent["max_tokens"]) == 4096, "semantic transport forwards shared prompt with bounded output");
                    return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Json.Encode(new {
                        model = "deepseek-flash", choices = new[] { new { finish_reason = "stop", message = new { content = "{\"analyses\":{}}" } } }, usage = new { prompt_tokens = 5, completion_tokens = 3 }
                    })) };
                };
                Check(Json.Text(Json.Decode(Json.Encode(await client.Evaluate(semanticPayload, CancellationToken.None))), "format") == "deepseek-weights-v4", "semantic raw JSON survives native transport for shared validation");
                store.Configure(Input("deepseek", ""));
                Dictionary<string, object> routed = StructuredPayload(); routed["provider"] = "typesafe";
                handler.Run = async (request, token) => {
                    Check(request.RequestUri.AbsoluteUri == ModelClient.Endpoint("typesafe") && request.Headers.Authorization.Parameter == TestKey, "dual-mode primary and judgment use saved Jev endpoint and key");
                    Check(Json.Text(store.Read(), "provider") == "deepseek", "dual-mode requests keep the saved menu selection");
                    await request.Content.ReadAsStringAsync();
                    return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"model\":\"jev-1.13.0\",\"answers\":{\"a\":{\"type\":\"noul\",\"noul\":0.5}},\"usage\":{\"input_tokens\":5,\"output_tokens\":2}}") };
                };
                routed["purpose"] = "primary";
                Check(Json.Text(Json.Decode(Json.Encode(await client.Evaluate(routed, CancellationToken.None))), "model") == "jev-1.13.0", "dual-mode primary routing reaches Jev");
                routed["purpose"] = "judgment";
                Check(Json.Text(Json.Decode(Json.Encode(await client.Evaluate(routed, CancellationToken.None))), "model") == "jev-1.13.0", "strategy judgment routing reaches Jev");
                routed["provider"] = "deepseek";
                try { await client.Evaluate(routed, CancellationToken.None); throw new Exception("Expected rejection"); }
                catch (ApiException error) { Check(error.Status == 400, "dual-mode judgment cannot silently use DeepSeek"); }
                foreach (string deepModel in new[] { "deepseek-flash" })
                {
                    store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", deepKey }, { "model", deepModel } });
                    handler.Run = async (request, token) => {
                        Dictionary<string, object> sent = Json.Decode(await request.Content.ReadAsStringAsync());
                        Check(request.RequestUri.AbsoluteUri == "https://api.deepseek.com/chat/completions", "DeepSeek fixed strict endpoint");
                        Check(request.Headers.Authorization.Parameter == deepKey && Json.Text(sent, "model") == deepModel, "DeepSeek uses selected model and its own key");
                        System.Collections.IList messages = sent["messages"] as System.Collections.IList;
                        Dictionary<string, object> user = messages[1] as Dictionary<string, object>;
                        Dictionary<string, object> context = Json.Decode(Json.Text(user, "content"));
                        Check(Json.Encode(context["state"]) == Json.Encode(StructuredPayload()["state"]), "DeepSeek preserves original structured state");
                        Check(context["answer_keys"] is Dictionary<string, object> && context["answer_example"] is Dictionary<string, object>, "DeepSeek supplies an explicit answer format");
                        Check(!sent.ContainsKey("tools") && Json.Text(sent["response_format"] as Dictionary<string, object>, "type") == "json_object", "DeepSeek uses JSON mode");
                        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Json.Encode(new {
                            id = "synthetic-response-" + deepModel, model = deepModel, choices = new[] { new { finish_reason = "tool_calls", message = new { content = (string)null,
                                tool_calls = new[] { new { id = "synthetic-call", type = "function", function = new { name = "submit_analysis", arguments = "{\"answers\":{\"a\":0.8}}" } } }, reasoning_content = "discard private reasoning" } } },
                            usage = new { prompt_tokens = 20, completion_tokens = 10, prompt_cache_hit_tokens = 12, prompt_cache_miss_tokens = 8 } })) };
                    };
                    string result = Json.Encode(await client.Evaluate(StructuredPayload(), CancellationToken.None));
                    Check(result.Contains("answers") && result.Contains("input_tokens") && !result.Contains("reasoning"), "DeepSeek adapts to existing answer contract");
                    Check(Json.Text(Json.Decode(result), "format") == "deepseek-weights-v4", "DeepSeek uses the shared fixed weight decoder");
                    Check(Json.Text(Json.Decode(result), "requestId") == "synthetic-response-" + deepModel, "provider response id survives native transport");
                    Dictionary<string, object> tokens = Json.Decode(result)["usage"] as Dictionary<string, object>;
                    Check(Convert.ToInt32(tokens["prompt_cache_hit_tokens"]) == 12 && Convert.ToInt32(tokens["prompt_cache_miss_tokens"]) == 8 && Convert.ToInt32(tokens["requests"]) == 1, "provider cache usage survives native transport");
                }
                Dictionary<string, object> compactPayload = StructuredPayload(); compactPayload["deepseekMessages"] = prepared;
                handler.Run = async (request, token) => {
                    Dictionary<string, object> sent = Json.Decode(await request.Content.ReadAsStringAsync());
                    Check(Json.Encode(sent["messages"]) == Json.Encode(prepared), "evaluate forwards the shared protocol without rebuilding it");
                    Check(!sent.ContainsKey("state") && !sent.ContainsKey("deepseekContext"), "only the prepared prompt reaches completions");
                    return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Json.Encode(new {
                        model = "deepseek-v4-pro", choices = new[] { new { finish_reason = "stop", message = new { content = "{\"answers\":{\"a\":0.8}}" } } },
                        usage = new { prompt_tokens = 10, completion_tokens = 2, prompt_cache_hit_tokens = 6, prompt_cache_miss_tokens = 4 }
                    })) };
                };
                Check(Json.Text(Json.Decode(Json.Encode(await client.Evaluate(compactPayload, CancellationToken.None))), "format") == "deepseek-weights-v4", "shared protocol uses the existing decoder");
                store.Configure(Input("typesafe", ""));
                store.Configure(Input("deepseek", ""));
                Dictionary<string, object> repairPayload = StructuredPayload(); repairPayload["deepseekRepair"] = true;
                handler.Run = async (request, token) => {
                    Dictionary<string, object> sent = Json.Decode(await request.Content.ReadAsStringAsync());
                    Check(!sent.ContainsKey("tools") && Json.Text(sent["response_format"] as Dictionary<string, object>, "type") == "json_object", "targeted repair uses JSON mode without tool parsing ambiguity");
                    return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Json.Encode(new {
                        model = "deepseek-v4-pro", choices = new[] { new { finish_reason = "stop", message = new { content = "{\"answers\":{\"a\":0.8}}" } } }, usage = new { prompt_tokens = 5, completion_tokens = 3 }
                    })) };
                };
                Check(Json.Text(Json.Decode(Json.Encode(await client.Evaluate(repairPayload, CancellationToken.None))), "format") == "deepseek-weights-v4", "JSON repair returns the same shared fixed-weight contract");
                Dictionary<string, object> malformedDeepseek = Json.Decode("{\"model\":\"deepseek-v4-pro\",\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"content\":\"{\\\"answers\\\":{}}}\"}}],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":3}}");
                Check(Json.Text(Json.Decode(Json.Encode(ModelClient.DeepseekResult(malformedDeepseek))), "json") == "{\"answers\":{}}}", "raw numeric JSON is passed to shared validation without platform-specific parsing");
                handler.Run = (request, token) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"model\":\"deepseek-flash\",\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"{\\\"answers\\\":{}}\"}}],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1}}") });
                try { await client.Evaluate(Payload(), CancellationToken.None); throw new Exception("Expected truncated DeepSeek rejection"); }
                catch (ApiException error) { Check(error.Status == 502, "truncated DeepSeek output rejected instead of saved as success"); }
                store.Configure(Input("typesafe", ""));
                int invalidCalls = 0;
                handler.Run = (request, token) => { invalidCalls++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)); };
                foreach (object invalidState in new object[] { null, "", "   ", 123, true, new object[0], new Dictionary<string, object>() })
                {
                    Dictionary<string, object> invalid = Payload();
                    invalid["state"] = invalidState;
                    Reject(() => client.Evaluate(invalid, CancellationToken.None).GetAwaiter().GetResult(), 400, "invalid state rejected locally");
                }
                Check(invalidCalls == 0, "invalid requests never reach transport");
                handler.Run = (request, token) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent(TestKey) });
                try { await client.Evaluate(Payload(), CancellationToken.None); throw new Exception("Expected 401"); }
                catch (ApiException error) { Check(error.Status == 401 && !error.Message.Contains(TestKey), "provider errors do not leak bodies"); }
                foreach (string category in new[] { "max_tokens_exceeded", "invalid_input" }) {
                    int rejectedCalls = 0;
                    handler.Run = (request, token) => {
                        rejectedCalls++;
                        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.BadRequest) { Content = new StringContent(Json.Encode(new { detail = new { error_type = category, message = TestKey } })) });
                    };
                    try { await client.Evaluate(Payload(), CancellationToken.None); throw new Exception("Expected budget rejection"); }
                    catch (ApiException error) { Check(error.Status == 400 && error.Code == (category == "max_tokens_exceeded" ? category : null) && !error.Message.Contains(TestKey), "only the fixed budget code crosses the native bridge"); }
                    Check(rejectedCalls == 1, "transport leaves target splitting to the frontend");
                }
                Check(ModelClient.BudgetErrorCode(Json.Decode("{\"message\":\"max_tokens_exceeded\"}")) == null, "budget classification does not scan arbitrary messages");
                handler.Run = (request, token) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Redirect));
                try { await client.Evaluate(Payload(), CancellationToken.None); throw new Exception("Expected redirect rejection"); }
                catch (ApiException error) { Check(error.Status == 502, "redirect not accepted"); }
                int attempts = 0;
                handler.Run = (request, token) => {
                    attempts++;
                    HttpResponseMessage response = new HttpResponseMessage(attempts == 1 ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK) { Content = new StringContent("{\"model\":\"retry-test\"}") };
                    response.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.Zero);
                    return Task.FromResult(response);
                };
                await client.Evaluate(Payload(), CancellationToken.None);
                Check(attempts == 2, "single bounded retry");
                handler.Run = (request, token) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("not json") });
                try { await client.Evaluate(Payload(), CancellationToken.None); throw new Exception("Expected invalid JSON"); }
                catch (ApiException error) { Check(error.Status == 502, "invalid JSON rejected"); }
                handler.Run = async (request, token) => { await Task.Delay(10000, token); return new HttpResponseMessage(HttpStatusCode.OK); };
                using (CancellationTokenSource cancel = new CancellationTokenSource(30))
                {
                    try { await client.Evaluate(Payload(), cancel.Token); throw new Exception("Expected cancellation"); }
                    catch (OperationCanceledException) { Check(true, "cancellation reaches native transport"); }
                }
            }
            string opened = null;
            ReleaseClient.Open(value => opened = value);
            Check(opened == ReleaseClient.Page, "Release opener is fixed, independent of provider allowlist");
            ReleaseClient.OpenQuark(value => opened = value);
            Check(opened == "https://pan.quark.cn/s/7894e2647abc?pwd=LQxA", "Quark opens only the fixed public resource folder");
            int releaseCalls = 0;
            FakeHttp releaseHttp = new FakeHttp();
            releaseHttp.Run = async (request, token) => {
                releaseCalls++;
                Check(request.Method == HttpMethod.Get && request.RequestUri.AbsoluteUri == ReleaseClient.Endpoint, "fixed release GET endpoint");
                Check(request.Headers.Authorization == null && request.Content == null && !request.Headers.Contains("Cookie"), "release request has no key, body or cookies");
                Check(request.Headers.UserAgent.ToString() == "ConversationNotes-UpdateCheck", "static public update user agent");
                await Task.Delay(10, token);
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"tag_name\":\"v1.1.0\"}") };
            };
            using (ReleaseClient releases = new ReleaseClient(new HttpClient(releaseHttp)))
            {
                object[] results = await Task.WhenAll(releases.Check(CancellationToken.None), releases.Check(CancellationToken.None));
                Check(releaseCalls == 1 && Json.Text((Dictionary<string, object>)results[0], "tag_name") == "v1.1.0", "parallel release checks share successful cache");
                await releases.Check(CancellationToken.None);
                Check(releaseCalls == 1, "release cache protects GitHub rate limit");
                await releases.Check(CancellationToken.None, true);
                Check(releaseCalls == 2, "manual check bypasses settled release cache");
            }
            foreach (HttpResponseMessage response in new[] {
                new HttpResponseMessage(HttpStatusCode.Forbidden) { Content = new StringContent(TestKey) },
                new HttpResponseMessage(HttpStatusCode.Redirect),
                new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("not JSON") },
                new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(new string('x', 131073)) }
            })
            {
                int attempts = 0;
                releaseHttp = new FakeHttp();
                releaseHttp.Run = (request, token) => { attempts++; return Task.FromResult(response); };
                using (ReleaseClient releases = new ReleaseClient(new HttpClient(releaseHttp)))
                {
                    for (int n = 0; n < 2; n++)
                    {
                        try { await releases.Check(CancellationToken.None); throw new Exception("Expected update failure"); }
                        catch (ApiException error) { Check(error.Status == 502 && !error.Message.Contains(TestKey), "safe update failure"); }
                    }
                    Check(attempts == 1, "failed release checks also have cooldown");
                }
            }
            releaseHttp = new FakeHttp();
            releaseHttp.Run = async (request, token) => { await Task.Delay(10000, token); return new HttpResponseMessage(HttpStatusCode.OK); };
            using (ReleaseClient releases = new ReleaseClient(new HttpClient(releaseHttp)))
            using (CancellationTokenSource cancel = new CancellationTokenSource(30))
            {
                try { await releases.Check(cancel.Token); throw new Exception("Expected release cancellation"); }
                catch (OperationCanceledException) { Check(true, "release cancellation reaches native HTTP"); }
            }
            Console.WriteLine("Desktop offline checks passed: " + checks);
        }
        private static int Main(string[] args)
        {
            try { Run(args[0]).GetAwaiter().GetResult(); return 0; }
            catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
        }
    }
}
